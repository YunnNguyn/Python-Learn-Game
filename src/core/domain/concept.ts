import { z } from "zod";

import type { ConceptId } from "./ids";
import { brandedIdSchema, nonBlankStringSchema } from "./schema-helpers";
import { ConceptSource, KnowledgeClassification } from "./values";

const conceptIdSchema = brandedIdSchema<ConceptId>();

export const ConceptSchema = z.strictObject({
  id: conceptIdSchema,
  title: nonBlankStringSchema,
  description: z.string().optional(),
  classification: z.enum(KnowledgeClassification),
  source: z.enum(ConceptSource),
  prerequisites: z.array(conceptIdSchema),
  tags: z.array(nonBlankStringSchema).optional(),
});

export type Concept = z.infer<typeof ConceptSchema>;
