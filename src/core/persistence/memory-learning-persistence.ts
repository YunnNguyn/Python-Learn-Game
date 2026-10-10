import type { AttemptRecord, LearningActivityId } from "../domain";
import { classifyStoredAttempt, parseAttemptForImport, parseImportOrigin } from "./attempt-import";
import type {
  AddAttemptIfAbsentResult,
  AttemptImportOrigin,
  LearningPersistence,
  MissionDraftRecord,
} from "./learning-persistence";
import { DuplicateAttemptError, ImportRequiresDurableStorageError } from "./persistence-errors";

export class MemoryLearningPersistence implements LearningPersistence {
  readonly kind = "memory" as const;
  private readonly attempts = new Map<string, AttemptRecord>();
  private readonly drafts = new Map<LearningActivityId, MissionDraftRecord>();

  async addAttempt(record: AttemptRecord): Promise<void> {
    if (this.attempts.has(record.id)) {
      throw new DuplicateAttemptError(String(record.id));
    }
    this.attempts.set(record.id, structuredClone(record));
  }

  async addAttemptIfAbsent(record: AttemptRecord): Promise<AddAttemptIfAbsentResult> {
    const parsed = parseAttemptForImport(record);
    // No await between lookup and insert, so this is atomic on the JS event loop.
    const stored = this.attempts.get(parsed.id);
    if (stored === undefined) {
      this.attempts.set(parsed.id, structuredClone(parsed));
      return { status: "added" };
    }
    return { status: classifyStoredAttempt(parsed, stored) };
  }

  /**
   * Memory is volatile, so an import can never be durable. Inputs are validated
   * first (consistent errors with the durable store), then the call fails closed
   * and stores NOTHING - an imported attempt must never live only in RAM.
   */
  async importAttemptIfAbsent(
    record: AttemptRecord,
    origin: AttemptImportOrigin,
  ): Promise<AddAttemptIfAbsentResult> {
    parseAttemptForImport(record);
    parseImportOrigin(origin);
    throw new ImportRequiresDurableStorageError();
  }

  async getAttempts(): Promise<readonly AttemptRecord[]> {
    return [...this.attempts.values()]
      .map((record) => structuredClone(record))
      .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
  }

  /**
   * Imports are impossible in memory, so every attempt here is locally
   * originated and eligible. Returns detached copies (same as getAttempts).
   */
  async getRewardEligibleAttemptsSnapshot(): Promise<readonly AttemptRecord[]> {
    return this.getAttempts();
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
