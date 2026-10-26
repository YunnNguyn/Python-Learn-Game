import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getOrderedActivityIds } from "../../src/app/learning-path";
import {
  createApplicationServices,
  type ApplicationServices,
  type PlayableMissionSession,
} from "../../src/app/services/application-services";
import { ApplicationServicesRetiredError } from "../../src/app/services/application-lifecycle";
import { MISSION_DRAFT_DEBOUNCE_MS } from "../../src/app/services/mission-draft-scheduler";
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
import { MissionEngine } from "../../src/core/missions";
import {
  IndexedDbLearningPersistence,
  accountScope,
  resolveScopedDatabaseName,
  type PersistenceScope,
} from "../../src/core/persistence";
import { rawGetAll } from "../persistence/indexeddb-test-utils";

/**
 * PHASE-04C.3D.7 (M6) - Clear vs Submit/draft serialization through the REAL
 * application services and REAL (fake-indexeddb) storage.
 *
 * Determinism: persistence and runtime are wrapped (never replaced) by a gate; a
 * test can hold the NEXT call of one method until it releases or fails it. Timers
 * are fake (setTimeout/clearTimeout/Date only); IndexedDB keeps using the real
 * macrotask queue, which `untilEvent` yields to - bounded by a count of turns,
 * never by a wall-clock sleep.
 */

const h = vi.hoisted(() => {
  class Hold {
    readonly entered: Promise<void>;
    private markEntered!: () => void;
    private decide!: (decision: { readonly failed: boolean; readonly error?: unknown }) => void;
    private readonly decision: Promise<{ readonly failed: boolean; readonly error?: unknown }>;

    constructor(readonly key: string) {
      this.entered = new Promise<void>((resolve) => {
        this.markEntered = resolve;
      });
      this.decision = new Promise((resolve) => {
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

  async function pass<T>(key: string, label: string, run: () => Promise<T>): Promise<T> {
    events.push(`${key}:start${label}`);
    const hold = holds.get(key)?.shift();
    try {
      if (hold !== undefined) await hold.wait();
      const value = await run();
      events.push(`${key}:ok${label}`);
      return value;
    } catch (error) {
      events.push(`${key}:error${label}`);
      throw error;
    }
  }

  function hold(key: string): Hold {
    const created = new Hold(key);
    holds.set(key, [...(holds.get(key) ?? []), created]);
    return created;
  }

  const labelOf = (method: string, args: unknown[]): string => {
    if (method === "saveMissionDraft") return `:${(args[0] as { code: string }).code}`;
    if (method === "deleteMissionDraft") return `:${String(args[0])}`;
    return "";
  };

  function wrapLearning(inner: any): any {
    const call =
      (method: string) =>
      (...args: unknown[]) =>
        pass(`learning.${method}`, labelOf(method, args), () => inner[method](...args));
    return {
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
      close: () => {
        events.push("learning.close");
        return inner.close();
      },
      getCloseState: () => inner.getCloseState(),
    };
  }

  function wrapMeta(inner: any): any {
    return {
      get kind() {
        return inner.kind;
      },
      loadState: (...args: unknown[]) => pass("meta.loadState", "", () => inner.loadState(...args)),
      saveState: (...args: unknown[]) => pass("meta.saveState", "", () => inner.saveState(...args)),
      clear: (...args: unknown[]) => pass("meta.clear", "", () => inner.clear(...args)),
      close: () => {
        events.push("meta.close");
        return inner.close();
      },
      getCloseState: () => inner.getCloseState(),
    };
  }

  const create = () => ({
    initialize: () => pass("runtime.initialize", "", async () => ({ ok: true as const })),
    prepareMission: () => pass("runtime.prepareMission", "", async () => ({ ok: true as const })),
    run: async () => ({ status: "SUCCESS" as const, stdout: "", stderr: "" }),
    submit: async () => ({ status: "SUCCESS" as const, stdout: "", stderr: "", serialized: { variables: {} } }),
    dispose: () => {
      events.push("runtime.dispose");
    },
  });

  function reset(): void {
    events.length = 0;
    holds.clear();
  }

  return { events, hold, wrapLearning, wrapMeta, create, reset };
});

vi.mock("../../src/core/runtime/pyodide", () => ({ createPyodideRuntimeManager: h.create }));
vi.mock("../../src/core/runtime/local-python", () => ({ createLocalPythonRuntimeManager: h.create }));
vi.mock("../../src/core/persistence/browser-learning-persistence", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/core/persistence/browser-learning-persistence")>();
  return {
    ...real,
    createBrowserLearningPersistence: (scope?: PersistenceScope) => h.wrapLearning(real.createBrowserLearningPersistence(scope)),
  };
});
vi.mock("../../src/core/meta-progression/browser-meta-progression-persistence", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../../src/core/meta-progression/browser-meta-progression-persistence")>();
  return {
    ...real,
    createBrowserMetaProgressionPersistence: (scope?: PersistenceScope) => h.wrapMeta(real.createBrowserMetaProgressionPersistence(scope)),
  };
});

const GUEST_LEARNING = "python-learn-game";
const scopeA = accountScope("acct-drafts-A");
const scopeB = accountScope("acct-drafts-B");
const learningDb = (scope: PersistenceScope) => resolveScopedDatabaseName(GUEST_LEARNING, scope);

const NOW = new Date("2026-10-16T01:00:00.000Z");

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
    startedAt: "2026-10-16T00:59:00.000Z",
    submittedAt: "2026-10-16T00:59:30.000Z",
    passed: true,
    submissionIndex: 1,
    runCountBeforeSubmit: 0,
    hintsUsed: [],
    runtimeErrorCount: 0,
    ...overrides,
  });
}

