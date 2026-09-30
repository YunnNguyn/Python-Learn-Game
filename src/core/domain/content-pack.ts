import { z } from "zod";

import type { ContentPackId, CourseId } from "./ids";
import { brandedIdSchema, nonBlankStringSchema } from "./schema-helpers";

const contentPackIdSchema = brandedIdSchema<ContentPackId>();
const courseIdSchema = brandedIdSchema<CourseId>();

export const ContentPackManifestSchema = z.strictObject({
  id: contentPackIdSchema,
  version: nonBlankStringSchema,
  schemaVersion: z.number().finite().int().min(1),
  title: nonBlankStringSchema,
  description: z.string().optional(),
  courseIds: z.array(courseIdSchema),
  dependencies: z.array(contentPackIdSchema),
});

export type ContentPackManifest = z.infer<typeof ContentPackManifestSchema>;
