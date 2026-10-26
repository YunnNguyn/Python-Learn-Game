import { afterEach, describe, expect, it, vi } from "vitest";

import { AttemptRecordSchema, Difficulty, HintLevel, LearningStage, type LearningActivityId } from "../../src/core/domain";
import {
  GUEST_DATABASE_BASE_NAMES,
  IndexedDbLearningPersistence,
  InvalidPracticePackRecordError,
  MAX_INSTALLED_PRACTICE_PACKS,
  MemoryLearningPersistence,
  PersistenceClosedError,
  PersistenceUpgradeBlockedError,
  PracticePackRequiresDurableStorageError,
  PracticePackStoreNotSupportedError,
  ResilientLearningPersistence,
  accountScope,
  createBrowserPracticePersistence,
  type LearningPersistence,
  type PracticePackRecord,
} from "../../src/core/persistence";
import { openRawConnection, rawDescribeSchema, rawGetAll, rawPut, seedLearningV1Database, useIsolatedIndexedDb } from "./indexeddb-test-utils";

/**
 * PHASE-05-M7: the `practicePacks` store. Installed Exercise Packs are durable
 * CONTENT in the practice database family only; progress stores are independent.
 */

const LEARNING = "python-learn-game";
const PRACTICE = "python-learn-game-practice";
const PACKS = "practicePacks";
const PRACTICE_OPTIONS = { databaseBaseName: GUEST_DATABASE_BASE_NAMES.practice } as const;

const hash = (digit: string) => digit.repeat(64);

function makeRecord(packId = "pack.one", overrides: Partial<PracticePackRecord> = {}): PracticePackRecord {
  return {
    packId,
    packVersion: "1.0.0",
    contentHash: hash("a"),
    installedAt: "2026-10-20T01:00:00.000Z",
    document: { format: "python-learn-game.exercise-pack", schemaVersion: 1, pack: { id: packId } },
    ...overrides,
  };
}

function makeAttempt(id: string) {
  return AttemptRecordSchema.parse({
    id,
    activityId: "practice:pack.one:ex",
    missionTemplateId: "practice.template:pack.one:ex",
    missionTemplateVersion: 1,
    seed: "practice:pack.one:ex:r1",
    difficulty: Difficulty.EASY,
    conceptIds: ["practice.concept:pack.one"],
    learningStage: LearningStage.INDEPENDENT,
    startedAt: "2026-10-20T01:00:00.000Z",
    submittedAt: "2026-10-20T01:01:00.000Z",
    passed: true,
    submissionIndex: 1,
    runCountBeforeSubmit: 0,
    hintsUsed: [HintLevel.H1],
    runtimeErrorCount: 0,
  });
}

const draft = {
  activityId: "practice:pack.one:ex" as LearningActivityId,
  seed: "practice:pack.one:ex:r1",
  variantIndex: 0,
  code: "x = 1\n",
  hintsUsed: [],
  updatedAt: "2026-10-20T01:02:00.000Z",
};

async function databaseNames(factory: IDBFactory): Promise<string[]> {
  return (await factory.databases()).map((info) => info.name ?? "").sort();
}

