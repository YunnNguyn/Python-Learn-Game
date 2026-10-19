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
 * PHASE-04C.3D.6 (M5) - mission drafts through the REAL application services and
 * REAL (fake-indexeddb) storage: the draft handle a session carries, the order of
 * its writes, the invalidation by a passed Submit, resume, scope and retirement.
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
    initialize: async () => ({ ok: true as const }),
    prepareMission: async () => ({ ok: true as const }),
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

describe("M5 drafts - a mission session owns its draft", () => {
  it("the debounced edit is stored in IndexedDB only after the write resolved; hint and code are one record", async () => {
    const factory = useFactory();
    const [missionId] = await unlockMissions(factory, scopeA, 1);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const { draft, session } = await openPlayable(services, missionId!);

    const write = h.hold("learning.saveMissionDraft");
    draft.update({ code: "answer = 1", hintsUsed: [] });
    expect(draft.getStatus().kind).toBe("scheduled");
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS - 1);
    await idle();
    expect(h.events).not.toContain("learning.saveMissionDraft:start:answer = 1");

    vi.advanceTimersByTime(1);
    await write.entered;
    expect(draft.getStatus().kind).toBe("saving");
    expect(await draftRows(factory, scopeA)).toEqual([]); // the timer fired; nothing is durable yet

    write.release();
    await untilEvent("learning.saveMissionDraft:ok:answer = 1");
    await idle(3);
    expect(draft.getStatus().kind).toBe("saved");

    const hint = session.revealNextHint();
    expect(hint).not.toBeNull();
    draft.update({ code: "answer = 2", hintsUsed: session.getRevealedHints().map((item) => item.level) }, { immediate: true });
    await untilEvent("learning.saveMissionDraft:ok:answer = 2");
    expect(await draftRows(factory, scopeA)).toEqual([
      expect.objectContaining({ activityId: missionId, code: "answer = 2", hintsUsed: [HintLevel.H1] }),
    ]);
    await services.dispose();
  });

  it("16. reopening resumes the persisted draft; a final save still in flight is awaited before the read", async () => {
    const factory = useFactory();
    const [missionId] = await unlockMissions(factory, scopeA, 1);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const first = await openPlayable(services, missionId!);
    first.draft.update({ code: "v1", hintsUsed: [] }, { immediate: true });
    await untilEvent("learning.saveMissionDraft:ok:v1");

    // The learner edits, then leaves the page: unmount disposes the session and flushes the last change.
    const finalSave = h.hold("learning.saveMissionDraft");
    first.draft.update({ code: "v2, typed just before leaving", hintsUsed: [HintLevel.H1] });
    first.session.dispose();
    await finalSave.entered;

    // The mission is reopened immediately; the read must wait for that write.
    const reopening = services.createMissionSession(missionId!, { resumeDraft: true });
    await idle();
    expect(h.events.filter((event) => event.startsWith("learning.getMissionDraft:start"))).toEqual([]);
    finalSave.release();
    const reopened = await reopening;
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) throw new Error("reopen failed");
    expect(reopened.value.resumedDraft).toBe(true);
    expect(reopened.value.initialCode).toBe("v2, typed just before leaving");
    expect(reopened.value.session.getRevealedHints().map((hint) => hint.level)).toEqual([HintLevel.H1]);

    // Unchanged resumed content is not written again.
    reopened.value.draft.update({ code: reopened.value.initialCode, hintsUsed: [HintLevel.H1] });
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 2);
    await idle();
    expect(h.events.filter((event) => event.startsWith("learning.saveMissionDraft:start"))).toEqual([
      "learning.saveMissionDraft:start:v1",
      "learning.saveMissionDraft:start:v2, typed just before leaving",
    ]);
    await services.dispose();
  });

  it("10. leaving mission A for mission B stores each mission's code under its own activity", async () => {
    const factory = useFactory();
    const [missionA, missionB] = await unlockMissions(factory, scopeA, 2);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const a = await openPlayable(services, missionA!);
    a.draft.update({ code: "code of A", hintsUsed: [] });
    a.session.dispose(); // route change: the page disposes A's session, flushing its draft
    const b = await openPlayable(services, missionB!);
    b.draft.update({ code: "code of B", hintsUsed: [] });
    a.draft.update({ code: "late render still carrying A's state", hintsUsed: [] }); // ignored: A is closed
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await untilEvent("learning.saveMissionDraft:ok:code of B");
    await idle(3);

    const rows = await draftRows(factory, scopeA);
    expect(rows.map((row) => [row.activityId, row.code]).sort()).toEqual(
      [
        [missionA, "code of A"],
        [missionB, "code of B"],
      ].sort(),
    );
    await services.dispose();
  });

  it("12. StrictMode: a session disposed right after creation writes nothing; the second one saves once", async () => {
    const factory = useFactory();
    const [missionId] = await unlockMissions(factory, scopeA, 1);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const first = await openPlayable(services, missionId!, { resumeDraft: true }); // mount 1
    first.session.dispose(); // StrictMode cleanup
    const second = await openPlayable(services, missionId!, { resumeDraft: true }); // mount 2
    second.draft.update({ code: second.initialCode, hintsUsed: [] }); // effect, then StrictMode's second run
    second.draft.update({ code: second.initialCode, hintsUsed: [] });
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await untilEvent(`learning.saveMissionDraft:ok:${second.initialCode}`);
    await idle(3);

    expect(h.events.filter((event) => event.startsWith("learning.saveMissionDraft:start"))).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(await draftRows(factory, scopeA)).toHaveLength(1);
    await services.dispose();
  });
});

