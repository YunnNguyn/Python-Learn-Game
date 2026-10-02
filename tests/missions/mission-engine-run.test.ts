import { describe, expect, it } from "vitest";

import missionEngineSource from "../../src/core/missions/mission-engine.ts?raw";
import {
  MissionInstanceSchema,
  MissionTemplateSchema,
  type MissionInstance,
  type MissionTemplate,
} from "../../src/core/domain";
import { MissionEngine } from "../../src/core/missions";
import type {
  RuntimeExecutionRequest,
  RuntimeExecutionResult,
  RuntimeLifecycleResult,
  RuntimeManager,
  RuntimeMissionPreparationRequest,
} from "../../src/core/runtime";
import { foundation1Fixtures } from "../fixtures/foundation1";

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

class FakeRuntimeManager implements RuntimeManager {
  readonly calls: string[] = [];
  readonly preparationRequests: RuntimeMissionPreparationRequest[] = [];
  readonly runRequests: RuntimeExecutionRequest[] = [];
  readonly submitRequests: RuntimeExecutionRequest[] = [];
  disposeCalls = 0;

  initializeResult: RuntimeLifecycleResult = { ok: true };
  prepareResult: RuntimeLifecycleResult = { ok: true };
  runResult: RuntimeExecutionResult = {
    status: "SUCCESS",
    stdout: "",
    stderr: "",
  };
  submitResult: RuntimeExecutionResult = {
    status: "SUCCESS",
    stdout: "",
    stderr: "",
  };

  initializeDeferred: Deferred<RuntimeLifecycleResult> | undefined;
  prepareDeferred: Deferred<RuntimeLifecycleResult> | undefined;
  runDeferred: Deferred<RuntimeExecutionResult> | undefined;
  submitDeferred: Deferred<RuntimeExecutionResult> | undefined;

  initialize(): Promise<RuntimeLifecycleResult> {
    this.calls.push("initialize");
    return this.initializeDeferred?.promise ?? Promise.resolve(this.initializeResult);
  }

  prepareMission(
    request: RuntimeMissionPreparationRequest,
  ): Promise<RuntimeLifecycleResult> {
    this.calls.push("prepareMission");
    this.preparationRequests.push(request);
    return this.prepareDeferred?.promise ?? Promise.resolve(this.prepareResult);
  }

  run(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    this.calls.push("run");
    this.runRequests.push(request);
    return this.runDeferred?.promise ?? Promise.resolve(this.runResult);
  }

  submit(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    this.calls.push("submit");
    this.submitRequests.push(request);
    return this.submitDeferred?.promise ?? Promise.resolve(this.submitResult);
  }

  dispose(): void {
    this.calls.push("dispose");
    this.disposeCalls += 1;
  }
}

function createTemplate(
  changes: Partial<MissionTemplate> = {},
): MissionTemplate {
  return MissionTemplateSchema.parse({
    ...foundation1Fixtures.missionTemplate,
    runtime: {
      ...foundation1Fixtures.missionTemplate.runtime,
      config: { runtimeOnly: "template-config" },
    },
    ...changes,
  });
}

function createInstance(
  template: MissionTemplate,
  changes: Partial<MissionInstance> = {},
): MissionInstance {
  return MissionInstanceSchema.parse({
    id: "mission-instance.mp1",
    templateId: template.id,
    templateVersion: template.version,
    seed: "mp1-seed",
    difficulty: "NORMAL",
    conceptIds: [...template.conceptIds],
    learner: {
      objective: "Run learner code experimentally.",
      starterCode: "print('starter')",
      data: { learnerOnly: "visible" },
    },
    runtime: {
      setupData: { runtimeOnly: "setup" },
    },
    grading: {
      data: { gradingOnly: "secret" },
    },
    world: {
      initialState: { worldOnly: true },
    },
    ...changes,
  });
}

async function loadReadyMission(
  runtime: FakeRuntimeManager,
  template = createTemplate(),
  instance = createInstance(template),
): Promise<{ engine: MissionEngine; template: MissionTemplate; instance: MissionInstance }> {
  const engine = new MissionEngine(runtime);
  await expect(engine.loadMission(template, instance)).resolves.toEqual({ ok: true });
  return { engine, template, instance };
}

