import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getOrderedActivityIds } from "../../src/app/learning-path";
import {
  createApplicationServices,
  type ApplicationServices,
} from "../../src/app/services/application-services";
import {
  AttemptRecordSchema,
  Difficulty,
  HintLevel,
  LearningActivityType,
  LearningStage,
  MasteryState,
  type AttemptRecord,
  type ConceptId,
  type LearningActivityId,
} from "../../src/core/domain";
import {
  IndexedDbMetaProgressionPersistence,
  MemoryMetaProgressionPersistence,
  MetaProgressionEngine,
  MetaProgressionStateUnreadableError,
  MetaProgressionStorageUnavailableError,
  RewardReason,
  STARTER_ROBOT_BLUEPRINT,
  createEmptyInventory,
  type MetaProgressionState,
} from "../../src/core/meta-progression";
import {
  AttemptProvenanceUnreadableError,
  GUEST_SCOPE,
  IndexedDbLearningPersistence,
  PersistenceUpgradeBlockedError,
  PersistenceUpgradeFailureReason,
  accountScope,
  resolveScopedDatabaseName,
  type AttemptImportOrigin,
  type PersistenceScope,
} from "../../src/core/persistence";
import {
  openRawConnection,
  rawDescribeSchema,
  rawGetAll,
  rawPut,
  seedLearningV1Database,
} from "../persistence/indexeddb-test-utils";

/**
 * PHASE-04C.3C - reward-safe reconciliation and startup safety.
 *
 * Imported attempts (cloud-import / guest-copy) are seeded straight through the
 * persistence primitive BEFORE the services are constructed; no production
 * import caller exists. "Today" is pinned with a Date-only fake clock.
 */

// A fake runtime stands in for Pyodide / the local Python server.
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

/** Fixed "now". Attempts dated `today(n)` are on the same local calendar day as it. */
const NOW = new Date("2026-10-10T12:00:30.000Z");
const today = (second: number) => `2026-10-10T12:00:${String(second).padStart(2, "0")}.000Z`;
const past = (minute: number) => `2026-10-03T12:${String(minute).padStart(2, "0")}:00.000Z`;

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
    submittedAt: past(0),
    passed: true,
    submissionIndex: 1,
    runCountBeforeSubmit: 0,
    hintsUsed: [HintLevel.H1],
    runtimeErrorCount: 0,
    ...overrides,
  });
}

function useFactory(): IDBFactory {
  const factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  return factory;
}

async function seedLocal(factory: IDBFactory, scope: PersistenceScope, ...attempts: AttemptRecord[]) {
  const store = new IndexedDbLearningPersistence(factory, scope);
  for (const attempt of attempts) await store.addAttempt(attempt);
}

async function seedImported(
  factory: IDBFactory,
  scope: PersistenceScope,
  origin: AttemptImportOrigin,
  ...attempts: AttemptRecord[]
) {
  const store = new IndexedDbLearningPersistence(factory, scope);
  for (const attempt of attempts) {
    expect(await store.importAttemptIfAbsent(attempt, origin)).toEqual({ status: "added" });
  }
}

