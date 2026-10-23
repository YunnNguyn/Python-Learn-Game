import type { JsonObject, JsonValue } from "../domain";

import type { DeclarativeGraderCheckType } from "./grader-config";
import type { GraderExecutionException } from "./grader-execution-snapshot";

export const GraderFailureCategory = {
  RUNTIME_ERROR: "RUNTIME_ERROR",
  MISSING_VARIABLE: "MISSING_VARIABLE",
  TYPE_ERROR: "TYPE_ERROR",
  SHAPE_ERROR: "SHAPE_ERROR",
  VALUE_ERROR: "VALUE_ERROR",
} as const;

export type GraderFailureCategory =
  (typeof GraderFailureCategory)[keyof typeof GraderFailureCategory];

export const FunctionCaseOutcome = {
  PASSED: "PASSED",
  WRONG_VALUE: "WRONG_VALUE",
  WRONG_TYPE: "WRONG_TYPE",
  WRONG_SHAPE: "WRONG_SHAPE",
  RAISED: "RAISED",
  NO_EXCEPTION_RAISED: "NO_EXCEPTION_RAISED",
  WRONG_EXCEPTION: "WRONG_EXCEPTION",
  UNSUPPORTED_RESULT: "UNSUPPORTED_RESULT",
  ARGS_MUTATED: "ARGS_MUTATED",
  /** M10: a DataFrame / Series has the wrong column names, order or Series name. */
  WRONG_COLUMNS: "WRONG_COLUMNS",
  /** M10: right values but the wrong row labels (index) or index name. */
  WRONG_INDEX: "WRONG_INDEX",
  /** M10: a column / Series has the wrong dtype (or an ndarray the wrong dtype). */
  WRONG_DTYPE: "WRONG_DTYPE",
  /** M10: a Matplotlib figure differs in title, labels, legend, kind or plotted data. */
  WRONG_FIGURE: "WRONG_FIGURE",
} as const;

export type FunctionCaseOutcome = (typeof FunctionCaseOutcome)[keyof typeof FunctionCaseOutcome];

/**
 * The outcome of one function case. Only plain, already-clipped text is carried: the
 * expected value of a case is present ONLY for cases the content author marked as
 * "example"; a hidden case never puts its expected value into a result.
 */
export interface GraderFunctionCaseResult {
  readonly id: string;
  readonly label: string;
  readonly visibility: "example" | "hidden";
  readonly passed: boolean;
  readonly outcome: FunctionCaseOutcome;
  readonly category?: GraderFailureCategory;
  /** The call, e.g. "clean_scores([1, '2'], strict=True)". Failed cases only. */
  readonly call?: string;
  readonly actualText?: string;
  readonly actualType?: string;
  readonly expectedText?: string;
  readonly exceptionType?: string;
  readonly message?: string;
}

export interface GraderCheckResult {
  readonly type: DeclarativeGraderCheckType;
  readonly passed: boolean;
  readonly variable?: string;
  /** FUNCTION_CASES: the function that was exercised and one result per case. */
  readonly function?: string;
  readonly cases?: readonly GraderFunctionCaseResult[];
  readonly category?: GraderFailureCategory;
  readonly message?: string;
  readonly expected?: JsonValue;
  readonly actual?: JsonValue;
}

export interface GraderResult {
  readonly passed: boolean;
  readonly checks: readonly GraderCheckResult[];
  readonly runtimeError?: GraderExecutionException;
  readonly conceptualGuidance?: JsonObject;
  readonly semanticResult?: JsonObject;
}
