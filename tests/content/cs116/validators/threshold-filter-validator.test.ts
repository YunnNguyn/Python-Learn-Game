import { describe, expect, it } from "vitest";

import {
  Difficulty,
  LearningStage,
  MissionTemplateSchema,
  type Difficulty as DifficultyValue,
  type JsonObject,
  type MissionInstance,
  type MissionTemplate,
} from "../../../../src/core/domain";
import {
  createMissionInstance,
  deriveGenerationAttemptSeed,
  type MissionGeneratorOutput,
} from "../../../../src/core/missions";
import { createSeededRng } from "../../../../src/core/random";
import {
  CS116_GENERATOR_ID,
  THRESHOLD_FILTER_VALIDATION_CODE,
  thresholdFilterGenerator,
  thresholdFilterInstanceValidator,
} from "../../../../src/content/cs116";

const FILTER_CONFIG = {
  instructionLevel: "GUIDED",
  baseEntityCount: 4,
  valueMin: 0,
  valueMaxExclusive: 20,
  thresholdMin: 4,
  thresholdMaxExclusive: 16,
  comparison: "GT",
} satisfies JsonObject;

const VALID_LEARNER_DATA = {
  entityIds: ["sensor-1", "sensor-2", "sensor-3"],
  values: [5, 11, 3],
  threshold: 4,
  comparison: "GT",
} satisfies JsonObject;

const VALID_GRADING_DATA = {
  expectedEntityIds: ["sensor-1", "sensor-2"],
} satisfies JsonObject;

function createThresholdTemplate(): MissionTemplate {
  return MissionTemplateSchema.parse({
    id: "mission.cs116.threshold-filter.validator",
    version: 1,
    conceptIds: ["numpy.compare"],
    allowedStages: [LearningStage.INDEPENDENT],
    generator: {
      id: CS116_GENERATOR_ID.THRESHOLD_FILTER,
      config: FILTER_CONFIG,
    },
    grader: { id: "grader.test.cs116.threshold-filter" },
    runtime: { id: "runtime.test.cs116.threshold-filter" },
  });
}

function createFixtureInstance(options: {
  readonly learnerData?: JsonObject;
  readonly gradingData?: JsonObject;
  readonly omitLearnerData?: boolean;
  readonly omitGrading?: boolean;
  readonly seed?: string;
} = {}): MissionInstance {
  const generated: MissionGeneratorOutput = {
    learner: {
      objective: "Select sensors that satisfy the threshold rule.",
      ...(!options.omitLearnerData
        ? { data: options.learnerData ?? VALID_LEARNER_DATA }
        : {}),
    },
    ...(!options.omitGrading
      ? { grading: { data: options.gradingData ?? VALID_GRADING_DATA } }
      : {}),
  };

  return createMissionInstance({
    template: createThresholdTemplate(),
    seed: options.seed ?? "validator-fixture",
    difficulty: Difficulty.EASY,
    generated,
  });
}

function createGeneratedInstance(
  seed: string,
  difficulty: DifficultyValue,
): MissionInstance {
  const template = createThresholdTemplate();
  const generated = thresholdFilterGenerator.generate({
    templateVersion: template.version,
    config: template.generator.config,
    difficulty,
    rng: createSeededRng(seed),
  });

  return createMissionInstance({
    template,
    seed,
    difficulty,
    generated,
  });
}

