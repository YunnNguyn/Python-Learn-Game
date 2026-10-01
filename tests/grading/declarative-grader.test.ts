import { describe, expect, it } from "vitest";

import type { JsonObject } from "../../src/core/domain";
import {
  DeclarativeGraderCheckType,
  GraderFailureCategory,
  gradeDeclaratively,
  type GraderExecutionSnapshot,
} from "../../src/core/grading";

const emptyExecution = (): GraderExecutionSnapshot => ({ variables: {} });

function observed(
  value: unknown,
  overrides: Partial<{
    pythonType: string;
    isNdarray: boolean;
    shape: readonly number[];
  }> = {},
) {
  return {
    pythonType: overrides.pythonType ?? "object",
    isNdarray: overrides.isNdarray ?? false,
    ...(overrides.shape !== undefined ? { shape: overrides.shape } : {}),
    value: value as never,
  };
}

function grade(checks: JsonObject[], execution: GraderExecutionSnapshot) {
  return gradeDeclaratively({ checks }, execution);
}

describe("NO_EXCEPTION", () => {
  it("passes without an exception", () => {
    const result = grade(
      [{ type: DeclarativeGraderCheckType.NO_EXCEPTION }],
      emptyExecution(),
    );

    expect(result.passed).toBe(true);
    expect(result.checks).toEqual([
      { type: DeclarativeGraderCheckType.NO_EXCEPTION, passed: true },
    ]);
    expect(result.runtimeError).toBeUndefined();
  });

  it("fails with RUNTIME_ERROR and copies runtimeError", () => {
    const execution: GraderExecutionSnapshot = {
      variables: {},
      exception: { type: "ValueError", message: "bad input" },
    };

    const result = grade(
      [{ type: DeclarativeGraderCheckType.NO_EXCEPTION }],
      execution,
    );

    expect(result.passed).toBe(false);
    expect(result.checks[0]).toMatchObject({
      type: DeclarativeGraderCheckType.NO_EXCEPTION,
      passed: false,
      category: GraderFailureCategory.RUNTIME_ERROR,
    });
    expect(result.runtimeError).toEqual(execution.exception);
    expect(result.runtimeError).not.toBe(execution.exception);
  });

  it("copies an exception without implicitly failing when NO_EXCEPTION is absent", () => {
    const result = grade(
      [{ type: DeclarativeGraderCheckType.VARIABLE_EXISTS, variable: "x" }],
      {
        variables: { x: observed(1) },
        exception: { message: "runtime failed later" },
      },
    );

    expect(result.passed).toBe(true);
    expect(result.runtimeError).toEqual({ message: "runtime failed later" });
  });
});

describe("VARIABLE_EXISTS", () => {
  it.each([null, 0, false, ""])(
    "treats an own property with value %j as present",
    (value) => {
      const result = grade(
        [
          {
            type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
            variable: "x",
          },
        ],
        { variables: { x: observed(value) } },
      );

      expect(result.checks[0]).toMatchObject({ passed: true, variable: "x" });
    },
  );

  it("fails a missing variable", () => {
    const result = grade(
      [
        {
          type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
          variable: "missing",
        },
      ],
      emptyExecution(),
    );

    expect(result.checks[0]).toMatchObject({
      passed: false,
      category: GraderFailureCategory.MISSING_VARIABLE,
      variable: "missing",
    });
  });
});