describe("M5 drafts - Submit invalidation", () => {
  it("6/7. a PASSED Submit cancels the pending debounce and deletes the draft after the in-flight save; nothing comes back", async () => {
    const factory = useFactory();
    const [missionId] = await unlockMissions(factory, scopeA, 1);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const { draft, session } = await openPlayable(services, missionId!);
    stubSubmit(true);

    const inFlight = h.hold("learning.saveMissionDraft");
    draft.update({ code: "saving while grading", hintsUsed: [] });
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await inFlight.entered;
    draft.update({ code: "typed right before Submit", hintsUsed: [] }); // debounce pending

    const outcome = await session.submit("answer = 1");
    expect(outcome.attemptRecord.passed).toBe(true);
    expect(vi.getTimerCount()).toBe(0); // invalidated synchronously inside the admitted Submit
    expect(draft.getStatus().kind).toBe("closed");
    expect(h.events).not.toContain("learning.deleteMissionDraft:start:" + missionId); // ordered after the save

    inFlight.release();
    await untilEvent(`learning.deleteMissionDraft:ok:${missionId}`);
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 3);
    draft.update({ code: "editing after the passed Submit", hintsUsed: [] }); // the editor stays usable
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 3);
    await idle();

    expect(await draftRows(factory, scopeA)).toEqual([]); // no resurrection
    const saves = h.events.filter((event) => event.startsWith("learning.saveMissionDraft:start"));
    expect(saves).toEqual(["learning.saveMissionDraft:start:saving while grading"]);
    expect(h.events.indexOf(`learning.deleteMissionDraft:start:${missionId}`)).toBeGreaterThan(
      h.events.indexOf("learning.saveMissionDraft:ok:saving while grading"),
    );
    await services.dispose();
  });

  it("9. a Submit that does not pass keeps the draft, and so does one whose attempt could not be stored", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const factory = useFactory();
    const [missionId] = await unlockMissions(factory, scopeA, 1);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const { draft, session } = await openPlayable(services, missionId!);
    draft.update({ code: "keep me", hintsUsed: [] }, { immediate: true });
    await untilEvent("learning.saveMissionDraft:ok:keep me");

    stubSubmit(false);
    const failed = await session.submit("answer = 0");
    expect(failed.attemptRecord.passed).toBe(false);

    vi.restoreAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    stubSubmit(true);
    const attemptWrite = h.hold("learning.addAttempt");
    const submitting = session.submit("answer = 1");
    const storageError = new Error("attempt could not be stored");
    await attemptWrite.entered;
    attemptWrite.fail(storageError);
    await expect(submitting).rejects.toBe(storageError);
    await idle();

    expect(h.events.filter((event) => event.startsWith("learning.deleteMissionDraft"))).toEqual([]);
    expect(await draftRows(factory, scopeA)).toEqual([expect.objectContaining({ code: "keep me" })]);
    expect(draft.getStatus().kind).not.toBe("closed");
    await services.dispose();
  });

  it("8c. a passed Submit that finishes after the page left (session disposed mid-persist) still deletes the draft", async () => {
    const factory = useFactory();
    const [missionId] = await unlockMissions(factory, scopeA, 1);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const { draft, session } = await openPlayable(services, missionId!);
    stubSubmit(true);
    draft.update({ code: "typed before Submit", hintsUsed: [] });

    const attemptWrite = h.hold("learning.addAttempt");
    const submitting = session.submit("answer = 1");
    await attemptWrite.entered;
    session.dispose(); // the learner navigates away mid-persist: the pending change is flushed...
    await untilEvent("learning.saveMissionDraft:ok:typed before Submit");
    attemptWrite.release(); // ...and the Submit, past its durable-write boundary, completes
    const outcome = await submitting;
    expect(outcome.attemptRecord.passed).toBe(true);
    await untilEvent(`learning.deleteMissionDraft:ok:${missionId}`);

    expect(await draftRows(factory, scopeA)).toEqual([]);
    expect(h.events.indexOf(`learning.deleteMissionDraft:start:${missionId}`)).toBeGreaterThan(
      h.events.indexOf("learning.saveMissionDraft:ok:typed before Submit"),
    );
    await services.dispose();
  });

  it("a stale passed Submit does not delete the draft of a session opened afterwards", async () => {
    const factory = useFactory();
    const [missionId] = await unlockMissions(factory, scopeA, 1);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const older = await openPlayable(services, missionId!);
    stubSubmit(true);
    const attemptWrite = h.hold("learning.addAttempt");
    const submitting = older.session.submit("answer = 1");
    await attemptWrite.entered;
    older.session.dispose(); // left the page mid-persist
    const newer = await openPlayable(services, missionId!); // the mission was reopened
    newer.draft.update({ code: "newer session work", hintsUsed: [] }, { immediate: true });
    await untilEvent("learning.saveMissionDraft:ok:newer session work");

    attemptWrite.release();
    await submitting;
    await idle();
    expect(h.events.filter((event) => event.startsWith("learning.deleteMissionDraft"))).toEqual([]);
    expect(await draftRows(factory, scopeA)).toEqual([expect.objectContaining({ code: "newer session work" })]);
    await services.dispose();
  });
});

