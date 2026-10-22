import type { JsonValue } from "../domain";
import type { FunctionProbeCaseObservation } from "../runtime/function-probes";

import {
  comparePyValues,
  formatPyValue,
  type FunctionCase,
  type FunctionCasesCheck,
} from "./function-cases";
import type { GraderExecutionSnapshot } from "./grader-execution-snapshot";
import {
  FunctionCaseOutcome,
  GraderFailureCategory,
  type GraderCheckResult,
  type GraderFunctionCaseResult,
} from "./grader-result";

const CHECK_TYPE = "FUNCTION_CASES" as const;

/**
 * Grades one FUNCTION_CASES check against what the runtime observed.
 *
 * Distinguishes (per case, and by category) a function that RAISED from one that
 * returned a wrong TYPE / SHAPE / VALUE, and never copies the expected value of a
 * hidden case into the result.
 */
export function evaluateFunctionCases(
  check: FunctionCasesCheck,
  execution: GraderExecutionSnapshot,
  functionIndex: number,
): GraderCheckResult {
  const observation = execution.functions?.[functionIndex];

  if (observation === undefined) {
    if (execution.exception !== undefined) {
      // The program stopped before the functions could be exercised; the runtime
      // error (reported by NO_EXCEPTION) is what the learner has to fix first.
      return {
        type: CHECK_TYPE,
        passed: false,
        function: check.function,
        category: GraderFailureCategory.RUNTIME_ERROR,
        message: `Chưa kiểm tra được hàm '${check.function}' vì chương trình dừng do lỗi.`,
      };
    }
    throw new Error(`No function observation for check #${functionIndex} (${check.function}).`);
  }

  if (observation.function !== check.function) {
    throw new Error(`Function observation mismatch: ${observation.function} != ${check.function}.`);
  }

  if (observation.status === "MISSING") {
    return {
      type: CHECK_TYPE,
      passed: false,
      function: check.function,
      category: GraderFailureCategory.MISSING_VARIABLE,
      message: `Chưa định nghĩa hàm '${check.function}'.`,
    };
  }

  if (observation.status === "NOT_CALLABLE") {
    return {
      type: CHECK_TYPE,
      passed: false,
      function: check.function,
      category: GraderFailureCategory.TYPE_ERROR,
      message: `'${check.function}' tồn tại nhưng không phải là hàm.`,
    };
  }

  if (observation.cases.length !== check.cases.length) {
    throw new Error(`Function observation for ${check.function} has the wrong number of cases.`);
  }

  const cases = check.cases.map((testCase, index) =>
    evaluateCase(check.function, testCase, observation.cases[index]!),
  );
  const failed = cases.filter((item) => !item.passed);
  const passedCount = cases.length - failed.length;

  return {
    type: CHECK_TYPE,
    passed: failed.length === 0,
    function: check.function,
    cases,
    ...(failed.length > 0
      ? {
          category: failed[0]!.category ?? GraderFailureCategory.VALUE_ERROR,
          message: `Hàm '${check.function}' đạt ${passedCount}/${cases.length} ca kiểm tra.`,
        }
      : {}),
  };
}

