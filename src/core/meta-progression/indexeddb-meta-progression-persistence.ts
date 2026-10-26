import {
  MetaProgressionStateSchema,
  type MetaProgressionState,
} from "./meta-types";
import {
  MetaProgressionStateUnreadableError,
  MetaProgressionStateUnreadableReason,
} from "./meta-progression-errors";
import type {
  MetaProgressionPersistence,
  MetaProgressionPersistenceCloseState,
} from "./meta-progression-persistence";
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

const DATABASE_VERSION = 1;
const STATE_STORE = "progressionState";
const PRIMARY_KEY = "primary";
/** Same grace period as the learning database before a blocked upgrade is reported. */
const BLOCKED_GRACE_MS = 250;

interface StoredMetaProgressionState {
  readonly key: string;
  readonly state: MetaProgressionState;
}

/**
 * Durable reward / workshop state (one `primary` record, schema v1, unchanged).
 *
 * Connection lifecycle and failure policy (PHASE-04C.3D.4) mirror the learning
 * database (PHASE-04C.3D.3):
 *  - one cached open handle; a failed open is forgotten (never cached as a
 *    permanent rejection), so the next call of an ACTIVE instance opens again;
 *  - `versionchange` closes and forgets the connection, an unexpected `close`
 *    forgets it, so a dead connection is never reused;
 *  - a blocked upgrade (another tab) rejects callers with
 *    PersistenceUpgradeBlockedError(BLOCKED) after a short grace period while the
 *    single request stays in flight; a stored version newer than this build
 *    rejects with PersistenceUpgradeBlockedError(VERSION_NEWER_THAN_CODE);
 *  - unreadable stored state or a missing store rejects with
 *    MetaProgressionStateUnreadableError; it is never reported as "no state";
 *  - close() is synchronous, final and never waits for a pending open.
 * Nothing here deletes, resets or migrates stored data.
 */
