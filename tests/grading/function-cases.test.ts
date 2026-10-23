import { describe, expect, it } from "vitest";

import {
  DeclarativeGraderCheckType,
  DeclarativeGraderConfigSchema,
  FUNCTION_CASE_LIMITS,
  FunctionCaseOutcome,
  GraderFailureCategory,
  comparePyValues,
  findPyValueIssue,
  formatPyValue,
  getDeclarativeFunctionProbes,
  getDeclarativeObservationVariables,
  gradeDeclaratively,
  type GraderExecutionSnapshot,
  type GraderResult,
} from "../../src/core/grading";
import type { JsonObject } from "../../src/core/domain";
import type { FunctionProbeObservation } from "../../src/core/runtime";
import { toGradingFeedbackModel } from "../../src/features/mission-workspace/grading-feedback/grading-feedback-model";

// A small, realistic check: total(values) -> number.
function totalCheck(overrides: Partial<Record<string, unknown>> = {}): JsonObject {
  return {
    type: "FUNCTION_CASES",
    function: "total",
    cases: [
      { id: "example", label: "Ví dụ trong đề", visibility: "example", args: [[1, 2, 3]], expect: { kind: "RETURNS", value: 6 } },
      { id: "empty", label: "Danh sách rỗng", args: [[]], expect: { kind: "RETURNS", value: 0 } },
      { id: "negative", label: "Có số âm", args: [[5, -2]], expect: { kind: "RETURNS", value: 3 } },
    ],
    ...overrides,
  } as JsonObject;
}

const config = (...checks: JsonObject[]): JsonObject => ({ checks: [{ type: "NO_EXCEPTION" }, ...checks] });

function returned(value: unknown, pythonType = "int") {
  return { outcome: "returned" as const, pythonType, value: value as never };
}

function observation(cases: FunctionProbeObservation["cases"], status: FunctionProbeObservation["status"] = "OK", name = "total"): FunctionProbeObservation {
  return { function: name, status, cases };
}

function snapshot(functions: readonly FunctionProbeObservation[] | undefined, exception?: { type: string; message: string }): GraderExecutionSnapshot {
  return { variables: {}, ...(functions !== undefined ? { functions } : {}), ...(exception !== undefined ? { exception } : {}) };
}

function caseOf(result: GraderResult, id: string) {
  const check = result.checks.find((entry) => entry.type === "FUNCTION_CASES")!;
  return check.cases!.find((entry) => entry.id === id)!;
}

