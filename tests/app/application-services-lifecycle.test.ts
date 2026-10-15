import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getOrderedActivityIds } from "../../src/app/learning-path";
import {
  createApplicationServices,
  type ApplicationInitializationState,
  type ApplicationServices,
} from "../../src/app/services/application-services";
import {
  APPLICATION_SERVICES_RETIRED,
  ApplicationServicesRetiredError,
} from "../../src/app/services/application-lifecycle";
import { registerCs116ProductionContent } from "../../src/content/cs116";
import { ContentRegistry } from "../../src/core/content";
import {
  AttemptRecordSchema,
  Difficulty,
  HintLevel,
  LearningActivityType,
  LearningStage,
  type AttemptRecord,
  type LearningActivityId,
} from "../../src/core/domain";
import { MissionSubmitCancelledError, type MissionAttemptSession } from "../../src/core/learning";
import { MissionEngine } from "../../src/core/missions";
import {
  MemoryMetaProgressionPersistence,
  MetaProgressionEngine,
  RobotPartId,
  type MetaProgressionState,
} from "../../src/core/meta-progression";
import {
  IndexedDbLearningPersistence,
  PersistenceUpgradeBlockedError,
  accountScope,
  resolveScopedDatabaseName,
  type PersistenceScope,
} from "../../src/core/persistence";
import {
  openRawConnection,
  rawGetAll,
  seedLearningV1Database,
} from "../persistence/indexeddb-test-utils";

/**
 * PHASE-04C.3D.5 (M4) - ApplicationServices lifecycle, session ownership and
 * durable-operation drain, against the REAL application services and REAL
 * (fake-indexeddb) storage.
 *
 * Determinism: both browser persistence factories are wrapped (never replaced)
 * by a gate. A test can hold the NEXT call of one persistence/runtime method:
 * the call is recorded as started, waits until the test releases (or fails)
 * it, and only then reaches the real store. Nothing here sleeps to win a race;
 * `idle()` only lets unrelated queued work run before asserting that something
 * did NOT happen while a hold is in place.
 */

const h = vi.hoisted(() => {
  type Decision = { readonly error?: unknown; readonly failed: boolean };

  class Hold {
    readonly entered: Promise<void>;
    private markEntered!: () => void;
    private decide!: (decision: Decision) => void;
    private readonly decision: Promise<Decision>;

    constructor(readonly key: string) {
      this.entered = new Promise<void>((resolve) => {
        this.markEntered = resolve;
      });
      this.decision = new Promise<Decision>((resolve) => {
        this.decide = resolve;
      });
    }

    async wait(): Promise<void> {
      this.markEntered();
      const decision = await this.decision;
      if (decision.failed) throw decision.error;
    }

    release(): void {
      this.decide({ failed: false });
    }

    fail(error: unknown): void {
      this.decide({ failed: true, error });
    }
  }

  const events: string[] = [];
  const holds = new Map<string, Hold[]>();

  /**
   * Controlled cleanup failures (R1). Each plan is consumed by ONE call, in
   * order; once the queue is empty the real behaviour is used again.
   *  - reject-before: close() rejects and the store is NOT closed.
   *  - reject-after:  the store IS closed, then close() rejects.
   *  - throw-sync:    close() throws synchronously; the store is NOT closed.
   *  - resolve-open:  close() resolves without closing (store stays open).
   */
  type ClosePlan = { readonly mode: "reject-before" | "reject-after" | "throw-sync" | "resolve-open"; readonly error?: unknown };
  const closePlans = new Map<"learning" | "meta", ClosePlan[]>();
  const stateThrows = new Set<"learning" | "meta">();
  const runtimeDisposeErrors: unknown[] = [];
  let runtimeDisposeAlwaysThrows: ((callIndex: number) => unknown) | null = null;

  function planClose(kind: "learning" | "meta", ...plans: ClosePlan[]): void {
    const queue = closePlans.get(kind) ?? [];
    queue.push(...plans);
    closePlans.set(kind, queue);
  }

  function closeWith(kind: "learning" | "meta", inner: any): () => Promise<void> {
    return () => {
      events.push(`${kind}.close`);
      const plan = closePlans.get(kind)?.shift();
      if (plan === undefined) return inner.close();
      if (plan.mode === "throw-sync") throw plan.error;
      if (plan.mode === "reject-before") return Promise.reject(plan.error);
      if (plan.mode === "resolve-open") return Promise.resolve();
      return inner.close().then(() => {
        throw plan.error;
      });
    };
  }

  function stateOf(kind: "learning" | "meta", inner: any): () => unknown {
    return () => {
      if (stateThrows.has(kind)) throw new Error(`${kind} getCloseState failed`);
      return inner.getCloseState();
    };
  }

  async function pass<T>(key: string, run: () => Promise<T>): Promise<T> {
    events.push(`${key}:start`);
    const hold = holds.get(key)?.shift();
    try {
      if (hold !== undefined) await hold.wait();
      const value = await run();
      events.push(`${key}:ok`);
      return value;
    } catch (error) {
      events.push(`${key}:error`);
      throw error;
    }
  }

  function hold(key: string): Hold {
    const created = new Hold(key);
    const queue = holds.get(key) ?? [];
    queue.push(created);
    holds.set(key, queue);
    return created;
  }

  const created: Array<{ readonly kind: "learning" | "meta"; readonly scope: unknown; readonly store: any }> = [];

  function wrapLearning(inner: any, scope: unknown): any {
    const call =
      (method: string) =>
      (...args: unknown[]) =>
        pass(`learning.${method}`, () => inner[method](...args));
    const store = {
      get kind() {
        return inner.kind;
      },
      addAttempt: call("addAttempt"),
      addAttemptIfAbsent: call("addAttemptIfAbsent"),
      importAttemptIfAbsent: call("importAttemptIfAbsent"),
      getAttempts: call("getAttempts"),
      getRewardEligibleAttemptsSnapshot: call("getRewardEligibleAttemptsSnapshot"),
      clearAttempts: call("clearAttempts"),
      getMissionDraft: call("getMissionDraft"),
      saveMissionDraft: call("saveMissionDraft"),
      deleteMissionDraft: call("deleteMissionDraft"),
      clearMissionDrafts: call("clearMissionDrafts"),
      clearAll: call("clearAll"),
      close: closeWith("learning", inner),
      getCloseState: stateOf("learning", inner),
    };
    created.push({ kind: "learning", scope, store });
    return store;
  }

  function wrapMeta(inner: any, scope: unknown): any {
    const call =
      (method: string) =>
      (...args: unknown[]) =>
        pass(`meta.${method}`, () => inner[method](...args));
    const store = {
      get kind() {
        return inner.kind;
      },
      loadState: call("loadState"),
      saveState: call("saveState"),
      clear: call("clear"),
      close: closeWith("meta", inner),
      getCloseState: stateOf("meta", inner),
    };
    created.push({ kind: "meta", scope, store });
    return store;
  }

  const counters = { created: 0, disposed: 0, submits: 0 };
  const create = () => {
    counters.created += 1;
    return {
      initialize: () => pass("runtime.initialize", async () => ({ ok: true as const })),
      prepareMission: () => pass("runtime.prepareMission", async () => ({ ok: true as const })),
      run: async () => ({ status: "SUCCESS" as const, stdout: "", stderr: "" }),
      submit: () =>
        pass("runtime.submit", async () => {
          counters.submits += 1;
          return { status: "SUCCESS" as const, stdout: "", stderr: "", serialized: { variables: {} } };
        }),
      dispose: () => {
        counters.disposed += 1;
        events.push("runtime.dispose");
        if (runtimeDisposeAlwaysThrows !== null) {
          const error = runtimeDisposeAlwaysThrows(counters.disposed);
          if (error !== undefined) throw error;
        }
        if (runtimeDisposeErrors.length > 0) throw runtimeDisposeErrors.shift();
      },
    };
  };

  function reset(): void {
    events.length = 0;
    holds.clear();
    created.length = 0;
    counters.created = 0;
    counters.disposed = 0;
    counters.submits = 0;
    closePlans.clear();
    stateThrows.clear();
    runtimeDisposeErrors.length = 0;
    runtimeDisposeAlwaysThrows = null;
  }

  /** The next runtime.dispose() calls throw these errors, one per call, in order. */
  function failRuntimeDispose(...errors: unknown[]): void {
    runtimeDisposeErrors.push(...errors);
  }

  /** EVERY runtime.dispose() call throws what `produce(callNumber)` returns (undefined = succeed). */
  function failRuntimeDisposeAlways(produce: (callNumber: number) => unknown): void {
    runtimeDisposeAlwaysThrows = produce;
  }

  /** Later runtime.dispose() calls succeed again. */
  function stopFailingRuntimeDispose(): void {
    runtimeDisposeAlwaysThrows = null;
    runtimeDisposeErrors.length = 0;
  }

  return {
    events,
    hold,
    created,
    counters,
    create,
    wrapLearning,
    wrapMeta,
    reset,
    planClose,
    stateThrows,
    failRuntimeDispose,
    failRuntimeDisposeAlways,
    stopFailingRuntimeDispose,
  };
});

