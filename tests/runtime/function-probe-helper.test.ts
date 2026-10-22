import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";

import type { FunctionProbeCase, FunctionProbeObservation, FunctionProbeSpec } from "../../src/core/runtime";
import {
  buildFunctionProbeExpression,
  runFunctionProbes,
} from "../../src/core/runtime/pyodide/function-probe-helper";
import { createPythonSetupNamespace } from "../../src/core/runtime/pyodide/setup-conversion";
import { requireNumpy, tryLoadNumpy, type NumpyState } from "./numpy-support";

/**
 * The Python-side function probe helper, run on a REAL Pyodide (the production source,
 * through `runFunctionProbes`). The standard-library tests need no network. The NumPy
 * tests use the real NumPy wheel and are SKIPPED (not passed) when it cannot be
 * fetched; PACK_VERIFY_STRICT=1 turns that skip into a failure.
 */

let pyodide: PyodideInterface;
let numpy: NumpyState = { available: false, error: "not loaded" };

beforeAll(async () => {
  pyodide = await loadPyodide();
  numpy = await tryLoadNumpy(pyodide);
}, 240_000);

async function probe(code: string, specs: readonly FunctionProbeSpec[]): Promise<readonly FunctionProbeObservation[]> {
  const namespace = createPythonSetupNamespace(pyodide, {});
  try {
    await pyodide.runPythonAsync(code, { globals: namespace });
    return await runFunctionProbes(pyodide, namespace, specs);
  } finally {
    namespace.destroy();
  }
}

const one = (name: string, ...cases: FunctionProbeCase[]): FunctionProbeSpec => ({ function: name, cases });
const call = (...args: unknown[]): FunctionProbeCase => ({ args: args as never });

async function returnsOf(code: string, name: string, ...cases: FunctionProbeCase[]) {
  const [result] = await probe(code, [one(name, ...cases)]);
  return result!;
}

describe("function probe helper - values (real Pyodide)", () => {
  it("returns scalars, lists, dicts and None as plain JSON with the Python type name", async () => {
    const result = await returnsOf(
      "def f(x):\n    return x\n",
      "f",
      call(3),
      call(2.5),
      call("ab"),
      call(true),
      call(null),
      call([1, [2, 3]]),
      call({ a: [1], b: { c: 2 } }),
    );
    expect(result.status).toBe("OK");
    expect(result.cases).toEqual([
      { outcome: "returned", pythonType: "int", value: 3 },
      { outcome: "returned", pythonType: "float", value: 2.5 },
      { outcome: "returned", pythonType: "str", value: "ab" },
      { outcome: "returned", pythonType: "bool", value: true },
      { outcome: "returned", pythonType: "NoneType", value: null },
      { outcome: "returned", pythonType: "list", value: [1, [2, 3]] },
      { outcome: "returned", pythonType: "dict", value: { a: [1], b: { c: 2 } } },
    ]);
  });

  it("builds tuples, sets and floats from the typed wrappers and reports them back typed", async () => {
    const result = await returnsOf(
      "def kinds(*items):\n    return [type(i).__name__ for i in items]\n\ndef same(x):\n    return x\n",
      "kinds",
      call({ $tuple: [1, 2] }, { $set: [3, 1, 3] }, { $float: 2 }, 2, [1]),
    );
    expect(result.cases[0]).toMatchObject({ outcome: "returned", value: ["tuple", "set", "float", "int", "list"] });

    const [same] = await probe("def same(x):\n    return x\n", [
      one("same", call({ $tuple: [1, "a"] }), call({ $set: [3, 1, 2] }), call({ $float: 2 }), call({ $tuple: [] })),
    ]);
    expect(same!.cases).toEqual([
      { outcome: "returned", pythonType: "tuple", value: { $tuple: [1, "a"] } },
      // sets come back sorted and de-duplicated, so comparison is deterministic
      { outcome: "returned", pythonType: "set", value: { $set: [1, 2, 3] } },
      { outcome: "returned", pythonType: "float", value: 2 },
      { outcome: "returned", pythonType: "tuple", value: { $tuple: [] } },
    ]);
  });

  it("passes keyword arguments", async () => {
    const result = await returnsOf(
      "def f(a, b=10, *, scale=1):\n    return (a + b) * scale\n",
      "f",
      { args: [1], kwargs: { b: 2, scale: 3 } },
      { args: [1] },
    );
    expect(result.cases.map((c) => (c.outcome === "returned" ? c.value : null))).toEqual([9, 11]);
  });

  it("is deterministic: the same probes give identical observations twice", async () => {
    const code = "def f(xs):\n    return sorted(set(xs))\n";
    const specs = [one("f", call([3, 1, 2, 3]), call([]))];
    expect(await probe(code, specs)).toEqual(await probe(code, specs));
  });
});

