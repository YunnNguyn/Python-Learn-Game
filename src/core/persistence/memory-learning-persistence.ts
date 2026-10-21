import type { AttemptRecord, LearningActivityId } from "../domain";
import { classifyStoredAttempt, parseAttemptForImport, parseImportOrigin } from "./attempt-import";
import type {
  AddAttemptIfAbsentResult,
  AttemptImportOrigin,
  LearningPersistence,
  LearningPersistenceCloseState,
  MissionDraftRecord,
} from "./learning-persistence";
import {
  DuplicateAttemptError,
  ImportRequiresDurableStorageError,
  PersistenceClosedError,
  PracticePackRequiresDurableStorageError,
} from "./persistence-errors";
import type {
  InstallPracticePackResult,
  PracticePackListing,
  PracticePackRecord,
  PracticePackStore,
} from "./practice-pack-store";

export class MemoryLearningPersistence implements LearningPersistence, PracticePackStore {
  readonly kind = "memory" as const;
  private readonly attempts = new Map<string, AttemptRecord>();
  private readonly drafts = new Map<LearningActivityId, MissionDraftRecord>();
  /** Set by close(); never reset. Closing keeps the data (it is not a clear). */
  private closed = false;

  async addAttempt(record: AttemptRecord): Promise<void> {
    this.assertOpen();
    if (this.attempts.has(record.id)) {
      throw new DuplicateAttemptError(String(record.id));
    }
    this.attempts.set(record.id, structuredClone(record));
  }

  async addAttemptIfAbsent(record: AttemptRecord): Promise<AddAttemptIfAbsentResult> {
    this.assertOpen();
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
    this.assertOpen();
    parseAttemptForImport(record);
    parseImportOrigin(origin);
    throw new ImportRequiresDurableStorageError();
  }

  async getAttempts(): Promise<readonly AttemptRecord[]> {
    this.assertOpen();
    return [...this.attempts.values()]
      .map((record) => structuredClone(record))
      .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
  }

  /**
   * Imports are impossible in memory, so every attempt here is locally
   * originated and eligible. Returns detached copies (same as getAttempts).
   */
  async getRewardEligibleAttemptsSnapshot(): Promise<readonly AttemptRecord[]> {
    this.assertOpen();
    return this.getAttempts();
  }

  async clearAttempts(): Promise<void> {
    this.assertOpen();
    this.attempts.clear();
  }

  async getMissionDraft(activityId: LearningActivityId): Promise<MissionDraftRecord | null> {
    this.assertOpen();
    const draft = this.drafts.get(activityId);
    return draft ? structuredClone(draft) : null;
  }

  async saveMissionDraft(record: MissionDraftRecord): Promise<void> {
    this.assertOpen();
    this.drafts.set(record.activityId, structuredClone(record));
  }

  async deleteMissionDraft(activityId: LearningActivityId): Promise<void> {
    this.assertOpen();
    this.drafts.delete(activityId);
  }

  async clearMissionDrafts(): Promise<void> {
    this.assertOpen();
    this.drafts.clear();
  }

  async clearAll(): Promise<void> {
    this.assertOpen();
    this.attempts.clear();
    this.drafts.clear();
  }

  /**
   * Practice packs are never kept in memory: an installed pack that vanishes on
   * reload would be worse than a refused install. All three fail closed, reads
   * included, so an empty list is never shown in place of packs stored on disk.
   */
  async installPracticePackIfAbsent(_record: PracticePackRecord): Promise<InstallPracticePackResult> {
    this.assertOpen();
    throw new PracticePackRequiresDurableStorageError();
  }

  async getPracticePack(_packId: string): Promise<PracticePackRecord | null> {
    this.assertOpen();
    throw new PracticePackRequiresDurableStorageError();
  }

  async listPracticePacks(): Promise<PracticePackListing> {
    this.assertOpen();
    throw new PracticePackRequiresDurableStorageError();
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  getCloseState(): LearningPersistenceCloseState {
    return this.closed ? "closed" : "open";
  }

  private assertOpen(): void {
    if (this.closed) throw new PersistenceClosedError();
  }
}