vi.mock("../../src/core/runtime/pyodide", () => ({ createPyodideRuntimeManager: h.create }));
vi.mock("../../src/core/runtime/local-python", () => ({ createLocalPythonRuntimeManager: h.create }));
vi.mock("../../src/core/persistence/browser-learning-persistence", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/core/persistence/browser-learning-persistence")>();
  return {
    ...real,
    createBrowserLearningPersistence: (scope?: PersistenceScope) =>
      h.wrapLearning(real.createBrowserLearningPersistence(scope), scope),
  };
});
vi.mock("../../src/core/meta-progression/browser-meta-progression-persistence", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../../src/core/meta-progression/browser-meta-progression-persistence")>();
  return {
    ...real,
    createBrowserMetaProgressionPersistence: (scope?: PersistenceScope) =>
      h.wrapMeta(real.createBrowserMetaProgressionPersistence(scope), scope),
  };
});

const GUEST_LEARNING = "python-learn-game";
const GUEST_META = "python-learn-game-meta";
const scopeA = accountScope("acct-lifecycle-A");
const scopeB = accountScope("acct-lifecycle-B");
const learningDb = (scope: PersistenceScope) => resolveScopedDatabaseName(GUEST_LEARNING, scope);
const metaDb = (scope: PersistenceScope) => resolveScopedDatabaseName(GUEST_META, scope);

const NOW = new Date("2026-10-10T12:00:30.000Z");
const today = (second: number) => `2026-10-10T12:00:${String(second).padStart(2, "0")}.000Z`;

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
    startedAt: "2026-10-10T11:59:00.000Z",
    submittedAt: today(1),
    passed: true,
    submissionIndex: 1,
    runCountBeforeSubmit: 0,
    hintsUsed: [HintLevel.H1],
    runtimeErrorCount: 0,
    ...overrides,
  });
}

function deferredFlag<T>(promise: Promise<T>) {
  const state: { settled: boolean; value?: T; error?: unknown } = { settled: false };
  promise.then(
    (value) => {
      state.settled = true;
      state.value = value;
    },
    (error: unknown) => {
      state.settled = true;
      state.error = error;
    },
  );
  return state;
}

/** Lets unrelated queued work (including fake-indexeddb's own scheduling) run. */
async function idle(turns = 5): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function useFactory(): IDBFactory {
  const factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  return factory;
}

/**
 * The first executable mission of the course, unlocked for `scope` by an
 * IMPORTED (reward-free) passed attempt of its predecessor, written before any
 * service set exists.
 */
async function unlockFirstMission(factory: IDBFactory, scope: PersistenceScope): Promise<LearningActivityId> {
  const content = new ContentRegistry();
  registerCs116ProductionContent(content);
  const ordered = getOrderedActivityIds(content);
  const index = ordered.findIndex((id) => {
    const type = content.getActivity(id)?.type;
    return (
      type === LearningActivityType.CODE_MISSION ||
      type === LearningActivityType.DEBUG_MISSION ||
      type === LearningActivityType.BOSS_MISSION
    );
  });
  expect(index).toBeGreaterThanOrEqual(0);
  if (index > 0) {
    const store = new IndexedDbLearningPersistence(factory, scope);
    await store.importAttemptIfAbsent(
      makeAttempt("imported.prerequisite", { activityId: ordered[index - 1], submittedAt: today(0) }),
      "cloud-import",
    );
    await store.close();
  }
  return ordered[index]!;
}

async function openSession(services: ApplicationServices, missionId: string): Promise<MissionAttemptSession> {
  const created = await services.createMissionSession(missionId, { resumeDraft: false });
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error(created.error.message);
  return created.value.session;
}

function trackInitialization(services: ApplicationServices): string[] {
  const statuses: string[] = [services.getInitializationState().status];
  services.subscribeInitialization(() => statuses.push(services.getInitializationState().status));
  return statuses;
}

const draftInput = (activityId: string, code: string) => ({
  activityId: activityId as LearningActivityId,
  seed: "seed.draft",
  variantIndex: 0,
  code,
  hintsUsed: [] as HintLevel[],
});

function indexOfEvent(event: string): number {
  return h.events.indexOf(event);
}

async function metaStateIn(factory: IDBFactory, scope: PersistenceScope): Promise<MetaProgressionState | undefined> {
  const rows = (await rawGetAll(factory, metaDb(scope), "progressionState")) as Array<{ state: MetaProgressionState }>;
  return rows[0]?.state;
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
  h.reset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("M4 lifecycle - disposal across startup", () => {
  it("1. dispose before startup read anything: retires synchronously, runs no later startup step, never reports ready", async () => {
    useFactory();
    const snapshot = h.hold("learning.getRewardEligibleAttemptsSnapshot");
    const services = createApplicationServices({ scope: scopeA });
    const statuses = trackInitialization(services);
    await snapshot.entered;

    const disposal = services.dispose();
    expect(services.getLifecycleState()).toEqual({ status: "retiring", drain: "draining" });
    const pending = deferredFlag(disposal);
    await idle();
    expect(pending.settled).toBe(false); // the startup read is still running
    expect(h.events).not.toContain("learning.close");

    snapshot.release();
    const result = await disposal;
    expect(result).toEqual({ status: "disposed", persistence: { learning: "closed", metaProgression: "closed" } });
    expect(services.getLifecycleState()).toEqual(result);

    // Later startup steps never ran.
    expect(h.events).not.toContain("learning.getAttempts:start");
    expect(h.events).not.toContain("meta.loadState:start");
    expect(h.events).not.toContain("meta.saveState:start");
    expect(statuses).not.toContain("ready");
    const state = services.getInitializationState() as Extract<ApplicationInitializationState, { status: "failed" }>;
    expect(state.status).toBe("failed");
    expect(state.error).toBeInstanceOf(ApplicationServicesRetiredError);
    await expect(services.initialize()).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
    // Closed only after the in-flight read settled.
    expect(indexOfEvent("learning.close")).toBeGreaterThan(indexOfEvent("learning.getRewardEligibleAttemptsSnapshot:ok"));
  });

  it("2. dispose during initialization: the in-flight step settles, reconciliation never runs, state is not ready", async () => {
    const factory = useFactory();
    // A reward-eligible attempt that WOULD be rewarded by reconciliation.
    await new IndexedDbLearningPersistence(factory, scopeA).addAttempt(makeAttempt("local.1"));
    const metaLoad = h.hold("meta.loadState");
    const services = createApplicationServices({ scope: scopeA });
    const statuses = trackInitialization(services);
    await metaLoad.entered;

    const disposal = services.dispose();
    expect(services.getLifecycleState().status).toBe("retiring");
    metaLoad.release();
    const result = await disposal;

    expect(result.status).toBe("disposed");
    expect(h.events).not.toContain("meta.saveState:start"); // no reconciliation write
    expect(await metaStateIn(factory, scopeA)).toBeUndefined();
    expect(statuses).not.toContain("ready");
    expect(services.getInitializationState().status).toBe("failed");
    expect(indexOfEvent("meta.close")).toBeGreaterThan(indexOfEvent("meta.loadState:ok"));
    // The attempt itself is untouched; the next startup will reconcile it.
    expect(await rawGetAll(factory, learningDb(scopeA), "attempts")).toHaveLength(1);
  });

  it("3. dispose after ready: closes both stores, keeps every stored record, refuses every mutation path", async () => {
    const factory = useFactory();
    const missionId = await unlockFirstMission(factory, scopeA);
    const seed = new IndexedDbLearningPersistence(factory, scopeA);
    await seed.addAttempt(makeAttempt("local.ready"));
    await seed.importAttemptIfAbsent(makeAttempt("imported.history", { submittedAt: today(3) }), "guest-copy");
    await seed.close();
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    await services.saveMissionDraft(draftInput(missionId, "print(1)"));
    const before = {
      attempts: await rawGetAll(factory, learningDb(scopeA), "attempts"),
      drafts: await rawGetAll(factory, learningDb(scopeA), "missionDrafts"),
      provenance: await rawGetAll(factory, learningDb(scopeA), "attemptProvenance"),
      meta: await metaStateIn(factory, scopeA),
    };
    const storedIds = (before.attempts as AttemptRecord[]).map((row) => row.id);
    expect(storedIds).toContain("local.ready");
    expect(storedIds).toContain("imported.history");
    expect(before.drafts).toHaveLength(1);
    expect((before.provenance as Array<{ attemptId: string }>).map((row) => row.attemptId)).toContain("imported.history");
    expect(before.meta?.processedAttemptIds).toEqual(["local.ready"]); // imported history earns nothing

    const result = await services.dispose();
    expect(result).toEqual({ status: "disposed", persistence: { learning: "closed", metaProgression: "closed" } });
    expect(services.getInitializationState().status).toBe("ready"); // initialization is a separate concept

    // Every production mutation path is refused, without touching storage.
    const eventsBefore = h.events.length;
    await expect(services.saveMissionDraft(draftInput(missionId, "late"))).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
    await expect(services.deleteMissionDraft(missionId as LearningActivityId)).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
    await expect(services.clearLearningData()).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
    await expect(services.learning.recordAttempt(makeAttempt("late.record"))).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
    await expect(services.learning.clearAttempts()).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
    // RobotWorkshopPage calls these engine methods directly.
    await expect(services.metaProgression.buildRobotPart(RobotPartId.CHASSIS)).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
    await expect(services.metaProgression.assembleStarterRobot()).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
    await expect(services.metaProgression.recordAttempt(makeAttempt("late.reward"))).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
    await expect(services.metaProgression.reconcileAttempts([makeAttempt("late.reconcile")])).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
    await expect(services.metaProgression.clearAll()).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
    const created = await services.createMissionSession(missionId);
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.error.code).toBe(APPLICATION_SERVICES_RETIRED);
    expect(h.events.slice(eventsBefore)).toEqual([]);
    expect(h.counters.created).toBe(0);

    // Disposal deleted nothing (attempts, drafts, provenance, rewards).
    expect(await rawGetAll(factory, learningDb(scopeA), "attempts")).toEqual(before.attempts);
    expect(await rawGetAll(factory, learningDb(scopeA), "missionDrafts")).toEqual(before.drafts);
    expect(await rawGetAll(factory, learningDb(scopeA), "attemptProvenance")).toEqual(before.provenance);
    expect(await metaStateIn(factory, scopeA)).toEqual(before.meta);
  });

  it("4. dispose after failed startup: closes; a still-pending browser open is reported as closed-pending-open, not hidden", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const factory = useFactory();
    await seedLearningV1Database(factory, learningDb(scopeA), { attempts: [makeAttempt("legacy.1")] });
    const blocker = await openRawConnection(factory, learningDb(scopeA)); // an old tab ignoring versionchange
    try {
      const services = createApplicationServices({ scope: scopeA });
      await expect(services.initialize()).rejects.toBeInstanceOf(PersistenceUpgradeBlockedError);
      expect(services.getInitializationState().status).toBe("failed");

      const result = await services.dispose();
      expect(result).toEqual({
        status: "disposed",
        persistence: { learning: "closed-pending-open", metaProgression: "closed" },
      });
      expect(services.getPersistenceKind()).toBe("indexeddb"); // no memory failover
    } finally {
      blocker.close();
    }
    // The pending open completes and is closed; the legacy attempt is still stored.
    await vi.waitFor(async () => {
      expect((h.created.find((entry) => entry.kind === "learning")!.store.getCloseState() as string)).toBe("closed");
    });
    expect((await rawGetAll(factory, learningDb(scopeA), "attempts")).map((row: any) => row.id)).toEqual(["legacy.1"]);
  });
});

