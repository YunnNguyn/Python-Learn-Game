import { z } from "zod";

import { JsonValueSchema, type JsonValue } from "../domain";

/**
 * The runtime side of behavioral function grading (PHASE-07 / M9).
 *
 * A PROBE is the part of a grader's `FUNCTION_CASES` check the runtime needs: the name
 * of a function and, per case, the arguments to call it with. It deliberately carries
 * NO expected values and no case labels - the expectations stay in the grader on the
 * main thread, so nothing the learner's own code can inspect inside the Python
 * namespace reveals what a correct result looks like.
 *
 * The runtime answers with one OBSERVATION per probe (same order, same case count):
 * what each call did - returned a value, raised, or returned something that cannot be
 * represented. Values use the typed-JSON encoding documented in
 * `core/grading/function-cases.ts`.
 */

export interface FunctionProbeCase {
  readonly args: readonly JsonValue[];
  readonly kwargs?: Readonly<Record<string, JsonValue>>;
  /** Report whether the call modified its (deep) arguments. */
  readonly checkArgsUnchanged?: boolean;
}

export interface FunctionProbeSpec {
  readonly function: string;
  readonly cases: readonly FunctionProbeCase[];
}

export const FUNCTION_PROBE_STATUS = {
  OK: "OK",
  MISSING: "MISSING",
  NOT_CALLABLE: "NOT_CALLABLE",
} as const;
export type FunctionProbeStatus = (typeof FUNCTION_PROBE_STATUS)[keyof typeof FUNCTION_PROBE_STATUS];

export const FUNCTION_PROBE_OUTCOME = {
  RETURNED: "returned",
  RAISED: "raised",
  UNSUPPORTED: "unsupported",
} as const;
export type FunctionProbeOutcome = (typeof FUNCTION_PROBE_OUTCOME)[keyof typeof FUNCTION_PROBE_OUTCOME];

export type FunctionProbeCaseObservation =
  | {
      readonly outcome: "returned";
      readonly pythonType: string;
      readonly value: JsonValue;
      readonly argsMutated?: boolean;
    }
  | {
      readonly outcome: "raised";
      readonly exceptionType: string;
      /** Class names of the exception's MRO (itself first), so a subclass satisfies its base. */
      readonly exceptionMro: readonly string[];
      readonly message: string;
      readonly argsMutated?: boolean;
    }
  | {
      readonly outcome: "unsupported";
      readonly pythonType: string;
      readonly reason: string;
      readonly argsMutated?: boolean;
    };

export interface FunctionProbeObservation {
  readonly function: string;
  readonly status: FunctionProbeStatus;
  readonly cases: readonly FunctionProbeCaseObservation[];
}

const identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/);

export const FunctionProbeSpecSchema: z.ZodType<FunctionProbeSpec> = z.strictObject({
  function: identifier,
  cases: z.array(
    z.strictObject({
      args: z.array(JsonValueSchema).max(16),
      kwargs: z.record(identifier, JsonValueSchema).optional(),
      checkArgsUnchanged: z.boolean().optional(),
    }),
  ),
});

const caseObservationSchema: z.ZodType<FunctionProbeCaseObservation> = z.discriminatedUnion("outcome", [
  z.strictObject({
    outcome: z.literal("returned"),
    pythonType: z.string(),
    value: JsonValueSchema,
    argsMutated: z.boolean().optional(),
  }),
  z.strictObject({
    outcome: z.literal("raised"),
    exceptionType: z.string(),
    exceptionMro: z.array(z.string()).max(16),
    message: z.string(),
    argsMutated: z.boolean().optional(),
  }),
  z.strictObject({
    outcome: z.literal("unsupported"),
    pythonType: z.string(),
    reason: z.string(),
    argsMutated: z.boolean().optional(),
  }),
]);

export const FunctionProbeObservationSchema: z.ZodType<FunctionProbeObservation> = z.strictObject({
  function: identifier,
  status: z.enum(FUNCTION_PROBE_STATUS),
  cases: z.array(caseObservationSchema),
});
