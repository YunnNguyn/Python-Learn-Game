import { describe, expect, it } from "vitest";

import {
  Difficulty,
  LearningStage,
  MissionInstanceSchema,
  MissionTemplateSchema,
  type Difficulty as DifficultyValue,
  type MissionInstance,
  type MissionTemplate,
} from "../../src/core/domain";
import {
  createMissionInstance,
  type MissionGeneratorOutput,
} from "../../src/core/missions";
import {
  createSeededRng,
  type SeededRng,
} from "../../src/core/random";

const TEMPLATE_ID = "mission.determinism.fixture";

function createFixtureTemplate(
  version = 1,
  config: Record<string, string | number> = {
    sampleCount: 4,
    minValue: 10,
    maxValue: 90,
    thresholdMin: 30,
    thresholdMax: 70,
    labelPrefix: "fixture",
  },
): MissionTemplate {
  return MissionTemplateSchema.parse({
    id: TEMPLATE_ID,
    version,
    conceptIds: ["concept.determinism.alpha", "concept.determinism.beta"],
    allowedStages: [LearningStage.INDEPENDENT],
    generator: {
      id: "generator.determinism.fixture",
      config,
    },
    grader: {
      id: "grader.determinism.fixture",
    },
    runtime: {
      id: "runtime.determinism.fixture",
    },
    starterCode: "values = []\n",
  });
}

function requireNumberConfig(
  template: MissionTemplate,
  key: string,
): number {
  const value = template.generator.config?.[key];

  if (typeof value !== "number") {
    throw new TypeError(`Fixture config ${key} must be numeric.`);
  }

  return value;
}

function requireStringConfig(
  template: MissionTemplate,
  key: string,
): string {
  const value = template.generator.config?.[key];

  if (typeof value !== "string") {
    throw new TypeError(`Fixture config ${key} must be a string.`);
  }

  return value;
}

function generateFixtureOutput(
  template: MissionTemplate,
  difficulty: DifficultyValue,
  rng: SeededRng,
): MissionGeneratorOutput {
  const baseSampleCount = requireNumberConfig(template, "sampleCount");
  const minValue = requireNumberConfig(template, "minValue");
  const maxValue = requireNumberConfig(template, "maxValue");
  const thresholdMin = requireNumberConfig(template, "thresholdMin");
  const thresholdMax = requireNumberConfig(template, "thresholdMax");
  const labelPrefix = requireStringConfig(template, "labelPrefix");

  const difficultyAdjustment = {
    [Difficulty.EASY]: -1,
    [Difficulty.NORMAL]: 0,
    [Difficulty.HARD]: 1,
  }[difficulty];
  const sampleCount = baseSampleCount + difficultyAdjustment;

  if (!Number.isSafeInteger(sampleCount) || sampleCount < 1) {
    throw new RangeError("Fixture sample count must be a positive safe integer.");
  }

  // RNG call order is part of reproducible generator behavior. A production
  // generator/config change that alters this sequence requires a template
  // version bump so historical MissionInstances remain reproducible.
  const values = Array.from({ length: sampleCount }, () =>
    rng.nextInt(minValue, maxValue + 1),
  );
  const threshold = rng.nextInt(thresholdMin, thresholdMax + 1);
  const label = `${labelPrefix}-${rng.pick(["alpha", "beta", "gamma"])}-${rng.nextInt(100, 1000)}`;
  const qualifyingCount = values.filter((value) => value >= threshold).length;

  return {
    learner: {
      objective: `Inspect ${sampleCount} generated values for ${label}.`,
      context: "Deterministic integration fixture.",
      data: {
        values,
        threshold,
        label,
        sampleCount,
      },
      visibleTests: [
        {
          name: "sample-count",
          expected: sampleCount,
        },
      ],
    },
    runtime: {
      setupData: {
        values,
        threshold,
      },
    },
    grading: {
      data: {
        expectedQualifyingCount: qualifyingCount,
        threshold,
      },
    },
    world: {
      initialState: {
        label,
        sampleCount,
        difficulty,
      },
    },
  };
}

function generateFixtureInstance(
  template: MissionTemplate,
  difficulty: DifficultyValue,
  seed: string,
): MissionInstance {
  const rng = createSeededRng(seed);
  const generated = generateFixtureOutput(template, difficulty, rng);

  return createMissionInstance({
    template,
    seed,
    difficulty,
    generated,
  });
}

