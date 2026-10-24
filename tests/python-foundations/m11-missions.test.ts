import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";

import {
  ANNOTATION_FIXTURES,
  ANNOTATION_VARIANT_COUNT,
  PYTHON_FOUNDATIONS_M11_STARTER_CODE,
} from "../../src/content/python-foundations";
import type { LearningActivityId } from "../../src/core/domain";
import type { FunctionCase } from "../../src/core/grading";
import { RUNTIME_EXECUTION_STATUS } from "../../src/core/runtime";
import { requireNumpy, tryLoadNumpy, type NumpyState } from "../runtime/numpy-support";
import { instanceOf, runOnPyodide, submitOnPyodide, templateOf } from "./pyodide-mission-harness";
import { M11_SOLUTIONS } from "./m11-solutions";

/**
 * The M11 capstone PF-27 through REAL Pyodide with REAL NumPy, pandas and Matplotlib: the real
 * generator, the real MissionEngine, the real function probes, the real typed comparison and
 * the real declarative grader. No fake Python, no mocked packages.
 *
 * The packages are Pyodide wheels. When they cannot be loaded the tests are reported
 * SKIPPED, never passed; with PACK_VERIFY_STRICT=1 they FAIL, so an acceptance run cannot be
 * green without the capstone having executed.
 *
 * Not covered here: the browser (Web Worker transport, Monaco, IndexedDB, the plot preview
 * image) - qa/m11-acceptance exercises those in a real Edge.
 */

const PF27 = "python-foundations.pf27" as LearningActivityId;
const SOLUTIONS = M11_SOLUTIONS[PF27]!;

/** The first variant index that selects each of the four CSV fixtures, plus two more. */
function pickVariants(): number[] {
  const byFile = new Map<string, number>();
  for (let variant = 0; variant < 80 && byFile.size < ANNOTATION_VARIANT_COUNT; variant += 1) {
    const file = (instanceOf(PF27, variant).runtime?.setupData as Record<string, unknown>).annotation_file as string;
    if (!byFile.has(file)) byFile.set(file, variant);
  }
  return [...new Set([...byFile.values(), 0, 1])].sort((a, b) => a - b);
}
const VARIANTS = pickVariants();

let pyodide: PyodideInterface;
let packages: NumpyState = { available: false, error: "not loaded" };

beforeAll(async () => {
  pyodide = await loadPyodide();
  packages = await tryLoadNumpy(pyodide);
  if (packages.available) {
    try {
      await pyodide.loadPackage(["pandas", "matplotlib"]);
      pyodide.runPython("import pandas, matplotlib");
    } catch (error) {
      packages = { available: false, error: error instanceof Error ? error.message.split("\n")[0]! : String(error) };
    }
  }
}, 480_000);

const needPackages = (ctx: { skip: (reason?: string) => void }): void => requireNumpy(ctx, packages);

const gradingData = (variant: number): Record<string, unknown> =>
  instanceOf(PF27, variant).grading!.data as Record<string, unknown>;