describe("function probe helper - failures stay per case (real Pyodide)", () => {
  it("reports a missing function and a non-callable name", async () => {
    const results = await probe("value = 3\n", [one("nope", call(1)), one("value", call(1))]);
    expect(results.map((r) => [r.function, r.status, r.cases.length])).toEqual([
      ["nope", "MISSING", 0],
      ["value", "NOT_CALLABLE", 0],
    ]);
  });

  it("one raising case does not stop the others, and carries the exception type, MRO and first line", async () => {
    const result = await returnsOf(
      "def f(x):\n    if x == 0:\n        raise ValueError('x must not be zero\\nsecond line')\n    return 10 // x\n",
      "f",
      call(5),
      call(0),
      call(2),
    );
    expect(result.cases[0]).toMatchObject({ outcome: "returned", value: 2 });
    expect(result.cases[1]).toMatchObject({
      outcome: "raised",
      exceptionType: "ValueError",
      exceptionMro: ["ValueError", "Exception", "BaseException"],
      message: "x must not be zero",
    });
    expect(result.cases[2]).toMatchObject({ outcome: "returned", value: 5 });
  });

  it("catches SystemExit, deep recursion and clips a long message", async () => {
    const result = await returnsOf(
      "def f(mode):\n    if mode == 'exit':\n        raise SystemExit(3)\n    if mode == 'loop':\n        return f(mode)\n    raise RuntimeError('x' * 1000)\n",
      "f",
      call("exit"),
      call("loop"),
      call("long"),
    );
    expect(result.cases[0]).toMatchObject({ outcome: "raised", exceptionType: "SystemExit" });
    expect(result.cases[1]).toMatchObject({ outcome: "raised", exceptionType: "RecursionError" });
    const long = result.cases[2]!;
    expect(long.outcome === "raised" && long.message.length).toBe(200);
  });

  it("reports a wrong-arity call as a TypeError of the call (not a crash of the helper)", async () => {
    const result = await returnsOf("def f(a, b):\n    return a\n", "f", call(1));
    expect(result.cases[0]).toMatchObject({ outcome: "raised", exceptionType: "TypeError" });
  });

  it("reports results it cannot represent instead of guessing", async () => {
    const result = await returnsOf(
      [
        "def f(mode):",
        "    if mode == 'gen':",
        "        return (i for i in range(3))",
        "    if mode == 'func':",
        "        return len",
        "    if mode == 'intkeys':",
        "        return {1: 'a'}",
        "    if mode == 'nan':",
        "        return float('nan')",
        "    if mode == 'inf':",
        "        return [float('inf')]",
        "    if mode == 'huge':",
        "        return 10 ** 30",
        "    if mode == 'dollar':",
        "        return {'$x': 1}",
        "    if mode == 'big':",
        "        return list(range(30000))",
        "    return object()",
        "",
      ].join("\n"),
      "f",
      ...["gen", "func", "intkeys", "nan", "inf", "huge", "dollar", "big", "obj"].map((m) => call(m)),
    );
    expect(result.cases.map((c) => c.outcome)).toEqual(Array(9).fill("unsupported"));
    expect(result.cases.map((c) => (c.outcome === "unsupported" ? c.pythonType : ""))).toEqual([
      "generator",
      "builtin_function_or_method",
      "dict",
      "float",
      "list",
      "int",
      "dict",
      "list",
      "object",
    ]);
  });

  it("a malformed argument is a per-case 'unsupported', not an exception in the helper", async () => {
    const result = await returnsOf("def f(x):\n    return x\n", "f", call({ $set: [[1]] }), call(5));
    expect(result.cases[0]).toMatchObject({ outcome: "unsupported" });
    expect(result.cases[1]).toMatchObject({ outcome: "returned", value: 5 });
  });
});

