import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AttemptRecordSchema,
  Difficulty,
  HintLevel,
  LearningStage,
  type LearningActivityId,
} from "../../src/core/domain";
import {
  DuplicateAttemptError,
  IndexedDbLearningPersistence,
  InvalidAttemptRecordError,
  MemoryLearningPersistence,
  ResilientLearningPersistence,
  type LearningPersistence,
} from "../../src/core/persistence";
import { useIsolatedIndexedDb } from "./indexeddb-test-utils";

function makeAttempt(id: string, submittedAt: string) {
  return AttemptRecordSchema.parse({
    id,
    activityId: "activity.test",
    missionTemplateId: "template.test",
    missionTemplateVersion: 1,
    seed: "seed",
    difficulty: Difficulty.EASY,
    conceptIds: ["concept.test"],
    learningStage: LearningStage.GUIDED,
    submittedAt,
    passed: true,
    submissionIndex: 1,
    runCountBeforeSubmit: 0,
    hintsUsed: [HintLevel.H1],
    runtimeErrorCount: 0,
  });
}

const A1 = makeAttempt("attempt.1", "2026-10-03T10:00:00.000Z");
const A2 = makeAttempt("attempt.2", "2026-10-03T11:00:00.000Z");
const A3 = makeAttempt("attempt.3", "2026-10-03T12:00:00.000Z");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ResilientLearningPersistence over IndexedDB", () => {
  const idb = useIsolatedIndexedDb();

  function create() {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const factory = idb.createFactory();
    const primary = idb.track(new IndexedDbLearningPersistence(factory));
    const resilient = new ResilientLearningPersistence(primary);
    return { factory, primary, resilient };
  }

  it("uses IndexedDB on the happy path and data is visible to a fresh primary", async () => {
    const { factory, resilient } = create();
    await resilient.addAttempt(A1);
    await resilient.saveMissionDraft({
      activityId: "activity.test" as LearningActivityId,
      seed: "seed",
      variantIndex: 0,
      code: "x = 1",
      hintsUsed: [],
      updatedAt: "2026-10-03T12:01:00.000Z",
    });
    expect(resilient.kind).toBe("indexeddb");

    const fresh = idb.track(new IndexedDbLearningPersistence(factory));
    expect(await fresh.getAttempts()).toEqual([A1]);
    expect((await fresh.getMissionDraft("activity.test" as LearningActivityId))?.code).toBe("x = 1");
  });

  it("falls back to memory when the primary store is genuinely unavailable (intended design)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const unavailable: LearningPersistence = {
      kind: "indexeddb",
      addAttempt: () => Promise.reject(new Error("storage unavailable")),
      addAttemptIfAbsent: () => Promise.reject(new Error("storage unavailable")),
      importAttemptIfAbsent: () => Promise.reject(new Error("storage unavailable")),
      getAttempts: () => Promise.reject(new Error("storage unavailable")),
      getRewardEligibleAttemptsSnapshot: () => Promise.reject(new Error("storage unavailable")),
      clearAttempts: () => Promise.reject(new Error("storage unavailable")),
      getMissionDraft: () => Promise.reject(new Error("storage unavailable")),
      saveMissionDraft: () => Promise.reject(new Error("storage unavailable")),
      deleteMissionDraft: () => Promise.reject(new Error("storage unavailable")),
      clearMissionDrafts: () => Promise.reject(new Error("storage unavailable")),
      clearAll: () => Promise.reject(new Error("storage unavailable")),
      close: () => Promise.resolve(),
      getCloseState: () => "open",
    };
    const resilient = new ResilientLearningPersistence(unavailable);

    await resilient.addAttempt(A1);
    expect(resilient.kind).toBe("memory");
    expect(await resilient.getAttempts()).toEqual([A1]);
  });

  /**
   * Regression for the duplicate-key failover bug (PHASE-04B.2A found it,
   * PHASE-04B.2B fixed it). A duplicate attempt id is a domain error, not a
   * storage outage, so a healthy IndexedDB must stay the active store.
   */
  describe("duplicate attempt id", () => {
    async function addDuplicate(resilient: ResilientLearningPersistence) {
      await resilient.addAttempt(A1);
      await resilient.addAttempt(A2);
      return resilient.addAttempt(A1).then(
        () => null,
        (error: unknown) => error,
      );
    }

    it("rejects with DuplicateAttemptError and does not switch to memory", async () => {
      const { resilient } = create();
      const error = await addDuplicate(resilient);

      expect(error).toBeInstanceOf(DuplicateAttemptError);
      expect((error as DuplicateAttemptError).attemptId).toBe("attempt.1");
      expect(resilient.kind).toBe("indexeddb");
    });

    it("keeps already stored attempts visible", async () => {
      const { resilient } = create();
      await addDuplicate(resilient);

      expect(resilient.kind).toBe("indexeddb");
      expect(await resilient.getAttempts()).toEqual([A1, A2]);
    });

    it("keeps later attempts durable across a fresh instance", async () => {
      const { factory, resilient } = create();
      await addDuplicate(resilient);
      await resilient.addAttempt(A3);

      const fresh = idb.track(new IndexedDbLearningPersistence(factory));
      expect((await fresh.getAttempts()).map((a) => a.id)).toEqual([
        "attempt.1",
        "attempt.2",
        "attempt.3",
      ]);
    });

    it("does not warn about unavailable storage for a duplicate", async () => {
      const { resilient } = create();
      const warn = vi.mocked(console.warn);
      await addDuplicate(resilient);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe("addAttemptIfAbsent", () => {
    it("never fails over for exists, conflict or invalid records", async () => {
      const { factory, resilient } = create();
      await resilient.addAttempt(A1);

      expect(await resilient.addAttemptIfAbsent(A1)).toEqual({ status: "exists" });
      expect(await resilient.addAttemptIfAbsent({ ...A1, passed: false })).toEqual({
        status: "conflict",
      });
      await expect(
        resilient.addAttemptIfAbsent({ ...A1, id: "attempt.bad", submissionIndex: 0 } as never),
      ).rejects.toBeInstanceOf(InvalidAttemptRecordError);

      expect(resilient.kind).toBe("indexeddb");
      const fresh = idb.track(new IndexedDbLearningPersistence(factory));
      expect(await fresh.getAttempts()).toEqual([A1]);
    });

    it("still falls back to memory on a genuine storage failure", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const broken = idb.track(new IndexedDbLearningPersistence(idb.createFactory()));
      vi.spyOn(broken, "addAttemptIfAbsent").mockRejectedValue(new Error("disk failure"));
      const resilient = new ResilientLearningPersistence(broken);

      expect(await resilient.addAttemptIfAbsent(A1)).toEqual({ status: "added" });
      expect(resilient.kind).toBe("memory");
    });
  });
});

describe("MemoryLearningPersistence duplicate contract (reference for the IndexedDB store)", () => {
  it("also rejects duplicate ids, so both stores agree that a duplicate is an error", async () => {
    const memory = new MemoryLearningPersistence();
    await memory.addAttempt(A1);
    await expect(memory.addAttempt(A1)).rejects.toThrow("Attempt already exists");
    await expect(memory.addAttempt(A1)).rejects.toBeInstanceOf(DuplicateAttemptError);
  });
});