describe("M4 lifecycle - idempotence and session ownership", () => {
  it("5. repeated concurrent disposal shares one drain and closes each store exactly once", async () => {
    useFactory();
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const write = h.hold("learning.saveMissionDraft");
    const saving = services.saveMissionDraft(draftInput("activity.x", "a"));
    await write.entered;

    const first = services.dispose();
    const second = services.dispose();
    const third = services.dispose();
    expect(second).toBe(first);
    expect(third).toBe(first);
    write.release();
    await saving;
    const [a, b, c] = await Promise.all([first, second, third]);
    expect(a.status).toBe("disposed");
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(await services.dispose()).toBe(a);
    expect(h.events.filter((event) => event === "learning.close")).toHaveLength(1);
    expect(h.events.filter((event) => event === "meta.close")).toHaveLength(1);
  });

  it("6. session creation is refused while retiring - before it starts and when it completes late", async () => {
    const factory = useFactory();
    const missionId = await unlockFirstMission(factory, scopeA);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();

    // In flight while retirement begins: its loading engine is disposed at once.
    const prepare = h.hold("runtime.prepareMission");
    const late = services.createMissionSession(missionId, { resumeDraft: false });
    await prepare.entered;
    const disposal = services.dispose();
    expect(h.counters.disposed).toBe(1);

    // Requested after retirement: refused without creating a runtime.
    const refused = await services.createMissionSession(missionId);
    expect(refused).toEqual({ ok: false, error: expect.objectContaining({ code: APPLICATION_SERVICES_RETIRED }) });
    expect(h.counters.created).toBe(1);

    prepare.release();
    const result = await late;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(APPLICATION_SERVICES_RETIRED);
    expect((await disposal).status).toBe("disposed");
    expect(h.counters.disposed).toBe(1);
  });

  it("7. every owned session is disposed exactly once, including ones the page already released", async () => {
    const factory = useFactory();
    const missionId = await unlockFirstMission(factory, scopeA);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const first = await openSession(services, missionId);
    const second = await openSession(services, missionId);
    const third = await openSession(services, missionId);
    first.dispose(); // released by the page (navigation / retry)
    expect(h.counters.disposed).toBe(1);

    expect((await services.dispose()).status).toBe("disposed");
    expect(h.counters.disposed).toBe(3);
    for (const session of [first, second, third]) {
      expect(session.canInterrupt()).toBe(false);
      await expect(session.submit("x = 1")).rejects.toThrow("disposed");
    }
    expect(h.counters.submits).toBe(0);
  });

  it("8. a page release racing service disposal is harmless in either order", async () => {
    const factory = useFactory();
    const missionId = await unlockFirstMission(factory, scopeA);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const before = await openSession(services, missionId);
    const after = await openSession(services, missionId);

    before.dispose();
    const disposal = services.dispose();
    after.dispose();
    after.dispose();

    expect((await disposal).status).toBe("disposed");
    expect(h.counters.disposed).toBe(2);
  });

  it("9. disposal while grading is pending cancels the Submit without any AttemptRecord or reward", async () => {
    const factory = useFactory();
    const missionId = await unlockFirstMission(factory, scopeA);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const session = await openSession(services, missionId);
    const storedBefore = await rawGetAll(factory, learningDb(scopeA), "attempts");
    const grading = h.hold("runtime.submit");
    const submit = session.submit("answer = 1");
    await grading.entered;

    const disposal = services.dispose();
    grading.release(); // a late, genuine runtime result
    await expect(submit).rejects.toBeInstanceOf(MissionSubmitCancelledError);
    expect((await disposal).status).toBe("disposed");

    expect(session.getAttempts()).toEqual([]);
    expect(h.events).not.toContain("learning.addAttempt:start");
    expect(h.events).not.toContain("meta.saveState:start");
    expect(await rawGetAll(factory, learningDb(scopeA), "attempts")).toEqual(storedBefore);
  });
});

