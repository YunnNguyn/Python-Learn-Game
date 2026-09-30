import { z } from "zod";

import type {
  AttemptRecordId,
  ConceptId,
  LearningActivityId,
  MissionTemplateId,
} from "./ids";
import { JsonObjectSchema } from "./json";
import { brandedIdSchema, nonBlankStringSchema } from "./schema-helpers";
import { Difficulty, HintLevel, LearningStage } from "./values";

const attemptRecordIdSchema = brandedIdSchema<AttemptRecordId>();
const learningActivityIdSchema = brandedIdSchema<LearningActivityId>();
const missionTemplateIdSchema = brandedIdSchema<MissionTemplateId>();
const conceptIdSchema = brandedIdSchema<ConceptId>();
const difficultySchema = z.enum(Difficulty);
const learningStageSchema = z.enum(LearningStage);
const hintLevelSchema = z.enum(HintLevel);
const timestampSchema = z.iso.datetime({ offset: true });
const positiveIntegerSchema = z.number().finite().int().min(1);
const nonNegativeIntegerSchema = z.number().finite().int().min(0);

export const AttemptRecordSchema = z.strictObject({
  id: attemptRecordIdSchema,
  activityId: learningActivityIdSchema,
  missionTemplateId: missionTemplateIdSchema,
  missionTemplateVersion: positiveIntegerSchema,
  seed: nonBlankStringSchema,
  difficulty: difficultySchema,
  conceptIds: z.array(conceptIdSchema),
  learningStage: learningStageSchema,
  startedAt: timestampSchema.optional(),
  submittedAt: timestampSchema,
  passed: z.boolean(),
  submissionIndex: positiveIntegerSchema,
  runCountBeforeSubmit: nonNegativeIntegerSchema,
  hintsUsed: z.array(hintLevelSchema),
  runtimeErrorCount: nonNegativeIntegerSchema,
  graderSummary: JsonObjectSchema.optional(),
});

export type AttemptRecord = z.infer<typeof AttemptRecordSchema>;