describe("function probe helper - isolation (real Pyodide)", () => {
  it("rebuilds the arguments for every call, so a mutating function cannot affect the next case", async () => {
    const result = await returnsOf(
      "def f(xs):\n    xs.append(99)\n    return len(xs)\n",
      "f",
      { args: [[1, 2, 3]] },
      { args: [[1, 2, 3]] },
      { args: [[1, 2, 3]] },
    );
    expect(result.cases.map((c) => (c.outcome === "returned" ? c.value : -1))).toEqual([4, 4, 4]);
  });

  it("detects a function that modifies its arguments (and only when asked)", async () => {
    const code = "def sort_in_place(xs):\n    xs.sort()\n    return xs\n\ndef sorted_copy(xs):\n    return sorted(xs)\n\ndef touch_dict(d):\n    d['x'] = 1\n    return d\n";
    const [a, b, c] = await probe(code, [
      one("sort_in_place", { args: [[3, 1, 2]], checkArgsUnchanged: true }, { args: [[1, 2, 3]], checkArgsUnchanged: true }, { args: [[3, 1]] }),
      one("sorted_copy", { args: [[3, 1, 2]], checkArgsUnchanged: true }),
      one("touch_dict", { args: [{ a: 1 }], checkArgsUnchanged: true }),
    ]);
    expect(a!.cases.map((x) => x.argsMutated)).toEqual([true, false, undefined]);
    expect(b!.cases[0]!.argsMutated).toBe(false);
    expect(c!.cases[0]!.argsMutated).toBe(true);
  });

  it("discards what the learner function prints and leaves no helper names in the learner's namespace", async () => {
    const namespace = createPythonSetupNamespace(pyodide, {});
    try {
      await pyodide.runPythonAsync("def f(x):\n    print('noise', x)\n    return x\n", { globals: namespace });
      const namesIn = (): string[] => {
        const proxy = pyodide.runPython("list(globals())", { globals: namespace });
        try {
          return proxy.toJs() as string[];
        } finally {
          proxy.destroy();
        }
      };
      const before = new Set<string>(namesIn());
      let captured = "";
      pyodide.setStdout({ write: (buffer: Uint8Array) => ((captured += new TextDecoder().decode(buffer)), buffer.length) });
      try {
        await runFunctionProbes(pyodide, namespace, [one("f", call(1))]);
      } finally {
        pyodide.setStdout();
      }
      const after = new Set<string>(namesIn());
      expect(captured).toBe("");
      expect([...after].filter((name) => !before.has(name))).toEqual([]);
      expect([...after].some((name) => name.startsWith("__probe") || name.startsWith("_encode") || name.startsWith("_decode"))).toBe(false);
    } finally {
      namespace.destroy();
    }
  });

  it("the expression sent to Python carries the arguments only - there is nowhere for an expected value to be", () => {
    const expression = buildFunctionProbeExpression([one("f", call(12345))]);
    expect(expression).toContain("12345");
    expect(expression).not.toMatch(/expect|RETURNS|RAISES|tolerance/i);
  });

  it("the namespace a learner function can reach holds no probe or spec names while it runs", async () => {
    const result = await returnsOf(
      "def f(x):\n    import sys\n    return sorted(k for k in globals() if 'probe' in k.lower() or 'spec' in k.lower())\n",
      "f",
      call(1),
    );
    expect(result.cases[0]).toMatchObject({ outcome: "returned", value: [] });
  });
});

describe("function probe helper - behavior grading scenarios (real Pyodide)", () => {
  it("a hard-coded function passes the displayed example but is caught by other arguments", async () => {
    const hardcoded = "def total(values):\n    return 6\n";
    const correct = "def total(values):\n    return sum(values)\n";
    const specs = [one("total", call([1, 2, 3]), call([]), call([5, -2]), call([10]))];
    const hard = (await probe(hardcoded, specs))[0]!.cases.map((c) => (c.outcome === "returned" ? c.value : null));
    const right = (await probe(correct, specs))[0]!.cases.map((c) => (c.outcome === "returned" ? c.value : null));
    expect(hard).toEqual([6, 6, 6, 6]); // matches ONLY the displayed example [1, 2, 3] -> 6
    expect(right).toEqual([6, 0, 3, 10]);
  });
});

