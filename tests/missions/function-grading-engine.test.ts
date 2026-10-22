import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";

import {
  MissionInstanceSchema,
  MissionTemplateSchema,
  type JsonObject,
  type MissionInstance,
  type MissionTemplate,
} from "../../src/core/domain";
import {
  CORE_GRADER_ID,
  FunctionCaseOutcome,
  GraderRegistry,
  registerCoreGraders,
  type GraderResult,
} from "../../src/core/grading";
import { MissionEngine } from "../../src/core/missions";
import {
  RUNTIME_EXECUTION_STATUS,
  type RuntimeExecutionRequest,
  type RuntimeExecutionResult,
  type RuntimeLifecycleResult,
  type RuntimeManager,
} from "../../src/core/runtime";
import { foundation1Fixtures } from "../fixtures/foundation1";
import { NodePyodideRuntime } from "../exercise-packs/pyodide-pack-verifier";

/**
 * MissionEngine <-> function probes (PHASE-07 / M9).
 *
 *  - With a fake runtime: what the engine asks for, and that it refuses to grade a
 *    FUNCTION_CASES mission when the runtime did not make the calls.
 *  - On a REAL Pyodide: the whole path (declarative config with $gradingData cases ->
 *    probe plan -> real calls -> grader) including the hard-coded-solution regression.
 */

const CASES = [
  { id: "example", label: "Ví dụ trong đề", visibility: "example", args: [[1, 2, 3]], expect: { kind: "RETURNS", value: 6 } },
  { id: "empty", label: "Danh sách rỗng", args: [[]], expect: { kind: "RETURNS", value: 0 } },
  { id: "negative", label: "Có số âm", args: [[5, -2]], expect: { kind: "RETURNS", value: 3 } },
  { id: "single", label: "Một phần tử", args: [[10]], expect: { kind: "RETURNS", value: 10 } },
] as const;

function createTemplate(checks: JsonObject[] | undefined = undefined): MissionTemplate {
  return MissionTemplateSchema.parse({
    ...foundation1Fixtures.missionTemplate,
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: checks ?? [
          { type: "NO_EXCEPTION" },
          { type: "FUNCTION_CASES", function: "total", cases: { $gradingData: "cases" } },
        ],
      },
    },
  });
}

function createInstance(template: MissionTemplate): MissionInstance {
  return MissionInstanceSchema.parse({
    id: "mission-instance.fn1",
    templateId: template.id,
    templateVersion: template.version,
    seed: "fn-seed",
    difficulty: "NORMAL",
    conceptIds: [...template.conceptIds],
    learner: { objective: "Write total(values).", starterCode: "def total(values):\n    pass\n" },
    runtime: { setupData: {} },
    grading: { data: { cases: CASES as unknown as JsonObject[] } },
    world: { initialState: {} },
  });
}

function registry(): GraderRegistry {
  const graders = new GraderRegistry();
  registerCoreGraders(graders);
  return graders;
}

class FakeRuntime implements RuntimeManager {
  readonly submitRequests: RuntimeExecutionRequest[] = [];
  submitResult: RuntimeExecutionResult = { status: RUNTIME_EXECUTION_STATUS.SUCCESS, stdout: "", stderr: "", serialized: { variables: {} } };
  initialize(): Promise<RuntimeLifecycleResult> {
    return Promise.resolve({ ok: true });
  }
  prepareMission(): Promise<RuntimeLifecycleResult> {
    return Promise.resolve({ ok: true });
  }
  run(): Promise<RuntimeExecutionResult> {
    return Promise.resolve({ status: RUNTIME_EXECUTION_STATUS.SUCCESS, stdout: "", stderr: "" });
  }
  submit(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    this.submitRequests.push(request);
    return Promise.resolve(this.submitResult);
  }
  dispose(): void {}
}

