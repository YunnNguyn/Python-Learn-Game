import {
  PersistenceClosedError,
  PersistenceUpgradeBlockedError,
  PersistenceUpgradeFailureReason,
} from "../persistence/persistence-errors";
import {
  GUEST_DATABASE_BASE_NAMES,
  GUEST_SCOPE,
  resolveScopedDatabaseName,
  type PersistenceScope,
} from "../persistence/persistence-scope";
import {
  ChallengeStorageUnreadableError,
  InvalidSubmissionRecordError,
  SubmissionRecordSchema,
  parseSubmissionRecord,
  type ChallengePersistence,
  type ChallengePersistenceCloseState,
  type SubmissionRecord,
} from "./challenge-persistence";

/*
 * IndexedDB implementation (durable only; there is no memory twin).
 *
 * Schema history:
 *  - v1: `submissions` (keyPath `id`) with index `byChallengeVersion` on
 *        [challengeId, challengeVersion].
 *
 * Connection lifecycle and failure policy follow the reward database
 * (IndexedDbMetaProgressionPersistence): one cached handle, a failed open is
 * forgotten, `versionchange`/`close` forget a dead connection, a blocked upgrade
 * rejects after a grace period with PersistenceUpgradeBlockedError(BLOCKED), a newer
 * stored version rejects with VERSION_NEWER_THAN_CODE, close() is synchronous and
 * final. Nothing here deletes, resets or migrates stored data.
 */

export const CHALLENGE_DATABASE_VERSION = 1;
export const SUBMISSION_STORE = "submissions";
export const SUBMISSION_INDEX = "byChallengeVersion";
const BLOCKED_GRACE_MS = 250;

export class IndexedDbChallengePersistence implements ChallengePersistence {
  readonly kind = "indexeddb" as const;
  private handle: OpenHandle | null = null;
  private closed = false;
  private lateOpenPending = false;

  /** Resolved from `scope` at construction; an invalid scope throws here, never opens Guest. */
  readonly databaseName: string;

  constructor(
    private readonly indexedDb: IDBFactory = indexedDB,
    scope: PersistenceScope = GUEST_SCOPE,
  ) {
    this.databaseName = resolveScopedDatabaseName(GUEST_DATABASE_BASE_NAMES.challenge, scope);
  }

  async addSubmission(record: SubmissionRecord): Promise<void> {
    this.assertOpen();
    const parsed = SubmissionRecordSchema.safeParse(record);
    if (!parsed.success) throw new InvalidSubmissionRecordError();

    const database = await this.getDatabase();
    const transaction = this.beginTransaction(database, "readwrite");
    const done = transactionDone(transaction);
    try {
      // `add`, never `put`: an existing id is a conflict, not an overwrite.
      transaction.objectStore(SUBMISSION_STORE).add(structuredClone(parsed.data));
    } catch (error) {
      done.catch(() => undefined);
      try {
        transaction.abort();
      } catch {
        // Already finished or aborted.
      }
      throw error;
    }
    // Resolves only on `complete`.
    await done;
  }

  async listSubmissions(challengeId: string, challengeVersion: string): Promise<SubmissionRecord[]> {
    const database = await this.getDatabase();
    const transaction = this.beginTransaction(database, "readonly");
    let request: IDBRequest<unknown[]>;
    try {
      request = transaction.objectStore(SUBMISSION_STORE).index(SUBMISSION_INDEX).getAll([challengeId, challengeVersion]);
    } catch (error) {
      throw asUnreadableIfMissing(error);
    }
    const [rows] = await Promise.all([requestResult(request), transactionDone(transaction)]);

    return rows.map((row) => {
      const record = parseSubmissionRecord(row);
      if (record === undefined) throw new ChallengeStorageUnreadableError();
      return record;
    });
  }

