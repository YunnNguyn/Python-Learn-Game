import type { AttemptRecord, LearningActivityId } from "../domain";
import type {
  AddAttemptIfAbsentResult,
  AttemptImportOrigin,
  LearningPersistenceCloseState,
  MissionDraftRecord,
} from "./learning-persistence";
import { PracticePackRequiresDurableStorageError } from "./persistence-errors";
import type {
  InstallPracticePackResult,
  PracticePackListing,
  PracticePackRecord,
} from "./practice-pack-store";
import type { PracticePersistence } from "./browser-learning-persistence";

/**
 * The practice store of a browser without IndexedDB.
 *
 * Practice data (installed packs, attempts, drafts) is durable-only: there is no
 * in-memory stand-in, because attempts or a draft kept only in RAM would be
 * reported as saved and then vanish on reload. So every operation, reads included,
 * is refused with PracticePackRequiresDurableStorageError and nothing is stored.
 * `kind` is "memory" only in the sense of "no durable storage"; this class holds no data.
 */
export class UnavailablePracticePersistence implements PracticePersistence {
  readonly kind = "memory" as const;
  private closed = false;

  private refuse<T>(): Promise<T> {
    return Promise.reject(new PracticePackRequiresDurableStorageError());
  }

  addAttempt(_record: AttemptRecord): Promise<void> {
    return this.refuse();
  }

  addAttemptIfAbsent(_record: AttemptRecord): Promise<AddAttemptIfAbsentResult> {
    return this.refuse();
  }

  importAttemptIfAbsent(_record: AttemptRecord, _origin: AttemptImportOrigin): Promise<AddAttemptIfAbsentResult> {
    return this.refuse();
  }

  getAttempts(): Promise<readonly AttemptRecord[]> {
    return this.refuse();
  }

  getRewardEligibleAttemptsSnapshot(): Promise<readonly AttemptRecord[]> {
    return this.refuse();
  }

  clearAttempts(): Promise<void> {
    return this.refuse();
  }

  getMissionDraft(_activityId: LearningActivityId): Promise<MissionDraftRecord | null> {
    return this.refuse();
  }

  saveMissionDraft(_record: MissionDraftRecord): Promise<void> {
    return this.refuse();
  }

  deleteMissionDraft(_activityId: LearningActivityId): Promise<void> {
    return this.refuse();
  }

  clearMissionDrafts(): Promise<void> {
    return this.refuse();
  }

  clearAll(): Promise<void> {
    return this.refuse();
  }

  installPracticePackIfAbsent(_record: PracticePackRecord): Promise<InstallPracticePackResult> {
    return this.refuse();
  }

  getPracticePack(_packId: string): Promise<PracticePackRecord | null> {
    return this.refuse();
  }

  listPracticePacks(): Promise<PracticePackListing> {
    return this.refuse();
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  getCloseState(): LearningPersistenceCloseState {
    return this.closed ? "closed" : "open";
  }
}
