import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AttemptRecordSchema,
  Difficulty,
  HintLevel,
  LearningStage,
  type LearningActivityId,
} from "../../src/core/domain";
import {
  IndexedDbLearningPersistence,
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
      getAttempts: () => Promise.reject(new Error("storage unavailable")),
      clearAttempts: () => Promise.reject(new Error("storage unavailable")),
      getMissionDraft: () => Promise.reject(new Error("storage unavailable")),
      saveMissionDraft: () => Promise.reject(new Error("storage unavailable")),
      deleteMissionDraft: () => Promise.reject(new Error("storage unavailable")),
      clearMissionDrafts: () => Promise.reject(new Error("storage unavailable")),
      clearAll: () => Promise.reject(new Error("storage unavailable")),
    };
    const resilient = new ResilientLearningPersistence(unavailable);

    await resilient.addAttempt(A1);
    expect(resilient.kind).toBe("memory");
    expect(await resilient.getAttempts()).toEqual([A1]);
  });

  /**
   * KNOWN RISK (PHASE-04B.2A, Task C) - NOT a product requirement.
   *
   * ResilientLearningPersistence.execute() catches *every* error from the
   * primary. A duplicate attempt id is a normal ConstraintError of the store,
   * not an outage, yet it flips `failedOver` permanently. From then on:
   *   - reads come from an empty in-memory store (existing IndexedDB attempts
   *     become invisible to the app), and
   *   - writes never reach IndexedDB again until a full page reload.
   *
   * The two tests below assert the DESIRED invariants with `it.fails`, so the
   * suite is green today and turns red the moment the wrapper is fixed. When
   * that happens, change `it.fails` to `it` and delete this comment.
   * They deliberately accept either outcome of the duplicate call itself
   * (throw or ignore) - the fix policy is not decided here.
   */
  describe("duplicate attempt id (known risk, desired invariants)", () => {
    async function addDuplicate(resilient: ResilientLearningPersistence) {
      await resilient.addAttempt(A1);
      await resilient.addAttempt(A2);
      await resilient.addAttempt(A1).catch(() => undefined);
    }

    it.fails("a duplicate id must not switch the store to memory or hide stored attempts", async () => {
      const { resilient } = create();
      await addDuplicate(resilient);

      expect(resilient.kind).toBe("indexeddb");
      expect(await resilient.getAttempts()).toEqual([A1, A2]);
    });

    it.fails("attempts written after a duplicate id must still reach IndexedDB", async () => {
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
  });
});

describe("MemoryLearningPersistence duplicate contract (reference for the IndexedDB store)", () => {
  it("also rejects duplicate ids, so both stores agree that a duplicate is an error", async () => {
    const memory = new MemoryLearningPersistence();
    await memory.addAttempt(A1);
    await expect(memory.addAttempt(A1)).rejects.toThrow("Attempt already exists");
  });
});
