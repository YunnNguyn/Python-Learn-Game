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
  databasePromise?: Promise<IDBDatabase> | null;
}

/**
 * The persistence classes expose no close(). Tests close the connection the
 * class opened lazily (private `databasePromise`) so no handle outlives a test.
 */
async function closeOpenedConnection(store: object): Promise<void> {
  const pending = (store as HasDatabasePromise).databasePromise;
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

function openRaw(factory: IDBFactory, databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(databaseName, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("raw open failed"));
  });
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
