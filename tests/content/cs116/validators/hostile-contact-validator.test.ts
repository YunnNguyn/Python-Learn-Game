import { describe, expect, it } from "vitest";

import {
  CS116_GENERATOR_ID,
  hostileContactGenerator,
  hostileContactInstanceValidator,
} from "../../../../src/content/cs116";
import {
  Difficulty,
  LearningStage,
  MissionTemplateSchema,
} from "../../../../src/core/domain";
import { createMissionInstance } from "../../../../src/core/missions";
import { createSeededRng } from "../../../../src/core/random";

const template = MissionTemplateSchema.parse({
  id: "test.hostile-contact.validator",
  version: 1,
  conceptIds: ["numpy.logical_and"],
  allowedStages: [LearningStage.TRANSFER],
  generator: {
    id: CS116_GENERATOR_ID.HOSTILE_CONTACT,
    config: {
      instructionLevel: "TRANSFER",
      baseEntityCount: 6,
      distanceMin: 10,
      distanceMaxExclusive: 100,
      threatMin: 1,
      threatMaxExclusive: 11,
      distanceLimitMin: 35,
      distanceLimitMaxExclusive: 75,
      threatThresholdMin: 4,
      threatThresholdMaxExclusive: 9,
    },
  },
  grader: { id: "test.grader" },
  runtime: { id: "test.runtime" },
});

function instance(seed: string) {
  return createMissionInstance({
    template,
    seed,
    difficulty: Difficulty.EASY,
    generated: hostileContactGenerator.generate({
      templateVersion: 1,
      config: template.generator.config,
      difficulty: Difficulty.EASY,
      rng: createSeededRng(seed),
    }),
  });
}

describe("hostileContactInstanceValidator", () => {
  it("accepts a non-trivial generated selection", () => {
    for (let index = 0; index < 50; index += 1) {
      const candidate = instance(`hostile-validator-${index}`);
      const result = hostileContactInstanceValidator.validate(candidate);
      if (result.valid) {
        expect(candidate.grading?.data?.expectedEntityIds).not.toEqual([]);
        return;
      }
    }

    throw new Error("Expected at least one deterministic valid hostile-contact candidate.");
  });

  it("rejects malformed learner/grading selection data", () => {
    const candidate = instance("hostile-malformed");
    const malformed = {
      ...candidate,
      grading: { data: { expectedEntityIds: ["unknown-contact"] } },
    };

    expect(hostileContactInstanceValidator.validate(malformed)).toMatchObject({
      valid: false,
      issues: [{ code: "HOSTILE_CONTACT_INVALID_DATA" }],
    });
  });
});
