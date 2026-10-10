import {
  MetaProgressionStateSchema,
  type MetaProgressionState,
} from "./meta-types";
import type { MetaProgressionPersistence } from "./meta-progression-persistence";
import {
  GUEST_DATABASE_BASE_NAMES,
  GUEST_SCOPE,
  resolveScopedDatabaseName,
  type PersistenceScope,
} from "../persistence/persistence-scope";

const DATABASE_VERSION = 1;
const STATE_STORE = "progressionState";
const PRIMARY_KEY = "primary";

interface StoredMetaProgressionState {
  readonly key: string;
  readonly state: MetaProgressionState;
}

export class IndexedDbMetaProgressionPersistence
  implements MetaProgressionPersistence
{
  readonly kind = "indexeddb" as const;
  private databasePromise: Promise<IDBDatabase> | null = null;

  /** Resolved from `scope` at construction; an invalid scope throws here, never opens Guest. */
  readonly databaseName: string;

  constructor(
    private readonly indexedDb: IDBFactory = indexedDB,
    scope: PersistenceScope = GUEST_SCOPE,
  ) {
    this.databaseName = resolveScopedDatabaseName(GUEST_DATABASE_BASE_NAMES.meta, scope);
  }

  async loadState(): Promise<MetaProgressionState | null> {
    const database = await this.getDatabase();
    const transaction = database.transaction(STATE_STORE, "readonly");
    const [raw] = await Promise.all([
      requestResult<unknown>(transaction.objectStore(STATE_STORE).get(PRIMARY_KEY)),
      transactionDone(transaction),
    ]);

    if (!raw || typeof raw !== "object" || !("state" in raw)) {
      return null;
    }

    const parsed = MetaProgressionStateSchema.safeParse(
      (raw as { readonly state?: unknown }).state,
    );
    return parsed.success ? parsed.data : null;
  }

  async saveState(state: MetaProgressionState): Promise<void> {
    const parsed = MetaProgressionStateSchema.parse(state);
    const database = await this.getDatabase();
    const transaction = database.transaction(STATE_STORE, "readwrite");
    const done = transactionDone(transaction);
    const stored: StoredMetaProgressionState = {
      key: PRIMARY_KEY,
      state: structuredClone(parsed),
    };
    transaction.objectStore(STATE_STORE).put(stored);
    await done;
  }

  async clear(): Promise<void> {
    const database = await this.getDatabase();
    const transaction = database.transaction(STATE_STORE, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(STATE_STORE).clear();
    await done;
  }

  private getDatabase(): Promise<IDBDatabase> {
    this.databasePromise ??= openDatabase(this.indexedDb, this.databaseName);
    return this.databasePromise;
  }
}

function openDatabase(indexedDb: IDBFactory, databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(databaseName, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STATE_STORE)) {
        database.createObjectStore(STATE_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Không thể mở kho tiến độ phần thưởng."));
    request.onblocked = () =>
      reject(new Error("Kho tiến độ phần thưởng đang bị chặn bởi một tab cũ."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB reward request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB reward transaction failed."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB reward transaction aborted."));
  });
}