  close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.closed = true;
    const handle = this.handle;
    this.handle = null;
    if (handle !== null) {
      const released = handle.retire(() => {
        this.lateOpenPending = false;
      });
      this.lateOpenPending = !released;
    }
    return Promise.resolve();
  }

  getCloseState(): ChallengePersistenceCloseState {
    if (!this.closed) return "open";
    return this.lateOpenPending ? "closed-pending-open" : "closed";
  }

  private async getDatabase(): Promise<IDBDatabase> {
    this.assertOpen();
    let handle = this.handle;
    if (handle === null) {
      const created: OpenHandle = openDatabase(this.indexedDb, this.databaseName, () => this.forget(created));
      created.database.catch(() => this.forget(created));
      this.handle = created;
      handle = created;
    }
    const database = await Promise.race([handle.database, handle.blocked]);
    // close() may have run while this caller was waiting: no transaction starts.
    this.assertOpen();
    return database;
  }

  /** The only place a transaction starts: the closed check and `transaction()` run in one synchronous step. */
  private beginTransaction(database: IDBDatabase, mode: IDBTransactionMode): IDBTransaction {
    this.assertOpen();
    try {
      return database.transaction(SUBMISSION_STORE, mode);
    } catch (error) {
      throw asUnreadableIfMissing(error);
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new PersistenceClosedError();
  }

  private forget(handle: OpenHandle): void {
    if (this.handle === handle) this.handle = null;
  }
}

/** A missing store or index is damaged storage, not an empty history. */
function asUnreadableIfMissing(error: unknown): unknown {
  return (error as { name?: unknown } | null)?.name === "NotFoundError"
    ? new ChallengeStorageUnreadableError({ cause: error })
    : error;
}

interface OpenHandle {
  readonly database: Promise<IDBDatabase>;
  /** Rejects (once, never resolves) when the upgrade is blocked, or when retired. */
  readonly blocked: Promise<never>;
  /** True when nothing is left pending; false when the browser request is still outstanding. */
  retire(onReleased: () => void): boolean;
}

function openDatabase(indexedDb: IDBFactory, databaseName: string, onClosed: () => void): OpenHandle {
  let rejectBlocked: (error: Error) => void = () => undefined;
  const blocked = new Promise<never>((_resolve, reject) => {
    rejectBlocked = reject;
  });
  blocked.catch(() => undefined);

  let retired = false;
  let settled = false;
  let connection: IDBDatabase | null = null;
  let onLateRelease: (() => void) | null = null;
  let cancelGraceTimer: () => void = () => undefined;

  const database = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDb.open(databaseName, CHALLENGE_DATABASE_VERSION);
    } catch (error) {
      settled = true;
      reject(error);
      return;
    }

    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    const upgradeProceeding = () => {
      if (graceTimer !== undefined) clearTimeout(graceTimer);
      graceTimer = undefined;
    };
    cancelGraceTimer = upgradeProceeding;

    request.onupgradeneeded = () => {
      upgradeProceeding();
      const created = request.result;
      // Additive only: creates the store of a NEW database, never drops anything.
      if (!created.objectStoreNames.contains(SUBMISSION_STORE)) {
        const submissions = created.createObjectStore(SUBMISSION_STORE, { keyPath: "id" });
        submissions.createIndex(SUBMISSION_INDEX, ["challengeId", "challengeVersion"], { unique: false });
      }
    };

    request.onsuccess = () => {
      upgradeProceeding();
      settled = true;
      const opened = request.result;
      if (retired) {
        // close() ran while this request was outstanding: never expose the late connection.
        opened.close();
        reject(new PersistenceClosedError());
        onLateRelease?.();
        return;
      }
      connection = opened;
      opened.onversionchange = () => {
        opened.close();
        onClosed();
      };
      opened.onclose = () => onClosed();
      resolve(opened);
    };

    request.onerror = () => {
      upgradeProceeding();
      settled = true;
      const error = request.error;
      if (error?.name === "VersionError") {
        reject(new PersistenceUpgradeBlockedError(PersistenceUpgradeFailureReason.VERSION_NEWER_THAN_CODE));
      } else {
        reject(error ?? new Error("Không thể mở kho bài nộp thử thách."));
      }
      if (retired) onLateRelease?.();
    };

    request.onblocked = () => {
      graceTimer ??= setTimeout(() => {
        graceTimer = undefined;
        rejectBlocked(new PersistenceUpgradeBlockedError(PersistenceUpgradeFailureReason.BLOCKED));
      }, BLOCKED_GRACE_MS);
    };
  });

  const retire = (onReleased: () => void): boolean => {
    if (!retired) {
      retired = true;
      cancelGraceTimer();
      rejectBlocked(new PersistenceClosedError());
    }
    if (connection !== null) {
      connection.close();
      connection = null;
      return true;
    }
    if (settled) return true;
    onLateRelease = onReleased;
    return false;
  };

  return { database, blocked, retire };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB challenge request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB challenge transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB challenge transaction aborted."));
  });
}
