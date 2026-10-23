import { describe, expect, it } from "vitest";

import type { JsonObject } from "../../src/core/domain";
import {
  DeclarativeGraderCheckType,
  DeclarativeGraderConfigSchema,
  FUNCTION_CASE_LIMITS,
  FunctionCaseOutcome,
  GraderFailureCategory,
  PyValueSchema,
  diffPyValues,
  findPyValueIssue,
  formatPyValue,
  getDeclarativeFunctionProbes,
  gradeDeclaratively,
  pyKindOf,
  type GraderExecutionSnapshot,
} from "../../src/core/grading";
import type { FunctionProbeObservation } from "../../src/core/runtime";
import { toGradingFeedbackModel } from "../../src/features/mission-workspace/grading-feedback/grading-feedback-model";

/**
 * PHASE-08 / M10: the typed values the grader understands beyond M9 - $dataframe, $series and
 * $figure - and the TYPED_VALUE check that grades a learner VARIABLE with exactly the comparison
 * and the wording of a function case. No Python here: the observations are hand-written the
 * way the probe helper encodes them (tests/python-foundations/m10-missions.test.ts runs the
 * whole thing on real Pyodide).
 */

const frame = (columns: string[], data: unknown[][], extra: Record<string, unknown> = {}) => ({ $dataframe: { columns, data, ...extra } }) as never;
const series = (data: unknown[], extra: Record<string, unknown> = {}) => ({ $series: { data, ...extra } }) as never;
const figure = (payload: Record<string, unknown>) => ({ $figure: payload }) as never;

describe("typed JSON values: validation", () => {
  it("recognises the three new kinds", () => {
    expect(pyKindOf(frame(["a"], [[1]]))).toBe("dataframe");
    expect(pyKindOf(series([1, 2]))).toBe("series");
    expect(pyKindOf(figure({ title: true }))).toBe("figure");
  });

  it("accepts well-formed payloads", () => {
    for (const value of [
      frame(["a", "b"], [[1, "x"], [2, null]], { index: [10, 20], indexName: "k", dtypes: { a: "int64", b: "str" } }),
      series([1.5, 2.5], { index: ["u", "v"], name: "s", dtype: "float64" }),
      figure({ title: "T", xlabel: true, legend: ["A"], series: [{ kind: "line", x: [1, 2], y: [3, 4], label: "A" }] }),
    ]) {
      expect(findPyValueIssue(value)).toBeNull();
      expect(PyValueSchema.safeParse(value).success).toBe(true);
    }
  });

  it.each([
    ["no columns", frame([], [])],
    ["duplicate columns", frame(["a", "a"], [[1, 2]])],
    ["ragged row", frame(["a", "b"], [[1]])],
    ["index of the wrong length", frame(["a"], [[1], [2]], { index: [1] })],
    ["dtype for an unknown column", frame(["a"], [[1]], { dtypes: { z: "int64" } })],
    ["unsupported dtype", frame(["a"], [[1]], { dtypes: { a: "datetime64" } })],
    ["unknown key", frame(["a"], [[1]], { extra: 1 })],
    ["NaN cell", frame(["a"], [[Number.NaN]])],
    ["series with an unsupported dtype", series([1], { dtype: "complex" })],
    ["series index of the wrong length", series([1, 2], { index: [1] })],
    ["unknown figure series kind", figure({ series: [{ kind: "pie", x: [1], y: [1] }] })],
    ["figure x/y of different length", figure({ series: [{ kind: "line", x: [1, 2], y: [1] }] })],
    ["figure title that is a number", figure({ title: 3 })],
    ["figure legend that is a number", figure({ legend: 3 })],
  ])("rejects %s", (_name, value) => {
    expect(findPyValueIssue(value)).not.toBeNull();
    expect(PyValueSchema.safeParse(value).success).toBe(false);
  });

  it("keeps tables and figures inside the documented size limits", () => {
    const tooManyRows = frame(["a"], Array.from({ length: FUNCTION_CASE_LIMITS.maxTableRows + 1 }, () => [1]));
    expect(findPyValueIssue(tooManyRows)).not.toBeNull();
    const tooManyColumns = frame(
      Array.from({ length: FUNCTION_CASE_LIMITS.maxTableColumns + 1 }, (_, index) => `c${index}`),
      [],
    );
    expect(findPyValueIssue(tooManyColumns)).not.toBeNull();
    const tooManySeries = figure({
      series: Array.from({ length: FUNCTION_CASE_LIMITS.maxFigureSeries + 1 }, () => ({ kind: "line", x: [1], y: [1] })),
    });
    expect(findPyValueIssue(tooManySeries)).not.toBeNull();
  });
});