async function start(scope?: PersistenceScope): Promise<ApplicationServices> {
  const services = createApplicationServices(scope === undefined ? undefined : { scope });
  await services.initialize();
  return services;
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

async function databaseNames(factory: IDBFactory): Promise<string[]> {
  return (await factory.databases()).map((info) => info.name ?? "").sort();
}

const ids = (records: readonly { readonly id: string }[]) => records.map((record) => record.id);

/** What reconciliation grants for exactly these attempts, with the unchanged engine. */
async function reference(attempts: readonly AttemptRecord[]) {
  const engine = new MetaProgressionEngine(new MemoryMetaProgressionPersistence());
  await engine.reconcileAttempts(attempts);
  return engine.getSnapshot();
}

function expectSameRewards(
  services: ApplicationServices,
  expected: Awaited<ReturnType<typeof reference>>,
) {
  const actual = services.metaProgression.getSnapshot();
  expect(actual.inventory).toEqual(expected.inventory);
  expect(actual.recentRewards).toEqual(expected.recentRewards);
  expect(actual.dailyBonusClaimed).toBe(expected.dailyBonusClaimed);
  expect(actual.dailyGoals).toEqual(expected.dailyGoals);
}

function reasons(state: MetaProgressionState | undefined): string[] {
  return (state?.rewardHistory ?? []).map((grant) => grant.reason);
}

const unhandled = (() => {
  type Listener = (reason: unknown) => void;
  const proc = (
    globalThis as unknown as {
      process: { on(event: string, l: Listener): void; off(event: string, l: Listener): void };
    }
  ).process;
  return {
    collect() {
      const seen: unknown[] = [];
      const listener: Listener = (reason) => seen.push(reason);
      proc.on("unhandledRejection", listener);
      return { seen, stop: () => proc.off("unhandledRejection", listener) };
    },
  };
})();

beforeEach(() => {
  fake.counters.created = 0;
  fake.counters.runs = 0;
  fake.counters.submits = 0;
  fake.counters.disposed = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("reward-safe startup reconciliation", () => {
  describe("1. Guest compatibility", () => {
    it("starts a Guest with existing v1 attempts and meta state, keeping rewards unchanged", async () => {
      const factory = useFactory();
      const legacy = makeAttempt("attempt.legacy");
      await seedLearningV1Database(factory, GUEST_LEARNING, { attempts: [legacy] });
      const meta = new MetaProgressionEngine(new IndexedDbMetaProgressionPersistence(factory));
      await meta.recordAttempt(legacy);
      const seeded = meta.getSnapshot();
      const storedBefore = await metaStateIn(factory, GUEST_SCOPE);

      const services = await start();

      expect(services.getInitializationState().status).toBe("ready");
      expect(services.getPersistenceKind()).toBe("indexeddb");
      expect(ids(services.learning.getAttempts())).toEqual(["attempt.legacy"]);
      expect(services.metaProgression.getSnapshot().inventory).toEqual(seeded.inventory);
      expect(await metaStateIn(factory, GUEST_SCOPE)).toEqual(storedBefore); // no double reward
      expect((await rawDescribeSchema(factory, GUEST_LEARNING)).version).toBe(2);
    });

    it("treats legacy v1 attempts without meta state as local and rewards them", async () => {
      const factory = useFactory();
      const legacy = makeAttempt("attempt.legacy");
      await seedLearningV1Database(factory, GUEST_LEARNING, { attempts: [legacy] });

      const services = await start();

      expectSameRewards(services, await reference([legacy]));
      expect((await metaStateIn(factory, GUEST_SCOPE))?.processedAttemptIds).toEqual(["attempt.legacy"]);
    });
  });

  describe("2. ordinary local attempts", () => {
    it("generate exactly the reconciliation rewards the unchanged engine produces", async () => {
      const factory = useFactory();
      const local = [
        makeAttempt("local.old", { activityId: "activity.old", submittedAt: past(1) }),
        makeAttempt("local.today.pass", { activityId: "activity.new", submittedAt: today(1) }),
        makeAttempt("local.today.fail", {
          activityId: "activity.new",
          submittedAt: today(2),
          passed: false,
        }),
      ];
      await seedLocal(factory, GUEST_SCOPE, ...local);

      const services = await start();

      const expected = await reference(local);
      expect(expected.recentRewards.length).toBeGreaterThan(0);
      expect(expected.dailyBonusClaimed).toBe(true);
      expectSameRewards(services, expected);
    });

    it("feeds reconciliation the persistence snapshot, never the engine's attempt list", async () => {
      const factory = useFactory();
      await seedLocal(factory, GUEST_SCOPE, makeAttempt("local.1"));
      await seedImported(factory, GUEST_SCOPE, "cloud-import", makeAttempt("imported.1", { activityId: "activity.imp" }));
      const reconcile = vi.spyOn(MetaProgressionEngine.prototype, "reconcileAttempts");

      await start();

      expect(reconcile).toHaveBeenCalledTimes(1);
      expect(ids(reconcile.mock.calls[0]?.[0] as AttemptRecord[])).toEqual(["local.1"]);
    });
  });

  describe("3-4. imported attempts stay in learning history and progress", () => {
    it.each<AttemptImportOrigin>(["cloud-import", "guest-copy"])(
      "%s attempt is visible and drives activity and concept progress",
      async (origin) => {
        const factory = useFactory();
        const imported = makeAttempt("imported.1", {
          activityId: "activity.imp",
          conceptIds: ["concept.imp"],
          submittedAt: past(5),
        });
        await seedImported(factory, GUEST_SCOPE, origin, imported);

        const services = await start();

        expect(services.learning.getAttempts()).toEqual([imported]);
        expect(services.learning.getSnapshot().attemptCount).toBe(1);
        expect(services.learning.getActivityProgress("activity.imp" as LearningActivityId)).toMatchObject({
          attemptCount: 1,
          successfulAttemptCount: 1,
          completed: true,
        });
        const concept = services.learning.getConceptProgress("concept.imp" as ConceptId);
        expect(concept.attemptCount).toBe(1);
        expect(concept.successfulAttemptCount).toBe(1);
        expect(concept.mastery).not.toBe(MasteryState.UNSEEN);
      },
    );

    it("imported progress equals the progress of the same attempt stored locally", async () => {
      const factory = useFactory();
      const attempt = makeAttempt("same.1", {
        activityId: "activity.imp",
        conceptIds: ["concept.imp"],
        submittedAt: past(5),
      });
      await seedImported(factory, scopeA, "cloud-import", attempt);
      await seedLocal(factory, scopeB, attempt);

      const importedSide = await start(scopeA);
      const localSide = await start(scopeB);

      expect(importedSide.learning.getActivityProgress("activity.imp" as LearningActivityId)).toEqual(
        localSide.learning.getActivityProgress("activity.imp" as LearningActivityId),
      );
      expect(importedSide.learning.getConceptProgress("concept.imp" as ConceptId)).toEqual(
        localSide.learning.getConceptProgress("concept.imp" as ConceptId),
      );
    });
  });

  describe("5-7. imported attempts never earn local rewards", () => {
    it.each<AttemptImportOrigin>(["cloud-import", "guest-copy"])(
      "a %s focused pass grants no FIRST_ACTIVITY_PASS or FOCUSED_ACTIVITY_PASS",
      async (origin) => {
        const factory = useFactory();
        await seedImported(
          factory,
          GUEST_SCOPE,
          origin,
          makeAttempt("imported.1", { activityId: "activity.imp", hintsUsed: [], submittedAt: past(5) }),
        );

        const services = await start();

        const snapshot = services.metaProgression.getSnapshot();
        expect(snapshot.inventory).toEqual(createEmptyInventory());
        expect(snapshot.recentRewards).toEqual([]);
        const state = await metaStateIn(factory, GUEST_SCOPE);
        expect(state).toBeUndefined(); // nothing to reconcile, so nothing was persisted
        expect(reasons(state)).not.toContain(RewardReason.FIRST_ACTIVITY_PASS);
        expect(reasons(state)).not.toContain(RewardReason.FOCUSED_ACTIVITY_PASS);
      },
    );

    it("imported attempts dated today do not touch daily statistics or the daily rewards", async () => {
      const factory = useFactory();
      const sameAttempts = [
        makeAttempt("day.1", { activityId: "activity.d1", submittedAt: today(1) }),
        makeAttempt("day.2", { activityId: "activity.d2", submittedAt: today(2) }),
      ];
      await seedImported(factory, scopeA, "cloud-import", ...sameAttempts);
      await seedLocal(factory, scopeB, ...sameAttempts); // control: identical attempts, local origin

      const imported = await start(scopeA);
      const control = await start(scopeB);

      expect(control.metaProgression.getSnapshot().dailyBonusClaimed).toBe(true);
      const snapshot = imported.metaProgression.getSnapshot();
      expect(snapshot.dailyBonusClaimed).toBe(false);
      expect(snapshot.dailyGoalsCompleted).toBe(0);
      expect(snapshot.dailyGoals.map((goal) => goal.current)).toEqual([0, 0, 0]);
      expect(snapshot.inventory).toEqual(createEmptyInventory());
      const state = await metaStateIn(factory, scopeA);
      expect(state?.dailyStatsByDate ?? {}).toEqual({});
      expect(reasons(state)).not.toContain(RewardReason.DAILY_FIRST_PASS);
      expect(reasons(state)).not.toContain(RewardReason.DAILY_GOALS_COMPLETE);
    });
  });

  describe("8. mixed imported and local attempts", () => {
    it("rewards only the local attempts, even on an activity that also has imported history", async () => {
      const factory = useFactory();
      const local = [
        makeAttempt("local.shared", { activityId: "activity.shared", submittedAt: past(10) }),
        makeAttempt("local.only", { activityId: "activity.local", submittedAt: today(5) }),
      ];
      const imported = [
        // Earlier than the local pass on the same activity: if it counted, it would own the first-pass reward.
        makeAttempt("imported.shared", { activityId: "activity.shared", submittedAt: past(1) }),
        makeAttempt("imported.only", { activityId: "activity.imported", submittedAt: today(3) }),
      ];
      await seedImported(factory, GUEST_SCOPE, "cloud-import", imported[0]!);
      await seedImported(factory, GUEST_SCOPE, "guest-copy", imported[1]!);
      await seedLocal(factory, GUEST_SCOPE, ...local);

      const services = await start();

      expect(ids(services.learning.getAttempts()).sort()).toEqual(
        ["imported.only", "imported.shared", "local.only", "local.shared"],
      );
      const state = await metaStateIn(factory, GUEST_SCOPE);
      expect([...(state?.processedAttemptIds ?? [])].sort()).toEqual(["local.only", "local.shared"]);
      expect(state?.rewardedActivityIds.slice().sort()).toEqual(["activity.local", "activity.shared"]);
      for (const grant of state?.rewardHistory ?? []) {
        expect(["local.only", "local.shared"]).toContain(grant.sourceAttemptId);
      }
      expectSameRewards(services, await reference(local));
    });
  });

  describe("9. account isolation", () => {
    it("keeps each account's reconciliation outcome independent", async () => {
      const factory = useFactory();
      const localA = makeAttempt("a.local", { activityId: "activity.a", submittedAt: past(3) });
      const localB = makeAttempt("b.local", { activityId: "activity.b", submittedAt: today(4) });
      await seedLocal(factory, scopeA, localA);
      await seedImported(factory, scopeA, "cloud-import", makeAttempt("a.imported", { activityId: "activity.x", submittedAt: today(1) }));
      await seedLocal(factory, scopeB, localB);
      await seedImported(factory, scopeB, "guest-copy", makeAttempt("b.imported", { activityId: "activity.y", submittedAt: today(2) }));

      const a = await start(scopeA);
      const b = await start(scopeB);

      expectSameRewards(a, await reference([localA]));
      expectSameRewards(b, await reference([localB]));
      expect((await metaStateIn(factory, scopeA))?.processedAttemptIds).toEqual(["a.local"]);
      expect((await metaStateIn(factory, scopeB))?.processedAttemptIds).toEqual(["b.local"]);
      expect(ids(a.learning.getAttempts()).sort()).toEqual(["a.imported", "a.local"]);
      expect(ids(b.learning.getAttempts()).sort()).toEqual(["b.imported", "b.local"]);
      expect(await databaseNames(factory)).toEqual(
        [learningDb(scopeA), learningDb(scopeB), metaDb(scopeA), metaDb(scopeB)].sort(),
      );
    });
  });

  describe("10-11. reconstruction", () => {
    it("reconstructing services never rewards imported attempts and keeps rewards stable", async () => {
      const factory = useFactory();
      await seedLocal(factory, GUEST_SCOPE, makeAttempt("local.1", { activityId: "activity.l" }));
      await seedImported(factory, GUEST_SCOPE, "cloud-import", makeAttempt("imported.1", { activityId: "activity.i", submittedAt: today(1) }));

      await start();
      const stored = await metaStateIn(factory, GUEST_SCOPE);

      for (let round = 0; round < 3; round += 1) {
        const rebuilt = await start();
        expect(ids(rebuilt.learning.getAttempts()).sort()).toEqual(["imported.1", "local.1"]);
      }
      expect(await metaStateIn(factory, GUEST_SCOPE)).toEqual(stored);
      expect(stored?.processedAttemptIds).toEqual(["local.1"]);
    });

    it("after Meta state is cleared, rebuilding re-derives rewards for local attempts only", async () => {
      const factory = useFactory();
      const local = makeAttempt("local.1", { activityId: "activity.l", submittedAt: past(2) });
      await seedLocal(factory, GUEST_SCOPE, local);
      await seedImported(factory, GUEST_SCOPE, "guest-copy", makeAttempt("imported.1", { activityId: "activity.i", submittedAt: today(1) }));

      const first = await start();
      await first.metaProgression.clearAll();
      expect(first.metaProgression.getSnapshot().inventory).toEqual(createEmptyInventory());

      const rebuilt = await start();

      expectSameRewards(rebuilt, await reference([local]));
      const state = await metaStateIn(factory, GUEST_SCOPE);
      expect(state?.processedAttemptIds).toEqual(["local.1"]);
      expect(state?.rewardedActivityIds).toEqual(["activity.l"]);
      expect(ids(rebuilt.learning.getAttempts()).sort()).toEqual(["imported.1", "local.1"]);
    });
  });

  describe("12. a new local Submit after imported history", () => {
    it("still earns the unchanged local first-pass rewards", async () => {
      const factory = useFactory();
      const imported = makeAttempt("imported.pass", { activityId: "activity.same", submittedAt: past(1) });
      await seedImported(factory, scopeA, "cloud-import", imported);
      const withHistory = await start(scopeA);
      const withoutHistory = await start(scopeB);

      const submitted = makeAttempt("local.submit", { activityId: "activity.same", submittedAt: today(9) });
      for (const services of [withHistory, withoutHistory]) {
        await services.learning.recordAttempt(submitted);
        await services.metaProgression.recordAttempt(submitted); // what onAttemptRecord does
      }

      const grants = withHistory.metaProgression.getRewardGrantsForAttempt("local.submit");
      expect(grants.map((grant) => grant.reason)).toContain(RewardReason.FIRST_ACTIVITY_PASS);
      expect(grants).toEqual(withoutHistory.metaProgression.getRewardGrantsForAttempt("local.submit"));
      expect(withHistory.metaProgression.getSnapshot().inventory).toEqual(
        withoutHistory.metaProgression.getSnapshot().inventory,
      );
      expect(withHistory.metaProgression.getRewardGrantsForAttempt("imported.pass")).toEqual([]);
    });
  });

  describe("16. Run and Submit with imported history", () => {
    it("Run creates no AttemptRecord and Submit creates exactly one, rewarding only itself", async () => {
      const factory = useFactory();
      const probe = createApplicationServices({ scope: scopeA });
      await probe.initialize();
      const ordered = getOrderedActivityIds(probe.content);
      const missionIndex = ordered.findIndex((id) => {
        const type = probe.content.getActivity(id)?.type;
        return (
          type === LearningActivityType.CODE_MISSION ||
          type === LearningActivityType.DEBUG_MISSION ||
          type === LearningActivityType.BOSS_MISSION
        );
      });
      expect(missionIndex).toBeGreaterThanOrEqual(0);
      const missionId = ordered[missionIndex]!;
      const prerequisite =
        missionIndex > 0
          ? makeAttempt("imported.prerequisite", {
              activityId: ordered[missionIndex - 1],
              submittedAt: past(1),
            })
          : null;
      if (prerequisite !== null) {
        // Imported history unlocks the mission but must not be rewarded.
        await seedImported(factory, scopeB, "cloud-import", prerequisite);
      }

      const services = await start(scopeB);
      const baseline = services.learning.getAttempts().length;
      const created = await services.createMissionSession(missionId);
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const { session } = created.value;

      await session.run("answer = 1");
      expect(session.getAttempts()).toHaveLength(0);
      expect(services.learning.getAttempts()).toHaveLength(baseline);

      const submitted = await session.submit("answer = 1");
      expect(session.getAttempts()).toHaveLength(1);
      expect(services.learning.getAttempts()).toHaveLength(baseline + 1);
      expect(fake.counters.submits).toBe(1);

      const state = await metaStateIn(factory, scopeB);
      expect(state?.processedAttemptIds).toEqual([submitted.attemptRecord.id]);
      for (const grant of state?.rewardHistory ?? []) {
        expect(grant.sourceAttemptId).toBe(submitted.attemptRecord.id);
      }
      session.dispose();
    });
  });
});

describe("startup failure safety", () => {
  async function corruptProvenance(factory: IDBFactory, scope: PersistenceScope) {
    await rawPut(factory, learningDb(scope), "attemptProvenance", {
      attemptId: "broken",
      origin: "nobody",
      importedAt: "not-a-date",
    });
  }

  async function expectFailedSet(
    services: ApplicationServices,
    factory: IDBFactory,
    scope: PersistenceScope,
  ) {
    const error = await services.initialize().then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).not.toBeNull();
    // Explicit calls keep rejecting with the SAME underlying error.
    await expect(services.initialize()).rejects.toBe(error);
    const state = services.getInitializationState();
    expect(state.status).toBe("failed");
    if (state.status === "failed") expect(state.error).toBe(error);

    // Never silently memory, Guest or empty.
    expect(services.getPersistenceKind()).toBe("indexeddb");
    expect(services.learning.getSnapshot().ready).toBe(false);
    expect(services.metaProgression.getSnapshot().ready).toBe(false);
    expect((await databaseNames(factory)).includes(metaDb(scope))).toBe(false);
    if (scope.kind === "account") {
      expect((await databaseNames(factory)).includes(learningDb(GUEST_SCOPE))).toBe(false);
    }

    // Operations that need a started application refuse to continue.
    const mission = await services.createMissionSession("activity.does-not-matter");
    expect(mission.ok).toBe(false);
    if (!mission.ok) expect(mission.error.code).toBe("APPLICATION_INITIALIZATION_FAILED");
    expect(fake.counters.created).toBe(0);
    await expect(services.clearLearningData()).rejects.toBe(error);
    return error;
  }

  it("13. unreadable provenance rejects startup before any reward reconciliation", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const factory = useFactory();
    await seedLocal(factory, scopeA, makeAttempt("local.1"));
    await corruptProvenance(factory, scopeA);
    const reconcile = vi.spyOn(MetaProgressionEngine.prototype, "reconcileAttempts");
    const learningAttempts = vi.spyOn(IndexedDbLearningPersistence.prototype, "getAttempts");

    const services = createApplicationServices({ scope: scopeA });
    const error = await expectFailedSet(services, factory, scopeA);

    expect(error).toBeInstanceOf(AttemptProvenanceUnreadableError);
    expect(reconcile).not.toHaveBeenCalled();
    expect(learningAttempts).not.toHaveBeenCalled(); // no unfiltered fallback read either
    expect(await rawGetAll(factory, learningDb(scopeA), "attempts")).toHaveLength(1); // data untouched
  });

  it("14. a blocked upgrade rejects startup and does not switch to memory", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const factory = useFactory();
    await seedLearningV1Database(factory, learningDb(scopeA), { attempts: [makeAttempt("legacy.1")] });
    const blocker = await openRawConnection(factory, learningDb(scopeA)); // an old tab that ignores versionchange
    const reconcile = vi.spyOn(MetaProgressionEngine.prototype, "reconcileAttempts");
    try {
      const services = createApplicationServices({ scope: scopeA });
      const error = await expectFailedSet(services, factory, scopeA);

      expect(error).toBeInstanceOf(PersistenceUpgradeBlockedError);
      expect((error as PersistenceUpgradeBlockedError).reason).toBe(PersistenceUpgradeFailureReason.BLOCKED);
      expect(reconcile).not.toHaveBeenCalled();
    } finally {
      blocker.close();
    }
  });

  it("14b. a schema newer than this build rejects startup the same way", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const factory = useFactory();
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(learningDb(scopeA), 9);
      request.onupgradeneeded = () => undefined;
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    const services = createApplicationServices({ scope: scopeA });
    const error = await expectFailedSet(services, factory, scopeA);

    expect(error).toBeInstanceOf(PersistenceUpgradeBlockedError);
    expect((error as PersistenceUpgradeBlockedError).reason).toBe(
      PersistenceUpgradeFailureReason.VERSION_NEWER_THAN_CODE,
    );
  });

  it("15. the eager startup rejection is handled, is observable, and explicit initialize() still rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const factory = useFactory();
    await seedLocal(factory, scopeA, makeAttempt("local.1"));
    await corruptProvenance(factory, scopeA);
    const collector = unhandled.collect();
    try {
      const services = createApplicationServices({ scope: scopeA });
      const notifications: string[] = [];
      services.subscribeInitialization(() => notifications.push(services.getInitializationState().status));
      expect(services.getInitializationState().status).toBe("pending");

      // Let the eager startup fail and give the runtime time to report anything unhandled.
      await vi.waitFor(() => expect(services.getInitializationState().status).toBe("failed"));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(collector.seen).toEqual([]);
      expect(notifications).toEqual(["failed"]);
      await expect(services.initialize()).rejects.toBeInstanceOf(AttemptProvenanceUnreadableError);
    } finally {
      collector.stop();
    }
  });

  it("a healthy set reports pending, then ready, exactly once", async () => {
    useFactory();
    const services = createApplicationServices({ scope: scopeA });
    const notifications: string[] = [];
    services.subscribeInitialization(() => notifications.push(services.getInitializationState().status));
    expect(services.getInitializationState()).toEqual({ status: "pending" });

    await services.initialize();

    expect(notifications).toEqual(["ready"]);
    expect(services.getInitializationState()).toEqual({ status: "ready" });
    expect(services.getInitializationState()).toBe(services.getInitializationState());
  });
});