describe("M4 lifecycle - durable drain", () => {
  it("10. a Submit already past its durable-write boundary finishes both writes before anything closes", async () => {
    const factory = useFactory();
    const missionId = await unlockFirstMission(factory, scopeA);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const session = await openSession(services, missionId);
    const attemptWrite = h.hold("learning.addAttempt");
    const submit = session.submit("answer = 1");
    await attemptWrite.entered;

    const disposal = services.dispose();
    const pending = deferredFlag(disposal);
    await idle();
    expect(services.getLifecycleState()).toEqual({ status: "retiring", drain: "draining" });
    expect(pending.settled).toBe(false);

    attemptWrite.release();
    const submitted = await submit;
    expect((await disposal).status).toBe("disposed");

    const attempts = (await rawGetAll(factory, learningDb(scopeA), "attempts")) as AttemptRecord[];
    expect(attempts.map((row) => row.id)).toContain(submitted.attemptRecord.id);
    // The reward write was part of the same admitted operation, even though
    // retirement began between the two writes.
    expect((await metaStateIn(factory, scopeA))?.processedAttemptIds).toContain(submitted.attemptRecord.id);
    const lastWrite = Math.max(indexOfEvent("learning.addAttempt:ok"), indexOfEvent("meta.saveState:ok"));
    expect(indexOfEvent("meta.saveState:ok")).toBeGreaterThan(indexOfEvent("learning.addAttempt:ok"));
    expect(indexOfEvent("learning.close")).toBeGreaterThan(lastWrite);
    expect(indexOfEvent("meta.close")).toBeGreaterThan(lastWrite);
  });

  it("11. persistence never closes while a tracked write is still running", async () => {
    const factory = useFactory();
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const write = h.hold("learning.saveMissionDraft");
    const saving = services.saveMissionDraft(draftInput("activity.drain", "kept"));
    await write.entered;

    const disposal = services.dispose();
    await idle();
    expect(h.events).not.toContain("learning.close");
    expect(h.events).not.toContain("meta.close");
    for (const entry of h.created) expect(entry.store.getCloseState()).toBe("open");

    write.release();
    await saving;
    expect((await disposal).status).toBe("disposed");
    expect(indexOfEvent("learning.close")).toBeGreaterThan(indexOfEvent("learning.saveMissionDraft:ok"));
    expect(await rawGetAll(factory, learningDb(scopeA), "missionDrafts")).toEqual([
      expect.objectContaining({ activityId: "activity.drain", code: "kept" }),
    ]);
  });

  it("12. a failed durable write reaches its own caller unchanged; disposal still completes without failover", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const factory = useFactory();
    const missionId = await unlockFirstMission(factory, scopeA);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();

    const draftWrite = h.hold("learning.saveMissionDraft");
    const saving = services.saveMissionDraft(draftInput(missionId, "lost"));
    await draftWrite.entered;
    const session = await openSession(services, missionId);
    const attemptWrite = h.hold("learning.addAttempt");
    const submit = session.submit("answer = 1");
    await attemptWrite.entered;

    const disposal = services.dispose();
    const draftFailure = new Error("draft write failed");
    const attemptFailure = new Error("attempt write failed");
    draftWrite.fail(draftFailure);
    attemptWrite.fail(attemptFailure);
    await expect(saving).rejects.toBe(draftFailure);
    await expect(submit).rejects.toBe(attemptFailure); // not reinterpreted as a cancellation
    expect((await disposal).status).toBe("disposed");

    expect(h.events).not.toContain("meta.saveState:start"); // no reward for an unsaved attempt
    expect(services.getPersistenceKind()).toBe("indexeddb");
    expect(services.getMetaProgressionPersistenceKind()).toBe("indexeddb");
    expect(await rawGetAll(factory, learningDb(scopeA), "missionDrafts")).toEqual([]);
  });

  it("13. a drain timeout is reported as incomplete - never as disposal - and a later dispose() finishes it", async () => {
    const factory = useFactory();
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const write = h.hold("learning.saveMissionDraft");
    const saving = services.saveMissionDraft(draftInput("activity.slow", "eventually"));
    await write.entered;

    const incomplete = await services.dispose({ drainTimeoutMs: 0 });
    expect(incomplete).toEqual({ status: "incomplete", reason: "DRAIN_TIMEOUT", pendingDurableOperations: 1 });
    expect(services.getLifecycleState()).toEqual({ status: "retiring", drain: "incomplete" });
    expect(h.events).not.toContain("learning.close");
    expect(h.events).not.toContain("meta.close");
    for (const entry of h.created) expect(entry.store.getCloseState()).toBe("open");

    write.release();
    await saving; // the pending write was neither discarded nor moved
    expect(await rawGetAll(factory, learningDb(scopeA), "missionDrafts")).toEqual([
      expect.objectContaining({ activityId: "activity.slow", code: "eventually" }),
    ]);
    const finished = await services.dispose({ drainTimeoutMs: 0 });
    expect(finished.status).toBe("disposed");
    expect(services.getLifecycleState().status).toBe("disposed");
  });

  it("13b. an unusable drain timeout throws synchronously and retires nothing", () => {
    useFactory();
    const services = createApplicationServices({ scope: scopeA });
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => services.dispose({ drainTimeoutMs: bad })).toThrow(RangeError);
    }
    expect(services.getLifecycleState()).toEqual({ status: "active" });
  });

  it("14. a blocked (incomplete) retirement still refuses every new operation", async () => {
    const factory = useFactory();
    const missionId = await unlockFirstMission(factory, scopeA);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const write = h.hold("learning.saveMissionDraft");
    const saving = services.saveMissionDraft(draftInput(missionId, "blocking"));
    await write.entered;
    expect((await services.dispose({ drainTimeoutMs: 0 })).status).toBe("incomplete");

    const eventsBefore = h.events.length;
    await expect(services.saveMissionDraft(draftInput(missionId, "new"))).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
    await expect(services.clearLearningData()).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
    await expect(services.metaProgression.buildRobotPart(RobotPartId.CHASSIS)).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
    await expect(services.learning.recordAttempt(makeAttempt("blocked.record"))).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
    const created = await services.createMissionSession(missionId);
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.error.code).toBe(APPLICATION_SERVICES_RETIRED);
    expect(h.events.slice(eventsBefore)).toEqual([]);
    expect(h.counters.created).toBe(0);

    write.release();
    await saving;
    expect((await services.dispose()).status).toBe("disposed");
  });
});

describe("M4 lifecycle - scope and late results", () => {
  it("15. retirement never redirects a write to another scope, Guest or memory", async () => {
    const factory = useFactory();
    const servicesA = createApplicationServices({ scope: scopeA });
    const servicesB = createApplicationServices({ scope: scopeB });
    await Promise.all([servicesA.initialize(), servicesB.initialize()]);
    const createdBefore = h.created.length;

    const write = h.hold("learning.saveMissionDraft");
    const saving = servicesA.saveMissionDraft(draftInput("activity.scope", "only-A"));
    await write.entered;
    const disposal = servicesA.dispose();
    write.release();
    await saving;
    expect((await disposal).status).toBe("disposed");
    await expect(servicesA.saveMissionDraft(draftInput("activity.scope", "refused"))).rejects.toBeInstanceOf(
      ApplicationServicesRetiredError,
    );

    expect(h.created.length).toBe(createdBefore); // no store was created for the retirement
    expect(h.created.map((entry) => entry.scope)).toEqual([scopeA, scopeA, scopeB, scopeB]);
    expect(await rawGetAll(factory, learningDb(scopeA), "missionDrafts")).toEqual([
      expect.objectContaining({ code: "only-A" }),
    ]);
    expect(await rawGetAll(factory, learningDb(scopeB), "missionDrafts")).toEqual([]);
    const names = (await factory.databases()).map((info) => info.name);
    expect(names).not.toContain(GUEST_LEARNING);
    expect(names).not.toContain(GUEST_META);
    expect(servicesA.getPersistenceKind()).toBe("indexeddb");
    expect(servicesB.getLifecycleState()).toEqual({ status: "active" });
  });

  it("16. a late completion cannot publish ready state or hand out a session after retirement", async () => {
    const factory = useFactory();
    await new IndexedDbLearningPersistence(factory, scopeA).addAttempt(makeAttempt("local.late"));
    const reconcileWrite = h.hold("meta.saveState");
    const services = createApplicationServices({ scope: scopeA });
    const statuses = trackInitialization(services);
    await reconcileWrite.entered;

    const disposal = services.dispose();
    reconcileWrite.release();
    expect((await disposal).status).toBe("disposed");

    // The durable write that was already running completed and is kept...
    expect((await metaStateIn(factory, scopeA))?.processedAttemptIds).toEqual(["local.late"]);
    // ...but the retired set never became ready.
    expect(statuses).not.toContain("ready");
    expect((services.getInitializationState() as { error?: unknown }).error).toBeInstanceOf(
      ApplicationServicesRetiredError,
    );
  });

  it("17. Learning and Meta persistence close together, once each, after the last write, and report their states", async () => {
    const factory = useFactory();
    const missionId = await unlockFirstMission(factory, scopeA);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const session = await openSession(services, missionId);
    const rewardWrite = h.hold("meta.saveState");
    const submit = session.submit("answer = 1");
    await rewardWrite.entered;

    const disposal = services.dispose();
    await idle();
    expect(h.events).not.toContain("learning.close"); // learning is idle, but the set is still draining
    expect(h.events).not.toContain("meta.close");
    rewardWrite.release();
    await submit;
    const result = await disposal;

    expect(result).toEqual({ status: "disposed", persistence: { learning: "closed", metaProgression: "closed" } });
    const learningStore = h.created.find((entry) => entry.kind === "learning")!.store;
    const metaStore = h.created.find((entry) => entry.kind === "meta")!.store;
    expect(learningStore.getCloseState()).toBe("closed");
    expect(metaStore.getCloseState()).toBe("closed");
    expect(h.events.filter((event) => event.endsWith(".close"))).toHaveLength(2);
    expect(Math.min(indexOfEvent("learning.close"), indexOfEvent("meta.close"))).toBeGreaterThan(
      indexOfEvent("meta.saveState:ok"),
    );
  });
});