describe("type and shape checks", () => {
  it("matches PYTHON_TYPE by exact string equality", () => {
    const pass = grade(
      [
        {
          type: DeclarativeGraderCheckType.PYTHON_TYPE,
          variable: "x",
          expected: "numpy.ndarray",
        },
      ],
      {
        variables: {
          x: observed([1], { pythonType: "numpy.ndarray", isNdarray: true }),
        },
      },
    );
    const fail = grade(
      [
        {
          type: DeclarativeGraderCheckType.PYTHON_TYPE,
          variable: "x",
          expected: "ndarray",
        },
      ],
      {
        variables: {
          x: observed([1], { pythonType: "numpy.ndarray", isNdarray: true }),
        },
      },
    );

    expect(pass.passed).toBe(true);
    expect(fail.checks[0]).toMatchObject({
      passed: false,
      category: GraderFailureCategory.TYPE_ERROR,
      expected: "ndarray",
      actual: "numpy.ndarray",
    });
  });

  it("requires isNdarray === true", () => {
    const pass = grade(
      [
        {
          type: DeclarativeGraderCheckType.NDARRAY_TYPE,
          variable: "x",
        },
      ],
      { variables: { x: observed([1], { isNdarray: true }) } },
    );
    const fail = grade(
      [
        {
          type: DeclarativeGraderCheckType.NDARRAY_TYPE,
          variable: "x",
        },
      ],
      { variables: { x: observed([1], { isNdarray: false }) } },
    );

    expect(pass.passed).toBe(true);
    expect(fail.checks[0]).toMatchObject({
      passed: false,
      category: GraderFailureCategory.TYPE_ERROR,
      expected: true,
      actual: false,
    });
  });

  it.each([
    [[4], [4], true],
    [[4], [4, 1], false],
    [[3, 4], [4, 3], false],
    [[], [], true],
  ] as const)("compares shape %j to %j exactly", (actual, expected, passed) => {
    const result = grade(
      [
        {
          type: DeclarativeGraderCheckType.SHAPE,
          variable: "x",
          expected: [...expected],
        },
      ],
      { variables: { x: observed([], { shape: actual }) } },
    );

    expect(result.passed).toBe(passed);
    if (!passed) {
      expect(result.checks[0]).toMatchObject({
        category: GraderFailureCategory.SHAPE_ERROR,
      });
    }
  });

  it("fails SHAPE when the observed shape is absent", () => {
    const result = grade(
      [
        {
          type: DeclarativeGraderCheckType.SHAPE,
          variable: "x",
          expected: [4],
        },
      ],
      { variables: { x: observed([1, 2, 3, 4]) } },
    );

    expect(result.checks[0]).toMatchObject({
      passed: false,
      category: GraderFailureCategory.SHAPE_ERROR,
    });
  });
});

describe("EXACT_VALUES", () => {
  it.each([
    [3, 3, true],
    ["x", "x", true],
    [true, true, true],
    [null, null, true],
    [[1, 2], [1, 2], true],
    [[[1], [2, 3]], [[1], [2, 3]], true],
    [[1, 2], [2, 1], false],
  ])("compares %j with %j structurally", (actual, expected, passed) => {
    const result = grade(
      [
        {
          type: DeclarativeGraderCheckType.EXACT_VALUES,
          variable: "x",
          expected: expected as never,
        },
      ],
      { variables: { x: observed(actual) } },
    );

    expect(result.passed).toBe(passed);
  });

  it("compares nested objects independently of property insertion order", () => {
    const result = grade(
      [
        {
          type: DeclarativeGraderCheckType.EXACT_VALUES,
          variable: "x",
          expected: { a: 1, nested: { b: 2, c: [3, 4] } },
        },
      ],
      {
        variables: {
          x: observed({ nested: { c: [3, 4], b: 2 }, a: 1 }),
        },
      },
    );

    expect(result.passed).toBe(true);
  });

  it("fails changed object key sets and nested values", () => {
    const result = grade(
      [
        {
          type: DeclarativeGraderCheckType.EXACT_VALUES,
          variable: "x",
          expected: { a: 1, b: { c: 2 } },
        },
      ],
      { variables: { x: observed({ a: 1, b: { c: 3 }, extra: 0 }) } },
    );

    expect(result.checks[0]).toMatchObject({
      passed: false,
      category: GraderFailureCategory.VALUE_ERROR,
    });
  });
});

describe("APPROX_VALUES", () => {
  it.each([
    [1.01, 1, 0.02, true],
    [1.03, 1, 0.02, false],
    [[1.01, 1.99], [1, 2], 0.02, true],
    [[1.01, 2.03], [1, 2], 0.02, false],
    [[[1.01], [2, 3.01]], [[1], [2, 3]], 0.02, true],
    [[1, [2]], [[1], 2], 0.1, false],
    [[1, 2], [1, 2, 3], 0.1, false],
    [1, 1, 0, true],
    [1.000001, 1, 0, false],
  ])(
    "compares %j to %j with absolute tolerance %s",
    (actual, expected, tolerance, passed) => {
      const result = grade(
        [
          {
            type: DeclarativeGraderCheckType.APPROX_VALUES,
            variable: "x",
            expected: expected as never,
            absoluteTolerance: tolerance,
          },
        ],
        { variables: { x: observed(actual) } },
      );

      expect(result.passed).toBe(passed);
      if (!passed) {
        expect(result.checks[0]).toMatchObject({
          category: GraderFailureCategory.VALUE_ERROR,
        });
      }
    },
  );

  it("returns VALUE_ERROR for nonnumeric actual values", () => {
    const result = grade(
      [
        {
          type: DeclarativeGraderCheckType.APPROX_VALUES,
          variable: "x",
          expected: [1, 2],
          absoluteTolerance: 0.1,
        },
      ],
      { variables: { x: observed([1, "2"]) } },
    );

    expect(result.checks[0]).toMatchObject({
      passed: false,
      category: GraderFailureCategory.VALUE_ERROR,
    });
  });
});

