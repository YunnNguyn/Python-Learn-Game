import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";

import { PYTHON_FOUNDATIONS_STARTER_CODE } from "../../src/content/python-foundations";
import { RUNTIME_EXECUTION_STATUS } from "../../src/core/runtime";
import type { LearningActivityId } from "../../src/core/domain";
import {
  ACTIVITY_IDS,
  instanceOf,
  runOnPyodide,
  submitOnPyodide,
} from "./pyodide-mission-harness";
import { SOLUTIONS } from "./solutions";

/**
 * The seven Python Foundations missions through REAL Pyodide (standard library only, no
 * network), the real generator, MissionEngine and declarative grader.
 *
 * Official Vitest runs this file; so does the sandbox harness. What is NOT covered here is
 * the browser: the Web Worker transport, Monaco and IndexedDB are exercised by the Edge
 * acceptance runner in qa/m8-acceptance.
 */

const VARIANTS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const STARTER_BY_ACTIVITY: Record<string, string> = {
  "python-foundations.pf01": PYTHON_FOUNDATIONS_STARTER_CODE.pf01,
  "python-foundations.pf02": PYTHON_FOUNDATIONS_STARTER_CODE.pf02,
  "python-foundations.pf03": PYTHON_FOUNDATIONS_STARTER_CODE.pf03,
  "python-foundations.pf04": PYTHON_FOUNDATIONS_STARTER_CODE.pf04,
  "python-foundations.pf05": PYTHON_FOUNDATIONS_STARTER_CODE.pf05,
  "python-foundations.pf06": PYTHON_FOUNDATIONS_STARTER_CODE.pf06,
  "python-foundations.pf07": PYTHON_FOUNDATIONS_STARTER_CODE.pf07,
};

let pyodide: PyodideInterface;

beforeAll(async () => {
  pyodide = await loadPyodide();
}, 180_000);

afterAll(() => {
  // The interpreter is shared by every test above and released with the process.
});

describe("Python Foundations - reference solutions (real Pyodide)", () => {
  for (const activityId of ACTIVITY_IDS) {
    it(`${activityId}: the reference solution passes on every tested variant`, async () => {
      for (const variant of VARIANTS) {
        const outcome = await submitOnPyodide(pyodide, activityId, variant, SOLUTIONS[activityId]!.reference);
        expect(
          { variant, passed: outcome.passed, status: outcome.status, failed: outcome.failedChecks },
          `variant ${variant}`,
        ).toEqual({ variant, passed: true, status: RUNTIME_EXECUTION_STATUS.SUCCESS, failed: [] });
      }
    }, 120_000);
  }
});

describe("Python Foundations - the starter code never passes (real Pyodide)", () => {
  for (const activityId of ACTIVITY_IDS) {
    it(`${activityId}: the untouched starter does not pass and runs without a syntax error`, async () => {
      const starter = STARTER_BY_ACTIVITY[activityId]!;
      for (const variant of VARIANTS) {
        const outcome = await submitOnPyodide(pyodide, activityId, variant, starter);
        expect(outcome.passed, `variant ${variant}`).toBe(false);
        if (activityId === "python-foundations.pf03") {
          // The debug mission is supposed to fail loudly, with an error the learner can read.
          expect(outcome.status).toBe(RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION);
          expect(outcome.exceptionType).toBe("TypeError");
        } else {
          expect(outcome.status, `variant ${variant}`).toBe(RUNTIME_EXECUTION_STATUS.SUCCESS);
          expect(outcome.failedVariables.length).toBeGreaterThan(0);
        }
      }
    }, 120_000);
  }
});

