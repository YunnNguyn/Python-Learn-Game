import { z } from "zod";

import type {
  ConceptId,
  LearningActivityId,
  MissionTemplateId,
} from "./ids";
import { brandedIdSchema, nonBlankStringSchema } from "./schema-helpers";
import { LearningActivityType, LearningStage } from "./values";

const learningActivityIdSchema = brandedIdSchema<LearningActivityId>();
const conceptIdSchema = brandedIdSchema<ConceptId>();
const missionTemplateIdSchema = brandedIdSchema<MissionTemplateId>();
const learningStageSchema = z.enum(LearningStage);

const commonActivityShape = {
  id: learningActivityIdSchema,
  title: nonBlankStringSchema,
  description: z.string().optional(),
  conceptIds: z.array(conceptIdSchema),
  stage: learningStageSchema,
};

export const CodeMissionActivitySchema = z.strictObject({
  ...commonActivityShape,
  type: z.literal(LearningActivityType.CODE_MISSION),
  missionTemplateId: missionTemplateIdSchema,
});

export type CodeMissionActivity = z.infer<typeof CodeMissionActivitySchema>;

export const DebugMissionActivitySchema = z.strictObject({
  ...commonActivityShape,
  type: z.literal(LearningActivityType.DEBUG_MISSION),
  missionTemplateId: missionTemplateIdSchema,
});

export type DebugMissionActivity = z.infer<typeof DebugMissionActivitySchema>;

export const PredictOutputActivitySchema = z.strictObject({
  ...commonActivityShape,
  type: z.literal(LearningActivityType.PREDICT_OUTPUT),
});

export type PredictOutputActivity = z.infer<
  typeof PredictOutputActivitySchema
>;

export const ExplainShapeActivitySchema = z.strictObject({
  ...commonActivityShape,
  type: z.literal(LearningActivityType.EXPLAIN_SHAPE),
});

export type ExplainShapeActivity = z.infer<
  typeof ExplainShapeActivitySchema
>;

export const RecallCodeActivitySchema = z.strictObject({
  ...commonActivityShape,
  type: z.literal(LearningActivityType.RECALL_CODE),
});

export type RecallCodeActivity = z.infer<typeof RecallCodeActivitySchema>;

export const BossMissionActivitySchema = z.strictObject({
  ...commonActivityShape,
  type: z.literal(LearningActivityType.BOSS_MISSION),
  missionTemplateId: missionTemplateIdSchema,
});

export type BossMissionActivity = z.infer<typeof BossMissionActivitySchema>;

export const LearningActivitySchema = z.discriminatedUnion("type", [
  CodeMissionActivitySchema,
  DebugMissionActivitySchema,
  PredictOutputActivitySchema,
  ExplainShapeActivitySchema,
  RecallCodeActivitySchema,
  BossMissionActivitySchema,
]);

export type LearningActivity = z.infer<typeof LearningActivitySchema>;