describe("typed JSON values: comparison (the kind of mistake is reported, not just 'wrong')", () => {
  const expected = frame(["id", "name"], [[1, "a"], [2, "b"]], { index: [0, 1], indexName: null, dtypes: { id: "int64", name: "str" } });

  it("equal frames compare equal (and a float tolerance applies to cells)", () => {
    expect(diffPyValues(expected, expected)).toBeNull();
    const near = frame(["x"], [[0.1 + 0.2]], { index: [0], dtypes: { x: "float64" } });
    const exact = frame(["x"], [[0.3]], { index: [0], dtypes: { x: "float64" } });
    expect(diffPyValues(near, exact, 0)).not.toBeNull();
    expect(diffPyValues(near, exact, 1e-9)).toBeNull();
  });

  it("separates TYPE, COLUMNS, SHAPE, INDEX, DTYPE and VALUE for a DataFrame", () => {
    expect(diffPyValues(series([1, 2]), expected)?.mismatch).toBe("TYPE");
    expect(diffPyValues(frame(["name", "id"], [["a", 1], ["b", 2]], { index: [0, 1] }), expected)?.mismatch).toBe("COLUMNS");
    expect(diffPyValues(frame(["id", "name"], [[1, "a"]], { index: [0] }), expected)?.mismatch).toBe("SHAPE");
    expect(diffPyValues(frame(["id", "name"], [[1, "a"], [2, "b"]], { index: [5, 6] }), expected)?.mismatch).toBe("INDEX");
    expect(diffPyValues(frame(["id", "name"], [[1, "a"], [2, "b"]], { index: [0, 1], indexName: "k" }), expected)?.mismatch).toBe("INDEX");
    expect(
      diffPyValues(frame(["id", "name"], [[1, "a"], [2, "b"]], { index: [0, 1], indexName: null, dtypes: { id: "float64", name: "str" } }), expected),
    ).toMatchObject({ mismatch: "DTYPE" });
    expect(diffPyValues(frame(["id", "name"], [[1, "a"], [2, "z"]], { index: [0, 1], indexName: null, dtypes: { id: "int64", name: "str" } }), expected)).toMatchObject({
      mismatch: "VALUE",
    });
  });

  it("explains a DataFrame mistake without printing the expected cell values", () => {
    const secret = frame(["code"], [["TOP-SECRET-42"]], { index: [0] });
    const wrong = frame(["code"], [["nope"]], { index: [0] });
    const difference = diffPyValues(wrong, secret)!;
    expect(difference.mismatch).toBe("VALUE");
    expect(JSON.stringify(difference)).not.toContain("TOP-SECRET-42");
  });

  it("compares a Series by length, name, index, dtype and then value", () => {
    const want = series([1.5, 2.5], { index: ["a", "b"], name: "share", dtype: "float64" });
    expect(diffPyValues(want, want)).toBeNull();
    expect(diffPyValues(series([1.5], { index: ["a"], name: "share", dtype: "float64" }), want)?.mismatch).toBe("SHAPE");
    expect(diffPyValues(series([1.5, 2.5], { index: ["a", "b"], name: "other", dtype: "float64" }), want)?.mismatch).toBe("COLUMNS");
    expect(diffPyValues(series([1.5, 2.5], { index: ["b", "a"], name: "share", dtype: "float64" }), want)?.mismatch).toBe("INDEX");
    expect(diffPyValues(series([1.5, 2.5], { index: ["a", "b"], name: "share", dtype: "int64" }), want)?.mismatch).toBe("DTYPE");
    expect(diffPyValues(series([1.5, 9.5], { index: ["a", "b"], name: "share", dtype: "float64" }), want)?.mismatch).toBe("VALUE");
  });

  it("grades figure PROPERTIES: blank text, series count, kind, label, data and legend", () => {
    const want = figure({
      title: true,
      xlabel: "Tháng",
      ylabel: true,
      legend: ["Doanh thu"],
      series: [{ kind: "line", x: [1, 2], y: [3, 4], label: "Doanh thu" }],
    });
    const good = figure({
      title: "Bất kỳ tiêu đề nào",
      xlabel: " Tháng ",
      ylabel: "Triệu đồng",
      legend: ["Doanh thu"],
      series: [{ kind: "line", x: [1, 2], y: [3, 4], label: "Doanh thu" }],
    });
    expect(diffPyValues(good, want)).toBeNull();

    const base = {
      title: "T",
      xlabel: "Tháng",
      ylabel: "Y",
      legend: ["Doanh thu"],
      series: [{ kind: "line", x: [1, 2], y: [3, 4], label: "Doanh thu" }],
    };
    const variant = (patch: Record<string, unknown>) => figure({ ...base, ...patch });
    const mismatchOf = (patch: Record<string, unknown>) => diffPyValues(variant(patch), want);

    expect(mismatchOf({ title: "   " })?.mismatch).toBe("FIGURE");
    expect(mismatchOf({ title: "   " })?.detail).toContain("trống");
    expect(mismatchOf({ xlabel: "Năm" })).toMatchObject({ mismatch: "FIGURE" });
    expect(mismatchOf({ legend: [] })?.mismatch).toBe("FIGURE");
    expect(mismatchOf({ legend: [] })?.detail).toContain("chú giải");
    expect(mismatchOf({ series: [] })).toMatchObject({ mismatch: "FIGURE" });
    expect(mismatchOf({ series: [{ kind: "bar", x: [1, 2], y: [3, 4], label: "Doanh thu" }] })?.mismatch).toBe("FIGURE");
    expect(mismatchOf({ series: [{ kind: "bar", x: [1, 2], y: [3, 4], label: "Doanh thu" }] })?.detail).toContain("bar");
    expect(mismatchOf({ series: [{ kind: "line", x: [1, 2], y: [3, 4], label: "Chi phí" }] })?.mismatch).toBe("FIGURE");
    expect(mismatchOf({ series: [{ kind: "line", x: [1, 2], y: [3, 4], label: "Chi phí" }] })?.detail).toContain("Chi phí");
    expect(mismatchOf({ series: [{ kind: "line", x: [2, 1], y: [3, 4], label: "Doanh thu" }] })).toMatchObject({ mismatch: "FIGURE" });
    expect(mismatchOf({ series: [{ kind: "line", x: [1, 2], y: [4, 3], label: "Doanh thu" }] })).toMatchObject({ mismatch: "FIGURE" });
  });

  it("formats typed values like Python, clipped, and never throws on them", () => {
    expect(formatPyValue(frame(["a"], [[1]], { index: [0] }))).toBe("DataFrame(columns=['a'], rows=[[1]], index=[0])");
    expect(formatPyValue(series([1, 2], { name: "s" }))).toContain("Series([1, 2]");
    expect(formatPyValue(figure({ title: "T", series: [{ kind: "bar", x: ["a"], y: [1] }] }))).toContain("bar(x=['a'], y=[1])");
    expect(formatPyValue(frame(["a"], Array.from({ length: 150 }, () => [1])), 40).length).toBeLessThanOrEqual(40);
  });
});

