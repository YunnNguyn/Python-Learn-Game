import { IDBFactory } from "fake-indexeddb";
import { afterEach } from "vitest";

/**
 * Shared helpers for IndexedDB persistence tests.
 *
 * Every test gets its own `new IDBFactory()`, so database state is isolated
 * per test without touching globalThis.indexedDB. The persistence classes
 * already accept an IDBFactory in their constructor, so no global polyfill is
 * required.
 */

interface HasDatabasePromise {
  /** Meta persistence caches the connection promise directly. */
  databasePromise?: Promise<IDBDatabase> | null;
  /** Learning persistence caches an open handle (connection + blocked signal). */
  handle?: { database: Promise<IDBDatabase> } | null;
}

/**
 * The persistence classes expose no close(). Tests close the connection the
 * class opened lazily (private `databasePromise` / `handle`) so no handle outlives a test.
 */
async function closeOpenedConnection(store: object): Promise<void> {
  const holder = store as HasDatabasePromise;
  const pending = holder.databasePromise ?? holder.handle?.database;
  if (!pending) return;
  try {
    (await pending).close();
  } catch {
    // The connection never opened; nothing to close.
  }
}

export function useIsolatedIndexedDb() {
  const tracked: object[] = [];

  afterEach(async () => {
    await Promise.all(tracked.splice(0).map(closeOpenedConnection));
  });

  return {
    createFactory(): IDBFactory {
      return new IDBFactory();
    },
    track<T extends object>(store: T): T {
      tracked.push(store);
      return store;
    },
    close: closeOpenedConnection,
  };
}

/**
 * Opens a database for inspection. Without an explicit version it opens the
 * CURRENT version (creating an empty version-1 database if none exists), so the
 * raw helpers keep working whatever schema version the code under test uses.
 */
function openRaw(factory: IDBFactory, databaseName: string, version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = version === undefined ? factory.open(databaseName) : factory.open(databaseName, version);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("raw open failed"));
  });
}

/**
 * Opens a raw connection that deliberately IGNORES `versionchange` (never
 * closes itself), modelling an older tab running code from before an upgrade.
 * Callers must `close()` it.
 */
export function openRawConnection(
  factory: IDBFactory,
  databaseName: string,
  version?: number,
): Promise<IDBDatabase> {
  return openRaw(factory, databaseName, version);
}

/**
 * Creates a Learning database exactly as the pre-provenance build (schema v1)
 * did: `attempts` + `missionDrafts` only, independent of the class under test.
 */
export async function seedLearningV1Database(
  factory: IDBFactory,
  databaseName: string,
  rows: { attempts?: readonly unknown[]; drafts?: readonly unknown[] } = {},
): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const created = request.result;
      const attempts = created.createObjectStore("attempts", { keyPath: "id" });
      attempts.createIndex("activityId", "activityId", { unique: false });
      attempts.createIndex("submittedAt", "submittedAt", { unique: false });
      attempts.createIndex("conceptIds", "conceptIds", { unique: false, multiEntry: true });
      created.createObjectStore("missionDrafts", { keyPath: "activityId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("seed v1 failed"));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(["attempts", "missionDrafts"], "readwrite");
      for (const row of rows.attempts ?? []) transaction.objectStore("attempts").put(row);
      for (const row of rows.drafts ?? []) transaction.objectStore("missionDrafts").put(row);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("seed v1 write failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("seed v1 write aborted"));
    });
  } finally {
    database.close();
  }
}

/** Writes a value straight into an object store, bypassing the persistence class. */
export async function rawPut(
  factory: IDBFactory,
  databaseName: string,
  storeName: string,
  value: unknown,
): Promise<void> {
  const database = await openRaw(factory, databaseName);
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("raw put failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("raw put aborted"));
    });
  } finally {
    database.close();
  }
}

/** Reads every value of an object store, bypassing the persistence class. */
export async function rawGetAll(
  factory: IDBFactory,
  databaseName: string,
  storeName: string,
): Promise<unknown[]> {
  const database = await openRaw(factory, databaseName);
  try {
    return await new Promise<unknown[]>((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(request.error ?? new Error("raw getAll failed"));
    });
  } finally {
    database.close();
  }
}

/** Describes the physical schema of a database (for layout/compat tests). */
export async function rawDescribeSchema(
  factory: IDBFactory,
  databaseName: string,
): Promise<{
  version: number;
  stores: Record<string, { keyPath: string | string[] | null; indexes: Record<string, { keyPath: string | string[]; unique: boolean; multiEntry: boolean }> }>;
}> {
  const database = await openRaw(factory, databaseName);
  try {
    const stores: Record<string, { keyPath: string | string[] | null; indexes: Record<string, { keyPath: string | string[]; unique: boolean; multiEntry: boolean }> }> = {};
    const names = [...database.objectStoreNames];
    const transaction = database.transaction(names, "readonly");
    for (const name of names) {
      const store = transaction.objectStore(name);
      const indexes: Record<string, { keyPath: string | string[]; unique: boolean; multiEntry: boolean }> = {};
      for (const indexName of [...store.indexNames]) {
        const index = store.index(indexName);
        indexes[indexName] = {
          keyPath: index.keyPath,
          unique: index.unique,
          multiEntry: index.multiEntry,
        };
      }
      stores[name] = { keyPath: store.keyPath, indexes };
    }
    return { version: database.version, stores };
  } finally {
    database.close();
  }
}