describe("FUNCTION_CASES schema", () => {
  it("accepts a well-formed check and keeps the old check types working next to it", () => {
    const parsed = DeclarativeGraderConfigSchema.parse(
      config(totalCheck(), { type: "EXACT_VALUES", variable: "answer", expected: 3 }),
    );
    expect(parsed.checks).toHaveLength(3);
    // The pre-M9 variable plan is untouched by the new check type.
    expect(getDeclarativeObservationVariables(config(totalCheck(), { type: "EXACT_VALUES", variable: "answer", expected: 3 }))).toEqual(["answer"]);
  });

  it("an M8-style config (no FUNCTION_CASES) parses and plans exactly as before", () => {
    const old = { checks: [{ type: "NO_EXCEPTION" }, { type: "SHAPE", variable: "a", expected: [2, 3] }] } as JsonObject;
    expect(DeclarativeGraderConfigSchema.safeParse(old).success).toBe(true);
    expect(getDeclarativeFunctionProbes(old)).toEqual([]);
    expect(getDeclarativeObservationVariables(old)).toEqual(["a"]);
  });

  it.each([
    ["a non-identifier function name", totalCheck({ function: "total(); import os" })],
    ["a reserved function name", totalCheck({ function: "__runtime_collect" })],
    ["no cases", totalCheck({ cases: [] })],
    ["an unknown field on the check", totalCheck({ extra: true })],
    [
      "duplicate case ids",
      totalCheck({
        cases: [
          { id: "a", label: "A", args: [[1]], expect: { kind: "RETURNS", value: 1 } },
          { id: "a", label: "B", args: [[2]], expect: { kind: "RETURNS", value: 2 } },
        ],
      }),
    ],
    ["an unknown expectation kind", totalCheck({ cases: [{ id: "a", label: "A", args: [], expect: { kind: "EVAL", value: "1+1" } }] })],
    ["an unknown wrapper key", totalCheck({ cases: [{ id: "a", label: "A", args: [{ $import: "os" }], expect: { kind: "RETURNS", value: 1 } }] })],
    ["a ragged ndarray", totalCheck({ cases: [{ id: "a", label: "A", args: [{ $ndarray: [[1, 2], [3]] }], expect: { kind: "RETURNS", value: 1 } }] })],
    ["an unsupported dtype", totalCheck({ cases: [{ id: "a", label: "A", args: [{ $ndarray: [1], dtype: "object" }], expect: { kind: "RETURNS", value: 1 } }] })],
    ["a set of lists", totalCheck({ cases: [{ id: "a", label: "A", args: [{ $set: [[1]] }], expect: { kind: "RETURNS", value: 1 } }] })],
    ["a label that is blank", totalCheck({ cases: [{ id: "a", label: "  ", args: [], expect: { kind: "RETURNS", value: 1 } }] })],
    ["a keyword argument with a bad name", totalCheck({ cases: [{ id: "a", label: "A", args: [], kwargs: { "x y": 1 }, expect: { kind: "RETURNS", value: 1 } }] })],
    ["too many arguments", totalCheck({ cases: [{ id: "a", label: "A", args: Array.from({ length: FUNCTION_CASE_LIMITS.maxArguments + 1 }, () => 1), expect: { kind: "RETURNS", value: 1 } }] })],
    ["too many cases", totalCheck({ cases: Array.from({ length: FUNCTION_CASE_LIMITS.maxCasesPerCheck + 1 }, (_, index) => ({ id: `c${index}`, label: `C${index}`, args: [], expect: { kind: "RETURNS", value: 1 } })) })],
  ])("rejects %s", (_name, check) => {
    expect(DeclarativeGraderConfigSchema.safeParse(config(check)).success).toBe(false);
  });

  it("rejects two FUNCTION_CASES checks for the same function", () => {
    expect(DeclarativeGraderConfigSchema.safeParse(config(totalCheck(), totalCheck())).success).toBe(false);
  });

  it("accepts every typed wrapper", () => {
    for (const value of [{ $tuple: [1, "a"] }, { $set: [1, 2, { $tuple: [3, 4] }] }, { $float: 2 }, { $ndarray: [[1, 2], [3, 4]], dtype: "float64" }, { $ndarray: [], shape: [0, 3], dtype: "float64" }, { $ndarray: 5 }]) {
      expect(findPyValueIssue(value as never), JSON.stringify(value)).toBeNull();
    }
  });
});

describe("comparePyValues", () => {
  const same = (a: unknown, b: unknown, tolerance = 0) => comparePyValues(a as never, b as never, tolerance);

  it("compares scalars, lists and dicts structurally (dict key order does not matter)", () => {
    expect(same(3, 3)).toBeNull();
    expect(same([1, [2, 3]], [1, [2, 3]])).toBeNull();
    expect(same({ a: 1, b: [2] }, { b: [2], a: 1 })).toBeNull();
    expect(same([1, 2], [2, 1])).toBe("VALUE");
    expect(same({ a: 1 }, { a: 1, b: 2 })).toBe("VALUE");
  });

  it("separates a different TYPE from a different VALUE", () => {
    expect(same([1, 2], { $tuple: [1, 2] })).toBe("TYPE");
    expect(same("3", 3)).toBe("TYPE");
    expect(same(true, 1)).toBe("TYPE");
    expect(same(null, 0)).toBe("TYPE");
    expect(same([1, true], [1, 1])).toBe("VALUE");
  });

  it("treats a set as unordered and a tuple as ordered", () => {
    expect(same({ $set: [1, 2, 3] }, { $set: [3, 1, 2] })).toBeNull();
    expect(same({ $set: [1, 2] }, { $set: [1, 2, 3] })).toBe("VALUE");
    expect(same({ $tuple: [1, 2] }, { $tuple: [2, 1] })).toBe("VALUE");
  });

  it("applies the absolute tolerance to number leaves only", () => {
    expect(same(0.30000000000000004, 0.3)).toBe("VALUE");
    expect(same(0.30000000000000004, 0.3, 1e-9)).toBeNull();
    expect(same([1.0000001, 2], [1, 2], 1e-6)).toBeNull();
    expect(same(["a"], ["b"], 5)).toBe("VALUE");
  });

  it("compares ndarrays by shape, then dtype, then values", () => {
    const a = { $ndarray: [[1, 2], [3, 4]], dtype: "float64", shape: [2, 2] };
    expect(same(a, { $ndarray: [[1, 2], [3, 4]], dtype: "float64" })).toBeNull();
    expect(same(a, { $ndarray: [1, 2, 3, 4], dtype: "float64" })).toBe("SHAPE");
    expect(same(a, { $ndarray: [[1, 2], [3, 4]], dtype: "int64" })).toBe("DTYPE");
    expect(same(a, { $ndarray: [[1, 2], [3, 5]], dtype: "float64" })).toBe("VALUE");
    expect(same(a, [[1, 2], [3, 4]])).toBe("TYPE");
    // dtype is only compared when the expectation names one.
    expect(same(a, { $ndarray: [[1, 2], [3, 4]] })).toBeNull();
  });
});

