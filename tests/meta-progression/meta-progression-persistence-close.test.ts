import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AttemptRecordSchema,
  Difficulty,
  HintLevel,
  LearningStage,
  type AttemptRecord,
} from "../../src/core/domain";
import {
  IndexedDbMetaProgressionPersistence,
  MemoryMetaProgressionPersistence,
  MetaProgressionEngine,
  MetaProgressionStateUnreadableError,
  MetaProgressionStateUnreadableReason,
  MetaProgressionStorageUnavailableError,
  RobotPartId,
  STARTER_ROBOT_BLUEPRINT,
  createBrowserMetaProgressionPersistence,
  createEmptyMetaProgressionState,
  type MetaProgressionPersistence,
  type MetaProgressionState,
} from "../../src/core/meta-progression";
import { ResilientMetaProgressionPersistence } from "../../src/core/meta-progression/resilient-meta-progression-persistence";
import {
  GUEST_SCOPE,
  PersistenceClosedError,
  PersistenceDomainError,
  PersistenceUpgradeBlockedError,
  PersistenceUpgradeFailureReason,
  accountScope,
  resolveScopedDatabaseName,
} from "../../src/core/persistence";
import {
  openRawConnection,
  rawGetAll,
  rawPut,
  useIsolatedIndexedDb,
} from "../persistence/indexeddb-test-utils";

/**
 * PHASE-04C.3D.4 (M3) - meta persistence close contract and failure policy.
 *
 * Interleavings are driven by a controlled open request (for pending, blocked
 * and late outcomes) and by real fake-indexeddb connections; the only real wait
 * is the existing 250ms blocked-upgrade grace period.
 */

const META_DB = "python-learn-game-meta";
const STORE = "progressionState";

const idb = useIsolatedIndexedDb();

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function makeState(metal = 7): MetaProgressionState {
  return {
    ...createEmptyMetaProgressionState(),
    inventory: { metal_plate: metal, circuit_board: 3, energy_cell: 1 },
    processedAttemptIds: ["attempt.seed"],
    builtRobotPartIds: [RobotPartId.CHASSIS],
  };
}

function makeAttempt(id: string, overrides: Record<string, unknown> = {}): AttemptRecord {
  return AttemptRecordSchema.parse({
    id,
    activityId: "activity.test",
    missionTemplateId: "template.test",
    missionTemplateVersion: 1,
    seed: "seed",
    difficulty: Difficulty.EASY,
    conceptIds: ["concept.a"],
    learningStage: LearningStage.GUIDED,
    startedAt: "2026-10-03T11:59:00.000Z",
    submittedAt: "2026-10-03T12:00:00.000Z",
    passed: true,
    submissionIndex: 1,
    runCountBeforeSubmit: 0,
    hintsUsed: [HintLevel.H1],
    runtimeErrorCount: 0,
    ...overrides,
  });
}

/** Every public operation of the contract, with valid arguments. */
function everyOperation(
  store: MetaProgressionPersistence,
): ReadonlyArray<readonly [string, () => Promise<unknown>]> {
  return [
    ["loadState", () => store.loadState()],
    ["saveState", () => store.saveState(makeState())],
    ["clear", () => store.clear()],
  ];
}

async function expectEveryOperationClosed(store: MetaProgressionPersistence): Promise<void> {
  for (const [name, operation] of everyOperation(store)) {
    const error = await operation().then(
      () => new Error(`${name} resolved after close`),
      (caught: unknown) => caught,
    );
    expect(error, name).toBeInstanceOf(PersistenceClosedError);
    expect(error, name).toBeInstanceOf(PersistenceDomainError);
  }
}

/** Records every open request the factory receives (the class opens lazily). */
function watchOpens(factory: IDBFactory): IDBOpenDBRequest[] {
  const requests: IDBOpenDBRequest[] = [];
  const open = factory.open.bind(factory);
  vi.spyOn(factory, "open").mockImplementation((name: string, version?: number) => {
    const request = version === undefined ? open(name) : open(name, version);
    requests.push(request);
    return request;
  });
  return requests;
}

