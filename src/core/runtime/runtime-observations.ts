import { z } from "zod";

import { JsonValueSchema, type JsonValue } from "../domain";
import {
  FunctionProbeObservationSchema,
  type FunctionProbeObservation,
} from "./function-probes";

export interface RuntimeObservedValue {
  readonly pythonType: string;
  readonly isNdarray: boolean;
  readonly shape?: readonly number[];
  readonly value?: JsonValue;
}

export interface RuntimeVariableObservations {
  readonly variables: Readonly<Record<string, RuntimeObservedValue>>;
  /** M9: one entry per requested function probe, in request order. */
  readonly functionResults?: readonly FunctionProbeObservation[];
}

const shapeDimensionSchema = z
  .number()
  .finite()
  .nonnegative()
  .refine(Number.isSafeInteger, "Expected a non-negative safe integer");

export const RuntimeObservedValueSchema: z.ZodType<RuntimeObservedValue> =
  z.strictObject({
    pythonType: z.string(),
    isNdarray: z.boolean(),
    shape: z.array(shapeDimensionSchema).optional(),
    value: JsonValueSchema.optional(),
  });

export const RuntimeVariableObservationsSchema: z.ZodType<RuntimeVariableObservations> =
  z.strictObject({
    variables: z.record(z.string(), RuntimeObservedValueSchema),
    functionResults: z.array(FunctionProbeObservationSchema).optional(),
  });
