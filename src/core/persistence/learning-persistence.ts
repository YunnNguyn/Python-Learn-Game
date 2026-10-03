import type { AttemptRecord, HintLevel, LearningActivityId } from "../domain";

export interface MissionDraftRecord {
  readonly activityId: LearningActivityId;
  readonly seed: string;
  readonly variantIndex: number;
  readonly code: string;
  readonly hintsUsed: readonly HintLevel[];
  readonly updatedAt: string;
}

export interface LearningPersistence {
  readonly kind: "indexeddb" | "memory";
  addAttempt(record: AttemptRecord): Promise<void>;
  getAttempts(): Promise<readonly AttemptRecord[]>;
  clearAttempts(): Promise<void>;
  getMissionDraft(activityId: LearningActivityId): Promise<MissionDraftRecord | null>;
  saveMissionDraft(record: MissionDraftRecord): Promise<void>;
  deleteMissionDraft(activityId: LearningActivityId): Promise<void>;
  clearMissionDrafts(): Promise<void>;
  clearAll(): Promise<void>;
}
