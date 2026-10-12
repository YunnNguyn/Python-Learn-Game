import type { AttemptRecord, LearningActivityId } from "../domain";
import { MemoryLearningPersistence } from "./memory-learning-persistence";
import type {
  AddAttemptIfAbsentResult,
  AttemptImportOrigin,
  LearningPersistence,
  LearningPersistenceCloseState,
  MissionDraftRecord,
} from "./learning-persistence";
import {
  ImportRequiresDurableStorageError,
  PersistenceClosedError,
  PersistenceDomainError,
} from "./persistence-errors";

export class ResilientLearningPersistence implements LearningPersistence {
  private readonly fallback = new MemoryLearningPersistence();
  private failedOver = false;
  /** Set synchronously by close(); never reset. Checked again on the failover path. */
  private closed = false;
  private closing: Promise<void> | null = null;

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
    if (this.closed) throw new PersistenceClosedError();
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

  /**
   * Closes the primary and the memory fallback (idempotent; see
   * LearningPersistence.close). Nothing is cleared or copied between them.
   */
  close(): Promise<void> {
    if (this.closing !== null) return this.closing;
    this.closed = true;
    this.closing = Promise.all([this.primary.close(), this.fallback.close()]).then(
      () => undefined,
    );
    return this.closing;
  }

  getCloseState(): LearningPersistenceCloseState {
    if (!this.closed) return "open";
    // The fallback is memory: it never holds a pending browser request.
    return this.primary.getCloseState() === "closed-pending-open" ? "closed-pending-open" : "closed";
  }

  private async execute<T>(operation: (store: LearningPersistence) => Promise<T>): Promise<T> {
    if (this.closed) throw new PersistenceClosedError();
    if (this.failedOver) return operation(this.fallback);

    try {
      return await operation(this.primary);
    } catch (error) {
      // Expected domain outcomes (e.g. duplicate attempt id, and an intentional
      // close via PersistenceClosedError) are the caller's concern, not a
      // storage outage: keep the healthy primary and rethrow.
      if (error instanceof PersistenceDomainError) throw error;
      // close() ran while this operation was in flight and the primary then
      // failed for a genuine reason. Report that real error; never retry the
      // operation in memory and never flip to failover after an intentional close.
      if (this.closed) throw error;
      console.warn("IndexedDB unavailable; falling back to in-memory learning data.", error);
      this.failedOver = true;
      return operation(this.fallback);
    }
  }
}