function useFactory(): IDBFactory {
  const factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  return factory;
}

/** One turn of the real macrotask queue (fake timers never touch setImmediate). */
const nextMacrotask = (): Promise<void> =>
  new Promise<void>((resolve) =>
    (globalThis as unknown as { setImmediate: (callback: () => void) => unknown }).setImmediate(resolve),
  );

/** Yields to the real macrotask queue until `event` was logged (at most `limit` turns); fails if it never was. */
async function untilEvent(event: string, limit = 400): Promise<void> {
  for (let turn = 0; turn < limit; turn += 1) {
    if (h.events.includes(event)) return;
    await nextMacrotask();
  }
  throw new Error(`event never happened: ${event}\n${h.events.join("\n")}`);
}

/** Lets already-started storage work run; used before asserting that something did NOT happen. */
async function idle(turns = 15): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await nextMacrotask();
}

/**
 * The first `count` executable missions of the course, unlocked for `scope` by
 * IMPORTED (reward-free) passed attempts of every activity before the last one.
 */
async function unlockMissions(factory: IDBFactory, scope: PersistenceScope, count: number): Promise<LearningActivityId[]> {
  const content = new ContentRegistry();
  registerCs116ProductionContent(content);
  const ordered = getOrderedActivityIds(content);
  const executable = ordered.filter((id) => {
    const type = content.getActivity(id)?.type;
    return (
      type === LearningActivityType.CODE_MISSION ||
      type === LearningActivityType.DEBUG_MISSION ||
      type === LearningActivityType.BOSS_MISSION
    );
  });
  const missions = executable.slice(0, count);
  expect(missions).toHaveLength(count);
  const last = ordered.indexOf(missions[missions.length - 1]!);
  const store = new IndexedDbLearningPersistence(factory, scope);
  for (let index = 0; index < last; index += 1) {
    await store.importAttemptIfAbsent(
      makeAttempt(`imported.${index}`, { activityId: ordered[index], submittedAt: "2026-10-16T00:58:00.000Z" }),
      "cloud-import",
    );
  }
  await store.close();
  return missions;
}

async function openPlayable(
  services: ApplicationServices,
  missionId: string,
  options: { resumeDraft?: boolean } = { resumeDraft: false },
): Promise<PlayableMissionSession> {
  const created = await services.createMissionSession(missionId, options);
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error(created.error.message);
  return created.value;
}