describe("missing runtime observations", () => {
  it.each([
    [DeclarativeGraderCheckType.PYTHON_TYPE, { expected: "int" }],
    [DeclarativeGraderCheckType.NDARRAY_TYPE, {}],
    [DeclarativeGraderCheckType.SHAPE, { expected: [1] }],
    [DeclarativeGraderCheckType.EXACT_VALUES, { expected: 1 }],
    [
      DeclarativeGraderCheckType.APPROX_VALUES,
      { expected: 1, absoluteTolerance: 0.1 },
    ],
  ])("returns MISSING_VARIABLE for %s", (type, extra) => {
    const result = grade(
      [{ type, variable: "missing", ...extra } as JsonObject],
      emptyExecution(),
    );

    expect(result.checks[0]).toMatchObject({
      passed: false,
      category: GraderFailureCategory.MISSING_VARIABLE,
      variable: "missing",
    });
  });

  it.each([
    [DeclarativeGraderCheckType.EXACT_VALUES, { expected: 1 }],
    [
      DeclarativeGraderCheckType.APPROX_VALUES,
      { expected: 1, absoluteTolerance: 0.1 },
    ],
  ])("returns VALUE_ERROR for missing observed value in %s", (type, extra) => {
    const result = grade(
      [{ type, variable: "x", ...extra } as JsonObject],
      {
        variables: {
          x: { pythonType: "int", isNdarray: false },
        },
      },
    );

    expect(result.checks[0]).toMatchObject({
      passed: false,
      category: GraderFailureCategory.VALUE_ERROR,
    });
  });
});

describe("evaluation behavior", () => {
  it("preserves authored order and runs every check under simultaneous failures", () => {
    const config: JsonObject = {
      checks: [
        {
          type: DeclarativeGraderCheckType.SHAPE,
          variable: "x",
          expected: [2],
        },
        { type: DeclarativeGraderCheckType.NO_EXCEPTION },
        {
          type: DeclarativeGraderCheckType.EXACT_VALUES,
          variable: "x",
          expected: [1, 2],
        },
        {
          type: DeclarativeGraderCheckType.PYTHON_TYPE,
          variable: "missing",
          expected: "int",
        },
      ],
    };
    const result = gradeDeclaratively(config, {
      variables: {
        x: observed([9], { shape: [1], pythonType: "list" }),
      },
      exception: { message: "boom" },
    });

    expect(result.checks.map((check) => check.type)).toEqual([
      DeclarativeGraderCheckType.SHAPE,
      DeclarativeGraderCheckType.NO_EXCEPTION,
      DeclarativeGraderCheckType.EXACT_VALUES,
      DeclarativeGraderCheckType.PYTHON_TYPE,
    ]);
    expect(result.checks).toHaveLength(4);
    expect(result.checks.every((check) => !check.passed)).toBe(true);
    expect(result.passed).toBe(false);
  });

  it("passes overall only when every authored check passes", () => {
    const checks: JsonObject[] = [
      { type: DeclarativeGraderCheckType.VARIABLE_EXISTS, variable: "x" },
      {
        type: DeclarativeGraderCheckType.PYTHON_TYPE,
        variable: "x",
        expected: "int",
      },
    ];
    const execution = {
      variables: { x: observed(1, { pythonType: "int" }) },
    };

    expect(grade(checks, execution).passed).toBe(true);
    expect(
      grade(
        [
          ...checks,
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "x",
            expected: 2,
          },
        ],
        execution,
      ).passed,
    ).toBe(false);
  });

  it("leaves conceptualGuidance and semanticResult undefined", () => {
    const result = grade(
      [{ type: DeclarativeGraderCheckType.NO_EXCEPTION }],
      emptyExecution(),
    );

    expect(result.conceptualGuidance).toBeUndefined();
    expect(result.semanticResult).toBeUndefined();
  });

  it("does not mutate authored config, execution, shape, or values", () => {
    const expected = { nested: [1, 2] };
    const actual = { nested: [1, 2] };
    const shape = [2];
    const config: JsonObject = {
      checks: [
        {
          type: DeclarativeGraderCheckType.SHAPE,
          variable: "x",
          expected: shape,
        },
        {
          type: DeclarativeGraderCheckType.EXACT_VALUES,
          variable: "x",
          expected,
        },
      ],
    };
    const execution: GraderExecutionSnapshot = {
      variables: {
        x: observed(actual, { shape }),
      },
    };
    const configBefore = structuredClone(config);
    const executionBefore = structuredClone(execution);

    const result = gradeDeclaratively(config, execution);
    (result.checks[0]!.expected as number[]).push(99);
    ((result.checks[1]!.actual as { nested: number[] }).nested).push(99);

    expect(config).toEqual(configBefore);
    expect(execution).toEqual(executionBefore);
  });

  it("returns deep-identical deterministic results on repeated grading", () => {
    const config: JsonObject = {
      checks: [
        { type: DeclarativeGraderCheckType.NO_EXCEPTION },
        {
          type: DeclarativeGraderCheckType.APPROX_VALUES,
          variable: "x",
          expected: [[1, 2]],
          absoluteTolerance: 0.01,
        },
      ],
    };
    const execution: GraderExecutionSnapshot = {
      variables: { x: observed([[1.001, 1.999]]) },
    };

    const first = gradeDeclaratively(config, execution);
    const second = gradeDeclaratively(config, execution);

    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.checks).not.toBe(first.checks);
  });
});

