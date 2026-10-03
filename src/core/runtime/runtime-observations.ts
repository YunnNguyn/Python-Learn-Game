import { z } from "zod";

import { JsonValueSchema, type JsonValue } from "../domain";

export interface RuntimeObservedValue {
  readonly pythonType: string;
  readonly isNdarray: boolean;
  readonly shape?: readonly number[];
  readonly value?: JsonValue;
}

export interface RuntimeVariableObservations {
  readonly variables: Readonly<Record<string, RuntimeObservedValue>>;
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
  });
