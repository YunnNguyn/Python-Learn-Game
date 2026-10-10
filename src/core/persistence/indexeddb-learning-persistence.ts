import { z } from "zod";

import {
  AttemptRecordSchema,
  HintLevel,
  type AttemptRecord,
  type LearningActivityId,
} from "../domain";
import { classifyStoredAttempt, parseAttemptForImport, parseImportOrigin } from "./attempt-import";
import {
  ATTEMPT_IMPORT_ORIGINS,
  type AddAttemptIfAbsentResult,
  type AttemptImportOrigin,
  type LearningPersistence,
  type MissionDraftRecord,
} from "./learning-persistence";
import {
  AttemptProvenanceUnreadableError,
  DuplicateAttemptError,
  PersistenceDomainError,
  PersistenceUpgradeBlockedError,
  PersistenceUpgradeFailureReason,
} from "./persistence-errors";
import {
  GUEST_DATABASE_BASE_NAMES,
  GUEST_SCOPE,
  resolveScopedDatabaseName,
  type PersistenceScope,
} from "./persistence-scope";

/**
 * Schema history:
 *  - v1: `attempts`, `missionDrafts`.
 *  - v2: adds `attemptProvenance` (keyPath `attemptId`). Purely additive; no
 *        existing store, index or row is touched. Attempts without a provenance
 *        row (every v1 attempt, and every locally submitted one) are local.
 */
const DATABASE_VERSION = 2;
const ATTEMPT_STORE = "attempts";
const DRAFT_STORE = "missionDrafts";
const PROVENANCE_STORE = "attemptProvenance";

/**
 * Browsers fire `blocked` as soon as ANY other connection is still open, which
 * includes connections that were closed a moment ago and are merely finishing
 * their close. A real blocker (an old tab that ignores `versionchange`) stays
 * open indefinitely, so the caller is only told "blocked" if the upgrade has not
 * started after this grace period.
 */
const BLOCKED_GRACE_MS = 250;

const MissionDraftSchema = z.strictObject({
  activityId: z.string().trim().min(1),
  seed: z.string().trim().min(1),
  variantIndex: z.number().finite().int().min(0),
  code: z.string(),
  hintsUsed: z.array(z.enum(HintLevel)).default([]),
  updatedAt: z.iso.datetime({ offset: true }),
});

/** Stored in `attemptProvenance`, never inside the attempt itself. */
const AttemptProvenanceSchema = z.strictObject({
  attemptId: z.string().min(1),
  origin: z.enum(ATTEMPT_IMPORT_ORIGINS),
  importedAt: z.iso.datetime({ offset: true }),
});

type AttemptOutcome = "added" | "exists" | "conflict";

export class IndexedDbLearningPersistence implements LearningPersistence {
  readonly kind = "indexeddb" as const;
  /** The in-flight or established connection (test helpers read `handle.database` to close it). */
  private handle: OpenHandle | null = null;

  /** Resolved from `scope` at construction; an invalid scope throws here, never opens Guest. */
  readonly databaseName: string;

  constructor(
    private readonly indexedDb: IDBFactory = indexedDB,
    scope: PersistenceScope = GUEST_SCOPE,
  ) {
    this.databaseName = resolveScopedDatabaseName(GUEST_DATABASE_BASE_NAMES.learning, scope);
  }

  async addAttempt(record: AttemptRecord): Promise<void> {
    const outcome = await this.insertAttempt(record, () => "exists");
    if (outcome !== "added") throw new DuplicateAttemptError(String(record.id));
  }

  async addAttemptIfAbsent(record: AttemptRecord): Promise<AddAttemptIfAbsentResult> {
    const parsed = parseAttemptForImport(record);
    const status = await this.insertAttempt(parsed, (stored) =>
      classifyStoredAttempt(parsed, stored),
    );
    return { status };
  }

