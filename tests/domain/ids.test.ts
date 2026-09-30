import { describe, expect, it } from "vitest";

import type {
  ConceptId,
  LessonId,
  MissionTemplateId,
} from "../../src/core/domain";

describe("branded domain IDs", () => {
  it("remain strings at runtime", () => {
    const conceptId = "numpy.boolean_mask" as ConceptId;
    const missionTemplateId = "numpy.radar-filter" as MissionTemplateId;

    expect(typeof conceptId).toBe("string");
    expect(typeof missionTemplateId).toBe("string");
  });

  it("use compile-time brands to prevent cross-domain assignment", () => {
    const conceptId = "numpy.boolean_mask" as ConceptId;

    // @ts-expect-error ConceptId and LessonId are intentionally incompatible.
    const lessonId: LessonId = conceptId;

    expect(lessonId).toBe(conceptId);
  });
});
