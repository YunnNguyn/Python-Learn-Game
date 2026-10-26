import { describe, expect, it } from "vitest";

import {
  AttemptRecordSchema,
  Difficulty,
  HintLevel,
  LearningActivityType,
  LearningStage,
  type AttemptRecord,
  type LearningActivity,
  type MissionInstance,
  type MissionTemplate,
} from "../../src/core/domain";
import type { GraderRegistry } from "../../src/core/grading";
import { HintEngine, type HintSet } from "../../src/core/hints";
import {
  LearningEngine,
  MISSION_SUBMIT_CANCELLED,
  MissionAttemptSession,
  MissionSubmitCancelledError,
} from "../../src/core/learning";
import {
  MemoryMetaProgressionPersistence,
  MetaProgressionEngine,
} from "../../src/core/meta-progression";
import { MissionEngine } from "../../src/core/missions";
import { MemoryLearningPersistence } from "../../src/core/persistence";
import { RUNTIME_EXECUTION_STATUS, type RuntimeManager } from "../../src/core/runtime";

function createFixture() {
  const activity = {
    id: "activity.test",
    type: LearningActivityType.CODE_MISSION,
    title: "Test",
    conceptIds: ["concept.test"],
    stage: LearningStage.GUIDED,
    missionTemplateId: "template.test",
  } as unknown as LearningActivity;
  const template = {
    id: "template.test",
    version: 1,
    conceptIds: ["concept.test"],
    allowedStages: [LearningStage.GUIDED],
    generator: { id: "generator.test" },
    grader: { id: "core.declarative", config: { checks: [{ type: "NO_EXCEPTION" }] } },
    runtime: { id: "runtime.test" },
  } as unknown as MissionTemplate;
  const instance = {
    id: "instance.test",
    templateId: template.id,
    templateVersion: 1,
    seed: "seed",
    difficulty: Difficulty.EASY,
    conceptIds: template.conceptIds,
    learner: { objective: "Do it" },
  } as MissionInstance;

  return { activity, template, instance };
}

describe("Phase A AttemptRecord envelope", () => {
  it("creates exactly one frozen AttemptRecord for every submit", async () => {
    const { activity, template, instance } = createFixture();
    let submitCount = 0;
    const runtime = {
      initialize: async () => ({ ok: true } as const),
      prepareMission: async () => ({ ok: true } as const),
      run: async () => ({ status: "SUCCESS", stdout: "", stderr: "" } as const),
      submit: async () => {
        submitCount += 1;
        return {
          status: "SUCCESS",
          stdout: "",
          stderr: "",
          serialized: { variables: {} },
        } as const;
      },
      dispose() {},
    } satisfies RuntimeManager;
    const grader = {
      getGrader: () => ({
        grade: () => ({ passed: true, checks: [] }),
      }),
    } as unknown as GraderRegistry;
    const engine = new MissionEngine(runtime, grader);
    await engine.loadMission(template, instance);
    const times = [
      new Date("2026-10-03T10:00:00.000Z"),
      new Date("2026-10-03T10:01:00.000Z"),
      new Date("2026-10-03T10:02:00.000Z"),
    ];
    const persisted: AttemptRecord[] = [];
    const hintSet: HintSet = {
      id: "hints.test" as never,
      hints: [
        { level: HintLevel.H1, text: "concept" },
        { level: HintLevel.H2, text: "strategy" },
        { level: HintLevel.H3, text: "syntax" },
        { level: HintLevel.H4, text: "pseudo" },
      ],
    };
    const session = new MissionAttemptSession(activity, template, instance, engine, {
      now: () => times.shift()!,
      hintEngine: new HintEngine(hintSet),
      onAttemptRecord: (record) => { persisted.push(record); },
    });

    session.revealNextHint();

    const first = await session.submit("pass");
    const second = await session.submit("pass again");

    expect(submitCount).toBe(2);
    expect(first.attemptRecord.submissionIndex).toBe(1);
    expect(second.attemptRecord.submissionIndex).toBe(2);
    expect(session.getAttempts()).toHaveLength(2);
    expect(persisted).toHaveLength(2);
    expect(first.attemptRecord.hintsUsed).toEqual([HintLevel.H1]);
    expect(AttemptRecordSchema.parse(first.attemptRecord)).toEqual(first.attemptRecord);
    expect(Object.isFrozen(first.attemptRecord)).toBe(true);
  });

  it("exposes runtime interruption without creating an AttemptRecord", async () => {
    const { activity, template, instance } = createFixture();
    let interruptCount = 0;
    const runtime = {
      initialize: async () => ({ ok: true } as const),
      prepareMission: async () => ({ ok: true } as const),
      run: async () => ({ status: "SUCCESS", stdout: "", stderr: "" } as const),
      submit: async () => ({
        status: "SUCCESS",
        stdout: "",
        stderr: "",
        serialized: { variables: {} },
      } as const),
      interrupt: async () => {
        interruptCount += 1;
        return { ok: true } as const;
      },
      dispose() {},
    } satisfies RuntimeManager;
    const grader = {
      getGrader: () => ({ grade: () => ({ passed: true, checks: [] }) }),
    } as unknown as GraderRegistry;
    const engine = new MissionEngine(runtime, grader);
    await engine.loadMission(template, instance);
    const session = new MissionAttemptSession(activity, template, instance, engine);

    expect(session.canInterrupt()).toBe(true);
    await expect(session.interrupt()).resolves.toEqual({ ok: true });
    expect(interruptCount).toBe(1);
    expect(session.getAttempts()).toHaveLength(0);
  });

});

