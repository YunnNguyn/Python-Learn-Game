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

export interface LearningPersistence {
  readonly kind: "indexeddb" | "memory";
  /** Inserts a new attempt. Rejects with DuplicateAttemptError if the id is already stored. */
  addAttempt(record: AttemptRecord): Promise<void>;
  /**
   * Idempotent, non-overwriting insert for future import/sync flows.
   * Rejects with InvalidAttemptRecordError when the record fails AttemptRecordSchema.
   */
  addAttemptIfAbsent(record: AttemptRecord): Promise<AddAttemptIfAbsentResult>;
  getAttempts(): Promise<readonly AttemptRecord[]>;
  clearAttempts(): Promise<void>;
  getMissionDraft(activityId: LearningActivityId): Promise<MissionDraftRecord | null>;
  saveMissionDraft(record: MissionDraftRecord): Promise<void>;
  deleteMissionDraft(activityId: LearningActivityId): Promise<void>;
  clearMissionDrafts(): Promise<void>;
  clearAll(): Promise<void>;
}
