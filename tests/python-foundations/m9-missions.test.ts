import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";

import { PYTHON_FOUNDATIONS_M9_STARTER_CODE } from "../../src/content/python-foundations";
import type { LearningActivityId } from "../../src/core/domain";
import type { FunctionCase } from "../../src/core/grading";
import { RUNTIME_EXECUTION_STATUS } from "../../src/core/runtime";
import { requireNumpy, tryLoadNumpy, type NumpyState } from "../runtime/numpy-support";
import { instanceOf, M9_ACTIVITY_IDS, runOnPyodide, submitOnPyodide, templateOf } from "./pyodide-mission-harness";
import { M9_SOLUTIONS } from "./m9-solutions";

/**
 * The eight M9 missions (PF-08..PF-15) through REAL Pyodide, the real generator, the real
 * MissionEngine, the real function probes and the real declarative grader.
 *
 * PF-14 and PF-15 need REAL NumPy (a Pyodide package). When it cannot be fetched the tests
 * that need it are reported SKIPPED, never passed; with PACK_VERIFY_STRICT=1 they FAIL, so
 * an acceptance run cannot be green without the NumPy missions having executed.
 *
 * What is not covered here is the browser: the Web Worker transport, Monaco and IndexedDB
 * are exercised by qa/m9-acceptance in a real Edge.
 */

const VARIANTS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const NUMPY_MISSIONS = new Set(["python-foundations.pf14", "python-foundations.pf15"]);
const STARTERS: Record<string, string> = {
  "python-foundations.pf08": PYTHON_FOUNDATIONS_M9_STARTER_CODE.pf08,
  "python-foundations.pf09": PYTHON_FOUNDATIONS_M9_STARTER_CODE.pf09,
  "python-foundations.pf10": PYTHON_FOUNDATIONS_M9_STARTER_CODE.pf10,
  "python-foundations.pf11": PYTHON_FOUNDATIONS_M9_STARTER_CODE.pf11,
  "python-foundations.pf12": PYTHON_FOUNDATIONS_M9_STARTER_CODE.pf12,
  "python-foundations.pf13": PYTHON_FOUNDATIONS_M9_STARTER_CODE.pf13,
  "python-foundations.pf14": PYTHON_FOUNDATIONS_M9_STARTER_CODE.pf14,
  "python-foundations.pf15": PYTHON_FOUNDATIONS_M9_STARTER_CODE.pf15,
};

let pyodide: PyodideInterface;
let numpy: NumpyState = { available: false, error: "not loaded" };

beforeAll(async () => {
  pyodide = await loadPyodide();
  numpy = await tryLoadNumpy(pyodide);
}, 240_000);

const needsNumpy = (ctx: { skip: (reason?: string) => void }, activityId: string): void => {
  if (NUMPY_MISSIONS.has(activityId)) requireNumpy(ctx, numpy);
};

const gradingData = (activityId: string, variant: number): Record<string, unknown> =>
  instanceOf(activityId as LearningActivityId, variant).grading!.data as Record<string, unknown>;

describe("M9 missions - reference solutions (real Pyodide)", () => {
  for (const activityId of M9_ACTIVITY_IDS) {
    it(`${activityId}: the reference solution passes on every tested variant`, async (ctx) => {
      needsNumpy(ctx, activityId);
      for (const variant of VARIANTS) {
        const outcome = await submitOnPyodide(pyodide, activityId, variant, M9_SOLUTIONS[activityId]!.reference);
        expect(
          { variant, passed: outcome.passed, status: outcome.status, failed: outcome.failedChecks },
          `variant ${variant}`,
        ).toEqual({ variant, passed: true, status: RUNTIME_EXECUTION_STATUS.SUCCESS, failed: [] });
      }
    }, 240_000);
  }
});

