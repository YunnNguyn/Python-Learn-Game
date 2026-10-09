import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";

import { CS116_PRODUCTION_TEMPLATE_LC03 } from "../../src/content/cs116/production-content";
import type { JsonObject } from "../../src/core/domain";
import {
  DeclarativeGraderCheckType,
  gradeDeclaratively,
  resolveDeclarativeGraderConfig,
} from "../../src/core/grading";
import { RuntimeVariableObservationsSchema } from "../../src/core/runtime";
import { buildObservationExpression } from "../../src/core/runtime/pyodide/observation-helper";

interface ObservedVariable {
  pythonType: string;
  isNdarray: boolean;
  shape?: number[];
  value?: unknown;
}

/**
 * Executes the ACTUAL production helper (OBSERVATION_HELPER_SOURCE via
 * buildObservationExpression) inside a real Pyodide instance.
 *
 * Package-dependent tests call `ctx.skip()` when the package index cannot be
 * reached, so they are reported as SKIPPED (NOT RUN), never as PASS.
 */
describe("Pyodide observation helper (real Pyodide)", () => {
  let pyodide: PyodideInterface;
  let packagesAvailable = false;
  let packageError = "";

  beforeAll(async () => {
    pyodide = await loadPyodide();
    try {
      // loadPackage may only log (not throw) when the index is unreachable,
      // so availability is confirmed by actually importing the packages.
      await pyodide.loadPackage(["numpy", "pandas"]);
      pyodide.runPython("import numpy, pandas");
      packagesAvailable = true;
    } catch (error) {
      packageError = error instanceof Error ? error.message : String(error);
    }
  }, 120_000);

  afterAll(() => {
    if (!packagesAvailable) {
      console.warn(
        `[NOT RUN] numpy/pandas packages unavailable: ${packageError}`,
      );
    }
  });

  function observe(
    code: string,
    names: readonly string[],
  ): Record<string, ObservedVariable> {
    const namespace = pyodide.globals.get("dict")();
    try {
      pyodide.runPython(code, { globals: namespace });
      const serialized = pyodide.runPython(buildObservationExpression(names), {
        globals: namespace,
      }) as string;
      const parsed = JSON.parse(serialized) as { variables: JsonObject };
      // The payload must satisfy the strict runtime contract.
      RuntimeVariableObservationsSchema.parse(parsed);
      return parsed.variables as unknown as Record<string, ObservedVariable>;
    } finally {
      namespace.destroy();
    }
  }

  function requirePackages(ctx: { skip: (note?: string) => never }): void {
    if (!packagesAvailable) {
      ctx.skip(`NOT RUN: numpy/pandas unavailable (${packageError})`);
    }
  }

  const PANDAS_SETUP = `
import pandas as pd
df = pd.DataFrame({
    "distance": [38, 77, 51, 29, 60],
    "threat": [1, 2, 3, 4, 5],
})
`;

  describe("A. NumPy ndarray", () => {
    it("keeps shape, isNdarray and tolist() values", (ctx) => {
      requirePackages(ctx);
      const { arr } = observe(
        "import numpy as np\narr = np.array([[1, 2, 3], [4, 5, 6]])",
        ["arr"],
      );
      expect(arr).toEqual({
        pythonType: "ndarray",
        isNdarray: true,
        shape: [2, 3],
        value: [
          [1, 2, 3],
          [4, 5, 6],
        ],
      });
    });
  });

  describe("B/C. pandas", () => {
    it("observes Series shape without serializing it", (ctx) => {
      requirePackages(ctx);
      const { s } = observe(`${PANDAS_SETUP}\ns = df["distance"]`, ["s"]);
      expect(s.pythonType).toBe("Series");
      expect(s.isNdarray).toBe(false);
      expect(s.shape).toEqual([5]);
      expect(s.value).toBeUndefined();
    });

    it("observes DataFrame shape without serializing it", (ctx) => {
      requirePackages(ctx);
      const { f } = observe(`${PANDAS_SETUP}\nf = df[["distance"]]`, ["f"]);
      expect(f.pythonType).toBe("DataFrame");
      expect(f.isNdarray).toBe(false);
      expect(f.shape).toEqual([5, 1]);
      expect(f.value).toBeUndefined();
    });
  });

  describe("D. ordinary Python objects", () => {
    it("scalars have no shape and stay valid", () => {
      const { n, x, s } = observe('n = 3\nx = 2.5\ns = "hi"', ["n", "x", "s"]);
      expect(n).toEqual({ pythonType: "int", isNdarray: false, value: 3 });
      expect(x).toEqual({ pythonType: "float", isNdarray: false, value: 2.5 });
      expect(s).toEqual({ pythonType: "str", isNdarray: false, value: "hi" });
    });

    it("tuple/list serialization is unchanged and has no shape", () => {
      const { t, l } = observe("t = (5, 1)\nl = [1, [2, 3]]", ["t", "l"]);
      expect(t).toEqual({ pythonType: "tuple", isNdarray: false, value: [5, 1] });
      expect(l).toEqual({
        pythonType: "list",
        isNdarray: false,
        value: [1, [2, 3]],
      });
    });

    it("skips names that are not defined", () => {
      expect(observe("a = 1", ["a", "missing"])).not.toHaveProperty("missing");
    });
  });

  describe("E. malformed shape and JSON safety", () => {
    const CASES: ReadonlyArray<readonly [string, string, number[] | undefined]> = [
      ["valid custom shape", "(3, 4)", [3, 4]],
      ["empty shape (0-d)", "()", []],
      ["numpy-like integer dims", "[2, 3]", [2, 3]],
      ["negative dimension", "(-1, 2)", undefined],
      ["fractional dimension", "(2.5, 2)", undefined],
      ["bool dimension", "(True, 2)", undefined],
      ["string dimension", '("5", 2)', undefined],
      ["unsafe integer dimension", "(2 ** 60, 2)", undefined],
      ["NaN dimension", '(float("nan"), 2)', undefined],
      ["Infinity dimension", '(float("inf"), 2)', undefined],
      ["None shape", "None", undefined],
      ["string shape", '"abc"', undefined],
      ["non-iterable shape", "7", undefined],
      ["rank above limit", "tuple([1] * 40)", undefined],
    ];

    it.each(CASES)("%s", (_label, shapeExpr, expected) => {
      const { o } = observe(
        `class Obj:\n    shape = ${shapeExpr}\no = Obj()`,
        ["o"],
      );
      expect(o.pythonType).toBe("Obj");
      expect(o.isNdarray).toBe(false);
      if (expected === undefined) {
        expect(o).not.toHaveProperty("shape");
      } else {
        expect(o.shape).toEqual(expected);
      }
    });

    it("omits shape when the attribute raises, without failing the result", () => {
      const out = observe(
        `class Boom:\n    @property\n    def shape(self):\n        raise RuntimeError("boom")\nb = Boom()\nok = 1`,
        ["b", "ok"],
      );
      expect(out.b).toEqual({ pythonType: "Boom", isNdarray: false });
      expect(out.ok.value).toBe(1);
    });

    it("NaN/Infinity/unsafe ints never produce invalid JSON", () => {
      const out = observe(
        'a = float("nan")\nb = float("inf")\nc = 2 ** 60\nd = [1, float("nan")]\ne = 4',
        ["a", "b", "c", "d", "e"],
      );
      for (const key of ["a", "b", "c", "d"]) {
        expect(out[key]).not.toHaveProperty("value");
      }
      expect(out.e.value).toBe(4);
    });

    it("keeps ndarray shape even if its values are not JSON-safe", (ctx) => {
      requirePackages(ctx);
      const { arr } = observe(
        'import numpy as np\narr = np.array([[float("nan"), 1.0]])',
        ["arr"],
      );
      expect(arr.shape).toEqual([1, 2]);
      expect(arr).not.toHaveProperty("value");
    });
  });

  describe("LC-03 production grader integration", () => {
    const gradingData: JsonObject = {
      expectedSeriesValues: [38, 77, 51, 29, 60],
      expectedSeriesNdim: 1,
      expectedFrameShape: [5, 1],
    };
    const VARIABLES = [
      "distance_series",
      "distance_frame",
      "series_values",
      "series_ndim",
      "frame_shape",
    ];

    function gradeLearner(code: string) {
      const variables = observe(`${PANDAS_SETUP}\n${code}`, VARIABLES);
      const config = resolveDeclarativeGraderConfig(
        CS116_PRODUCTION_TEMPLATE_LC03.grader.config as JsonObject,
        gradingData,
      );
      return gradeDeclaratively(config as unknown as JsonObject, {
        variables,
      } as never);
    }

    const CORRECT = `
distance_series = df["distance"]
distance_frame = df[["distance"]]
series_values = distance_series.tolist()
series_ndim = distance_series.ndim
frame_shape = distance_frame.shape
`;

    it("passes the correct learner solution (both pandas SHAPE checks)", (ctx) => {
      requirePackages(ctx);
      const result = gradeLearner(CORRECT);
      expect(result.checks.filter((c) => !c.passed)).toEqual([]);
      expect(result.passed).toBe(true);
    });

    it("fails when the Series is a DataFrame (wrong shape)", (ctx) => {
      requirePackages(ctx);
      // Run the full valid solution first so every downstream line succeeds,
      // then mutate only the Series variable into a [5, 1] DataFrame.
      const result = gradeLearner(
        `${CORRECT}\ndistance_series = distance_frame\n`,
      );
      expect(result.passed).toBe(false);
      const seriesShape = result.checks.find(
        (c) =>
          c.type === DeclarativeGraderCheckType.SHAPE &&
          c.variable === "distance_series",
      );
      expect(seriesShape).toBeDefined();
      expect(seriesShape?.passed).toBe(false);
    });

    it("fails when the DataFrame has the wrong shape", (ctx) => {
      requirePackages(ctx);
      const result = gradeLearner(
        CORRECT.replace('df[["distance"]]', "df"),
      );
      expect(result.passed).toBe(false);
    });

    it("existing NumPy SHAPE grading is unchanged", (ctx) => {
      requirePackages(ctx);
      const variables = observe(
        "import numpy as np\narr = np.zeros((2, 3))",
        ["arr"],
      );
      const result = gradeDeclaratively(
        {
          checks: [
            { type: DeclarativeGraderCheckType.NDARRAY_TYPE, variable: "arr" },
            { type: DeclarativeGraderCheckType.SHAPE, variable: "arr", expected: [2, 3] },
          ],
        },
        { variables } as never,
      );
      expect(result.passed).toBe(true);
    });
  });
});
