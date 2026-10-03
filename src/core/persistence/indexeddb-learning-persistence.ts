import { z } from "zod";

import {
  AttemptRecordSchema,
  HintLevel,
  type AttemptRecord,
  type LearningActivityId,
} from "../domain";
import type { LearningPersistence, MissionDraftRecord } from "./learning-persistence";

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
    const database = await this.getDatabase();
    const transaction = database.transaction(ATTEMPT_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(ATTEMPT_STORE).add(structuredClone(record));
    await done;
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
