import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";

import { validateExercisePack, type ExercisePack } from "../../src/core/exercise-packs";
import { verifyPackExercises } from "./pyodide-pack-verifier";
import { SAMPLE_PACK_TEXT, makeMinimalPack } from "./pack-fixtures";

/**
 * Reference verification of Exercise Pack content through REAL Pyodide, the real
 * Mission Engine and the real declarative grader (see pyodide-pack-verifier.ts for
 * exactly what is and is not real).
 *
 *  - The verifier self-check needs only the Python standard library, so it runs
 *    wherever the Pyodide core loads (no network).
 *  - The NumPy sample-pack check needs the NumPy wheel from the Pyodide package
 *    index. When it cannot be fetched the tests call `ctx.skip()`: they are
 *    reported as SKIPPED (NOT RUN), never as PASS, and a warning is logged.
 *
 * STRICT MODE (acceptance): set PACK_VERIFY_STRICT=1 and an unavailable NumPy makes
 * the sample-pack test FAIL instead of skip, so a validation run cannot be green
 * without the NumPy reference solutions having really executed.
 *
 *   PowerShell:  $env:PACK_VERIFY_STRICT = "1"; npx vitest run tests/exercise-packs/pack-reference-verification.test.ts
 *   bash:        PACK_VERIFY_STRICT=1 npx vitest run tests/exercise-packs/pack-reference-verification.test.ts
 *
 * The default (variable unset) stays offline-tolerant for everyday development.
 */

/** True when PACK_VERIFY_STRICT is "1" or "true". Reads the environment without needing Node typings. */
function strictVerification(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const value = env?.PACK_VERIFY_STRICT?.trim().toLowerCase();
  return value === "1" || value === "true";
}

function valid(raw: unknown): ExercisePack {
  const result = validateExercisePack(raw);
  if (!result.ok) throw new Error(`fixture invalid: ${JSON.stringify(result.issues)}`);
  return result.pack;
}

describe("pack reference verification (real Pyodide)", () => {
  let pyodide: PyodideInterface;
  let numpyAvailable = false;
  let numpyError = "";

  beforeAll(async () => {
    pyodide = await loadPyodide();
    try {
      await pyodide.loadPackage(["numpy"]);
      pyodide.runPython("import numpy");
      numpyAvailable = true;
    } catch (error) {
      const lines = (error instanceof Error ? error.message : String(error)).split("\n").map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("See https://"));
      numpyError = lines.find((line) => /ModuleNotFoundError|fetch failed|Error/i.test(line)) ?? lines[lines.length - 1] ?? "unknown error";
    }
  }, 180_000);

  afterAll(() => {
    if (!numpyAvailable) {
      console.warn(`[NOT RUN] NumPy sample-pack reference verification: numpy unavailable (${numpyError})`);
    } else {
      console.info(`[RAN] NumPy sample-pack reference verification executed${strictVerification() ? " (strict mode)" : ""}.`);
    }
  });

  describe("verifier self-check (standard library only)", () => {
    function stdlibPack() {
      const pack = makeMinimalPack();
      pack.exercises[0].referenceSolution = "answer = sum(range(3))\n";
      return pack;
    }

    it("a correct reference passes and its starter does not", async () => {
      const [result] = await verifyPackExercises(pyodide, valid(stdlibPack()));
      expect(result!.reference).toMatchObject({ passed: true, executionStatus: "SUCCESS", failedChecks: [] });
      expect(result!.starter.passed).toBe(false);
      expect(result!.starter.failedChecks).toContain("EXACT_VALUES(answer)");
    });

    it("a wrong reference solution is detected", async () => {
      const pack = stdlibPack();
      pack.exercises[0].referenceSolution = "answer = 4\n";
      const [result] = await verifyPackExercises(pyodide, valid(pack));
      expect(result!.reference!.passed).toBe(false);
      expect(result!.reference!.failedChecks).toEqual(["EXACT_VALUES(answer)"]);
    });

    it("an exception in the reference solution is reported with its type", async () => {
      const pack = stdlibPack();
      pack.exercises[0].referenceSolution = "answer = 1 / 0\n";
      const [result] = await verifyPackExercises(pyodide, valid(pack));
      expect(result!.reference!.passed).toBe(false);
      expect(result!.reference!.executionStatus).toBe("PYTHON_EXCEPTION");
      expect(result!.reference!.exception).toContain("ZeroDivisionError");
    });

    it("setup variables reach the exercise as Python globals", async () => {
      const pack = stdlibPack();
      pack.exercises[0].setupVariables = { values: [1, 2, 3] };
      pack.exercises[0].starterCode = "answer = None\n";
      pack.exercises[0].referenceSolution = "answer = sum(values)\n";
      pack.exercises[0].grading.checks = [
        { type: "NO_EXCEPTION" },
        { type: "EXACT_VALUES", variable: "answer", expected: 6 },
      ];
      const [result] = await verifyPackExercises(pyodide, valid(pack));
      expect(result!.reference!.passed).toBe(true);
      expect(result!.starter.passed).toBe(false);
    });

    it("an exercise without a reference solution reports none", async () => {
      const pack = stdlibPack();
      delete pack.exercises[0].referenceSolution;
      const [result] = await verifyPackExercises(pyodide, valid(pack));
      expect(result!.reference).toBeNull();
    });

    it("does not execute anything else: a Run-time side effect of one exercise never reaches the next", async () => {
      const pack = stdlibPack();
      pack.exercises[0].referenceSolution = "leaked = 1\nanswer = 3\n";
      pack.exercises.push({
        ...JSON.parse(JSON.stringify(pack.exercises[0])),
        id: "ex-two",
        starterCode: "answer = 3 if 'leaked' in globals() else None\n",
        referenceSolution: "answer = 3\n",
      });
      const [, second] = await verifyPackExercises(pyodide, valid(pack));
      // Each Submit starts from a clean namespace, so the starter of exercise two cannot see 'leaked'.
      expect(second!.starter.passed).toBe(false);
    });
  });

  describe("sample pack ml-basics.linreg-numpy (NumPy)", () => {
    it("every reference solution passes and no starter already passes", async (ctx) => {
      if (!numpyAvailable) {
        if (strictVerification()) {
          throw new Error(
            `STRICT (PACK_VERIFY_STRICT): NumPy sample-pack reference verification could NOT run, which is not acceptance: ${numpyError}`,
          );
        }
        ctx.skip(`NOT RUN: numpy unavailable (${numpyError})`);
      }
      const results = await verifyPackExercises(pyodide, valid(JSON.parse(SAMPLE_PACK_TEXT)));
      expect(results.map((result) => result.exerciseId)).toEqual(["mse-basic", "gd-step", "fix-normalization"]);
      for (const result of results) {
        expect(result.reference, `${result.exerciseId}: reference outcome`).toMatchObject({
          passed: true,
          executionStatus: "SUCCESS",
          failedChecks: [],
        });
        expect(result.starter.passed, `${result.exerciseId}: starter must not already pass`).toBe(false);
      }
    }, 120_000);
  });
});
