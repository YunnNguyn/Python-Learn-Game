/**
 * An IDBFactory wrapper that can make transactions on chosen object stores fail
 * AFTER the database was opened, like a real IndexedDB that breaks mid-session
 * (quota exceeded, storage evicted, connection lost). Everything else - opening,
 * upgrading, the other stores - is the real (fake-indexeddb / browser) behavior, so
 * the production persistence code under test runs unmodified.
 */
export interface FlakyIndexedDb {
  readonly factory: IDBFactory;
  /** Transactions that include any of these stores throw until `heal()`. */
  failStores(...stores: readonly string[]): void;
  /** Every transaction throws until `heal()`. */
  failEverything(): void;
  heal(): void;
  /** How many transactions were refused (proof that the failure path was reached). */
  readonly refused: () => number;
}

export function createFlakyIndexedDb(inner: IDBFactory): FlakyIndexedDb {
  let failing: ReadonlySet<string> | "all" = new Set();
  let refusedCount = 0;

  const failure = () => {
    refusedCount += 1;
    return new DOMException("Simulated IndexedDB failure.", "UnknownError");
  };

  function wrapDatabase(database: IDBDatabase): IDBDatabase {
    return new Proxy(database, {
      get(target, property) {
        if (property === "transaction") {
          return (storeNames: string | string[], ...rest: unknown[]) => {
            const names = Array.isArray(storeNames) ? storeNames : [storeNames];
            if (failing === "all" || names.some((name) => (failing as ReadonlySet<string>).has(name))) {
              throw failure();
            }
            return (target.transaction as (...args: unknown[]) => IDBTransaction)(storeNames, ...rest);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
      set(target, property, value) {
        return Reflect.set(target, property, value, target);
      },
    });
  }

  function wrapOpenRequest(request: IDBOpenDBRequest): IDBOpenDBRequest {
    let wrapped: IDBDatabase | null = null;
    return new Proxy(request, {
      get(target, property) {
        if (property === "result") {
          const result = target.result as IDBDatabase | undefined;
          if (result === undefined || result === null) return result;
          wrapped ??= wrapDatabase(result);
          return wrapped;
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
      set(target, property, value) {
        return Reflect.set(target, property, value, target);
      },
    });
  }

  const factory = new Proxy(inner, {
    get(target, property) {
      if (property === "open") {
        return (...args: unknown[]) => wrapOpenRequest((target.open as (...a: unknown[]) => IDBOpenDBRequest)(...args));
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return {
    factory,
    failStores(...stores) {
      failing = new Set(stores);
    },
    failEverything() {
      failing = "all";
    },
    heal() {
      failing = new Set();
    },
    refused: () => refusedCount,
  };
}
