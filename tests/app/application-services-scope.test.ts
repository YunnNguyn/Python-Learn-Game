import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getOrderedActivityIds } from "../../src/app/learning-path";
import {
  createApplicationServices,
  type ApplicationServices,
  type CreateApplicationServicesOptions,
} from "../../src/app/services/application-services";
import {
  AttemptRecordSchema,
  Difficulty,
  HintLevel,
  LearningActivityType,
  LearningStage,
  type LearningActivityId,
} from "../../src/core/domain";
import {
  IndexedDbMetaProgressionPersistence,
  MetaProgressionEngine,
  createEmptyInventory,
  type MetaProgressionState,
} from "../../src/core/meta-progression";
import {
  GUEST_SCOPE,
  IndexedDbLearningPersistence,
  InvalidPersistenceScopeError,
  accountScope,
  resolveScopedDatabaseName,
  type PersistenceScope,
} from "../../src/core/persistence";
import { rawGetAll } from "../persistence/indexeddb-test-utils";

// A fake runtime stands in for Pyodide / the local Python server. It records
// calls so Run/Submit semantics can be asserted without any real runtime.
const fake = vi.hoisted(() => {
  const counters = { created: 0, runs: 0, submits: 0, disposed: 0 };
  const create = () => {
    counters.created += 1;
    return {
      initialize: async () => ({ ok: true as const }),
      prepareMission: async () => ({ ok: true as const }),
      run: async () => {
        counters.runs += 1;
        return { status: "SUCCESS" as const, stdout: "", stderr: "" };
      },
      submit: async () => {
        counters.submits += 1;
        return {
          status: "SUCCESS" as const,
          stdout: "",
          stderr: "",
          serialized: { variables: {} },
        };
      },
      dispose: () => {
        counters.disposed += 1;
      },
    };
  };
  return { counters, create };
});
vi.mock("../../src/core/runtime/pyodide", () => ({
  createPyodideRuntimeManager: fake.create,
}));
vi.mock("../../src/core/runtime/local-python", () => ({
  createLocalPythonRuntimeManager: fake.create,
}));

const GUEST_LEARNING = "python-learn-game";
const GUEST_META = "python-learn-game-meta";
const scopeA = accountScope("acct-A");
const scopeB = accountScope("acct-B");

const learningDb = (scope: PersistenceScope) => resolveScopedDatabaseName(GUEST_LEARNING, scope);
const metaDb = (scope: PersistenceScope) => resolveScopedDatabaseName(GUEST_META, scope);