describe("MissionEngine - function probes with a fake runtime", () => {
  it("asks the runtime for the calls (arguments only) and grades what comes back", async () => {
    const runtime = new FakeRuntime();
    const template = createTemplate();
    const engine = new MissionEngine(runtime, registry());
    await engine.loadMission(template, createInstance(template));
    runtime.submitResult = {
      status: RUNTIME_EXECUTION_STATUS.SUCCESS,
      stdout: "",
      stderr: "",
      serialized: {
        variables: {},
        functionResults: [
          {
            function: "total",
            status: "OK",
            cases: [6, 0, 3, 10].map((value) => ({ outcome: "returned", pythonType: "int", value })),
          },
        ],
      },
    };

    const result = await engine.submit("def total(values):\n    return sum(values)\n");

    expect(runtime.submitRequests).toHaveLength(1);
    expect(runtime.submitRequests[0]).toEqual({
      code: "def total(values):\n    return sum(values)\n",
      observeVariables: [],
      functionProbes: [{ function: "total", cases: CASES.map((item) => ({ args: item.args })) }],
    });
    expect(JSON.stringify(runtime.submitRequests[0])).not.toMatch(/"expect"|RETURNS|Ví dụ/);
    expect(result.grading?.passed).toBe(true);
  });

  it("a mission WITHOUT function checks makes exactly the M8 request (no functionProbes key at all)", async () => {
    const runtime = new FakeRuntime();
    const template = createTemplate([{ type: "NO_EXCEPTION" }, { type: "EXACT_VALUES", variable: "answer", expected: 1 }]);
    const engine = new MissionEngine(runtime, registry());
    await engine.loadMission(template, createInstance(template));
    runtime.submitResult = {
      status: RUNTIME_EXECUTION_STATUS.SUCCESS,
      stdout: "",
      stderr: "",
      serialized: { variables: { answer: { pythonType: "int", isNdarray: false, value: 1 } } },
    };
    const result = await engine.submit("answer = 1");
    expect(runtime.submitRequests[0]).toEqual({ code: "answer = 1", observeVariables: ["answer"] });
    expect("functionProbes" in runtime.submitRequests[0]!).toBe(false);
    expect(result.grading?.passed).toBe(true);
  });

  it.each([
    ["no functionResults at all (a runtime that cannot make the calls)", { variables: {} }],
    ["too few probes", { variables: {}, functionResults: [] }],
    ["another function name", { variables: {}, functionResults: [{ function: "other", status: "OK", cases: [] }] }],
    ["too few case observations", { variables: {}, functionResults: [{ function: "total", status: "OK", cases: [{ outcome: "returned", pythonType: "int", value: 6 }] }] }],
    ["a malformed case observation", { variables: {}, functionResults: [{ function: "total", status: "OK", cases: [{ outcome: "weird" }, {}, {}, {}] }] }],
  ])("refuses to grade when the runtime returned %s", async (_name, serialized) => {
    const runtime = new FakeRuntime();
    const template = createTemplate();
    const engine = new MissionEngine(runtime, registry());
    await engine.loadMission(template, createInstance(template));
    runtime.submitResult = { status: RUNTIME_EXECUTION_STATUS.SUCCESS, stdout: "", stderr: "", serialized: serialized as JsonObject };

    const result = await engine.submit("def total(values):\n    return 6\n");

    expect(result.grading).toBeUndefined();
    expect(result.execution).toMatchObject({ status: RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR, error: { code: "INVALID_RUNTIME_OBSERVATIONS" } });
  });

  it("a program that raised is graded as a runtime error without needing function results", async () => {
    const runtime = new FakeRuntime();
    const template = createTemplate();
    const engine = new MissionEngine(runtime, registry());
    await engine.loadMission(template, createInstance(template));
    runtime.submitResult = {
      status: RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION,
      stdout: "",
      stderr: "",
      exception: { type: "NameError", message: "name 'q' is not defined" },
      serialized: { variables: {} },
    };
    const result = await engine.submit("q");
    expect(result.grading?.passed).toBe(false);
    expect(result.grading?.runtimeError).toMatchObject({ type: "NameError" });
  });

  it("Run never asks for function probes", async () => {
    const runtime = new FakeRuntime();
    const template = createTemplate();
    const engine = new MissionEngine(runtime, registry());
    await engine.loadMission(template, createInstance(template));
    const spy: RuntimeExecutionRequest[] = [];
    runtime.run = (request?: unknown) => {
      spy.push(request as RuntimeExecutionRequest);
      return Promise.resolve({ status: RUNTIME_EXECUTION_STATUS.SUCCESS, stdout: "", stderr: "" });
    };
    await engine.run("print(1)");
    expect(spy).toEqual([{ code: "print(1)" }]);
  });

  it("an invalid FUNCTION_CASES config is rejected as INVALID_GRADER_CONFIG before any code runs", async () => {
    const runtime = new FakeRuntime();
    const template = createTemplate([{ type: "FUNCTION_CASES", function: "total", cases: [] }]);
    const engine = new MissionEngine(runtime, registry());
    await engine.loadMission(template, createInstance(template));
    const result = await engine.submit("x = 1");
    expect(result.execution).toMatchObject({ status: RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR, error: { code: "INVALID_GRADER_CONFIG" } });
    expect(runtime.submitRequests).toHaveLength(0);
  });
});