describe("formatPyValue", () => {
  it("prints Python-looking values and clips long ones", () => {
    expect(formatPyValue([1, "a", null, true, 2.5])).toBe("[1, 'a', None, True, 2.5]");
    expect(formatPyValue({ $tuple: [1] } as never)).toBe("(1,)");
    expect(formatPyValue({ $set: [] } as never)).toBe("set()");
    expect(formatPyValue({ $float: 2 } as never)).toBe("2.0");
    expect(formatPyValue({ x: [1] })).toBe("{'x': [1]}");
    expect(formatPyValue({ $ndarray: [1, 2] } as never)).toBe("array([1, 2])");
    expect(formatPyValue(Array.from({ length: 200 }, (_, i) => i), 40).length).toBe(40);
  });
});

describe("getDeclarativeFunctionProbes", () => {
  it("exposes only the function name and the arguments - never an expectation, a label or an id", () => {
    const probes = getDeclarativeFunctionProbes(
      config(
        totalCheck({
          cases: [
            { id: "secret-id", label: "Nhãn bí mật", args: [[1, 2]], kwargs: { start: 5 }, argsUnchanged: true, expect: { kind: "RETURNS", value: 987654 } },
            { id: "b", label: "B", args: [[]], expect: { kind: "RAISES", exception: "ValueError" } },
          ],
        }),
      ),
    );
    expect(probes).toEqual([
      {
        function: "total",
        cases: [
          { args: [[1, 2]], kwargs: { start: 5 }, checkArgsUnchanged: true },
          { args: [[]] },
        ],
      },
    ]);
    const text = JSON.stringify(probes);
    for (const secret of ["987654", "secret-id", "Nhãn bí mật", "ValueError", "RETURNS", "RAISES"]) {
      expect(text).not.toContain(secret);
    }
  });
});

