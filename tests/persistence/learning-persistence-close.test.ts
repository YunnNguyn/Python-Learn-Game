import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AttemptRecordSchema,
  Difficulty,
  HintLevel,
  LearningStage,
  type AttemptRecord,
  type LearningActivityId,
} from "../../src/core/domain";
import {
  GUEST_SCOPE,
  IndexedDbLearningPersistence,
  MemoryLearningPersistence,
  PersistenceClosedError,
  PersistenceDomainError,
  PersistenceUpgradeBlockedError,
  PersistenceUpgradeFailureReason,
  ResilientLearningPersistence,
  accountScope,
  resolveScopedDatabaseName,
  type LearningPersistence,
  type MissionDraftRecord,
  type PersistenceScope,
} from "../../src/core/persistence";
import {
  openRawConnection,
  rawDescribeSchema,
  rawGetAll,
  seedLearningV1Database,
  useIsolatedIndexedDb,
} from "./indexeddb-test-utils";

/**
 * PHASE-04C.3D.3 (M2) - learning persistence close contract.
 *
 * Interleavings are driven by deferred promises and by the open requests the
 * test captures; the only real waits are the existing 250ms blocked-upgrade
 * grace period, and one macrotask turn after an IndexedDB event so that the
 * class's own handler (same dispatch) has run.
 */

const GUEST_DB = "python-learn-game";
const PROVENANCE = "attemptProvenance";

const idb = useIsolatedIndexedDb();

afterEach(() => {
  vi.restoreAllMocks();
});

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

