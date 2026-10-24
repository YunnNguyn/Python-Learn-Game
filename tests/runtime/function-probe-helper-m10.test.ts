import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";

import type { FunctionProbeObservation, FunctionProbeSpec } from "../../src/core/runtime";
import { runFunctionProbes } from "../../src/core/runtime/pyodide/function-probe-helper";
import { createPythonSetupNamespace } from "../../src/core/runtime/pyodide/setup-conversion";
import { configureMatplotlib } from "../../src/core/runtime/pyodide/workspace-preview";
import { requireNumpy, tryLoadNumpy, type NumpyState } from "./numpy-support";

/**
 * PHASE-08 / M10: the Python-side probe helper with REAL pandas and Matplotlib - how a
 * DataFrame, a Series and an Axes are encoded, which ones are refused, and that the new
 * "value" mode reads a variable without calling anything. Skipped (never passed) when the
 * packages cannot be loaded; PACK_VERIFY_STRICT=1 makes that a failure.
 */

let pyodide: PyodideInterface;
let packages: NumpyState = { available: false, error: "not loaded" };

beforeAll(async () => {
  pyodide = await loadPyodide();
  configureMatplotlib(pyodide);
  packages = await tryLoadNumpy(pyodide);
  if (packages.available) {
    try {
      await pyodide.loadPackage(["pandas", "matplotlib"]);
    } catch (error) {
      packages = { available: false, error: error instanceof Error ? error.message.split("\n")[0]! : String(error) };
    }
  }
}, 300_000);

async function probe(code: string, specs: readonly FunctionProbeSpec[]): Promise<readonly FunctionProbeObservation[]> {
  const namespace = createPythonSetupNamespace(pyodide, {});
  try {
    await pyodide.runPythonAsync(code, { globals: namespace });
    return await runFunctionProbes(pyodide, namespace, specs);
  } finally {
    namespace.destroy();
  }
}

const value = (name: string): FunctionProbeSpec => ({ function: name, mode: "value", cases: [{ args: [] }] });
const first = async (code: string, name: string) => ((await probe(code, [value(name)]))[0]!.cases[0]!) as Record<string, unknown>;

describe("probe helper - pandas (real Pyodide)", () => {
  it("encodes a DataFrame with columns, rows, index, index name and dtypes; NaN and None become null", async (ctx) => {
    requireNumpy(ctx, packages);
    const result = await first(
      'import pandas as pd\ndf = pd.DataFrame({"a": [1, 2], "b": ["x", None], "c": [1.5, float("nan")], "d": [True, False]}, index=[5, 6])\ndf.index.name = "k"\n',
      "df",
    );
    expect(result).toEqual({
      outcome: "returned",
      pythonType: "DataFrame",
      value: {
        $dataframe: {
          columns: ["a", "b", "c", "d"],
          data: [[1, "x", 1.5, true], [2, null, null, false]],
          index: [5, 6],
          indexName: "k",
          dtypes: { a: "int64", b: "str", c: "float64", d: "bool" },
        },
      },
    });
  }, 60_000);

  it("encodes a Series with its index, name and dtype (also categories)", async (ctx) => {
    requireNumpy(ctx, packages);
    expect(await first('import pandas as pd\ns = pd.Series([1.0, 2.0], index=["u", "v"], name="s")\n', "s")).toEqual({
      outcome: "returned",
      pythonType: "Series",
      value: { $series: { data: [1, 2], index: ["u", "v"], name: "s", dtype: "float64" } },
    });
    const category = await first('import pandas as pd\nc = pd.Series(pd.Categorical(["a", "b"]))\n', "c");
    expect((category.value as { $series: { dtype: string } }).$series.dtype).toBe("category");
  });

  it("refuses what the grader cannot compare, with a reason the learner can act on", async (ctx) => {
    requireNumpy(ctx, packages);
    const big = await first("import pandas as pd\nbig = pd.DataFrame({'a': range(500)})\n", "big");
    expect(big).toMatchObject({ outcome: "unsupported", pythonType: "DataFrame" });
    expect(String(big.reason)).toContain("quá lớn");
    const multi = await first("import pandas as pd\nmi = pd.DataFrame({'a': [1]}, index=pd.MultiIndex.from_tuples([(1, 2)]))\n", "mi");
    expect(multi).toMatchObject({ outcome: "unsupported" });
    expect(String(multi.reason)).toContain("reset_index");
    const odd = await first("class Odd:\n    pass\nodd = Odd()\n", "odd");
    expect(odd).toMatchObject({ outcome: "unsupported", pythonType: "Odd" });
  });

  it("decodes a $dataframe argument into a real DataFrame (columns, dtypes, index) before calling", async (ctx) => {
    requireNumpy(ctx, packages);
    const [result] = await probe("def ident(x):\n    return x\n", [
      { function: "ident", cases: [{ args: [{ $dataframe: { columns: ["a", "b"], data: [[1, 0.5]], index: [7], dtypes: { a: "int64", b: "float64" } } }] }] },
    ]);
    expect(result!.cases[0]).toMatchObject({
      outcome: "returned",
      pythonType: "DataFrame",
      value: { $dataframe: { columns: ["a", "b"], data: [[1, 0.5]], index: [7], dtypes: { a: "int64", b: "float64" } } },
    });
  });

  it("reports whether a function changed its DataFrame argument", async (ctx) => {
    requireNumpy(ctx, packages);
    const code = 'def adds(frame):\n    frame["z"] = 1\n    return frame\n\ndef copies(frame):\n    return frame.assign(z=1)\n';
    const args = [{ $dataframe: { columns: ["a"], data: [[1]] } }] as never;
    const [bad, good] = await probe(code, [
      { function: "adds", cases: [{ args, checkArgsUnchanged: true }] },
      { function: "copies", cases: [{ args, checkArgsUnchanged: true }] },
    ]);
    expect(bad!.cases[0]).toMatchObject({ outcome: "returned", argsMutated: true });
    expect((good!.cases[0] as { argsMutated?: boolean }).argsMutated).not.toBe(true);
  });

  it("reports a raised pandas exception with its type, never as a runtime failure", async (ctx) => {
    requireNumpy(ctx, packages);
    const [result] = await probe("import pandas as pd\ndef f(frame):\n    return frame['nope']\n", [
      { function: "f", cases: [{ args: [{ $dataframe: { columns: ["a"], data: [[1]] } }] as never }] },
    ]);
    expect(result!.cases[0]).toMatchObject({ outcome: "raised", exceptionType: "KeyError" });
  });
});