describe("M4 lifecycle - promise hygiene and regressions", () => {
  it("18. retirement paths leave no unhandled promise rejection", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const collector = unhandled.collect();
    try {
      const factory = useFactory();
      const missionId = await unlockFirstMission(factory, scopeA);

      // Startup cut short by retirement (eager initialize() is never awaited here).
      const snapshot = h.hold("learning.getRewardEligibleAttemptsSnapshot");
      const early = createApplicationServices({ scope: scopeA });
      await snapshot.entered;
      const earlyDisposal = early.dispose();
      snapshot.fail(new Error("read failed during retirement"));
      expect((await earlyDisposal).status).toBe("disposed");

      // Pending grading, failing durable write, refused calls, late session creation.
      const services = createApplicationServices({ scope: scopeA });
      await services.initialize();
      const session = await openSession(services, missionId);
      const grading = h.hold("runtime.submit");
      const submit = session.submit("answer = 1");
      await grading.entered;
      const draftWrite = h.hold("learning.saveMissionDraft");
      const saving = services.saveMissionDraft(draftInput(missionId, "x"));
      await draftWrite.entered;
      const prepare = h.hold("runtime.prepareMission");
      const late = services.createMissionSession(missionId, { resumeDraft: false });
      await prepare.entered;

      const disposal = services.dispose();
      const refused = services.saveMissionDraft(draftInput(missionId, "y"));
      grading.release();
      draftWrite.fail(new Error("draft failed"));
      prepare.release();

      await expect(submit).rejects.toBeInstanceOf(MissionSubmitCancelledError);
      await expect(saving).rejects.toThrow("draft failed");
      await expect(refused).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
      expect((await late).ok).toBe(false);
      expect((await disposal).status).toBe("disposed");
      await idle(10);
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });

  it("19. startup reward reconciliation is unchanged, and disposal neither repeats nor loses it", async () => {
    const factory = useFactory();
    const attempts = [makeAttempt("local.r1", { submittedAt: today(1) }), makeAttempt("local.r2", { activityId: "activity.other", submittedAt: today(2) })];
    const seed = new IndexedDbLearningPersistence(factory, scopeA);
    for (const attempt of attempts) await seed.addAttempt(attempt);
    await seed.close();

    const reference = new MetaProgressionEngine(new MemoryMetaProgressionPersistence());
    await reference.reconcileAttempts(attempts);
    const expected = reference.getSnapshot();

    const first = createApplicationServices({ scope: scopeA });
    await first.initialize();
    expect(first.metaProgression.getSnapshot().inventory).toEqual(expected.inventory);
    expect(first.metaProgression.getSnapshot().recentRewards).toEqual(expected.recentRewards);
    const stored = await metaStateIn(factory, scopeA);
    expect((await first.dispose()).status).toBe("disposed");
    expect(await metaStateIn(factory, scopeA)).toEqual(stored);

    const second = createApplicationServices({ scope: scopeA });
    await second.initialize();
    expect(second.metaProgression.getSnapshot().inventory).toEqual(expected.inventory); // no duplicate grant
    expect(await metaStateIn(factory, scopeA)).toEqual(stored);
    expect((await second.dispose()).status).toBe("disposed");
  });

  it("20. scope isolation is unchanged: the other set keeps working and a new set reads the retired scope's data", async () => {
    const factory = useFactory();
    const missionId = await unlockFirstMission(factory, scopeA);
    await unlockFirstMission(factory, scopeB);
    const servicesA = createApplicationServices({ scope: scopeA });
    const servicesB = createApplicationServices({ scope: scopeB });
    await Promise.all([servicesA.initialize(), servicesB.initialize()]);
    await servicesA.saveMissionDraft({ ...draftInput(missionId, "draft-A"), seed: "seed.A" });

    expect((await servicesA.dispose()).status).toBe("disposed");

    await servicesB.saveMissionDraft({ ...draftInput(missionId, "draft-B"), seed: "seed.B" });
    const sessionB = await openSession(servicesB, missionId);
    const submittedB = await sessionB.submit("answer = 1");
    expect(servicesB.learning.getAttempts().map((attempt) => attempt.id)).toContain(submittedB.attemptRecord.id);

    const reopenedA = createApplicationServices({ scope: scopeA });
    await reopenedA.initialize();
    const resumed = await reopenedA.createMissionSession(missionId);
    expect(resumed.ok).toBe(true);
    if (resumed.ok) {
      expect(resumed.value.resumedDraft).toBe(true);
      expect(resumed.value.initialCode).toBe("draft-A");
    }
    expect(reopenedA.learning.getAttempts().map((attempt) => attempt.id)).not.toContain(submittedB.attemptRecord.id);
    expect((await reopenedA.dispose()).status).toBe("disposed");
    expect((await servicesB.dispose()).status).toBe("disposed");
  });
});

/*
 * PHASE-04C.3D.5-R1 - cleanup failures never become `disposed`.
 *
 * Failures are injected through the same gate as above: close() rejecting /
 * throwing / leaving a store open, and a mission runtime whose dispose() throws.
 * The real services, real MissionEngine/MissionAttemptSession and real
 * (fake-indexeddb) storage are used throughout.
 */

const closeFailure = (label: string) => new Error(`${label} close failed`);

function storeOf(kind: "learning" | "meta") {
  return h.created.find((entry) => entry.kind === kind)!.store;
}