const DRAFT: MissionDraftRecord = {
  activityId: "activity.test" as LearningActivityId,
  seed: "seed",
  variantIndex: 0,
  code: "x = 1",
  hintsUsed: [],
  updatedAt: "2026-10-03T12:01:00.000Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Every public operation of the contract, with valid arguments. */
function everyOperation(store: LearningPersistence): ReadonlyArray<readonly [string, () => Promise<unknown>]> {
  return [
    ["addAttempt", () => store.addAttempt(makeAttempt("attempt.after-close"))],
    ["addAttemptIfAbsent", () => store.addAttemptIfAbsent(makeAttempt("attempt.after-close"))],
    ["importAttemptIfAbsent", () => store.importAttemptIfAbsent(makeAttempt("attempt.after-close"), "cloud-import")],
    ["getAttempts", () => store.getAttempts()],
    ["getRewardEligibleAttemptsSnapshot", () => store.getRewardEligibleAttemptsSnapshot()],
    ["clearAttempts", () => store.clearAttempts()],
    ["getMissionDraft", () => store.getMissionDraft(DRAFT.activityId)],
    ["saveMissionDraft", () => store.saveMissionDraft(DRAFT)],
    ["deleteMissionDraft", () => store.deleteMissionDraft(DRAFT.activityId)],
    ["clearMissionDrafts", () => store.clearMissionDrafts()],
    ["clearAll", () => store.clearAll()],
  ];
}

async function expectEveryOperationClosed(store: LearningPersistence): Promise<void> {
  for (const [name, operation] of everyOperation(store)) {
    const error = await operation().then(
      () => new Error(`${name} resolved after close`),
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(PersistenceClosedError);
    expect(error).toBeInstanceOf(PersistenceDomainError);
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
 * Settles once `request` has fired success/error AND the persistence class's
 * own handler for that same event has run (one macrotask after the dispatch).
 */
function afterSettled(request: IDBOpenDBRequest): Promise<void> {
  return new Promise((resolve) => {
    const done = () => setTimeout(resolve, 0);
    if (request.readyState === "done") {
      done();
      return;
    }
    request.addEventListener("success", done, { once: true });
    request.addEventListener("error", done, { once: true });
  });
}

/** A connection whose close() was called refuses new transactions (InvalidStateError). */
function isClosedConnection(database: IDBDatabase): boolean {
  try {
    database.transaction("attempts", "readonly");
    return false;
  } catch (error) {
    return (error as { name?: string }).name === "InvalidStateError";
  }
}

/**
 * Runs `onStarted` synchronously right after the class has started its next
 * IndexedDB transaction (i.e. after `transaction()` returned, before requests
 * complete): the exact "close while a transaction is in flight" interleaving.
 */
function onNextTransaction(database: IDBDatabase, onStarted: () => void) {
  const prototype = Object.getPrototypeOf(database) as IDBDatabase;
  const original = prototype.transaction;
  const spy = vi
    .spyOn(prototype, "transaction")
    .mockImplementation(function (this: IDBDatabase, ...args: Parameters<IDBDatabase["transaction"]>) {
      spy.mockRestore();
      const transaction = original.apply(this, args);
      onStarted();
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

/** A LearningPersistence whose every method is controlled by the test. */
function controlledPrimary(overrides: Partial<LearningPersistence> = {}) {
  const unused = () => Promise.reject(new Error("not used by this test"));
  let closeCalls = 0;
  const primary: LearningPersistence = {
    kind: "indexeddb",
    addAttempt: unused,
    addAttemptIfAbsent: unused,
    importAttemptIfAbsent: unused,
    getAttempts: unused,
    getRewardEligibleAttemptsSnapshot: unused,
    clearAttempts: unused,
    getMissionDraft: unused,
    saveMissionDraft: unused,
    deleteMissionDraft: unused,
    clearMissionDrafts: unused,
    clearAll: unused,
    close: () => {
      closeCalls += 1;
      return Promise.resolve();
    },
    getCloseState: () => (closeCalls > 0 ? "closed" : "open"),
    ...overrides,
  };
  return { primary, closeCalls: () => closeCalls };
}

async function blockedByOldTab(factory: IDBFactory, databaseName = GUEST_DB) {
  const legacy = makeAttempt("attempt.legacy");
  await seedLearningV1Database(factory, databaseName, { attempts: [legacy] });
  const blocker = await openRawConnection(factory, databaseName);
  expect(blocker.version).toBe(1);
  return { legacy, blocker };
}

// ---------------------------------------------------------------------------
describe("IndexedDbLearningPersistence.close()", () => {
  it("1. close before the first open never opens IndexedDB", async () => {
    const factory = idb.createFactory();
    const opens = watchOpens(factory);
    const store = new IndexedDbLearningPersistence(factory);

    await store.close();

    expect(store.getCloseState()).toBe("closed");
    await expect(store.getAttempts()).rejects.toBeInstanceOf(PersistenceClosedError);
    expect(opens).toHaveLength(0);
    expect(await factory.databases()).toEqual([]);
  });

  it("2. close after a successful open closes the connection and leaves the data intact", async () => {
    const factory = idb.createFactory();
    const opens = watchOpens(factory);
    const store = new IndexedDbLearningPersistence(factory);
    await store.addAttempt(makeAttempt("attempt.1"));
    await store.saveMissionDraft(DRAFT);
    expect(store.getCloseState()).toBe("open");

    await store.close();

    expect(store.getCloseState()).toBe("closed");
    expect(opens).toHaveLength(1);
    expect(isClosedConnection(opens[0]!.result)).toBe(true);
    const fresh = idb.track(new IndexedDbLearningPersistence(factory));
    expect((await fresh.getAttempts()).map((attempt) => String(attempt.id))).toEqual(["attempt.1"]);
    expect((await fresh.getMissionDraft(DRAFT.activityId))?.code).toBe("x = 1");
  });

  it("3. second and third close are safe and never reopen", async () => {
    const factory = idb.createFactory();
    const opens = watchOpens(factory);
    const store = new IndexedDbLearningPersistence(factory);
    await store.getAttempts();

    await Promise.all([store.close(), store.close()]);
    await store.close();

    expect(store.getCloseState()).toBe("closed");
    expect(opens).toHaveLength(1);
  });

  it("4. every public operation rejects with PersistenceClosedError (a domain error) after close", async () => {
    const factory = idb.createFactory();
    const opens = watchOpens(factory);
    const store = new IndexedDbLearningPersistence(factory);
    await store.addAttempt(makeAttempt("attempt.1"));

    await store.close();
    await expectEveryOperationClosed(store);

    expect(opens).toHaveLength(1);
    const fresh = idb.track(new IndexedDbLearningPersistence(factory));
    expect((await fresh.getAttempts()).map((attempt) => String(attempt.id))).toEqual(["attempt.1"]);
  });

  it("5. close during a pending open: the waiting call rejects Closed and the late connection is closed on arrival", async () => {
    const unhandled = collectUnhandledRejections();
    try {
      const factory = idb.createFactory();
      const opens = watchOpens(factory);
      const store = new IndexedDbLearningPersistence(factory);

      const waiting = store.getAttempts();
      expect(opens).toHaveLength(1);
      expect(opens[0]!.readyState).toBe("pending");
      const closing = store.close();
      expect(store.getCloseState()).toBe("closed-pending-open");

      await expect(waiting).rejects.toBeInstanceOf(PersistenceClosedError);
      await closing;
      await afterSettled(opens[0]!);

      expect(store.getCloseState()).toBe("closed");
      expect(isClosedConnection(opens[0]!.result)).toBe(true);
      await expect(store.getAttempts()).rejects.toBeInstanceOf(PersistenceClosedError);
      expect(opens).toHaveLength(1);
      expect(unhandled.seen).toEqual([]);
    } finally {
      unhandled.stop();
    }
  });

  it("6-7. close during a blocked upgrade resolves without waiting; the late upgrade's connection is retired", async () => {
    const unhandled = collectUnhandledRejections();
    const factory = idb.createFactory();
    const { legacy, blocker } = await blockedByOldTab(factory);
    try {
      const opens = watchOpens(factory);
      const store = new IndexedDbLearningPersistence(factory);
      await expect(store.getAttempts()).rejects.toBeInstanceOf(PersistenceUpgradeBlockedError);

      await store.close(); // must not wait for the blocking tab
      expect(store.getCloseState()).toBe("closed-pending-open");
      await expectEveryOperationClosed(store);

      blocker.close(); // the old tab goes away; the queued upgrade now runs
      await afterSettled(opens[0]!);

      expect(store.getCloseState()).toBe("closed");
      expect(isClosedConnection(opens[0]!.result)).toBe(true);
      expect(opens).toHaveLength(1);
      // The upgrade requested BEFORE close completes as it would have (additive);
      // the retirement itself touches no data.
      expect((await rawDescribeSchema(factory, GUEST_DB)).version).toBe(2);
      expect(await rawGetAll(factory, GUEST_DB, "attempts")).toEqual([legacy]);
      expect(await rawGetAll(factory, GUEST_DB, PROVENANCE)).toEqual([]);
      expect(unhandled.seen).toEqual([]);
    } finally {
      blocker.close();
      unhandled.stop();
    }
  });

  it("6b. close while callers are still waiting inside the blocked grace period rejects them with Closed", async () => {
    const factory = idb.createFactory();
    const { blocker } = await blockedByOldTab(factory);
    try {
      const store = new IndexedDbLearningPersistence(factory);
      const waiting = store.getAttempts(); // not yet told BLOCKED (250ms grace)

      await store.close();

      await expect(waiting).rejects.toBeInstanceOf(PersistenceClosedError);
      expect(store.getCloseState()).toBe("closed-pending-open");
    } finally {
      blocker.close();
    }
  });

  it("8. a retired instance never reopens, even after a versionchange or a delete", async () => {
    const factory = idb.createFactory();
    const opens = watchOpens(factory);
    const store = new IndexedDbLearningPersistence(factory);
    await store.getAttempts();
    await store.close();

    const onBlocked = vi.fn();
    await new Promise<void>((resolve, reject) => {
      const request = factory.deleteDatabase(GUEST_DB);
      request.onblocked = onBlocked;
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    await expectEveryOperationClosed(store);
    expect(onBlocked).not.toHaveBeenCalled();
    expect(opens).toHaveLength(1);
  });

  it("9. an already-started read transaction settles with its real result", async () => {
    const factory = idb.createFactory();
    const opens = watchOpens(factory);
    const store = new IndexedDbLearningPersistence(factory);
    await store.addAttempt(makeAttempt("attempt.local"));
    await store.importAttemptIfAbsent(makeAttempt("attempt.imported", { submittedAt: "2026-10-03T12:05:00.000Z" }), "cloud-import");
    const database = opens[0]!.result;

    onNextTransaction(database, () => void store.close());
    const attempts = await store.getAttempts();
    expect(attempts.map((attempt) => String(attempt.id))).toEqual(["attempt.local", "attempt.imported"]);
    expect(store.getCloseState()).toBe("closed");
    expect(isClosedConnection(database)).toBe(true);
  });

  it("9b. an already-started reward snapshot still excludes imported attempts (no unfiltered or untrusted result)", async () => {
    const factory = idb.createFactory();
    const opens = watchOpens(factory);
    const store = new IndexedDbLearningPersistence(factory);
    await store.addAttempt(makeAttempt("attempt.local"));
    await store.importAttemptIfAbsent(makeAttempt("attempt.imported"), "guest-copy");
    const database = opens[0]!.result;

    onNextTransaction(database, () => void store.close());
    const eligible = await store.getRewardEligibleAttemptsSnapshot();

    expect(eligible.map((attempt) => String(attempt.id))).toEqual(["attempt.local"]);
    await expect(store.getRewardEligibleAttemptsSnapshot()).rejects.toBeInstanceOf(PersistenceClosedError);
  });
});

// ---------------------------------------------------------------------------
describe("ResilientLearningPersistence.close()", () => {
  it("10. an already-started write commits to IndexedDB and is not redirected to memory", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const factory = idb.createFactory();
    const opens = watchOpens(factory);
    const resilient = new ResilientLearningPersistence(new IndexedDbLearningPersistence(factory));
    await resilient.addAttempt(makeAttempt("attempt.1"));
    const memoryAdd = vi.spyOn(MemoryLearningPersistence.prototype, "addAttempt");

    onNextTransaction(opens[0]!.result, () => void resilient.close());
    await resilient.addAttempt(makeAttempt("attempt.2"));

    expect(resilient.kind).toBe("indexeddb");
    expect(resilient.getCloseState()).toBe("closed");
    expect(memoryAdd).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    const fresh = idb.track(new IndexedDbLearningPersistence(factory));
    expect((await fresh.getAttempts()).map((attempt) => String(attempt.id))).toEqual(["attempt.1", "attempt.2"]);
  });

  it("10b. a write still waiting for its connection rejects Closed and is stored nowhere", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const factory = idb.createFactory();
    const resilient = new ResilientLearningPersistence(new IndexedDbLearningPersistence(factory));
    const memoryAdd = vi.spyOn(MemoryLearningPersistence.prototype, "addAttempt");

    const write = resilient.addAttempt(makeAttempt("attempt.never"));
    await resilient.close();

    await expect(write).rejects.toBeInstanceOf(PersistenceClosedError);
    expect(resilient.kind).toBe("indexeddb");
    expect(memoryAdd).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    const fresh = idb.track(new IndexedDbLearningPersistence(factory));
    expect(await fresh.getAttempts()).toEqual([]);
  });

  it("11. rejects PersistenceClosedError on every operation without failing over or warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const factory = idb.createFactory();
    const primary = new IndexedDbLearningPersistence(factory);
    const resilient = new ResilientLearningPersistence(primary);
    await resilient.getAttempts();

    await resilient.close();

    await expectEveryOperationClosed(resilient);
    expect(resilient.kind).toBe("indexeddb");
    expect(primary.getCloseState()).toBe("closed");
    expect(warn).not.toHaveBeenCalled();
  });

  it("11b. a primary that reports PersistenceClosedError never causes failover", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { primary } = controlledPrimary({
      getAttempts: () => Promise.reject(new PersistenceClosedError()),
    });
    const resilient = new ResilientLearningPersistence(primary);

    await expect(resilient.getAttempts()).rejects.toBeInstanceOf(PersistenceClosedError);
    expect(resilient.kind).toBe("indexeddb");
    expect(warn).not.toHaveBeenCalled();
  });

  it("12. close racing a primary rejection reports the real error and never writes to the fallback", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const write = deferred<void>();
    const { primary, closeCalls } = controlledPrimary({ addAttempt: () => write.promise });
    const resilient = new ResilientLearningPersistence(primary);
    const memoryAdd = vi.spyOn(MemoryLearningPersistence.prototype, "addAttempt");
    const failure = new Error("disk I/O error");

    const pending = resilient.addAttempt(makeAttempt("attempt.raced"));
    await resilient.close();
    write.reject(failure);

    await expect(pending).rejects.toBe(failure);
    expect(resilient.kind).toBe("indexeddb");
    expect(memoryAdd).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(closeCalls()).toBe(1);
  });

  it("12b. close racing a primary import failure stays fail-closed (no memory, no success)", async () => {
    const write = deferred<never>();
    const { primary } = controlledPrimary({ importAttemptIfAbsent: () => write.promise });
    const resilient = new ResilientLearningPersistence(primary);
    const memoryImport = vi.spyOn(MemoryLearningPersistence.prototype, "importAttemptIfAbsent");

    const pending = resilient.importAttemptIfAbsent(makeAttempt("attempt.raced"), "cloud-import");
    await resilient.close();
    write.reject(new Error("disk I/O error"));

    const error = await pending.then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(PersistenceDomainError);
    expect(memoryImport).not.toHaveBeenCalled();
  });

  it("13. a Resilient instance already in memory mode closes safely", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { primary, closeCalls } = controlledPrimary({
      addAttempt: () => Promise.reject(new Error("storage unavailable")),
    });
    const resilient = new ResilientLearningPersistence(primary);
    await resilient.addAttempt(makeAttempt("attempt.memory"));
    expect(resilient.kind).toBe("memory");

    await resilient.close();
    await resilient.close();

    expect(closeCalls()).toBe(1);
    expect(resilient.kind).toBe("memory");
    expect(resilient.getCloseState()).toBe("closed");
    await expectEveryOperationClosed(resilient);
  });

  it("13b. reports closed-pending-open while its primary still awaits a late open", async () => {
    const factory = idb.createFactory();
    const { blocker } = await blockedByOldTab(factory);
    try {
      const resilient = new ResilientLearningPersistence(new IndexedDbLearningPersistence(factory));
      await expect(resilient.getAttempts()).rejects.toBeInstanceOf(PersistenceUpgradeBlockedError);

      await resilient.close();

      expect(resilient.getCloseState()).toBe("closed-pending-open");
      expect(resilient.kind).toBe("indexeddb");
    } finally {
      blocker.close();
    }
  });
});

// ---------------------------------------------------------------------------
describe("MemoryLearningPersistence.close()", () => {
  it("14. rejects every operation after close; behaviour before close is unchanged", async () => {
    const store = new MemoryLearningPersistence();
    await store.addAttempt(makeAttempt("attempt.1"));
    await store.saveMissionDraft(DRAFT);
    expect((await store.getAttempts()).map((attempt) => String(attempt.id))).toEqual(["attempt.1"]);
    const clears = [
      vi.spyOn(store, "clearAll"),
      vi.spyOn(store, "clearAttempts"),
      vi.spyOn(store, "clearMissionDrafts"),
    ];

    await store.close();
    await store.close();

    // Closing is not a clear: no clearing method ran as a side effect.
    for (const clear of clears) expect(clear).not.toHaveBeenCalled();
    expect(store.getCloseState()).toBe("closed");
    for (const clear of clears) clear.mockRestore();
    await expectEveryOperationClosed(store);
  });
});

// ---------------------------------------------------------------------------
describe("existing invariants are preserved", () => {
  it("15. an ACTIVE instance still closes on versionchange and reopens on demand", async () => {
    const factory = idb.createFactory();
    const opens = watchOpens(factory);
    const store = new IndexedDbLearningPersistence(factory);
    await store.addAttempt(makeAttempt("attempt.1"));

    const onBlocked = vi.fn();
    await new Promise<void>((resolve, reject) => {
      const request = factory.deleteDatabase(GUEST_DB);
      request.onblocked = onBlocked;
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    expect(onBlocked).not.toHaveBeenCalled();

    expect(await store.getAttempts()).toEqual([]); // reopened a fresh database
    expect(opens).toHaveLength(2);
    expect(store.getCloseState()).toBe("open");

    await store.close();
    await expect(store.getAttempts()).rejects.toBeInstanceOf(PersistenceClosedError);
    expect(opens).toHaveLength(2);
  });

  it("16. closing Account A leaves Guest and Account B fully usable and isolated", async () => {
    const factory = idb.createFactory();
    const stores = new Map<string, IndexedDbLearningPersistence>();
    const scopes: ReadonlyArray<readonly [string, PersistenceScope]> = [
      ["guest", GUEST_SCOPE],
      ["a", accountScope("acct-A")],
      ["b", accountScope("acct-B")],
    ];
    for (const [key, scope] of scopes) {
      const store = idb.track(new IndexedDbLearningPersistence(factory, scope));
      stores.set(key, store);
      await store.addAttempt(makeAttempt(`attempt.${key}`));
    }

    await stores.get("a")!.close();

    await expect(stores.get("a")!.getAttempts()).rejects.toBeInstanceOf(PersistenceClosedError);
    await stores.get("b")!.addAttempt(makeAttempt("attempt.b2"));
    expect((await stores.get("b")!.getAttempts()).map((attempt) => String(attempt.id))).toEqual([
      "attempt.b",
      "attempt.b2",
    ]);
    expect((await stores.get("guest")!.getAttempts()).map((attempt) => String(attempt.id))).toEqual([
      "attempt.guest",
    ]);
    const accountA = resolveScopedDatabaseName(GUEST_DB, accountScope("acct-A"));
    expect((await rawGetAll(factory, accountA, "attempts")).length).toBe(1);
  });

  it("17-18. close changes no attempts or provenance; imports and snapshots after close are refused", async () => {
    const factory = idb.createFactory();
    const store = new IndexedDbLearningPersistence(factory);
    await store.addAttempt(makeAttempt("attempt.local"));
    await store.importAttemptIfAbsent(makeAttempt("attempt.imported"), "cloud-import");
    const resilient = new ResilientLearningPersistence(store);

    await resilient.close();

    await expect(
      resilient.importAttemptIfAbsent(makeAttempt("attempt.late-import"), "guest-copy"),
    ).rejects.toBeInstanceOf(PersistenceClosedError);
    await expect(resilient.getRewardEligibleAttemptsSnapshot()).rejects.toBeInstanceOf(PersistenceClosedError);

    expect((await rawGetAll(factory, GUEST_DB, "attempts")).length).toBe(2);
    const provenance = (await rawGetAll(factory, GUEST_DB, PROVENANCE)) as Array<{
      attemptId: string;
      origin: string;
    }>;
    expect(provenance.map((row) => [row.attemptId, row.origin])).toEqual([
      ["attempt.imported", "cloud-import"],
    ]);
    const fresh = idb.track(new IndexedDbLearningPersistence(factory));
    expect((await fresh.getRewardEligibleAttemptsSnapshot()).map((attempt) => String(attempt.id))).toEqual([
      "attempt.local",
    ]);
  });

  it("19. blocked and newer-schema failures stay fail-closed, and closing afterwards is safe", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const factory = idb.createFactory();
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(GUEST_DB, 7);
      request.onupgradeneeded = () => undefined;
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    const resilient = new ResilientLearningPersistence(new IndexedDbLearningPersistence(factory));

    await expect(resilient.getAttempts()).rejects.toMatchObject({
      name: "PersistenceUpgradeBlockedError",
      reason: PersistenceUpgradeFailureReason.VERSION_NEWER_THAN_CODE,
    });
    await resilient.close();

    expect(resilient.getCloseState()).toBe("closed");
    await expect(resilient.getAttempts()).rejects.toBeInstanceOf(PersistenceClosedError);
    expect(resilient.kind).toBe("indexeddb");
    expect(warn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe("close at every microtask boundary of an in-flight operation", () => {
  it("20. yields the real result or PersistenceClosedError - never a storage error, failover or unhandled rejection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const unhandled = collectUnhandledRejections();
    const outcomes = new Set<string>();
    try {
      for (let hops = 0; hops < 40; hops += 1) {
        const factory = idb.createFactory();
        const seed = new IndexedDbLearningPersistence(factory);
        await seed.addAttempt(makeAttempt("attempt.1"));
        await seed.close();

        const resilient = new ResilientLearningPersistence(new IndexedDbLearningPersistence(factory));
        await resilient.getAttempts(); // connection established
        const operation = resilient.getAttempts();
        for (let hop = 0; hop < hops; hop += 1) await Promise.resolve();
        void resilient.close();

        const outcome = await operation.then(
          (attempts) => (attempts.length === 1 ? "result" : "wrong-result"),
          (error: unknown) =>
            error instanceof PersistenceClosedError ? "closed" : `error:${(error as Error).name}`,
        );
        outcomes.add(outcome);
        expect(["result", "closed"]).toContain(outcome);
        expect(resilient.kind).toBe("indexeddb");
      }
      // The sweep really crossed from "closed before the transaction" to "transaction already started".
      expect(outcomes).toEqual(new Set(["closed", "result"]));
      expect(warn).not.toHaveBeenCalled();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled.seen).toEqual([]);
    } finally {
      unhandled.stop();
    }
  });
});


// ---------------------------------------------------------------------------
describe("PHASE-04C.3D.3-R1 - IDBFactory.open() throws synchronously", () => {
  /** A factory whose open() throws before any request exists. Returns the thrown error and the call counter. */
  function throwingFactory() {
    const factory = idb.createFactory();
    const failure = new DOMException("IndexedDB is disabled by policy.", "SecurityError");
    const open = vi.spyOn(factory, "open").mockImplementation(() => {
      throw failure;
    });
    return { factory, failure, open };
  }

  it("21. close() racing the rejection reports closed (no phantom pending open); the racing call keeps the original error", async () => {
    const unhandled = collectUnhandledRejections();
    try {
      const { factory, failure, open } = throwingFactory();
      const store = new IndexedDbLearningPersistence(factory);

      const operation = store.getAttempts().then(
        () => new Error("resolved"),
        (error: unknown) => error,
      );
      void store.close(); // synchronously, before any rejection handler has run

      expect(store.getCloseState()).toBe("closed");
      expect(await operation).toBe(failure); // observed before retirement: not rewritten to Closed
      expect(store.getCloseState()).toBe("closed");

      // Repeated close is safe and never opens anything.
      await Promise.all([store.close(), store.close()]);
      expect(store.getCloseState()).toBe("closed");

      await expectEveryOperationClosed(store);
      expect(open).toHaveBeenCalledTimes(1);

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled.seen).toEqual([]);
    } finally {
      unhandled.stop();
    }
  });

  it("22. close() after the rejection was observed is also closed, and later operations never reach the factory", async () => {
    const { factory, failure, open } = throwingFactory();
    const store = new IndexedDbLearningPersistence(factory);

    await expect(store.getAttempts()).rejects.toBe(failure);
    expect(store.getCloseState()).toBe("open");
    await store.close();

    expect(store.getCloseState()).toBe("closed");
    await expectEveryOperationClosed(store);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("23. every operation, closed immediately after it starts, ends closed with no unhandled rejection", async () => {
    const unhandled = collectUnhandledRejections();
    try {
      for (const [name] of everyOperation(new IndexedDbLearningPersistence(idb.createFactory()))) {
        const { factory, failure } = throwingFactory();
        const store = new IndexedDbLearningPersistence(factory);
        const operation = everyOperation(store).find(([candidate]) => candidate === name)![1]();
        const settled = operation.then(
          () => "resolved",
          (error: unknown) => (error === failure || error instanceof PersistenceClosedError ? "ok" : String(error)),
        );
        void store.close();
        expect(store.getCloseState(), name).toBe("closed");
        expect(await settled, name).toBe("ok");
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled.seen).toEqual([]);
    } finally {
      unhandled.stop();
    }
  });

  it("24. Resilient: close() racing a synchronous open failure stays closed, surfaces the original error and never fails over", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const unhandled = collectUnhandledRejections();
    try {
      const { factory, failure } = throwingFactory();
      const resilient = new ResilientLearningPersistence(new IndexedDbLearningPersistence(factory));

      const operation = resilient.addAttempt(makeAttempt("attempt.race")).then(
        () => new Error("resolved"),
        (error: unknown) => error,
      );
      void resilient.close();

      expect(resilient.getCloseState()).toBe("closed");
      // Closed instance: the original error is rethrown, never replaced by a memory fallback.
      expect(await operation).toBe(failure);
      expect(resilient.kind).toBe("indexeddb");
      await expectEveryOperationClosed(resilient);
      expect(warn).not.toHaveBeenCalled();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled.seen).toEqual([]);
    } finally {
      unhandled.stop();
    }
  });

  it("25. without close(): the bare store rejects with the original error and Resilient still fails over to memory", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const unhandled = collectUnhandledRejections();
    try {
      const { factory, failure } = throwingFactory();

      const bare = new IndexedDbLearningPersistence(factory);
      await expect(bare.getAttempts()).rejects.toBe(failure);
      expect(bare.getCloseState()).toBe("open");

      const resilient = new ResilientLearningPersistence(new IndexedDbLearningPersistence(factory));
      await resilient.addAttempt(makeAttempt("attempt.fallback"));
      expect(resilient.kind).toBe("memory");
      expect(warn).toHaveBeenCalledTimes(1);
      expect((await resilient.getAttempts()).map((attempt) => String(attempt.id))).toEqual(["attempt.fallback"]);

      // Closing after the failover is still clean.
      await resilient.close();
      expect(resilient.getCloseState()).toBe("closed");
      await expectEveryOperationClosed(resilient);

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled.seen).toEqual([]);
    } finally {
      unhandled.stop();
    }
  });
});