// ---------------------------------------------------------------------------
// PHASE-04C.3D.4 (M3): reward storage failures fail startup closed - never a
// silent volatile profile, never a fresh profile over unreadable saved rewards.
describe("meta persistence failure policy at startup", () => {
  const PROGRESSION = "progressionState";

  async function startupError(services: ApplicationServices): Promise<unknown> {
    const error = await services.initialize().then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).not.toBeNull();
    const state = services.getInitializationState();
    expect(state.status).toBe("failed");
    if (state.status === "failed") expect(state.error).toBe(error);
    expect(services.metaProgression.getSnapshot().ready).toBe(false);
    expect(services.getMetaProgressionPersistenceKind()).toBe("indexeddb"); // never memory
    const mission = await services.createMissionSession("activity.does-not-matter");
    expect(mission.ok).toBe(false);
    if (!mission.ok) expect(mission.error.code).toBe("APPLICATION_INITIALIZATION_FAILED");
    expect(fake.counters.created).toBe(0);
    return error;
  }

  it("M3-1. unreadable saved rewards fail startup; the saved record and the attempts stay untouched", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const factory = useFactory();
    await seedLocal(factory, scopeA, makeAttempt("local.1"));
    const seedMeta = new IndexedDbMetaProgressionPersistence(factory, scopeA);
    await seedMeta.loadState(); // creates the meta database
    await seedMeta.close();
    const corrupted = { key: "primary", state: { version: 1, inventory: "lots" } };
    await rawPut(factory, metaDb(scopeA), PROGRESSION, corrupted);
    const reconcile = vi.spyOn(MetaProgressionEngine.prototype, "reconcileAttempts");

    const services = createApplicationServices({ scope: scopeA });
    const error = await startupError(services);

    expect(error).toBeInstanceOf(MetaProgressionStateUnreadableError);
    expect(reconcile).not.toHaveBeenCalled(); // no fresh profile was re-rewarded
    expect(await rawGetAll(factory, metaDb(scopeA), PROGRESSION)).toEqual([corrupted]);
    expect(await rawGetAll(factory, learningDb(scopeA), "attempts")).toHaveLength(1);
  });

  it("M3-2. a reward database newer than this build fails startup without any memory fallback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const factory = useFactory();
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(metaDb(GUEST_SCOPE), 4);
      request.onupgradeneeded = () => undefined;
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    const services = createApplicationServices();
    const error = await startupError(services);

    expect(error).toBeInstanceOf(PersistenceUpgradeBlockedError);
    expect((error as PersistenceUpgradeBlockedError).reason).toBe(
      PersistenceUpgradeFailureReason.VERSION_NEWER_THAN_CODE,
    );
    expect(services.getPersistenceKind()).toBe("indexeddb");
    expect(warn).not.toHaveBeenCalled();
    const meta = (await factory.databases()).find((info) => info.name === metaDb(GUEST_SCOPE));
    expect(meta?.version).toBe(4); // neither upgraded nor downgraded
  });

  it("M3-3. unavailable storage fails startup instead of presenting volatile rewards", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined); // learning's own (unchanged) failover
    const failure = new DOMException("IndexedDB is disabled.", "SecurityError");
    vi.stubGlobal("indexedDB", {
      open() {
        throw failure;
      },
    });
    const collector = unhandled.collect();
    try {
      const services = createApplicationServices();
      expect(await startupError(services)).toBe(failure);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(collector.seen).toEqual([]);
    } finally {
      collector.stop();
    }
  });

  it("M3-4. a failed reward write during startup reconciliation never duplicates rewards after restart", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const factory = useFactory();
    const attempts = [
      makeAttempt("local.1", { submittedAt: today(1) }),
      makeAttempt("local.2", { activityId: "activity.other", submittedAt: today(2) }),
    ];
    await seedLocal(factory, GUEST_SCOPE, ...attempts);
    const writeFailure = new DOMException("Quota exceeded.", "QuotaExceededError");
    const save = vi
      .spyOn(IndexedDbMetaProgressionPersistence.prototype, "saveState")
      .mockImplementation(() => Promise.reject(writeFailure));

    const failed = createApplicationServices();
    await expect(failed.initialize()).rejects.toBe(writeFailure);
    expect(failed.getInitializationState().status).toBe("failed");
    expect(await metaStateIn(factory, GUEST_SCOPE)).toBeUndefined(); // nothing claimed durable
    save.mockRestore();

    const restarted = await start();
    expectSameRewards(restarted, await reference(attempts));
    const stored = await metaStateIn(factory, GUEST_SCOPE);
    expect([...(stored?.processedAttemptIds ?? [])].sort()).toEqual(["local.1", "local.2"]);

    const again = await start(); // a further restart changes nothing
    expectSameRewards(again, await reference(attempts));
    expect(await metaStateIn(factory, GUEST_SCOPE)).toEqual(stored);
  });

  it("M3-5. a failed reward write after startup rejects and is granted exactly once on the next start", async () => {
    const factory = useFactory();
    const services = await start();
    const submitted = makeAttempt("local.submit", { submittedAt: today(5) });
    await services.learning.recordAttempt(submitted);

    const save = vi
      .spyOn(IndexedDbMetaProgressionPersistence.prototype, "saveState")
      .mockImplementation(() => Promise.reject(new DOMException("Write failed.", "UnknownError")));
    await expect(services.metaProgression.recordAttempt(submitted)).rejects.toBeInstanceOf(DOMException);
    expect(services.metaProgression.getRewardGrantsForAttempt("local.submit")).toEqual([]);
    expect(services.metaProgression.getSnapshot().inventory).toEqual(createEmptyInventory());
    save.mockRestore();

    const restarted = await start();
    expectSameRewards(restarted, await reference([submitted]));
    expect((await metaStateIn(factory, GUEST_SCOPE))?.processedAttemptIds).toEqual(["local.submit"]);
  });
});

