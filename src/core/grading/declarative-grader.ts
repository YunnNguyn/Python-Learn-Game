import type { JsonObject, JsonValue } from "../domain";

import {
  DeclarativeGraderCheckType,
  DeclarativeGraderConfigSchema,
  type ApproxNumericValue,
  type DeclarativeGraderCheck,
} from "./grader-config";
import { evaluateFunctionCases } from "./function-case-evaluation";
import type { FunctionCasesCheck } from "./function-cases";
import type {
  GraderExecutionSnapshot,
  GraderObservedValue,
} from "./grader-execution-snapshot";
import {
  GraderFailureCategory,
  type GraderCheckResult,
  type GraderResult,
} from "./grader-result";

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)]),
    );
  }

  return value;
}

function hasOwnVariable(
  execution: GraderExecutionSnapshot,
  variable: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(execution.variables, variable);
}

function getObservedValue(
  execution: GraderExecutionSnapshot,
  variable: string,
): GraderObservedValue | undefined {
  return hasOwnVariable(execution, variable)
    ? execution.variables[variable]
    : undefined;
}

type VariableCheck = Exclude<
  DeclarativeGraderCheck,
  | { readonly type: typeof DeclarativeGraderCheckType.NO_EXCEPTION }
  | FunctionCasesCheck
>;

function missingVariableResult(
  check: VariableCheck,
): GraderCheckResult {
  return {
    type: check.type,
    passed: false,
    variable: check.variable,
    category: GraderFailureCategory.MISSING_VARIABLE,
    message: `Variable '${check.variable}' does not exist.`,
  };
}

function jsonEquals(left: JsonValue, right: JsonValue): boolean {
  if (typeof left !== typeof right) {
    return false;
  }

  if (left === null || right === null) {
    return left === right;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false;
    }
    return (
      left.length === right.length &&
      left.every((item, index) => jsonEquals(item, right[index]!))
    );
  }

  if (typeof left === "object" && typeof right === "object") {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    return leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        jsonEquals(left[key]!, right[key]!),
    );
  }

  return left === right;
}

function isApproxNumericValue(value: JsonValue): value is ApproxNumericValue {
  return (
    (typeof value === "number" && Number.isFinite(value)) ||
    (Array.isArray(value) && value.every((item) => isApproxNumericValue(item)))
  );
}

function approxEquals(
  actual: ApproxNumericValue,
  expected: ApproxNumericValue,
  tolerance: number,
): boolean {
  if (typeof actual === "number" || typeof expected === "number") {
    return (
      typeof actual === "number" &&
      typeof expected === "number" &&
      Math.abs(actual - expected) <= tolerance
    );
  }

  return (
    actual.length === expected.length &&
    actual.every((item, index) =>
      approxEquals(item, expected[index]!, tolerance),
    )
  );
}

