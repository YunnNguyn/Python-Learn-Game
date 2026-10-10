import { z } from "zod";

import { AttemptRecordSchema, type AttemptRecord } from "../domain";
import { GraderFailureCategory } from "../grading/grader-result";
import { RUNTIME_EXECUTION_STATUS } from "../runtime/runtime-contracts";

/**
 * SyncAttemptDtoV1 - lossless, privacy-reviewed transport envelope for an
 * existing AttemptRecord. Pure data validation: no storage, network, hashing,
 * account or reward logic lives here.
 *
 *   { dtoVersion: 1, attempt: AttemptRecord }
 *
 * `attempt` is exactly an AttemptRecord (validated by the unmodified
 * AttemptRecordSchema). The only extra rule is that `graderSummary`, which the
 * base schema leaves as arbitrary JSON, must be exactly the shape the Submit
 * path generates today (mission-attempt-session.ts, graderSummary literal).
 * Nothing is stripped, defaulted or synthesized: a record that does not fit is
 * reported as `UNSYNCABLE` and stays untouched in the caller's hands.
 */

export const SYNC_ATTEMPT_DTO_VERSION = 1 as const;

/** Upper bound for `graderSummary.failedCategories` in DTO V1. */
export const MAX_SYNC_FAILED_CATEGORIES = 32;

const SyncGraderSummarySchema = z.strictObject({
  executionStatus: z.enum(RUNTIME_EXECUTION_STATUS),
  gradingAvailable: z.boolean(),
  gradingPassed: z.boolean(),
  failedCategories: z.array(z.enum(GraderFailureCategory)).max(MAX_SYNC_FAILED_CATEGORIES),
});

export interface SyncAttemptDtoV1 {
  readonly dtoVersion: typeof SYNC_ATTEMPT_DTO_VERSION;
  readonly attempt: AttemptRecord;
}

export const SyncDtoErrorCode = {
  /** toSyncAttemptDtoV1: the record is not (losslessly) representable in DTO V1. */
  UNSYNCABLE: "UNSYNCABLE",
  /** fromSyncAttemptDtoV1: envelope major version is not supported by this build. */
  UNSUPPORTED_VERSION: "UNSUPPORTED_VERSION",
  /** fromSyncAttemptDtoV1: envelope itself is malformed or has unknown fields. */
  INVALID_ENVELOPE: "INVALID_ENVELOPE",
  /** fromSyncAttemptDtoV1: envelope is fine but `attempt` is not a valid DTO V1 attempt. */
  INVALID_ATTEMPT: "INVALID_ATTEMPT",
} as const;

export type SyncDtoErrorCode = (typeof SyncDtoErrorCode)[keyof typeof SyncDtoErrorCode];

/** Describes WHERE and WHY validation failed. Never contains the offending value. */
export interface SyncDtoIssue {
  readonly path: string;
  readonly code: string;
}

export interface SyncDtoError {
  readonly code: SyncDtoErrorCode;
  readonly issues: readonly SyncDtoIssue[];
  /** Only for UNSUPPORTED_VERSION, and only when the received version is a number. */
  readonly receivedVersion?: number;
}

export type SyncDtoResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: SyncDtoError };

/**
 * Validates and wraps an AttemptRecord. The input is never mutated; the DTO
 * holds a validated copy that shares no references with it.
 */
export function toSyncAttemptDtoV1(record: unknown): SyncDtoResult<SyncAttemptDtoV1> {
  const validated = validateSyncAttempt(record);
  if (!validated.ok) {
    return fail(SyncDtoErrorCode.UNSYNCABLE, validated.issues);
  }
  return { ok: true, value: { dtoVersion: SYNC_ATTEMPT_DTO_VERSION, attempt: validated.record } };
}

/**
 * Validates a received payload (typically `JSON.parse` output) and returns the
 * complete AttemptRecord it carries. Unknown fields anywhere are rejected, not
 * dropped, and no field is ever synthesized.
 */
export function fromSyncAttemptDtoV1(payload: unknown): SyncDtoResult<AttemptRecord> {
  if (!isPlainRecord(payload)) {
    return fail(SyncDtoErrorCode.INVALID_ENVELOPE, [{ path: "(root)", code: "invalid_type" }]);
  }

  if (!("dtoVersion" in payload)) {
    return fail(SyncDtoErrorCode.INVALID_ENVELOPE, [{ path: "dtoVersion", code: "required" }]);
  }
  if (payload.dtoVersion !== SYNC_ATTEMPT_DTO_VERSION) {
    const received = payload.dtoVersion;
    return {
      ok: false,
      error: {
        code: SyncDtoErrorCode.UNSUPPORTED_VERSION,
        issues: [{ path: "dtoVersion", code: "unsupported_version" }],
        ...(typeof received === "number" && Number.isFinite(received)
          ? { receivedVersion: received }
          : {}),
      },
    };
  }

  const envelopeIssues: SyncDtoIssue[] = [];
  for (const key of Object.keys(payload)) {
    if (key !== "dtoVersion" && key !== "attempt") {
      envelopeIssues.push({ path: "(root)", code: "unrecognized_keys" });
      break;
    }
  }
  if (!("attempt" in payload)) {
    envelopeIssues.push({ path: "attempt", code: "required" });
  }
  if (envelopeIssues.length > 0) {
    return fail(SyncDtoErrorCode.INVALID_ENVELOPE, envelopeIssues);
  }

  const validated = validateSyncAttempt(payload.attempt);
  if (!validated.ok) {
    return fail(SyncDtoErrorCode.INVALID_ATTEMPT, validated.issues);
  }
  return { ok: true, value: validated.record };
}

type ValidatedAttempt =
  | { readonly ok: true; readonly record: AttemptRecord }
  | { readonly ok: false; readonly issues: readonly SyncDtoIssue[] };

function validateSyncAttempt(value: unknown): ValidatedAttempt {
  const base = AttemptRecordSchema.safeParse(value);
  if (!base.success) {
    return { ok: false, issues: toIssues(base.error.issues, []) };
  }

  // Detach from the input: zod may hand back shared references for JSON values.
  const record = structuredClone(base.data);
  if (record.graderSummary !== undefined) {
    const summary = SyncGraderSummarySchema.safeParse(record.graderSummary);
    if (!summary.success) {
      return { ok: false, issues: toIssues(summary.error.issues, ["graderSummary"]) };
    }
  }
  return { ok: true, record };
}

function toIssues(
  issues: ReadonlyArray<{ readonly path: ReadonlyArray<PropertyKey>; readonly code: string }>,
  prefix: readonly PropertyKey[],
): SyncDtoIssue[] {
  return issues.map((issue) => ({
    path: [...prefix, ...issue.path].map(String).join(".") || "(root)",
    code: issue.code,
  }));
}

function fail<T>(code: SyncDtoErrorCode, issues: readonly SyncDtoIssue[]): SyncDtoResult<T> {
  return { ok: false, error: { code, issues } };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
