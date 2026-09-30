import { z } from "zod";

import type {
  ConceptId,
  CourseId,
  LearningActivityId,
  LessonId,
  WorldId,
} from "./ids";
import { brandedIdSchema, nonBlankStringSchema } from "./schema-helpers";

const courseIdSchema = brandedIdSchema<CourseId>();
const worldIdSchema = brandedIdSchema<WorldId>();
const lessonIdSchema = brandedIdSchema<LessonId>();
const conceptIdSchema = brandedIdSchema<ConceptId>();
const learningActivityIdSchema = brandedIdSchema<LearningActivityId>();

export const CourseSchema = z.strictObject({
  id: courseIdSchema,
  title: nonBlankStringSchema,
  description: z.string().optional(),
  worldIds: z.array(worldIdSchema),
});

export type Course = z.infer<typeof CourseSchema>;

export const WorldSchema = z.strictObject({
  id: worldIdSchema,
  title: nonBlankStringSchema,
  description: z.string().optional(),
  lessonIds: z.array(lessonIdSchema),
});

export type World = z.infer<typeof WorldSchema>;

export const LessonSchema = z.strictObject({
  id: lessonIdSchema,
  title: nonBlankStringSchema,
  description: z.string().optional(),
  conceptIds: z.array(conceptIdSchema),
  activityIds: z.array(learningActivityIdSchema),
});

export type Lesson = z.infer<typeof LessonSchema>;
