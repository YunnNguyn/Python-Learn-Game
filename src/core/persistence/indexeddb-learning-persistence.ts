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
  type LearningPersistenceCloseState,
  type MissionDraftRecord,
} from "./learning-persistence";
import {
  AttemptProvenanceUnreadableError,
  DuplicateAttemptError,
  InvalidPracticePackRecordError,
  PersistenceClosedError,
  PersistenceDomainError,
  PersistenceUpgradeBlockedError,
  PersistenceUpgradeFailureReason,
  PracticePackStoreNotSupportedError,
} from "./persistence-errors";
import {
  MAX_INSTALLED_PRACTICE_PACKS,
  parsePracticePackRecord,
  PracticePackRecordSchema,
  type InstallPracticePackResult,
  type PracticePackListing,
  type PracticePackRecord,
  type PracticePackStore,
} from "./practice-pack-store";
import {
  GUEST_DATABASE_BASE_NAMES,
  GUEST_SCOPE,
  assertLearningDatabaseBaseName,
  resolveScopedDatabaseName,
  type LearningDatabaseBaseName,
  type PersistenceScope,
} from "./persistence-scope";

/**
 * Schema history:
 *  - v1: `attempts`, `missionDrafts`.
 *  - v2: adds `attemptProvenance` (keyPath `attemptId`). Purely additive; no
 *        existing store, index or row is touched. Attempts without a provenance
 *        row (every v1 attempt, and every locally submitted one) are local.
 *  - practice v3 (PHASE-05-M7): the `practice` family only. Adds `practicePacks`
 *        (keyPath `packId`) - imported Exercise Packs. Purely additive. The
 *        `learning` family stays at v2 and never gets this store.
 *
 * Schema ownership (PHASE-05, M7.0): this class's `onupgradeneeded` routine is
 * the SINGLE owner of the schema of every database family it serves
 * (`LEARNING_DATABASE_BASE_NAMES`: `learning` and `practice`). A store a family
 * needs is added HERE, together with a version bump of THAT family only in
 * `DATABASE_VERSIONS` - never by a second opener of the same database, which
 * would race this one on the version number (VersionError / blocked upgrades).
 * `practicePacks` (M7) is exactly that: created below for the `practice` family
 * only, which moved from v2 to v3 to get it. A practice database still at v2
 * (opened by M7.0 code) upgrades in place; a fresh one is created at v3 in one step.
 */
const DATABASE_VERSIONS: Readonly<Record<LearningDatabaseBaseName, number>> = Object.freeze({
  [GUEST_DATABASE_BASE_NAMES.learning]: 2,
  [GUEST_DATABASE_BASE_NAMES.practice]: 3,
});
const ATTEMPT_STORE = "attempts";
const DRAFT_STORE = "missionDrafts";
const PROVENANCE_STORE = "attemptProvenance";
const PACK_STORE = "practicePacks";

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

export interface IndexedDbLearningPersistenceOptions {
  /**
   * Which database family to open. Omitted means `GUEST_DATABASE_BASE_NAMES.learning`
   * - exactly the database every existing caller has always used. Anything outside
   * `LEARNING_DATABASE_BASE_NAMES` throws InvalidDatabaseBaseNameError.
   */
  readonly databaseBaseName?: LearningDatabaseBaseName;
}

export class IndexedDbLearningPersistence implements LearningPersistence, PracticePackStore {
  readonly kind = "indexeddb" as const;
  /** The in-flight or established connection (test helpers read `handle.database` to close it). */
  private handle: OpenHandle | null = null;
  /**
   * Set synchronously by close(); never reset, so a closed instance never opens
   * or reopens a connection and never starts another transaction.
   */
  private closed = false;
  /** True while an open request issued before close() has not settled yet. */
  private lateOpenPending = false;