describe("MissionEngine - behavioral grading on a real Pyodide", () => {
  let pyodide: PyodideInterface;

  beforeAll(async () => {
    pyodide = await loadPyodide();
  }, 240_000);

  async function submit(code: string): Promise<{ execution: RuntimeExecutionResult; grading?: GraderResult }> {
    const template = createTemplate();
    const engine = new MissionEngine(new NodePyodideRuntime(pyodide, async () => undefined), registry());
    const loaded = await engine.loadMission(template, createInstance(template));
    expect(loaded.ok).toBe(true);
    try {
      return await engine.submit(code);
    } finally {
      engine.dispose();
    }
  }

  const failedCases = (grading: GraderResult | undefined) =>
    (grading?.checks.find((check) => check.type === "FUNCTION_CASES")?.cases ?? []).filter((item) => !item.passed);

  it("a correct function passes", async () => {
    const { execution, grading } = await submit("def total(values):\n    result = 0\n    for v in values:\n        result += v\n    return result\n");
    expect(execution.status).toBe(RUNTIME_EXECUTION_STATUS.SUCCESS);
    expect(grading?.passed).toBe(true);
  });

  it("REGRESSION: a hard-coded function passes the displayed example but fails the other arguments", async () => {
    const { grading } = await submit("def total(values):\n    return 6\n\nprint(total([1, 2, 3]))\n");
    expect(grading?.passed).toBe(false);
    const failed = failedCases(grading);
    expect(failed.map((item) => item.id)).toEqual(["empty", "negative", "single"]);
    expect(failed.every((item) => item.outcome === FunctionCaseOutcome.WRONG_VALUE)).toBe(true);
    // The example case itself is satisfied - exactly why a single observed variable was not enough.
    const example = grading!.checks.find((check) => check.type === "FUNCTION_CASES")!.cases!.find((item) => item.id === "example")!;
    expect(example.passed).toBe(true);
  });

  it("REGRESSION: a function that special-cases the example input is caught by the other cases", async () => {
    const { grading } = await submit("def total(values):\n    if values == [1, 2, 3]:\n        return 6\n    return 0\n");
    expect(grading?.passed).toBe(false);
    expect(failedCases(grading).map((item) => item.id)).toEqual(["negative", "single"]);
  });

  it("an exception inside the function is a RAISED case, with the other cases still graded", async () => {
    const { grading } = await submit("def total(values):\n    return values[0] + sum(values[1:])\n");
    expect(grading?.passed).toBe(false);
    const failed = failedCases(grading);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ id: "empty", outcome: FunctionCaseOutcome.RAISED, exceptionType: "IndexError" });
  });

  it("a function that returns the wrong TYPE is told apart from a wrong value", async () => {
    const { grading } = await submit("def total(values):\n    return str(sum(values))\n");
    expect(failedCases(grading).every((item) => item.outcome === FunctionCaseOutcome.WRONG_TYPE)).toBe(true);
    expect(failedCases(grading)).toHaveLength(4);
  });

  it("printing instead of returning is a failure (the call returns None)", async () => {
    const { grading } = await submit("def total(values):\n    print(sum(values))\n");
    expect(grading?.passed).toBe(false);
    expect(failedCases(grading)[0]).toMatchObject({ outcome: FunctionCaseOutcome.WRONG_TYPE, actualType: "NoneType" });
  });

  it("a missing function, a non-function name and a program-level exception are each reported distinctly", async () => {
    const missing = await submit("def totaal(values):\n    return sum(values)\n");
    expect(missing.grading?.checks.find((c) => c.type === "FUNCTION_CASES")).toMatchObject({ passed: false, category: "MISSING_VARIABLE" });
    const notFunction = await submit("total = 6\n");
    expect(notFunction.grading?.checks.find((c) => c.type === "FUNCTION_CASES")).toMatchObject({ passed: false, category: "TYPE_ERROR" });
    const crashed = await submit("def total(values):\n    return sum(values)\n\nundefined_name\n");
    expect(crashed.execution.status).toBe(RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION);
    expect(crashed.grading?.checks.find((c) => c.type === "NO_EXCEPTION")).toMatchObject({ passed: false });
    expect(crashed.grading?.checks.find((c) => c.type === "FUNCTION_CASES")?.cases).toBeUndefined();
  });

  it("the learner program runs ONCE: top-level side effects are not repeated per case", async () => {
    const { execution, grading } = await submit("calls = []\ndef total(values):\n    calls.append(1)\n    return sum(values)\n\nprint('loaded')\n");
    expect(grading?.passed).toBe(true);
    // stdout of the Submit is only the learner's own program, printed once.
    expect("stdout" in execution && execution.stdout.match(/loaded/g)?.length).toBe(1);
  });

  it("mutating the input list is harmless to the next case (arguments are rebuilt for every call)", async () => {
    const { grading } = await submit("def total(values):\n    out = 0\n    while values:\n        out += values.pop()\n    return out\n");
    expect(grading?.passed).toBe(true);
  });
});