// ---------------------------------------------------------------------------
// PHASE-04C.3D.4-R1: a browser without ANY IndexedDB API never gets volatile
// rewards; startup fails through the normal failed state instead.
describe("startup without an IndexedDB API", () => {
  it("R1-1. services construct, initialize() rejects, startup fails, and no reward mutation succeeds", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("indexedDB", undefined);
    expect(typeof indexedDB).toBe("undefined"); // truly absent, not a throwing factory
    const collector = unhandled.collect();
    try {
      let services: ApplicationServices | undefined;
      expect(() => {
        services = createApplicationServices();
      }).not.toThrow();
      const built = services!;
      expect(built.getInitializationState().status).toBe("pending");

      const error = await built.initialize().then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(MetaProgressionStorageUnavailableError);
      await expect(built.initialize()).rejects.toBe(error);
      const state = built.getInitializationState();
      expect(state.status).toBe("failed");
      if (state.status === "failed") expect(state.error).toBe(error);

      // Rewards are not ready and memory progression was not selected.
      expect(built.metaProgression.getSnapshot().ready).toBe(false);
      expect(built.getMetaProgressionPersistenceKind()).not.toBe("memory");

      // No reward mutation succeeds, and none is published.
      const outcomes = await Promise.allSettled([
        built.metaProgression.recordAttempt(makeAttempt("local.1")),
        built.metaProgression.reconcileAttempts([makeAttempt("local.2")]),
        built.metaProgression.buildRobotPart(STARTER_ROBOT_BLUEPRINT.parts[0]!.id),
        built.metaProgression.assembleStarterRobot(),
        built.metaProgression.clearAll(),
      ]);
      for (const outcome of outcomes) expect(outcome.status).toBe("rejected");
      expect(built.metaProgression.getSnapshot().inventory).toEqual(createEmptyInventory());
      expect(built.metaProgression.getSnapshot().revision).toBe(0);

      const mission = await built.createMissionSession("activity.does-not-matter");
      expect(mission.ok).toBe(false);
      if (!mission.ok) expect(mission.error.code).toBe("APPLICATION_INITIALIZATION_FAILED");
      expect(fake.counters.created).toBe(0);
      expect(warn).not.toHaveBeenCalled();

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(collector.seen).toEqual([]);
    } finally {
      collector.stop();
    }
  });

  it("R1-2. explicit MemoryMetaProgressionPersistence keeps working for deliberate use", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const engine = new MetaProgressionEngine(new MemoryMetaProgressionPersistence());
    const attempt = makeAttempt("local.1", { submittedAt: today(1) });
    await engine.recordAttempt(attempt);
    expect(engine.getPersistenceKind()).toBe("memory");
    expect(engine.getSnapshot().inventory).toEqual((await reference([attempt])).inventory);
  });
});