describe("grading FUNCTION_CASES results", () => {
  const cfg = config(totalCheck());

  it("passes when every case matches", () => {
    const result = gradeDeclaratively(cfg, snapshot([observation([returned(6), returned(0), returned(3)])]));
    expect(result.passed).toBe(true);
    expect(result.checks.every((check) => check.passed)).toBe(true);
  });

  it("names the case that failed and says it was a WRONG VALUE (not an exception)", () => {
    const result = gradeDeclaratively(cfg, snapshot([observation([returned(6), returned(0), returned(7)])]));
    expect(result.passed).toBe(false);
    const failed = caseOf(result, "negative");
    expect(failed).toMatchObject({ passed: false, outcome: FunctionCaseOutcome.WRONG_VALUE, category: GraderFailureCategory.VALUE_ERROR, actualText: "7", call: "total([5, -2])" });
    expect(caseOf(result, "example").passed).toBe(true);
    const check = result.checks.find((entry) => entry.type === "FUNCTION_CASES")!;
    expect(check.function).toBe("total");
    expect(check.category).toBe(GraderFailureCategory.VALUE_ERROR);
    expect(check.message).toContain("2/3");
  });

  it("distinguishes an exception inside the function from a wrong value", () => {
    const result = gradeDeclaratively(
      cfg,
      snapshot([
        observation([
          returned(6),
          { outcome: "raised", exceptionType: "TypeError", exceptionMro: ["TypeError", "Exception", "BaseException"], message: "unsupported operand" },
          returned(99),
        ]),
      ]),
    );
    expect(caseOf(result, "empty")).toMatchObject({ outcome: FunctionCaseOutcome.RAISED, category: GraderFailureCategory.RUNTIME_ERROR, exceptionType: "TypeError", message: "unsupported operand" });
    expect(caseOf(result, "negative").outcome).toBe(FunctionCaseOutcome.WRONG_VALUE);
  });

  it("reports a wrong RETURN TYPE and honors an explicit returnType", () => {
    const typed = config(
      totalCheck({ cases: [{ id: "t", label: "Kiểu", args: [[1, 2]], expect: { kind: "RETURNS", value: 3, returnType: "int" } }] }),
    );
    expect(gradeDeclaratively(typed, snapshot([observation([returned(3, "int")])])).passed).toBe(true);
    const wrong = gradeDeclaratively(typed, snapshot([observation([returned(3, "float")])]));
    expect(caseOf(wrong, "t")).toMatchObject({ outcome: FunctionCaseOutcome.WRONG_TYPE, category: GraderFailureCategory.TYPE_ERROR, actualType: "float" });
    const asString = gradeDeclaratively(cfg, snapshot([observation([returned("6", "str"), returned(0), returned(3)])]));
    expect(caseOf(asString, "example")).toMatchObject({ outcome: FunctionCaseOutcome.WRONG_TYPE });
  });

  it("reports a wrong ndarray shape separately from a wrong ndarray value", () => {
    const arrays = config({
      type: "FUNCTION_CASES",
      function: "double",
      cases: [{ id: "a", label: "Mảng 2x2", args: [{ $ndarray: [[1, 2], [3, 4]], dtype: "float64" }], expect: { kind: "RETURNS", value: { $ndarray: [[2, 4], [6, 8]], dtype: "float64" } } }],
    });
    const ok = { outcome: "returned" as const, pythonType: "ndarray", value: { $ndarray: [[2, 4], [6, 8]], dtype: "float64", shape: [2, 2] } };
    expect(gradeDeclaratively(arrays, snapshot([observation([ok], "OK", "double")])).passed).toBe(true);
    const flat = { ...ok, value: { $ndarray: [2, 4, 6, 8], dtype: "float64", shape: [4] } };
    expect(caseOf(gradeDeclaratively(arrays, snapshot([observation([flat], "OK", "double")])), "a")).toMatchObject({ outcome: FunctionCaseOutcome.WRONG_SHAPE, category: GraderFailureCategory.SHAPE_ERROR });
    const ints = { ...ok, value: { $ndarray: [[2, 4], [6, 8]], dtype: "int64", shape: [2, 2] } };
    expect(caseOf(gradeDeclaratively(arrays, snapshot([observation([ints], "OK", "double")])), "a")).toMatchObject({ outcome: FunctionCaseOutcome.WRONG_DTYPE, category: GraderFailureCategory.TYPE_ERROR });
    const wrongValue = { ...ok, value: { $ndarray: [[2, 4], [6, 9]], dtype: "float64", shape: [2, 2] } };
    expect(caseOf(gradeDeclaratively(arrays, snapshot([observation([wrongValue], "OK", "double")])), "a").outcome).toBe(FunctionCaseOutcome.WRONG_VALUE);
  });

  it("supports expecting an exception (and accepts a subclass of it)", () => {
    const raises = config({
      type: "FUNCTION_CASES",
      function: "parse",
      cases: [
        { id: "bad", label: "Chuỗi không phải số", args: ["abc"], expect: { kind: "RAISES", exception: "ValueError" } },
        { id: "fine", label: "Chuỗi hợp lệ", args: ["12"], expect: { kind: "RETURNS", value: 12 } },
      ],
    });
    const subclass = { outcome: "raised" as const, exceptionType: "UnicodeError", exceptionMro: ["UnicodeError", "ValueError", "Exception", "BaseException"], message: "x" };
    expect(gradeDeclaratively(raises, snapshot([observation([subclass, returned(12)], "OK", "parse")])).passed).toBe(true);
    const other = { outcome: "raised" as const, exceptionType: "KeyError", exceptionMro: ["KeyError", "LookupError", "Exception", "BaseException"], message: "k" };
    expect(caseOf(gradeDeclaratively(raises, snapshot([observation([other, returned(12)], "OK", "parse")])), "bad")).toMatchObject({ outcome: FunctionCaseOutcome.WRONG_EXCEPTION, exceptionType: "KeyError" });
    expect(caseOf(gradeDeclaratively(raises, snapshot([observation([returned(0), returned(12)], "OK", "parse")])), "bad").outcome).toBe(FunctionCaseOutcome.NO_EXCEPTION_RAISED);
  });

  it("fails a case whose function modified its arguments when argsUnchanged is requested (and fails closed when unreported)", () => {
    const pure = config(totalCheck({ cases: [{ id: "p", label: "Không sửa đầu vào", args: [[3, 1, 2]], argsUnchanged: true, expect: { kind: "RETURNS", value: [1, 2, 3] } }] }));
    const sorted = { outcome: "returned" as const, pythonType: "list", value: [1, 2, 3] };
    expect(gradeDeclaratively(pure, snapshot([observation([{ ...sorted, argsMutated: false }])])).passed).toBe(true);
    expect(caseOf(gradeDeclaratively(pure, snapshot([observation([{ ...sorted, argsMutated: true }])])), "p")).toMatchObject({ outcome: FunctionCaseOutcome.ARGS_MUTATED });
    expect(gradeDeclaratively(pure, snapshot([observation([sorted])])).passed).toBe(false);
  });

  it("reports missing / non-callable functions and unsupported results without per-case rows", () => {
    const missing = gradeDeclaratively(cfg, snapshot([observation([], "MISSING")]));
    expect(missing.checks.find((c) => c.type === "FUNCTION_CASES")).toMatchObject({ passed: false, category: GraderFailureCategory.MISSING_VARIABLE });
    const notCallable = gradeDeclaratively(cfg, snapshot([observation([], "NOT_CALLABLE")]));
    expect(notCallable.checks.find((c) => c.type === "FUNCTION_CASES")).toMatchObject({ passed: false, category: GraderFailureCategory.TYPE_ERROR });
    const unsupported = gradeDeclaratively(cfg, snapshot([observation([{ outcome: "unsupported", pythonType: "generator", reason: "kiểu generator chưa được hỗ trợ" }, returned(0), returned(3)])]));
    expect(caseOf(unsupported, "example")).toMatchObject({ outcome: FunctionCaseOutcome.UNSUPPORTED_RESULT, actualType: "generator" });
  });

  it("when the program itself raised, the function check fails as a RUNTIME_ERROR and NO_EXCEPTION owns the message", () => {
    const result = gradeDeclaratively(cfg, snapshot(undefined, { type: "NameError", message: "name 'x' is not defined" }));
    expect(result.passed).toBe(false);
    expect(result.checks.find((c) => c.type === "FUNCTION_CASES")).toMatchObject({ passed: false, category: GraderFailureCategory.RUNTIME_ERROR });
    expect(result.runtimeError).toMatchObject({ type: "NameError" });
  });

  it("rejects a snapshot that does not match the config instead of guessing", () => {
    expect(() => gradeDeclaratively(cfg, snapshot(undefined))).toThrow();
    expect(() => gradeDeclaratively(cfg, snapshot([observation([returned(6)])]))).toThrow();
    expect(() => gradeDeclaratively(cfg, snapshot([observation([returned(6), returned(0), returned(3)], "OK", "other_name")]))).toThrow();
  });

  it("NEVER puts the expected value of a hidden case into the result; an example case may show it", () => {
    const secret = config(
      totalCheck({
        cases: [
          { id: "shown", label: "Ví dụ", visibility: "example", args: [[1]], expect: { kind: "RETURNS", value: 4242 } },
          { id: "hid", label: "Ẩn", visibility: "hidden", args: [[2]], expect: { kind: "RETURNS", value: 13579 } },
          { id: "dflt", label: "Mặc định", args: [[3]], expect: { kind: "RETURNS", value: 24680 } },
        ],
      }),
    );
    const result = gradeDeclaratively(secret, snapshot([observation([returned(0), returned(0), returned(0)])]));
    const text = JSON.stringify(result);
    expect(text).toContain("4242");
    expect(text).not.toContain("13579");
    expect(text).not.toContain("24680");
    expect(caseOf(result, "shown").expectedText).toBe("4242");
    expect(caseOf(result, "hid").expectedText).toBeUndefined();
    expect(caseOf(result, "dflt").expectedText).toBeUndefined();
  });
});