describe("M9 missions - the starter never passes (real Pyodide)", () => {
  for (const activityId of M9_ACTIVITY_IDS) {
    it(`${activityId}: the untouched starter does not pass`, async (ctx) => {
      needsNumpy(ctx, activityId);
      for (const variant of VARIANTS) {
        const outcome = await submitOnPyodide(pyodide, activityId, variant, STARTERS[activityId]!);
        expect(outcome.passed, `variant ${variant}`).toBe(false);
        if (activityId === "python-foundations.pf12") {
          // The debug mission fails loudly, with an error the learner can read.
          expect(outcome.status, `variant ${variant}`).toBe(RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION);
          expect(outcome.exceptionType).toBe("TypeError");
        } else {
          expect(outcome.status, `variant ${variant}`).toBe(RUNTIME_EXECUTION_STATUS.SUCCESS);
          expect(outcome.failedVariables.length + outcome.failedFunctions.length, `variant ${variant}`).toBeGreaterThan(0);
        }
      }
    }, 240_000);
  }
});

describe("M9 missions - plausible incorrect submissions fail on the right variable or function (real Pyodide)", () => {
  for (const activityId of M9_ACTIVITY_IDS) {
    for (const wrong of M9_SOLUTIONS[activityId]!.wrong) {
      it(`${activityId}: ${wrong.name}`, async (ctx) => {
        needsNumpy(ctx, activityId);
        for (const variant of VARIANTS) {
          const outcome = await submitOnPyodide(pyodide, activityId, variant, wrong.code);
          expect(outcome.passed, `variant ${variant}`).toBe(false);
          if (wrong.raises !== undefined) {
            expect(outcome.exceptionType, `variant ${variant}`).toBe(wrong.raises);
            continue;
          }
          expect(outcome.status, `variant ${variant}`).toBe(RUNTIME_EXECUTION_STATUS.SUCCESS);
          for (const variable of wrong.fails) expect(outcome.failedVariables, `variant ${variant}`).toContain(variable);
          for (const name of wrong.failsFunctions ?? []) expect(outcome.failedFunctions, `variant ${variant}`).toContain(name);
        }
      }, 240_000);
    }
  }
});

// ---------------------------------------------------------------------------------------
// A hard-coded function passes the displayed example and fails the hidden cases.
// ---------------------------------------------------------------------------------------

const py = (value: unknown): string => JSON.stringify(value);

function casesOf(activityId: string, variant: number, key: string): FunctionCase[] {
  return gradingData(activityId, variant)[key] as FunctionCase[];
}

interface ReturningCase {
  readonly expect: { readonly kind: "RETURNS"; readonly value: any };
}

function exampleOf(cases: readonly FunctionCase[]): ReturningCase {
  const example = cases.find((entry) => entry.visibility === "example");
  if (example === undefined) throw new Error("no example case");
  if (example.expect.kind !== "RETURNS") throw new Error("example must return a value");
  return example as unknown as ReturningCase;
}

async function caseOutcomes(activityId: string, variant: number, code: string, fn: string) {
  const outcome = await submitOnPyodide(pyodide, activityId as LearningActivityId, variant, code);
  const check = outcome.grading?.checks.find((entry) => entry.function === fn);
  return { outcome, byId: new Map((check?.cases ?? []).map((entry) => [entry.id, entry.outcome])) };
}

