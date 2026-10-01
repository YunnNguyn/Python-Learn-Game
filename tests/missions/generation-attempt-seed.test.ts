import { describe, expect, it } from "vitest";

import {
  Difficulty,
  LearningStage,
  MissionTemplateSchema,
  type MissionTemplate,
} from "../../src/core/domain";
import {
  GENERATION_ATTEMPT_SEED_POLICY,
  createMissionInstance,
  deriveGenerationAttemptSeed,
  type MissionGeneratorOutput,
} from "../../src/core/missions";
import {
  createSeededRng,
  type SeededRng,
} from "../../src/core/random";

interface RetryCandidate {
  readonly value: number;
  readonly marker: number;
}

interface RejectedAttempt {
  readonly attemptIndex: number;
  readonly attemptSeed: string;
  readonly candidate: RetryCandidate;
}

interface AcceptedSimulation {
  readonly rejected: readonly RejectedAttempt[];
  readonly acceptedAttemptIndex: number;
  readonly acceptedAttemptSeed: string;
  readonly candidate: RetryCandidate;
  readonly generated: MissionGeneratorOutput;
}

function createRetryFixtureTemplate(): MissionTemplate {
  return MissionTemplateSchema.parse({
    id: "mission.retry.fixture",
    version: 1,
    conceptIds: ["concept.retry.fixture"],
    allowedStages: [LearningStage.INDEPENDENT],
    generator: {
      id: "generator.retry.fixture",
      config: { acceptanceThreshold: 80 },
    },
    grader: { id: "grader.retry.fixture" },
    runtime: { id: "runtime.retry.fixture" },
  });
}

function createFixtureCandidate(rng: SeededRng): RetryCandidate {
  return {
    value: rng.nextInt(0, 100),
    marker: rng.nextInt(1000, 10000),
  };
}

function testOnlyValidator(candidate: RetryCandidate): boolean {
  return candidate.value >= 80;
}

function candidateToGenerated(
  candidate: RetryCandidate,
): MissionGeneratorOutput {
  return {
    learner: {
      objective: "Inspect the deterministic retry candidate.",
      data: {
        value: candidate.value,
        marker: candidate.marker,
      },
    },
    runtime: {
      setupData: { value: candidate.value },
    },
    grading: {
      data: { expectedMarker: candidate.marker },
    },
    world: {
      initialState: { acceptedValue: candidate.value },
    },
  };
}

function simulateGeneration(baseSeed: string): AcceptedSimulation | undefined {
  const rejected: RejectedAttempt[] = [];

  // This bound belongs only to the test fixture. F4.5 does not define a
  // production max-attempt policy or production retry loop.
  for (let attemptIndex = 0; attemptIndex < 4; attemptIndex += 1) {
    const attemptSeed = deriveGenerationAttemptSeed(baseSeed, attemptIndex);
    const candidate = createFixtureCandidate(createSeededRng(attemptSeed));

    if (testOnlyValidator(candidate)) {
      return {
        rejected,
        acceptedAttemptIndex: attemptIndex,
        acceptedAttemptSeed: attemptSeed,
        candidate,
        generated: candidateToGenerated(candidate),
      };
    }

    rejected.push({ attemptIndex, attemptSeed, candidate });
  }

  return undefined;
}