  /** Resolved from `scope` at construction; an invalid scope throws here, never opens Guest. */
  readonly databaseName: string;
  /** The database family this instance serves (default: the original Learning database). */
  readonly databaseBaseName: LearningDatabaseBaseName;
  private readonly databaseVersion: number;
  /** Only the practice family has the `practicePacks` store. */
  private readonly hasPracticePackStore: boolean;

  constructor(
    private readonly indexedDb: IDBFactory = indexedDB,
    scope: PersistenceScope = GUEST_SCOPE,
    options: IndexedDbLearningPersistenceOptions = {},
  ) {
    // Only `undefined` selects the default; null or any other junk is validated (and rejected) below.
    const baseName: unknown =
      options.databaseBaseName === undefined ? GUEST_DATABASE_BASE_NAMES.learning : options.databaseBaseName;
    assertLearningDatabaseBaseName(baseName);
    this.databaseBaseName = baseName;
    this.databaseVersion = DATABASE_VERSIONS[baseName];
    this.hasPracticePackStore = baseName === GUEST_DATABASE_BASE_NAMES.practice;
    this.databaseName = resolveScopedDatabaseName(baseName, scope);
  }

  async addAttempt(record: AttemptRecord): Promise<void> {
    this.assertOpen();
    const outcome = await this.insertAttempt(record, () => "exists");
    if (outcome !== "added") throw new DuplicateAttemptError(String(record.id));
  }

