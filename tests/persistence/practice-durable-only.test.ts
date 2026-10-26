import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AttemptRecordSchema,
  Difficulty,
  LearningStage,
  type AttemptRecord,
} from "../../src/core/domain";
import {
  GUEST_DATABASE_BASE_NAMES,
  IndexedDbLearningPersistence,
  PracticePackRequiresDurableStorageError,
  ResilientLearningPersistence,
  UnavailablePracticePersistence,
  createBrowserLearningPersistence,
  createBrowserPracticePersistence,
  type PracticePackRecord,
} from "../../src/core/persistence";
import { createFlakyIndexedDb } from "./flaky-indexeddb";
import { rawGetAll } from "./indexeddb-test-utils";

/**
 * PHASE-05-M7-R1 - practice data is durable-only. The CS116 factory keeps its
 * memory-failover behavior; the practice factory must never produce data that
 * lives only in RAM.
 */

function makeAttempt(id = "attempt.1"): AttemptRecord {
  return AttemptRecordSchema.parse({
    id,
    activityId: "practice:mini.pack:ex-one",
    missionTemplateId: "practice.template:mini.pack:ex-one",
    missionTemplateVersion: 1,
    seed: "seed",
    difficulty: Difficulty.EASY,
    conceptIds: ["practice.concept:mini.pack"],
    learningStage: LearningStage.INDEPENDENT,
    startedAt: "2026-10-20T00:59:00.000Z",
    submittedAt: "2026-10-20T00:59:30.000Z",
    passed: true,
    submissionIndex: 1,
    runCountBeforeSubmit: 0,
    hintsUsed: [],
    runtimeErrorCount: 0,
  });
}

const DRAFT = { activityId: "practice:mini.pack:ex-one", code: "answer = 1\n", hintsUsed: [], updatedAt: "2026-10-20T01:00:00.000Z" } as never;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function flakyGlobal() {
  const factory = new IDBFactory();
  const flaky = createFlakyIndexedDb(factory);
  vi.stubGlobal("indexedDB", flaky.factory);
  return { factory, flaky };
}