/**
 * An open request whose outcome the test decides. The class only uses the
 * handler properties and `result` / `error`, so this models a browser request
 * that is pending (e.g. blocked by another tab) for as long as the test wants.
 */
class ControlledOpenRequest {
  result: IDBDatabase | undefined;
  error: DOMException | null = null;
  onsuccess: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onblocked: ((event: Event) => void) | null = null;
  onupgradeneeded: ((event: Event) => void) | null = null;

  succeed(database: IDBDatabase): void {
    this.result = database;
    this.onsuccess?.(new Event("success"));
  }

  fail(error: DOMException): void {
    this.error = error;
    this.onerror?.(new Event("error"));
  }

  block(): void {
    this.onblocked?.(new Event("blocked"));
  }
}

function controlOpens(factory: IDBFactory) {
  const realOpen = factory.open.bind(factory);
  const requests: ControlledOpenRequest[] = [];
  const spy = vi.spyOn(factory, "open").mockImplementation(() => {
    const request = new ControlledOpenRequest();
    requests.push(request);
    return request as unknown as IDBOpenDBRequest;
  });
  /** A real, fully created meta connection to hand to a controlled request. */
  async function realConnection(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = realOpen(META_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return { requests, spy, realConnection };
}

/** A connection whose close() was called refuses new transactions (InvalidStateError). */
function isClosedConnection(database: IDBDatabase): boolean {
  try {
    database.transaction(STORE, "readonly");
    return false;
  } catch (error) {
    return (error as { name?: string }).name === "InvalidStateError";
  }
}

/** Runs `onStarted` synchronously right after the class started its next transaction. */
function onNextTransaction(database: IDBDatabase, onStarted: (transaction: IDBTransaction) => void) {
  const prototype = Object.getPrototypeOf(database) as IDBDatabase;
  const original = prototype.transaction;
  const spy = vi
    .spyOn(prototype, "transaction")
    .mockImplementation(function (this: IDBDatabase, ...args: Parameters<IDBDatabase["transaction"]>) {
      spy.mockRestore();
      const transaction = original.apply(this, args);
      onStarted(transaction);
      return transaction;
    });
}

function collectUnhandledRejections() {
  type Listener = (reason: unknown) => void;
  const proc = (
    globalThis as unknown as {
      process: { on(event: string, l: Listener): void; off(event: string, l: Listener): void };
    }
  ).process;
  const seen: unknown[] = [];
  const listener: Listener = (reason) => {
    seen.push(reason);
  };
  proc.on("unhandledRejection", listener);
  return { seen, stop: () => proc.off("unhandledRejection", listener) };
}

/** Version and store names, without a transaction (works for a database with no stores). */
async function rawLayout(factory: IDBFactory, name: string): Promise<{ version: number; stores: string[] }> {
  const database = await openRawConnection(factory, name);
  try {
    return { version: database.version, stores: [...database.objectStoreNames].sort() };
  } finally {
    database.close();
  }
}

const flushMicrotasks = async () => {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
};
const nextMacrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

async function createNewerMetaDatabase(factory: IDBFactory, version = 3): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = factory.open(META_DB, version);
    request.onupgradeneeded = () => undefined;
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

function throwingFactory(failure: unknown = new DOMException("IndexedDB is disabled.", "SecurityError")) {
  const factory = idb.createFactory();
  const open = vi.spyOn(factory, "open").mockImplementation(() => {
    throw failure;
  });
  return { factory, failure, open };
}

// ---------------------------------------------------------------------------
describe("IndexedDbMetaProgressionPersistence.close()", () => {
  it("1. close before the first open never opens IndexedDB", async () => {
    const factory = idb.createFactory();
    const opens = watchOpens(factory);
    const store = new IndexedDbMetaProgressionPersistence(factory);

    await store.close();

    expect(store.getCloseState()).toBe("closed");
    await expectEveryOperationClosed(store);
    expect(opens).toHaveLength(0);
    expect(await factory.databases()).toEqual([]);
  });

  it("2. close after a successful open closes the connection and keeps the stored state", async () => {
    const factory = idb.createFactory();
    const opens = watchOpens(factory);
    const store = new IndexedDbMetaProgressionPersistence(factory);
    await store.saveState(makeState(9));
    expect(store.getCloseState()).toBe("open");

    await store.close();

    expect(store.getCloseState()).toBe("closed");
    expect(opens).toHaveLength(1);
    expect(isClosedConnection(opens[0]!.result)).toBe(true);
    const fresh = idb.track(new IndexedDbMetaProgressionPersistence(factory));
    expect(await fresh.loadState()).toEqual(makeState(9));
  });

  it("3. repeated close is safe and never reopens", async () => {
    const factory = idb.createFactory();
    const opens = watchOpens(factory);
    const store = new IndexedDbMetaProgressionPersistence(factory);
    await store.loadState();

    await Promise.all([store.close(), store.close()]);
    await store.close();

    expect(store.getCloseState()).toBe("closed");
    expect(opens).toHaveLength(1);
  });

  it("4. every public operation rejects with PersistenceClosedError after close and changes nothing", async () => {
    const factory = idb.createFactory();
    const opens = watchOpens(factory);
    const store = new IndexedDbMetaProgressionPersistence(factory);
    await store.saveState(makeState(5));

    await store.close();
    await expectEveryOperationClosed(store);

    expect(opens).toHaveLength(1);
    expect(await rawGetAll(factory, META_DB, STORE)).toEqual([{ key: "primary", state: makeState(5) }]);
  });

  it("5-6. close during a pending open: the waiting call rejects Closed, the late success is closed on arrival", async () => {
    const unhandled = collectUnhandledRejections();
    try {
      const factory = idb.createFactory();
      const control = controlOpens(factory);
      const store = new IndexedDbMetaProgressionPersistence(factory);

      const waiting = store.loadState().then(
        () => "resolved",
        (error: unknown) => error,
      );
      await flushMicrotasks();
      expect(control.requests).toHaveLength(1);

      await store.close(); // never waits for the outstanding request
      expect(await waiting).toBeInstanceOf(PersistenceClosedError);
      expect(store.getCloseState()).toBe("closed-pending-open");

      const late = await control.realConnection();
      control.requests[0]!.succeed(late);

      expect(isClosedConnection(late)).toBe(true); // orphan retired immediately
      expect(store.getCloseState()).toBe("closed");
      await expectEveryOperationClosed(store);
      expect(control.spy).toHaveBeenCalledTimes(1); // never reopened

      await nextMacrotask();
      expect(unhandled.seen).toEqual([]);
    } finally {
      unhandled.stop();
    }
  });

  it("6b. a late open failure after close also ends in closed, with no unhandled rejection", async () => {
    const unhandled = collectUnhandledRejections();
    try {
      const factory = idb.createFactory();
      const control = controlOpens(factory);
      const store = new IndexedDbMetaProgressionPersistence(factory);
      const waiting = store.saveState(makeState()).catch((error: unknown) => error);
      await flushMicrotasks();

      await store.close();
      expect(store.getCloseState()).toBe("closed-pending-open");
      control.requests[0]!.fail(new DOMException("disk gone", "UnknownError"));

      expect(store.getCloseState()).toBe("closed");
      expect(await waiting).toBeInstanceOf(PersistenceClosedError);
      await nextMacrotask();
      expect(unhandled.seen).toEqual([]);
    } finally {
      unhandled.stop();
    }
  });

  it("7. close while the upgrade is blocked returns at once; the blocked request never hangs close()", async () => {
    const factory = idb.createFactory();
    const control = controlOpens(factory);
    const store = new IndexedDbMetaProgressionPersistence(factory);
    const waiting = store.loadState().catch((error: unknown) => error);
    await flushMicrotasks();
    control.requests[0]!.block(); // another tab holds the database

    await store.close(); // resolves without the request settling

    expect(await waiting).toBeInstanceOf(PersistenceClosedError); // Closed, not a later Blocked
    expect(store.getCloseState()).toBe("closed-pending-open");

    // Waiting past the grace period changes nothing: the retired handle never reports Blocked.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(store.getCloseState()).toBe("closed-pending-open");

    const late = await control.realConnection();
    control.requests[0]!.succeed(late);
    expect(isClosedConnection(late)).toBe(true);
    expect(store.getCloseState()).toBe("closed");
  });
});

// ---------------------------------------------------------------------------
describe("connection failure handling (active instance)", () => {
  it("7b. a blocked upgrade rejects callers with BLOCKED after the grace period while one request stays in flight", async () => {
    const factory = idb.createFactory();
    const control = controlOpens(factory);
    const store = new IndexedDbMetaProgressionPersistence(factory);

    const first = store.loadState().catch((error: unknown) => error);
    await flushMicrotasks();
    control.requests[0]!.block();
    const error = await first;
    expect(error).toBeInstanceOf(PersistenceUpgradeBlockedError);
    expect((error as PersistenceUpgradeBlockedError).reason).toBe(PersistenceUpgradeFailureReason.BLOCKED);

    // While still blocked, a second caller is refused immediately - no second request.
    await expect(store.loadState()).rejects.toBeInstanceOf(PersistenceUpgradeBlockedError);
    expect(control.spy).toHaveBeenCalledTimes(1);

    // The other tab closes: the SAME request completes and becomes the connection.
    control.requests[0]!.succeed(await control.realConnection());
    expect(await store.loadState()).toBeNull();
    expect(control.spy).toHaveBeenCalledTimes(1);
    await store.close();
  });

  it("8. versionchange closes the active connection and the next call reopens", async () => {
    const factory = idb.createFactory();
    const opens = watchOpens(factory);
    const store = idb.track(new IndexedDbMetaProgressionPersistence(factory));
    await store.saveState(makeState(4));

    const onBlocked = vi.fn();
    await new Promise<void>((resolve, reject) => {
      const request = factory.deleteDatabase(META_DB);
      request.onblocked = onBlocked;
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    expect(onBlocked).not.toHaveBeenCalled(); // our connection got out of the way

    expect(await store.loadState()).toBeNull(); // a fresh database, reopened on demand
    expect(opens).toHaveLength(2);
    expect(store.getCloseState()).toBe("open");
  });

  it("9. an unexpectedly closed connection is forgotten, never reused", async () => {
    const factory = idb.createFactory();
    const opens = watchOpens(factory);
    const store = idb.track(new IndexedDbMetaProgressionPersistence(factory));
    await store.saveState(makeState(6));

    // The browser closed the connection abnormally (e.g. storage cleared).
    const connection = opens[0]!.result;
    connection.close();
    connection.onclose?.call(connection, new Event("close"));

    expect(await store.loadState()).toEqual(makeState(6));
    expect(opens).toHaveLength(2);
  });

  it("A. a failed open is not cached: the next call of an active instance opens again", async () => {
    const factory = idb.createFactory();
    const control = controlOpens(factory);
    const store = new IndexedDbMetaProgressionPersistence(factory);

    const failing = store.loadState().catch((error: unknown) => error);
    await flushMicrotasks();
    const failure = new DOMException("transient", "UnknownError");
    control.requests[0]!.fail(failure);
    expect(await failing).toBe(failure); // original error preserved

    const second = store.loadState();
    await flushMicrotasks();
    expect(control.requests).toHaveLength(2);
    control.requests[1]!.succeed(await control.realConnection());
    expect(await second).toBeNull();
    await store.close();
  });

  it("10. a synchronous open throw keeps the original error and does not poison the instance", async () => {
    const { factory, failure, open } = throwingFactory();
    const store = idb.track(new IndexedDbMetaProgressionPersistence(factory));

    await expect(store.loadState()).rejects.toBe(failure);
    expect(store.getCloseState()).toBe("open");

    open.mockRestore(); // storage becomes available again
    await store.saveState(makeState(2));
    expect(await store.loadState()).toEqual(makeState(2));
  });

  it("10b. close racing a synchronous open throw reports closed, with no phantom pending open", async () => {
    const unhandled = collectUnhandledRejections();
    try {
      const { factory, failure, open } = throwingFactory();
      const store = new IndexedDbMetaProgressionPersistence(factory);

      const operation = store.loadState().catch((error: unknown) => error);
      void store.close();

      expect(store.getCloseState()).toBe("closed");
      expect(await operation).toBe(failure);
      await Promise.all([store.close(), store.close()]);
      await expectEveryOperationClosed(store);
      expect(open).toHaveBeenCalledTimes(1);
      await nextMacrotask();
      expect(unhandled.seen).toEqual([]);
    } finally {
      unhandled.stop();
    }
  });

  it("11. close with a transaction already started: the transaction settles normally and is durable", async () => {
    const factory = idb.createFactory();
    const opens = watchOpens(factory);
    const store = new IndexedDbMetaProgressionPersistence(factory);
    await store.loadState();

    onNextTransaction(opens[0]!.result, () => {
      void store.close();
    });
    await expect(store.saveState(makeState(11))).resolves.toBeUndefined();

    expect(store.getCloseState()).toBe("closed");
    await expectEveryOperationClosed(store);
    expect(await rawGetAll(factory, META_DB, STORE)).toEqual([{ key: "primary", state: makeState(11) }]);
  });

  it("11b. close between open and transaction start: no transaction begins", async () => {
    const factory = idb.createFactory();
    const opens = watchOpens(factory);
    const store = new IndexedDbMetaProgressionPersistence(factory);
    await store.saveState(makeState(1));

    const prototype = Object.getPrototypeOf(opens[0]!.result) as IDBDatabase;
    const transaction = vi.spyOn(prototype, "transaction");
    const saving = store.saveState(makeState(99));
    void store.close(); // same tick: the save is still awaiting its connection

    await expect(saving).rejects.toBeInstanceOf(PersistenceClosedError);
    expect(transaction).not.toHaveBeenCalled();
    transaction.mockRestore();
    expect(await rawGetAll(factory, META_DB, STORE)).toEqual([{ key: "primary", state: makeState(1) }]);
  });
});

// ---------------------------------------------------------------------------
describe("failure policy", () => {
  it("12. closed errors never trigger a memory fallback (explicit Resilient wrapper included)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const factory = idb.createFactory();
    const resilient = new ResilientMetaProgressionPersistence(new IndexedDbMetaProgressionPersistence(factory));
    await resilient.saveState(makeState(3));

    const inFlight = resilient.loadState();
    await resilient.close();

    await inFlight.catch(() => undefined); // real result or Closed, either way no failover
    expect(resilient.getCloseState()).toBe("closed");
    await expectEveryOperationClosed(resilient);
    expect(resilient.kind).toBe("indexeddb");
    expect(warn).not.toHaveBeenCalled();
  });

  it("12b. the browser composition no longer wraps IndexedDB in a silent failover", () => {
    vi.stubGlobal("indexedDB", idb.createFactory());
    const store = createBrowserMetaProgressionPersistence(accountScope("acct-A"));
    expect(store).toBeInstanceOf(IndexedDbMetaProgressionPersistence);
    expect(store).not.toBeInstanceOf(ResilientMetaProgressionPersistence);
  });

  it("13. a stored schema newer than this build stays fail-closed: no memory, no upgrade, no downgrade", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const factory = idb.createFactory();
    await createNewerMetaDatabase(factory, 3);
    vi.stubGlobal("indexedDB", factory);
    const store = createBrowserMetaProgressionPersistence();

    for (let call = 0; call < 2; call += 1) {
      const error = await store.loadState().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(PersistenceUpgradeBlockedError);
      expect((error as PersistenceUpgradeBlockedError).reason).toBe(
        PersistenceUpgradeFailureReason.VERSION_NEWER_THAN_CODE,
      );
    }
    await expect(store.saveState(makeState())).rejects.toBeInstanceOf(PersistenceUpgradeBlockedError);

    expect(store.kind).toBe("indexeddb");
    expect(warn).not.toHaveBeenCalled();
    expect(await rawLayout(factory, META_DB)).toEqual({ version: 3, stores: [] });
    await store.close();
    expect(store.getCloseState()).toBe("closed");
  });

  it("14. a missing progression store is unreadable storage: fail-closed, and no store is created", async () => {
    const factory = idb.createFactory();
    (await openRawConnection(factory, META_DB, 1)).close(); // v1 database WITHOUT the store
    const store = idb.track(new IndexedDbMetaProgressionPersistence(factory));

    for (const operation of [() => store.loadState(), () => store.saveState(makeState()), () => store.clear()]) {
      const error = await operation().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(MetaProgressionStateUnreadableError);
      expect((error as MetaProgressionStateUnreadableError).reason).toBe(
        MetaProgressionStateUnreadableReason.MISSING_STORE,
      );
    }
    expect(await rawLayout(factory, META_DB)).toEqual({ version: 1, stores: [] });
  });

  it("14b. malformed stored state fails engine initialization and is never overwritten by reconciliation", async () => {
    const factory = idb.createFactory();
    const seed = new IndexedDbMetaProgressionPersistence(factory);
    await seed.loadState(); // create the database
    await seed.close();
    const corrupted = { key: "primary", state: { ...makeState(20), builtRobotPartIds: ["warp_drive"] } };
    await rawPut(factory, META_DB, STORE, corrupted);

    const persistence = idb.track(new IndexedDbMetaProgressionPersistence(factory));
    const save = vi.spyOn(persistence, "saveState");
    const engine = new MetaProgressionEngine(persistence, () => new Date("2026-10-03T12:00:00.000Z"));

    await expect(engine.initialize()).rejects.toBeInstanceOf(MetaProgressionStateUnreadableError);
    await expect(engine.reconcileAttempts([makeAttempt("attempt.1")])).rejects.toBeInstanceOf(
      MetaProgressionStateUnreadableError,
    );
    expect(engine.getSnapshot().ready).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(await rawGetAll(factory, META_DB, STORE)).toEqual([corrupted]);
  });

  it("15. ordinary unavailable storage (open throws) fails closed through the browser composition", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { factory, failure } = throwingFactory(new DOMException("The operation failed.", "UnknownError"));
    vi.stubGlobal("indexedDB", factory);
    const engine = new MetaProgressionEngine(createBrowserMetaProgressionPersistence());

    await expect(engine.initialize()).rejects.toBe(failure);
    expect(engine.getPersistenceKind()).toBe("indexeddb");
    expect(engine.getSnapshot().ready).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  // R1 reversed the M3 behavior (explicit memory store without an IndexedDB API):
  // the browser factory never selects volatile rewards, even then.
  it("15b. without any IndexedDB API the browser store is unavailable, never memory, and fails lazily", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const store = createBrowserMetaProgressionPersistence(GUEST_SCOPE); // constructing never throws
    expect(store).not.toBeInstanceOf(MemoryMetaProgressionPersistence);
    expect(store.kind).toBe("indexeddb");

    for (const [name, operation] of everyOperation(store)) {
      await expect(operation(), name).rejects.toBeInstanceOf(MetaProgressionStorageUnavailableError);
    }
    const engine = new MetaProgressionEngine(store);
    await expect(engine.initialize()).rejects.toBeInstanceOf(MetaProgressionStorageUnavailableError);
    await expect(engine.recordAttempt(makeAttempt("attempt.1"))).rejects.toBeInstanceOf(
      MetaProgressionStorageUnavailableError,
    );
    expect(engine.getSnapshot().ready).toBe(false);

    await Promise.all([store.close(), store.close()]);
    expect(store.getCloseState()).toBe("closed");
    await expectEveryOperationClosed(store);
  });
});

// ---------------------------------------------------------------------------
describe("engine: failed writes never claim durable success", () => {
  const NOW = () => new Date("2026-10-03T12:00:00.000Z");

  /** Aborts the class's next transaction after its request was issued (a real write failure). */
  function abortNextWrite(database: IDBDatabase) {
    onNextTransaction(database, (transaction) => queueMicrotask(() => transaction.abort()));
  }

  async function openEngine(factory: IDBFactory) {
    const opens = watchOpens(factory);
    const persistence = idb.track(new IndexedDbMetaProgressionPersistence(factory));
    const engine = new MetaProgressionEngine(persistence, NOW);
    await engine.initialize();
    return { engine, persistence, connection: () => opens[opens.length - 1]!.result };
  }

  it("16. a failed reward write rejects, is not published, is rolled back, and is not written later by another save", async () => {
    const factory = idb.createFactory();
    const { engine, connection } = await openEngine(factory);
    const before = engine.getSnapshot();
    const listener = vi.fn();
    engine.subscribe(listener);

    abortNextWrite(connection());
    await expect(engine.recordAttempt(makeAttempt("attempt.lost"))).rejects.toBeInstanceOf(Error);

    expect(engine.getSnapshot()).toBe(before); // nothing published
    expect(listener).not.toHaveBeenCalled();
    expect(engine.getRewardGrantsForAttempt("attempt.lost")).toEqual([]); // rolled back
    expect(await rawGetAll(factory, META_DB, STORE)).toEqual([]);

    // An unrelated later save must not carry the failed change to storage.
    await engine.recordAttempt(makeAttempt("attempt.ok", { activityId: "activity.other" }));
    const stored = (await rawGetAll(factory, META_DB, STORE)) as Array<{ state: MetaProgressionState }>;
    expect(stored[0]!.state.processedAttemptIds).toEqual(["attempt.ok"]);

    // The failed attempt is not "already processed": recording it again grants it exactly once.
    await engine.recordAttempt(makeAttempt("attempt.lost"));
    expect(engine.getRewardGrantsForAttempt("attempt.lost").length).toBeGreaterThan(0);
    const again = engine.getSnapshot().inventory;
    await engine.recordAttempt(makeAttempt("attempt.lost"));
    expect(engine.getSnapshot().inventory).toEqual(again);
  });

  it("16b. a failed workshop write keeps inventory and the part unbuilt", async () => {
    const factory = idb.createFactory();
    const seed = new IndexedDbMetaProgressionPersistence(factory);
    await seed.saveState({
      ...createEmptyMetaProgressionState(),
      inventory: { metal_plate: 26, circuit_board: 14, energy_cell: 2 },
    });
    await seed.close();
    const { engine, connection } = await openEngine(factory);
    const part = STARTER_ROBOT_BLUEPRINT.parts[0]!;

    abortNextWrite(connection());
    await expect(engine.buildRobotPart(part.id)).rejects.toBeInstanceOf(Error);
    expect(engine.getSnapshot().builtRobotPartIds).toEqual([]);
    expect(engine.getSnapshot().inventory).toEqual({ metal_plate: 26, circuit_board: 14, energy_cell: 2 });

    // Not ALREADY_BUILT: the failed build left no trace, so it can be retried.
    expect(await engine.buildRobotPart(part.id)).toEqual({ ok: true });
    const stored = (await rawGetAll(factory, META_DB, STORE)) as Array<{ state: MetaProgressionState }>;
    expect(stored[0]!.state.builtRobotPartIds).toEqual([part.id]);
  });

  it("16c. a write rejected because the store was closed is rolled back the same way", async () => {
    const factory = idb.createFactory();
    const { engine, persistence } = await openEngine(factory);
    await persistence.close();

    await expect(engine.recordAttempt(makeAttempt("attempt.after-close"))).rejects.toBeInstanceOf(
      PersistenceClosedError,
    );
    expect(engine.getRewardGrantsForAttempt("attempt.after-close")).toEqual([]);
    expect(engine.getSnapshot().inventory).toEqual(createEmptyMetaProgressionState().inventory);
  });

  it("16d. a write whose request cannot even be issued rejects with no unhandled rejection", async () => {
    const unhandled = collectUnhandledRejections();
    try {
      const factory = idb.createFactory();
      const { engine, connection } = await openEngine(factory);
      // Aborted synchronously: issuing put() itself throws.
      onNextTransaction(connection(), (transaction) => transaction.abort());

      await expect(engine.recordAttempt(makeAttempt("attempt.sync-fail"))).rejects.toBeInstanceOf(Error);
      expect(engine.getRewardGrantsForAttempt("attempt.sync-fail")).toEqual([]);
      expect(await rawGetAll(factory, META_DB, STORE)).toEqual([]);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled.seen).toEqual([]);
    } finally {
      unhandled.stop();
    }
  });

  it("17. reward and workshop state survive close and reopen unchanged", async () => {
    const factory = idb.createFactory();
    const { engine, persistence } = await openEngine(factory);
    await engine.recordAttempt(makeAttempt("attempt.1"));
    const before = engine.getSnapshot();
    const storedBefore = await rawGetAll(factory, META_DB, STORE);

    await persistence.close();

    const reopened = new MetaProgressionEngine(idb.track(new IndexedDbMetaProgressionPersistence(factory)), NOW);
    await reopened.reconcileAttempts([makeAttempt("attempt.1")]);
    expect(reopened.getSnapshot().inventory).toEqual(before.inventory);
    expect(reopened.getSnapshot().recentRewards).toEqual(before.recentRewards);
    expect(await rawGetAll(factory, META_DB, STORE)).toEqual(storedBefore);
  });
});

// ---------------------------------------------------------------------------
describe("MemoryMetaProgressionPersistence.close()", () => {
  it("19. rejects every operation after close, is idempotent and reports closed", async () => {
    const store = new MemoryMetaProgressionPersistence();
    await store.saveState(makeState());
    expect(store.getCloseState()).toBe("open");

    await Promise.all([store.close(), store.close()]);

    expect(store.getCloseState()).toBe("closed");
    await expectEveryOperationClosed(store);
  });

  it("19b. the explicit Resilient wrapper closes both stores and stays closed after a failover", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { factory } = throwingFactory(new Error("storage unavailable"));
    const resilient = new ResilientMetaProgressionPersistence(new IndexedDbMetaProgressionPersistence(factory));
    expect(await resilient.loadState()).toBeNull(); // explicit opt-in failover, visible as kind memory
    expect(resilient.kind).toBe("memory");
    expect(warn).toHaveBeenCalledTimes(1);

    await resilient.close();
    expect(resilient.getCloseState()).toBe("closed");
    await expectEveryOperationClosed(resilient);
  });
});

describe("scope identity", () => {
  it("closing one scope's store leaves Guest and another account usable and untouched", async () => {
    const factory = idb.createFactory();
    const guest = idb.track(new IndexedDbMetaProgressionPersistence(factory));
    const a = new IndexedDbMetaProgressionPersistence(factory, accountScope("acct-A"));
    const b = idb.track(new IndexedDbMetaProgressionPersistence(factory, accountScope("acct-B")));
    await guest.saveState(makeState(1));
    await a.saveState(makeState(2));
    await b.saveState(makeState(3));

    await a.close();

    expect(a.databaseName).toBe(resolveScopedDatabaseName(META_DB, accountScope("acct-A")));
    await expect(a.loadState()).rejects.toBeInstanceOf(PersistenceClosedError);
    expect(await guest.loadState()).toEqual(makeState(1));
    expect(await b.loadState()).toEqual(makeState(3));
    expect(await rawGetAll(factory, a.databaseName, STORE)).toEqual([{ key: "primary", state: makeState(2) }]);
  });
});