describe("M5 drafts - failures", () => {
  it("13. a failed IndexedDB write is reported as failed, never as saved, and direct callers get the original error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const collector = unhandled.collect();
    try {
      const factory = useFactory();
      const [missionId] = await unlockMissions(factory, scopeA, 1);
      const services = createApplicationServices({ scope: scopeA });
      await services.initialize();
      const { draft } = await openPlayable(services, missionId!);

      const write = h.hold("learning.saveMissionDraft");
      draft.update({ code: "will not be stored", hintsUsed: [] }, { immediate: true });
      await write.entered;
      const failure = new Error("QuotaExceededError");
      write.fail(failure);
      await untilEvent("learning.saveMissionDraft:error:will not be stored");
      await idle(3);

      const status = draft.getStatus();
      expect(status.kind).toBe("failed");
      expect((status as { error?: unknown }).error).toBe(failure);
      expect(await draftRows(factory, scopeA)).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(1);

      const direct = h.hold("learning.saveMissionDraft");
      const directSave = services.saveMissionDraft({
        activityId: missionId!,
        seed: "seed.direct",
        variantIndex: 0,
        code: "direct",
        hintsUsed: [],
      });
      const directFailure = new Error("direct write failed");
      await direct.entered;
      direct.fail(directFailure);
      await expect(directSave).rejects.toBe(directFailure);

      draft.update({ code: "stored now", hintsUsed: [] }, { immediate: true });
      await untilEvent("learning.saveMissionDraft:ok:stored now");
      await idle(3);
      expect(draft.getStatus().kind).toBe("saved");
      await services.dispose();
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });
});