describe("thresholdFilterInstanceValidator", () => {
  it("accepts a valid family instance with no issues", () => {
    expect(thresholdFilterInstanceValidator.validate(createFixtureInstance())).toEqual({
      valid: true,
      issues: [],
    });
  });

  it("rejects an empty selection", () => {
    const result = thresholdFilterInstanceValidator.validate(
      createFixtureInstance({ gradingData: { expectedEntityIds: [] } }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toEqual([
      THRESHOLD_FILTER_VALIDATION_CODE.EMPTY_SELECTION,
    ]);
  });

  it("rejects a universal selection", () => {
    const result = thresholdFilterInstanceValidator.validate(
      createFixtureInstance({
        gradingData: {
          expectedEntityIds: ["sensor-1", "sensor-2", "sensor-3"],
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toEqual([
      THRESHOLD_FILTER_VALIDATION_CODE.UNIVERSAL_SELECTION,
    ]);
  });

  it("reports one invalid-data issue when learner data is missing", () => {
    const result = thresholdFilterInstanceValidator.validate(
      createFixtureInstance({ omitLearnerData: true }),
    );

    expect(result).toEqual({
      valid: false,
      issues: [
        expect.objectContaining({
          code: THRESHOLD_FILTER_VALIDATION_CODE.INVALID_DATA,
        }),
      ],
    });
  });

  it.each([
    ["missing grading", { omitGrading: true }],
    ["missing expectedEntityIds", { gradingData: {} }],
    ["malformed expectedEntityIds", { gradingData: { expectedEntityIds: "sensor-1" } }],
  ] as const)("reports invalid data for %s", (_label, options) => {
    const result = thresholdFilterInstanceValidator.validate(
      createFixtureInstance(options),
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]!.code).toBe(
      THRESHOLD_FILTER_VALIDATION_CODE.INVALID_DATA,
    );
  });

  it.each([
    [
      "values/entityIds length mismatch",
      {
        ...VALID_LEARNER_DATA,
        values: [5, 11],
      },
      VALID_GRADING_DATA,
    ],
    [
      "fewer than two entities",
      {
        entityIds: ["sensor-1"],
        values: [5],
        threshold: 4,
        comparison: "GT",
      },
      { expectedEntityIds: ["sensor-1"] },
    ],
    [
      "duplicate entity IDs",
      {
        ...VALID_LEARNER_DATA,
        entityIds: ["sensor-1", "sensor-1", "sensor-3"],
      },
      VALID_GRADING_DATA,
    ],
    [
      "duplicate expected IDs",
      VALID_LEARNER_DATA,
      { expectedEntityIds: ["sensor-1", "sensor-1"] },
    ],
    [
      "expected ID absent from entityIds",
      VALID_LEARNER_DATA,
      { expectedEntityIds: ["sensor-1", "sensor-99"] },
    ],
    [
      "unsupported comparison",
      { ...VALID_LEARNER_DATA, comparison: "LT" },
      VALID_GRADING_DATA,
    ],
  ] satisfies ReadonlyArray<readonly [string, JsonObject, JsonObject]>)(
    "reports one invalid-data issue for %s",
    (_label, learnerData, gradingData) => {
      const result = thresholdFilterInstanceValidator.validate(
        createFixtureInstance({ learnerData, gradingData }),
      );

      expect(result.valid).toBe(false);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]!.code).toBe(
        THRESHOLD_FILTER_VALIDATION_CODE.INVALID_DATA,
      );
    },
  );

  it("stops after malformed family data instead of adding semantic issues", () => {
    const result = thresholdFilterInstanceValidator.validate(
      createFixtureInstance({
        learnerData: {
          ...VALID_LEARNER_DATA,
          values: [5],
        },
        gradingData: { expectedEntityIds: [] },
      }),
    );

    expect(result.issues.map((entry) => entry.code)).toEqual([
      THRESHOLD_FILTER_VALIDATION_CODE.INVALID_DATA,
    ]);
  });

  it("does not reference-solve or recompute expected IDs", () => {
    const instance = createFixtureInstance({
      learnerData: {
        entityIds: ["sensor-1", "sensor-2", "sensor-3"],
        values: [1, 2, 3],
        threshold: 100,
        comparison: "GT",
      },
      gradingData: { expectedEntityIds: ["sensor-2"] },
    });

    expect(thresholdFilterInstanceValidator.validate(instance)).toEqual({
      valid: true,
      issues: [],
    });
  });

  it("does not mutate the MissionInstance", () => {
    const instance = createFixtureInstance({
      gradingData: { expectedEntityIds: [] },
    });
    const before = structuredClone(instance);

    thresholdFilterInstanceValidator.validate(instance);

    expect(instance).toEqual(before);
  });

  it("is deterministic and returns fresh issue arrays and issue objects", () => {
    const instance = createFixtureInstance({
      gradingData: { expectedEntityIds: [] },
    });
    const first = thresholdFilterInstanceValidator.validate(instance);
    const second = thresholdFilterInstanceValidator.validate(instance);

    expect(second).toEqual(first);
    expect(second.issues).not.toBe(first.issues);
    expect(second.issues[0]).not.toBe(first.issues[0]);
  });

  it("does not share mutable issue state across calls", () => {
    const instance = createFixtureInstance({
      gradingData: { expectedEntityIds: [] },
    });
    const first = thresholdFilterInstanceValidator.validate(instance);
    const callerOwnedIssues = first.issues as Array<{
      code: string;
      message: string;
    }>;
    callerOwnedIssues.push({ code: "CALLER_MUTATION", message: "test mutation" });

    const second = thresholdFilterInstanceValidator.validate(instance);
    expect(second.issues).toHaveLength(1);
    expect(second.issues[0]!.code).toBe(
      THRESHOLD_FILTER_VALIDATION_CODE.EMPTY_SELECTION,
    );
  });
});

describe("production Threshold Filter generator composition", () => {
  it("composes generator -> canonical MissionInstance -> validator", () => {
    const instance = createGeneratedInstance("f5.3-easy-0", Difficulty.EASY);

    expect(instance.templateId).toBe("mission.cs116.threshold-filter.validator");
    expect(thresholdFilterInstanceValidator.validate(instance)).toEqual({
      valid: true,
      issues: [],
    });
  });

  it("proves a generated empty candidate still creates canonically and is then rejected", () => {
    const seed = "f5.3-retry-fixed-3";
    const instance = createGeneratedInstance(seed, Difficulty.EASY);

    expect(instance.grading?.data?.expectedEntityIds).toEqual([]);
    expect(instance.seed).toBe(seed);
    expect(thresholdFilterInstanceValidator.validate(instance).issues).toEqual([
      expect.objectContaining({
        code: THRESHOLD_FILTER_VALIDATION_CODE.EMPTY_SELECTION,
      }),
    ]);
  });

  it.each([
    [Difficulty.EASY, "f5.3-easy-0"],
    [Difficulty.NORMAL, "f5.3-normal-0"],
    [Difficulty.HARD, "f5.3-hard-0"],
  ] as const)("accepts a representative generated %s candidate", (difficulty, seed) => {
    const instance = createGeneratedInstance(seed, difficulty);
    expect(thresholdFilterInstanceValidator.validate(instance).valid).toBe(true);
  });

  it("reproduces generated candidates and validation results across a 20-seed sweep", () => {
    for (let index = 0; index < 20; index += 1) {
      const seed = `f5.3-sweep-${index}`;
      const first = createGeneratedInstance(seed, Difficulty.EASY);
      const second = createGeneratedInstance(seed, Difficulty.EASY);

      expect(second).toEqual(first);
      expect(thresholdFilterInstanceValidator.validate(second)).toEqual(
        thresholdFilterInstanceValidator.validate(first),
      );
    }
  });
});

interface RetryTrace {
  readonly rejected: readonly {
    readonly attemptIndex: number;
    readonly codes: readonly string[];
  }[];
  readonly acceptedAttemptIndex: number;
  readonly acceptedInstance: MissionInstance;
}

function simulateThresholdRetry(baseSeed: string): RetryTrace {
  const template = createThresholdTemplate();
  const rejected: Array<{
    readonly attemptIndex: number;
    readonly codes: readonly string[];
  }> = [];

  for (let attemptIndex = 0; attemptIndex < 4; attemptIndex += 1) {
    const attemptSeed = deriveGenerationAttemptSeed(baseSeed, attemptIndex);
    const generated = thresholdFilterGenerator.generate({
      templateVersion: template.version,
      config: template.generator.config,
      difficulty: Difficulty.EASY,
      rng: createSeededRng(attemptSeed),
    });
    const instance = createMissionInstance({
      template,
      seed: baseSeed,
      difficulty: Difficulty.EASY,
      generated,
    });
    const validation = thresholdFilterInstanceValidator.validate(instance);

    if (validation.valid) {
      return {
        rejected,
        acceptedAttemptIndex: attemptIndex,
        acceptedInstance: instance,
      };
    }

    rejected.push({
      attemptIndex,
      codes: validation.issues.map((entry) => entry.code),
    });
  }

  throw new Error("Test fixture did not produce a valid candidate within its bound.");
}

describe("test-only F4.5 + F5.2 + F5.3 retry composition", () => {
  it("reproduces rejected attempts, accepted attempt, and accepted canonical instance", () => {
    const baseSeed = "f5.3-retry-fixed-3";
    const first = simulateThresholdRetry(baseSeed);
    const second = simulateThresholdRetry(baseSeed);

    expect(second).toEqual(first);
    expect(first.rejected).toEqual([
      {
        attemptIndex: 0,
        codes: [THRESHOLD_FILTER_VALIDATION_CODE.EMPTY_SELECTION],
      },
    ]);
    expect(first.acceptedAttemptIndex).toBe(1);
    expect(first.acceptedInstance.seed).toBe(baseSeed);
    expect(first.acceptedInstance.grading?.data?.expectedEntityIds).toEqual([
      "sensor-2",
      "sensor-3",
    ]);

    const root = first.acceptedInstance as unknown as Record<string, unknown>;
    expect(root.generationAttempt).toBeUndefined();
    expect(root.attemptIndex).toBeUndefined();
    expect(root.retrySeed).toBeUndefined();
  });
});