describe("practicePacks store", () => {
  const idb = useIsolatedIndexedDb();
  afterEach(() => vi.restoreAllMocks());

  function practiceStore(factory = idb.createFactory(), scope?: Parameters<typeof accountScope>[0]) {
    const instance = idb.track(
      new IndexedDbLearningPersistence(factory, scope === undefined ? undefined : accountScope(scope), PRACTICE_OPTIONS),
    );
    return { factory, store: instance };
  }

  describe("schema ownership and upgrade", () => {
    it("creates the store (keyPath packId, no indexes) with a fresh practice database at v3", async () => {
      const { factory, store } = practiceStore();
      expect(await store.listPracticePacks()).toEqual({ records: [], unreadableCount: 0 });
      const schema = await rawDescribeSchema(factory, PRACTICE);
      expect(schema.version).toBe(3);
      expect(schema.stores[PACKS]).toEqual({ keyPath: "packId", indexes: {} });
      expect(Object.keys(schema.stores).sort()).toEqual(["attemptProvenance", "attempts", "missionDrafts", PACKS]);
    });

    /** Exactly what M7.0 code created for the practice family: the v2 layout at version 2. */
    async function seedPracticeV2(factory: IDBFactory, rows: { attempts: unknown[]; drafts: unknown[] }): Promise<void> {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(PRACTICE, 2);
        request.onupgradeneeded = () => {
          const created = request.result;
          const attempts = created.createObjectStore("attempts", { keyPath: "id" });
          attempts.createIndex("activityId", "activityId", { unique: false });
          attempts.createIndex("submittedAt", "submittedAt", { unique: false });
          attempts.createIndex("conceptIds", "conceptIds", { unique: false, multiEntry: true });
          created.createObjectStore("missionDrafts", { keyPath: "activityId" });
          created.createObjectStore("attemptProvenance", { keyPath: "attemptId" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(["attempts", "missionDrafts"], "readwrite");
        for (const row of rows.attempts) transaction.objectStore("attempts").put(row);
        for (const row of rows.drafts) transaction.objectStore("missionDrafts").put(row);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    }

    it("upgrades a practice database left at v2 by M7.0 in place, keeping every row", async () => {
      const factory = idb.createFactory();
      await seedPracticeV2(factory, { attempts: [makeAttempt("attempt.kept")], drafts: [draft] });
      expect((await rawDescribeSchema(factory, PRACTICE)).version).toBe(2);
      expect(await rawDescribeSchema(factory, PRACTICE).then((s) => Object.keys(s.stores).sort())).toEqual([
        "attemptProvenance",
        "attempts",
        "missionDrafts",
      ]);

      const { store } = practiceStore(factory);
      expect(await store.installPracticePackIfAbsent(makeRecord())).toEqual({ status: "installed" });

      const schema = await rawDescribeSchema(factory, PRACTICE);
      expect(schema.version).toBe(3);
      expect(schema.stores).toHaveProperty(PACKS);
      expect(schema.stores).toHaveProperty("attemptProvenance");
      expect((await store.getAttempts()).map((attempt) => attempt.id)).toEqual(["attempt.kept"]);
      expect((await store.getMissionDraft(draft.activityId))?.code).toBe("x = 1\n");
    });

    it("upgrades a v1 practice database straight to v3", async () => {
      const factory = idb.createFactory();
      await seedLearningV1Database(factory, PRACTICE, { attempts: [makeAttempt("attempt.kept")], drafts: [draft] });
      expect((await rawDescribeSchema(factory, PRACTICE)).version).toBe(1);

      const { store } = practiceStore(factory);
      expect(await store.installPracticePackIfAbsent(makeRecord())).toEqual({ status: "installed" });
      const schema = await rawDescribeSchema(factory, PRACTICE);
      expect(schema.version).toBe(3);
      expect(Object.keys(schema.stores).sort()).toEqual(["attemptProvenance", "attempts", "missionDrafts", PACKS]);
      expect((await store.getAttempts()).map((attempt) => attempt.id)).toEqual(["attempt.kept"]);
    });

    it("never gives the learning database a practicePacks store, and leaves it at v2", async () => {
      const factory = idb.createFactory();
      const learning = idb.track(new IndexedDbLearningPersistence(factory));
      await learning.addAttempt(makeAttempt("attempt.cs116"));
      const schema = await rawDescribeSchema(factory, LEARNING);
      expect(schema.version).toBe(2);
      expect(Object.keys(schema.stores).sort()).toEqual(["attemptProvenance", "attempts", "missionDrafts"]);
      expect(await databaseNames(factory)).toEqual([LEARNING]);
    });

    it("refuses pack operations on a learning instance without opening any database", async () => {
      const factory = idb.createFactory();
      const learning = idb.track(new IndexedDbLearningPersistence(factory));
      await expect(learning.installPracticePackIfAbsent(makeRecord())).rejects.toBeInstanceOf(PracticePackStoreNotSupportedError);
      await expect(learning.getPracticePack("pack.one")).rejects.toBeInstanceOf(PracticePackStoreNotSupportedError);
      await expect(learning.listPracticePacks()).rejects.toBeInstanceOf(PracticePackStoreNotSupportedError);
      expect(await databaseNames(factory)).toEqual([]);
    });

    it("reopens an existing v3 database without touching it", async () => {
      const factory = idb.createFactory();
      const first = practiceStore(factory).store;
      await first.installPracticePackIfAbsent(makeRecord());
      await first.close();
      const second = practiceStore(factory).store;
      expect((await second.listPracticePacks()).records.map((record) => record.packId)).toEqual(["pack.one"]);
      expect((await rawDescribeSchema(factory, PRACTICE)).version).toBe(3);
    });
  });

  describe("upgrade blocked by an old tab", () => {
    it("is reported as PersistenceUpgradeBlockedError (never a memory install), then completes once the tab closes", async () => {
      const factory = idb.createFactory();
      await seedLearningV1Database(factory, PRACTICE, { attempts: [makeAttempt("attempt.kept")] });
      const blocker = await openRawConnection(factory, PRACTICE); // an old tab: ignores versionchange
      const { store } = practiceStore(factory);
      try {
        await expect(store.installPracticePackIfAbsent(makeRecord())).rejects.toBeInstanceOf(PersistenceUpgradeBlockedError);
        await expect(store.listPracticePacks()).rejects.toBeInstanceOf(PersistenceUpgradeBlockedError);
      } finally {
        blocker.close();
      }
      let result: unknown = null;
      for (let round = 0; round < 200 && result === null; round++) {
        try {
          result = await store.installPracticePackIfAbsent(makeRecord());
        } catch (error) {
          if (!(error instanceof PersistenceUpgradeBlockedError)) throw error;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
      expect(result).toEqual({ status: "installed" });
      expect((await store.getAttempts()).map((attempt) => attempt.id)).toEqual(["attempt.kept"]);
    });
  });

  describe("install", () => {
    it("stores a pack durably and reads it back, also from a new instance (reload)", async () => {
      const factory = idb.createFactory();
      const { store } = practiceStore(factory);
      const record = makeRecord();
      expect(await store.installPracticePackIfAbsent(record)).toEqual({ status: "installed" });
      expect(await store.getPracticePack("pack.one")).toEqual(record);
      expect(await rawGetAll(factory, PRACTICE, PACKS)).toEqual([record]);

      await store.close();
      const reloaded = practiceStore(factory).store;
      expect(await reloaded.getPracticePack("pack.one")).toEqual(record);
      expect(await reloaded.getPracticePack("missing")).toBeNull();
    });

    it("lists packs oldest installation first, then by id", async () => {
      const { store } = practiceStore();
      await store.installPracticePackIfAbsent(makeRecord("b.pack", { installedAt: "2026-10-20T02:00:00.000Z" }));
      await store.installPracticePackIfAbsent(makeRecord("c.pack", { installedAt: "2026-10-20T01:00:00.000Z" }));
      await store.installPracticePackIfAbsent(makeRecord("a.pack", { installedAt: "2026-10-20T01:00:00.000Z" }));
      expect((await store.listPracticePacks()).records.map((record) => record.packId)).toEqual(["a.pack", "c.pack", "b.pack"]);
    });

    it("treats identical content as already installed and changes nothing", async () => {
      const factory = idb.createFactory();
      const { store } = practiceStore(factory);
      await store.installPracticePackIfAbsent(makeRecord());
      const before = await rawGetAll(factory, PRACTICE, PACKS);
      const again = await store.installPracticePackIfAbsent(makeRecord("pack.one", { installedAt: "2030-01-01T00:00:00.000Z" }));
      expect(again).toEqual({ status: "already-installed" });
      expect(await rawGetAll(factory, PRACTICE, PACKS)).toEqual(before);
    });

    it("never overwrites: different content under the same id is a conflict", async () => {
      const factory = idb.createFactory();
      const { store } = practiceStore(factory);
      await store.installPracticePackIfAbsent(makeRecord());
      const before = await rawGetAll(factory, PRACTICE, PACKS);
      const result = await store.installPracticePackIfAbsent(
        makeRecord("pack.one", { packVersion: "2.0.0", contentHash: hash("b"), document: { changed: true } }),
      );
      expect(result).toEqual({ status: "conflict", existingPackVersion: "1.0.0", existingContentHash: hash("a") });
      expect(await rawGetAll(factory, PRACTICE, PACKS)).toEqual(before);
    });

    it("reports a conflict (not an overwrite) when the stored row is unreadable", async () => {
      const factory = idb.createFactory();
      const { store } = practiceStore(factory);
      await store.listPracticePacks(); // create the database
      await rawPut(factory, PRACTICE, PACKS, { packId: "pack.one", garbage: true });
      const result = await store.installPracticePackIfAbsent(makeRecord());
      expect(result).toEqual({ status: "conflict", existingPackVersion: null, existingContentHash: null });
      expect(await rawGetAll(factory, PRACTICE, PACKS)).toEqual([{ packId: "pack.one", garbage: true }]);
    });

    it("clones the record: later mutation of the caller's object cannot change what was stored", async () => {
      const { store } = practiceStore();
      const record = makeRecord();
      await store.installPracticePackIfAbsent(record);
      (record.document as { mutated?: boolean }).mutated = true;
      expect((await store.getPracticePack("pack.one"))?.document).not.toHaveProperty("mutated");
    });
  });

  describe("validation before any storage access", () => {
    const bad: Array<[string, Partial<PracticePackRecord> | Record<string, unknown>]> = [
      ["an empty pack id", { packId: "" }],
      ["a short content hash", { contentHash: "abc" }],
      ["an upper-case content hash", { contentHash: "A".repeat(64) }],
      ["a bad timestamp", { installedAt: "yesterday" }],
      ["an empty version", { packVersion: "" }],
      ["a non-JSON document", { document: { f: () => 1 } as never }],
      ["an unknown field", { extra: 1 }],
    ];

    it.each(bad)("rejects %s and opens no database", async (_label, overrides) => {
      const factory = idb.createFactory();
      const { store } = practiceStore(factory);
      await expect(store.installPracticePackIfAbsent({ ...makeRecord(), ...overrides } as PracticePackRecord)).rejects.toBeInstanceOf(
        InvalidPracticePackRecordError,
      );
      expect(await databaseNames(factory)).toEqual([]);
    });
  });

  describe("atomicity", () => {
    it("commits nothing when the install transaction aborts, and stays usable", async () => {
      const { factory, store } = practiceStore();
      await store.listPracticePacks();
      const database = await (store as unknown as { handle: { database: Promise<IDBDatabase> } }).handle.database;
      const original = database.transaction.bind(database);
      vi.spyOn(database, "transaction").mockImplementation((names, mode) => {
        const transaction = original(names, mode);
        queueMicrotask(() => transaction.abort());
        return transaction;
      });

      await expect(store.installPracticePackIfAbsent(makeRecord())).rejects.toThrow();
      expect(await rawGetAll(factory, PRACTICE, PACKS)).toEqual([]);

      vi.restoreAllMocks();
      expect(await store.installPracticePackIfAbsent(makeRecord())).toEqual({ status: "installed" });
      expect((await store.listPracticePacks()).records).toHaveLength(1);
    });

    it("a rejected install never leaves a partial pack for the same id", async () => {
      const { factory, store } = practiceStore();
      await expect(store.installPracticePackIfAbsent(makeRecord("pack.one", { contentHash: "nope" }))).rejects.toBeInstanceOf(
        InvalidPracticePackRecordError,
      );
      expect(await databaseNames(factory)).toEqual([]);
    });
  });

  describe("concurrency", () => {
    it("10 concurrent identical installs on one instance -> exactly one installed", async () => {
      const { factory, store } = practiceStore();
      const results = await Promise.all(Array.from({ length: 10 }, () => store.installPracticePackIfAbsent(makeRecord())));
      expect(results.filter((result) => result.status === "installed")).toHaveLength(1);
      expect(results.filter((result) => result.status === "already-installed")).toHaveLength(9);
      expect(await rawGetAll(factory, PRACTICE, PACKS)).toHaveLength(1);
    });

    it("concurrent installs with different content for one id -> one winner, the rest conflict, the winner is intact", async () => {
      const { factory, store } = practiceStore();
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          store.installPracticePackIfAbsent(makeRecord("pack.one", { contentHash: hash(String(index)), document: { n: index } })),
        ),
      );
      expect(results.filter((result) => result.status === "installed")).toHaveLength(1);
      expect(results.filter((result) => result.status === "conflict")).toHaveLength(7);
      const rows = (await rawGetAll(factory, PRACTICE, PACKS)) as PracticePackRecord[];
      expect(rows).toHaveLength(1);
      const winner = results.findIndex((result) => result.status === "installed");
      expect(rows[0]!.contentHash).toBe(hash(String(winner)));
      expect(rows[0]!.document).toEqual({ n: winner });
    });

    it("two instances on one database (two tabs) cannot double-install", async () => {
      const factory = idb.createFactory();
      const tabA = practiceStore(factory).store;
      const tabB = practiceStore(factory).store;
      const results = await Promise.all([
        ...Array.from({ length: 5 }, () => tabA.installPracticePackIfAbsent(makeRecord())),
        ...Array.from({ length: 5 }, () => tabB.installPracticePackIfAbsent(makeRecord())),
      ]);
      expect(results.filter((result) => result.status === "installed")).toHaveLength(1);
      expect(await rawGetAll(factory, PRACTICE, PACKS)).toHaveLength(1);
    });

    it("installs of distinct packs in parallel all succeed", async () => {
      const { store } = practiceStore();
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, index) => store.installPracticePackIfAbsent(makeRecord(`pack.n${index}`))),
      );
      expect(results.every((result) => result.status === "installed")).toBe(true);
      expect((await store.listPracticePacks()).records).toHaveLength(6);
    });
  });

  describe("pack limit", () => {
    it(`stops at ${MAX_INSTALLED_PRACTICE_PACKS} packs without storing the extra one`, async () => {
      const { store } = practiceStore();
      for (let index = 0; index < MAX_INSTALLED_PRACTICE_PACKS; index++) {
        expect(await store.installPracticePackIfAbsent(makeRecord(`pack.n${index}`))).toEqual({ status: "installed" });
      }
      expect(await store.installPracticePackIfAbsent(makeRecord("pack.extra"))).toEqual({
        status: "limit-reached",
        limit: MAX_INSTALLED_PRACTICE_PACKS,
      });
      expect(await store.getPracticePack("pack.extra")).toBeNull();
      // An already installed pack is still reported as such at the limit.
      expect(await store.installPracticePackIfAbsent(makeRecord("pack.n3"))).toEqual({ status: "already-installed" });
    });

    it("cannot be overshot by concurrent installs", async () => {
      const { factory, store } = practiceStore();
      const results = await Promise.all(
        Array.from({ length: MAX_INSTALLED_PRACTICE_PACKS + 8 }, (_, index) => store.installPracticePackIfAbsent(makeRecord(`pack.n${index}`))),
      );
      expect(results.filter((result) => result.status === "installed")).toHaveLength(MAX_INSTALLED_PRACTICE_PACKS);
      expect(results.filter((result) => result.status === "limit-reached")).toHaveLength(8);
      expect(await rawGetAll(factory, PRACTICE, PACKS)).toHaveLength(MAX_INSTALLED_PRACTICE_PACKS);
    });
  });

  describe("reads", () => {
    it("lists readable rows and counts (never repairs or deletes) unreadable ones", async () => {
      const { factory, store } = practiceStore();
      await store.installPracticePackIfAbsent(makeRecord());
      await rawPut(factory, PRACTICE, PACKS, { packId: "pack.broken", nope: 1 });
      expect(await store.listPracticePacks()).toEqual({ records: [makeRecord()], unreadableCount: 1 });
      expect(await rawGetAll(factory, PRACTICE, PACKS)).toHaveLength(2);
    });

    it("rejects with InvalidPracticePackRecordError when asked for an unreadable row", async () => {
      const { factory, store } = practiceStore();
      await store.listPracticePacks();
      await rawPut(factory, PRACTICE, PACKS, { packId: "pack.broken", nope: 1 });
      await expect(store.getPracticePack("pack.broken")).rejects.toBeInstanceOf(InvalidPracticePackRecordError);
    });
  });

  describe("scope isolation", () => {
    it("keeps packs of guest and each account in separate databases", async () => {
      const factory = idb.createFactory();
      const guest = practiceStore(factory).store;
      const accountA = practiceStore(factory, "acct-A").store;
      const accountB = practiceStore(factory, "acct-B").store;
      await guest.installPracticePackIfAbsent(makeRecord("guest.pack"));
      await accountA.installPracticePackIfAbsent(makeRecord("a.pack"));

      expect((await guest.listPracticePacks()).records.map((r) => r.packId)).toEqual(["guest.pack"]);
      expect((await accountA.listPracticePacks()).records.map((r) => r.packId)).toEqual(["a.pack"]);
      expect((await accountB.listPracticePacks()).records).toEqual([]);
      // The same pack id in another scope is a separate, independent install.
      expect(await accountB.installPracticePackIfAbsent(makeRecord("a.pack", { contentHash: hash("c") }))).toEqual({ status: "installed" });
      expect(await databaseNames(factory)).toEqual(
        [PRACTICE, `${PRACTICE}:account:acct-A`, `${PRACTICE}:account:acct-B`].sort(),
      );
    });
  });

  describe("independence from progress", () => {
    it("clearAll, clearAttempts and clearMissionDrafts never delete packs", async () => {
      const { store } = practiceStore();
      await store.installPracticePackIfAbsent(makeRecord());
      await store.addAttempt(makeAttempt("attempt.1"));
      await store.saveMissionDraft(draft);

      await store.clearMissionDrafts();
      await store.clearAttempts();
      await store.addAttempt(makeAttempt("attempt.2"));
      await store.saveMissionDraft(draft);
      await store.clearAll();

      expect(await store.getAttempts()).toEqual([]);
      expect(await store.getMissionDraft(draft.activityId)).toBeNull();
      expect((await store.listPracticePacks()).records.map((record) => record.packId)).toEqual(["pack.one"]);
    });

    it("installing a pack does not create or change attempts or drafts", async () => {
      const { factory, store } = practiceStore();
      await store.installPracticePackIfAbsent(makeRecord());
      expect(await rawGetAll(factory, PRACTICE, "attempts")).toEqual([]);
      expect(await rawGetAll(factory, PRACTICE, "missionDrafts")).toEqual([]);
    });
  });

  describe("close", () => {
    it("rejects every pack operation with PersistenceClosedError after close()", async () => {
      const { store } = practiceStore();
      await store.installPracticePackIfAbsent(makeRecord());
      await store.close();
      await expect(store.installPracticePackIfAbsent(makeRecord("pack.two"))).rejects.toBeInstanceOf(PersistenceClosedError);
      await expect(store.getPracticePack("pack.one")).rejects.toBeInstanceOf(PersistenceClosedError);
      await expect(store.listPracticePacks()).rejects.toBeInstanceOf(PersistenceClosedError);
    });
  });
});