function evaluateCheck(
  check: Exclude<DeclarativeGraderCheck, FunctionCasesCheck>,
  execution: GraderExecutionSnapshot,
): GraderCheckResult {
  if (check.type === DeclarativeGraderCheckType.NO_EXCEPTION) {
    if (execution.exception === undefined) {
      return { type: check.type, passed: true };
    }
    return {
      type: check.type,
      passed: false,
      category: GraderFailureCategory.RUNTIME_ERROR,
      message: execution.exception.message,
    };
  }

  if (check.type === DeclarativeGraderCheckType.VARIABLE_EXISTS) {
    const passed = hasOwnVariable(execution, check.variable);
    return {
      type: check.type,
      passed,
      variable: check.variable,
      ...(!passed
        ? {
            category: GraderFailureCategory.MISSING_VARIABLE,
            message: `Variable '${check.variable}' does not exist.`,
          }
        : {}),
    };
  }

  const observed = getObservedValue(execution, check.variable);
  if (observed === undefined) {
    return missingVariableResult(check);
  }

  switch (check.type) {
    case DeclarativeGraderCheckType.PYTHON_TYPE: {
      const passed = observed.pythonType === check.expected;
      return {
        type: check.type,
        passed,
        variable: check.variable,
        expected: check.expected,
        actual: observed.pythonType,
        ...(!passed
          ? {
              category: GraderFailureCategory.TYPE_ERROR,
              message: `Variable '${check.variable}' has Python type '${observed.pythonType}', expected '${check.expected}'.`,
            }
          : {}),
      };
    }

    case DeclarativeGraderCheckType.NDARRAY_TYPE: {
      const passed = observed.isNdarray === true;
      return {
        type: check.type,
        passed,
        variable: check.variable,
        expected: true,
        actual: observed.isNdarray,
        ...(!passed
          ? {
              category: GraderFailureCategory.TYPE_ERROR,
              message: `Variable '${check.variable}' is not an ndarray.`,
            }
          : {}),
      };
    }

    case DeclarativeGraderCheckType.SHAPE: {
      if (observed.shape === undefined) {
        return {
          type: check.type,
          passed: false,
          variable: check.variable,
          category: GraderFailureCategory.SHAPE_ERROR,
          message: `Variable '${check.variable}' has no observed shape.`,
          expected: [...check.expected],
        };
      }

      const passed =
        observed.shape.length === check.expected.length &&
        observed.shape.every((dimension, index) => dimension === check.expected[index]);
      return {
        type: check.type,
        passed,
        variable: check.variable,
        expected: [...check.expected],
        actual: [...observed.shape],
        ...(!passed
          ? {
              category: GraderFailureCategory.SHAPE_ERROR,
              message: `Variable '${check.variable}' has the wrong shape.`,
            }
          : {}),
      };
    }

    case DeclarativeGraderCheckType.EXACT_VALUES: {
      if (observed.value === undefined) {
        return {
          type: check.type,
          passed: false,
          variable: check.variable,
          category: GraderFailureCategory.VALUE_ERROR,
          message: `Variable '${check.variable}' has no observed value.`,
          expected: cloneJsonValue(check.expected),
        };
      }

      const passed = jsonEquals(observed.value, check.expected);
      return {
        type: check.type,
        passed,
        variable: check.variable,
        expected: cloneJsonValue(check.expected),
        actual: cloneJsonValue(observed.value),
        ...(!passed
          ? {
              category: GraderFailureCategory.VALUE_ERROR,
              message: `Variable '${check.variable}' has the wrong value.`,
            }
          : {}),
      };
    }

    case DeclarativeGraderCheckType.APPROX_VALUES: {
      if (observed.value === undefined) {
        return {
          type: check.type,
          passed: false,
          variable: check.variable,
          category: GraderFailureCategory.VALUE_ERROR,
          message: `Variable '${check.variable}' has no observed value.`,
          expected: cloneJsonValue(check.expected as JsonValue),
        };
      }

      const passed =
        isApproxNumericValue(observed.value) &&
        approxEquals(observed.value, check.expected, check.absoluteTolerance);
      return {
        type: check.type,
        passed,
        variable: check.variable,
        expected: cloneJsonValue(check.expected as JsonValue),
        actual: cloneJsonValue(observed.value),
        ...(!passed
          ? {
              category: GraderFailureCategory.VALUE_ERROR,
              message: `Variable '${check.variable}' is outside the allowed absolute tolerance or has an incompatible value structure.`,
            }
          : {}),
      };
    }
  }
}

export function gradeDeclaratively(
  config: JsonObject,
  execution: GraderExecutionSnapshot,
): GraderResult {
  const parsed = DeclarativeGraderConfigSchema.parse(config);
  let functionIndex = 0;
  const checks = parsed.checks.map((check) =>
    check.type === DeclarativeGraderCheckType.FUNCTION_CASES
      ? evaluateFunctionCases(check, execution, functionIndex++)
      : evaluateCheck(check, execution),
  );

  return {
    passed: checks.every((check) => check.passed),
    checks,
    ...(execution.exception !== undefined
      ? { runtimeError: { ...execution.exception } }
      : {}),
  };
}