function makeAttempt(id: string, overrides: Record<string, unknown> = {}) {
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

type Attempt = ReturnType<typeof makeAttempt>;

function useFactory(): IDBFactory {
  const factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  return factory;
}

async function databaseNames(factory: IDBFactory): Promise<string[]> {
  return (await factory.databases()).map((info) => info.name ?? "").sort();
}

/** Mirrors what MissionAttemptSession's onAttemptRecord does in production. */
async function recordAttempt(services: ApplicationServices, attempt: Attempt): Promise<void> {
  await services.learning.recordAttempt(attempt);
  await services.metaProgression.recordAttempt(attempt);
}

/** Seeds Guest storage through the pre-scope default constructors (legacy path). */
async function seedGuest(factory: IDBFactory, attempt: Attempt) {
  await new IndexedDbLearningPersistence(factory).addAttempt(attempt);
  const meta = new MetaProgressionEngine(new IndexedDbMetaProgressionPersistence(factory));
  await meta.recordAttempt(attempt);
  return meta.getSnapshot();
}

async function attemptIdsIn(factory: IDBFactory, scope: PersistenceScope): Promise<string[]> {
  const rows = (await rawGetAll(factory, learningDb(scope), "attempts")) as Array<{ id: string }>;
  return rows.map((row) => row.id).sort();
}

async function metaStateIn(
  factory: IDBFactory,
  scope: PersistenceScope,
): Promise<MetaProgressionState | undefined> {
  const rows = (await rawGetAll(factory, metaDb(scope), "progressionState")) as Array<{
    state: MetaProgressionState;
  }>;
  return rows[0]?.state;
}

async function guestSnapshot(factory: IDBFactory): Promise<string> {
  return JSON.stringify({
    attempts: await rawGetAll(factory, GUEST_LEARNING, "attempts"),
    drafts: await rawGetAll(factory, GUEST_LEARNING, "missionDrafts"),
    meta: await rawGetAll(factory, GUEST_META, "progressionState"),
  });
}

beforeEach(() => {
  fake.counters.created = 0;
  fake.counters.runs = 0;
  fake.counters.submits = 0;
  fake.counters.disposed = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createApplicationServices persistence scope", () => {
  describe("Guest default", () => {
    it.each<[string, CreateApplicationServicesOptions | undefined]>([
      ["no arguments", undefined],
      ["empty options", {}],
      ["undefined scope", { scope: undefined }],
      ["explicit GUEST_SCOPE", { scope: GUEST_SCOPE }],
    ])("uses the legacy Guest databases with %s", async (_label, options) => {
      const factory = useFactory();
      const services = createApplicationServices(options);
      await services.initialize();

      expect(services.getPersistenceKind()).toBe("indexeddb");
      expect(services.getMetaProgressionPersistenceKind()).toBe("indexeddb");
      expect(await databaseNames(factory)).toEqual([GUEST_LEARNING, GUEST_META].sort());
    });

    it("reads existing Guest attempts, rewards and inventory through the composition path", async () => {
      const factory = useFactory();
      const attempt = makeAttempt("attempt.guest");
      const seeded = await seedGuest(factory, attempt);
      expect(seeded.recentRewards.length).toBeGreaterThan(0);

      for (const options of [undefined, { scope: GUEST_SCOPE }] as const) {
        const services = createApplicationServices(options);
        await services.initialize();
        expect(services.learning.getAttempts().map((a) => a.id)).toEqual(["attempt.guest"]);
        expect(services.metaProgression.getSnapshot().inventory).toEqual(seeded.inventory);
        expect(services.metaProgression.getSnapshot().recentRewards).toEqual(seeded.recentRewards);
      }
    });
  });

  describe("account isolation", () => {
    it("Account A services read and write only Account A storage", async () => {
      const factory = useFactory();
      const a = createApplicationServices({ scope: scopeA });
      await a.initialize();
      await recordAttempt(a, makeAttempt("attempt.a"));

      expect(await databaseNames(factory)).toEqual(
        [learningDb(scopeA), metaDb(scopeA)].sort(),
      ); // Guest databases were never created
      expect(await attemptIdsIn(factory, scopeA)).toEqual(["attempt.a"]);
      const state = await metaStateIn(factory, scopeA);
      expect(state?.processedAttemptIds).toEqual(["attempt.a"]);
      expect(state?.rewardHistory.length).toBeGreaterThan(0);
    });

    it("Account B services cannot see Account A attempts or meta-progression", async () => {
      const factory = useFactory();
      const a = createApplicationServices({ scope: scopeA });
      await a.initialize();
      await recordAttempt(a, makeAttempt("attempt.a"));
      const aInventory = a.metaProgression.getSnapshot().inventory;
      expect(aInventory).not.toEqual(createEmptyInventory());

      const b = createApplicationServices({ scope: scopeB });
      await b.initialize();
      expect(b.learning.getAttempts()).toEqual([]);
      expect(b.metaProgression.getSnapshot().inventory).toEqual(createEmptyInventory());
      expect(b.metaProgression.getSnapshot().recentRewards).toEqual([]);

      // A's stored data is untouched by B's construction.
      expect(await attemptIdsIn(factory, scopeA)).toEqual(["attempt.a"]);
      expect(await attemptIdsIn(factory, scopeB)).toEqual([]);
    });

    it("A and B (and two Guest sets) keep independent in-memory engine state", async () => {
      useFactory();
      const a = createApplicationServices({ scope: scopeA });
      const b = createApplicationServices({ scope: scopeB });
      await Promise.all([a.initialize(), b.initialize()]);

      expect(a.learning).not.toBe(b.learning);
      expect(a.metaProgression).not.toBe(b.metaProgression);
      expect(a.content).not.toBe(b.content);

      const bListener = vi.fn();
      b.learning.subscribe(bListener);
      b.metaProgression.subscribe(bListener);

      await recordAttempt(a, makeAttempt("attempt.a"));
      expect(a.learning.getSnapshot().attemptCount).toBe(1);
      expect(b.learning.getSnapshot().attemptCount).toBe(0);
      expect(b.metaProgression.getSnapshot().inventory).toEqual(createEmptyInventory());
      expect(bListener).not.toHaveBeenCalled();

      await recordAttempt(b, makeAttempt("attempt.b"));
      expect(a.learning.getAttempts().map((x) => x.id)).toEqual(["attempt.a"]);
      expect(b.learning.getAttempts().map((x) => x.id)).toEqual(["attempt.b"]);

      // Two Guest sets share storage but NOT memory.
      const g1 = createApplicationServices();
      const g2 = createApplicationServices();
      await Promise.all([g1.initialize(), g2.initialize()]);
      await recordAttempt(g1, makeAttempt("attempt.guest"));
      expect(g2.learning.getAttempts()).toEqual([]);
      const g3 = createApplicationServices();
      await g3.initialize();
      expect(g3.learning.getAttempts().map((x) => x.id)).toEqual(["attempt.guest"]);
    });

    it("reconstructing services for the same account restores state without duplicating rewards", async () => {
      const factory = useFactory();
      const first = createApplicationServices({ scope: accountScope("acct-A") });
      await first.initialize();
      await recordAttempt(first, makeAttempt("attempt.a"));
      const inventory = first.metaProgression.getSnapshot().inventory;
      const rewards = first.metaProgression.getSnapshot().recentRewards;
      const stored = await metaStateIn(factory, scopeA);

      const second = createApplicationServices({ scope: accountScope("acct-A") });
      await second.initialize();
      expect(second.learning.getAttempts().map((x) => x.id)).toEqual(["attempt.a"]);
      expect(second.metaProgression.getSnapshot().inventory).toEqual(inventory);
      expect(second.metaProgression.getSnapshot().recentRewards).toEqual(rewards);
      expect(await metaStateIn(factory, scopeA)).toEqual(stored);
    });
  });

  describe("invalid scopes", () => {
    it.each<[string, unknown]>([
      ["null", null],
      ["empty object", {}],
      ["account without id", { kind: "account" }],
      ["account with email id", { kind: "account", accountId: "user@example.com" }],
      ["account with empty id", { kind: "account", accountId: "" }],
      ["guest carrying an account id", { kind: "guest", accountId: "acct-A" }],
      ["unknown kind", { kind: "Guest" }],
    ])("rejects %s and never initializes Guest storage", async (_label, scope) => {
      const factory = useFactory();
      expect(() => createApplicationServices({ scope: scope as never })).toThrow(
        InvalidPersistenceScopeError,
      );
      await new Promise((resolve) => setTimeout(resolve, 0)); // let any stray async init run
      expect(await databaseNames(factory)).toEqual([]);
    });
  });

  describe("no cross-scope copying", () => {
    it("constructing, using and clearing account services never modifies Guest data", async () => {
      const factory = useFactory();
      await seedGuest(factory, makeAttempt("attempt.guest"));
      const guestDraft = new IndexedDbLearningPersistence(factory);
      await guestDraft.saveMissionDraft({
        activityId: "activity.test" as LearningActivityId,
        seed: "guest-seed",
        variantIndex: 0,
        code: "guest = 1",
        hintsUsed: [],
        updatedAt: "2026-10-03T12:01:00.000Z",
      });
      const before = await guestSnapshot(factory);

      const a = createApplicationServices({ scope: scopeA });
      await a.initialize();
      await recordAttempt(a, makeAttempt("attempt.a"));
      await a.saveMissionDraft({
        activityId: "activity.test" as LearningActivityId,
        seed: "a-seed",
        variantIndex: 0,
        code: "a = 1",
        hintsUsed: [],
      });
      const b = createApplicationServices({ scope: scopeB });
      await b.initialize();
      await a.clearLearningData();
      await b.clearLearningData();

      expect(await guestSnapshot(factory)).toBe(before);
      expect(await attemptIdsIn(factory, scopeA)).toEqual([]);
    });

    it("does not copy Guest attempts into new account scopes", async () => {
      const factory = useFactory();
      await seedGuest(factory, makeAttempt("attempt.guest"));

      for (const scope of [scopeA, scopeB]) {
        const services = createApplicationServices({ scope });
        await services.initialize();
        expect(services.learning.getAttempts()).toEqual([]);
        expect(await attemptIdsIn(factory, scope)).toEqual([]);
      }
      expect(await attemptIdsIn(factory, GUEST_SCOPE)).toEqual(["attempt.guest"]);
    });

    it("introduces no imported attempts or duplicate rewards", async () => {
      const factory = useFactory();
      await seedGuest(factory, makeAttempt("attempt.guest"));
      const storedBefore = await metaStateIn(factory, GUEST_SCOPE);
      expect(storedBefore?.rewardHistory.length).toBeGreaterThan(0);

      for (let round = 0; round < 3; round += 1) {
        const guest = createApplicationServices();
        await guest.initialize();
        await guest.metaProgression.reconcileAttempts(guest.learning.getAttempts());
        await guest.metaProgression.recordAttempt(makeAttempt("attempt.guest"));
      }
      for (const scope of [scopeA, scopeB]) {
        const services = createApplicationServices({ scope });
        await services.initialize();
      }

      expect(await metaStateIn(factory, GUEST_SCOPE)).toEqual(storedBefore);
      expect(await attemptIdsIn(factory, GUEST_SCOPE)).toEqual(["attempt.guest"]);
      // Empty accounts grant nothing: no attempts and no meta-progression row at all.
      for (const scope of [scopeA, scopeB]) {
        expect(await attemptIdsIn(factory, scope)).toEqual([]);
        expect(await metaStateIn(factory, scope)).toBeUndefined();
      }
    });
  });

  describe("Run and Submit semantics", () => {
    it("Run never creates an AttemptRecord; each Submit creates exactly one, in the scoped storage only", async () => {
      const factory = useFactory();
      const services = createApplicationServices({ scope: scopeA });
      await services.initialize();

      // Pick the first executable mission and complete its predecessor so it is unlocked.
      const ordered = getOrderedActivityIds(services.content);
      const missionIndex = ordered.findIndex((id) => {
        const type = services.content.getActivity(id)?.type;
        return (
          type === LearningActivityType.CODE_MISSION ||
          type === LearningActivityType.DEBUG_MISSION ||
          type === LearningActivityType.BOSS_MISSION
        );
      });
      expect(missionIndex).toBeGreaterThanOrEqual(0);
      const missionId = ordered[missionIndex]!;
      if (missionIndex > 0) {
        await services.learning.recordAttempt(
          makeAttempt("attempt.prerequisite", { activityId: ordered[missionIndex - 1] }),
        );
      }
      const baseline = services.learning.getAttempts().length;

      const created = await services.createMissionSession(missionId);
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const { session } = created.value;
      expect(fake.counters.created).toBe(1);

      await session.run("answer = 1");
      expect(fake.counters.runs).toBe(1);
      expect(session.getAttempts()).toHaveLength(0);
      expect(services.learning.getAttempts()).toHaveLength(baseline);
      expect(await attemptIdsIn(factory, scopeA)).toHaveLength(baseline);

      const first = await session.submit("answer = 1");
      expect(fake.counters.submits).toBe(1);
      expect(session.getAttempts()).toHaveLength(1);
      expect(services.learning.getAttempts()).toHaveLength(baseline + 1);
      expect(await attemptIdsIn(factory, scopeA)).toContain(first.attemptRecord.id);
      expect((await metaStateIn(factory, scopeA))?.processedAttemptIds).toContain(
        first.attemptRecord.id,
      );

      const second = await session.submit("answer = 2");
      expect(second.attemptRecord.id).not.toBe(first.attemptRecord.id);
      expect(services.learning.getAttempts()).toHaveLength(baseline + 2);
      expect(fake.counters.runs).toBe(1);

      // Guest storage was never touched by any of this.
      expect(await databaseNames(factory)).toEqual([learningDb(scopeA), metaDb(scopeA)].sort());
      session.dispose();
    });
  });
});