// PHASE-04C.3D.2: a Submit cancelled by dispose() must not become a failed attempt.

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const GENUINE_RESULT = {
  status: RUNTIME_EXECUTION_STATUS.SUCCESS,
  stdout: "",
  stderr: "",
  serialized: { variables: {} },
} as const;

const DISPOSED_RESULT = {
  status: RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR,
  stdout: "",
  stderr: "",
  error: { code: "RUNTIME_DISPOSED", message: "Runtime manager đã được hủy trong khi đang nộp mã." },
} as const;

/**
 * A runtime whose Submit/Run stay pending until the test settles them, so the
 * exact interleaving with dispose() is controlled without any timers.
 * `settleOnDispose` mimics PyodideRuntimeManager (dispose resolves the pending
 * call with RUNTIME_DISPOSED); without it the runtime cannot abort (late result).
 */
async function createControlledSession(options: {
  readonly settleOnDispose?: boolean;
  readonly passed?: boolean;
  readonly onAttemptRecord?: (record: AttemptRecord) => void | Promise<void>;
}) {
  const { activity, template, instance } = createFixture();
  const pendingSubmits: Array<ReturnType<typeof deferred<unknown>>> = [];
  const pendingRuns: Array<ReturnType<typeof deferred<unknown>>> = [];
  let disposeCount = 0;
  const runtime = {
    initialize: async () => ({ ok: true } as const),
    prepareMission: async () => ({ ok: true } as const),
    run: () => {
      const call = deferred<unknown>();
      pendingRuns.push(call);
      return call.promise;
    },
    submit: () => {
      const call = deferred<unknown>();
      pendingSubmits.push(call);
      return call.promise;
    },
    dispose() {
      disposeCount += 1;
      if (options.settleOnDispose === true) {
        for (const call of [...pendingSubmits, ...pendingRuns]) call.resolve(DISPOSED_RESULT);
      }
    },
  } as unknown as RuntimeManager;
  const grader = {
    getGrader: () => ({ grade: () => ({ passed: options.passed ?? true, checks: [] }) }),
  } as unknown as GraderRegistry;
  const engine = new MissionEngine(runtime, grader);
  await engine.loadMission(template, instance);
  const session = new MissionAttemptSession(activity, template, instance, engine, {
    onAttemptRecord: options.onAttemptRecord,
  });
  return { session, pendingSubmits, pendingRuns, disposeCount: () => disposeCount };
}

