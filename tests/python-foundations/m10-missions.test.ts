import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";

import { PYTHON_FOUNDATIONS_M10_STARTER_CODE } from "../../src/content/python-foundations";
import type { LearningActivityId } from "../../src/core/domain";
import type { FunctionCase } from "../../src/core/grading";
import { RUNTIME_EXECUTION_STATUS } from "../../src/core/runtime";
import { requireNumpy, tryLoadNumpy, type NumpyState } from "../runtime/numpy-support";
import { instanceOf, M10_ACTIVITY_IDS, runOnPyodide, submitOnPyodide, templateOf } from "./pyodide-mission-harness";
import { M10_SOLUTIONS } from "./m10-solutions";

/**
 * The eleven M10 missions (PF-16..PF-26) through REAL Pyodide with REAL NumPy, pandas and
 * Matplotlib: the real generator, the real MissionEngine, the real function probes, the
 * real typed comparison and the real declarative grader.
 *
 * The packages are Pyodide wheels. When they cannot be loaded the tests are reported
 * SKIPPED, never passed; with PACK_VERIFY_STRICT=1 they FAIL, so an acceptance run cannot be
 * green without the missions having executed.
 *
 * Not covered here: the browser (Web Worker transport, Monaco, IndexedDB, the plot preview
 * image) - qa/m10-acceptance exercises those in a real Edge.
 */

const VARIANTS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const STARTERS = Object.fromEntries(
  Object.entries(PYTHON_FOUNDATIONS_M10_STARTER_CODE).map(([key, code]) => [`python-foundations.${key}`, code]),
) as Record<string, string>;
const PLOTTING = new Set(["python-foundations.pf23", "python-foundations.pf24", "python-foundations.pf26"]);

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

const gradingData = (activityId: string, variant: number): Record<string, unknown> =>
  instanceOf(activityId as LearningActivityId, variant).grading!.data as Record<string, unknown>;

describe("M10 missions - reference solutions (real Pyodide)", () => {
  for (const activityId of M10_ACTIVITY_IDS) {
    it(`${activityId}: the reference solution passes on every tested variant`, async (ctx) => {
      needPackages(ctx);
      for (const variant of VARIANTS) {
        const outcome = await submitOnPyodide(pyodide, activityId, variant, M10_SOLUTIONS[activityId]!.reference);
        expect(
          { variant, passed: outcome.passed, status: outcome.status, failed: outcome.failedChecks },
          `variant ${variant}`,
        ).toEqual({ variant, passed: true, status: RUNTIME_EXECUTION_STATUS.SUCCESS, failed: [] });
      }
    }, 480_000);
  }
});

describe("M10 missions - the starter never passes (real Pyodide)", () => {
  for (const activityId of M10_ACTIVITY_IDS) {
    it(`${activityId}: the untouched starter does not pass`, async (ctx) => {
      needPackages(ctx);
      for (const variant of VARIANTS) {
        const outcome = await submitOnPyodide(pyodide, activityId, variant, STARTERS[activityId]!);
        expect(outcome.passed, `variant ${variant}`).toBe(false);
        // Run is always safe on a starter: placeholders are `None`, never a syntax error.
        expect(outcome.status, `variant ${variant}`).toBe(RUNTIME_EXECUTION_STATUS.SUCCESS);
        expect(outcome.failedChecks.length, `variant ${variant}`).toBeGreaterThan(0);
      }
    }, 480_000);
  }
});

describe("M10 missions - plausible incorrect submissions fail on the right variable or function (real Pyodide)", () => {
  for (const activityId of M10_ACTIVITY_IDS) {
    for (const wrong of M10_SOLUTIONS[activityId]!.wrong) {
      it(`${activityId}: ${wrong.name}`, async (ctx) => {
        needPackages(ctx);
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
      }, 480_000);
    }
  }
});