describe("end-to-end mission determinism", () => {
  it("reproduces the entire MissionInstance from the same template, difficulty, and seed", () => {
    const template = createFixtureTemplate();
    const first = generateFixtureInstance(
      template,
      Difficulty.NORMAL,
      "determinism-primary",
    );
    const second = generateFixtureInstance(
      template,
      Difficulty.NORMAL,
      "determinism-primary",
    );

    expect(first).toEqual(second);
    expect(first.learner.data).toEqual(second.learner.data);
    expect(first.runtime).toEqual(second.runtime);
    expect(first.grading).toEqual(second.grading);
    expect(first.world).toEqual(second.world);
  });

  it("repeats the same tuple from fresh RNG instances without drift", () => {
    const template = createFixtureTemplate();
    const instances = Array.from({ length: 5 }, () =>
      generateFixtureInstance(template, Difficulty.NORMAL, "repeat-five"),
    );

    for (const instance of instances.slice(1)) {
      expect(instance).toEqual(instances[0]);
    }
  });

  it.each(["fixed-seed-01", "fixed-seed-02", "fixed-seed-03"])(
    "reproduces a representative fixed seed: %s",
    (seed) => {
      const template = createFixtureTemplate();

      expect(
        generateFixtureInstance(template, Difficulty.NORMAL, seed),
      ).toEqual(generateFixtureInstance(template, Difficulty.NORMAL, seed));
    },
  );

  it("reproduces across separately parsed equivalent MissionTemplates", () => {
    const firstTemplate = createFixtureTemplate();
    const secondTemplate = createFixtureTemplate();

    expect(firstTemplate).not.toBe(secondTemplate);
    expect(firstTemplate).toEqual(secondTemplate);
    expect(
      generateFixtureInstance(
        firstTemplate,
        Difficulty.NORMAL,
        "equivalent-template",
      ),
    ).toEqual(
      generateFixtureInstance(
        secondTemplate,
        Difficulty.NORMAL,
        "equivalent-template",
      ),
    );
  });

  it("reproduces after a JSON round trip and canonical template parse", () => {
    const template = createFixtureTemplate();
    const roundTripped = MissionTemplateSchema.parse(
      JSON.parse(JSON.stringify(template)),
    );

    expect(
      generateFixtureInstance(template, Difficulty.HARD, "json-round-trip"),
    ).toEqual(
      generateFixtureInstance(
        roundTripped,
        Difficulty.HARD,
        "json-round-trip",
      ),
    );
  });

  it("uses a changed fixed seed to produce a deterministic allowed variant", () => {
    const template = createFixtureTemplate();
    const first = generateFixtureInstance(
      template,
      Difficulty.NORMAL,
      "determinism-seed-a",
    );
    const second = generateFixtureInstance(
      template,
      Difficulty.NORMAL,
      "determinism-seed-b",
    );

    expect(first.id).not.toBe(second.id);
    expect(first.seed).not.toBe(second.seed);
    expect(first.learner.data?.values).not.toEqual(second.learner.data?.values);
    expect(first.learner.data).not.toEqual(second.learner.data);
  });

  it.each([Difficulty.EASY, Difficulty.NORMAL, Difficulty.HARD])(
    "reproduces difficulty %s from the same seed",
    (difficulty) => {
      const template = createFixtureTemplate();

      expect(
        generateFixtureInstance(template, difficulty, "difficulty-reproduction"),
      ).toEqual(
        generateFixtureInstance(template, difficulty, "difficulty-reproduction"),
      );
    },
  );

  it("lets difficulty deterministically affect the fixture payload", () => {
    const template = createFixtureTemplate();
    const easy = generateFixtureInstance(
      template,
      Difficulty.EASY,
      "difficulty-variant",
    );
    const hard = generateFixtureInstance(
      template,
      Difficulty.HARD,
      "difficulty-variant",
    );

    expect(easy.learner.data?.sampleCount).toBe(3);
    expect(hard.learner.data?.sampleCount).toBe(5);
    expect(easy.learner.data).not.toEqual(hard.learner.data);
  });

  it("ties reproducibility-relevant config changes to a template version change", () => {
    const versionOne = createFixtureTemplate(1);
    const versionTwo = createFixtureTemplate(2, {
      sampleCount: 6,
      minValue: 10,
      maxValue: 90,
      thresholdMin: 30,
      thresholdMax: 70,
      labelPrefix: "fixture-v2",
    });
    const seed = "versioned-config";

    const first = generateFixtureInstance(
      versionOne,
      Difficulty.NORMAL,
      seed,
    );
    const second = generateFixtureInstance(
      versionTwo,
      Difficulty.NORMAL,
      seed,
    );

    expect(first.templateId).toBe(second.templateId);
    expect(first.templateVersion).toBe(1);
    expect(second.templateVersion).toBe(2);
    expect(first.id).not.toBe(second.id);
    expect(first.learner.data?.sampleCount).toBe(4);
    expect(second.learner.data?.sampleCount).toBe(6);
    expect(first.learner.data?.label).not.toBe(second.learner.data?.label);
  });

  it("reproduces inherited template starter code", () => {
    const template = createFixtureTemplate();
    const first = generateFixtureInstance(
      template,
      Difficulty.NORMAL,
      "starter-code",
    );
    const second = generateFixtureInstance(
      template,
      Difficulty.NORMAL,
      "starter-code",
    );

    expect(first.learner.starterCode).toBe("values = []\n");
    expect(second.learner.starterCode).toBe(first.learner.starterCode);
  });

  it("preserves an exact nontrivial seed while reproducing the full instance", () => {
    const template = createFixtureTemplate();
    const seed = "mission seed:/? #01";
    const first = generateFixtureInstance(template, Difficulty.NORMAL, seed);
    const second = generateFixtureInstance(template, Difficulty.NORMAL, seed);

    expect(first.seed).toBe(seed);
    expect(second).toEqual(first);
  });

  it("does not mutate the MissionTemplate or generator config during generation", () => {
    const template = createFixtureTemplate();
    const templateSnapshot = JSON.stringify(template);
    const configSnapshot = JSON.stringify(template.generator.config);

    generateFixtureInstance(template, Difficulty.HARD, "immutability");

    expect(JSON.stringify(template)).toBe(templateSnapshot);
    expect(JSON.stringify(template.generator.config)).toBe(configSnapshot);
  });

  it.each([Difficulty.EASY, Difficulty.NORMAL, Difficulty.HARD])(
    "produces a canonical schema-valid MissionInstance for %s",
    (difficulty) => {
      const instance = generateFixtureInstance(
        createFixtureTemplate(),
        difficulty,
        `schema-${difficulty}`,
      );

      expect(MissionInstanceSchema.safeParse(instance).success).toBe(true);
    },
  );
});