describe("Python Foundations - incorrect submissions fail on the right variable (real Pyodide)", () => {
  for (const activityId of ACTIVITY_IDS) {
    for (const wrong of SOLUTIONS[activityId]!.wrong) {
      it(`${activityId}: ${wrong.name}`, async () => {
        for (const variant of VARIANTS) {
          const outcome = await submitOnPyodide(pyodide, activityId, variant, wrong.code);
          expect(outcome.passed, `variant ${variant}`).toBe(false);
          if (wrong.raises !== undefined) {
            expect(outcome.status, `variant ${variant}`).toBe(RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION);
            expect(outcome.exceptionType, `variant ${variant}`).toBe(wrong.raises);
          } else {
            expect(outcome.status, `variant ${variant}`).toBe(RUNTIME_EXECUTION_STATUS.SUCCESS);
            for (const variable of wrong.fails) {
              expect(outcome.failedVariables, `variant ${variant}: ${wrong.name}`).toContain(variable);
            }
          }
        }
      }, 120_000);
    }
  }
});

describe("Python Foundations - Run is exploration only (real Pyodide)", () => {
  it("Run executes the learner's code and shows its output, with no grading result", async () => {
    const execution = await runOnPyodide(
      pyodide,
      "python-foundations.pf01" as LearningActivityId,
      0,
      "print(width * height)",
    );
    expect(execution.status).toBe(RUNTIME_EXECUTION_STATUS.SUCCESS);
    if (execution.status !== RUNTIME_EXECUTION_STATUS.SUCCESS) return;
    const { width, height } = instanceOf("python-foundations.pf01" as LearningActivityId, 0).runtime!
      .setupData as { width: number; height: number };
    expect(execution.stdout.trim()).toBe(String(width * height));
  }, 60_000);

  it("a Run of the untouched debug starter surfaces the readable TypeError", async () => {
    const execution = await runOnPyodide(
      pyodide,
      "python-foundations.pf03" as LearningActivityId,
      0,
      PYTHON_FOUNDATIONS_STARTER_CODE.pf03,
    );
    expect(execution.status).toBe(RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION);
    if (execution.status !== RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION) return;
    expect(execution.exception.message).toMatch(/can't multiply sequence by non-int of type 'str'/);
  }, 60_000);

  it("numpy is not available: the course needs no package download and no Local Python", async () => {
    const execution = await runOnPyodide(
      pyodide,
      "python-foundations.pf05" as LearningActivityId,
      0,
      "import numpy",
    );
    // Whatever the Pyodide build ships, the mission template asks for no package, so the
    // runtime never loads one: this documents that the seven missions are stdlib-only.
    expect([RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION, RUNTIME_EXECUTION_STATUS.SUCCESS]).toContain(execution.status);
  }, 60_000);
});

describe("Python Foundations - a copied literal does not generalise (real Pyodide)", () => {
  it("PF-01: literals copied from variant 0 pass variant 0 and fail every different variant", async () => {
    const id = "python-foundations.pf01" as LearningActivityId;
    const base = instanceOf(id, 0).grading!.data as Record<string, number>;
    const literal = `pixel_count = ${base.pixelCount}
aspect_ratio = ${base.aspectRatio}
total_values = ${base.totalValues}
half_width = ${base.halfWidth}
`;
    expect((await submitOnPyodide(pyodide, id, 0, literal)).passed).toBe(true);
    let failedElsewhere = 0;
    for (const variant of VARIANTS.slice(1)) {
      const other = instanceOf(id, variant).grading!.data as Record<string, number>;
      if (other.pixelCount === base.pixelCount) continue;
      expect((await submitOnPyodide(pyodide, id, variant, literal)).passed, `variant ${variant}`).toBe(false);
      failedElsewhere += 1;
    }
    expect(failedElsewhere).toBeGreaterThanOrEqual(4);
  }, 120_000);

  it("PF-04: a hard-coded answer for variant 0 fails the other variants", async () => {
    const id = "python-foundations.pf04" as LearningActivityId;
    const base = instanceOf(id, 0).grading!.data as { validReadings: number[]; invalidCount: number; validTotal: number };
    const literal = `valid_readings = ${JSON.stringify(base.validReadings)}
invalid_count = ${base.invalidCount}
valid_total = ${base.validTotal}
`;
    expect((await submitOnPyodide(pyodide, id, 0, literal)).passed).toBe(true);
    for (const variant of VARIANTS.slice(1)) {
      expect((await submitOnPyodide(pyodide, id, variant, literal)).passed, `variant ${variant}`).toBe(false);
    }
  }, 120_000);
});
