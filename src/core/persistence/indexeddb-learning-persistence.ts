import { z } from "zod";

import {
  AttemptRecordSchema,
  HintLevel,
  type AttemptRecord,
  type LearningActivityId,
} from "../domain";
import { classifyStoredAttempt, parseAttemptForImport } from "./attempt-import";
import type {
  AddAttemptIfAbsentResult,
  LearningPersistence,
  MissionDraftRecord,
} from "./learning-persistence";
import { DuplicateAttemptError } from "./persistence-errors";

const DATABASE_NAME = "python-learn-game";
const DATABASE_VERSION = 1;
const ATTEMPT_STORE = "attempts";
const DRAFT_STORE = "missionDrafts";

const MissionDraftSchema = z.strictObject({
  activityId: z.string().trim().min(1),
  seed: z.string().trim().min(1),
  variantIndex: z.number().finite().int().min(0),
  code: z.string(),
  hintsUsed: z.array(z.enum(HintLevel)).default([]),
  updatedAt: z.iso.datetime({ offset: true }),
});

export class IndexedDbLearningPersistence implements LearningPersistence {
  readonly kind = "indexeddb" as const;
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly indexedDb: IDBFactory = indexedDB) {}

  async addAttempt(record: AttemptRecord): Promise<void> {
    const outcome = await this.insertAttempt(record, () => "exists");
    if (outcome !== "added") throw new DuplicateAttemptError(String(record.id));
  }

  async addAttemptIfAbsent(record: AttemptRecord): Promise<AddAttemptIfAbsentResult> {
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
  ): Promise<"added" | "exists" | "conflict"> {
    const database = await this.getDatabase();
    const transaction = database.transaction(ATTEMPT_STORE, "readwrite");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(ATTEMPT_STORE);

    // Mutated from the request callback; a holder keeps TypeScript from narrowing it.
    const state: { outcome?: "added" | "exists" | "conflict"; failure?: unknown } = {};
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

  async getAttempts(): Promise<readonly AttemptRecord[]> {
    const database = await this.getDatabase();
    const transaction = database.transaction(ATTEMPT_STORE, "readonly");
    const [values] = await Promise.all([
      requestResult<unknown[]>(transaction.objectStore(ATTEMPT_STORE).getAll()),
      transactionDone(transaction),
    ]);

    return values
      .map((value) => AttemptRecordSchema.safeParse(value))
      .filter((result) => result.success)
      .map((result) => result.data)
      .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
  }

  async clearAttempts(): Promise<void> {
    const database = await this.getDatabase();
    const transaction = database.transaction(ATTEMPT_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(ATTEMPT_STORE).clear();
    await done;
  }

  async getMissionDraft(activityId: LearningActivityId): Promise<MissionDraftRecord | null> {
    const database = await this.getDatabase();
    const transaction = database.transaction(DRAFT_STORE, "readonly");
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
    const parsed = MissionDraftSchema.parse(record);
    const database = await this.getDatabase();
    const transaction = database.transaction(DRAFT_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(DRAFT_STORE).put(parsed);
    await done;
  }

  async deleteMissionDraft(activityId: LearningActivityId): Promise<void> {
    const database = await this.getDatabase();
    const transaction = database.transaction(DRAFT_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(DRAFT_STORE).delete(activityId);
    await done;
  }

  async clearMissionDrafts(): Promise<void> {
    const database = await this.getDatabase();
    const transaction = database.transaction(DRAFT_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(DRAFT_STORE).clear();
    await done;
  }

  async clearAll(): Promise<void> {
    const database = await this.getDatabase();
    const transaction = database.transaction([ATTEMPT_STORE, DRAFT_STORE], "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(ATTEMPT_STORE).clear();
    transaction.objectStore(DRAFT_STORE).clear();
    await done;
  }

  private getDatabase(): Promise<IDBDatabase> {
    this.databasePromise ??= openDatabase(this.indexedDb);
    return this.databasePromise;
  }
}

function openDatabase(indexedDb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ATTEMPT_STORE)) {
        const attempts = database.createObjectStore(ATTEMPT_STORE, { keyPath: "id" });
        attempts.createIndex("activityId", "activityId", { unique: false });
        attempts.createIndex("submittedAt", "submittedAt", { unique: false });
        attempts.createIndex("conceptIds", "conceptIds", { unique: false, multiEntry: true });
      }
      if (!database.objectStoreNames.contains(DRAFT_STORE)) {
        database.createObjectStore(DRAFT_STORE, { keyPath: "activityId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Không thể mở IndexedDB."));
    request.onblocked = () => reject(new Error("IndexedDB đang bị chặn bởi một tab cũ."));
  });
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
