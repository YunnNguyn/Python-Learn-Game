import { z } from "zod";

export const nonBlankStringSchema = z
  .string()
  .refine((value) => value.trim().length > 0, {
    message: "Expected a non-blank string",
  });

export const brandedIdSchema = <TId extends string>() =>
  nonBlankStringSchema.transform((value): TId => value as TId);
