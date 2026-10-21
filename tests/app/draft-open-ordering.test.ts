import { afterEach, describe, expect, it, vi } from "vitest";

import { getOrderedActivityIds } from "../../src/app/learning-path";
import { ApplicationLifecycle } from "../../src/app/services/application-lifecycle";
import { MissionDraftScheduler } from "../../src/app/services/mission-draft-scheduler";
import { OperationGate } from "../../src/app/services/operation-gate";
import {
  MISSION_OPEN_SUPERSEDED,
  openResolvedMissionSession,
  type CreateMissionSessionResult,
  type MissionSessionOpeningDependencies,
  type PlayableMissionSession,
} from "../../src/app/services/resolved-mission-session";
import { MissionSessionRegistry } from "../../src/app/services/service-owned-resources";
import {
  getCs116MissionInstanceValidator,
  registerCs116Generators,
  registerCs116Hints,
  registerCs116ProductionContent,
} from "../../src/content/cs116";
import { ContentRegistry } from "../../src/core/content";
import { Difficulty, LearningActivityType, type CodeMissionActivity, type LearningActivityId } from "../../src/core/domain";
import { GeneratorRegistry } from "../../src/core/generators";
import { GraderRegistry, registerCoreGraders } from "../../src/core/grading";
import { HintRegistry } from "../../src/core/hints";
import { MissionEngine, generateMissionInstance } from "../../src/core/missions";
import { MemoryLearningPersistence } from "../../src/core/persistence";
import type { RuntimeManager } from "../../src/core/runtime";

/**
 * PHASE-05-M7-R2 - ownership of a mission draft while sessions of ONE activity are being opened.
 *
 * Opening INTENT (a ticket taken when a session is requested) is ordered separately from draft OWNERSHIP
 * (the handle of the session that was activated). The page opens its session in an effect, and React
 * StrictMode - or any quick route change - runs it twice: opening #1 (cancelled by the cleanup) and opening
 * #2 (the live one). Whichever finishes last used to take the draft over, even the cancelled one.
 */

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
  return type === LearningActivityType.CODE_MISSION || type === LearningActivityType.DEBUG_MISSION || type === LearningActivityType.BOSS_MISSION;
}) as LearningActivityId;
const activity = content.getActivity(missionId) as CodeMissionActivity;
const template = content.getMissionTemplate(activity.missionTemplateId)!;
const SEED = "seed.draft-order";
const instance = generateMissionInstance({
  template,
  generatorRegistry: generators,
  baseSeed: SEED,
  difficulty: Difficulty.EASY,
  validator: getCs116MissionInstanceValidator(template.generator.id),
}).instance;

interface ControlledRuntime {
  readonly runtime: RuntimeManager;
  /** Lets the pending mission load finish (or fail). */
  finish(error?: { code: string; message: string }): void;
  readonly counts: { prepared: number; disposed: number };
}

/** A runtime whose mission load stays pending until `finish()` is called. */
function controlledRuntime(): ControlledRuntime {
  let finish!: (error?: { code: string; message: string }) => void;
  const pending = new Promise<{ code: string; message: string } | undefined>((resolve) => {
    finish = resolve;
  });
  const counts = { prepared: 0, disposed: 0 };
  const runtime = {
    initialize: async () => ({ ok: true as const }),
    prepareMission: async () => {
      counts.prepared += 1;
      const error = await pending;
      return error === undefined ? { ok: true as const } : { ok: false as const, error };
    },
    run: async () => ({ status: "SUCCESS" as const, stdout: "", stderr: "" }),
    submit: async () => ({ status: "SUCCESS" as const, stdout: "", stderr: "", serialized: { variables: {} } }),
    dispose: () => {
      counts.disposed += 1;
    },
  } as unknown as RuntimeManager;
  return { runtime, finish: (error) => finish(error), counts };
}

function setup() {
  const persistence = new MemoryLearningPersistence();
  const lifecycle = new ApplicationLifecycle();
  const gate = new OperationGate();
  const drafts = new MissionDraftScheduler(persistence, lifecycle, 10, gate);
  const sessions = new MissionSessionRegistry();
  const dependencies: MissionSessionOpeningDependencies = {
    lifecycle, gate, drafts, sessions, graders, recordSubmittedAttempt: async () => undefined,
  };
  /** One session REQUEST: the ticket is taken first, exactly as the public entry points do. */
  const request = (controlled: ControlledRuntime): Promise<CreateMissionSessionResult> =>
    openResolvedMissionSession(dependencies, {
      activity, template, instance, seed: SEED, variantIndex: 0, hintSet: undefined,
      runtime: controlled.runtime, storedDraft: null, resetCode: false,
      opening: drafts.beginOpening(missionId),
    });
  return { persistence, lifecycle, gate, drafts, sessions, graders, request };
}

