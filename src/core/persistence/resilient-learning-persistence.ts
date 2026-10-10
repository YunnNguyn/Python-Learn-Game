import type { AttemptRecord, LearningActivityId } from "../domain";
import { MemoryLearningPersistence } from "./memory-learning-persistence";
import type {
  AddAttemptIfAbsentResult,
  AttemptImportOrigin,
  LearningPersistence,
  MissionDraftRecord,
} from "./learning-persistence";
import { ImportRequiresDurableStorageError, PersistenceDomainError } from "./persistence-errors";

export class ResilientLearningPersistence implements LearningPersistence {
  private readonly fallback = new MemoryLearningPersistence();
  private failedOver = false;

  constructor(private readonly primary: LearningPersistence) {}

  get kind(): "indexeddb" | "memory" {
    return this.failedOver ? "memory" : this.primary.kind;
  }

  addAttempt(record: AttemptRecord): Promise<void> {
    return this.execute((store) => store.addAttempt(record));
  }

  addAttemptIfAbsent(record: AttemptRecord): Promise<AddAttemptIfAbsentResult> {
    return this.execute((store) => store.addAttemptIfAbsent(record));
  }

  /**
   * FAIL CLOSED. An import is reported successful only if it reached durable
   * storage, so this never writes to the in-memory fallback and never flips
   * `failedOver`:
   *  - already failed over            -> ImportRequiresDurableStorageError;
   *  - domain errors (validation, blocked upgrade, ...) -> rethrown as is;
   *  - any other primary failure      -> ImportRequiresDurableStorageError
   *    (cause attached). Ordinary operations decide on failover themselves.
   */
  async importAttemptIfAbsent(
    record: AttemptRecord,
    origin: AttemptImportOrigin,
  ): Promise<AddAttemptIfAbsentResult> {
    if (this.failedOver) return this.fallback.importAttemptIfAbsent(record, origin);

    try {
      return await this.primary.importAttemptIfAbsent(record, origin);
    } catch (error) {
      if (error instanceof PersistenceDomainError) throw error;
      throw new ImportRequiresDurableStorageError({ cause: error });
    }
  }

  getAttempts(): Promise<readonly AttemptRecord[]> {
    return this.execute((store) => store.getAttempts());
  }

  getRewardEligibleAttemptsSnapshot(): Promise<readonly AttemptRecord[]> {
    return this.execute((store) => store.getRewardEligibleAttemptsSnapshot());
  }

  clearAttempts(): Promise<void> {
    return this.execute((store) => store.clearAttempts());
  }

  getMissionDraft(activityId: LearningActivityId): Promise<MissionDraftRecord | null> {
    return this.execute((store) => store.getMissionDraft(activityId));
  }

  saveMissionDraft(record: MissionDraftRecord): Promise<void> {
    return this.execute((store) => store.saveMissionDraft(record));
  }

  deleteMissionDraft(activityId: LearningActivityId): Promise<void> {
    return this.execute((store) => store.deleteMissionDraft(activityId));
  }

  clearMissionDrafts(): Promise<void> {
    return this.execute((store) => store.clearMissionDrafts());
  }

  clearAll(): Promise<void> {
    return this.execute((store) => store.clearAll());
  }

  private async execute<T>(operation: (store: LearningPersistence) => Promise<T>): Promise<T> {
    if (this.failedOver) return operation(this.fallback);

    try {
      return await operation(this.primary);
    } catch (error) {
      // Expected domain outcomes (e.g. duplicate attempt id) are the caller's
      // concern, not a storage outage: keep the healthy primary and rethrow.
      if (error instanceof PersistenceDomainError) throw error;
      console.warn("IndexedDB unavailable; falling back to in-memory learning data.", error);
      this.failedOver = true;
      return operation(this.fallback);
    }
  }
}
