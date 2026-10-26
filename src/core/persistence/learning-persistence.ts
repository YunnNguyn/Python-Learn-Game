import type { AttemptRecord, HintLevel, LearningActivityId } from "../domain";

export interface MissionDraftRecord {
  readonly activityId: LearningActivityId;
  readonly seed: string;
  readonly variantIndex: number;
  readonly code: string;
  readonly hintsUsed: readonly HintLevel[];
  readonly updatedAt: string;
}

/**
 * Outcome of `addAttemptIfAbsent`. `exists` and `conflict` are explicit,
 * non-mutating results - not errors and never storage failures.
 *  - added:    the record was newly persisted.
 *  - exists:   a record with the same id and equivalent content is already stored.
 *  - conflict: the same id is stored with different (or unreadable) content;
 *              the stored record was left untouched.
 */
export type AddAttemptIfAbsentResult =
  | { readonly status: "added" }
  | { readonly status: "exists" }
  | { readonly status: "conflict" };

/**
 * Where an imported attempt came from. Set only by the trusted import path
 * (`importAttemptIfAbsent`), never inferred from the attempt payload.
 */
export const ATTEMPT_IMPORT_ORIGINS = ["cloud-import", "guest-copy"] as const;
export type AttemptImportOrigin = (typeof ATTEMPT_IMPORT_ORIGINS)[number];

/**
 * Lifecycle of a LearningPersistence instance (see `close()`):
 *  - open:                close() has not been called.
 *  - closed:              closed; no connection is held and none is pending.
 *  - closed-pending-open: closed, but a browser open request issued BEFORE
 *                         close() is still outstanding (typically an upgrade
 *                         blocked by another tab). Its connection is closed the
 *                         moment it arrives and is never used; the state then
 *                         becomes `closed`. This can last indefinitely.
 */
export type LearningPersistenceCloseState = "open" | "closed" | "closed-pending-open";

export interface LearningPersistence {
  readonly kind: "indexeddb" | "memory";
  /** Inserts a new attempt. Rejects with DuplicateAttemptError if the id is already stored. */
  addAttempt(record: AttemptRecord): Promise<void>;
  /**
   * Idempotent, non-overwriting insert for future import/sync flows.
   * Rejects with InvalidAttemptRecordError when the record fails AttemptRecordSchema.
   */
  addAttemptIfAbsent(record: AttemptRecord): Promise<AddAttemptIfAbsentResult>;
  /**
   * Durable, atomic import. The attempt and its provenance marker are committed
   * in ONE transaction: both exist or neither does. Same result semantics as
   * `addAttemptIfAbsent`; `exists` and `conflict` never touch stored data or
   * provenance. Never invokes Submit or reward logic.
   *
   * Fails closed: rejects with ImportRequiresDurableStorageError instead of
   * writing to volatile memory. Rejects with InvalidAttemptRecordError /
   * InvalidImportOriginError before any storage access.
   */
  importAttemptIfAbsent(
    record: AttemptRecord,
    origin: AttemptImportOrigin,
  ): Promise<AddAttemptIfAbsentResult>;
  getAttempts(): Promise<readonly AttemptRecord[]>;
  /**
   * Attempts that may be considered for local rewards: locally originated and
   * legacy (pre-provenance) attempts, EXCLUDING any with import provenance.
   * Attempts and provenance are read in one transaction, so the result is never
   * torn. Rejects (never returns unfiltered data) if provenance is unreadable.
   */
  getRewardEligibleAttemptsSnapshot(): Promise<readonly AttemptRecord[]>;
  clearAttempts(): Promise<void>;
  getMissionDraft(activityId: LearningActivityId): Promise<MissionDraftRecord | null>;
  saveMissionDraft(record: MissionDraftRecord): Promise<void>;
  deleteMissionDraft(activityId: LearningActivityId): Promise<void>;
  clearMissionDrafts(): Promise<void>;
  clearAll(): Promise<void>;
  /**
   * Permanently closes this instance (idempotent). The instance is marked closed
   * synchronously, before any asynchronous cleanup, so from that moment:
   *  - every operation called later rejects with PersistenceClosedError;
   *  - an operation still waiting for its connection rejects with it before
   *    starting a transaction;
   *  - a transaction that already started settles normally (IndexedDB finishes
   *    in-flight transactions before the connection really closes) and its
   *    caller receives the real result or error;
   *  - nothing is ever retried in, or redirected to, another store.
   * Stored data, provenance and schema are left untouched, and nothing is ever
   * reopened. close() never waits for a browser open request that is still
   * outstanding (it may be blocked by another tab forever); `getCloseState()`
   * reports that case as `closed-pending-open`.
   *
   * This is resource release only. It does NOT drain application workflows
   * (Submit, draft saves); coordinating those is the caller's job.
   */
  close(): Promise<void>;
  getCloseState(): LearningPersistenceCloseState;
}