export class IndexedDbMetaProgressionPersistence
  implements MetaProgressionPersistence
{
  readonly kind = "indexeddb" as const;
  /** The in-flight or established connection (test helpers read `handle.database` to close it). */
  private handle: OpenHandle | null = null;
  /** Set synchronously by close(); never reset. */
  private closed = false;
  /** True while an open request issued before close() has not settled yet. */
  private lateOpenPending = false;

  /** Resolved from `scope` at construction; an invalid scope throws here, never opens Guest. */
  readonly databaseName: string;

  constructor(
    private readonly indexedDb: IDBFactory = indexedDB,
    scope: PersistenceScope = GUEST_SCOPE,
  ) {
    this.databaseName = resolveScopedDatabaseName(GUEST_DATABASE_BASE_NAMES.meta, scope);
  }

  async loadState(): Promise<MetaProgressionState | null> {
    const database = await this.getDatabase();
    const transaction = this.beginTransaction(database, "readonly");
    const [raw] = await Promise.all([
      requestResult<unknown>(transaction.objectStore(STATE_STORE).get(PRIMARY_KEY)),
      transactionDone(transaction),
    ]);

    // Only a missing record means "nothing saved yet".
    if (raw === undefined) return null;
    return parseStoredState(raw);
  }

  async saveState(state: MetaProgressionState): Promise<void> {
    this.assertOpen();
    const parsed = MetaProgressionStateSchema.parse(state);
    const database = await this.getDatabase();
    const transaction = this.beginTransaction(database, "readwrite");
    const stored: StoredMetaProgressionState = {
      key: PRIMARY_KEY,
      state: structuredClone(parsed),
    };
    // Resolves only on `complete`: an aborted or failed write rejects.
    await runWrite(transaction, (store) => store.put(stored));
  }

  async clear(): Promise<void> {
    const database = await this.getDatabase();
    const transaction = this.beginTransaction(database, "readwrite");
    await runWrite(transaction, (store) => store.clear());
  }

  /** See MetaProgressionPersistence.close(). */
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

  getCloseState(): MetaProgressionPersistenceCloseState {
    if (!this.closed) return "open";
    return this.lateOpenPending ? "closed-pending-open" : "closed";
  }

  private async getDatabase(): Promise<IDBDatabase> {
    this.assertOpen();
    let handle = this.handle;
    if (handle === null) {
      const created: OpenHandle = openDatabase(this.indexedDb, this.databaseName, () =>
        this.forget(created),
      );
      // A failed open is forgotten so it cannot poison this instance forever.
      created.database.catch(() => this.forget(created));
      this.handle = created;
      handle = created;
    }
    // `database` first: once it has resolved it wins over an earlier `blocked`.
    const database = await Promise.race([handle.database, handle.blocked]);
    // close() may have run while this caller was waiting: no transaction starts.
    this.assertOpen();
    return database;
  }

  /**
   * The only place a transaction starts: the closed check and `transaction()`
   * run in one synchronous step, so a closed instance never begins new work.
   * A missing store is damaged storage, not an empty profile.
   */
  private beginTransaction(database: IDBDatabase, mode: IDBTransactionMode): IDBTransaction {
    this.assertOpen();
    try {
      return database.transaction(STATE_STORE, mode);
    } catch (error) {
      if ((error as { name?: unknown } | null)?.name === "NotFoundError") {
        throw new MetaProgressionStateUnreadableError(
          MetaProgressionStateUnreadableReason.MISSING_STORE,
          { cause: error },
        );
      }
      throw error;
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new PersistenceClosedError();
  }

  private forget(handle: OpenHandle): void {
    if (this.handle !== handle) return;
    this.handle = null;
  }
}

function parseStoredState(raw: unknown): MetaProgressionState {
  if (raw === null || typeof raw !== "object" || !("state" in raw)) {
    throw new MetaProgressionStateUnreadableError(MetaProgressionStateUnreadableReason.MALFORMED_STATE);
  }
  const parsed = MetaProgressionStateSchema.safeParse((raw as { readonly state?: unknown }).state);
  if (!parsed.success) {
    throw new MetaProgressionStateUnreadableError(MetaProgressionStateUnreadableReason.MALFORMED_STATE, {
      cause: parsed.error,
    });
  }
  return parsed.data;
}

interface OpenHandle {
  /** Resolves with the connection once opened - even after a `blocked` rejection. */
  readonly database: Promise<IDBDatabase>;
  /** Rejects (once, never resolves) when the upgrade is blocked, or when retired. */
  readonly blocked: Promise<never>;
  /**
   * Retires the handle for close(). Returns true when nothing is left pending;
   * false when the browser request is still outstanding - `onReleased` then runs
   * once it settles (its late connection is closed immediately, never used).
   */
  retire(onReleased: () => void): boolean;
}

/**
 * Opens (and if needed creates, never migrates destructively) the meta database.
 * Same handle semantics as the learning database's openDatabase().
 */
function openDatabase(indexedDb: IDBFactory, databaseName: string, onClosed: () => void): OpenHandle {
  let rejectBlocked: (error: Error) => void = () => undefined;
  const blocked = new Promise<never>((_resolve, reject) => {
    rejectBlocked = reject;
  });
  blocked.catch(() => undefined); // observed by callers via race; never an unhandled rejection

  let retired = false;
  let settled = false;
  let connection: IDBDatabase | null = null;
  let onLateRelease: (() => void) | null = null;
  let cancelGraceTimer: () => void = () => undefined;

  const database = new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDb.open(databaseName, DATABASE_VERSION);
    } catch (error) {
      // No browser request exists, so no handler will ever run: terminal now.
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
      if (!created.objectStoreNames.contains(STATE_STORE)) {
        created.createObjectStore(STATE_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => {
      upgradeProceeding();
      settled = true;
      const opened = request.result;
      if (retired) {
        // close() ran while this request was outstanding: never expose it.
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
        reject(error ?? new Error("Không thể mở kho tiến độ phần thưởng."));
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
      // Waiting callers settle now instead of waiting on the browser.
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

/**
 * Issues `write` and waits for the transaction to complete. If issuing the
 * request throws synchronously (inactive/aborted transaction, clone failure),
 * that error is reported, the transaction is aborted, and the completion
 * promise is observed so it can never surface as an unhandled rejection.
 */
async function runWrite(
  transaction: IDBTransaction,
  write: (store: IDBObjectStore) => void,
): Promise<void> {
  const done = transactionDone(transaction);
  try {
    write(transaction.objectStore(STATE_STORE));
  } catch (error) {
    done.catch(() => undefined);
    try {
      transaction.abort();
    } catch {
      // Already finished or aborted.
    }
    throw error;
  }
  await done;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB reward request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB reward transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB reward transaction aborted."));
  });
}