function ok(result: CreateMissionSessionResult): PlayableMissionSession {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("M7-R2 - opening ownership", () => {
  it("A. opening A starts before B but completes after B: B stays writable and A cannot supersede it", async () => {
    const env = setup();
    const a = controlledRuntime();
    const b = controlledRuntime();
    const openingA = env.request(a);
    const openingB = env.request(b);

    b.finish();
    const live = ok(await openingB);
    a.finish();
    const staleResult = await openingA; // the cancelled opening finishes LAST
    expect(staleResult.ok).toBe(false);

    const edited = "# the learner's edit\nvalue = 42\n";
    live.draft.update({ code: edited, hintsUsed: [] });
    await live.draft.flush();
    expect((await env.persistence.getMissionDraft(missionId))?.code).toBe(edited);
    expect(live.draft.getStatus().kind).toBe("saved");
    live.session.dispose();
  });

  it("B. an active session keeps autosaving while a newer opening fails to load", async () => {
    const env = setup();
    const a = controlledRuntime();
    const openingA = env.request(a);
    a.finish();
    const active = ok(await openingA);
    active.draft.update({ code: "first = 1\n", hintsUsed: [] });
    await active.draft.flush();

    const b = controlledRuntime();
    const openingB = env.request(b); // pending: must not touch A's draft
    active.draft.update({ code: "second = 2\n", hintsUsed: [] });
    await active.draft.flush();
    expect((await env.persistence.getMissionDraft(missionId))?.code).toBe("second = 2\n");

    b.finish({ code: "RUNTIME_LOAD_FAILED", message: "boom" });
    const failed = await openingB;
    expect(failed.ok).toBe(false);

    active.draft.update({ code: "third = 3\n", hintsUsed: [] });
    await active.draft.flush();
    expect((await env.persistence.getMissionDraft(missionId))?.code).toBe("third = 3\n");
    expect(active.draft.getStatus().kind).toBe("saved");
    expect(b.counts.disposed).toBe(1); // the failed opening's runtime is cleaned up
    active.session.dispose();
  });

  it("C. opening A is delayed before it reaches the load; B starts later and loads first: B stays authoritative and A never loads", async () => {
    const env = setup();
    const a = controlledRuntime();
    const b = controlledRuntime();
    const ticketA = env.drafts.beginOpening(missionId); // A requested first ... and is still resolving
    const openingB = env.request(b); // B requested later, reaches the load first
    b.finish();
    const live = ok(await openingB);

    // A finally reaches the opening phase with its (now stale) ticket.
    const staleResult = await openResolvedMissionSession(
      { lifecycle: env.lifecycle, gate: env.gate, drafts: env.drafts, sessions: env.sessions, graders: env.graders, recordSubmittedAttempt: async () => undefined },
      { activity, template, instance, seed: SEED, variantIndex: 0, hintSet: undefined, runtime: a.runtime, storedDraft: null, resetCode: false, opening: ticketA },
    );
    expect(staleResult.ok).toBe(false);
    expect(staleResult.ok === false && staleResult.error.code).toBe(MISSION_OPEN_SUPERSEDED);
    expect(a.counts.prepared).toBe(0); // no load was even started
    expect(a.counts.disposed).toBe(1);

    live.draft.update({ code: "b = 1\n", hintsUsed: [] });
    await live.draft.flush();
    expect((await env.persistence.getMissionDraft(missionId))?.code).toBe("b = 1\n");
    live.session.dispose();
  });

  it("C2. pre-load stale cleanup failures remain reportable and retryable", async () => {
    const env = setup();
    const stale = controlledRuntime();
    const staleTicket = env.drafts.beginOpening(missionId);
    env.drafts.beginOpening(missionId); // newer request supersedes the first ticket
    const cleanupError = new Error("simulated runtime disposal failure");
    const dispose = vi.spyOn(stale.runtime, "dispose").mockImplementationOnce(() => {
      throw cleanupError;
    });

    const result = await openResolvedMissionSession(
      { lifecycle: env.lifecycle, gate: env.gate, drafts: env.drafts, sessions: env.sessions, graders: env.graders, recordSubmittedAttempt: async () => undefined },
      { activity, template, instance, seed: SEED, variantIndex: 0, hintSet: undefined, runtime: stale.runtime, storedDraft: null, resetCode: false, opening: staleTicket },
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe(MISSION_OPEN_SUPERSEDED);
    expect(stale.counts.prepared).toBe(0);
    expect(env.sessions.getUnresolvedFailures()).toEqual([
      { resource: "mission-engine", error: cleanupError },
    ]);

    env.sessions.disposeAll(); // the next cleanup pass retries the failed runtime disposal
    expect(env.sessions.getUnresolvedFailures()).toEqual([]);
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(stale.counts.disposed).toBe(1);
  });

  it("D. a stale opening that finishes after the live one returns no session, leaves no registry entry and leaks no runtime", async () => {
    const env = setup();
    const a = controlledRuntime();
    const b = controlledRuntime();
    const openingA = env.request(a);
    const openingB = env.request(b);
    b.finish();
    const live = ok(await openingB);
    a.finish();
    const staleResult = await openingA;

    expect(staleResult.ok).toBe(false);
    expect(staleResult.ok === false && staleResult.error.code).toBe(MISSION_OPEN_SUPERSEDED);
    expect(a.counts.prepared).toBe(1);
    expect(a.counts.disposed).toBe(1); // the stale engine's runtime was disposed through the registry cleanup

    // Retirement reaches exactly the live session: the stale one is not registered, so nothing is disposed twice.
    env.sessions.disposeAll();
    expect(b.counts.disposed).toBe(1);
    expect(a.counts.disposed).toBe(1);
    expect(live.session).toBeDefined();
  });

  it("E. once B took over from A, late writes and deletes originating from A cannot overwrite or delete B's draft", async () => {
    const env = setup();
    const a = controlledRuntime();
    const openingA = env.request(a);
    a.finish();
    const first = ok(await openingA);
    first.draft.update({ code: "a = 1\n", hintsUsed: [] });
    await first.draft.flush();

    const b = controlledRuntime();
    const openingB = env.request(b);
    b.finish();
    const second = ok(await openingB);
    second.draft.update({ code: "b = 2\n", hintsUsed: [] });
    await second.draft.flush();
    expect((await env.persistence.getMissionDraft(missionId))?.code).toBe("b = 2\n");

    // A is late: an edit, then a PASSED Submit (which discards a draft).
    first.draft.update({ code: "a = LATE\n", hintsUsed: [] }, { immediate: true });
    await first.draft.flush();
    vi.spyOn(MissionEngine.prototype, "submit").mockImplementation(async () => ({
      execution: { status: "SUCCESS" as const, stdout: "", stderr: "" },
      grading: { passed: true, checks: [] },
    }));
    await first.session.submit("x = 1");
    await env.drafts.settled(missionId);

    expect((await env.persistence.getMissionDraft(missionId))?.code).toBe("b = 2\n");
    expect(first.draft.getStatus().kind).toBe("closed");
    expect(second.draft.getStatus().kind).toBe("saved");
    first.session.dispose();
    second.session.dispose();
  });

  it("E2. a stale opening that finishes after B can neither write over nor delete B's draft, whatever it returns", async () => {
    const env = setup();
    const stale = controlledRuntime();
    const live = controlledRuntime();
    const openingStale = env.request(stale);
    const openingLive = env.request(live);
    live.finish();
    const owner = ok(await openingLive);
    owner.draft.update({ code: "owner = 1\n", hintsUsed: [] });
    await owner.draft.flush();

    stale.finish();
    const late = await openingStale;
    if (late.ok) {
      // Only reachable if a stale opening were allowed to hand out a session: its late edit and its passed Submit must still be inert.
      late.value.draft.update({ code: "stale = LATE\n", hintsUsed: [] }, { immediate: true });
      await late.value.draft.flush();
      vi.spyOn(MissionEngine.prototype, "submit").mockImplementation(async () => ({
        execution: { status: "SUCCESS" as const, stdout: "", stderr: "" },
        grading: { passed: true, checks: [] },
      }));
      await late.value.session.submit("x = 1");
      late.value.session.dispose();
    }
    await env.drafts.settled(missionId);
    expect((await env.persistence.getMissionDraft(missionId))?.code).toBe("owner = 1\n");
    owner.draft.update({ code: "owner = 2\n", hintsUsed: [] });
    await owner.draft.flush();
    expect((await env.persistence.getMissionDraft(missionId))?.code).toBe("owner = 2\n");
    owner.session.dispose();
  });
});