describe("R1 finding A - persistence close failures", () => {
  it("21. Learning close rejecting: not disposed, original error kept, Meta still closed, nothing reopened", async () => {
    const factory = useFactory();
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const failure = closeFailure("learning");
    h.planClose("learning", { mode: "reject-before", error: failure });

    const result = await services.dispose();

    expect(result.status).toBe("incomplete");
    if (result.status !== "incomplete" || result.reason !== "RESOURCE_CLEANUP_FAILED") throw new Error("wrong outcome");
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.resource).toBe("learning-persistence");
    expect(result.failures[0]!.error).toBe(failure); // the very same error, not a copy
    // Reported as observed: learning is still open, Meta is already closed.
    expect(result.persistence).toEqual({ learning: "open", metaProgression: "closed" });
    expect(h.events).toContain("meta.close"); // the other resource was still processed
    expect(services.getLifecycleState()).toEqual({ status: "retiring", drain: "cleanup-failed" });
    await expect(services.saveMissionDraft(draftInput("activity.x", "late"))).rejects.toBeInstanceOf(
      ApplicationServicesRetiredError,
    );
    expect(services.getPersistenceKind()).toBe("indexeddb"); // no failover to memory
    expect(h.created).toHaveLength(2); // no replacement store was created
    expect(await rawGetAll(factory, learningDb(scopeA), "missionDrafts")).toEqual([]);
  });

  it("22. Meta close rejecting after it closed: not disposed, and the closed state is not misreported as open", async () => {
    useFactory();
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const failure = closeFailure("meta");
    h.planClose("meta", { mode: "reject-after", error: failure });

    const result = await services.dispose();

    if (result.status !== "incomplete" || result.reason !== "RESOURCE_CLEANUP_FAILED") throw new Error("wrong outcome");
    expect(result.failures).toEqual([{ resource: "meta-progression-persistence", error: failure }]);
    expect(result.failures[0]!.error).toBe(failure);
    // The store really is closed; a rejected close() does not make it "open".
    expect(result.persistence).toEqual({ learning: "closed", metaProgression: "closed" });
    expect(services.getLifecycleState().status).toBe("retiring");
    expect(services.getLifecycleState()).not.toMatchObject({ status: "disposed" });
  });

  it("23. one resource closed while the other fails (throw / resolve-open): each store is reported on its own", async () => {
    useFactory();
    const synchronous = createApplicationServices({ scope: scopeA });
    await synchronous.initialize();
    const thrown = closeFailure("meta sync");
    h.planClose("meta", { mode: "throw-sync", error: thrown });
    const first = await synchronous.dispose();
    if (first.status !== "incomplete" || first.reason !== "RESOURCE_CLEANUP_FAILED") throw new Error("wrong outcome");
    expect(first.persistence).toEqual({ learning: "closed", metaProgression: "open" });
    expect(first.failures).toEqual([{ resource: "meta-progression-persistence", error: thrown }]);

    // close() resolved but the store still reports an open connection.
    h.reset();
    const silent = createApplicationServices({ scope: scopeB });
    await silent.initialize();
    h.planClose("learning", { mode: "resolve-open" });
    const second = await silent.dispose();
    if (second.status !== "incomplete" || second.reason !== "RESOURCE_CLEANUP_FAILED") throw new Error("wrong outcome");
    expect(second.persistence).toEqual({ learning: "open", metaProgression: "closed" });
    expect(second.failures).toHaveLength(1);
    expect(second.failures[0]!.resource).toBe("learning-persistence");
    expect(second.failures[0]!.error).toBeInstanceOf(Error);
    expect(silent.getLifecycleState().status).toBe("retiring");
  });

  it("23b. a getCloseState() that throws is a failure with an `unknown` state, never a disposal", async () => {
    useFactory();
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    h.stateThrows.add("learning");
    const result = await services.dispose();
    if (result.status !== "incomplete" || result.reason !== "RESOURCE_CLEANUP_FAILED") throw new Error("wrong outcome");
    expect(result.persistence).toEqual({ learning: "unknown", metaProgression: "closed" });
    expect(result.failures.map((failure) => failure.resource)).toEqual(["learning-persistence"]);
  });

  it("24. both stores terminal - closed or closed-pending-open - is a real disposal with no failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const factory = useFactory();
    await seedLearningV1Database(factory, learningDb(scopeA), { attempts: [makeAttempt("legacy.2")] });
    const blocker = await openRawConnection(factory, learningDb(scopeA));
    try {
      const services = createApplicationServices({ scope: scopeA });
      await expect(services.initialize()).rejects.toBeInstanceOf(PersistenceUpgradeBlockedError);
      const result = await services.dispose();
      expect(result).toEqual({
        status: "disposed",
        persistence: { learning: "closed-pending-open", metaProgression: "closed" },
      });
      expect("failures" in result).toBe(false);
      expect(services.getLifecycleState()).toEqual({
        status: "disposed",
        persistence: { learning: "closed-pending-open", metaProgression: "closed" },
      });
    } finally {
      blocker.close();
    }
  });

  it("25. dispose() again after an incomplete cleanup retries it; a second failure keeps the FIRST error", async () => {
    useFactory();
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const states: string[] = [];
    services.subscribeLifecycle(() => {
      const state = services.getLifecycleState();
      states.push(state.status === "retiring" ? `retiring:${state.drain}` : state.status);
    });
    const firstError = closeFailure("learning #1");
    const secondError = closeFailure("learning #2");
    h.planClose("learning", { mode: "reject-before", error: firstError }, { mode: "reject-before", error: secondError });

    const one = await services.dispose();
    const two = await services.dispose();
    for (const attempt of [one, two]) {
      if (attempt.status !== "incomplete" || attempt.reason !== "RESOURCE_CLEANUP_FAILED") throw new Error("wrong outcome");
      expect(attempt.failures).toHaveLength(1);
    }
    // Each attempt reports the error of ITS close() call; none is swallowed.
    expect((one as any).failures[0].error).toBe(firstError);
    expect((two as any).failures[0].error).toBe(secondError);

    // Third attempt: the store closes properly now -> a real disposal.
    const three = await services.dispose();
    expect(three).toEqual({ status: "disposed", persistence: { learning: "closed", metaProgression: "closed" } });
    expect(states).toEqual([
      "retiring:draining",
      "retiring:cleanup-failed",
      "retiring:draining",
      "retiring:cleanup-failed",
      "retiring:draining",
      "disposed",
    ]);

    // Idempotent from here: cached, no further close calls, same object.
    const closesBefore = h.events.filter((event) => event.endsWith(".close")).length;
    expect(await services.dispose()).toBe(three);
    expect(h.events.filter((event) => event.endsWith(".close"))).toHaveLength(closesBefore);
  });

  it("25b. concurrent dispose() calls during a failing cleanup share one attempt", async () => {
    useFactory();
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    h.planClose("meta", { mode: "reject-before", error: closeFailure("meta") });
    const [a, b] = await Promise.all([services.dispose(), services.dispose()]);
    expect(a).toBe(b);
    expect(h.events.filter((event) => event === "meta.close")).toHaveLength(1);
    expect(h.events.filter((event) => event === "learning.close")).toHaveLength(1);
  });

  it("26. no false disposed result: every close failure mode stays non-active and refuses all work", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const modes = [
      { kind: "learning", plan: { mode: "reject-before", error: closeFailure("a") } },
      { kind: "learning", plan: { mode: "reject-after", error: closeFailure("b") } },
      { kind: "learning", plan: { mode: "throw-sync", error: closeFailure("c") } },
      { kind: "learning", plan: { mode: "resolve-open" } },
      { kind: "meta", plan: { mode: "reject-before", error: closeFailure("d") } },
      { kind: "meta", plan: { mode: "reject-after", error: closeFailure("e") } },
      { kind: "meta", plan: { mode: "throw-sync", error: closeFailure("f") } },
      { kind: "meta", plan: { mode: "resolve-open" } },
    ] as const;
    for (const { kind, plan } of modes) {
      h.reset();
      useFactory();
      const services = createApplicationServices({ scope: scopeA });
      await services.initialize();
      h.planClose(kind, plan);
      const result = await services.dispose();
      expect(result.status, `${kind}/${plan.mode}`).toBe("incomplete");
      expect(result).toMatchObject({ reason: "RESOURCE_CLEANUP_FAILED" });
      expect(services.getLifecycleState().status, `${kind}/${plan.mode}`).toBe("retiring");
      await expect(services.clearLearningData()).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
      await expect(services.metaProgression.clearAll()).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
      expect((await services.createMissionSession("activity.x")).ok).toBe(false);
    }
  });

  it("26b. a drain timeout stays DRAIN_TIMEOUT (nothing is closed); a close failure is never reported as one", async () => {
    useFactory();
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    h.planClose("learning", { mode: "reject-before", error: closeFailure("later") });
    const write = h.hold("learning.saveMissionDraft");
    const saving = services.saveMissionDraft(draftInput("activity.slow", "x"));
    await write.entered;

    const timeout = await services.dispose({ drainTimeoutMs: 0 });
    expect(timeout).toEqual({ status: "incomplete", reason: "DRAIN_TIMEOUT", pendingDurableOperations: 1 });
    expect(services.getLifecycleState()).toEqual({ status: "retiring", drain: "incomplete" });
    expect(h.events).not.toContain("learning.close");

    write.release();
    await saving;
    const afterDrain = await services.dispose();
    expect(afterDrain).toMatchObject({ status: "incomplete", reason: "RESOURCE_CLEANUP_FAILED" });
    expect((await services.dispose()).status).toBe("disposed");
  });
});