  /**
   * Single readwrite transaction: look the id up, then add only if absent.
   * IndexedDB serializes overlapping readwrite transactions on the same store,
   * so concurrent calls cannot interleave between the lookup and the add. The
   * add happens inside the lookup's success callback, so the transaction never
   * sits idle across unrelated async work (which would auto-commit it).
   *
   * Duplicates are detected by the lookup rather than by interpreting a
   * ConstraintError, because transactionDone() reports a failed `add` as a
   * generic Error (transaction.error is still null when `onerror` fires).
   * Genuine storage errors still reject and remain visible to the caller.
   */
  private async insertAttempt(
    record: AttemptRecord,
    classifyExisting: (stored: unknown) => "exists" | "conflict",
  ): Promise<AttemptOutcome> {
    const database = await this.getDatabase();
    const transaction = database.transaction(ATTEMPT_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(ATTEMPT_STORE);

    // Mutated from the request callback; a holder keeps TypeScript from narrowing it.
    const state: { outcome?: AttemptOutcome; failure?: unknown } = {};
    const lookup = store.get(record.id);
    lookup.onsuccess = () => {
      try {
        if (lookup.result === undefined) {
          store.add(structuredClone(record));
          state.outcome = "added";
        } else {
          state.outcome = classifyExisting(lookup.result);
        }
      } catch (error) {
        state.failure = error;
        transaction.abort();
      }
    };

    try {
      await done;
    } catch (error) {
      throw state.failure ?? error;
    }
    if (state.outcome === undefined) {
      throw new Error("IndexedDB attempt insert finished without an outcome.");
    }
    return state.outcome;
  }

  /**
   * Durable, atomic import: the attempt row and its provenance row are written
   * by ONE readwrite transaction over both stores, so both commit or neither
   * does (a crash, abort or quota error between the two writes cannot leave an
   * unmarked imported attempt behind).
   *
   * Validation (record, then origin) happens before any storage access.
   * `exists` / `conflict` perform no writes, so an already stored attempt keeps
   * whatever provenance it has - in particular a local attempt is never
   * relabelled as imported.
   *
   * The provenance row is written with `add`, not `put`: if a marker for this id
   * already exists while the attempt is absent (an inconsistency that normal
   * operation cannot create), the whole transaction aborts instead of silently
   * overwriting evidence. The failure is visible and nothing is written.
   */
  async importAttemptIfAbsent(
    record: AttemptRecord,
    origin: AttemptImportOrigin,
  ): Promise<AddAttemptIfAbsentResult> {
    const parsed = parseAttemptForImport(record);
    const parsedOrigin = parseImportOrigin(origin);
    const provenance = AttemptProvenanceSchema.parse({
      attemptId: String(parsed.id),
      origin: parsedOrigin,
      importedAt: new Date().toISOString(),
    });

    const database = await this.getDatabase();
    const transaction = database.transaction([ATTEMPT_STORE, PROVENANCE_STORE], "readwrite");
    const done = transactionDone(transaction);
    const attempts = transaction.objectStore(ATTEMPT_STORE);
    const provenanceStore = transaction.objectStore(PROVENANCE_STORE);

    const state: { outcome?: AttemptOutcome; failure?: unknown } = {};
    const lookup = attempts.get(parsed.id);
    lookup.onsuccess = () => {
      try {
        if (lookup.result === undefined) {
          attempts.add(structuredClone(parsed));
          provenanceStore.add(provenance);
          state.outcome = "added";
        } else {
          state.outcome = classifyStoredAttempt(parsed, lookup.result);
        }
      } catch (error) {
        state.failure = error;
        transaction.abort();
      }
    };

    try {
      await done;
    } catch (error) {
      throw state.failure ?? error;
    }
    if (state.outcome === undefined) {
      throw new Error("IndexedDB attempt import finished without an outcome.");
    }
    return { status: state.outcome };
  }

  async getAttempts(): Promise<readonly AttemptRecord[]> {
    const database = await this.getDatabase();
    const transaction = database.transaction(ATTEMPT_STORE, "readonly");
    const [values] = await Promise.all([
      requestResult<unknown[]>(transaction.objectStore(ATTEMPT_STORE).getAll()),
      transactionDone(transaction),
    ]);

    return parseAndSortAttempts(values);
  }

  /**
   * Attempts and provenance are read by ONE readonly transaction, i.e. from a
   * single consistent snapshot: an import or clear committing concurrently is
   * seen entirely or not at all, never an attempt without its marker.
   *
   * Every attempt that has a provenance row is excluded. If provenance cannot be
   * read or trusted the call rejects; it never falls back to unfiltered data.
   */
  async getRewardEligibleAttemptsSnapshot(): Promise<readonly AttemptRecord[]> {
    // Outside the boundary on purpose: an unavailable database, a blocked upgrade
    // or a newer schema keep their existing semantics (see openDatabase).
    const database = await this.getDatabase();

    // Everything below is the snapshot read. Any failure here - a missing store,
    // a throwing request, a failed request, an aborted transaction or a malformed
    // provenance row - means eligibility is unknowable. It is reported as
    // AttemptProvenanceUnreadableError, a domain error, so Resilient rethrows it
    // instead of failing over to an empty memory store.
    let transaction: IDBTransaction | undefined;
    try {
      transaction = database.transaction([ATTEMPT_STORE, PROVENANCE_STORE], "readonly");
      const [attemptRows, provenanceRows] = await Promise.all([
        requestResult<unknown[]>(transaction.objectStore(ATTEMPT_STORE).getAll()),
        requestResult<unknown[]>(transaction.objectStore(PROVENANCE_STORE).getAll()),
        transactionDone(transaction),
      ]);

      const importedIds = new Set<string>();
      for (const row of provenanceRows) {
        const parsed = AttemptProvenanceSchema.safeParse(row);
        if (!parsed.success) throw new AttemptProvenanceUnreadableError({ cause: parsed.error });
        importedIds.add(parsed.data.attemptId);
      }

      return parseAndSortAttempts(attemptRows).filter(
        (attempt) => !importedIds.has(String(attempt.id)),
      );
    } catch (error) {
      if (error instanceof PersistenceDomainError) throw error;
      abortQuietly(transaction);
      throw new AttemptProvenanceUnreadableError({ cause: error });
    }
  }

  /** Attempts and their provenance are removed in one transaction. */
  async clearAttempts(): Promise<void> {
    const database = await this.getDatabase();
    const transaction = database.transaction([ATTEMPT_STORE, PROVENANCE_STORE], "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(ATTEMPT_STORE).clear();
    transaction.objectStore(PROVENANCE_STORE).clear();
    await done;
  }

  async getMissionDraft(activityId: LearningActivityId): Promise<MissionDraftRecord | null> {
    const database = await this.getDatabase();
    const transaction = database.transaction(DRAFT_STORE, "readonly");
    const [raw] = await Promise.all([
      requestResult<unknown>(transaction.objectStore(DRAFT_STORE).get(activityId)),
      transactionDone(transaction),
    ]);
    const parsed = MissionDraftSchema.safeParse(raw);
    if (!parsed.success) return null;
    return {
      ...parsed.data,
      activityId: parsed.data.activityId as LearningActivityId,
    };
  }

  async saveMissionDraft(record: MissionDraftRecord): Promise<void> {
    const parsed = MissionDraftSchema.parse(record);
    const database = await this.getDatabase();
    const transaction = database.transaction(DRAFT_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(DRAFT_STORE).put(parsed);
    await done;
  }

  async deleteMissionDraft(activityId: LearningActivityId): Promise<void> {
    const database = await this.getDatabase();
    const transaction = database.transaction(DRAFT_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(DRAFT_STORE).delete(activityId);
    await done;
  }

  async clearMissionDrafts(): Promise<void> {
    const database = await this.getDatabase();
    const transaction = database.transaction(DRAFT_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(DRAFT_STORE).clear();
    await done;
  }

  async clearAll(): Promise<void> {
    const database = await this.getDatabase();
    const transaction = database.transaction(
      [ATTEMPT_STORE, PROVENANCE_STORE, DRAFT_STORE],
      "readwrite",
    );
    const done = transactionDone(transaction);
    transaction.objectStore(ATTEMPT_STORE).clear();
    transaction.objectStore(PROVENANCE_STORE).clear();
    transaction.objectStore(DRAFT_STORE).clear();
    await done;
  }

  /**
   * Lazily opens (and caches) the connection. The cache is dropped whenever the
   * connection becomes unusable - a failed open, a `versionchange` (another tab
   * upgrading) or an abnormal close - so the next call reopens instead of
   * reusing a dead handle or a permanently rejected promise.
   *
   * While an upgrade is BLOCKED the single in-flight open request is kept (it
   * must not be duplicated: browsers queue open requests per database, so a
   * second request would wait silently behind the first). Every caller during
   * that window is rejected immediately with PersistenceUpgradeBlockedError; if
   * the blocking tab closes, the same request completes the upgrade and the
   * resulting connection becomes the cached one.
   */
  private getDatabase(): Promise<IDBDatabase> {
    if (this.handle === null) {
      const handle: OpenHandle = openDatabase(this.indexedDb, this.databaseName, () =>
        this.forget(handle),
      );
      this.handle = handle;
      handle.database.catch(() => this.forget(handle));
    }
    // `database` first: once it has resolved it wins over an earlier `blocked`.
    return Promise.race([this.handle.database, this.handle.blocked]);
  }

  private forget(handle: OpenHandle): void {
    if (this.handle !== handle) return;
    this.handle = null;
  }
}

interface OpenHandle {
  /** Resolves with the connection once opened - even after a `blocked` rejection. */
  readonly database: Promise<IDBDatabase>;
  /** Rejects (once, never resolves) when the upgrade is blocked by another connection. */
  readonly blocked: Promise<never>;
}

function parseAndSortAttempts(values: readonly unknown[]): AttemptRecord[] {
  return values
    .map((value) => AttemptRecordSchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data)
    .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
}

/**
 * Opens the database at DATABASE_VERSION.
 *
 * - Upgrades are additive (v0 -> v2 and v1 -> v2 both just create missing stores).
 * - If another connection (typically a tab running older code) does not close on
 *   `versionchange`, the browser fires `blocked` and then WAITS. If the upgrade
 *   has not started within BLOCKED_GRACE_MS, we never abort or duplicate the
 *   request: `blocked` rejects, with a typed non-failover error,
 *   every caller that races against it, while `database` stays pending and
 *   resolves if the blocking tab later closes (the upgrade then completes
 *   normally and the connection belongs to the cached handle - nothing leaks and
 *   no second open request is queued behind a stuck one).
 * - A stored version newer than this code understands (VersionError) is also
 *   reported as a typed error rather than a generic failure.
 * - A healthy connection closes itself on `versionchange` so it never blocks
 *   another tab's upgrade, and reports via `onClosed` so the owner can reopen.
 */
function openDatabase(indexedDb: IDBFactory, databaseName: string, onClosed: () => void): OpenHandle {
  let rejectBlocked: (error: Error) => void = () => undefined;
  const blocked = new Promise<never>((_resolve, reject) => {
    rejectBlocked = reject;
  });
  blocked.catch(() => undefined); // observed by callers via race; never an unhandled rejection

  const database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDb.open(databaseName, DATABASE_VERSION);

    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    const upgradeProceeding = () => {
      if (graceTimer !== undefined) clearTimeout(graceTimer);
      graceTimer = undefined;
    };

    request.onupgradeneeded = () => {
      upgradeProceeding();
      const created = request.result;
      if (!created.objectStoreNames.contains(ATTEMPT_STORE)) {
        const attempts = created.createObjectStore(ATTEMPT_STORE, { keyPath: "id" });
        attempts.createIndex("activityId", "activityId", { unique: false });
        attempts.createIndex("submittedAt", "submittedAt", { unique: false });
        attempts.createIndex("conceptIds", "conceptIds", { unique: false, multiEntry: true });
      }
      if (!created.objectStoreNames.contains(DRAFT_STORE)) {
        created.createObjectStore(DRAFT_STORE, { keyPath: "activityId" });
      }
      if (!created.objectStoreNames.contains(PROVENANCE_STORE)) {
        created.createObjectStore(PROVENANCE_STORE, { keyPath: "attemptId" });
      }
    };

    request.onsuccess = () => {
      upgradeProceeding();
      const opened = request.result;
      opened.onversionchange = () => {
        opened.close();
        onClosed();
      };
      opened.onclose = () => onClosed();
      resolve(opened);
    };

    request.onerror = () => {
      upgradeProceeding();
      const error = request.error;
      if (error?.name === "VersionError") {
        reject(new PersistenceUpgradeBlockedError(PersistenceUpgradeFailureReason.VERSION_NEWER_THAN_CODE));
        return;
      }
      reject(error ?? new Error("Không thể mở IndexedDB."));
    };

    request.onblocked = () => {
      graceTimer ??= setTimeout(() => {
        graceTimer = undefined;
        rejectBlocked(new PersistenceUpgradeBlockedError(PersistenceUpgradeFailureReason.BLOCKED));
      }, BLOCKED_GRACE_MS);
    };
  });

  return { database, blocked };
}

/** Aborts a read transaction that is still running; never throws (it may already be finished). */
function abortQuietly(transaction: IDBTransaction | undefined): void {
  try {
    transaction?.abort();
  } catch {
    // Already finished or aborted: nothing left to undo.
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
  });
}
