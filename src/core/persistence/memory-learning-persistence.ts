import type { AttemptRecord, LearningActivityId } from "../domain";
import type { LearningPersistence, MissionDraftRecord } from "./learning-persistence";

export class MemoryLearningPersistence implements LearningPersistence {
  readonly kind = "memory" as const;
  private readonly attempts = new Map<string, AttemptRecord>();
  private readonly drafts = new Map<LearningActivityId, MissionDraftRecord>();

  async addAttempt(record: AttemptRecord): Promise<void> {
    if (this.attempts.has(record.id)) {
      throw new Error(`Attempt already exists: ${String(record.id)}`);
    }
    this.attempts.set(record.id, structuredClone(record));
  }

  async getAttempts(): Promise<readonly AttemptRecord[]> {
    return [...this.attempts.values()]
      .map((record) => structuredClone(record))
      .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
  }

  async clearAttempts(): Promise<void> {
    this.attempts.clear();
  }

  async getMissionDraft(activityId: LearningActivityId): Promise<MissionDraftRecord | null> {
    const draft = this.drafts.get(activityId);
    return draft ? structuredClone(draft) : null;
  }

  async saveMissionDraft(record: MissionDraftRecord): Promise<void> {
    this.drafts.set(record.activityId, structuredClone(record));
  }

  async deleteMissionDraft(activityId: LearningActivityId): Promise<void> {
    this.drafts.delete(activityId);
  }

  async clearMissionDrafts(): Promise<void> {
    this.drafts.clear();
  }

  async clearAll(): Promise<void> {
    this.attempts.clear();
    this.drafts.clear();
  }
}
