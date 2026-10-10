import { describe, expect, it } from "vitest";

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
  type MissionDraftRecord,
} from "../../src/core/persistence";
import {
  rawDescribeSchema,
  rawGetAll,
  rawPut,
  useIsolatedIndexedDb,
} from "./indexeddb-test-utils";

const DATABASE_NAME = "python-learn-game";

function makeAttempt(overrides: Record<string, unknown> = {}) {
  return AttemptRecordSchema.parse({
    id: "attempt.test.1",
    activityId: "activity.test",
    missionTemplateId: "template.test",
    missionTemplateVersion: 1,
    seed: "seed",
    difficulty: Difficulty.EASY,
    conceptIds: ["concept.a", "concept.b"],
    learningStage: LearningStage.GUIDED,
    startedAt: "2026-10-03T11:59:00.000Z",
    submittedAt: "2026-10-03T12:00:00.000Z",
    passed: true,
    submissionIndex: 1,
    runCountBeforeSubmit: 2,
    hintsUsed: [HintLevel.H1],
    runtimeErrorCount: 0,
    graderSummary: { checks: 3, failed: 0 },
    ...overrides,
  });
}

function makeDraft(overrides: Partial<MissionDraftRecord> = {}): MissionDraftRecord {
  return {
    activityId: "activity.test" as LearningActivityId,
    seed: "seed.variant.1",
    variantIndex: 1,
    code: "answer = 42",
    hintsUsed: [HintLevel.H1, HintLevel.H2],
    updatedAt: "2026-10-03T12:01:00.000Z",
    ...overrides,
  };
}