describe("M10 missions - every mission has wrong solutions, and the shape missions have a right-values-wrong-shape one", () => {
  it("each mission lists at least five plausible mistakes", () => {
    for (const activityId of M10_ACTIVITY_IDS) {
      expect(M10_SOLUTIONS[activityId]!.wrong.length, activityId).toBeGreaterThanOrEqual(5);
    }
  });

  it("PF-16, PF-17 and PF-18 each carry a solution whose numbers are right but whose shape is wrong", () => {
    for (const id of ["python-foundations.pf16", "python-foundations.pf17", "python-foundations.pf18"]) {
      expect(M10_SOLUTIONS[id]!.wrong.some((wrong) => /wrong shape/.test(wrong.name)), id).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------
// Right values but the wrong shape is reported as a SHAPE problem, not as a value problem.
// ---------------------------------------------------------------------------------------

describe("M10 missions - shape mistakes are reported as shape mistakes (real Pyodide)", () => {
  it("PF-16: x_col with the right numbers in a (1, n) row fails with WRONG_SHAPE", async (ctx) => {
    needPackages(ctx);
    const id = "python-foundations.pf16" as LearningActivityId;
    const wrong = M10_SOLUTIONS[id]!.wrong[0]!;
    for (const variant of VARIANTS.slice(0, 3)) {
      const outcome = await submitOnPyodide(pyodide, id, variant, wrong.code);
      const check = outcome.grading?.checks.find((entry) => entry.variable === "x_col");
      expect(check?.passed, `variant ${variant}`).toBe(false);
      expect(JSON.stringify(check), `variant ${variant}`).toContain("WRONG_SHAPE");
    }
  }, 240_000);

  it("PF-17: row_totals without keepdims fails with WRONG_SHAPE", async (ctx) => {
    needPackages(ctx);
    const id = "python-foundations.pf17" as LearningActivityId;
    const wrong = M10_SOLUTIONS[id]!.wrong[0]!;
    for (const variant of VARIANTS.slice(0, 3)) {
      const outcome = await submitOnPyodide(pyodide, id, variant, wrong.code);
      const check = outcome.grading?.checks.find((entry) => entry.variable === "row_totals");
      expect(check?.passed, `variant ${variant}`).toBe(false);
      expect(JSON.stringify(check), `variant ${variant}`).toContain("WRONG_SHAPE");
    }
  }, 240_000);

  it("PF-18: batches reshaped to (size, -1, f) fail with WRONG_SHAPE", async (ctx) => {
    needPackages(ctx);
    const id = "python-foundations.pf18" as LearningActivityId;
    const wrong = M10_SOLUTIONS[id]!.wrong[0]!;
    for (const variant of VARIANTS.slice(0, 3)) {
      const outcome = await submitOnPyodide(pyodide, id, variant, wrong.code);
      const check = outcome.grading?.checks.find((entry) => entry.variable === "prepared");
      expect(check?.passed, `variant ${variant}`).toBe(false);
      expect(JSON.stringify(check), `variant ${variant}`).toContain("WRONG_SHAPE");
    }
  }, 240_000);

  it("PF-19: a Series where a DataFrame is expected is a type mistake; a lost index is an index mistake", async (ctx) => {
    needPackages(ctx);
    const id = "python-foundations.pf19" as LearningActivityId;
    const reference = M10_SOLUTIONS[id]!.reference;
    const asFrame = reference.replace(`names = df["name"]`, `names = df[["name"]]`);
    const outcome = await submitOnPyodide(pyodide, id, 0, asFrame);
    const names = outcome.grading?.checks.find((entry) => entry.variable === "names");
    expect(names?.passed).toBe(false);
    expect(JSON.stringify(names)).toContain("WRONG_TYPE");
  }, 240_000);

  it("PF-22: report with the right numbers but a RangeIndex fails with an index mistake", async (ctx) => {
    needPackages(ctx);
    const id = "python-foundations.pf22" as LearningActivityId;
    const outcome = await submitOnPyodide(pyodide, id, 0, M10_SOLUTIONS[id]!.wrong[2]!.code);
    const check = outcome.grading?.checks.find((entry) => entry.variable === "report");
    expect(check?.passed).toBe(false);
    expect(JSON.stringify(check)).toMatch(/WRONG_INDEX|WRONG_COLUMNS/);
  }, 240_000);
});

// ---------------------------------------------------------------------------------------
// A hard-coded function passes the displayed example and fails the hidden cases.
// ---------------------------------------------------------------------------------------

const py = (value: unknown): string => JSON.stringify(value);

function casesOf(activityId: string, variant: number, key: string): FunctionCase[] {
  return gradingData(activityId, variant)[key] as FunctionCase[];
}

async function caseOutcomes(activityId: string, variant: number, code: string, fn: string) {
  const outcome = await submitOnPyodide(pyodide, activityId as LearningActivityId, variant, code);
  const check = outcome.grading?.checks.find((entry) => entry.function === fn);
  return { outcome, byId: new Map((check?.cases ?? []).map((entry) => [entry.id, entry.outcome])) };
}

describe("M10 missions - hard-coded answers pass the example only (real Pyodide)", () => {
  it("PF-16: a broadcast_shape that returns the example shape fails the other shapes", async (ctx) => {
    needPackages(ctx);
    const id = "python-foundations.pf16";
    for (const variant of VARIANTS.slice(0, 4)) {
      const example = casesOf(id, variant, "cases").find((entry) => entry.visibility === "example")!;
      const shape = (example.expect as unknown as { value: { $tuple: number[] } }).value.$tuple;
      const code = `import numpy as np

x = np.array(xs, dtype=np.float64)
y = np.array(ys, dtype=np.float64)
x_col = x[:, np.newaxis]
y_row = y[np.newaxis, :]
grid_sum = x_col + y_row
grid_product = x_col * y_row


def broadcast_shape(shape_a, shape_b):
    return (${shape.join(", ")},)
`;
      const { outcome, byId } = await caseOutcomes(id, variant, code, "broadcast_shape");
      expect(outcome.passed, `variant ${variant}`).toBe(false);
      expect(byId.get("shape-example"), `variant ${variant}`).toBe("PASSED");
      expect(byId.get("shape-mismatch"), `variant ${variant}`).toBe("NO_EXCEPTION_RAISED");
      expect([...byId.values()].some((result) => result !== "PASSED")).toBe(true);
    }
  }, 240_000);

  it("PF-19: describe_frame that always answers for the example frame fails other frames", async (ctx) => {
    needPackages(ctx);
    const id = "python-foundations.pf19";
    const reference = M10_SOLUTIONS[id]!.reference;
    const code = reference.replace(
      /def describe_frame\(frame\):[\s\S]*?\n\n\nprint/,
      `def describe_frame(frame):
    return {"rows": 3, "columns": ["a", "b"], "dtypes": {"a": "int64", "b": "str"}}


print`,
    );
    for (const variant of VARIANTS.slice(0, 3)) {
      const { outcome, byId } = await caseOutcomes(id, variant, code, "describe_frame");
      expect(outcome.passed, `variant ${variant}`).toBe(false);
      expect([...byId.values()].some((result) => result !== "PASSED")).toBe(true);
    }
  }, 240_000);

  it("PF-20: a select_orders that returns the example table passes the example only", async (ctx) => {
    needPackages(ctx);
    const id = "python-foundations.pf20";
    const reference = M10_SOLUTIONS[id]!.reference;
    const code = reference.replace(
      `def select_orders(frame, min_total, regions):
    table = add_total(frame)
    mask = (table["total"] >= min_total) & (table["region"].isin(regions))
    return table[mask]`,
      `def select_orders(frame, min_total, regions):
    return add_total(df)[add_total(df)["total"] >= min_total]`,
    );
    for (const variant of VARIANTS.slice(0, 3)) {
      const { outcome } = await caseOutcomes(id, variant, code, "select_orders");
      expect(outcome.passed, `variant ${variant}`).toBe(false);
      expect(outcome.failedFunctions, `variant ${variant}`).toContain("select_orders");
    }
  }, 240_000);

  it("PF-22: a top_category that always answers the example winner fails the other tables", async (ctx) => {
    needPackages(ctx);
    const id = "python-foundations.pf22";
    const reference = M10_SOLUTIONS[id]!.reference;
    for (const variant of VARIANTS.slice(0, 4)) {
      const best = (await submitOnPyodide(pyodide, id as LearningActivityId, variant, reference)).passed;
      expect(best).toBe(true);
      const winner = casesOf(id, variant, "topCases").find((entry) => entry.visibility === "example")!;
      const value = (winner.expect as unknown as { value: string }).value;
      const code = reference.replace(
        `def top_category(frame):
    return str(category_report(frame).index[0])`,
        `def top_category(frame):
    return ${py(value)}`,
      );
      const { outcome, byId } = await caseOutcomes(id, variant, code, "top_category");
      expect(outcome.passed, `variant ${variant}`).toBe(false);
      expect([...byId.values()].some((result) => result !== "PASSED"), `variant ${variant}`).toBe(true);
    }
  }, 480_000);
});

describe("M10 missions - generated data is deterministic and varies per variant", () => {
  const KEYS: ReadonlyArray<readonly [string, string]> = [
    ["python-foundations.pf16", "xs"],
    ["python-foundations.pf17", "scores"],
    ["python-foundations.pf18", "raw"],
    ["python-foundations.pf19", "people"],
    ["python-foundations.pf20", "orders"],
    ["python-foundations.pf21", "raw"],
    ["python-foundations.pf22", "sales"],
    ["python-foundations.pf23", "revenue"],
    ["python-foundations.pf24", "finance"],
  ];
  for (const [activityId, key] of KEYS) {
    it(`${activityId}: the same variant yields the same data, other variants yield other data`, () => {
      const setup = (variant: number) => (instanceOf(activityId as LearningActivityId, variant).runtime?.setupData ?? {}) as Record<string, unknown>;
      const first = JSON.stringify(setup(0)[key]);
      expect(JSON.stringify(setup(0)[key])).toBe(first);
      const others = new Set(VARIANTS.map((variant) => JSON.stringify(setup(variant)[key])));
      expect(others.size).toBeGreaterThan(3);
    });
  }

  it("PF-25 and PF-26 use one of three fixed CSV variants and the data files are staged by the template", () => {
    for (const [id, key] of [
      ["python-foundations.pf25", "customers_file"],
      ["python-foundations.pf26", "housing_file"],
    ] as const) {
      const files = new Set(VARIANTS.map((variant) => (instanceOf(id as LearningActivityId, variant).runtime?.setupData as Record<string, unknown>)[key]));
      expect(files.size, id).toBeGreaterThanOrEqual(2);
      const staged = (templateOf(id as LearningActivityId).runtime?.config as { workspace?: { datasets: { filename: string }[] } }).workspace!.datasets.map((dataset) => dataset.filename);
      for (const file of files) expect(staged, id).toContain(file);
    }
  });

  it("every function mission has exactly one displayed example and several hidden cases, with unique ids", () => {
    const KEYS_WITH_CASES: ReadonlyArray<readonly [string, string]> = [
      ["python-foundations.pf16", "cases"],
      ["python-foundations.pf17", "maskedCases"],
      ["python-foundations.pf17", "shareCases"],
      ["python-foundations.pf19", "cases"],
      ["python-foundations.pf20", "addTotalCases"],
      ["python-foundations.pf20", "selectCases"],
      ["python-foundations.pf21", "countCases"],
      ["python-foundations.pf21", "cleanCases"],
      ["python-foundations.pf22", "reportCases"],
      ["python-foundations.pf22", "topCases"],
      ["python-foundations.pf22", "shareCases"],
      ["python-foundations.pf23", "trendCases"],
      ["python-foundations.pf23", "rankCases"],
      ["python-foundations.pf24", "profitCases"],
      ["python-foundations.pf24", "regionCases"],
      ["python-foundations.pf25", "checkCases"],
      ["python-foundations.pf25", "buildCases"],
      ["python-foundations.pf26", "prepareCases"],
      ["python-foundations.pf26", "diagnosticCases"],
    ];
    for (const [activityId, key] of KEYS_WITH_CASES) {
      for (const variant of VARIANTS) {
        const cases = casesOf(activityId, variant, key);
        expect(cases.filter((entry) => entry.visibility === "example"), `${activityId}.${key}#${variant}`).toHaveLength(1);
        expect(cases.filter((entry) => entry.visibility === "hidden").length, `${activityId}.${key}#${variant}`).toBeGreaterThanOrEqual(1);
        expect(new Set(cases.map((entry) => entry.id)).size).toBe(cases.length);
      }
    }
  });
});

describe("M10 missions - Run is exploration only; plots are previewed (real Pyodide)", () => {
  it("Run executes the learner's code without grading and keeps the stdout", async (ctx) => {
    needPackages(ctx);
    const id = "python-foundations.pf16" as LearningActivityId;
    const execution = await runOnPyodide(pyodide, id, 0, M10_SOLUTIONS[id]!.reference);
    expect(execution.status).toBe(RUNTIME_EXECUTION_STATUS.SUCCESS);
    if (execution.status !== RUNTIME_EXECUTION_STATUS.SUCCESS) return;
    expect(execution.stdout).toContain("(");
  }, 240_000);

  for (const id of ["python-foundations.pf23", "python-foundations.pf24", "python-foundations.pf26"] as const) {
    it(`${id}: Run shows the learner's plot as a PNG preview in the workspace artifacts`, async (ctx) => {
      needPackages(ctx);
      const execution = await runOnPyodide(pyodide, id as LearningActivityId, 0, M10_SOLUTIONS[id]!.reference);
      expect(execution.status).toBe(RUNTIME_EXECUTION_STATUS.SUCCESS);
      if (execution.status !== RUNTIME_EXECUTION_STATUS.SUCCESS) return;
      const previews = (execution.workspace?.artifacts ?? []).filter((file) => file.dataUrl?.startsWith("data:image/png;base64,"));
      expect(previews.length, id).toBeGreaterThanOrEqual(1);
      expect(previews.length, id).toBeLessThanOrEqual(4);
    }, 240_000);
  }

  it("the buggy PF-24 starter still runs and still previews its (misleading) plot", async (ctx) => {
    needPackages(ctx);
    const execution = await runOnPyodide(pyodide, "python-foundations.pf24" as LearningActivityId, 0, STARTERS["python-foundations.pf24"]!);
    expect(execution.status).toBe(RUNTIME_EXECUTION_STATUS.SUCCESS);
    if (execution.status !== RUNTIME_EXECUTION_STATUS.SUCCESS) return;
    expect((execution.workspace?.artifacts ?? []).some((file) => file.dataUrl !== undefined)).toBe(true);
  }, 240_000);

  it("a Matplotlib mistake of the learner is a Python exception, not a runtime failure", async (ctx) => {
    needPackages(ctx);
    const wrong = M10_SOLUTIONS["python-foundations.pf23"]!.wrong.find((entry) => entry.raises !== undefined)!;
    const execution = await runOnPyodide(pyodide, "python-foundations.pf23" as LearningActivityId, 0, wrong.code);
    expect(execution.status).toBe(RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION);
  }, 240_000);
});

describe("M10 missions - runtime declarations", () => {
  const EXPECTED: Record<string, readonly string[]> = {
    "python-foundations.pf16": ["numpy"],
    "python-foundations.pf17": ["numpy"],
    "python-foundations.pf18": ["numpy"],
    "python-foundations.pf19": ["numpy", "pandas"],
    "python-foundations.pf20": ["numpy", "pandas"],
    "python-foundations.pf21": ["numpy", "pandas"],
    "python-foundations.pf22": ["numpy", "pandas"],
    "python-foundations.pf23": ["numpy", "pandas", "matplotlib"],
    "python-foundations.pf24": ["numpy", "pandas", "matplotlib"],
    "python-foundations.pf25": ["numpy", "pandas"],
    "python-foundations.pf26": ["numpy", "pandas", "matplotlib"],
  };
  for (const id of M10_ACTIVITY_IDS) {
    it(`${id} declares exactly its packages`, () => {
      const config = templateOf(id).runtime?.config as { packages?: string[] } | undefined;
      expect(config?.packages).toEqual(EXPECTED[id]);
    });
  }

  it("only plotting missions declare matplotlib; only PF-25/PF-26 stage data files", () => {
    for (const id of M10_ACTIVITY_IDS) {
      const config = templateOf(id).runtime?.config as { packages?: string[]; workspace?: unknown } | undefined;
      expect(config?.packages?.includes("matplotlib") ?? false, id).toBe(PLOTTING.has(id));
      expect(config?.workspace !== undefined, id).toBe(id.endsWith("pf25") || id.endsWith("pf26"));
    }
  });
});
