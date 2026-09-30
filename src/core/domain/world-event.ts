import { z } from "zod";

import type { WorldEventType } from "./ids";
import { JsonObjectSchema } from "./json";
import { brandedIdSchema } from "./schema-helpers";

const worldEventTypeSchema = brandedIdSchema<WorldEventType>();

export const WorldEventSchema = z.strictObject({
  type: worldEventTypeSchema,
  payload: JsonObjectSchema,
});

export type WorldEvent = z.infer<typeof WorldEventSchema>;