describe("memory and resilient wrappers", () => {
  const idb = useIsolatedIndexedDb();
  afterEach(() => vi.restoreAllMocks());

  it("memory persistence refuses to install and to read packs (fail closed)", async () => {
    const memory = new MemoryLearningPersistence();
    await expect(memory.installPracticePackIfAbsent(makeRecord())).rejects.toBeInstanceOf(PracticePackRequiresDurableStorageError);
    await expect(memory.getPracticePack("pack.one")).rejects.toBeInstanceOf(PracticePackRequiresDurableStorageError);
    await expect(memory.listPracticePacks()).rejects.toBeInstanceOf(PracticePackRequiresDurableStorageError);
    await memory.close();
    await expect(memory.listPracticePacks()).rejects.toBeInstanceOf(PersistenceClosedError);
  });

  it("resilient persistence passes pack operations to the primary", async () => {
    const factory = idb.createFactory();
    const primary = idb.track(new IndexedDbLearningPersistence(factory, undefined, PRACTICE_OPTIONS));
    const resilient = new ResilientLearningPersistence(primary);
    expect(await resilient.installPracticePackIfAbsent(makeRecord())).toEqual({ status: "installed" });
    expect((await resilient.listPracticePacks()).records).toHaveLength(1);
    expect((await resilient.getPracticePack("pack.one"))?.packId).toBe("pack.one");
    await resilient.close();
    await expect(resilient.listPracticePacks()).rejects.toBeInstanceOf(PersistenceClosedError);
  });

  it("a primary failure is PracticePackRequiresDurableStorageError with the cause - never memory, never failover", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const factory = idb.createFactory();
    const primary = idb.track(new IndexedDbLearningPersistence(factory, undefined, PRACTICE_OPTIONS));
    const resilient = new ResilientLearningPersistence(primary);
    const outage = new Error("disk on fire");
    vi.spyOn(primary, "installPracticePackIfAbsent").mockRejectedValue(outage);
    vi.spyOn(primary, "listPracticePacks").mockRejectedValue(outage);

    const installError = await resilient.installPracticePackIfAbsent(makeRecord()).then(() => null, (e: unknown) => e);
    expect(installError).toBeInstanceOf(PracticePackRequiresDurableStorageError);
    expect((installError as Error).cause).toBe(outage);
    await expect(resilient.listPracticePacks()).rejects.toBeInstanceOf(PracticePackRequiresDurableStorageError);
    // Pack failures never fail progress over to memory.
    expect(resilient.kind).toBe("indexeddb");
    expect(warn).not.toHaveBeenCalled();
  });

  it("domain errors from the primary pass through unchanged", async () => {
    const factory = idb.createFactory();
    const learning = idb.track(new IndexedDbLearningPersistence(factory)); // no pack store
    const resilient = new ResilientLearningPersistence(learning);
    await expect(resilient.listPracticePacks()).rejects.toBeInstanceOf(PracticePackStoreNotSupportedError);
    await expect(resilient.installPracticePackIfAbsent({ ...makeRecord(), packId: "" })).rejects.toBeInstanceOf(
      PracticePackStoreNotSupportedError,
    );
  });

  it("a primary without any pack store is a durable-storage error", async () => {
    const bare = new MemoryLearningPersistence() as unknown as LearningPersistence;
    const withoutPackMethods = Object.assign(Object.create(null), {
      kind: "memory",
      close: () => Promise.resolve(),
      getCloseState: () => "open",
    }) as LearningPersistence;
    expect(bare.kind).toBe("memory");
    const resilient = new ResilientLearningPersistence(withoutPackMethods);
    await expect(resilient.listPracticePacks()).rejects.toBeInstanceOf(PracticePackRequiresDurableStorageError);
  });

  it("after a progress failover, installed packs are still read from the durable primary", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const factory = idb.createFactory();
    const primary = idb.track(new IndexedDbLearningPersistence(factory, undefined, PRACTICE_OPTIONS));
    const resilient = new ResilientLearningPersistence(primary);
    await resilient.installPracticePackIfAbsent(makeRecord());
    vi.spyOn(primary, "getAttempts").mockRejectedValue(new Error("attempts store broke"));
    await resilient.getAttempts(); // fails over to memory for progress
    expect(resilient.kind).toBe("memory");
    expect((await resilient.listPracticePacks()).records.map((record) => record.packId)).toEqual(["pack.one"]);
  });

  describe("createBrowserPracticePersistence", () => {
    it("opens the practice database of the requested scope and stores packs there", async () => {
      const factory = idb.createFactory();
      vi.stubGlobal("indexedDB", factory);
      try {
        const guest = createBrowserPracticePersistence();
        const account = createBrowserPracticePersistence(accountScope("acct-A"));
        // Practice data is durable-only: no memory-failover wrapper.
        expect(guest).toBeInstanceOf(IndexedDbLearningPersistence);
        expect(guest).not.toBeInstanceOf(ResilientLearningPersistence);
        await guest.installPracticePackIfAbsent(makeRecord());
        await account.installPracticePackIfAbsent(makeRecord("a.pack"));
        expect(await databaseNames(factory)).toEqual([PRACTICE, `${PRACTICE}:account:acct-A`].sort());
        expect((await account.listPracticePacks()).records.map((record) => record.packId)).toEqual(["a.pack"]);
        await guest.close();
        await account.close();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("without IndexedDB the store is memory and pack operations are refused", async () => {
      vi.stubGlobal("indexedDB", undefined);
      try {
        const store = createBrowserPracticePersistence();
        expect(store.kind).toBe("memory");
        await expect(store.installPracticePackIfAbsent(makeRecord())).rejects.toBeInstanceOf(PracticePackRequiresDurableStorageError);
        await expect(store.listPracticePacks()).rejects.toBeInstanceOf(PracticePackRequiresDurableStorageError);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