describe("M9 missions - hard-coded answers pass the example only (real Pyodide)", () => {
  it("PF-11: constants copied from the displayed example pass it and fail the other cases", async () => {
    const id = "python-foundations.pf11";
    for (const variant of VARIANTS.slice(0, 4)) {
      const average = exampleOf(casesOf(id, variant, "movingAverageCases")).expect;
      const clipped = exampleOf(casesOf(id, variant, "clipCases")).expect;
      const code = `def moving_average(values, window):
    return ${py(average.value)}


def clip_values(values, low, high):
    return ${py(clipped.value)}
`;
      const ma = await caseOutcomes(id, variant, code, "moving_average");
      expect(ma.outcome.passed).toBe(false);
      expect(ma.byId.get("ma-example"), `variant ${variant}`).toBe("PASSED");
      const rest = [...ma.byId.entries()].filter(([caseId]) => caseId !== "ma-example");
      expect(rest.length).toBeGreaterThanOrEqual(5);
      expect(rest.some(([, result]) => result !== "PASSED")).toBe(true);
      // The "raises ValueError" cases are the ones a constant can never satisfy.
      expect(ma.byId.get("ma-window-zero")).toBe("NO_EXCEPTION_RAISED");
      const cl = await caseOutcomes(id, variant, code, "clip_values");
      expect(cl.byId.get("clip-example")).toBe("PASSED");
      expect([...cl.byId.entries()].filter(([caseId]) => caseId !== "clip-example").some(([, result]) => result !== "PASSED")).toBe(true);
    }
  }, 240_000);

  it("PF-12: returning the demo result for every input passes the example and fails the rest", async () => {
    const id = "python-foundations.pf12";
    for (const variant of VARIANTS.slice(0, 4)) {
      const demo = gradingData(id, variant).demoResult;
      const code = `def parse_measurements(raw_values, low, high):
    return ${py(demo)}


result = parse_measurements(form_inputs, low, high)
`;
      const { outcome, byId } = await caseOutcomes(id, variant, code, "parse_measurements");
      expect(outcome.failedVariables).not.toContain("result");
      expect(byId.get("pm-example"), `variant ${variant}`).toBe("PASSED");
      expect(outcome.passed).toBe(false);
      expect(byId.get("pm-empty")).not.toBe("PASSED");
      expect(byId.get("pm-not-a-list")).toBe("NO_EXCEPTION_RAISED");
    }
  }, 240_000);

  it("PF-13: returning the example summary for every text passes the example and fails the rest", async () => {
    const id = "python-foundations.pf13";
    for (const variant of VARIANTS.slice(0, 4)) {
      const summary = gradingData(id, variant).summary;
      const code = `def summarize_records(text):
    return ${py(summary)}


summary = summarize_records(raw_json)
`;
      const { outcome, byId } = await caseOutcomes(id, variant, code, "summarize_records");
      expect(byId.get("rec-example"), `variant ${variant}`).toBe("PASSED");
      expect(outcome.passed).toBe(false);
      expect(byId.get("rec-empty-list")).not.toBe("PASSED");
      expect(byId.get("rec-bad-json")).toBe("NO_EXCEPTION_RAISED");
    }
  }, 240_000);

  it("PF-14: a describe_array that always answers for the example shape fails other arrays", async (ctx) => {
    requireNumpy(ctx, numpy);
    const id = "python-foundations.pf14";
    for (const variant of VARIANTS.slice(0, 4)) {
      const example = exampleOf(casesOf(id, variant, "cases"));
      const expected = example.expect.value as { ndim: number; shape: { $tuple: number[] }; size: number; dtype: string };
      const code = `import numpy as np

arr = np.array(table, dtype=np.float64)


def describe_array(a):
    return {"ndim": ${expected.ndim}, "shape": ${py(expected.shape.$tuple).replace("[", "(").replace("]", ",)")}, "size": ${expected.size}, "dtype": "${expected.dtype}"}
`;
      const { byId } = await caseOutcomes(id, variant, code, "describe_array");
      expect(byId.get("desc-example"), `variant ${variant}`).toBe("PASSED");
      expect(byId.get("desc-1d-int")).not.toBe("PASSED");
      expect(byId.get("desc-3d-float32")).not.toBe("PASSED");
    }
  }, 240_000);

  it("PF-15: three functions that return the example arrays fail every other array", async (ctx) => {
    requireNumpy(ctx, numpy);
    const id = "python-foundations.pf15";
    for (const variant of VARIANTS.slice(0, 4)) {
      const maskExample = exampleOf(casesOf(id, variant, "maskCases")).expect;
      const scaleExample = exampleOf(casesOf(id, variant, "scaleCases")).expect;
      const meanExample = exampleOf(casesOf(id, variant, "meanCases")).expect;
      const code = `import numpy as np

data = np.array(grid, dtype=np.float64)


def valid_mask(data, max_value):
    return np.array(${py(maskExample.value.$ndarray).replace(/true/g, "True").replace(/false/g, "False")}, dtype=bool)


def scale_valid(data, max_value):
    return np.array(${py(scaleExample.value.$ndarray)}, dtype=np.float64)


def sensor_means(data, max_value):
    return np.array(${py(meanExample.value.$ndarray)}, dtype=np.float64)
`;
      for (const [fn, exampleId, otherId] of [
        ["valid_mask", "mask-example", "mask-all-invalid"],
        ["scale_valid", "scale-example", "scale-all-valid"],
        ["sensor_means", "mean-example", "mean-all-valid"],
      ] as const) {
        const { byId } = await caseOutcomes(id, variant, code, fn);
        expect(byId.get(exampleId), `variant ${variant} ${fn}`).toBe("PASSED");
        expect(byId.get(otherId), `variant ${variant} ${fn}`).not.toBe("PASSED");
      }
    }
  }, 240_000);
});