  async addAttemptIfAbsent(record: AttemptRecord): Promise<AddAttemptIfAbsentResult> {
    this.assertOpen();
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
    const transaction = this.beginTransaction(database, ATTEMPT_STORE, "readwrite");
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
    this.assertOpen();
    const parsed = parseAttemptForImport(record);
    const parsedOrigin = parseImportOrigin(origin);
    const provenance = AttemptProvenanceSchema.parse({
      attemptId: String(parsed.id),
      origin: parsedOrigin,
      importedAt: new Date().toISOString(),
    });

    const database = await this.getDatabase();
    const transaction = this.beginTransaction(database, [ATTEMPT_STORE, PROVENANCE_STORE], "readwrite");
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
    this.assertOpen();
    const database = await this.getDatabase();
    const transaction = this.beginTransaction(database, ATTEMPT_STORE, "readonly");
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
    this.assertOpen();
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
      transaction = this.beginTransaction(database, [ATTEMPT_STORE, PROVENANCE_STORE], "readonly");
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
    this.assertOpen();
    const database = await this.getDatabase();
    const transaction = this.beginTransaction(database, [ATTEMPT_STORE, PROVENANCE_STORE], "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(ATTEMPT_STORE).clear();
    transaction.objectStore(PROVENANCE_STORE).clear();
    await done;
  }

  async getMissionDraft(activityId: LearningActivityId): Promise<MissionDraftRecord | null> {
    this.assertOpen();
    const database = await this.getDatabase();
    const transaction = this.beginTransaction(database, DRAFT_STORE, "readonly");
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
    this.assertOpen();
    const parsed = MissionDraftSchema.parse(record);
    const database = await this.getDatabase();
    const transaction = this.beginTransaction(database, DRAFT_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(DRAFT_STORE).put(parsed);
    await done;
  }

  async deleteMissionDraft(activityId: LearningActivityId): Promise<void> {
    this.assertOpen();
    const database = await this.getDatabase();
    const transaction = this.beginTransaction(database, DRAFT_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(DRAFT_STORE).delete(activityId);
    await done;
  }

  async clearMissionDrafts(): Promise<void> {
    this.assertOpen();
    const database = await this.getDatabase();
    const transaction = this.beginTransaction(database, DRAFT_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(DRAFT_STORE).clear();
    await done;
  }

  /**
   * Clears learner PROGRESS (attempts, provenance, drafts). It deliberately does
   * not list `practicePacks`: installed Exercise Packs are content, not progress.
   */
  async clearAll(): Promise<void> {
    this.assertOpen();
    const database = await this.getDatabase();
    const transaction = this.beginTransaction(database,
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
   * Durable, atomic, idempotent install of an Exercise Pack (practice family only).
   *
   * ONE readwrite transaction on `practicePacks`: look the id up; if absent, count
   * the installed packs and add (all inside the lookup's success callback, so the
   * transaction never idles across unrelated async work); if present, compare the
   * stored content hash. IndexedDB serializes overlapping readwrite transactions on
   * the store - in this tab and across tabs - so concurrent installs cannot
   * interleave between the lookup and the add, and the pack limit cannot be
   * overshot. Nothing is ever overwritten: a different content for an existing id
   * is a `conflict` result.
   *
   * The record is validated before any storage access. A failed or aborted
   * transaction commits nothing.
   */
  async installPracticePackIfAbsent(record: PracticePackRecord): Promise<InstallPracticePackResult> {
    this.assertOpen();
    this.assertPracticePackStore();
    const parsedRecord = PracticePackRecordSchema.safeParse(record);
    if (!parsedRecord.success) {
      throw new InvalidPracticePackRecordError(parsedRecord.error.issues.map((entry) => entry.message));
    }
    const incoming = parsedRecord.data as PracticePackRecord;

    const database = await this.getDatabase();
    const transaction = this.beginTransaction(database, PACK_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(PACK_STORE);

    const state: { result?: InstallPracticePackResult; failure?: unknown } = {};
    const fail = (error: unknown) => {
      state.failure = error;
      transaction.abort();
    };
    const lookup = store.get(incoming.packId);
    lookup.onsuccess = () => {
      try {
        if (lookup.result !== undefined) {
          const existing = parsePracticePackRecord(lookup.result);
          if (existing !== undefined && existing.contentHash === incoming.contentHash) {
            state.result = { status: "already-installed" };
          } else {
            state.result = {
              status: "conflict",
              existingPackVersion: existing?.packVersion ?? null,
              existingContentHash: existing?.contentHash ?? null,
            };
          }
          return;
        }
        const counted = store.count();
        counted.onsuccess = () => {
          try {
            if (counted.result >= MAX_INSTALLED_PRACTICE_PACKS) {
              state.result = { status: "limit-reached", limit: MAX_INSTALLED_PRACTICE_PACKS };
              return;
            }
            store.add(structuredClone(incoming));
            state.result = { status: "installed" };
          } catch (error) {
            fail(error);
          }
        };
      } catch (error) {
        fail(error);
      }
    };

    try {
      await done;
    } catch (error) {
      throw state.failure ?? error;
    }
    if (state.result === undefined) {
      throw new Error("IndexedDB practice pack install finished without an outcome.");
    }
    return state.result;
  }

  async getPracticePack(packId: string): Promise<PracticePackRecord | null> {
    this.assertOpen();
    this.assertPracticePackStore();
    const database = await this.getDatabase();
    const transaction = this.beginTransaction(database, PACK_STORE, "readonly");
    const [raw] = await Promise.all([
      requestResult<unknown>(transaction.objectStore(PACK_STORE).get(packId)),
      transactionDone(transaction),
    ]);
    if (raw === undefined) return null;
    const record = parsePracticePackRecord(raw);
    if (record === undefined) throw new InvalidPracticePackRecordError(["stored row is unreadable"]);
    return record;
  }

  async listPracticePacks(): Promise<PracticePackListing> {
    this.assertOpen();
    this.assertPracticePackStore();
    const database = await this.getDatabase();
    const transaction = this.beginTransaction(database, PACK_STORE, "readonly");
    const [rows] = await Promise.all([
      requestResult<unknown[]>(transaction.objectStore(PACK_STORE).getAll()),
      transactionDone(transaction),
    ]);
    const records: PracticePackRecord[] = [];
    let unreadableCount = 0;
    for (const row of rows) {
      const record = parsePracticePackRecord(row);
      if (record === undefined) unreadableCount += 1;
      else records.push(record);
    }
    records.sort(
      (left, right) => left.installedAt.localeCompare(right.installedAt) || left.packId.localeCompare(right.packId),
    );
    return { records, unreadableCount };
  }

  private assertPracticePackStore(): void {
    if (!this.hasPracticePackStore) throw new PracticePackStoreNotSupportedError();
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
  private async getDatabase(): Promise<IDBDatabase> {
    this.assertOpen();
    let handle = this.handle;
    if (handle === null) {
      const created: OpenHandle = openDatabase(
        this.indexedDb,
        this.databaseName,
        this.databaseVersion,
        this.hasPracticePackStore,
        () => this.forget(created),
      );
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
   * The only place a transaction starts. The closed check and `transaction()`
   * run in one synchronous step, and close() sets the flag before it closes the
   * connection, so a closed instance never begins new IndexedDB work - and never
   * hits the InvalidStateError of a closing connection (which Resilient would
   * otherwise mistake for an outage).
   */
  private beginTransaction(
    database: IDBDatabase,
    storeNames: string | string[],
    mode: IDBTransactionMode,
  ): IDBTransaction {
    this.assertOpen();
    return database.transaction(storeNames, mode);
  }

  /**
   * See LearningPersistence.close. Resolves once the instance is closed and its
   * connection released: an open connection is closed now (in-flight
   * transactions still finish first), a still-outstanding open request is
   * retired (its late connection is closed on arrival, never used). It never
   * waits for that request, which a blocking tab may hold forever.
   */
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

  getCloseState(): LearningPersistenceCloseState {
    if (!this.closed) return "open";
    return this.lateOpenPending ? "closed-pending-open" : "closed";
  }

  private assertOpen(): void {
    if (this.closed) throw new PersistenceClosedError();
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
  /**
   * Retires the handle for close(). Callers still waiting on it reject with
   * PersistenceClosedError right away. Returns true when nothing is left to
   * release (an open connection was closed now, or the request already failed).
   * Returns false while the open request is still outstanding: it cannot be
   * cancelled, so its connection is closed the moment it arrives - never exposed
   * as usable - and `onReleased` runs once the request settles.
   */
  retire(onReleased: () => void): boolean;
}

function parseAndSortAttempts(values: readonly unknown[]): AttemptRecord[] {
  return values
    .map((value) => AttemptRecordSchema.safeParse(value))
    .filter((result) => result.success)
    .map((result) => result.data)
    .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
}

/**
 * Opens the database at the version of its family (DATABASE_VERSIONS).
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
 * - `retire()` (close of the owning instance) is final: an open connection is
 *   closed, and a request still outstanding - possibly blocked forever by
 *   another tab - is never awaited; if it succeeds later its connection is
 *   closed immediately and never handed to anyone. A late upgrade requested
 *   before the close still runs as it would have (it is additive and was
 *   already queued by the browser); no data is touched by the retirement.
 */
function openDatabase(
  indexedDb: IDBFactory,
  databaseName: string,
  databaseVersion: number,
  withPracticePacks: boolean,
  onClosed: () => void,
): OpenHandle {
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
      request = indexedDb.open(databaseName, databaseVersion);
    } catch (error) {
      // The factory threw synchronously, so no browser request exists and none
      // will ever fire a handler. The attempt is terminal right now: marking it
      // settled lets retire() report "released" instead of a phantom pending
      // open. The original error is kept for callers that observe it.
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
      // Practice family only (see the schema history above): the learning
      // database never receives this store.
      if (withPracticePacks && !created.objectStoreNames.contains(PACK_STORE)) {
        created.createObjectStore(PACK_STORE, { keyPath: "packId" });
      }
    };

    request.onsuccess = () => {
      upgradeProceeding();
      settled = true;
      const opened = request.result;
      if (retired) {
        // close() ran while this request was outstanding: never expose the late
        // connection. The rejection is observed by the owner's catch handler.
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
        reject(error ?? new Error("Không thể mở IndexedDB."));
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
      // Waiting callers settle now instead of waiting on the browser. A no-op if
      // `blocked` already rejected (the first rejection wins).
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
