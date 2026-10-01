import { z } from "zod";

import {
  JsonValueSchema,
  type JsonValue,
} from "../domain";

export const DeclarativeGraderCheckType = {
  NO_EXCEPTION: "NO_EXCEPTION",
  VARIABLE_EXISTS: "VARIABLE_EXISTS",
  PYTHON_TYPE: "PYTHON_TYPE",
  NDARRAY_TYPE: "NDARRAY_TYPE",
  SHAPE: "SHAPE",
  EXACT_VALUES: "EXACT_VALUES",
  APPROX_VALUES: "APPROX_VALUES",
} as const;

export type DeclarativeGraderCheckType =
  (typeof DeclarativeGraderCheckType)[keyof typeof DeclarativeGraderCheckType];

export type ApproxNumericValue = number | ApproxNumericValue[];

export type DeclarativeGraderCheck =
  | {
      readonly type: typeof DeclarativeGraderCheckType.NO_EXCEPTION;
    }
  | {
      readonly type: typeof DeclarativeGraderCheckType.VARIABLE_EXISTS;
      readonly variable: string;
    }
  | {
      readonly type: typeof DeclarativeGraderCheckType.PYTHON_TYPE;
      readonly variable: string;
      readonly expected: string;
    }
  | {
      readonly type: typeof DeclarativeGraderCheckType.NDARRAY_TYPE;
      readonly variable: string;
    }
  | {
      readonly type: typeof DeclarativeGraderCheckType.SHAPE;
      readonly variable: string;
      readonly expected: readonly number[];
    }
  | {
      readonly type: typeof DeclarativeGraderCheckType.EXACT_VALUES;
      readonly variable: string;
      readonly expected: JsonValue;
    }
  | {
      readonly type: typeof DeclarativeGraderCheckType.APPROX_VALUES;
      readonly variable: string;
      readonly expected: ApproxNumericValue;
      readonly absoluteTolerance: number;
    };

export interface DeclarativeGraderConfig {
  readonly checks: readonly DeclarativeGraderCheck[];
}

const nonBlankStringSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "Expected a non-blank string");
const safeShapeDimensionSchema = z
  .number()
  .finite()
  .nonnegative()
  .refine(Number.isSafeInteger, "Expected a non-negative safe integer");

const approxNumericValueSchema: z.ZodType<ApproxNumericValue> = z.lazy(() =>
  z.union([
    z.number().finite(),
    z.array(approxNumericValueSchema),
  ]),
);

const noExceptionCheckSchema = z
  .object({
    type: z.literal(DeclarativeGraderCheckType.NO_EXCEPTION),
  })
  .strict();

const variableExistsCheckSchema = z
  .object({
    type: z.literal(DeclarativeGraderCheckType.VARIABLE_EXISTS),
    variable: nonBlankStringSchema,
  })
  .strict();

const pythonTypeCheckSchema = z
  .object({
    type: z.literal(DeclarativeGraderCheckType.PYTHON_TYPE),
    variable: nonBlankStringSchema,
    expected: z.string(),
  })
  .strict();

const ndarrayTypeCheckSchema = z
  .object({
    type: z.literal(DeclarativeGraderCheckType.NDARRAY_TYPE),
    variable: nonBlankStringSchema,
  })
  .strict();

const shapeCheckSchema = z
  .object({
    type: z.literal(DeclarativeGraderCheckType.SHAPE),
    variable: nonBlankStringSchema,
    expected: z.array(safeShapeDimensionSchema),
  })
  .strict();

const exactValuesCheckSchema = z
  .object({
    type: z.literal(DeclarativeGraderCheckType.EXACT_VALUES),
    variable: nonBlankStringSchema,
    expected: JsonValueSchema,
  })
  .strict();

const approxValuesCheckSchema = z
  .object({
    type: z.literal(DeclarativeGraderCheckType.APPROX_VALUES),
    variable: nonBlankStringSchema,
    expected: approxNumericValueSchema,
    absoluteTolerance: z.number().finite().nonnegative(),
  })
  .strict();

export const DeclarativeGraderCheckSchema: z.ZodType<DeclarativeGraderCheck> =
  z.discriminatedUnion("type", [
    noExceptionCheckSchema,
    variableExistsCheckSchema,
    pythonTypeCheckSchema,
    ndarrayTypeCheckSchema,
    shapeCheckSchema,
    exactValuesCheckSchema,
    approxValuesCheckSchema,
  ]);

export const DeclarativeGraderConfigSchema: z.ZodType<DeclarativeGraderConfig> = z
  .object({
    checks: z.array(DeclarativeGraderCheckSchema).min(1),
  })
  .strict();