describe("R1 finding B - resource disposal exception safety", () => {
  it("27. a throwing runtime dispose does not stop the other sessions; retirement is synchronous; result is incomplete with the original error", async () => {
    const factory = useFactory();
    const missionId = await unlockFirstMission(factory, scopeA);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const first = await openSession(services, missionId);
    const second = await openSession(services, missionId);
    const third = await openSession(services, missionId);
    const storedBefore = await rawGetAll(factory, learningDb(scopeA), "attempts");
    const boom = new Error("runtime worker would not terminate");
    h.failRuntimeDispose(boom); // the FIRST runtime to be disposed throws

    let disposal!: ReturnType<ApplicationServices["dispose"]>;
    expect(() => {
      disposal = services.dispose();
    }).not.toThrow();
    // Synchronous retirement, with every runtime already attempted.
    expect(services.getLifecycleState()).toEqual({ status: "retiring", drain: "draining" });
    expect(h.counters.disposed).toBe(3);
    await expect(services.saveMissionDraft(draftInput(missionId, "x"))).rejects.toBeInstanceOf(ApplicationServicesRetiredError);

    const result = await disposal;
    if (result.status !== "incomplete" || result.reason !== "RESOURCE_CLEANUP_FAILED") throw new Error("wrong outcome");
    expect(result.failures).toEqual([{ resource: "mission-session", error: boom }]);
    expect(result.failures[0]!.error).toBe(boom);
    // Persistence was still drained and closed: the failing runtime cannot write.
    expect(result.persistence).toEqual({ learning: "closed", metaProgression: "closed" });
    expect(services.getLifecycleState()).toEqual({ status: "retiring", drain: "cleanup-failed" });

    // M1 cancellation holds for every session, including the failing one.
    for (const session of [first, second, third]) {
      expect(session.canInterrupt()).toBe(false);
      await expect(session.submit("x = 1")).rejects.toThrow("disposed");
    }
    expect(h.counters.submits).toBe(0);
    expect(await rawGetAll(factory, learningDb(scopeA), "attempts")).toEqual(storedBefore); // nothing added or removed
  });

  it("28. a failed session cleanup is retried by the next dispose() and only then becomes disposed", async () => {
    const factory = useFactory();
    const missionId = await unlockFirstMission(factory, scopeA);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    await openSession(services, missionId);
    await openSession(services, missionId);
    h.failRuntimeDispose(new Error("first teardown fails"));

    const one = await services.dispose();
    expect(one).toMatchObject({ status: "incomplete", reason: "RESOURCE_CLEANUP_FAILED" });
    expect(h.counters.disposed).toBe(2);

    const two = await services.dispose(); // retries ONLY the unresolved runtime
    expect(h.counters.disposed).toBe(3);
    expect(two).toEqual({ status: "disposed", persistence: { learning: "closed", metaProgression: "closed" } });
    expect(await services.dispose()).toBe(two);
    expect(h.counters.disposed).toBe(3); // nothing disposed twice once clean
  });

  it("29. a persistent runtime failure never becomes disposed and keeps the FIRST error", async () => {
    const factory = useFactory();
    const missionId = await unlockFirstMission(factory, scopeA);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const session = await openSession(services, missionId);
    const original = new Error("teardown #1");
    h.failRuntimeDisposeAlways((call) => (call === 1 ? original : new Error(`teardown #${call}`)));

    const one = await services.dispose();
    const two = await services.dispose();
    for (const result of [one, two]) {
      if (result.status !== "incomplete" || result.reason !== "RESOURCE_CLEANUP_FAILED") throw new Error("wrong outcome");
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]!.error).toBe(original);
    }
    expect(services.getLifecycleState().status).toBe("retiring");

    // The page releasing the same session sees the failure instead of a silent success.
    expect(() => session.dispose()).toThrow("teardown #1");
  });

  it("30. an already-admitted Submit write still completes when a runtime dispose throws; no failed AttemptRecord appears", async () => {
    const factory = useFactory();
    const missionId = await unlockFirstMission(factory, scopeA);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const session = await openSession(services, missionId);
    const storedBefore = (await rawGetAll(factory, learningDb(scopeA), "attempts")) as AttemptRecord[];
    const attemptWrite = h.hold("learning.addAttempt");
    const submit = session.submit("answer = 1");
    await attemptWrite.entered; // past the M1 durable-write boundary
    h.failRuntimeDispose(new Error("teardown fails while the write is running"));

    const disposal = services.dispose();
    await idle();
    expect(h.events).not.toContain("learning.close"); // still draining

    attemptWrite.release();
    const submitted = await submit;
    const result = await disposal;

    expect(result).toMatchObject({ status: "incomplete", reason: "RESOURCE_CLEANUP_FAILED" });
    const attempts = (await rawGetAll(factory, learningDb(scopeA), "attempts")) as AttemptRecord[];
    expect(attempts.filter((row) => row.id === submitted.attemptRecord.id)).toHaveLength(1);
    expect(attempts).toHaveLength(storedBefore.length + 1); // exactly the Submit's own record, nothing synthetic
    expect((await metaStateIn(factory, scopeA))?.processedAttemptIds).toContain(submitted.attemptRecord.id);
    const lastWrite = Math.max(indexOfEvent("learning.addAttempt:ok"), indexOfEvent("meta.saveState:ok"));
    expect(indexOfEvent("learning.close")).toBeGreaterThan(lastWrite);
  });

  it("32. a drain timeout together with an unresolved session cleanup reports both", async () => {
    const factory = useFactory();
    const missionId = await unlockFirstMission(factory, scopeA);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    await openSession(services, missionId);
    const boom = new Error("teardown");
    h.failRuntimeDispose(boom);
    const write = h.hold("learning.saveMissionDraft");
    const saving = services.saveMissionDraft(draftInput(missionId, "x"));
    await write.entered;

    const result = await services.dispose({ drainTimeoutMs: 0 });
    expect(result).toEqual({
      status: "incomplete",
      reason: "DRAIN_TIMEOUT",
      pendingDurableOperations: 1,
      failures: [{ resource: "mission-session", error: boom }],
    });
    write.release();
    await saving;
    expect((await services.dispose()).status).toBe("disposed"); // retried the runtime, closed both
  });

  it("33. cleanup failures leave no unhandled rejection", async () => {
    const collector = unhandled.collect();
    try {
      const factory = useFactory();
      const missionId = await unlockFirstMission(factory, scopeA);
      const services = createApplicationServices({ scope: scopeA });
      await services.initialize();
      await openSession(services, missionId);
      h.failRuntimeDispose(new Error("x"));
      h.planClose("learning", { mode: "reject-before", error: closeFailure("l") });
      h.planClose("meta", { mode: "throw-sync", error: closeFailure("m") });
      expect((await services.dispose()).status).toBe("incomplete");
      expect((await services.dispose()).status).toBe("disposed");
      await idle(10);
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });
});

/*
 * PHASE-04C.3D.5-R2 - a loading engine is owned until its load AND its cleanup
 * have settled; `disposed` is never reported before that.
 *
 * Audited timing (see the R2 report): `dispose()` disposes the loading engine
 * synchronously (runtime torn down), but `openMissionSession` is still awaiting
 * `engine.loadMission()`. Before R2 nothing tracked that continuation, so
 * `drainAndClose` saw "no durable work", closed persistence and cached
 * `disposed` while the continuation had not run its own cleanup yet.
 * `engine.dispose` is spied (never replaced) to make that ordering observable.
 */

function spyEngineDispose(): void {
  const original = MissionEngine.prototype.dispose;
  vi.spyOn(MissionEngine.prototype, "dispose").mockImplementation(function (this: MissionEngine) {
    h.events.push("engine.dispose");
    return original.call(this);
  });
}

/** A service set with one mission load held inside runtime.prepareMission. */
async function startHeldLoad(scope: PersistenceScope) {
  const factory = useFactory();
  const missionId = await unlockFirstMission(factory, scope);
  const services = createApplicationServices({ scope });
  await services.initialize();
  const prepare = h.hold("runtime.prepareMission");
  const pending = services.createMissionSession(missionId, { resumeDraft: false });
  await prepare.entered;
  return { factory, missionId, services, prepare, pending };
}