describe("probe helper - value mode (real Pyodide)", () => {
  it("reads a variable without calling it, and reports a missing one as MISSING", async (ctx) => {
    requireNumpy(ctx, packages);
    const [present, missing] = await probe("x = [1, 2]\n", [value("x"), value("not_defined")]);
    expect(present).toMatchObject({ function: "x", status: "OK" });
    expect(present!.cases[0]).toEqual({ outcome: "returned", pythonType: "list", value: [1, 2] });
    expect(missing).toMatchObject({ function: "not_defined", status: "MISSING", cases: [] });
  });

  it("does not execute a callable it reads: a function-valued variable is just 'unsupported'", async (ctx) => {
    requireNumpy(ctx, packages);
    const result = await first("calls = 0\ndef f():\n    global calls\n    calls += 1\n", "f");
    expect(result.outcome).toBe("unsupported");
    const [, counter] = await probe("calls = 0\ndef f():\n    global calls\n    calls += 1\n", [value("f"), value("calls")]);
    expect(counter!.cases[0]).toMatchObject({ value: 0 });
  });

  it("encodes dicts that contain tables and ndarrays (the PF-26 result shape)", async (ctx) => {
    requireNumpy(ctx, packages);
    const result = await first(
      'import numpy as np, pandas as pd\nresult = {"clean": pd.DataFrame({"a": [1]}), "X": np.zeros((1, 2)), "stats": {"rows": 1, "mean": 0.5}}\n',
      "result",
    );
    const encoded = result.value as Record<string, unknown>;
    expect(Object.keys(encoded)).toEqual(["clean", "X", "stats"]);
    expect(encoded.clean).toHaveProperty("$dataframe");
    expect(encoded.X).toMatchObject({ $ndarray: [[0, 0]], shape: [1, 2] });
    expect(encoded.stats).toEqual({ rows: 1, mean: 0.5 });
  });
});

describe("probe helper - Matplotlib (real Pyodide)", () => {
  const plot =
    "import matplotlib.pyplot as plt\n" +
    "fig, ax = plt.subplots()\n" +
    'ax.plot([1, 2, 3], [4, 5, 6], label="A")\n' +
    'ax.bar(["p", "q"], [1, 2])\n' +
    'ax.set_title("T")\nax.set_xlabel("X")\nax.legend()\n' +
    "def make():\n    return ax\n";

  it("summarises an Axes by its properties: texts, legend labels and the drawn series", async (ctx) => {
    requireNumpy(ctx, packages);
    const result = (await first(plot, "ax")) as { pythonType: string; value: { $figure: Record<string, unknown> } };
    expect(result.pythonType).toBe("Axes");
    const figure = result.value.$figure;
    expect(figure).toMatchObject({ title: "T", xlabel: "X", ylabel: "", legend: ["A"] });
    const series = figure.series as Array<{ kind: string; label: string | null }>;
    expect(series.map((entry) => entry.kind)).toEqual(["line", "bar"]);
    expect(series[0]!.label).toBe("A");
    expect(series[1]!.label).toBeNull();
  }, 60_000);

  it("reads the Axes returned by a function exactly like the one in a variable", async (ctx) => {
    requireNumpy(ctx, packages);
    const [byCall] = await probe(plot, [{ function: "make", cases: [{ args: [] }] }]);
    const byValue = await first(plot, "ax");
    expect(byCall!.cases[0]).toEqual(byValue);
  });

  it("is deterministic and never leaks pixels: the summary holds no image data", async (ctx) => {
    requireNumpy(ctx, packages);
    const one = JSON.stringify(await first(plot, "ax"));
    const two = JSON.stringify(await first(plot, "ax"));
    expect(one).toBe(two);
    expect(one).not.toContain("base64");
    expect(one.length).toBeLessThan(1_000);
  });

  it("an empty Axes has no series and no legend", async (ctx) => {
    requireNumpy(ctx, packages);
    const result = (await first("import matplotlib.pyplot as plt\nfig, ax = plt.subplots()\n", "ax")) as { value: { $figure: Record<string, unknown> } };
    expect(result.value.$figure.series).toEqual([]);
    expect(result.value.$figure.legend).toEqual([]);
  });
});