describe("feedback for FUNCTION_CASES", () => {
  const cfg = config(totalCheck());

  it("lists every case, explains the first failure, and shows the expected value only for an example case", () => {
    const result = gradeDeclaratively(cfg, snapshot([observation([returned(5), returned(0), returned(7)])]));
    const feedback = toGradingFeedbackModel(result);
    expect(feedback.passed).toBe(false);
    expect(feedback.items).toHaveLength(1);
    const item = feedback.items[0]!;
    expect(item.kind).toBe("function");
    expect(item.title).toContain("1/3");
    expect(item.detail).toContain("Ví dụ trong đề");
    expect(item.expected).toBe("6");
    expect(item.actual).toBe("5");
    expect(item.cases).toEqual([
      { label: "Ví dụ trong đề", passed: false },
      { label: "Danh sách rỗng", passed: true },
      { label: "Có số âm", passed: false },
    ]);
  });

  it("does not expose a hidden case's expectation in the feedback", () => {
    const result = gradeDeclaratively(cfg, snapshot([observation([returned(6), returned(0), returned(7)])]));
    const item = toGradingFeedbackModel(result).items[0]!;
    expect(item.detail).toContain("Có số âm");
    expect(item.expected).toBeUndefined();
    expect(item.actual).toBe("7");
    expect(JSON.stringify(item)).not.toMatch(/"expected"/);
  });

  it("shows the learner's own exception for a function that raised (not a runtime-environment message)", () => {
    const result = gradeDeclaratively(
      cfg,
      snapshot([
        observation([
          returned(6),
          { outcome: "raised", exceptionType: "ZeroDivisionError", exceptionMro: ["ZeroDivisionError", "ArithmeticError"], message: "division by zero" },
          returned(3),
        ]),
      ]),
    );
    const item = toGradingFeedbackModel(result).items[0]!;
    expect(item.detail).toContain("ZeroDivisionError");
    expect(item.detail).toContain("division by zero");
    expect(item.title).not.toContain("Môi trường");
  });

  it("a program-level exception still owns the feedback, without function noise", () => {
    const result = gradeDeclaratively(cfg, snapshot(undefined, { type: "NameError", message: "NameError: name 'q' is not defined" }));
    const feedback = toGradingFeedbackModel(result);
    expect(feedback.items).toHaveLength(1);
    expect(feedback.items[0]!.kind).toBe("runtime");
  });

  it("says plainly when the function is missing", () => {
    const result = gradeDeclaratively(cfg, snapshot([observation([], "MISSING")]));
    const item = toGradingFeedbackModel(result).items[0]!;
    expect(item.kind).toBe("missing-variable");
    expect(item.title).toContain("total");
  });

  it("the passing result carries no items", () => {
    const result = gradeDeclaratively(cfg, snapshot([observation([returned(6), returned(0), returned(3)])]));
    expect(toGradingFeedbackModel(result)).toMatchObject({ passed: true, items: [] });
  });
});

describe("DeclarativeGraderCheckType", () => {
  it("adds FUNCTION_CASES (M9) and TYPED_VALUE (M10) without removing or renaming the M8 types", () => {
    expect(Object.keys(DeclarativeGraderCheckType).sort()).toEqual(
      ["APPROX_VALUES", "EXACT_VALUES", "FUNCTION_CASES", "NDARRAY_TYPE", "NO_EXCEPTION", "PYTHON_TYPE", "SHAPE", "TYPED_VALUE", "VARIABLE_EXISTS"],
    );
  });

  it("does not add failure categories (attempt records and the sync DTO stay valid)", () => {
    expect(Object.keys(GraderFailureCategory).sort()).toEqual(
      ["MISSING_VARIABLE", "RUNTIME_ERROR", "SHAPE_ERROR", "TYPE_ERROR", "VALUE_ERROR"],
    );
  });
});