describe("M9 missions - generated cases are deterministic and vary per variant", () => {
  const FUNCTION_MISSIONS: ReadonlyArray<readonly [string, string]> = [
    ["python-foundations.pf11", "movingAverageCases"],
    ["python-foundations.pf12", "cases"],
    ["python-foundations.pf13", "cases"],
    ["python-foundations.pf14", "cases"],
    ["python-foundations.pf15", "maskCases"],
  ];
  for (const [activityId, key] of FUNCTION_MISSIONS) {
    it(`${activityId}: the same variant yields the same cases, other variants yield other cases`, () => {
      const first = JSON.stringify(gradingData(activityId, 0)[key]);
      expect(JSON.stringify(gradingData(activityId, 0)[key])).toBe(first);
      const others = new Set(VARIANTS.map((variant) => JSON.stringify(gradingData(activityId, variant)[key])));
      expect(others.size).toBeGreaterThan(3);
    });
  }

  it("every function mission has exactly one displayed example and several hidden cases, with unique ids", () => {
    for (const [activityId, key] of [...FUNCTION_MISSIONS, ["python-foundations.pf11", "clipCases"], ["python-foundations.pf15", "scaleCases"], ["python-foundations.pf15", "meanCases"]] as const) {
      for (const variant of VARIANTS) {
        const cases = casesOf(activityId, variant, key);
        expect(cases.filter((entry) => entry.visibility === "example"), `${activityId}.${key}#${variant}`).toHaveLength(1);
        expect(cases.filter((entry) => entry.visibility === "hidden").length).toBeGreaterThanOrEqual(4);
        expect(new Set(cases.map((entry) => entry.id)).size).toBe(cases.length);
      }
    }
  });
});

describe("M9 missions - Run is exploration only (real Pyodide)", () => {
  it("Run executes the learner's functions on the displayed example and returns no grading", async () => {
    const id = "python-foundations.pf11" as LearningActivityId;
    const execution = await runOnPyodide(pyodide, id, 0, M9_SOLUTIONS[id]!.reference);
    expect(execution.status).toBe(RUNTIME_EXECUTION_STATUS.SUCCESS);
    if (execution.status !== RUNTIME_EXECUTION_STATUS.SUCCESS) return;
    const example = exampleOf(casesOf(id, 0, "movingAverageCases"));
    expect(execution.stdout).toContain(String(example.expect.value[0]));
  }, 120_000);

  it("a Run of the buggy debug starter surfaces a readable TypeError", async () => {
    const id = "python-foundations.pf12" as LearningActivityId;
    const execution = await runOnPyodide(pyodide, id, 0, STARTERS[id]!);
    expect(execution.status).toBe(RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION);
    if (execution.status !== RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION) return;
    expect(execution.exception.type).toBe("TypeError");
    expect(execution.exception.message).toMatch(/NoneType/);
  }, 120_000);
});

describe("M9 missions - runtime declarations", () => {
  it("PF-08..PF-13 are standard-library only; PF-14 and PF-15 declare exactly the numpy package", () => {
    for (const id of M9_ACTIVITY_IDS) {
      const runtime = templateOf(id).runtime;
      if (NUMPY_MISSIONS.has(id)) expect(runtime?.config?.packages, id).toEqual(["numpy"]);
      else expect(runtime?.config ?? {}, id).not.toHaveProperty("packages");
    }
  });
});
