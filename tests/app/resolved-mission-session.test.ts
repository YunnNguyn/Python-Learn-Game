import { afterEach, describe, expect, it, vi } from "vitest";

import { getOrderedActivityIds } from "../../src/app/learning-path";
import { ApplicationLifecycle } from "../../src/app/services/application-lifecycle";
import { MissionDraftScheduler } from "../../src/app/services/mission-draft-scheduler";
import { OperationGate } from "../../src/app/services/operation-gate";
import {
  failure,
  openResolvedMissionSession,
  retiredFailure,
  type MissionSessionOpeningDependencies,
  type ResolvedMissionSessionInput,
} from "../../src/app/services/resolved-mission-session";
import { MissionSessionRegistry } from "../../src/app/services/service-owned-resources";
import {
  getCs116MissionInstanceValidator,
  registerCs116Generators,
  registerCs116Hints,
  registerCs116ProductionContent,
} from "../../src/content/cs116";
import { ContentRegistry } from "../../src/core/content";
import {
  Difficulty,
  HintLevel,
  LearningActivityType,
  type AttemptRecord,
  type CodeMissionActivity,
  type LearningActivityId,
} from "../../src/core/domain";
import { GeneratorRegistry } from "../../src/core/generators";
import { GraderRegistry, registerCoreGraders } from "../../src/core/grading";
import { HintRegistry } from "../../src/core/hints";
import { MissionEngine, generateMissionInstance } from "../../src/core/missions";
import { MemoryLearningPersistence, type MissionDraftRecord } from "../../src/core/persistence";
import type { RuntimeManager } from "../../src/core/runtime";

/**
 * PHASE-05-M7.0 Task C: the opening phase of a mission session, exercised
 * DIRECTLY with explicit dependencies and a store of its own (memory), without
 * the CS116 service set. The CS116 behavior itself stays covered, unmodified, by
 * the application-services-* suites.
 */

interface FakeRuntime extends RuntimeManager {
  disposeCount: number;
  loadError: { code: string; message: string } | null;
}

function createFakeRuntime(): FakeRuntime {
  const runtime = {
    disposeCount: 0,
    loadError: null as { code: string; message: string } | null,
    initialize: async () => ({ ok: true as const }),
    prepareMission: async () =>
      runtime.loadError === null ? { ok: true as const } : { ok: false as const, error: runtime.loadError },
    run: async () => ({ status: "SUCCESS" as const, stdout: "", stderr: "" }),
    submit: async () => ({ status: "SUCCESS" as const, stdout: "", stderr: "", serialized: { variables: {} } }),
    dispose: () => {
      runtime.disposeCount += 1;
    },
  };
  return runtime as unknown as FakeRuntime;
}

const content = new ContentRegistry();
registerCs116ProductionContent(content);
const generators = new GeneratorRegistry();
registerCs116Generators(generators);
const hints = new HintRegistry();
registerCs116Hints(hints);
const graders = new GraderRegistry();
registerCoreGraders(graders);

const missionId = getOrderedActivityIds(content).find((id) => {
  const type = content.getActivity(id)?.type;
  return (
    type === LearningActivityType.CODE_MISSION ||
    type === LearningActivityType.DEBUG_MISSION ||
    type === LearningActivityType.BOSS_MISSION
  );
}) as LearningActivityId;
const activity = content.getActivity(missionId) as CodeMissionActivity;
const template = content.getMissionTemplate(activity.missionTemplateId)!;
const SEED = "seed.m70";
const instance = generateMissionInstance({
  template,
  generatorRegistry: generators,
  baseSeed: SEED,
  difficulty: Difficulty.EASY,
  validator: getCs116MissionInstanceValidator(template.generator.id),
}).instance;
const hintSet = template.hintSetId ? hints.getHintSet(template.hintSetId) : undefined;

function stubSubmit(passed: boolean) {
  return vi.spyOn(MissionEngine.prototype, "submit").mockImplementation(async () => ({
    execution: { status: "SUCCESS" as const, stdout: "", stderr: "" },
    grading: { passed, checks: [] },
  }));
}

