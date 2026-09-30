import { z } from "zod";

import type {
  ConceptId,
  GraderId,
  HintSetId,
  MissionGeneratorId,
  MissionTemplateId,
  RuntimeId,
  VisualizationModuleId,
} from "./ids";
import { JsonObjectSchema } from "./json";
import { brandedIdSchema } from "./schema-helpers";
import { LearningStage } from "./values";

const missionTemplateIdSchema = brandedIdSchema<MissionTemplateId>();
const conceptIdSchema = brandedIdSchema<ConceptId>();
const missionGeneratorIdSchema = brandedIdSchema<MissionGeneratorId>();
const graderIdSchema = brandedIdSchema<GraderId>();
const runtimeIdSchema = brandedIdSchema<RuntimeId>();
const hintSetIdSchema = brandedIdSchema<HintSetId>();
const visualizationModuleIdSchema = brandedIdSchema<VisualizationModuleId>();
const learningStageSchema = z.enum(LearningStage);

const generatorBindingSchema = z.strictObject({
  id: missionGeneratorIdSchema,
  config: JsonObjectSchema.optional(),
});

const graderBindingSchema = z.strictObject({
  id: graderIdSchema,
  config: JsonObjectSchema.optional(),
});

const runtimeBindingSchema = z.strictObject({
  id: runtimeIdSchema,
  config: JsonObjectSchema.optional(),
});

const visualizationBindingSchema = z.strictObject({
  moduleId: visualizationModuleIdSchema,
  config: JsonObjectSchema.optional(),
});

export const MissionTemplateSchema = z.strictObject({
  id: missionTemplateIdSchema,
  version: z.number().finite().int().min(1),
  conceptIds: z.array(conceptIdSchema),
  allowedStages: z.array(learningStageSchema),
  generator: generatorBindingSchema,
  grader: graderBindingSchema,
  runtime: runtimeBindingSchema,
  starterCode: z.string().optional(),
  hintSetId: hintSetIdSchema.optional(),
  visualization: visualizationBindingSchema.optional(),
  restrictions: JsonObjectSchema.optional(),
});

export type MissionTemplate = z.infer<typeof MissionTemplateSchema>;
