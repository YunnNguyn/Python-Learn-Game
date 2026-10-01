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

export interface GraderCheckResult {
  readonly type: DeclarativeGraderCheckType;
  readonly passed: boolean;
  readonly variable?: string;
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
