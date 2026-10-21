import { describe, expect, it, vi } from "vitest";

import { AttemptRecordSchema, Difficulty, HintLevel, LearningStage, type LearningActivityId } from "../../src/core/domain";
import {
  GUEST_DATABASE_BASE_NAMES,
  IndexedDbLearningPersistence,
  InvalidDatabaseBaseNameError,
  InvalidPersistenceScopeError,
  LEARNING_DATABASE_BASE_NAMES,
  ResilientLearningPersistence,
  accountScope,
  assertLearningDatabaseBaseName,
  createBrowserLearningPersistence,
  type MissionDraftRecord,
} from "../../src/core/persistence";
import { rawDescribeSchema, rawGetAll, useIsolatedIndexedDb } from "./indexeddb-test-utils";

/**
 * PHASE-05-M7.0 Task A: the Learning persistence class can serve a second,
 * separate database family (`practice`). Existing callers must be unaffected.
 */

const LEARNING = "python-learn-game";
const PRACTICE = "python-learn-game-practice";

function makeAttempt(id: string) {
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
  });
}

function makeDraft(code: string): MissionDraftRecord {
  return {
    activityId: "activity.test" as LearningActivityId,
    seed: "seed.variant.1",
    variantIndex: 1,
    code,
    hintsUsed: [HintLevel.H1],
    updatedAt: "2026-10-03T12:01:00.000Z",
  };
}

async function databaseNames(factory: IDBFactory): Promise<string[]> {
  return (await factory.databases()).map((info) => info.name ?? "").sort();
}

const V2_STORES = ["attemptProvenance", "attempts", "missionDrafts"];