describe("Submit cancellation", () => {
  it("a normal successful Submit creates exactly one AttemptRecord", async () => {
    const persisted: AttemptRecord[] = [];
    const { session, pendingSubmits } = await createControlledSession({
      onAttemptRecord: (record) => { persisted.push(record); },
    });

    const submit = session.submit("pass");
    pendingSubmits[0]!.resolve(GENUINE_RESULT);
    const result = await submit;

    expect(result.attemptRecord.passed).toBe(true);
    expect(persisted).toEqual([result.attemptRecord]);
    expect(session.getAttempts()).toHaveLength(1);
  });

  it("a normal runtime failure WITHOUT cancellation still records its failed attempt", async () => {
    const persisted: AttemptRecord[] = [];
    const { session, pendingSubmits } = await createControlledSession({
      passed: false,
      onAttemptRecord: (record) => { persisted.push(record); },
    });

    const submit = session.submit("boom");
    pendingSubmits[0]!.resolve({ ...DISPOSED_RESULT, error: { code: "RUNTIME_CRASH", message: "worker crashed" } });
    const result = await submit;

    expect(result.attemptRecord.passed).toBe(false);
    expect(result.attemptRecord.runtimeErrorCount).toBe(1);
    expect(result.attemptRecord.graderSummary?.executionStatus).toBe(RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR);
    expect(persisted).toHaveLength(1);
  });

  it("dispose while grading is pending, runtime resolves RUNTIME_DISPOSED: zero AttemptRecords", async () => {
    const persisted: AttemptRecord[] = [];
    const { session, pendingSubmits } = await createControlledSession({
      settleOnDispose: true,
      onAttemptRecord: (record) => { persisted.push(record); },
    });

    const submit = session.submit("pending");
    expect(pendingSubmits).toHaveLength(1);
    session.dispose();

    const error = await submit.then(() => null, (reason: unknown) => reason);
    expect(error).toBeInstanceOf(MissionSubmitCancelledError);
    expect((error as MissionSubmitCancelledError).code).toBe(MISSION_SUBMIT_CANCELLED);
    expect(persisted).toHaveLength(0);
    expect(session.getAttempts()).toHaveLength(0);
  });

  it("dispose while grading is pending, runtime later resolves a genuine result: zero AttemptRecords", async () => {
    const persisted: AttemptRecord[] = [];
    const { session, pendingSubmits } = await createControlledSession({
      onAttemptRecord: (record) => { persisted.push(record); },
    });

    const submit = session.submit("pending");
    session.dispose();
    pendingSubmits[0]!.resolve(GENUINE_RESULT);

    await expect(submit).rejects.toBeInstanceOf(MissionSubmitCancelledError);
    expect(persisted).toHaveLength(0);
    expect(session.getAttempts()).toHaveLength(0);
  });

  it("dispose while onAttemptRecord is already pending lets persistence finish, exactly once", async () => {
    const started = deferred<void>();
    const finish = deferred<void>();
    const persisted: AttemptRecord[] = [];
    const { session, pendingSubmits, disposeCount } = await createControlledSession({
      onAttemptRecord: async (record) => {
        persisted.push(record);
        started.resolve();
        await finish.promise;
      },
    });

    const submit = session.submit("pass");
    pendingSubmits[0]!.resolve(GENUINE_RESULT);
    await started.promise; // persistence has begun
    session.dispose();
    expect(disposeCount()).toBe(1);
    finish.resolve();

    const result = await submit;
    expect(persisted).toEqual([result.attemptRecord]);
    expect(persisted).toHaveLength(1);
    expect(session.getAttempts()).toHaveLength(1);
  });

  it("a persistence rejection reaches the caller as the original error, not as a cancellation", async () => {
    const failure = new Error("quota exceeded");
    const { session, pendingSubmits } = await createControlledSession({
      onAttemptRecord: () => Promise.reject(failure),
    });

    const submit = session.submit("pass");
    pendingSubmits[0]!.resolve(GENUINE_RESULT);

    const error = await submit.then(() => null, (reason: unknown) => reason);
    expect(error).toBe(failure);
    expect(error).not.toBeInstanceOf(MissionSubmitCancelledError);
  });

  it("a cancelled pre-persistence Submit triggers no learning write and no reward", async () => {
    const learning = new LearningEngine(new MemoryLearningPersistence());
    const meta = new MetaProgressionEngine(new MemoryMetaProgressionPersistence());
    const onAttemptRecord = async (record: AttemptRecord) => {
      await learning.recordAttempt(record);
      await meta.recordAttempt(record);
    };

    // Positive control: the same wiring does reward a completed pass.
    const control = await createControlledSession({ onAttemptRecord });
    const controlSubmit = control.session.submit("pass");
    control.pendingSubmits[0]!.resolve(GENUINE_RESULT);
    await controlSubmit;
    expect(learning.getAttempts()).toHaveLength(1);
    const rewardsAfterControl = meta.getSnapshot().recentRewards.length;
    expect(rewardsAfterControl).toBeGreaterThan(0);

    const cancelled = await createControlledSession({ settleOnDispose: true, onAttemptRecord });
    const cancelledSubmit = cancelled.session.submit("pass");
    cancelled.session.dispose();
    await expect(cancelledSubmit).rejects.toBeInstanceOf(MissionSubmitCancelledError);

    expect(learning.getAttempts()).toHaveLength(1);
    expect(meta.getSnapshot().recentRewards).toHaveLength(rewardsAfterControl);
  });

  it("repeated disposal is idempotent", async () => {
    const { session, pendingSubmits, disposeCount } = await createControlledSession({ settleOnDispose: true });

    const submit = session.submit("pending");
    expect(pendingSubmits).toHaveLength(1);
    session.dispose();
    session.dispose();
    session.dispose();

    await expect(submit).rejects.toBeInstanceOf(MissionSubmitCancelledError);
    expect(disposeCount()).toBe(1);
    await expect(session.submit("again")).rejects.toThrow("disposed");
  });

  it("Run never creates an AttemptRecord, even when disposed mid-run", async () => {
    const persisted: AttemptRecord[] = [];
    const { session, pendingRuns } = await createControlledSession({
      settleOnDispose: true,
      onAttemptRecord: (record) => { persisted.push(record); },
    });

    const completedRun = session.run("print(1)");
    pendingRuns[0]!.resolve(GENUINE_RESULT);
    await completedRun;

    const cancelledRun = session.run("print(2)");
    session.dispose();
    await cancelledRun;

    expect(persisted).toHaveLength(0);
    expect(session.getAttempts()).toHaveLength(0);
  });
});