describe("config validation", () => {
  it("rejects zero checks and unknown check types", () => {
    expect(() => gradeDeclaratively({ checks: [] }, emptyExecution())).toThrow();
    expect(() =>
      gradeDeclaratively(
        { checks: [{ type: "UNKNOWN" }] },
        emptyExecution(),
      ),
    ).toThrow();
  });

  it("rejects blank variable names", () => {
    expect(() =>
      gradeDeclaratively(
        {
          checks: [
            {
              type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
              variable: "   ",
            },
          ],
        },
        emptyExecution(),
      ),
    ).toThrow();
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    "rejects invalid SHAPE dimension %s",
    (dimension) => {
      const config = {
        checks: [
          {
            type: DeclarativeGraderCheckType.SHAPE,
            variable: "x",
            expected: [dimension],
          },
        ],
      } as unknown as JsonObject;

      expect(() => gradeDeclaratively(config, emptyExecution())).toThrow();
    },
  );

  it.each([-0.1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid absolute tolerance %s",
    (absoluteTolerance) => {
      const config = {
        checks: [
          {
            type: DeclarativeGraderCheckType.APPROX_VALUES,
            variable: "x",
            expected: 1,
            absoluteTolerance,
          },
        ],
      } as unknown as JsonObject;

      expect(() => gradeDeclaratively(config, emptyExecution())).toThrow();
    },
  );

  it("rejects nonnumeric or object APPROX_VALUES expected data", () => {
    expect(() =>
      gradeDeclaratively(
        {
          checks: [
            {
              type: DeclarativeGraderCheckType.APPROX_VALUES,
              variable: "x",
              expected: [1, "2"],
              absoluteTolerance: 0.1,
            },
          ],
        },
        emptyExecution(),
      ),
    ).toThrow();
    expect(() =>
      gradeDeclaratively(
        {
          checks: [
            {
              type: DeclarativeGraderCheckType.APPROX_VALUES,
              variable: "x",
              expected: { value: 1 },
              absoluteTolerance: 0.1,
            },
          ],
        },
        emptyExecution(),
      ),
    ).toThrow();
  });
});

describe("representative direct config integration", () => {
  const config: JsonObject = {
    checks: [
      { type: DeclarativeGraderCheckType.NO_EXCEPTION },
      {
        type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
        variable: "selected",
      },
      {
        type: DeclarativeGraderCheckType.NDARRAY_TYPE,
        variable: "selected",
      },
      {
        type: DeclarativeGraderCheckType.SHAPE,
        variable: "selected",
        expected: [3],
      },
      {
        type: DeclarativeGraderCheckType.EXACT_VALUES,
        variable: "selected",
        expected: [12, 17, 23],
      },
    ],
  };

  it("grades a vertical-slice-like ndarray snapshot directly from JsonObject", () => {
    const result = gradeDeclaratively(config, {
      variables: {
        selected: observed([12, 17, 23], {
          pythonType: "numpy.ndarray",
          isNdarray: true,
          shape: [3],
        }),
      },
    });

    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(5);
  });

  it("categorizes wrong shape as SHAPE_ERROR", () => {
    const result = gradeDeclaratively(config, {
      variables: {
        selected: observed([12, 17, 23], {
          pythonType: "numpy.ndarray",
          isNdarray: true,
          shape: [3, 1],
        }),
      },
    });

    expect(result.checks[3]).toMatchObject({
      passed: false,
      category: GraderFailureCategory.SHAPE_ERROR,
    });
  });

  it("categorizes wrong values as VALUE_ERROR when type and shape are correct", () => {
    const result = gradeDeclaratively(config, {
      variables: {
        selected: observed([12, 17, 99], {
          pythonType: "numpy.ndarray",
          isNdarray: true,
          shape: [3],
        }),
      },
    });

    expect(result.checks[4]).toMatchObject({
      passed: false,
      category: GraderFailureCategory.VALUE_ERROR,
    });
  });
});