describe("M5 drafts - M4 retirement", () => {
  it("14. a draft write admitted before retirement settles before persistence closes", async () => {
    const factory = useFactory();
    const [missionId] = await unlockMissions(factory, scopeA, 1);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const { draft } = await openPlayable(services, missionId!);
    const write = h.hold("learning.saveMissionDraft");
    draft.update({ code: "admitted before retirement", hintsUsed: [] }, { immediate: true });
    await write.entered;

    const disposal = services.dispose();
    expect(services.getLifecycleState().status).toBe("retiring");
    await idle();
    expect(h.events).not.toContain("learning.close"); // the admitted write is still running

    write.release();
    expect((await disposal).status).toBe("disposed");
    expect(h.events.indexOf("learning.close")).toBeGreaterThan(h.events.indexOf("learning.saveMissionDraft:ok:admitted before retirement"));
    expect(await draftRows(factory, scopeA)).toEqual([expect.objectContaining({ code: "admitted before retirement" })]);
  });

  it("15. a debounce timer pending at retirement opens no write, leaves no timer, logs nothing and rejects nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const collector = unhandled.collect();
    try {
      const factory = useFactory();
      const [missionId] = await unlockMissions(factory, scopeA, 1);
      const services = createApplicationServices({ scope: scopeA });
      await services.initialize();
      const { draft } = await openPlayable(services, missionId!);
      draft.update({ code: "unsaved when the set retired", hintsUsed: [] });
      expect(vi.getTimerCount()).toBe(1);

      const disposal = services.dispose();
      expect(vi.getTimerCount()).toBe(0); // the session's disposal cancelled it
      vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 3);
      expect((await disposal).status).toBe("disposed");
      await idle();

      expect(h.events.filter((event) => event.startsWith("learning.saveMissionDraft"))).toEqual([]);
      expect(await draftRows(factory, scopeA)).toEqual([]);
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      draft.update({ code: "after disposal", hintsUsed: [] });
      vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 3);
      await idle();
      await expect(
        services.saveMissionDraft({ activityId: missionId!, seed: "s", variantIndex: 0, code: "late", hintsUsed: [] }),
      ).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
      await expect(services.deleteMissionDraft(missionId!)).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });

  it("a passed Submit past its durable-write boundary deletes its draft inside the drain, before persistence closes", async () => {
    const factory = useFactory();
    const [missionId] = await unlockMissions(factory, scopeA, 1);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const { draft, session } = await openPlayable(services, missionId!);
    draft.update({ code: "to be removed", hintsUsed: [] }, { immediate: true });
    await untilEvent("learning.saveMissionDraft:ok:to be removed");
    stubSubmit(true);

    const attemptWrite = h.hold("learning.addAttempt");
    const submitting = session.submit("answer = 1");
    await attemptWrite.entered;
    const disposal = services.dispose(); // retirement begins while the attempt is being stored
    attemptWrite.release();
    const outcome = await submitting;
    expect(outcome.attemptRecord.passed).toBe(true);
    expect((await disposal).status).toBe("disposed");

    expect(h.events.indexOf(`learning.deleteMissionDraft:ok:${missionId}`)).toBeGreaterThan(-1);
    expect(h.events.indexOf("learning.close")).toBeGreaterThan(h.events.indexOf(`learning.deleteMissionDraft:ok:${missionId}`));
    expect(await draftRows(factory, scopeA)).toEqual([]);
  });
});

describe("M5 drafts - scope", () => {
  it("17. a draft is stored only in its own service set's database; another scope never sees it", async () => {
    const factory = useFactory();
    const [missionId] = await unlockMissions(factory, scopeA, 1);
    await unlockMissions(factory, scopeB, 1);
    const servicesA = createApplicationServices({ scope: scopeA });
    const servicesB = createApplicationServices({ scope: scopeB });
    await Promise.all([servicesA.initialize(), servicesB.initialize()]);
    const a = await openPlayable(servicesA, missionId!);
    a.draft.update({ code: "draft of account A", hintsUsed: [] }, { immediate: true });
    await untilEvent("learning.saveMissionDraft:ok:draft of account A");
    await idle(3);

    expect(await draftRows(factory, scopeA)).toEqual([expect.objectContaining({ code: "draft of account A" })]);
    expect(await draftRows(factory, scopeB)).toEqual([]);
    const resumedB = await openPlayable(servicesB, missionId!, { resumeDraft: true });
    expect(resumedB.resumedDraft).toBe(false);

    // Retiring A does not let a late write reach B (or anywhere else).
    expect((await servicesA.dispose()).status).toBe("disposed");
    a.draft.update({ code: "late write after A retired", hintsUsed: [] }, { immediate: true });
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 2);
    await idle();
    expect(await draftRows(factory, scopeB)).toEqual([]);
    expect(await draftRows(factory, scopeA)).toEqual([expect.objectContaining({ code: "draft of account A" })]);
    await servicesB.dispose();
  });
});

/*
 * PHASE-04C.3D.6-R1 - overlapping sessions of the SAME mission. The newest session
 * owns the draft; an older one that is still alive (or only cleaned up late) can no
 * longer save over it, while what it had already admitted still settles (M4).
 */