describe("TYPED_VALUE", () => {
  const typed = (variable: string, expected: unknown, extra: Record<string, unknown> = {}): JsonObject =>
    ({ type: "TYPED_VALUE", variable, expected, ...extra }) as JsonObject;
  const config = (...checks: JsonObject[]): JsonObject => ({ checks: [{ type: "NO_EXCEPTION" }, ...checks] });

  const valueObservation = (name: string, value: unknown, pythonType: string): FunctionProbeObservation => ({
    function: name,
    status: "OK",
    cases: [{ outcome: "returned", pythonType, value: value as never }],
  });
  const snapshot = (functions: FunctionProbeObservation[], exception?: { type: string; message: string }): GraderExecutionSnapshot => ({
    variables: {},
    functions,
    ...(exception !== undefined ? { exception } : {}),
  });

  const want = frame(["a"], [[1], [2]], { index: [0, 1], dtypes: { a: "int64" } });

  it("is part of the declarative check types, next to the older ones", () => {
    expect(DeclarativeGraderCheckType.TYPED_VALUE).toBe("TYPED_VALUE");
    expect(Object.values(DeclarativeGraderCheckType)).toEqual(expect.arrayContaining(["EXACT_VALUES", "FUNCTION_CASES", "TYPED_VALUE"]));
  });

  it("validates the schema: one check per variable, at most eight, a valid typed expected value", () => {
    expect(DeclarativeGraderConfigSchema.safeParse(config(typed("df", want))).success).toBe(true);
    expect(DeclarativeGraderConfigSchema.safeParse(config(typed("df", want), typed("df", want))).success).toBe(false);
    const nine = Array.from({ length: 9 }, (_, index) => typed(`v${index}`, 1));
    expect(DeclarativeGraderConfigSchema.safeParse(config(...nine)).success).toBe(false);
    const eight = Array.from({ length: 8 }, (_, index) => typed(`v${index}`, 1));
    expect(DeclarativeGraderConfigSchema.safeParse(config(...eight)).success).toBe(true);
    expect(DeclarativeGraderConfigSchema.safeParse(config(typed("df", frame([], [])))).success).toBe(false);
    expect(DeclarativeGraderConfigSchema.safeParse(config(typed("not a name", want))).success).toBe(false);
  });

  it("plans one value probe per check, in order, and shares the probe numbering with FUNCTION_CASES", () => {
    const parsed = (
      config(
        { type: "FUNCTION_CASES", function: "f", cases: [{ id: "x", label: "x", visibility: "example", args: [1], expect: { kind: "RETURNS", value: 1 } }] } as JsonObject,
        typed("df", want),
        typed("n", 3),
      )
    );
    const probes = getDeclarativeFunctionProbes(parsed);
    expect(probes.map((probe) => [probe.function, probe.mode ?? "call"])).toEqual([
      ["f", "call"],
      ["df", "value"],
      ["n", "value"],
    ]);
    expect(probes[1]!.cases).toEqual([{ args: [] }]);
    // The probe carries no expected value: nothing in the Python namespace can read it.
    expect(JSON.stringify(probes)).not.toContain('"a"');
  });

  it("passes when the variable has the expected typed value", () => {
    const result = gradeDeclaratively(config(typed("df", want)), snapshot([valueObservation("df", want, "DataFrame")]));
    expect(result.passed).toBe(true);
  });

  it("fails with the SAME wording as a function case, and with a TYPE/SHAPE/VALUE category", () => {
    const wrongColumns = frame(["b"], [[1], [2]], { index: [0, 1], dtypes: { b: "int64" } });
    const result = gradeDeclaratively(config(typed("df", want)), snapshot([valueObservation("df", wrongColumns, "DataFrame")]));
    expect(result.passed).toBe(false);
    const check = result.checks.find((entry) => entry.type === "TYPED_VALUE")!;
    expect(check).toMatchObject({ variable: "df", passed: false });
    expect(check.cases![0]).toMatchObject({ outcome: FunctionCaseOutcome.WRONG_COLUMNS, category: GraderFailureCategory.SHAPE_ERROR });
    // The expected frame is hidden: the learner is told what is wrong, not what the answer is.
    expect(check.cases![0]!.expectedText).toBeUndefined();
  });

  it("reveals the expected value only when the check says so", () => {
    const wrong = frame(["a"], [[9], [9]], { index: [0, 1], dtypes: { a: "int64" } });
    const hidden = gradeDeclaratively(config(typed("df", want)), snapshot([valueObservation("df", wrong, "DataFrame")]));
    const shown = gradeDeclaratively(config(typed("df", want, { reveal: true })), snapshot([valueObservation("df", wrong, "DataFrame")]));
    expect(hidden.checks.find((entry) => entry.type === "TYPED_VALUE")!.cases![0]!.expectedText).toBeUndefined();
    expect(shown.checks.find((entry) => entry.type === "TYPED_VALUE")!.cases![0]!.expectedText).toBeDefined();
  });

  it("reports a missing variable as MISSING_VARIABLE and a crashed program as RUNTIME_ERROR", () => {
    const missing = gradeDeclaratively(
      config(typed("df", want)),
      snapshot([{ function: "df", status: "MISSING", cases: [] }]),
    );
    expect(missing.checks.find((entry) => entry.type === "TYPED_VALUE")).toMatchObject({ passed: false, category: GraderFailureCategory.MISSING_VARIABLE });
    const crashed = gradeDeclaratively(config(typed("df", want)), snapshot([], { type: "ValueError", message: "boom" }));
    expect(crashed.checks.find((entry) => entry.type === "TYPED_VALUE")).toMatchObject({ passed: false, category: GraderFailureCategory.RUNTIME_ERROR });
  });

  it("enforces an expected Python type (returnType) before comparing values", () => {
    const check = typed("ax", figure({ title: true }), { returnType: "Axes" });
    const ok = gradeDeclaratively(config(check), snapshot([valueObservation("ax", figure({ title: "T" }), "Axes")]));
    expect(ok.passed).toBe(true);
    const wrongType = gradeDeclaratively(config(check), snapshot([valueObservation("ax", figure({ title: "T" }), "AxesSubplot")]));
    expect(wrongType.passed).toBe(false);
    expect(wrongType.checks.find((entry) => entry.type === "TYPED_VALUE")!.cases![0]!.outcome).toBe(FunctionCaseOutcome.WRONG_TYPE);
  });

  it("is rendered by the feedback model in Vietnamese, per kind of mistake", () => {
    const cases: Array<[unknown, string]> = [
      [frame(["b"], [[1], [2]], { index: [0, 1], dtypes: { b: "int64" } }), "cột"],
      [frame(["a"], [[1]], { index: [0], dtypes: { a: "int64" } }), "hàng"],
      [frame(["a"], [[1], [2]], { index: [3, 4], dtypes: { a: "int64" } }), "index"],
      [frame(["a"], [[1], [2]], { index: [0, 1], dtypes: { a: "float64" } }), "dtype"],
    ];
    for (const [actual, word] of cases) {
      const result = gradeDeclaratively(config(typed("df", want)), snapshot([valueObservation("df", actual, "DataFrame")]));
      const model = toGradingFeedbackModel(result);
      const text = JSON.stringify(model);
      expect(text.toLowerCase(), word).toContain(word.toLowerCase());
      expect(text).not.toContain("WRONG_");
    }
  });
});
