/**
 * The error vocabulary of `validateExercisePack`. Codes are stable identifiers
 * (tests and tooling match on them); messages are Vietnamese for the learner who
 * pastes the file; `path` is an RFC 6901 JSON Pointer ("" is the document root).
 */
export const ExercisePackIssueCode = {
  INPUT_NOT_TEXT: "INPUT_NOT_TEXT",
  INPUT_TOO_LARGE: "INPUT_TOO_LARGE",
  JSON_SYNTAX: "JSON_SYNTAX",
  NESTING_TOO_DEEP: "NESTING_TOO_DEEP",
  TOO_MANY_NODES: "TOO_MANY_NODES",
  NOT_JSON_DATA: "NOT_JSON_DATA",
  FORBIDDEN_KEY: "FORBIDDEN_KEY",
  WRONG_FORMAT: "WRONG_FORMAT",
  UNSUPPORTED_SCHEMA_VERSION: "UNSUPPORTED_SCHEMA_VERSION",
  UNSUPPORTED_KIND: "UNSUPPORTED_KIND",
  UNKNOWN_FIELD: "UNKNOWN_FIELD",
  FORBIDDEN_FIELD: "FORBIDDEN_FIELD",
  MISSING_FIELD: "MISSING_FIELD",
  INVALID_TYPE: "INVALID_TYPE",
  INVALID_VALUE: "INVALID_VALUE",
  TOO_LONG: "TOO_LONG",
  TOO_MANY: "TOO_MANY",
  INVALID_IDENTIFIER: "INVALID_IDENTIFIER",
  PYTHON_KEYWORD: "PYTHON_KEYWORD",
  RESERVED_NAME: "RESERVED_NAME",
  DUPLICATE_ID: "DUPLICATE_ID",
  DUPLICATE_VALUE: "DUPLICATE_VALUE",
  UNSUPPORTED_PACKAGE: "UNSUPPORTED_PACKAGE",
  UNSAFE_FILENAME: "UNSAFE_FILENAME",
  DATASET_TOO_LARGE: "DATASET_TOO_LARGE",
  INVALID_GRADING: "INVALID_GRADING",
  WEAK_GRADING: "WEAK_GRADING",
  INVALID_HINTS: "INVALID_HINTS",
  CONTRADICTORY_METADATA: "CONTRADICTORY_METADATA",
  ADAPTER_REJECTED: "ADAPTER_REJECTED",
  NO_REFERENCE_SOLUTION: "NO_REFERENCE_SOLUTION",
  MORE_ISSUES: "MORE_ISSUES",
} as const;

export type ExercisePackIssueCode =
  (typeof ExercisePackIssueCode)[keyof typeof ExercisePackIssueCode];

export interface ExercisePackIssue {
  readonly code: ExercisePackIssueCode;
  /** JSON Pointer into the document. */
  readonly path: string;
  readonly message: string;
}

/** Escapes one reference token (RFC 6901). */
export function escapeJsonPointerToken(token: string | number): string {
  return String(token).replaceAll("~", "~0").replaceAll("/", "~1");
}

export function toJsonPointer(path: readonly (string | number | symbol)[]): string {
  return path.map((token) => `/${escapeJsonPointerToken(typeof token === "symbol" ? "?" : token)}`).join("");
}

/** Truncates untrusted text before it is echoed in a message (never echo large values). */
export function clip(value: string, max = 40): string {
  const printable = value.replace(/[\u0000-\u001f\u007f]/g, "?");
  return printable.length <= max ? printable : `${printable.slice(0, max)}…`;
}