describe("M5-R1 drafts - a stale session cannot overwrite a newer one", () => {
  it("R1-I1. the newer session saves; the older session's update, timer, flush and dispose write nothing", async () => {
    const collector = unhandled.collect();
    try {
      const factory = useFactory();
      const [missionId] = await unlockMissions(factory, scopeA, 1);
      const services = createApplicationServices({ scope: scopeA });
      await services.initialize();
      const older = await openPlayable(services, missionId!);
      const newer = await openPlayable(services, missionId!); // opened while the older one is still alive
      newer.draft.update({ code: "VALID_NEWER", hintsUsed: [] }, { immediate: true });
      await untilEvent("learning.saveMissionDraft:ok:VALID_NEWER");
      await idle(3);

      older.draft.update({ code: "STALE_OLDER", hintsUsed: [] }, { immediate: true });
      older.draft.update({ code: "STALE_OLDER, debounced", hintsUsed: [HintLevel.H1] });
      await older.draft.flush();
      older.session.dispose(); // the old page's cleanup runs late
      vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 3);
      await idle();

      expect(await draftRows(factory, scopeA)).toEqual([expect.objectContaining({ activityId: missionId, code: "VALID_NEWER" })]);
      expect(h.events.filter((event) => event.startsWith("learning.saveMissionDraft:start"))).toEqual([
        "learning.saveMissionDraft:start:VALID_NEWER",
      ]);
      expect(vi.getTimerCount()).toBe(0);
      expect(older.draft.getStatus().kind).toBe("closed");

      // The newest session keeps working.
      newer.draft.update({ code: "VALID_NEWER, again", hintsUsed: [] });
      vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
      await untilEvent("learning.saveMissionDraft:ok:VALID_NEWER, again");
      expect(await draftRows(factory, scopeA)).toEqual([expect.objectContaining({ code: "VALID_NEWER, again" })]);
      await services.dispose();
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });

  it("R1-I2. a write the older session admitted before the newer one opened settles first; the newer write follows and wins, through retirement too", async () => {
    const factory = useFactory();
    const [missionId] = await unlockMissions(factory, scopeA, 1);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const older = await openPlayable(services, missionId!);
    const inFlight = h.hold("learning.saveMissionDraft");
    older.draft.update({ code: "older, admitted", hintsUsed: [] }, { immediate: true });
    await inFlight.entered;

    const newer = await openPlayable(services, missionId!);
    newer.draft.update({ code: "VALID_NEWER", hintsUsed: [] }, { immediate: true });
    older.draft.update({ code: "older, refused", hintsUsed: [] }, { immediate: true });
    const disposal = services.dispose(); // retirement while both are outstanding: both admitted writes are drained
    await idle();
    expect(h.events).not.toContain("learning.close");

    inFlight.release();
    expect((await disposal).status).toBe("disposed");
    const saves = h.events.filter((event) => event.startsWith("learning.saveMissionDraft:"));
    expect(saves).toEqual([
      "learning.saveMissionDraft:start:older, admitted",
      "learning.saveMissionDraft:ok:older, admitted",
      "learning.saveMissionDraft:start:VALID_NEWER",
      "learning.saveMissionDraft:ok:VALID_NEWER",
    ]);
    expect(h.events.indexOf("learning.close")).toBeGreaterThan(h.events.indexOf("learning.saveMissionDraft:ok:VALID_NEWER"));
    expect(await draftRows(factory, scopeA)).toEqual([expect.objectContaining({ code: "VALID_NEWER" })]);
  });

  it("R1-I3. an older session's passed Submit that finishes while the newer session is alive cannot delete the newer draft", async () => {
    const factory = useFactory();
    const [missionId] = await unlockMissions(factory, scopeA, 1);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const older = await openPlayable(services, missionId!);
    older.draft.update({ code: "older tail", hintsUsed: [] });
    stubSubmit(true);
    const attemptWrite = h.hold("learning.addAttempt");
    const submitting = older.session.submit("answer = 1");
    await attemptWrite.entered;

    const newer = await openPlayable(services, missionId!); // older was NOT disposed
    newer.draft.update({ code: "VALID_NEWER", hintsUsed: [] }, { immediate: true });
    await untilEvent("learning.saveMissionDraft:ok:VALID_NEWER");
    attemptWrite.release();
    expect((await submitting).attemptRecord.passed).toBe(true);
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 3);
    await idle();

    expect(h.events.filter((event) => event.startsWith("learning.deleteMissionDraft"))).toEqual([]);
    expect(h.events.filter((event) => event.startsWith("learning.saveMissionDraft:start"))).toEqual([
      "learning.saveMissionDraft:start:VALID_NEWER",
    ]);
    expect(await draftRows(factory, scopeA)).toEqual([expect.objectContaining({ code: "VALID_NEWER" })]);
    await services.dispose();
  });

  it("R1-I4. superseding is per mission and per service set: another mission and another account are not fenced", async () => {
    const factory = useFactory();
    const [missionA, missionB] = await unlockMissions(factory, scopeA, 2);
    await unlockMissions(factory, scopeB, 2);
    const servicesA = createApplicationServices({ scope: scopeA });
    const servicesB = createApplicationServices({ scope: scopeB });
    await Promise.all([servicesA.initialize(), servicesB.initialize()]);
    const olderOfA = await openPlayable(servicesA, missionA!);
    const sessionOfB = await openPlayable(servicesA, missionB!);
    const otherAccount = await openPlayable(servicesB, missionA!);
    await openPlayable(servicesA, missionA!); // supersedes olderOfA only

    sessionOfB.draft.update({ code: "other mission", hintsUsed: [] }, { immediate: true });
    otherAccount.draft.update({ code: "other account", hintsUsed: [] }, { immediate: true });
    olderOfA.draft.update({ code: "stale", hintsUsed: [] }, { immediate: true });
    await untilEvent("learning.saveMissionDraft:ok:other mission");
    await untilEvent("learning.saveMissionDraft:ok:other account");
    await idle(3);

    expect(await draftRows(factory, scopeA)).toEqual([expect.objectContaining({ activityId: missionB, code: "other mission" })]);
    expect(await draftRows(factory, scopeB)).toEqual([expect.objectContaining({ activityId: missionA, code: "other account" })]);
    expect(h.events.filter((event) => event.includes("stale"))).toEqual([]);
    await Promise.all([servicesA.dispose(), servicesB.dispose()]);
  });

  it("R1-I5. the delete after a passed Submit is tracked until persistence confirms it, and a failure keeps its original error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const collector = unhandled.collect();
    try {
      const factory = useFactory();
      const [missionId] = await unlockMissions(factory, scopeA, 1);
      const services = createApplicationServices({ scope: scopeA });
      await services.initialize();
      const { draft, session } = await openPlayable(services, missionId!);
      draft.update({ code: "to be removed", hintsUsed: [] }, { immediate: true });
      await untilEvent("learning.saveMissionDraft:ok:to be removed");
      stubSubmit(true);

      const deletion = h.hold("learning.deleteMissionDraft");
      await session.submit("answer = 1");
      await deletion.entered;
      const disposal = services.dispose();
      await idle();
      expect(h.events).not.toContain("learning.close"); // the delete is still tracked: nothing closes under it
      expect(await draftRows(factory, scopeA)).toHaveLength(1); // and it is not reported done: the row is still there

      const deleteError = new Error("IndexedDB delete failed");
      deletion.fail(deleteError);
      expect((await disposal).status).toBe("disposed");
      expect(warn.mock.calls.some((call) => call[1] === deleteError)).toBe(true); // the original error is kept for diagnostics
      expect(await draftRows(factory, scopeA)).toHaveLength(1); // a failed delete is never claimed as success
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });
});

describe("M5-R2 drafts - superseded session status", () => {
  it("R2-I1. the older session reports closed (never saved) once the newer session opens, even while its write settles late", async () => {
    const factory = useFactory();
    const [missionId] = await unlockMissions(factory, scopeA, 1);
    const services = createApplicationServices({ scope: scopeA });
    await services.initialize();
    const older = await openPlayable(services, missionId!);
    const inFlight = h.hold("learning.saveMissionDraft");
    older.draft.update({ code: "OLD", hintsUsed: [] }, { immediate: true });
    await inFlight.entered;
    const kinds: string[] = [];
    older.draft.subscribe(() => kinds.push(older.draft.getStatus().kind));

    await openPlayable(services, missionId!);
    expect(older.draft.getStatus().kind).toBe("closed");
    inFlight.release();
    await untilEvent("learning.saveMissionDraft:ok:OLD");
    await idle(3);
    expect(older.draft.getStatus().kind).toBe("closed");
    expect(kinds).toEqual(["closed"]);
    expect(await draftRows(factory, scopeA)).toEqual([expect.objectContaining({ code: "OLD" })]);
    await services.dispose();
  });
});
