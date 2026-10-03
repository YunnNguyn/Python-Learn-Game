import { describe, expect, it, vi } from "vitest";

import {
  MissionInstanceSchema,
  MissionTemplateSchema,
  type MissionInstance,
  type MissionTemplate,
} from "../../src/core/domain";
import {
  CORE_GRADER_ID,
  DeclarativeGraderCheckType,
  GraderFailureCategory,
  GraderRegistry,
  registerCoreGraders,
  type Grader,
} from "../../src/core/grading";
import { MissionEngine } from "../../src/core/missions";
import {
  RUNTIME_EXECUTION_STATUS,
  type RuntimeExecutionRequest,
  type RuntimeExecutionResult,
  type RuntimeLifecycleResult,
  type RuntimeManager,
  type RuntimeMissionPreparationRequest,
} from "../../src/core/runtime";
import { foundation1Fixtures } from "../fixtures/foundation1";

class FakeRuntimeManager implements RuntimeManager {
  readonly preparationRequests: RuntimeMissionPreparationRequest[] = [];
  readonly runRequests: RuntimeExecutionRequest[] = [];
  readonly submitRequests: RuntimeExecutionRequest[] = [];

  runResult: RuntimeExecutionResult = {
    status: RUNTIME_EXECUTION_STATUS.SUCCESS,
    stdout: "",
    stderr: "",
  };

  submitResult: RuntimeExecutionResult = {
    status: RUNTIME_EXECUTION_STATUS.SUCCESS,
    stdout: "",
    stderr: "",
    serialized: { variables: {} },
  };

  initialize(): Promise<RuntimeLifecycleResult> {
    return Promise.resolve({ ok: true });
  }

  prepareMission(
    request: RuntimeMissionPreparationRequest,
  ): Promise<RuntimeLifecycleResult> {
    this.preparationRequests.push(request);
    return Promise.resolve({ ok: true });
  }

  run(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    this.runRequests.push(request);
    return Promise.resolve(this.runResult);
  }

  submit(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    this.submitRequests.push(request);
    return Promise.resolve(this.submitResult);
  }

  dispose(): void {}
}

function createTemplate(
  changes: Partial<MissionTemplate> = {},
): MissionTemplate {
  return MissionTemplateSchema.parse({
    ...foundation1Fixtures.missionTemplate,
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "answer",
            expected: 42,
          },
        ],
      },
    },
    ...changes,
  });
}

function createInstance(
  template: MissionTemplate,
  changes: Partial<MissionInstance> = {},
): MissionInstance {
  return MissionInstanceSchema.parse({
    id: "mission-instance.mp3",
    templateId: template.id,
    templateVersion: template.version,
    seed: "mp3-seed",
    difficulty: "NORMAL",
    conceptIds: [...template.conceptIds],
    learner: {
      objective: "Grade learner code.",
      starterCode: "answer = 0",
      data: { learnerOnly: "visible" },
    },
    runtime: {
      setupData: { runtimeOnly: "setup" },
    },
    grading: {
      data: { secretExpected: 42 },
    },
    world: {
      initialState: { worldOnly: true },
    },
    ...changes,
  });
}

function createCoreRegistry(): GraderRegistry {
  const registry = new GraderRegistry();
  registerCoreGraders(registry);
  return registry;
}

async function loadMission(
  runtime: FakeRuntimeManager,
  registry: GraderRegistry,
  template = createTemplate(),
  instance = createInstance(template),
): Promise<MissionEngine> {
  const engine = new MissionEngine(runtime, registry);
  await expect(engine.loadMission(template, instance)).resolves.toEqual({ ok: true });
  return engine;
}

function observedAnswer(value: number): RuntimeExecutionResult {
  return {
    status: RUNTIME_EXECUTION_STATUS.SUCCESS,
    stdout: "",
    stderr: "",
    serialized: {
      variables: {
        answer: {
          pythonType: "int",
          isNdarray: false,
          value,
        },
      },
    },
  };
}