describe("M11 capstone PF-27 - the variants", () => {
  it("covers all four fixtures, deterministically", () => {
    const files = new Set(VARIANTS.map((variant) => (instanceOf(PF27, variant).runtime?.setupData as Record<string, unknown>).annotation_file));
    expect(files.size).toBe(ANNOTATION_VARIANT_COUNT);
    expect(JSON.stringify(instanceOf(PF27, 0).runtime?.setupData)).toBe(JSON.stringify(instanceOf(PF27, 0).runtime?.setupData));
  });

  it("the four fixtures differ in classes, size and bad rows, and every kind of mistake occurs in each", () => {
    const labelSets = new Set(ANNOTATION_FIXTURES.map((fixture) => JSON.stringify(fixture.allowedLabels)));
    expect(labelSets.size).toBe(ANNOTATION_VARIANT_COUNT);
    expect(new Set(ANNOTATION_FIXTURES.map((fixture) => fixture.records.length)).size).toBeGreaterThanOrEqual(3);
    for (const fixture of ANNOTATION_FIXTURES) {
      const rows = fixture.records;
      expect(rows.some((row) => row.label === null), fixture.file).toBe(true);
      expect(rows.some((row) => row.xmin === null), fixture.file).toBe(true);
      expect(rows.some((row) => row.ymax === "n/a"), fixture.file).toBe(true);
      expect(rows.some((row) => row.width === "0"), fixture.file).toBe(true);
      expect(rows.some((row) => Number(row.height) < 0), fixture.file).toBe(true);
      expect(rows.some((row) => row.imageId === null), fixture.file).toBe(true);
      expect(rows.some((row) => row.label === "tree"), fixture.file).toBe(true);
      expect(rows.some((row) => row.split === "dev"), fixture.file).toBe(true);
    }
  });

  it("the template stages exactly the four files and declares NumPy, pandas and Matplotlib", () => {
    const config = templateOf(PF27).runtime?.config as {
      packages?: string[];
      workspace?: { datasets: { filename: string }[] };
    };
    expect(config.packages).toEqual(["numpy", "pandas", "matplotlib"]);
    expect(config.workspace!.datasets.map((dataset) => dataset.filename).sort()).toEqual(
      ANNOTATION_FIXTURES.map((fixture) => fixture.file).sort(),
    );
  });

  it("has exactly one displayed example and several hidden cases per function, with unique ids", () => {
    for (const variant of VARIANTS) {
      for (const key of ["cleanCases", "normalizeCases", "summaryCases", "plotCases"]) {
        const cases = gradingData(variant)[key] as FunctionCase[];
        expect(cases.filter((entry) => entry.visibility === "example"), `${key}#${variant}`).toHaveLength(1);
        expect(cases.filter((entry) => entry.visibility === "hidden").length, `${key}#${variant}`).toBeGreaterThanOrEqual(2);
        expect(new Set(cases.map((entry) => entry.id)).size, `${key}#${variant}`).toBe(cases.length);
      }
    }
  });

  it("lists at least twenty plausible mistakes", () => {
    expect(SOLUTIONS.wrong.length).toBeGreaterThanOrEqual(20);
  });
});

describe("M11 capstone PF-27 - reference solution (real Pyodide)", () => {
  it("passes on every fixture", async (ctx) => {
    needPackages(ctx);
    for (const variant of VARIANTS) {
      const outcome = await submitOnPyodide(pyodide, PF27, variant, SOLUTIONS.reference);
      expect(
        { variant, passed: outcome.passed, status: outcome.status, failed: outcome.failedChecks },
        `variant ${variant}`,
      ).toEqual({ variant, passed: true, status: RUNTIME_EXECUTION_STATUS.SUCCESS, failed: [] });
    }
  }, 480_000);
});

describe("M11 capstone PF-27 - the untouched starter never passes (real Pyodide)", () => {
  it("runs without error and fails on every fixture", async (ctx) => {
    needPackages(ctx);
    for (const variant of VARIANTS) {
      const outcome = await submitOnPyodide(pyodide, PF27, variant, PYTHON_FOUNDATIONS_M11_STARTER_CODE.pf27);
      expect(outcome.passed, `variant ${variant}`).toBe(false);
      expect(outcome.status, `variant ${variant}`).toBe(RUNTIME_EXECUTION_STATUS.SUCCESS);
      expect(outcome.failedChecks.length, `variant ${variant}`).toBeGreaterThan(0);
    }
  }, 480_000);
});

describe("M11 capstone PF-27 - plausible incorrect submissions fail on the right variable or function (real Pyodide)", () => {
  for (const wrong of SOLUTIONS.wrong) {
    it(wrong.name, async (ctx) => {
      needPackages(ctx);
      for (const variant of VARIANTS) {
        const outcome = await submitOnPyodide(pyodide, PF27, variant, wrong.code);
        expect(outcome.passed, `variant ${variant}`).toBe(false);
        if (wrong.raises !== undefined) {
          expect(outcome.exceptionType, `variant ${variant}`).toBe(wrong.raises);
          continue;
        }
        expect(outcome.status, `variant ${variant}`).toBe(RUNTIME_EXECUTION_STATUS.SUCCESS);
        for (const variable of wrong.fails) expect(outcome.failedVariables, `variant ${variant}`).toContain(variable);
        for (const name of wrong.failsFunctions ?? []) expect(outcome.failedFunctions, `variant ${variant}`).toContain(name);
      }
    }, 480_000);
  }
});

