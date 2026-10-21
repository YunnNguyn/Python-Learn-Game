import { z } from "zod";

import { JsonValueSchema } from "../domain";

import { EXERCISE_PACK_FORMAT, EXERCISE_PACK_LIMITS as L } from "./exercise-pack-limits";

/*
 * Exercise Pack schema v1 (PHASE-05-M7).
 *
 * Everything is `strictObject`: an unknown field is an error, never ignored, so a
 * typo ("hintz") or a forbidden extension ("runtime", "script") cannot slip through
 * silently. The exercise is a discriminated union on `kind`, the grading checks on
 * `type`. The schema describes SHAPE and per-field limits only; cross-field and
 * Python-aware rules live in the semantic layer (exercise-pack-validator.ts), and
 * the adapted domain objects are validated again by the domain schemas.
 *
 * Issue mapping: refinements carry a `params.code` (see `tagged`) so the validator
 * can report a precise stable code instead of a generic Zod one.
 */

function tagged(code: string) {
  return { params: { packCode: code } };
}

const SAFE_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

const idSchema = z
  .string()
  .max(L.maxIdLength)
  .refine(
    (value) => SAFE_ID.test(value),
    {
      error:
        "Mã định danh chỉ gồm chữ thường a-z, số, dấu chấm hoặc gạch ngang; bắt đầu bằng chữ cái (ví dụ \"mse-basic\").",
      ...tagged("INVALID_IDENTIFIER"),
    },
  );

const shortText = (max: number) => z.string().trim().min(1).max(max);
const text = (max: number) => z.string().max(max);

const SEMVER = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;
const versionSchema = z.string().refine((value) => SEMVER.test(value), {
  error: "Phiên bản pack phải có dạng MAJOR.MINOR.PATCH (ví dụ \"1.0.0\").",
  ...tagged("INVALID_VALUE"),
});

const authoringSchema = z.strictObject({
  author: shortText(L.maxShortTextLength).optional(),
  createdAt: z.iso.datetime({ offset: true }).optional(),
  generator: shortText(L.maxShortTextLength).optional(),
  license: shortText(L.maxShortTextLength).optional(),
  notes: text(L.maxDescriptionLength).optional(),
});

const packMetadataSchema = z.strictObject({
  id: idSchema,
  version: versionSchema,
  title: shortText(L.maxTitleLength),
  description: text(L.maxDescriptionLength),
  language: z.literal("python"),
  topic: shortText(L.maxTitleLength),
  tags: z.array(shortText(L.maxTagLength)).max(L.maxTags).default([]),
  learningObjectives: z.array(shortText(L.maxShortTextLength)).max(L.maxLearningObjectives).default([]),
  prerequisites: z.array(shortText(L.maxShortTextLength)).max(L.maxPrerequisites).default([]),
  authoring: authoringSchema.optional(),
});

const datasetSchema = z.strictObject({
  filename: z.string().min(1).max(L.maxDatasetFilenameLength),
  content: z.string(),
  description: text(L.maxShortTextLength).optional(),
});

const approxValue: z.ZodType<number | unknown[]> = z.lazy(() =>
  z.union([z.number().finite(), z.array(approxValue)]),
);

const variableName = z.string().min(1).max(L.maxIdentifierLength);

const checkSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("NO_EXCEPTION") }),
  z.strictObject({ type: z.literal("VARIABLE_EXISTS"), variable: variableName }),
  z.strictObject({
    type: z.literal("PYTHON_TYPE"),
    variable: variableName,
    expected: z.string().min(1).max(L.maxIdentifierLength),
  }),
  z.strictObject({ type: z.literal("NDARRAY_TYPE"), variable: variableName }),
  z.strictObject({
    type: z.literal("SHAPE"),
    variable: variableName,
    expected: z.array(z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)).max(8),
  }),
  z.strictObject({ type: z.literal("EXACT_VALUES"), variable: variableName, expected: JsonValueSchema }),
  z.strictObject({
    type: z.literal("APPROX_VALUES"),
    variable: variableName,
    expected: approxValue,
    absoluteTolerance: z.number().finite().min(0),
  }),
]);

const hintSchema = z.strictObject({
  level: z.enum(["H1", "H2", "H3", "H4"]),
  text: shortText(L.maxHintLength),
});

const feedbackSchema = z.strictObject({
  onPass: text(L.maxTextLength).optional(),
  onFail: text(L.maxTextLength).optional(),
});

const gradingSchema = z.strictObject({
  checks: z.array(checkSchema).min(1).max(L.maxChecksPerExercise),
});

const exerciseBase = {
  id: idSchema,
  revision: z.number().int().min(1).max(1_000_000),
  title: shortText(L.maxTitleLength),
  difficulty: z.enum(["easy", "normal", "hard"]),
  instructions: z.string().trim().min(1).max(L.maxTextLength),
  starterCode: text(L.maxStarterCodeLength),
  setupVariables: z.record(z.string(), JsonValueSchema).optional(),
  datasets: z.array(datasetSchema).max(L.maxDatasetsPerExercise).optional(),
  allowedPackages: z.array(z.string().min(1).max(L.maxIdentifierLength)).max(L.maxPackagesPerExercise).optional(),
  grading: gradingSchema,
  hints: z.array(hintSchema).max(L.maxHintsPerExercise).optional(),
  feedback: feedbackSchema.optional(),
  explanation: text(L.maxTextLength).optional(),
  referenceSolution: text(L.maxReferenceSolutionLength).optional(),
};

const codeExerciseSchema = z.strictObject({ ...exerciseBase, kind: z.literal("code") });

const debugExerciseSchema = z.strictObject({
  ...exerciseBase,
  kind: z.literal("debug"),
  /** What the learner observes going wrong; shown above the instructions. */
  symptom: text(L.maxDescriptionLength).optional(),
});

export const ExerciseSchema = z.discriminatedUnion("kind", [codeExerciseSchema, debugExerciseSchema]);

/** Version 1 of the document. A later version adds a sibling member to the union below. */
export const ExercisePackV1Schema = z.strictObject({
  format: z.literal(EXERCISE_PACK_FORMAT),
  schemaVersion: z.literal(1),
  pack: packMetadataSchema,
  exercises: z.array(ExerciseSchema).min(1).max(L.maxExercises),
});

export const ExercisePackSchema = z.discriminatedUnion("schemaVersion", [ExercisePackV1Schema]);

export type ExercisePack = z.infer<typeof ExercisePackV1Schema>;
export type PackExercise = z.infer<typeof ExerciseSchema>;
export type PackCheck = z.infer<typeof checkSchema>;
export type PackDataset = z.infer<typeof datasetSchema>;