describe("function probe helper - NumPy (real Pyodide + real NumPy)", () => {
  it("builds ndarrays with the requested dtype and shape and reports ndarray results typed", async (ctx) => {
    requireNumpy(ctx, numpy);
    const result = await returnsOf(
      [
        "import numpy as np",
        "def info(a):",
        "    return [type(a).__name__, str(a.dtype), list(a.shape)]",
        "def double(a):",
        "    return a * 2",
        "def total(a):",
        "    return a.sum()",
        "def mask(a):",
        "    return a > 2",
        "",
      ].join("\n"),
      "info",
      call({ $ndarray: [[1, 2, 3], [4, 5, 6]], dtype: "float64" }),
      call({ $ndarray: [], shape: [0, 3], dtype: "float64" }),
    );
    expect(result.cases[0]).toMatchObject({ outcome: "returned", value: ["ndarray", "float64", [2, 3]] });
    expect(result.cases[1]).toMatchObject({ outcome: "returned", value: ["ndarray", "float64", [0, 3]] });

    const [doubled, total, mask] = await probe(
      "import numpy as np\ndef double(a):\n    return a * 2\ndef total(a):\n    return a.sum()\ndef mask(a):\n    return a > 2\n",
      [
        one("double", call({ $ndarray: [[1, 2], [3, 4]], dtype: "float64" })),
        one("total", call({ $ndarray: [1.5, 2.5], dtype: "float64" })),
        one("mask", call({ $ndarray: [1, 2, 3, 4], dtype: "int64" })),
      ],
    );
    expect(doubled!.cases[0]).toEqual({
      outcome: "returned",
      pythonType: "ndarray",
      value: { $ndarray: [[2, 4], [6, 8]], dtype: "float64", shape: [2, 2] },
    });
    // a NumPy scalar comes back as a plain number, with its NumPy type name kept
    expect(total!.cases[0]).toEqual({ outcome: "returned", pythonType: "float64", value: 4 });
    expect(mask!.cases[0]).toEqual({
      outcome: "returned",
      pythonType: "ndarray",
      value: { $ndarray: [false, false, true, true], dtype: "bool", shape: [4] },
    });
  });

  it("reports NaN arrays and unsupported dtypes as unsupported results", async (ctx) => {
    requireNumpy(ctx, numpy);
    const result = await returnsOf(
      "import numpy as np\ndef f(mode):\n    if mode == 'nan':\n        return np.array([1.0, np.nan])\n    if mode == 'obj':\n        return np.array(['a', 'b'])\n    return np.array([1, 2], dtype='float16')\n",
      "f",
      call("nan"),
      call("obj"),
      call("f16"),
    );
    expect(result.cases.map((c) => c.outcome)).toEqual(["unsupported", "unsupported", "unsupported"]);
  });

  it("detects an in-place change of an ndarray argument", async (ctx) => {
    requireNumpy(ctx, numpy);
    const [result] = await probe(
      "import numpy as np\ndef bad(a):\n    a[0] = 100\n    return a\ndef good(a):\n    return a.copy()\n",
      [
        one("bad", { args: [{ $ndarray: [1, 2, 3], dtype: "int64" }], checkArgsUnchanged: true }),
        one("good", { args: [{ $ndarray: [1, 2, 3], dtype: "int64" }], checkArgsUnchanged: true }),
      ],
    );
    expect(result!.cases[0]!.argsMutated).toBe(true);
    const [, good] = await probe(
      "import numpy as np\ndef bad(a):\n    a[0] = 100\n    return a\ndef good(a):\n    return a.copy()\n",
      [
        one("bad", { args: [{ $ndarray: [1, 2, 3], dtype: "int64" }], checkArgsUnchanged: true }),
        one("good", { args: [{ $ndarray: [1, 2, 3], dtype: "int64" }], checkArgsUnchanged: true }),
      ],
    );
    expect(good!.cases[0]!.argsMutated).toBe(false);
  });
});