describe("IndexedDbLearningPersistence (fake-indexeddb)", () => {
  const idb = useIsolatedIndexedDb();

  function createStore(factory = idb.createFactory()) {
    return { factory, store: idb.track(new IndexedDbLearningPersistence(factory)) };
  }

  describe("attempts", () => {
    it("reports kind indexeddb and starts empty", async () => {
      const { store } = createStore();
      expect(store.kind).toBe("indexeddb");
      expect(await store.getAttempts()).toEqual([]);
    });

    it("stores a valid AttemptRecord and reads it back unchanged", async () => {
      const { store } = createStore();
      const attempt = makeAttempt();
      await store.addAttempt(attempt);
      expect(await store.getAttempts()).toEqual([attempt]);
    });

    it("survives a fresh persistence instance on the same database", async () => {
      const { factory, store } = createStore();
      const attempt = makeAttempt();
      await store.addAttempt(attempt);
      await idb.close(store);

      const reopened = idb.track(new IndexedDbLearningPersistence(factory));
      expect(await reopened.getAttempts()).toEqual([attempt]);
    });

    it("isolates data between independent factories", async () => {
      const first = createStore();
      const second = createStore();
      await first.store.addAttempt(makeAttempt());
      expect(await second.store.getAttempts()).toEqual([]);
    });

    it("returns attempts ordered by submittedAt regardless of insertion order", async () => {
      const { store } = createStore();
      const late = makeAttempt({ id: "attempt.late", submittedAt: "2026-10-03T15:00:00.000Z" });
      const early = makeAttempt({ id: "attempt.early", submittedAt: "2026-10-03T09:00:00.000Z" });
      const middle = makeAttempt({ id: "attempt.middle", submittedAt: "2026-10-03T12:00:00.000Z" });
      await store.addAttempt(late);
      await store.addAttempt(early);
      await store.addAttempt(middle);
      expect((await store.getAttempts()).map((a) => a.id)).toEqual([
        "attempt.early",
        "attempt.middle",
        "attempt.late",
      ]);
    });

    it("rejects a duplicate attempt id with DuplicateAttemptError and keeps the original", async () => {
      const { store } = createStore();
      const original = makeAttempt();
      await store.addAttempt(original);

      const error = await store
        .addAttempt(makeAttempt({ passed: false }))
        .then(() => null, (caught: unknown) => caught);
      expect(error).toBeInstanceOf(DuplicateAttemptError);

      expect(await store.getAttempts()).toEqual([original]);
    });

    it("stays usable after a rejected duplicate (aborted transaction does not poison the connection)", async () => {
      const { store } = createStore();
      await store.addAttempt(makeAttempt());
      await store.addAttempt(makeAttempt()).catch(() => undefined);

      await store.addAttempt(makeAttempt({ id: "attempt.test.2", submittedAt: "2026-10-03T13:00:00.000Z" }));
      expect((await store.getAttempts()).map((a) => a.id)).toEqual([
        "attempt.test.1",
        "attempt.test.2",
      ]);
    });

    it("silently drops persisted records that fail AttemptRecordSchema", async () => {
      const { factory, store } = createStore();
      const valid = makeAttempt();
      await store.getAttempts(); // forces database creation
      const { passed: _passed, ...missingPassed } = makeAttempt({ id: "attempt.invalid.missing" });
      await rawPut(factory, DATABASE_NAME, "attempts", missingPassed);
      await rawPut(factory, DATABASE_NAME, "attempts", { ...valid, id: "attempt.invalid.type", passed: "yes" });
      await rawPut(factory, DATABASE_NAME, "attempts", valid);

      expect(await store.getAttempts()).toEqual([valid]);
      // The invalid rows are filtered on read, not deleted from storage.
      expect(await rawGetAll(factory, DATABASE_NAME, "attempts")).toHaveLength(3);
    });

    it("drops records with unknown fields because the schema is strict (current behavior)", async () => {
      const { factory, store } = createStore();
      await store.getAttempts();
      await rawPut(factory, DATABASE_NAME, "attempts", {
        ...makeAttempt({ id: "attempt.future" }),
        syncRevision: 7,
      });
      expect(await store.getAttempts()).toEqual([]);
    });
  });

  describe("mission drafts", () => {
    it("returns null when no draft exists", async () => {
      const { store } = createStore();
      expect(await store.getMissionDraft("activity.none" as LearningActivityId)).toBeNull();
    });

    it("persists and reads a draft, including across a fresh instance", async () => {
      const { factory, store } = createStore();
      const draft = makeDraft();
      await store.saveMissionDraft(draft);
      expect(await store.getMissionDraft(draft.activityId)).toEqual(draft);
      await idb.close(store);

      const reopened = idb.track(new IndexedDbLearningPersistence(factory));
      expect(await reopened.getMissionDraft(draft.activityId)).toEqual(draft);
    });

    it("keeps one draft per activity (put overwrites)", async () => {
      const { factory, store } = createStore();
      await store.saveMissionDraft(makeDraft({ code: "x = 1" }));
      await store.saveMissionDraft(makeDraft({ code: "x = 2" }));
      expect((await store.getMissionDraft("activity.test" as LearningActivityId))?.code).toBe("x = 2");
      expect(await rawGetAll(factory, DATABASE_NAME, "missionDrafts")).toHaveLength(1);
    });

    it("keeps drafts for different activities independent", async () => {
      const { store } = createStore();
      await store.saveMissionDraft(makeDraft({ activityId: "activity.a" as LearningActivityId, code: "a = 1" }));
      await store.saveMissionDraft(makeDraft({ activityId: "activity.b" as LearningActivityId, code: "b = 2" }));
      await store.deleteMissionDraft("activity.a" as LearningActivityId);
      expect(await store.getMissionDraft("activity.a" as LearningActivityId)).toBeNull();
      expect((await store.getMissionDraft("activity.b" as LearningActivityId))?.code).toBe("b = 2");
    });

    it("rejects an invalid draft before writing anything", async () => {
      const { factory, store } = createStore();
      await store.getAttempts(); // forces database creation
      await expect(store.saveMissionDraft(makeDraft({ seed: "   " }))).rejects.toThrow();
      expect(await rawGetAll(factory, DATABASE_NAME, "missionDrafts")).toEqual([]);
    });

    it("returns null for a persisted draft that fails the schema", async () => {
      const { factory, store } = createStore();
      await store.getAttempts(); // forces database creation
      await rawPut(factory, DATABASE_NAME, "missionDrafts", { activityId: "activity.test", code: "x = 1" });
      expect(await store.getMissionDraft("activity.test" as LearningActivityId)).toBeNull();
    });
  });

  describe("clearing", () => {
    async function seed() {
      const context = createStore();
      await context.store.addAttempt(makeAttempt());
      await context.store.saveMissionDraft(makeDraft());
      return context;
    }

    it("clearAttempts removes attempts but keeps drafts", async () => {
      const { store } = await seed();
      await store.clearAttempts();
      expect(await store.getAttempts()).toEqual([]);
      expect(await store.getMissionDraft("activity.test" as LearningActivityId)).not.toBeNull();
    });

    it("clearMissionDrafts removes drafts but keeps attempts", async () => {
      const { store } = await seed();
      await store.clearMissionDrafts();
      expect(await store.getMissionDraft("activity.test" as LearningActivityId)).toBeNull();
      expect(await store.getAttempts()).toHaveLength(1);
    });

    it("clearAll removes both attempts and drafts, and persists across a fresh instance", async () => {
      const { factory, store } = await seed();
      await store.clearAll();
      await idb.close(store);

      const reopened = idb.track(new IndexedDbLearningPersistence(factory));
      expect(await reopened.getAttempts()).toEqual([]);
      expect(await reopened.getMissionDraft("activity.test" as LearningActivityId)).toBeNull();
    });

    it("clearing an empty database is a no-op", async () => {
      const { store } = createStore();
      await expect(store.clearAll()).resolves.toBeUndefined();
      await expect(store.clearAttempts()).resolves.toBeUndefined();
      await expect(store.clearMissionDrafts()).resolves.toBeUndefined();
    });

    it("allows re-adding an attempt id after clearAttempts", async () => {
      const { store } = await seed();
      await store.clearAttempts();
      await expect(store.addAttempt(makeAttempt())).resolves.toBeUndefined();
    });
  });

  describe("on-disk layout (compatibility contract for existing user data)", () => {
    // PHASE-04C.3B: the version is deliberately 2 now (additive `attemptProvenance`
    // store). Every v1 store and index below is asserted unchanged.
    it("keeps database name, stores and indexes stable; v2 only adds attemptProvenance", async () => {
      const { factory, store } = createStore();
      await store.getAttempts();
      expect(await rawDescribeSchema(factory, DATABASE_NAME)).toEqual({
        version: 2,
        stores: {
          attemptProvenance: { keyPath: "attemptId", indexes: {} },
          attempts: {
            keyPath: "id",
            indexes: {
              activityId: { keyPath: "activityId", unique: false, multiEntry: false },
              submittedAt: { keyPath: "submittedAt", unique: false, multiEntry: false },
              conceptIds: { keyPath: "conceptIds", unique: false, multiEntry: true },
            },
          },
          missionDrafts: { keyPath: "activityId", indexes: {} },
        },
      });
    });
  });
});