function stubSubmit(passed: boolean) {
  return vi.spyOn(MissionEngine.prototype, "submit").mockImplementation(async () => ({
    execution: { status: "SUCCESS" as const, stdout: "", stderr: "" },
    grading: { passed, checks: [] },
  }));
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

const draftRows = (factory: IDBFactory, scope: PersistenceScope) =>
  rawGetAll(factory, learningDb(scope), "missionDrafts") as Promise<Array<{ activityId: string; code: string; hintsUsed: string[] }>>;

beforeEach(() => {
  h.reset();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});


const GUEST_META = "python-learn-game-meta";
const metaDb = (scope: PersistenceScope) => resolveScopedDatabaseName(GUEST_META, scope);

const attemptRows = async (factory: IDBFactory, scope: PersistenceScope) =>
  ((await rawGetAll(factory, learningDb(scope), "attempts")) as Array<{ id: string }>).map((row) => row.id).sort();

/** Attempt ids the reward ledger has processed (empty when nothing is stored). */
async function rewardedAttempts(factory: IDBFactory, scope: PersistenceScope): Promise<string[]> {
  const rows = (await rawGetAll(factory, metaDb(scope), "progressionState")) as Array<{
    state: { processedAttemptIds: string[] };
  }>;
  return rows.flatMap((row) => row.state.processedAttemptIds).sort();
}

/** The seeded unlock attempts every test starts with; everything else is learner work. */
const learnerWork = (ids: string[]) => ids.filter((id) => !id.startsWith("imported."));

/** After a Clear the course is locked again; the unlocking attempts are recorded through the engine. */
async function reunlock(services: ApplicationServices, missionId: LearningActivityId): Promise<void> {
  const content = new ContentRegistry();
  registerCs116ProductionContent(content);
  const ordered = getOrderedActivityIds(content);
  const last = ordered.indexOf(missionId);
  for (let index = 0; index < last; index += 1) {
    await services.learning.recordAttempt(
      makeAttempt(`reunlocked.${index}`, { activityId: ordered[index], submittedAt: "2026-10-16T00:58:00.000Z" }),
    );
  }
}

async function started(scope: PersistenceScope = scopeA, missions = 1) {
  const factory = useFactory();
  const ids = await unlockMissions(factory, scope, missions);
  const services = createApplicationServices({ scope });
  await services.initialize();
  return { factory, ids, services };
}

/** Resolves with true when `promise` settled within `turns` macrotasks, else false - a deadlock detector without wall-clock waits. */
async function settledWithin(promise: Promise<unknown>, turns = 60): Promise<boolean> {
  let done = false;
  promise.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  for (let turn = 0; turn < turns && !done; turn += 1) await nextMacrotask();
  return done;
}

const startedEvents = (prefix: string) => h.events.filter((event) => event.startsWith(prefix));
const indexOfEvent = (event: string) => h.events.indexOf(event);

describe("M6 Clear - ordering against drafts", () => {
  it("1. Clear with nothing concurrent clears attempts, drafts and rewards in the existing order and resets the engines", async () => {
    const { factory, ids, services } = await started();
    const { draft, session } = await openPlayable(services, ids[0]!);
    stubSubmit(true);
    draft.update({ code: "kept until Clear", hintsUsed: [] }, { immediate: true });
    await untilEvent("learning.saveMissionDraft:ok:kept until Clear");
    const outcome = await session.submit("answer = 1");
    await idle();
    expect(learnerWork(await attemptRows(factory, scopeA))).toEqual([outcome.attemptRecord.id]);
    expect(await rewardedAttempts(factory, scopeA)).toContain(outcome.attemptRecord.id);
    draft.update({ code: "typed after the pass", hintsUsed: [] }, { immediate: true });
    await idle();

    h.events.length = 0;
    await services.clearLearningData();
    expect(h.events.filter((event) => /^(learning\.clear|meta\.clear)/.test(event) && event.includes(":start"))).toEqual([
      "learning.clearAttempts:start",
      "learning.clearMissionDrafts:start",
      "meta.clear:start",
    ]);
    expect(await attemptRows(factory, scopeA)).toEqual([]);
    expect(await draftRows(factory, scopeA)).toEqual([]);
    expect(await rewardedAttempts(factory, scopeA)).toEqual([]);
    expect(services.learning.getAttempts()).toEqual([]);
    expect(services.metaProgression.getSnapshot().builtRobotPartIds).toEqual([]);
    await services.dispose();
  });

  it("2. Clear while a draft save is in flight waits for it, then clears: the draft is not resurrected", async () => {
    const collector = unhandled.collect();
    try {
      const { factory, ids, services } = await started();
      const { draft } = await openPlayable(services, ids[0]!);
      const write = h.hold("learning.saveMissionDraft");
      draft.update({ code: "in flight when Clear arrives", hintsUsed: [] }, { immediate: true });
      await write.entered;

      const clearing = services.clearLearningData();
      await idle();
      expect(startedEvents("learning.clearAttempts")).toEqual([]); // Clear is ordered AFTER the admitted save
      write.release();
      await clearing;

      expect(indexOfEvent("learning.clearAttempts:start")).toBeGreaterThan(indexOfEvent("learning.saveMissionDraft:ok:in flight when Clear arrives"));
      expect(await draftRows(factory, scopeA)).toEqual([]);
      draft.update({ code: "the old page keeps typing", hintsUsed: [] }, { immediate: true });
      vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 3);
      await idle();
      expect(await draftRows(factory, scopeA)).toEqual([]);
      await services.dispose();
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });

  it("3. Clear with a pending debounce: the pre-Clear text is dropped and its timer never writes", async () => {
    const { factory, ids, services } = await started();
    const { draft, session } = await openPlayable(services, ids[0]!);
    draft.update({ code: "typed, not yet saved", hintsUsed: [] });
    expect(vi.getTimerCount()).toBe(1);

    await services.clearLearningData();
    expect(vi.getTimerCount()).toBe(0);
    expect(draft.getStatus().kind).toBe("closed");
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 3);
    session.dispose(); // the page leaves: close() must not flush the pre-Clear text
    await idle();

    expect(startedEvents("learning.saveMissionDraft")).toEqual([]);
    expect(await draftRows(factory, scopeA)).toEqual([]);
    await services.dispose();
  });

  it("6. Clear waits for the draft delete a passed Submit started, so the delete never lands after Clear", async () => {
    const { factory, ids, services } = await started();
    const { draft, session } = await openPlayable(services, ids[0]!);
    draft.update({ code: "to be discarded", hintsUsed: [] }, { immediate: true });
    await untilEvent("learning.saveMissionDraft:ok:to be discarded");
    stubSubmit(true);
    const deletion = h.hold("learning.deleteMissionDraft");
    await session.submit("answer = 1"); // returns without waiting for the detached delete
    await deletion.entered;

    const clearing = services.clearLearningData();
    await idle();
    expect(startedEvents("learning.clearAttempts")).toEqual([]);
    deletion.release();
    await clearing;
    expect(indexOfEvent("learning.clearAttempts:start")).toBeGreaterThan(indexOfEvent(`learning.deleteMissionDraft:ok:${ids[0]}`));
    expect(await draftRows(factory, scopeA)).toEqual([]);
    await services.dispose();
  });

  it("12/13. an old session cleaned up after Clear writes nothing; a session opened after Clear saves normally", async () => {
    const { factory, ids, services } = await started();
    const old = await openPlayable(services, ids[0]!);
    old.draft.update({ code: "old session text", hintsUsed: [] }, { immediate: true });
    await untilEvent("learning.saveMissionDraft:ok:old session text");
    await services.clearLearningData();

    old.draft.update({ code: "old session, after Clear", hintsUsed: [] }, { immediate: true });
    await old.draft.flush();
    old.session.dispose();
    await idle();
    expect(await draftRows(factory, scopeA)).toEqual([]);

    await reunlock(services, ids[0]!);
    const fresh = await openPlayable(services, ids[0]!, { resumeDraft: true });
    expect(fresh.resumedDraft).toBe(false);
    fresh.draft.update({ code: "fresh session text", hintsUsed: [] }, { immediate: true });
    await untilEvent("learning.saveMissionDraft:ok:fresh session text");
    await idle(3);
    expect(await draftRows(factory, scopeA)).toEqual([expect.objectContaining({ activityId: ids[0], code: "fresh session text" })]);
    expect(fresh.draft.getStatus().kind).toBe("saved");
    await services.dispose();
  });
});