function evaluateCase(
  functionName: string,
  testCase: FunctionCase,
  observed: FunctionProbeCaseObservation,
): GraderFunctionCaseResult {
  const visibility = testCase.visibility ?? "hidden";
  const base = { id: testCase.id, label: testCase.label, visibility } as const;
  const call = describeCall(functionName, testCase);
  const fail = (
    outcome: GraderFunctionCaseResult["outcome"],
    category: GraderFailureCategory,
    extra: Partial<GraderFunctionCaseResult> = {},
  ): GraderFunctionCaseResult => ({
    ...base,
    passed: false,
    outcome,
    category,
    call,
    ...extra,
  });
  const exposeExpected = (): Partial<GraderFunctionCaseResult> =>
    visibility === "example" && testCase.expect.kind === "RETURNS"
      ? { expectedText: formatPyValue(testCase.expect.value, 160) }
      : {};

  const mutated =
    testCase.argsUnchanged === true && observed.argsMutated !== false;

  if (testCase.expect.kind === "RAISES") {
    const wanted = testCase.expect.exception;
    if (observed.outcome === "raised") {
      if (!observed.exceptionMro.includes(wanted)) {
        return fail(FunctionCaseOutcome.WRONG_EXCEPTION, GraderFailureCategory.VALUE_ERROR, {
          exceptionType: observed.exceptionType,
          ...(observed.message !== "" ? { message: observed.message } : {}),
          ...(visibility === "example" ? { expectedText: wanted } : {}),
        });
      }
      return mutated
        ? fail(FunctionCaseOutcome.ARGS_MUTATED, GraderFailureCategory.VALUE_ERROR)
        : { ...base, passed: true, outcome: FunctionCaseOutcome.PASSED };
    }
    return fail(FunctionCaseOutcome.NO_EXCEPTION_RAISED, GraderFailureCategory.VALUE_ERROR, {
      ...(observed.outcome === "returned"
        ? { actualText: formatPyValue(observed.value, 160), actualType: observed.pythonType }
        : { actualType: observed.pythonType }),
      ...(visibility === "example" ? { expectedText: wanted } : {}),
    });
  }

  // expect.kind === "RETURNS"
  if (observed.outcome === "raised") {
    return fail(FunctionCaseOutcome.RAISED, GraderFailureCategory.RUNTIME_ERROR, {
      exceptionType: observed.exceptionType,
      ...(observed.message !== "" ? { message: observed.message } : {}),
    });
  }

  if (observed.outcome === "unsupported") {
    return fail(FunctionCaseOutcome.UNSUPPORTED_RESULT, GraderFailureCategory.TYPE_ERROR, {
      actualType: observed.pythonType,
      message: observed.reason,
    });
  }

  const actual: JsonValue = observed.value;
  const actualText = formatPyValue(actual, 160);

  if (
    testCase.expect.returnType !== undefined &&
    observed.pythonType !== testCase.expect.returnType
  ) {
    return fail(FunctionCaseOutcome.WRONG_TYPE, GraderFailureCategory.TYPE_ERROR, {
      actualText,
      actualType: observed.pythonType,
      ...(visibility === "example"
        ? { expectedText: `${testCase.expect.returnType}: ${formatPyValue(testCase.expect.value, 140)}` }
        : { message: `cần kiểu ${testCase.expect.returnType}` }),
    });
  }

  const mismatch = comparePyValues(actual, testCase.expect.value, testCase.expect.tolerance ?? 0);
  if (mismatch === "TYPE" || mismatch === "DTYPE") {
    return fail(FunctionCaseOutcome.WRONG_TYPE, GraderFailureCategory.TYPE_ERROR, {
      actualText,
      actualType: observed.pythonType,
      ...exposeExpected(),
    });
  }
  if (mismatch === "SHAPE") {
    return fail(FunctionCaseOutcome.WRONG_SHAPE, GraderFailureCategory.SHAPE_ERROR, {
      actualText,
      actualType: observed.pythonType,
      ...exposeExpected(),
    });
  }
  if (mismatch === "VALUE") {
    return fail(FunctionCaseOutcome.WRONG_VALUE, GraderFailureCategory.VALUE_ERROR, {
      actualText,
      actualType: observed.pythonType,
      ...exposeExpected(),
    });
  }

  if (mutated) {
    return fail(FunctionCaseOutcome.ARGS_MUTATED, GraderFailureCategory.VALUE_ERROR, {
      actualText,
      actualType: observed.pythonType,
    });
  }

  return { ...base, passed: true, outcome: FunctionCaseOutcome.PASSED };
}

function describeCall(functionName: string, testCase: FunctionCase): string {
  const parts = [
    ...testCase.args.map((value) => formatPyValue(value, 70)),
    ...Object.entries(testCase.kwargs ?? {}).map(([name, value]) => `${name}=${formatPyValue(value, 70)}`),
  ];
  const text = `${functionName}(${parts.join(", ")})`;
  return text.length <= 200 ? text : `${text.slice(0, 199)}…`;
}