function makeDraft(code: string, seed = SEED): MissionDraftRecord {
  return {
    activityId: missionId,
    seed,
    variantIndex: 0,
    code,
    hintsUsed: [HintLevel.H1],
    updatedAt: "2026-10-20T01:00:00.000Z",
  };
}

function setup(recordSubmittedAttempt: (record: AttemptRecord) => Promise<void> = async () => undefined) {
  const persistence = new MemoryLearningPersistence();
  const lifecycle = new ApplicationLifecycle();
  const gate = new OperationGate();
  const drafts = new MissionDraftScheduler(persistence, lifecycle, undefined, gate);
  const sessions = new MissionSessionRegistry();
  const dependencies: MissionSessionOpeningDependencies = {
    lifecycle,
    gate,
    drafts,
    sessions,
    graders,
    recordSubmittedAttempt,
  };
  const runtime = createFakeRuntime();
  const input: ResolvedMissionSessionInput = {
    activity,
    template,
    instance,
    seed: SEED,
    variantIndex: 0,
    hintSet,
    runtime,
    storedDraft: null,
    resetCode: false,
  };
  return { persistence, lifecycle, gate, drafts, sessions, dependencies, runtime, input };
}

async function openOk(env: ReturnType<typeof setup>) {
  const result = await openResolvedMissionSession(env.dependencies, env.input);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("openResolvedMissionSession - result shape", () => {
  it("returns the starter code, variant and no resume for a fresh session", async () => {
    const env = setup();
    const value = await openOk(env);
    expect(value.resumedDraft).toBe(false);
    expect(value.variantIndex).toBe(0);
    expect(value.initialCode).toBe(
      instance.learner.starterCode ?? template.starterCode ?? "# Viết mã Python tại đây\n",
    );
    expect(value.session.activity.id).toBe(missionId);
    value.session.dispose();
    expect(env.runtime.disposeCount).toBe(1);
  });

  it("resumes the stored draft only when its seed matches and code is not reset", async () => {
    for (const [storedSeed, resetCode, expectResumed] of [
      [SEED, false, true],
      ["another.seed", false, false],
      [SEED, true, false],
    ] as const) {
      const env = setup();
      env.input = { ...env.input, storedDraft: makeDraft("print('draft')", storedSeed), resetCode };
      const value = await openOk(env);
      expect(value.resumedDraft).toBe(expectResumed);
      expect(value.initialCode === "print('draft')").toBe(expectResumed);
      value.session.dispose();
    }
  });

  it("registers the session with the owner's registry until it is disposed", async () => {
    const registered = setup();
    await openOk(registered);
    registered.sessions.disposeAll(); // retirement of the owner reaches the session
    expect(registered.runtime.disposeCount).toBe(1);

    const released = setup();
    const value = await openOk(released);
    value.session.dispose(); // disposing it releases it from the registry
    released.sessions.disposeAll();
    expect(released.runtime.disposeCount).toBe(1); // not disposed a second time
  });

  it("starts the load synchronously (nothing is awaited before lifecycle.trackLoad)", () => {
    const env = setup();
    const spy = vi.spyOn(env.lifecycle, "trackLoad");
    const pending = openResolvedMissionSession(env.dependencies, env.input);
    expect(spy).toHaveBeenCalledTimes(1);
    return pending.then((result) => {
      if (result.ok) result.value.session.dispose();
    });
  });
});

describe("openResolvedMissionSession - load failures and retirement", () => {
  it("returns the runtime's load error and disposes the runtime; no session is handed out", async () => {
    const env = setup();
    env.runtime.loadError = { code: "RUNTIME_LOAD_FAILED", message: "boom" };
    const result = await openResolvedMissionSession(env.dependencies, env.input);
    expect(result).toEqual({ ok: false, error: { code: "RUNTIME_LOAD_FAILED", message: "boom" } });
    expect(env.runtime.disposeCount).toBe(1);
  });

  it("a retirement that begins during the load yields the retired failure and disposes the runtime", async () => {
    const env = setup();
    const pending = openResolvedMissionSession(env.dependencies, env.input);
    env.lifecycle.beginRetirement();
    const result = await pending;
    expect(result).toEqual(retiredFailure());
    expect(env.runtime.disposeCount).toBeGreaterThanOrEqual(1);
    expect(await env.lifecycle.waitForDrain(1000)).toBe(true);
  });

  it("the shared failure helpers keep their exact shape", () => {
    expect(failure("A", "b")).toEqual({ ok: false, error: { code: "A", message: "b" } });
    const retired = retiredFailure();
    expect(retired.ok).toBe(false);
    expect(retired.ok === false && retired.error.message).toContain("đã đóng");
  });
});

describe("openResolvedMissionSession - the Submit callback is the only attempt path", () => {
  it("calls the supplied callback exactly once per Submit with the stored record, and nothing else", async () => {
    const stored: AttemptRecord[] = [];
    const env = setup(async (record) => {
      stored.push(record);
    });
    const value = await openOk(env);
    stubSubmit(false);
    const outcome = await value.session.submit("x = 1");
    expect(stored).toHaveLength(1);
    expect(stored[0]).toBe(outcome.attemptRecord);
    // The helper never touches the draft store's attempts: this store is a bystander.
    expect(await env.persistence.getAttempts()).toEqual([]);
    value.session.dispose();
  });

  it("runs the callback inside an admitted operation that holds the gate shared", async () => {
    const order: string[] = [];
    let releaseCallback: () => void = () => undefined;
    const env = setup(async () => {
      order.push("callback:start");
      await new Promise<void>((resolve) => {
        releaseCallback = resolve;
      });
      order.push("callback:end");
    });
    const value = await openOk(env);
    stubSubmit(false);
    const submitting = value.session.submit("x = 1");
    while (!order.includes("callback:start")) await Promise.resolve();

    // A Clear (exclusive) requested now must wait for the Submit persistence...
    const clear = env.gate.runExclusive(async () => {
      order.push("clear");
    });
    // ...and a retirement must not report drained until the callback settled.
    env.lifecycle.beginRetirement();
    let drained = false;
    const draining = env.lifecycle.waitForDrain(1000).then((ok) => {
      drained = ok;
    });
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(order).toEqual(["callback:start"]);
    expect(drained).toBe(false);

    releaseCallback();
    await submitting;
    await clear;
    await draining;
    expect(order).toEqual(["callback:start", "callback:end", "clear"]);
    expect(drained).toBe(true);
  });

  it("a PASSED attempt invalidates the draft after the callback; a failed one keeps it", async () => {
    for (const passed of [true, false]) {
      const order: string[] = [];
      const env = setup(async () => {
        order.push("callback");
      });
      const value = await openOk(env);
      value.draft.update({ code: "kept?", hintsUsed: [] }, { immediate: true });
      await env.drafts.settled(missionId);
      expect((await env.persistence.getMissionDraft(missionId))?.code).toBe("kept?");

      stubSubmit(passed);
      await value.session.submit("x = 1");
      await env.drafts.settled(missionId);
      expect(order).toEqual(["callback"]);
      const remaining = await env.persistence.getMissionDraft(missionId);
      expect(remaining === null).toBe(passed);
      value.session.dispose();
      vi.restoreAllMocks();
    }
  });

  it("a callback that rejects rejects the Submit and keeps the draft", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const failureToStore = new Error("attempt could not be stored");
    const env = setup(async () => {
      throw failureToStore;
    });
    const value = await openOk(env);
    value.draft.update({ code: "keep me", hintsUsed: [] }, { immediate: true });
    await env.drafts.settled(missionId);

    stubSubmit(true);
    await expect(value.session.submit("x = 1")).rejects.toBe(failureToStore);
    await env.drafts.settled(missionId);
    expect((await env.persistence.getMissionDraft(missionId))?.code).toBe("keep me");
    value.session.dispose();
  });

  it("two openings with different callbacks never share them (no CS116 default exists)", async () => {
    const a: string[] = [];
    const b: string[] = [];
    const envA = setup(async (r) => void a.push(r.id));
    const envB = setup(async (r) => void b.push(r.id));
    const sessionA = await openOk(envA);
    const sessionB = await openOk(envB);
    stubSubmit(false);
    await sessionA.session.submit("x = 1");
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0);
    await sessionB.session.submit("x = 2");
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    sessionA.session.dispose();
    sessionB.session.dispose();
  });
});