describe("M6 Clear - ordering against Submit", () => {
  it("4. Clear while a Submit is persisting its attempt waits for the whole Submit (attempt, reward, draft delete), then clears everything", async () => {
    const collector = unhandled.collect();
    try {
      const { factory, ids, services } = await started();
      const { draft, session } = await openPlayable(services, ids[0]!);
      draft.update({ code: "draft of the submitting session", hintsUsed: [] }, { immediate: true });
      await untilEvent("learning.saveMissionDraft:ok:draft of the submitting session");
      stubSubmit(true);
      const attemptWrite = h.hold("learning.addAttempt");
      const submitting = session.submit("answer = 1");
      await attemptWrite.entered;

      const clearing = services.clearLearningData();
      await idle();
      expect(startedEvents("learning.clearAttempts")).toEqual([]);
      attemptWrite.release();
      const outcome = await submitting;
      expect(outcome.attemptRecord.passed).toBe(true); // the M1 completion contract
      await clearing;

      const clearStart = indexOfEvent("learning.clearAttempts:start");
      expect(clearStart).toBeGreaterThan(indexOfEvent("learning.addAttempt:ok"));
      expect(clearStart).toBeGreaterThan(indexOfEvent("meta.saveState:ok"));
      expect(await attemptRows(factory, scopeA)).toEqual([]);
      expect(await rewardedAttempts(factory, scopeA)).toEqual([]);
      expect(await draftRows(factory, scopeA)).toEqual([]);
      await services.dispose();
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });

  it("5. Clear between the attempt and the reward write cannot split the accepted Submit", async () => {
    const { factory, ids, services } = await started();
    const { session } = await openPlayable(services, ids[0]!);
    stubSubmit(true);
    const rewardWrite = h.hold("meta.saveState");
    const submitting = session.submit("answer = 1");
    await untilEvent("learning.addAttempt:ok");
    await rewardWrite.entered; // the attempt is stored, the reward is about to be

    const clearing = services.clearLearningData();
    await idle();
    expect(startedEvents("learning.clearAttempts")).toEqual([]); // nothing is cleared between the two writes
    rewardWrite.release();
    await submitting;
    await clearing;

    expect(indexOfEvent("learning.clearAttempts:start")).toBeGreaterThan(indexOfEvent("meta.saveState:ok"));
    expect(await attemptRows(factory, scopeA)).toEqual([]);
    expect(await rewardedAttempts(factory, scopeA)).toEqual([]);
    await services.dispose();
  });

  it("7. a Submit that finishes grading while Clear is active is stored AFTER Clear, completely and consistently", async () => {
    const { factory, ids, services } = await started();
    const { session } = await openPlayable(services, ids[0]!);
    stubSubmit(true);
    const clearStep = h.hold("learning.clearAttempts");
    const clearing = services.clearLearningData();
    await clearStep.entered; // Clear is active at the storage

    const submitting = session.submit("answer = 1");
    await idle();
    expect(startedEvents("learning.addAttempt")).toEqual([]); // admitted work waits for Clear, it is not dropped
    clearStep.release();
    const outcome = await submitting;
    await clearing;

    expect(outcome.attemptRecord.passed).toBe(true);
    expect(indexOfEvent("learning.addAttempt:start")).toBeGreaterThan(indexOfEvent("meta.clear:ok"));
    expect(learnerWork(await attemptRows(factory, scopeA))).toEqual([outcome.attemptRecord.id]);
    expect(await rewardedAttempts(factory, scopeA)).toEqual([outcome.attemptRecord.id]);
    await services.dispose();
  });

  it("8. a Submit after a completed Clear stores its attempt and reward normally", async () => {
    const { factory, ids, services } = await started();
    await services.clearLearningData();
    await reunlock(services, ids[0]!);
    const { session } = await openPlayable(services, ids[0]!);
    stubSubmit(true);
    const outcome = await session.submit("answer = 1");
    await idle();
    expect(learnerWork(await attemptRows(factory, scopeA)).filter((id) => !id.startsWith("reunlocked."))).toEqual([outcome.attemptRecord.id]);
    expect(await rewardedAttempts(factory, scopeA)).toEqual([outcome.attemptRecord.id]);
    await services.dispose();
  });
});

describe("M6 Clear - repeated, concurrent, retiring and failing", () => {
  it("9. repeated and concurrent Clear requests run one after the other and all resolve", async () => {
    const collector = unhandled.collect();
    try {
      const { factory, services } = await started();
      const first = h.hold("learning.clearAttempts");
      const clears = [services.clearLearningData(), services.clearLearningData(), services.clearLearningData()];
      await first.entered;
      await idle();
      expect(startedEvents("learning.clearAttempts:start")).toHaveLength(1); // the others wait
      first.release();
      await Promise.all(clears);
      expect(startedEvents("learning.clearAttempts:start")).toHaveLength(3);
      // Strictly one Clear at a time: every "learning.clearAttempts:start" comes after the previous "meta.clear:ok".
      let metaDone = -1;
      for (let i = 0; i < 3; i += 1) {
        const start = h.events.findIndex((event, at) => event === "learning.clearAttempts:start" && at > metaDone);
        expect(start).toBeGreaterThan(metaDone);
        metaDone = h.events.findIndex((event, at) => event === "meta.clear:ok" && at > start);
        expect(metaDone).toBeGreaterThan(start);
      }
      expect(await attemptRows(factory, scopeA)).toEqual([]);
      await services.clearLearningData(); // and again once idle
      await services.dispose();
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });

  it("10. Clear after retirement began is refused and touches nothing; a Clear admitted before it is drained first", async () => {
    const { factory, ids, services } = await started();
    const step = h.hold("learning.clearAttempts");
    const admittedClear = services.clearLearningData();
    await step.entered;
    const disposal = services.dispose();
    await expect(services.clearLearningData()).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
    await idle();
    expect(h.events).not.toContain("learning.close"); // the admitted Clear is drained, not cut off

    step.release();
    await admittedClear;
    expect((await disposal).status).toBe("disposed");
    expect(indexOfEvent("learning.close")).toBeGreaterThan(indexOfEvent("meta.clear:ok"));
    expect(startedEvents("learning.clearAttempts:start")).toHaveLength(1);
    expect(await attemptRows(factory, scopeA)).toEqual([]);
    void ids;
  });

  it("11. a storage failure during Clear rejects with the original error, never reports success, and does not block later work", async () => {
    const collector = unhandled.collect();
    try {
      const { factory, ids, services } = await started();
      const { draft } = await openPlayable(services, ids[0]!);
      const step = h.hold("learning.clearMissionDrafts");
      const clearing = services.clearLearningData();
      const failure = new Error("clearMissionDrafts failed");
      await step.entered;
      step.fail(failure);
      await expect(clearing).rejects.toBe(failure);
      expect(startedEvents("meta.clear")).toEqual([]); // the contract was not achieved: no later step pretends it was

      // The gate is released: new work proceeds and a retry completes the reset.
      const fresh = await openPlayable(services, ids[0]!);
      fresh.draft.update({ code: "after the failed Clear", hintsUsed: [] }, { immediate: true });
      await untilEvent("learning.saveMissionDraft:ok:after the failed Clear");
      expect(await settledWithin(services.clearLearningData())).toBe(true);
      expect(await draftRows(factory, scopeA)).toEqual([]);
      expect(await attemptRows(factory, scopeA)).toEqual([]);
      void draft;
      await services.dispose();
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });
});

describe("M6 Clear - scope and liveness", () => {
  it("14. Clear only touches its own service set: another account and the guest data are untouched", async () => {
    const factory = useFactory();
    const [missionA] = await unlockMissions(factory, scopeA, 1);
    await unlockMissions(factory, scopeB, 1);
    const servicesA = createApplicationServices({ scope: scopeA });
    const servicesB = createApplicationServices({ scope: scopeB });
    await Promise.all([servicesA.initialize(), servicesB.initialize()]);
    const b = await openPlayable(servicesB, missionA!);
    b.draft.update({ code: "account B draft", hintsUsed: [] }, { immediate: true });
    await untilEvent("learning.saveMissionDraft:ok:account B draft");
    await idle(3);
    const before = JSON.stringify([await attemptRows(factory, scopeB), await draftRows(factory, scopeB)]);

    await servicesA.clearLearningData();
    expect(await attemptRows(factory, scopeA)).toEqual([]);
    expect(JSON.stringify([await attemptRows(factory, scopeB), await draftRows(factory, scopeB)])).toBe(before);
    expect(b.draft.getStatus().kind).not.toBe("closed"); // B's sessions are not reset
    b.draft.update({ code: "account B, after A cleared", hintsUsed: [] }, { immediate: true });
    await untilEvent("learning.saveMissionDraft:ok:account B, after A cleared");
    await Promise.all([servicesA.dispose(), servicesB.dispose()]);
  });

  it("16. no deadlock: Clear queued behind a Submit and drafts, with a Workshop call and a second Clear behind it, all settle", async () => {
    const collector = unhandled.collect();
    try {
      const { factory, ids, services } = await started();
      const { draft, session } = await openPlayable(services, ids[0]!);
      stubSubmit(true);
      const save = h.hold("learning.saveMissionDraft");
      draft.update({ code: "slow save", hintsUsed: [] }, { immediate: true });
      await save.entered;
      const attemptWrite = h.hold("learning.addAttempt");
      const submitting = session.submit("answer = 1");
      await attemptWrite.entered;

      const firstClear = services.clearLearningData();
      const workshop = services.metaProgression.buildRobotPart("part.does-not-exist" as never);
      const secondClear = services.clearLearningData();
      await idle();
      expect(startedEvents("learning.clearAttempts")).toEqual([]);
      let workshopDone = false;
      void workshop.then(() => {
        workshopDone = true;
      });
      await idle();
      expect(workshopDone).toBe(false); // queued behind the Clear that was requested before it

      save.release();
      attemptWrite.release();
      expect(await settledWithin(Promise.all([submitting, firstClear, workshop, secondClear]), 400)).toBe(true);
      expect(workshopDone).toBe(true);
      expect(await attemptRows(factory, scopeA)).toEqual([]);
      expect(await draftRows(factory, scopeA)).toEqual([]);
      expect(await rewardedAttempts(factory, scopeA)).toEqual([]);
      await services.dispose();
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });
});

describe("M6 Clear - requests that arrive around a Clear", () => {
  it("17. a mission opened while a Clear is running reads the draft only afterwards: it never resumes a draft that is being deleted", async () => {
    const { ids, services } = await started();
    const first = await openPlayable(services, ids[0]!);
    first.draft.update({ code: "draft being cleared", hintsUsed: [] }, { immediate: true });
    await untilEvent("learning.saveMissionDraft:ok:draft being cleared");
    first.session.dispose();

    const step = h.hold("learning.clearAttempts");
    const clearing = services.clearLearningData();
    await step.entered;
    const reopening = services.createMissionSession(ids[0]!, { resumeDraft: true });
    await idle();
    expect(startedEvents("learning.getMissionDraft")).toEqual([]); // the read waits for the Clear
    step.release();
    await clearing;
    await reunlock(services, ids[0]!); // the course is locked again after a Clear
    const reopened = await reopening;
    // Access is evaluated before the Clear finished; either outcome is acceptable, but a resumed deleted draft is not.
    if (reopened.ok) expect(reopened.value.resumedDraft).toBe(false);
    await services.dispose();
  });

  it("18. the direct draft API and a hint-time save requested during a Clear are stored after it, never lost and never before", async () => {
    const { factory, ids, services } = await started();
    const step = h.hold("learning.clearAttempts");
    const clearing = services.clearLearningData();
    await step.entered;

    const direct = services.saveMissionDraft({ activityId: ids[0]!, seed: "seed.direct", variantIndex: 0, code: "direct, during Clear", hintsUsed: [] });
    await idle();
    expect(startedEvents("learning.saveMissionDraft")).toEqual([]);
    step.release();
    await Promise.all([clearing, direct]);

    expect(indexOfEvent("learning.saveMissionDraft:start:direct, during Clear")).toBeGreaterThan(indexOfEvent("meta.clear:ok"));
    expect(await draftRows(factory, scopeA)).toEqual([expect.objectContaining({ code: "direct, during Clear" })]);
    await services.dispose();
  });

  it("19. a write that waited behind one Clear is skipped when a second Clear retired its handle before it could start", async () => {
    const { factory, ids, services } = await started();
    const step = h.hold("learning.clearAttempts");
    const firstClear = services.clearLearningData();
    await step.entered; // storage not cleared yet, so the course is still unlocked in memory
    const session = await openPlayable(services, ids[0]!); // opened while the first Clear runs
    session.draft.update({ code: "typed during the first Clear", hintsUsed: [] }, { immediate: true });
    await idle();
    expect(startedEvents("learning.saveMissionDraft")).toEqual([]); // waiting behind the Clear
    const secondClear = services.clearLearningData(); // retires that handle before its write starts
    expect(session.draft.getStatus().kind).toBe("closed");

    step.release();
    await Promise.all([firstClear, secondClear]);
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 3);
    await idle();
    expect(startedEvents("learning.saveMissionDraft")).toEqual([]);
    expect(await draftRows(factory, scopeA)).toEqual([]);
    await services.dispose();
  });
});

/*
 * PHASE-04C.3D.7-R1 - a handle retired by a Clear (or by a newer session) may not
 * authorize a delete, including the Submit's own admitted-work delete.
 */
type DiscardingDraft = { discard(): Promise<void>; discardWithinAdmittedWork(): Promise<void> };
const owned = (draft: unknown): DiscardingDraft => draft as DiscardingDraft;

describe("M6-R1 Clear - pre-Clear handles cannot delete post-Clear drafts", () => {
  it("R1-I1. the reviewed sequence: old Submit waits behind Clear, a valid save is queued before it - the valid draft survives", async () => {
    const collector = unhandled.collect();
    try {
      const { factory, ids, services } = await started();
      const old = await openPlayable(services, ids[0]!);
      old.draft.update({ code: "pre-Clear text", hintsUsed: [] }, { immediate: true });
      await untilEvent("learning.saveMissionDraft:ok:pre-Clear text");
      stubSubmit(true);

      const clearStep = h.hold("learning.clearAttempts");
      const clearing = services.clearLearningData();
      await clearStep.entered;
      const validSave = services.saveMissionDraft({ activityId: ids[0]!, seed: "seed.valid", variantIndex: 0, code: "NEW_AFTER_CLEAR", hintsUsed: [] });
      const submitting = old.session.submit("answer = 1"); // its persistence queues behind the Clear
      await idle();
      clearStep.release();
      const outcome = await submitting;
      await Promise.all([clearing, validSave]);
      await idle();

      expect(outcome.attemptRecord.passed).toBe(true); // the Submit itself completes
      expect(startedEvents("learning.deleteMissionDraft")).toEqual([]);
      expect(await draftRows(factory, scopeA)).toEqual([expect.objectContaining({ code: "NEW_AFTER_CLEAR" })]);
      expect(learnerWork(await attemptRows(factory, scopeA))).toEqual([outcome.attemptRecord.id]);
      expect(await rewardedAttempts(factory, scopeA)).toEqual([outcome.attemptRecord.id]); // attempt and reward stay together
      await services.dispose();
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });

  it("R1-I2. Clear succeeds, a valid draft is saved, then the old handle's discard() / discardWithinAdmittedWork(): the draft survives", async () => {
    const { factory, ids, services } = await started();
    const old = await openPlayable(services, ids[0]!);
    old.draft.update({ code: "pre-Clear text", hintsUsed: [] }, { immediate: true });
    await untilEvent("learning.saveMissionDraft:ok:pre-Clear text");
    await services.clearLearningData();
    await services.saveMissionDraft({ activityId: ids[0]!, seed: "seed.valid", variantIndex: 0, code: "NEW_AFTER_CLEAR", hintsUsed: [] });

    await owned(old.draft).discard();
    await owned(old.draft).discardWithinAdmittedWork();
    await idle();
    expect(startedEvents("learning.deleteMissionDraft")).toEqual([]);
    expect(await draftRows(factory, scopeA)).toEqual([expect.objectContaining({ code: "NEW_AFTER_CLEAR" })]);
    await services.dispose();
  });

  it("R1-I3. a FAILED Clear does not give the old session's Submit the authority to delete a later valid draft", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const collector = unhandled.collect();
    try {
      const { factory, ids, services } = await started();
      const old = await openPlayable(services, ids[0]!);
      stubSubmit(true);
      const clearStep = h.hold("learning.clearAttempts");
      const clearing = services.clearLearningData();
      await clearStep.entered;
      const failure = new Error("clearAttempts failed");
      clearStep.fail(failure);
      await expect(clearing).rejects.toBe(failure);

      await services.saveMissionDraft({ activityId: ids[0]!, seed: "seed.valid", variantIndex: 0, code: "VALID_AFTER_FAILED_CLEAR", hintsUsed: [] });
      const outcome = await old.session.submit("answer = 1");
      await idle();
      expect(outcome.attemptRecord.passed).toBe(true);
      expect(startedEvents("learning.deleteMissionDraft")).toEqual([]);
      expect(await draftRows(factory, scopeA)).toEqual([expect.objectContaining({ code: "VALID_AFTER_FAILED_CLEAR" })]);
      await services.dispose();
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });

  it("R1-I4. a delete admitted before the Clear is not cancelled: it settles first and Clear then clears; a session opened after Clear saves and deletes normally", async () => {
    const { factory, ids, services } = await started();
    const first = await openPlayable(services, ids[0]!);
    first.draft.update({ code: "to be discarded", hintsUsed: [] }, { immediate: true });
    await untilEvent("learning.saveMissionDraft:ok:to be discarded");
    stubSubmit(true);
    const deletion = h.hold("learning.deleteMissionDraft");
    await first.session.submit("answer = 1");
    await deletion.entered;
    const clearing = services.clearLearningData(); // retires `first`; the admitted delete stays queued
    await idle();
    expect(startedEvents("learning.clearAttempts")).toEqual([]);
    deletion.release();
    await clearing;
    expect(indexOfEvent("learning.clearAttempts:start")).toBeGreaterThan(indexOfEvent(`learning.deleteMissionDraft:ok:${ids[0]}`));
    expect(await draftRows(factory, scopeA)).toEqual([]);

    await reunlock(services, ids[0]!);
    const fresh = await openPlayable(services, ids[0]!);
    fresh.draft.update({ code: "fresh draft", hintsUsed: [] }, { immediate: true });
    await untilEvent("learning.saveMissionDraft:ok:fresh draft");
    await idle(3);
    expect(await draftRows(factory, scopeA)).toEqual([expect.objectContaining({ code: "fresh draft" })]);
    await fresh.session.submit("answer = 1"); // passed: its own draft is deleted by its own handle
    for (let turn = 0; turn < 400 && startedEvents("learning.deleteMissionDraft:ok").length < 2; turn += 1) await nextMacrotask();
    expect(startedEvents("learning.deleteMissionDraft:ok")).toHaveLength(2);
    await idle(3);
    expect(startedEvents("learning.deleteMissionDraft:start")).toHaveLength(2); // the Submit-before-Clear delete and the fresh handle's own
    expect(await draftRows(factory, scopeA)).toEqual([]);
    await services.dispose();
  });

  it("R1-I5. multiple Clears never reactivate the old handle; isolation across activities and accounts", async () => {
    const factory = useFactory();
    const [missionA, missionB] = await unlockMissions(factory, scopeA, 2);
    await unlockMissions(factory, scopeB, 1);
    const servicesA = createApplicationServices({ scope: scopeA });
    const servicesB = createApplicationServices({ scope: scopeB });
    await Promise.all([servicesA.initialize(), servicesB.initialize()]);
    const oldA = await openPlayable(servicesA, missionA!);
    const accountB = await openPlayable(servicesB, missionA!);
    accountB.draft.update({ code: "account B", hintsUsed: [] }, { immediate: true });
    await untilEvent("learning.saveMissionDraft:ok:account B");

    await servicesA.clearLearningData();
    await servicesA.clearLearningData();
    await servicesA.saveMissionDraft({ activityId: missionA!, seed: "seed.valid", variantIndex: 0, code: "VALID_A", hintsUsed: [] });
    await servicesA.saveMissionDraft({ activityId: missionB!, seed: "seed.valid", variantIndex: 0, code: "VALID_B", hintsUsed: [] });
    await owned(oldA.draft).discard();
    await owned(oldA.draft).discardWithinAdmittedWork();
    await idle();

    expect(h.events.filter((event) => event.includes("deleteMissionDraft")).join("|")).toBe("");
    expect((await draftRows(factory, scopeA)).map((row) => row.code).sort()).toEqual(["VALID_A", "VALID_B"]);
    expect(await draftRows(factory, scopeB)).toEqual([expect.objectContaining({ code: "account B" })]);
    await Promise.all([servicesA.dispose(), servicesB.dispose()]);
  });

  it("R1-I6. retirement while the old Submit waits behind a Clear: everything admitted drains, the refused delete holds nothing back", async () => {
    const collector = unhandled.collect();
    try {
      const { factory, ids, services } = await started();
      const old = await openPlayable(services, ids[0]!);
      stubSubmit(true);
      const clearStep = h.hold("learning.clearAttempts");
      const clearing = services.clearLearningData();
      await clearStep.entered;
      const submitting = old.session.submit("answer = 1");
      await idle();
      const disposal = services.dispose();
      await idle();
      expect(h.events).not.toContain("learning.close");

      clearStep.release();
      await Promise.all([clearing, submitting]);
      expect((await disposal).status).toBe("disposed");
      expect(indexOfEvent("learning.close")).toBeGreaterThan(indexOfEvent("meta.saveState:ok"));
      expect(startedEvents("learning.deleteMissionDraft")).toEqual([]);
      expect(learnerWork(await attemptRows(factory, scopeA))).toHaveLength(1);
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });
});

describe("M6-R1 Clear - audit: a mission opened across a Clear", () => {
  it("R1-A1. createMissionSession that began before Clear and opens its handle after it recreates NOTHING in storage (but shows the pre-Clear text)", async () => {
    const collector = unhandled.collect();
    try {
      const { factory, ids, services } = await started();
      const earlier = await openPlayable(services, ids[0]!);
      earlier.draft.update({ code: "pre-Clear draft", hintsUsed: [HintLevel.H1] }, { immediate: true });
      await untilEvent("learning.saveMissionDraft:ok:pre-Clear draft");
      earlier.session.dispose();

      const loading = h.hold("runtime.initialize");
      const opening = services.createMissionSession(ids[0]!, { resumeDraft: true }); // reads the draft, then loads the engine
      await loading.entered;
      await services.clearLearningData(); // completes while the session is still loading
      expect(await draftRows(factory, scopeA)).toEqual([]);
      loading.release();
      const result = await opening;
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Evidence 1: storage is untouched - the late handle does not write the stale snapshot back.
      result.value.draft.update({ code: result.value.initialCode, hintsUsed: [HintLevel.H1] });
      vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 3);
      await idle();
      expect(startedEvents("learning.saveMissionDraft:start")).toHaveLength(1); // only the pre-Clear save from `earlier`
      expect(await draftRows(factory, scopeA)).toEqual([]);
      // Evidence 2 (documented limit): the UI of this one session starts from the pre-Clear read.
      expect(result.value.resumedDraft).toBe(true);
      expect(result.value.initialCode).toBe("pre-Clear draft");
      // Evidence 3: it is a valid post-Clear session - new work is saved and may be deleted by itself.
      result.value.draft.update({ code: "typed after the Clear", hintsUsed: [] }, { immediate: true });
      await untilEvent("learning.saveMissionDraft:ok:typed after the Clear");
      expect(await draftRows(factory, scopeA)).toEqual([expect.objectContaining({ code: "typed after the Clear" })]);
      await services.dispose();
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });
});