describe("M11 capstone PF-27 - specific outcomes are named (real Pyodide)", () => {
  const checkOf = async (code: string, matcher: { variable?: string; fn?: string }, variant = VARIANTS[0]!) => {
    const outcome = await submitOnPyodide(pyodide, PF27, variant, code);
    return outcome.grading?.checks.find((entry) =>
      matcher.variable !== undefined ? entry.variable === matcher.variable && !entry.passed : entry.function === matcher.fn && !entry.passed,
    );
  };
  const wrongNamed = (fragment: string) => SOLUTIONS.wrong.find((entry) => entry.name.includes(fragment))!;

  it("a transposed X (right numbers, wrong shape) is a SHAPE mistake", async (ctx) => {
    needPackages(ctx);
    const check = await checkOf(wrongNamed("transposed").code, { variable: "X" });
    expect(JSON.stringify(check)).toContain("WRONG_SHAPE");
  }, 240_000);

  it("a float32 X is a DTYPE mistake", async (ctx) => {
    needPackages(ctx);
    const check = await checkOf(wrongNamed("float32").code, { variable: "X" });
    expect(JSON.stringify(check)).toContain("WRONG_DTYPE");
  }, 240_000);

  it("a gappy index is an INDEX mistake", async (ctx) => {
    needPackages(ctx);
    const check = await checkOf(wrongNamed("gappy index").code, { variable: "clean" });
    expect(JSON.stringify(check)).toMatch(/WRONG_INDEX/);
  }, 240_000);

  it("a line chart instead of a bar chart is a FIGURE mistake", async (ctx) => {
    needPackages(ctx);
    const check = await checkOf(wrongNamed("line plot").code, { variable: "ax" });
    expect(JSON.stringify(check)).toContain("WRONG_FIGURE");
  }, 240_000);

  it("an argument that is changed in place is reported as ARGS_MUTATED, never with the expected values", async (ctx) => {
    needPackages(ctx);
    const check = await checkOf(wrongNamed("in place").code, { fn: "clean_annotations" });
    expect(JSON.stringify(check)).toContain("ARGS_MUTATED");
  }, 240_000);

  it("the hidden cases of a failing function do not reveal their expected values", async (ctx) => {
    needPackages(ctx);
    const outcome = await submitOnPyodide(pyodide, PF27, VARIANTS[0]!, wrongNamed("fixed class list").code);
    const check = outcome.grading?.checks.find((entry) => entry.function === "clean_annotations" && !entry.passed);
    const hiddenIds = (check?.cases ?? []).filter((entry) => entry.id !== "clean-example");
    expect(hiddenIds.length).toBeGreaterThan(0);
    for (const entry of hiddenIds) {
      expect(JSON.stringify(entry), entry.id).not.toMatch(/expected/i);
    }
  }, 240_000);
});

describe("M11 capstone PF-27 - a hard-coded function passes the example and fails the hidden cases (real Pyodide)", () => {
  it("clean_annotations returning the visible file's table fails the hidden tables", async (ctx) => {
    needPackages(ctx);
    const wrong = SOLUTIONS.wrong[0]!;
    for (const variant of VARIANTS) {
      const outcome = await submitOnPyodide(pyodide, PF27, variant, wrong.code);
      const check = outcome.grading?.checks.find((entry) => entry.function === "clean_annotations");
      const byId = new Map((check?.cases ?? []).map((entry) => [entry.id, entry.outcome]));
      expect(byId.get("clean-example"), `variant ${variant}`).toBe("PASSED");
      expect([...byId.entries()].filter(([, result]) => result !== "PASSED").length, `variant ${variant}`).toBeGreaterThan(0);
      expect(outcome.passed).toBe(false);
    }
  }, 480_000);
});

describe("M11 capstone PF-27 - Run is exploration only and previews the chart (real Pyodide)", () => {
  it("Run executes without grading and shows the learner's bar chart as a PNG preview", async (ctx) => {
    needPackages(ctx);
    const execution = await runOnPyodide(pyodide, PF27, VARIANTS[0]!, SOLUTIONS.reference);
    expect(execution.status).toBe(RUNTIME_EXECUTION_STATUS.SUCCESS);
    if (execution.status !== RUNTIME_EXECUTION_STATUS.SUCCESS) return;
    expect(execution.stdout.length).toBeGreaterThan(0);
    const previews = (execution.workspace?.artifacts ?? []).filter((file) => file.dataUrl?.startsWith("data:image/png;base64,"));
    expect(previews.length).toBeGreaterThanOrEqual(1);
    expect(previews.length).toBeLessThanOrEqual(4);
  }, 240_000);

  it("a Python mistake of the learner is a Python exception, not a runtime failure", async (ctx) => {
    needPackages(ctx);
    const execution = await runOnPyodide(pyodide, PF27, VARIANTS[0]!, `import pandas as pd\nraw = pd.read_csv("data/" + annotation_file)\nraw["nope"]\n`);
    expect(execution.status).toBe(RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION);
  }, 240_000);
});