describe("R2 - late loading-engine cleanup", () => {
  it("34. dispose() during a pending loadMission retires at once but is not `disposed` until the load has settled", async () => {
    spyEngineDispose();
    const { services, prepare, pending } = await startHeldLoad(scopeA);

    const disposal = services.dispose();
    // G/H: retirement is already effective, the engine is already torn down.
    expect(services.getLifecycleState()).toEqual({ status: "retiring", drain: "draining" });
    expect(h.counters.disposed).toBe(1);
    expect(h.events.filter((event) => event === "engine.dispose")).toHaveLength(1);

    const state = deferredFlag(disposal);
    await idle(10);
    expect(state.settled).toBe(false); // the load is still pending -> not disposed
    expect(h.events).not.toContain("learning.close");
    expect(h.events).not.toContain("meta.close");

    prepare.release();
    const created = await pending;
    expect(created.ok).toBe(false);
    const result = await disposal;
    expect(result).toEqual({ status: "disposed", persistence: { learning: "closed", metaProgression: "closed" } });

    // Real ordering: the load's own cleanup ran BEFORE persistence closed.
    const cleanupRan = h.events.lastIndexOf("engine.dispose");
    expect(cleanupRan).toBeGreaterThan(h.events.indexOf("runtime.prepareMission:ok"));
    expect(h.events.indexOf("learning.close")).toBeGreaterThan(cleanupRan);
    expect(h.events.indexOf("meta.close")).toBeGreaterThan(cleanupRan);
    expect(h.counters.disposed).toBe(1); // the runtime itself was disposed exactly once
  });

  it("35. a late SUCCESSFUL load never yields a usable session from a retired service", async () => {
    const { factory, services, prepare, pending } = await startHeldLoad(scopeA);
    const attemptsBefore = await rawGetAll(factory, learningDb(scopeA), "attempts");

    const disposal = services.dispose();
    prepare.release(); // loadMission resolves ok after retirement
    const created = await pending;

    expect(created).toEqual({ ok: false, error: expect.objectContaining({ code: APPLICATION_SERVICES_RETIRED }) });
    expect((await disposal).status).toBe("disposed");
    expect(h.counters.submits).toBe(0);
    expect(await rawGetAll(factory, learningDb(scopeA), "attempts")).toEqual(attemptsBefore); // no AttemptRecord at all
  });

  it("36. a late REJECTED load is observed by the service (retired failure, no unhandled rejection) and still gates disposal", async () => {
    const collector = unhandled.collect();
    try {
      spyEngineDispose();
      const { services, prepare, pending } = await startHeldLoad(scopeA);
      const disposal = services.dispose();
      const state = deferredFlag(disposal);

      prepare.fail(new Error("runtime died while loading"));
      const created = await pending;
      expect(created).toEqual({ ok: false, error: expect.objectContaining({ code: APPLICATION_SERVICES_RETIRED }) });
      expect((await disposal).status).toBe("disposed");
      expect(state.settled).toBe(true);
      expect(h.events.indexOf("learning.close")).toBeGreaterThan(h.events.indexOf("runtime.prepareMission:error"));
      await idle(10);
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });

  it("37. a cleanup that fails again LATE (inside the pending load) decides the outcome: incomplete, original error, resource named", async () => {
    spyEngineDispose();
    const { services, prepare, pending } = await startHeldLoad(scopeA);
    const original = new Error("runtime teardown failed at retirement");
    const late = new Error("runtime teardown failed again in the late continuation");
    h.failRuntimeDispose(original, late);

    const disposal = services.dispose(); // retirement-time dispose throws -> retained, not thrown
    const state = deferredFlag(disposal);
    await idle(10);
    expect(state.settled).toBe(false); // may not answer before the late cleanup has happened
    expect(h.counters.disposed).toBe(1);

    prepare.release();
    await pending;
    const result = await disposal;

    if (result.status !== "incomplete" || result.reason !== "RESOURCE_CLEANUP_FAILED") throw new Error("wrong outcome");
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]!.resource).toBe("mission-engine");
    expect(result.failures[0]!.error).toBe(original); // the first error, not the late one
    expect(h.counters.disposed).toBe(2); // the late continuation retried the runtime teardown...
    const retried = h.events.lastIndexOf("runtime.dispose");
    expect(retried).toBeGreaterThan(h.events.indexOf("runtime.prepareMission:ok")); // ...after the load settled
    expect(h.events.indexOf("learning.close")).toBeGreaterThan(retried); // ...and before anything closed
    expect(services.getLifecycleState()).toEqual({ status: "retiring", drain: "cleanup-failed" });
  });

  it("38. a cleanup that failed at retirement but succeeded in the late continuation is genuinely clean", async () => {
    const { services, prepare, pending } = await startHeldLoad(scopeA);
    h.failRuntimeDispose(new Error("fails once"));
    const disposal = services.dispose();
    prepare.release();
    await pending;
    const result = await disposal;
    expect(result).toEqual({ status: "disposed", persistence: { learning: "closed", metaProgression: "closed" } });
    expect(h.counters.disposed).toBe(2);
    expect(await services.dispose()).toBe(result); // cached, nothing runs again
    expect(h.counters.disposed).toBe(2);
  });

  it("39. retry semantics: a failure that cannot be cleaned up is reported on every attempt, then clears when it can", async () => {
    const { services, prepare, pending } = await startHeldLoad(scopeA);
    const original = new Error("teardown #1");
    h.failRuntimeDisposeAlways((call) => (call === 1 ? original : new Error(`teardown #${call}`)));
    const first = services.dispose();
    prepare.release();
    await pending;

    for (const attempt of [await first, await services.dispose(), await services.dispose()]) {
      if (attempt.status !== "incomplete" || attempt.reason !== "RESOURCE_CLEANUP_FAILED") throw new Error("wrong outcome");
      expect(attempt.failures).toHaveLength(1);
      expect(attempt.failures[0]!.error).toBe(original); // never replaced, never silently dropped
      expect(services.getLifecycleState().status).toBe("retiring");
    }

    h.stopFailingRuntimeDispose();
    expect((await services.dispose()).status).toBe("disposed");
  });

  it("40. a load that never settles gives a bounded, explicit incomplete outcome - a timeout is not a cleanup success", async () => {
    const { services, prepare, pending } = await startHeldLoad(scopeA);

    const timeout = await services.dispose({ drainTimeoutMs: 0 });
    expect(timeout).toEqual({
      status: "incomplete",
      reason: "DRAIN_TIMEOUT",
      pendingDurableOperations: 0,
      pendingMissionLoads: 1,
    });
    expect(services.getLifecycleState()).toEqual({ status: "retiring", drain: "incomplete" });
    expect(h.events).not.toContain("learning.close");
    expect(h.events).not.toContain("meta.close");
    for (const entry of h.created) expect(entry.store.getCloseState()).toBe("open");
    expect((await services.createMissionSession("anything")).ok).toBe(false);

    // A second bounded attempt behaves the same; the late load is still not forgotten.
    expect(await services.dispose({ drainTimeoutMs: 0 })).toMatchObject({ reason: "DRAIN_TIMEOUT", pendingMissionLoads: 1 });

    prepare.release();
    await pending;
    expect((await services.dispose()).status).toBe("disposed");
  });

  it("41. several loading engines, one cleanup failure: every engine is awaited and only the failing one is reported", async () => {
    const factory = useFactory();
    const missionId = await unlockFirstMission(factory, scopeA);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const firstPrepare = h.hold("runtime.prepareMission");
    const first = services.createMissionSession(missionId, { resumeDraft: false });
    await firstPrepare.entered;
    const secondPrepare = h.hold("runtime.prepareMission");
    const second = services.createMissionSession(missionId, { resumeDraft: false });
    await secondPrepare.entered;
    const original = new Error("first engine teardown");
    // runtime.dispose() call 1 = first engine at retirement, 2 = second engine, 3 = first engine's late retry.
    h.failRuntimeDisposeAlways((call) => (call === 1 ? original : call === 3 ? new Error("retried") : undefined));

    const disposal = services.dispose();
    const state = deferredFlag(disposal);
    expect(h.counters.disposed).toBe(2); // both torn down synchronously; the first one threw

    secondPrepare.release(); // one load settles; the other is still pending
    await second;
    await idle(10);
    expect(state.settled).toBe(false);

    firstPrepare.release();
    await first;
    const result = await disposal;
    if (result.status !== "incomplete" || result.reason !== "RESOURCE_CLEANUP_FAILED") throw new Error("wrong outcome");
    expect(result.failures).toEqual([{ resource: "mission-engine", error: original }]);
    expect(result.persistence).toEqual({ learning: "closed", metaProgression: "closed" });
  });

  it("42. an already-admitted durable write still finishes before persistence closes, together with a pending load", async () => {
    const { factory, missionId, services, prepare, pending } = await startHeldLoad(scopeA);
    const attemptsBefore = await rawGetAll(factory, learningDb(scopeA), "attempts");
    const write = h.hold("learning.saveMissionDraft");
    const saving = services.saveMissionDraft(draftInput(missionId, "kept"));
    await write.entered;

    const disposal = services.dispose();
    prepare.release(); // the load settles first...
    await pending;
    await idle(10);
    expect(h.events).not.toContain("learning.close"); // ...but the write is still running

    write.release();
    await saving;
    expect((await disposal).status).toBe("disposed");
    expect(h.events.indexOf("learning.close")).toBeGreaterThan(h.events.indexOf("learning.saveMissionDraft:ok"));
    expect(await rawGetAll(factory, learningDb(scopeA), "missionDrafts")).toEqual([
      expect.objectContaining({ activityId: missionId, code: "kept" }),
    ]);
    expect(await rawGetAll(factory, learningDb(scopeA), "attempts")).toEqual(attemptsBefore); // no artificial AttemptRecord
  });

  it("43. a pending load does not make a later writer wait in vain: the load and the write settle in either order", async () => {
    const { missionId, services, prepare, pending } = await startHeldLoad(scopeA);
    const write = h.hold("learning.saveMissionDraft");
    const saving = services.saveMissionDraft(draftInput(missionId, "first"));
    await write.entered;
    const disposal = services.dispose();

    write.release(); // the write settles first this time
    await saving;
    await idle(10);
    expect(h.events).not.toContain("learning.close"); // the load is still pending
    prepare.release();
    await pending;
    expect((await disposal).status).toBe("disposed");
    expect(h.events.indexOf("learning.close")).toBeGreaterThan(h.events.indexOf("runtime.prepareMission:ok"));
  });

  it("44. late load failures and cleanup failures leave no unhandled rejection", async () => {
    const collector = unhandled.collect();
    try {
      const { services, prepare, pending } = await startHeldLoad(scopeA);
      h.failRuntimeDispose(new Error("a"), new Error("b"));
      const disposal = services.dispose();
      prepare.fail(new Error("load failed"));
      await pending;
      expect((await disposal).status).toBe("incomplete");
      expect((await services.dispose()).status).toBe("disposed");
      await idle(10);
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });
});
