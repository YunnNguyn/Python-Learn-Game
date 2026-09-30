import { z } from "zod";

import type {
  ConceptId,
  MissionInstanceId,
  MissionTemplateId,
} from "./ids";
import { JsonObjectSchema } from "./json";
import { brandedIdSchema, nonBlankStringSchema } from "./schema-helpers";
import { Difficulty } from "./values";

const missionInstanceIdSchema = brandedIdSchema<MissionInstanceId>();
const missionTemplateIdSchema = brandedIdSchema<MissionTemplateId>();
const conceptIdSchema = brandedIdSchema<ConceptId>();
const difficultySchema = z.enum(Difficulty);

const MissionLearnerPayloadSchema = z.strictObject({
  objective: nonBlankStringSchema,
  context: z.string().optional(),
  starterCode: z.string().optional(),
  data: JsonObjectSchema.optional(),
  visibleTests: z.array(JsonObjectSchema).optional(),
});

const MissionRuntimePayloadSchema = z.strictObject({
  setupData: JsonObjectSchema.optional(),
});

const MissionGradingPayloadSchema = z.strictObject({
  data: JsonObjectSchema.optional(),
});

const MissionWorldPayloadSchema = z.strictObject({
  initialState: JsonObjectSchema.optional(),
});

export const MissionInstanceSchema = z.strictObject({
  id: missionInstanceIdSchema,
  templateId: missionTemplateIdSchema,
  templateVersion: z.number().finite().int().min(1),
  seed: nonBlankStringSchema,
  difficulty: difficultySchema,
  conceptIds: z.array(conceptIdSchema),
  learner: MissionLearnerPayloadSchema,
  runtime: MissionRuntimePayloadSchema.optional(),
  grading: MissionGradingPayloadSchema.optional(),
  world: MissionWorldPayloadSchema.optional(),
});

export type MissionLearnerPayload = z.infer<typeof MissionLearnerPayloadSchema>;
export type MissionRuntimePayload = z.infer<typeof MissionRuntimePayloadSchema>;
export type MissionGradingPayload = z.infer<typeof MissionGradingPayloadSchema>;
export type MissionWorldPayload = z.infer<typeof MissionWorldPayloadSchema>;
export type MissionInstance = z.infer<typeof MissionInstanceSchema>;