describe("MissionEngine MP.1 Run pipeline", () => {
  it("initializes then prepares a matching canonical mission with only runtime config and setup data", async () => {
    const runtime = new FakeRuntimeManager();
    const engine = new MissionEngine(runtime);
    const template = createTemplate();
    const instance = createInstance(template);

    await expect(engine.loadMission(template, instance)).resolves.toEqual({ ok: true });

    expect(runtime.calls).toEqual(["initialize", "prepareMission"]);
    expect(runtime.preparationRequests).toEqual([
      {
        runtimeConfig: { runtimeOnly: "template-config" },
        setupData: { runtimeOnly: "setup" },
      },
    ]);
  });

  it("does not leak learner, grading, or world payloads into runtime preparation", async () => {
    const runtime = new FakeRuntimeManager();
    const engine = new MissionEngine(runtime);
    const template = createTemplate();
    const instance = createInstance(template);

    await engine.loadMission(template, instance);

    expect(runtime.preparationRequests[0]).toEqual({
      runtimeConfig: template.runtime.config,
      setupData: instance.runtime?.setupData,
    });
    expect(runtime.preparationRequests[0]).not.toEqual(
      expect.objectContaining({
        learner: instance.learner,
        grading: instance.grading,
        world: instance.world,
      }),
    );
    expect(JSON.stringify(runtime.preparationRequests[0])).not.toContain("gradingOnly");
    expect(JSON.stringify(runtime.preparationRequests[0])).not.toContain("learnerOnly");
    expect(JSON.stringify(runtime.preparationRequests[0])).not.toContain("worldOnly");
  });

  it("rejects a mismatched template ID before touching RuntimeManager", async () => {
    const runtime = new FakeRuntimeManager();
    const engine = new MissionEngine(runtime);
    const template = createTemplate();
    const instance = createInstance(template, {
      templateId: "mission.template.other" as MissionInstance["templateId"],
    });

    await expect(engine.loadMission(template, instance)).resolves.toMatchObject({
      ok: false,
      error: { code: "MISSION_TEMPLATE_ID_MISMATCH" },
    });
    expect(runtime.calls).toEqual([]);
  });

  it("rejects a mismatched template version before touching RuntimeManager", async () => {
    const runtime = new FakeRuntimeManager();
    const engine = new MissionEngine(runtime);
    const template = createTemplate();
    const instance = createInstance(template, {
      templateVersion: template.version + 1,
    });

    await expect(engine.loadMission(template, instance)).resolves.toMatchObject({
      ok: false,
      error: { code: "MISSION_TEMPLATE_VERSION_MISMATCH" },
    });
    expect(runtime.calls).toEqual([]);
  });

  it("stops after initialize failure and leaves the engine not ready", async () => {
    const runtime = new FakeRuntimeManager();
    runtime.initializeResult = {
      ok: false,
      error: { code: "INIT_FAILED", message: "init failed" },
    };
    const engine = new MissionEngine(runtime);
    const template = createTemplate();

    await expect(engine.loadMission(template, createInstance(template))).resolves.toEqual(
      runtime.initializeResult,
    );
    expect(runtime.calls).toEqual(["initialize"]);
    await expect(engine.run("print('no')")).resolves.toMatchObject({
      execution: {
        status: "RUNTIME_ERROR",
        error: { code: "MISSION_NOT_READY" },
      },
    });
  });

  it("preserves the previous current mission when a later preparation fails", async () => {
    const runtime = new FakeRuntimeManager();
    const engine = new MissionEngine(runtime);
    const templateA = createTemplate({
      id: "mission.template.a" as MissionTemplate["id"],
    });
    const instanceA = createInstance(templateA, { id: "mission-instance.a" as MissionInstance["id"] });
    await engine.loadMission(templateA, instanceA);

    const templateB = createTemplate({
      id: "mission.template.b" as MissionTemplate["id"],
    });
    const instanceB = createInstance(templateB, { id: "mission-instance.b" as MissionInstance["id"] });
    runtime.prepareResult = {
      ok: false,
      error: { code: "PREPARE_FAILED", message: "prepare failed" },
    };

    await expect(engine.loadMission(templateB, instanceB)).resolves.toEqual(runtime.prepareResult);

    runtime.runResult = {
      status: "SUCCESS",
      stdout: "still-a\n",
      stderr: "",
    };
    await expect(engine.run("print('still a')")).resolves.toEqual({
      execution: runtime.runResult,
    });
    expect(runtime.runRequests).toEqual([{ code: "print('still a')" }]);
  });

  it("switches to a later mission only after successful preparation", async () => {
    const runtime = new FakeRuntimeManager();
    const engine = new MissionEngine(runtime);
    const templateA = createTemplate({
      id: "mission.template.a" as MissionTemplate["id"],
    });
    const templateB = createTemplate({
      id: "mission.template.b" as MissionTemplate["id"],
      runtime: {
        ...createTemplate().runtime,
        config: { mission: "b" },
      },
    });

    await engine.loadMission(
      templateA,
      createInstance(templateA, { id: "mission-instance.a" as MissionInstance["id"] }),
    );
    await engine.loadMission(
      templateB,
      createInstance(templateB, {
        id: "mission-instance.b" as MissionInstance["id"],
        runtime: { setupData: { mission: "b" } },
      }),
    );

    expect(runtime.preparationRequests).toHaveLength(2);
    expect(runtime.preparationRequests[1]).toEqual({
      runtimeConfig: { mission: "b" },
      setupData: { mission: "b" },
    });
    await expect(engine.run("print('b')")).resolves.toEqual({
      execution: runtime.runResult,
    });
  });

  it("reloads the same mission and prepares its baseline again", async () => {
    const runtime = new FakeRuntimeManager();
    const engine = new MissionEngine(runtime);
    const template = createTemplate();
    const instance = createInstance(template);

    await engine.loadMission(template, instance);
    await engine.loadMission(template, instance);

    expect(runtime.calls).toEqual([
      "initialize",
      "prepareMission",
      "initialize",
      "prepareMission",
    ]);
    expect(runtime.preparationRequests).toHaveLength(2);
  });

  it("rejects Run before a successful mission load without touching RuntimeManager.run", async () => {
    const runtime = new FakeRuntimeManager();
    const engine = new MissionEngine(runtime);

    await expect(engine.run("print('early')")).resolves.toMatchObject({
      execution: {
        status: "RUNTIME_ERROR",
        error: { code: "MISSION_NOT_READY" },
      },
    });
    expect(runtime.runRequests).toEqual([]);
  });

  it("forwards learner code exactly and preserves SUCCESS output", async () => {
    const runtime = new FakeRuntimeManager();
    const { engine } = await loadReadyMission(runtime);
    const code = "print(\"hello\")\nvalue = value + 1";
    runtime.runResult = {
      status: "SUCCESS",
      stdout: "hello\n",
      stderr: "warning\n",
    };

    await expect(engine.run(code)).resolves.toEqual({
      execution: runtime.runResult,
    });
    expect(runtime.runRequests).toEqual([{ code }]);
  });

  it.each([
    {
      name: "PYTHON_EXCEPTION",
      result: {
        status: "PYTHON_EXCEPTION",
        stdout: "before\n",
        stderr: "",
        exception: {
          type: "ValueError",
          message: "bad value",
          traceback: "trace",
        },
      } satisfies RuntimeExecutionResult,
    },
    {
      name: "RUNTIME_ERROR",
      result: {
        status: "RUNTIME_ERROR",
        stdout: "",
        stderr: "worker error\n",
        error: {
          code: "WORKER_ERROR",
          message: "worker failed",
        },
      } satisfies RuntimeExecutionResult,
    },
    {
      name: "TIMEOUT",
      result: {
        status: "TIMEOUT",
        stdout: "",
        stderr: "",
        error: {
          code: "EXECUTION_TIMEOUT",
          message: "timed out and restored",
        },
      } satisfies RuntimeExecutionResult,
    },
  ])("preserves normalized $name execution semantics", async ({ result }) => {
    const runtime = new FakeRuntimeManager();
    const { engine } = await loadReadyMission(runtime);
    runtime.runResult = result;

    await expect(engine.run("learner_code()")).resolves.toEqual({
      execution: result,
    });
    expect(runtime.preparationRequests).toHaveLength(1);
  });

  it("allows repeated experimental Runs without re-preparing the mission", async () => {
    const runtime = new FakeRuntimeManager();
    const { engine } = await loadReadyMission(runtime);

    await engine.run("value = 2");
    await engine.run("value += 3");
    await engine.run("print(value)");

    expect(runtime.preparationRequests).toHaveLength(1);
    expect(runtime.runRequests).toEqual([
      { code: "value = 2" },
      { code: "value += 3" },
      { code: "print(value)" },
    ]);
  });

  it("rejects Submit before a successful mission load without touching RuntimeManager.submit", async () => {
    const runtime = new FakeRuntimeManager();
    const engine = new MissionEngine(runtime);

    await expect(engine.submit("print('early submit')")).resolves.toMatchObject({
      execution: {
        status: "RUNTIME_ERROR",
        error: { code: "MISSION_NOT_READY" },
      },
    });
    expect(runtime.submitRequests).toEqual([]);
  });

  it("delegates Submit code exactly and preserves the normalized execution result", async () => {
    const runtime = new FakeRuntimeManager();
    const { engine } = await loadReadyMission(runtime);
    const code = "print(value)\nvalue = value + 1";
    runtime.submitResult = {
      status: "PYTHON_EXCEPTION",
      stdout: "10\n",
      stderr: "",
      exception: {
        type: "ValueError",
        message: "submit failed",
        traceback: "trace",
      },
    };

    await expect(engine.submit(code)).resolves.toEqual({
      execution: runtime.submitResult,
    });
    expect(runtime.submitRequests).toEqual([{ code }]);
    expect(runtime.preparationRequests).toHaveLength(1);
  });

  it("keeps Run and Submit as distinct RuntimeManager operations", async () => {
    const runtime = new FakeRuntimeManager();
    const { engine } = await loadReadyMission(runtime);

    await engine.run("run_code()");
    await engine.submit("submit_code()");

    expect(runtime.runRequests).toEqual([{ code: "run_code()" }]);
    expect(runtime.submitRequests).toEqual([{ code: "submit_code()" }]);
    expect(runtime.calls).toEqual([
      "initialize",
      "prepareMission",
      "run",
      "submit",
    ]);
  });

  it("blocks Run, Submit, and mission switching while Submit is pending", async () => {
    const runtime = new FakeRuntimeManager();
    const { engine } = await loadReadyMission(runtime);
    runtime.submitDeferred = deferred<RuntimeExecutionResult>();
    const pendingSubmit = engine.submit("while True: pass");
    const templateB = createTemplate({
      id: "mission.template.b" as MissionTemplate["id"],
    });

    await expect(engine.run("run_during_submit()")).resolves.toMatchObject({
      execution: {
        status: "RUNTIME_ERROR",
        error: { code: "MISSION_ENGINE_BUSY" },
      },
    });
    await expect(engine.submit("second_submit()")).resolves.toMatchObject({
      execution: {
        status: "RUNTIME_ERROR",
        error: { code: "MISSION_ENGINE_BUSY" },
      },
    });
    await expect(
      engine.loadMission(templateB, createInstance(templateB)),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "MISSION_ENGINE_BUSY" },
    });
    expect(runtime.runRequests).toEqual([]);
    expect(runtime.submitRequests).toEqual([{ code: "while True: pass" }]);
    expect(runtime.preparationRequests).toHaveLength(1);

    runtime.submitDeferred.resolve({
      status: "SUCCESS",
      stdout: "",
      stderr: "",
    });
    await pendingSubmit;
  });

  it("blocks mission switching while a Run owned by the engine is pending", async () => {
    const runtime = new FakeRuntimeManager();
    const { engine } = await loadReadyMission(runtime);
    runtime.runDeferred = deferred<RuntimeExecutionResult>();
    const pendingRun = engine.run("while True: pass");
    const templateB = createTemplate({
      id: "mission.template.b" as MissionTemplate["id"],
    });

    await expect(
      engine.loadMission(templateB, createInstance(templateB)),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "MISSION_ENGINE_BUSY" },
    });
    expect(runtime.preparationRequests).toHaveLength(1);

    runtime.runDeferred.resolve({
      status: "TIMEOUT",
      stdout: "",
      stderr: "",
    });
    await pendingRun;
  });

  it("blocks Run while mission loading is pending", async () => {
    const runtime = new FakeRuntimeManager();
    runtime.prepareDeferred = deferred<RuntimeLifecycleResult>();
    const engine = new MissionEngine(runtime);
    const template = createTemplate();
    const load = engine.loadMission(template, createInstance(template));
    await Promise.resolve();

    await expect(engine.run("print('race')")).resolves.toMatchObject({
      execution: {
        status: "RUNTIME_ERROR",
        error: { code: "MISSION_ENGINE_BUSY" },
      },
    });
    expect(runtime.runRequests).toEqual([]);

    runtime.prepareDeferred.resolve({ ok: true });
    await expect(load).resolves.toEqual({ ok: true });
  });

  it("rejects a concurrent second Run through the same engine guard", async () => {
    const runtime = new FakeRuntimeManager();
    const { engine } = await loadReadyMission(runtime);
    runtime.runDeferred = deferred<RuntimeExecutionResult>();
    const first = engine.run("first()");

    await expect(engine.run("second()")).resolves.toMatchObject({
      execution: {
        status: "RUNTIME_ERROR",
        error: { code: "MISSION_ENGINE_BUSY" },
      },
    });
    expect(runtime.runRequests).toEqual([{ code: "first()" }]);

    runtime.runDeferred.resolve({
      status: "SUCCESS",
      stdout: "",
      stderr: "",
    });
    await first;
  });

  it("owns and disposes the injected RuntimeManager exactly once", async () => {
    const runtime = new FakeRuntimeManager();
    const { engine, template, instance } = await loadReadyMission(runtime);

    engine.dispose();
    engine.dispose();

    expect(runtime.disposeCalls).toBe(1);
    await expect(engine.run("print('disposed')")).resolves.toMatchObject({
      execution: {
        status: "RUNTIME_ERROR",
        error: { code: "MISSION_ENGINE_DISPOSED" },
      },
    });
    await expect(engine.submit("print('disposed')")).resolves.toMatchObject({
      execution: {
        status: "RUNTIME_ERROR",
        error: { code: "MISSION_ENGINE_DISPOSED" },
      },
    });
    await expect(engine.loadMission(template, instance)).resolves.toMatchObject({
      ok: false,
      error: { code: "MISSION_ENGINE_DISPOSED" },
    });
    expect(runtime.calls.filter((call) => call === "dispose")).toHaveLength(1);
  });

  it("does not mutate MissionTemplate, MissionInstance, or learner code", async () => {
    const runtime = new FakeRuntimeManager();
    const engine = new MissionEngine(runtime);
    const template = createTemplate();
    const instance = createInstance(template);
    const templateBefore = structuredClone(template);
    const instanceBefore = structuredClone(instance);
    const code = "value = {'items': [1, 2, 3]}";

    await engine.loadMission(template, instance);
    await engine.run(code);

    expect(template).toEqual(templateBefore);
    expect(instance).toEqual(instanceBefore);
    expect(runtime.runRequests[0]).toEqual({ code });
  });

  it("keeps the Core Run/Submit engine free of Pyodide, React, grading, attempts, mastery, world-event, content, and package-loading dependencies", () => {
    for (const forbidden of [
      "PyodideRuntimeManager",
      "loadPyodide",
      "content/cs116",
      "react",
      "GraderRegistry",
      "gradeDeclaratively",
      "AttemptRecord",
      "MasteryState",
      "LearningEngine",
      "WorldEvent",
      "loadPackage",
      "numpy",
    ]) {
      expect(missionEngineSource).not.toContain(forbidden);
    }
  });
});