describe("deriveGenerationAttemptSeed", () => {
  it("locks the retry seed policy identifier", () => {
    expect(GENERATION_ATTEMPT_SEED_POLICY).toBe("mission-retry-seed-v1");
  });

  it.each([
    "abc",
    "Seed",
    " seed ",
    "a:b/c ?#",
    "Unicode hạt giống 日本語",
  ])("returns attempt zero as the exact base seed: %s", (baseSeed) => {
    expect(deriveGenerationAttemptSeed(baseSeed, 0)).toBe(baseSeed);
  });

  it("locks simple retry golden values", () => {
    expect(deriveGenerationAttemptSeed("abc", 1)).toBe(
      "mission-retry:v1:1:abc",
    );
    expect(deriveGenerationAttemptSeed("abc", 2)).toBe(
      "mission-retry:v1:2:abc",
    );
  });

  it("locks a delimiter-sensitive retry golden value", () => {
    expect(deriveGenerationAttemptSeed("a:b/c ?#", 1)).toBe(
      "mission-retry:v1:1:a%3Ab%2Fc%20%3F%23",
    );
  });

  it.each([
    ["a:b", "mission-retry:v1:1:a%3Ab"],
    ["a/b", "mission-retry:v1:1:a%2Fb"],
    ["a?b", "mission-retry:v1:1:a%3Fb"],
    ["a#b", "mission-retry:v1:1:a%23b"],
    ["a b", "mission-retry:v1:1:a%20b"],
    ["a%b", "mission-retry:v1:1:a%25b"],
  ])("encodes delimiter-sensitive base seed %s", (baseSeed, expected) => {
    expect(deriveGenerationAttemptSeed(baseSeed, 1)).toBe(expected);
  });

  it("recreates the same derived seed without state", () => {
    const first = deriveGenerationAttemptSeed("recreate", 7);
    const second = deriveGenerationAttemptSeed("recreate", 7);

    expect(second).toBe(first);
  });

  it("produces distinct strings for representative retry indexes", () => {
    const seeds = [1, 2, 3].map((attemptIndex) =>
      deriveGenerationAttemptSeed("same-base", attemptIndex),
    );

    expect(new Set(seeds).size).toBe(3);
  });

  it("preserves distinct representative base seeds at the same retry index", () => {
    const seeds = ["alpha", "beta", "gamma"].map((baseSeed) =>
      deriveGenerationAttemptSeed(baseSeed, 2),
    );

    expect(new Set(seeds).size).toBe(3);
  });

  it("does not normalize case or surrounding whitespace", () => {
    const seeds = ["seed", "Seed", " seed "].map((baseSeed) =>
      deriveGenerationAttemptSeed(baseSeed, 1),
    );

    expect(new Set(seeds).size).toBe(3);
    expect(seeds).toEqual([
      "mission-retry:v1:1:seed",
      "mission-retry:v1:1:Seed",
      "mission-retry:v1:1:%20seed%20",
    ]);
  });

  it.each([
    -1,
    -10,
    0.5,
    1.1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid attempt index %s with RangeError", (attemptIndex) => {
    expect(() => deriveGenerationAttemptSeed("base", attemptIndex)).toThrow(
      RangeError,
    );
    expect(() => deriveGenerationAttemptSeed("base", attemptIndex)).toThrow(
      "attemptIndex must be a finite non-negative safe integer.",
    );
  });

  it("accepts Number.MAX_SAFE_INTEGER without overflow arithmetic", () => {
    expect(
      deriveGenerationAttemptSeed("abc", Number.MAX_SAFE_INTEGER),
    ).toBe("mission-retry:v1:9007199254740991:abc");
  });

  it("reproduces the same RNG stream from the same derived retry seed", () => {
    const attemptSeedA = deriveGenerationAttemptSeed("rng-retry", 2);
    const attemptSeedB = deriveGenerationAttemptSeed("rng-retry", 2);
    const rngA = createSeededRng(attemptSeedA);
    const rngB = createSeededRng(attemptSeedB);

    const streamA = Array.from({ length: 8 }, () => rngA.nextInt(0, 10000));
    const streamB = Array.from({ length: 8 }, () => rngB.nextInt(0, 10000));

    expect(streamA).toEqual(streamB);
  });

  it("gives selected different retry attempts different fixed RNG streams", () => {
    const first = createSeededRng(
      deriveGenerationAttemptSeed("rng-attempt-variant", 1),
    );
    const second = createSeededRng(
      deriveGenerationAttemptSeed("rng-attempt-variant", 2),
    );

    const firstStream = Array.from({ length: 6 }, () => first.nextInt(0, 10000));
    const secondStream = Array.from({ length: 6 }, () =>
      second.nextInt(0, 10000),
    );

    expect(firstStream).not.toEqual(secondStream);
  });
});

describe("test-only deterministic retry composition", () => {
  const baseSeed = "retry-fixture-seed";

  it("reproduces rejected candidates, accepted attempt, and accepted output", () => {
    const first = simulateGeneration(baseSeed);
    const second = simulateGeneration(baseSeed);

    expect(first).toBeDefined();
    expect(second).toEqual(first);
    expect(first!.rejected.length).toBeGreaterThan(0);
    expect(first!.acceptedAttemptIndex).toBeGreaterThan(0);
  });

  it("keeps the base seed and base-seed identity on the accepted MissionInstance", () => {
    const template = createRetryFixtureTemplate();
    const simulation = simulateGeneration(baseSeed);

    expect(simulation).toBeDefined();

    const instance = createMissionInstance({
      template,
      seed: baseSeed,
      difficulty: Difficulty.NORMAL,
      generated: simulation!.generated,
    });

    expect(instance.seed).toBe(baseSeed);
    expect(instance.id).toBe(
      `mission-instance:${encodeURIComponent(template.id)}:v1:NORMAL:${encodeURIComponent(baseSeed)}`,
    );
    expect(instance.id).not.toContain(
      encodeURIComponent(simulation!.acceptedAttemptSeed),
    );
    expect("generationAttempt" in instance).toBe(false);
    expect("retrySeed" in instance).toBe(false);
  });

  it("reproduces the same accepted generator output and full MissionInstance", () => {
    const template = createRetryFixtureTemplate();
    const first = simulateGeneration(baseSeed);
    const second = simulateGeneration(baseSeed);

    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second!.acceptedAttemptIndex).toBe(first!.acceptedAttemptIndex);
    expect(second!.generated).toEqual(first!.generated);

    const firstInstance = createMissionInstance({
      template,
      seed: baseSeed,
      difficulty: Difficulty.NORMAL,
      generated: first!.generated,
    });
    const secondInstance = createMissionInstance({
      template,
      seed: baseSeed,
      difficulty: Difficulty.NORMAL,
      generated: second!.generated,
    });

    expect(secondInstance).toEqual(firstInstance);
    expect(firstInstance.seed).toBe(baseSeed);
  });
});