describe("practice database base name (M7.0 Task A)", () => {
  const idb = useIsolatedIndexedDb();
  const scopeA = accountScope("acct-A");
  const scopeB = accountScope("acct-B");

  describe("names", () => {
    it("exposes the exact planned base name and keeps the existing ones", () => {
      expect(GUEST_DATABASE_BASE_NAMES.learning).toBe(LEARNING);
      expect(GUEST_DATABASE_BASE_NAMES.meta).toBe("python-learn-game-meta");
      expect(GUEST_DATABASE_BASE_NAMES.practice).toBe(PRACTICE);
      expect([...LEARNING_DATABASE_BASE_NAMES]).toEqual([LEARNING, PRACTICE]);
    });

    it("defaults to the original Learning database for every existing construction form", () => {
      const factory = idb.createFactory();
      expect(new IndexedDbLearningPersistence(factory).databaseName).toBe(LEARNING);
      expect(new IndexedDbLearningPersistence(factory, undefined, undefined).databaseName).toBe(LEARNING);
      expect(new IndexedDbLearningPersistence(factory, scopeA).databaseName).toBe(`${LEARNING}:account:acct-A`);
      expect(new IndexedDbLearningPersistence(factory, undefined, {}).databaseName).toBe(LEARNING);
      expect(new IndexedDbLearningPersistence(factory).databaseBaseName).toBe(LEARNING);
    });

    it("selects the practice database for Guest and account scopes with the same scope rule", () => {
      const factory = idb.createFactory();
      const options = { databaseBaseName: GUEST_DATABASE_BASE_NAMES.practice } as const;
      expect(new IndexedDbLearningPersistence(factory, undefined, options).databaseName).toBe(PRACTICE);
      expect(new IndexedDbLearningPersistence(factory, scopeA, options).databaseName).toBe(
        `${PRACTICE}:account:acct-A`,
      );
      expect(new IndexedDbLearningPersistence(factory, accountScope("a:b/ü"), options).databaseName).toBe(
        `${PRACTICE}:account:${encodeURIComponent("a:b/ü")}`,
      );
    });

    it("never produces a practice name equal to a learning/meta name for any scope", () => {
      const factory = idb.createFactory();
      const scopes = [undefined, scopeA, scopeB, accountScope("python-learn-game-practice")];
      const learning = scopes.map((s) => new IndexedDbLearningPersistence(factory, s).databaseName);
      const practice = scopes.map(
        (s) =>
          new IndexedDbLearningPersistence(factory, s, { databaseBaseName: GUEST_DATABASE_BASE_NAMES.practice })
            .databaseName,
      );
      const all = [...learning, ...practice, GUEST_DATABASE_BASE_NAMES.meta];
      expect(new Set(all).size).toBe(all.length);
    });
  });

  describe("closed set of base names", () => {
    it.each([
      ["meta", "python-learn-game-meta"],
      ["empty", ""],
      ["arbitrary", "something-else"],
      ["colon injection", "python-learn-game:account:x"],
      ["prefix lookalike", "python-learn-game-practice2"],
      ["case change", "Python-Learn-Game"],
      ["non-string", 42],
      ["null", null],
    ])("rejects %s", (_label, value) => {
      const factory = idb.createFactory();
      expect(() => assertLearningDatabaseBaseName(value)).toThrow(InvalidDatabaseBaseNameError);
      expect(
        () => new IndexedDbLearningPersistence(factory, undefined, { databaseBaseName: value as never }),
      ).toThrow(InvalidDatabaseBaseNameError);
    });

    it("never echoes the rejected value and opens nothing", async () => {
      const factory = idb.createFactory();
      let message = "";
      try {
        new IndexedDbLearningPersistence(factory, undefined, { databaseBaseName: "secret-name" as never });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).not.toContain("secret-name");
      expect(await databaseNames(factory)).toEqual([]);
    });

    it("an explicitly undefined base name means the default, not an error", () => {
      const factory = idb.createFactory();
      expect(
        new IndexedDbLearningPersistence(factory, undefined, { databaseBaseName: undefined }).databaseName,
      ).toBe(LEARNING);
    });
  });

  describe("storage behavior", () => {
    it("opens the practice database lazily at v3: the v2 layout plus practicePacks, and nothing else", async () => {
      const factory = idb.createFactory();
      const practice = idb.track(
        new IndexedDbLearningPersistence(factory, undefined, { databaseBaseName: GUEST_DATABASE_BASE_NAMES.practice }),
      );
      expect(await databaseNames(factory)).toEqual([]); // lazy: construction opens nothing
      expect(await practice.getAttempts()).toEqual([]);

      expect(await databaseNames(factory)).toEqual([PRACTICE]);
      const schema = await rawDescribeSchema(factory, PRACTICE);
      // PHASE-05-M7 contract change (approved by the M7 brief): ONLY the practice family
      // moved from v2 to v3, to add the `practicePacks` store through the same upgrade owner.
      expect(schema.version).toBe(3);
      expect(Object.keys(schema.stores).sort()).toEqual([...V2_STORES, "practicePacks"].sort());
      // The learning-layout stores are byte-for-byte the v2 layout.
      for (const name of V2_STORES) expect(schema.stores).toHaveProperty(name);
    });

    it("keeps the learning database at v2 with unchanged stores when used by existing callers", async () => {
      const factory = idb.createFactory();
      const learning = idb.track(new IndexedDbLearningPersistence(factory));
      await learning.addAttempt(makeAttempt("attempt.1"));
      expect(await databaseNames(factory)).toEqual([LEARNING]);
      const schema = await rawDescribeSchema(factory, LEARNING);
      expect(schema.version).toBe(2);
      expect(Object.keys(schema.stores).sort()).toEqual(V2_STORES);
    });

    it("isolates attempts and drafts between learning and practice, including identical ids", async () => {
      const factory = idb.createFactory();
      const learning = idb.track(new IndexedDbLearningPersistence(factory));
      const practice = idb.track(
        new IndexedDbLearningPersistence(factory, undefined, { databaseBaseName: GUEST_DATABASE_BASE_NAMES.practice }),
      );

      await learning.addAttempt(makeAttempt("attempt.same"));
      await learning.saveMissionDraft(makeDraft("learning-code"));
      expect(await practice.getAttempts()).toEqual([]);
      expect(await practice.getMissionDraft("activity.test" as LearningActivityId)).toBeNull();

      await practice.addAttempt(makeAttempt("attempt.same")); // same id is NOT a duplicate across databases
      await practice.saveMissionDraft(makeDraft("practice-code"));

      expect((await learning.getMissionDraft("activity.test" as LearningActivityId))?.code).toBe("learning-code");
      expect((await practice.getMissionDraft("activity.test" as LearningActivityId))?.code).toBe("practice-code");
      expect(await rawGetAll(factory, LEARNING, "attempts")).toHaveLength(1);
      expect(await rawGetAll(factory, PRACTICE, "attempts")).toHaveLength(1);

      await practice.clearAll();
      expect((await learning.getAttempts()).map((x) => x.id)).toEqual(["attempt.same"]);
      expect((await learning.getMissionDraft("activity.test" as LearningActivityId))?.code).toBe("learning-code");
      expect(await practice.getAttempts()).toEqual([]);
    });

    it("keeps account scoping inside the practice family (Guest / A / B)", async () => {
      const factory = idb.createFactory();
      const options = { databaseBaseName: GUEST_DATABASE_BASE_NAMES.practice } as const;
      const guest = idb.track(new IndexedDbLearningPersistence(factory, undefined, options));
      const a = idb.track(new IndexedDbLearningPersistence(factory, scopeA, options));
      const b = idb.track(new IndexedDbLearningPersistence(factory, scopeB, options));
      await guest.addAttempt(makeAttempt("attempt.guest"));
      await a.addAttempt(makeAttempt("attempt.a"));

      expect((await guest.getAttempts()).map((x) => x.id)).toEqual(["attempt.guest"]);
      expect((await a.getAttempts()).map((x) => x.id)).toEqual(["attempt.a"]);
      expect(await b.getAttempts()).toEqual([]);
      expect(await databaseNames(factory)).toEqual(
        [PRACTICE, `${PRACTICE}:account:acct-A`, `${PRACTICE}:account:acct-B`].sort(),
      );
    });

    it("a practice instance never touches a learning database of any scope", async () => {
      const factory = idb.createFactory();
      const practiceA = idb.track(
        new IndexedDbLearningPersistence(factory, scopeA, { databaseBaseName: GUEST_DATABASE_BASE_NAMES.practice }),
      );
      await practiceA.addAttempt(makeAttempt("attempt.p"));
      const names = await databaseNames(factory);
      expect(names).toEqual([`${PRACTICE}:account:acct-A`]);
      expect(names.some((n) => n === LEARNING || n.startsWith(`${LEARNING}:`))).toBe(false);
    });
  });

  describe("browser factory", () => {
    it("defaults to the original Learning database when no options are given", async () => {
      const factory = idb.createFactory();
      vi.stubGlobal("indexedDB", factory);
      try {
        const store = createBrowserLearningPersistence();
        await store.addAttempt(makeAttempt("attempt.1"));
        expect(await databaseNames(factory)).toEqual([LEARNING]);
        const scoped = createBrowserLearningPersistence(scopeA);
        await scoped.addAttempt(makeAttempt("attempt.2"));
        expect(await databaseNames(factory)).toEqual([LEARNING, `${LEARNING}:account:acct-A`].sort());
        await store.close();
        await scoped.close();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("selects the practice database through options and wraps it like any other", async () => {
      const factory = idb.createFactory();
      vi.stubGlobal("indexedDB", factory);
      try {
        const practice = createBrowserLearningPersistence(undefined, {
          databaseBaseName: GUEST_DATABASE_BASE_NAMES.practice,
        });
        expect(practice).toBeInstanceOf(ResilientLearningPersistence);
        expect(practice.kind).toBe("indexeddb");
        await practice.addAttempt(makeAttempt("attempt.p"));
        expect(await databaseNames(factory)).toEqual([PRACTICE]);
        await practice.close();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("validates the base name and scope even where IndexedDB is unavailable", () => {
      vi.stubGlobal("indexedDB", undefined);
      try {
        expect(() => createBrowserLearningPersistence(undefined, { databaseBaseName: "nope" as never })).toThrow(
          InvalidDatabaseBaseNameError,
        );
        expect(() =>
          createBrowserLearningPersistence({ kind: "account" } as never, {
            databaseBaseName: GUEST_DATABASE_BASE_NAMES.practice,
          }),
        ).toThrow(InvalidPersistenceScopeError);
        // Valid practice request without IndexedDB degrades to memory like the default does.
        expect(
          createBrowserLearningPersistence(undefined, { databaseBaseName: GUEST_DATABASE_BASE_NAMES.practice }).kind,
        ).toBe("memory");
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