describe("Submit rejection classification", () => {
  it("grading rejects AFTER disposal: cancellation (original error as cause), zero attempts", async () => {
    const persisted: AttemptRecord[] = [];
    const { session, pendingSubmits } = await createControlledSession({
      onAttemptRecord: (record) => { persisted.push(record); },
    });
    const crash = new Error("worker crashed while disposing");

    const submit = session.submit("pending");
    session.dispose();
    pendingSubmits[0]!.reject(crash);

    const error = await submit.then(() => null, (reason: unknown) => reason);
    expect(error).toBeInstanceOf(MissionSubmitCancelledError);
    expect((error as MissionSubmitCancelledError).cause).toBe(crash);
    expect(persisted).toHaveLength(0);
    expect(session.getAttempts()).toHaveLength(0);
  });

  it("grading rejects while the session is ACTIVE: the original error is preserved", async () => {
    const persisted: AttemptRecord[] = [];
    const { session, pendingSubmits } = await createControlledSession({
      onAttemptRecord: (record) => { persisted.push(record); },
    });
    const crash = new Error("runtime exploded");

    const submit = session.submit("pending");
    pendingSubmits[0]!.reject(crash);

    const error = await submit.then(() => null, (reason: unknown) => reason);
    expect(error).toBe(crash);
    expect(error).not.toBeInstanceOf(MissionSubmitCancelledError);
    expect(persisted).toHaveLength(0);
    expect(session.getAttempts()).toHaveLength(0);
  });

  it("persistence rejects after disposal once it had started: the persistence error is preserved", async () => {
    const started = deferred<void>();
    const failure = new Error("IndexedDB write failed");
    const gate = deferred<void>();
    const { session, pendingSubmits } = await createControlledSession({
      onAttemptRecord: async () => {
        started.resolve();
        await gate.promise;
      },
    });

    const submit = session.submit("pass");
    pendingSubmits[0]!.resolve(GENUINE_RESULT);
    await started.promise;
    session.dispose();
    gate.reject(failure);

    const error = await submit.then(() => null, (reason: unknown) => reason);
    expect(error).toBe(failure);
    expect(error).not.toBeInstanceOf(MissionSubmitCancelledError);
  });
});