describe("MissionEngine MP.3 grading integration", () => {
  it("resolves core.declarative, requests only planned variables, and returns a passing grade", async () => {
    const runtime = new FakeRuntimeManager();
    runtime.submitResult = observedAnswer(42);
    const registry = createCoreRegistry();
    const getGrader = vi.spyOn(registry, "getGrader");
    const engine = await loadMission(runtime, registry);

    const result = await engine.submit("answer = 42");

    expect(getGrader).toHaveBeenCalledWith(CORE_GRADER_ID.DECLARATIVE);
    expect(runtime.submitRequests).toEqual([
      {
        code: "answer = 42",
        observeVariables: ["answer"],
      },
    ]);
    expect(result.execution).toEqual(runtime.submitResult);
    expect(result.grading).toMatchObject({ passed: true });
  });

  it("returns VALUE_ERROR when execution succeeds with the wrong observed value", async () => {
    const runtime = new FakeRuntimeManager();
    runtime.submitResult = observedAnswer(41);
    const engine = await loadMission(runtime, createCoreRegistry());

    const result = await engine.submit("answer = 41");

    expect(result.grading).toMatchObject({
      passed: false,
      checks: [
        {
          passed: false,
          category: GraderFailureCategory.VALUE_ERROR,
          variable: "answer",
        },
      ],
    });
  });

  it("returns MISSING_VARIABLE when the requested variable is absent", async () => {
    const runtime = new FakeRuntimeManager();
    runtime.submitResult = {
      status: RUNTIME_EXECUTION_STATUS.SUCCESS,
      stdout: "",
      stderr: "",
      serialized: { variables: {} },
    };
    const engine = await loadMission(runtime, createCoreRegistry());

    const result = await engine.submit("pass");

    expect(result.grading).toMatchObject({
      passed: false,
      checks: [
        {
          passed: false,
          category: GraderFailureCategory.MISSING_VARIABLE,
          variable: "answer",
        },
      ],
    });
  });

  it("grades a Python exception through an authored NO_EXCEPTION check", async () => {
    const runtime = new FakeRuntimeManager();
    runtime.submitResult = {
      status: RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION,
      stdout: "before\n",
      stderr: "",
      exception: {
        type: "ValueError",
        message: "boom",
        traceback: "trace",
      },
      serialized: { variables: {} },
    };
    const template = createTemplate({
      grader: {
        id: CORE_GRADER_ID.DECLARATIVE,
        config: {
          checks: [{ type: DeclarativeGraderCheckType.NO_EXCEPTION }],
        },
      },
    });
    const engine = await loadMission(
      runtime,
      createCoreRegistry(),
      template,
      createInstance(template),
    );

    const result = await engine.submit("raise ValueError('boom')");

    expect(runtime.submitRequests[0]).toEqual({
      code: "raise ValueError('boom')",
      observeVariables: [],
    });
    expect(result.grading).toMatchObject({
      passed: false,
      runtimeError: { type: "ValueError", message: "boom" },
      checks: [
        {
          type: DeclarativeGraderCheckType.NO_EXCEPTION,
          passed: false,
          category: GraderFailureCategory.RUNTIME_ERROR,
        },
      ],
    });
  });

  it("grades TIMEOUT with empty variables and an authored NO_EXCEPTION check", async () => {
    const runtime = new FakeRuntimeManager();
    runtime.submitResult = {
      status: RUNTIME_EXECUTION_STATUS.TIMEOUT,
      stdout: "",
      stderr: "",
      error: {
        code: "EXECUTION_TIMEOUT",
        message: "execution timed out",
      },
    };
    const template = createTemplate({
      grader: {
        id: CORE_GRADER_ID.DECLARATIVE,
        config: {
          checks: [{ type: DeclarativeGraderCheckType.NO_EXCEPTION }],
        },
      },
    });
    const engine = await loadMission(
      runtime,
      createCoreRegistry(),
      template,
      createInstance(template),
    );

    const result = await engine.submit("while True: pass");

    expect(result.grading).toMatchObject({
      passed: false,
      runtimeError: {
        type: "EXECUTION_TIMEOUT",
        message: "execution timed out",
      },
    });
  });

  it("passes config and hidden gradingData only to the grader while runtime sees variable names only", async () => {
    const runtime = new FakeRuntimeManager();
    runtime.submitResult = observedAnswer(42);
    const template = createTemplate();
    const instance = createInstance(template, {
      grading: {
        data: {
          secretExpected: 42,
          hiddenLabel: "never-send-to-runtime",
        },
      },
    });
    const grade = vi.fn<Grader["grade"]>(() => ({ passed: true, checks: [] }));
    const registry = new GraderRegistry();
    registry.registerGrader(CORE_GRADER_ID.DECLARATIVE, { grade });
    const engine = await loadMission(runtime, registry, template, instance);

    const result = await engine.submit("answer = 42");

    expect(grade).toHaveBeenCalledTimes(1);
    expect(grade).toHaveBeenCalledWith({
      config: template.grader.config,
      gradingData: instance.grading?.data,
      execution: {
        variables: {
          answer: {
            pythonType: "int",
            isNdarray: false,
            value: 42,
          },
        },
      },
    });
    expect(runtime.submitRequests).toEqual([
      {
        code: "answer = 42",
        observeVariables: ["answer"],
      },
    ]);
    expect(JSON.stringify(runtime.submitRequests[0])).not.toContain("secretExpected");
    expect(JSON.stringify(runtime.submitRequests[0])).not.toContain(
      "never-send-to-runtime",
    );
    expect(result.grading).toEqual({ passed: true, checks: [] });
  });

  it("fails before learner Submit when the configured grader is missing", async () => {
    const runtime = new FakeRuntimeManager();
    const engine = await loadMission(runtime, new GraderRegistry());

    const result = await engine.submit("answer = 42");

    expect(result).toMatchObject({
      execution: {
        status: RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR,
        error: { code: "GRADER_NOT_FOUND" },
      },
    });
    expect(runtime.submitRequests).toEqual([]);
  });

  it("rejects malformed declarative config before learner execution", async () => {
    const runtime = new FakeRuntimeManager();
    const template = createTemplate({
      grader: {
        id: CORE_GRADER_ID.DECLARATIVE,
        config: { checks: [] },
      },
    });
    const engine = await loadMission(
      runtime,
      createCoreRegistry(),
      template,
      createInstance(template),
    );

    const result = await engine.submit("answer = 42");

    expect(result).toMatchObject({
      execution: {
        status: RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR,
        error: { code: "INVALID_GRADER_CONFIG" },
      },
    });
    expect(runtime.submitRequests).toEqual([]);
  });

  it("fails explicitly for a registered custom grader without an observation planner", async () => {
    const runtime = new FakeRuntimeManager();
    const template = createTemplate({
      grader: {
        id: "grader.custom" as MissionTemplate["grader"]["id"],
        config: { custom: true },
      },
    });
    const grade = vi.fn<Grader["grade"]>(() => ({ passed: true, checks: [] }));
    const registry = new GraderRegistry();
    registry.registerGrader(template.grader.id, { grade });
    const engine = await loadMission(
      runtime,
      registry,
      template,
      createInstance(template),
    );

    const result = await engine.submit("answer = 42");

    expect(result).toMatchObject({
      execution: {
        status: RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR,
        error: { code: "GRADER_INTEGRATION_UNSUPPORTED" },
      },
    });
    expect(runtime.submitRequests).toEqual([]);
    expect(grade).not.toHaveBeenCalled();
  });

  it("treats malformed requested observations as an integration failure", async () => {
    const runtime = new FakeRuntimeManager();
    runtime.submitResult = {
      status: RUNTIME_EXECUTION_STATUS.SUCCESS,
      stdout: "learner stdout\n",
      stderr: "learner stderr\n",
      serialized: {
        variables: {
          answer: {
            pythonType: "int",
            isNdarray: false,
            value: 42,
            unexpected: true,
          },
        },
      },
    };
    const engine = await loadMission(runtime, createCoreRegistry());

    const result = await engine.submit("answer = 42");

    expect(result).toMatchObject({
      execution: {
        status: RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR,
        stdout: "learner stdout\n",
        stderr: "learner stderr\n",
        error: {
          code: "INVALID_RUNTIME_OBSERVATIONS",
        },
      },
    });
  });

  it("turns a grader exception into GRADER_EXECUTION_FAILED while preserving learner output", async () => {
    const runtime = new FakeRuntimeManager();
    runtime.submitResult = {
      status: RUNTIME_EXECUTION_STATUS.SUCCESS,
      stdout: "learner stdout\n",
      stderr: "learner stderr\n",
      serialized: { variables: {} },
    };
    const template = createTemplate({
      grader: {
        id: CORE_GRADER_ID.DECLARATIVE,
        config: {
          checks: [{ type: DeclarativeGraderCheckType.NO_EXCEPTION }],
        },
      },
    });
    const grade = vi.fn<Grader["grade"]>(() => {
      throw new Error("grader exploded");
    });
    const registry = new GraderRegistry();
    registry.registerGrader(CORE_GRADER_ID.DECLARATIVE, { grade });
    const engine = await loadMission(
      runtime,
      registry,
      template,
      createInstance(template),
    );

    const result = await engine.submit("print('learner')");

    expect(result).toMatchObject({
      execution: {
        status: RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR,
        stdout: "learner stdout\n",
        stderr: "learner stderr\n",
        error: { code: "GRADER_EXECUTION_FAILED" },
      },
    });
    expect(result.grading).toBeUndefined();
  });

  it("keeps Run completely ungraded and does not request observations", async () => {
    const runtime = new FakeRuntimeManager();
    runtime.runResult = {
      status: RUNTIME_EXECUTION_STATUS.SUCCESS,
      stdout: "run\n",
      stderr: "",
    };
    const grade = vi.fn<Grader["grade"]>(() => ({ passed: true, checks: [] }));
    const registry = new GraderRegistry();
    registry.registerGrader(CORE_GRADER_ID.DECLARATIVE, { grade });
    const getGrader = vi.spyOn(registry, "getGrader");
    const engine = await loadMission(runtime, registry);

    const result = await engine.run("answer = 99");

    expect(result).toEqual({ execution: runtime.runResult });
    expect(runtime.runRequests).toEqual([{ code: "answer = 99" }]);
    expect(getGrader).not.toHaveBeenCalled();
    expect(grade).not.toHaveBeenCalled();
  });
});