describe("createBrowserPracticePersistence - durable only", () => {
  it("is plain IndexedDB persistence: a failed write is an error, never a silent memory fallback", async () => {
    const { factory, flaky } = flakyGlobal();
    const store = createBrowserPracticePersistence();
    try {
      expect(store).toBeInstanceOf(IndexedDbLearningPersistence);
      expect(store).not.toBeInstanceOf(ResilientLearningPersistence);
      await store.addAttempt(makeAttempt("attempt.durable"));
      expect(store.kind).toBe("indexeddb");

      flaky.failStores("attempts");
      await expect(store.addAttempt(makeAttempt("attempt.lost"))).rejects.toBeDefined();
      await expect(store.getAttempts()).rejects.toBeDefined(); // an unreadable store is not an empty one
      expect(store.kind).toBe("indexeddb"); // it did not flip to a volatile store

      flaky.failStores("missionDrafts");
      await expect(store.saveMissionDraft(DRAFT)).rejects.toBeDefined();
      await expect(store.getMissionDraft("practice:mini.pack:ex-one" as never)).rejects.toBeDefined();
      expect(store.kind).toBe("indexeddb");
      expect(flaky.refused()).toBeGreaterThan(0);

      flaky.heal();
      // The failed writes are NOT visible anywhere, not even in this same instance.
      expect((await store.getAttempts()).map((attempt) => attempt.id)).toEqual(["attempt.durable"]);
      expect(await store.getMissionDraft("practice:mini.pack:ex-one" as never)).toBeNull();
      expect(await rawGetAll(factory, GUEST_DATABASE_BASE_NAMES.practice, "missionDrafts")).toEqual([]);
    } finally {
      await store.close();
    }
  });

  it("an installed pack is neither removed nor replaced when attempts or drafts fail", async () => {
    const { flaky } = flakyGlobal();
    const store = createBrowserPracticePersistence();
    const record: PracticePackRecord = {
      packId: "mini.pack",
      packVersion: "1.0.0",
      contentHash: "a".repeat(64),
      installedAt: "2026-10-20T00:00:00.000Z",
      document: { format: "python-learn-game.exercise-pack", schemaVersion: 1, pack: { id: "mini.pack" } },
    } as never;
    try {
      expect((await store.installPracticePackIfAbsent(record)).status).toBe("installed");
      flaky.failStores("attempts", "missionDrafts");
      await expect(store.addAttempt(makeAttempt())).rejects.toBeDefined();
      expect((await store.getPracticePack("mini.pack"))?.contentHash).toBe("a".repeat(64));
      expect((await store.listPracticePacks()).records.map((entry) => entry.packId)).toEqual(["mini.pack"]);
    } finally {
      await store.close();
    }
  });

  it("without IndexedDB every practice operation is refused with the durable-storage error", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const store = createBrowserPracticePersistence();
    expect(store).toBeInstanceOf(UnavailablePracticePersistence);
    expect(store.kind).toBe("memory");

    const refusals: Array<[string, () => Promise<unknown>]> = [
      ["addAttempt", () => store.addAttempt(makeAttempt())],
      ["addAttemptIfAbsent", () => store.addAttemptIfAbsent(makeAttempt())],
      ["importAttemptIfAbsent", () => store.importAttemptIfAbsent(makeAttempt(), {} as never)],
      ["getAttempts", () => store.getAttempts()],
      ["getRewardEligibleAttemptsSnapshot", () => store.getRewardEligibleAttemptsSnapshot()],
      ["clearAttempts", () => store.clearAttempts()],
      ["getMissionDraft", () => store.getMissionDraft("practice:mini.pack:ex-one" as never)],
      ["saveMissionDraft", () => store.saveMissionDraft(DRAFT)],
      ["deleteMissionDraft", () => store.deleteMissionDraft("practice:mini.pack:ex-one" as never)],
      ["clearMissionDrafts", () => store.clearMissionDrafts()],
      ["clearAll", () => store.clearAll()],
      ["getPracticePack", () => store.getPracticePack("mini.pack")],
      ["listPracticePacks", () => store.listPracticePacks()],
      ["installPracticePackIfAbsent", () => store.installPracticePackIfAbsent({} as never)],
    ];
    for (const [name, call] of refusals) {
      await expect(call(), name).rejects.toBeInstanceOf(PracticePackRequiresDurableStorageError);
    }
    await store.close();
    await store.close(); // idempotent
    expect(store.getCloseState()).toBe("closed");
  });
});

describe("CS116 persistence is unchanged by R1", () => {
  it("createBrowserLearningPersistence is still the resilient store and still falls back to memory", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { flaky } = flakyGlobal();
    const store = createBrowserLearningPersistence();
    try {
      expect(store).toBeInstanceOf(ResilientLearningPersistence);
      await store.addAttempt(makeAttempt("attempt.cs116.a"));
      expect(store.kind).toBe("indexeddb");

      flaky.failStores("attempts");
      await store.addAttempt(makeAttempt("attempt.cs116.b")); // CS116 behavior: succeeds in memory
      expect(store.kind).toBe("memory");
      expect((await store.getAttempts()).map((attempt) => attempt.id)).toContain("attempt.cs116.b");
    } finally {
      await store.close();
    }
  });

  it("without IndexedDB CS116 still runs on memory", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("indexedDB", undefined);
    const store = createBrowserLearningPersistence();
    try {
      await store.addAttempt(makeAttempt("attempt.cs116.memory"));
      expect(store.kind).toBe("memory");
      expect((await store.getAttempts()).map((attempt) => attempt.id)).toEqual(["attempt.cs116.memory"]);
    } finally {
      await store.close();
    }
  });

  it("the learning database stays at version 2 and the practice database at version 3", async () => {
    const factory = new IDBFactory();
    vi.stubGlobal("indexedDB", factory);
    const learning = createBrowserLearningPersistence();
    const practice = createBrowserPracticePersistence();
    try {
      await learning.addAttempt(makeAttempt("attempt.v"));
      await practice.getAttempts();
      const versions = Object.fromEntries((await factory.databases()).map((database) => [database.name, database.version]));
      expect(versions[GUEST_DATABASE_BASE_NAMES.learning]).toBe(2);
      expect(versions[GUEST_DATABASE_BASE_NAMES.practice]).toBe(3);
    } finally {
      await learning.close();
      await practice.close();
    }
  });
});
