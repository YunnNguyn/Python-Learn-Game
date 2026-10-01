import { describe, expect, it } from "vitest";

import {
  Difficulty,
  LearningStage,
  MissionTemplateSchema,
  type MissionGeneratorId,
} from "../../src/core/domain";
import {
  ExtensionKind,
  validateExtensionIds,
  type ExtensionCapabilitySet,
} from "../../src/core/content";
import {
  GeneratorRegistry,
  type MissionGenerator,
  type MissionGeneratorContext,
} from "../../src/core/generators";
import { createSeededRng } from "../../src/core/random";

const generatorId = (value: string): MissionGeneratorId =>
  value as MissionGeneratorId;

function createFixtureGenerator(): MissionGenerator {
  return {
    generate({ templateVersion, config, difficulty, rng }) {
      return {
        learner: {
          objective: `Fixture v${templateVersion}`,
          data: {
            value: rng.nextInt(0, 1000),
            difficulty,
            ...(config !== undefined ? { config } : {}),
          },
        },
      };
    },
  };
}

describe("GeneratorRegistry", () => {
  it("starts empty", () => {
    const registry = new GeneratorRegistry();

    expect(registry.getGenerator(generatorId("generator.missing"))).toBeUndefined();
    expect(registry.getGeneratorIds()).toEqual([]);
  });

  it("registers and returns the canonical implementation reference", () => {
    const registry = new GeneratorRegistry();
    const id = generatorId("generator.fixture");
    const generator = createFixtureGenerator();

    registry.registerGenerator(id, generator);

    expect(registry.getGenerator(id)).toBe(generator);
  });

  it("resolves multiple generators independently", () => {
    const registry = new GeneratorRegistry();
    const generatorA = createFixtureGenerator();
    const generatorB = createFixtureGenerator();
    const generatorC = createFixtureGenerator();

    registry.registerGenerator(generatorId("generator.a"), generatorA);
    registry.registerGenerator(generatorId("generator.b"), generatorB);
    registry.registerGenerator(generatorId("generator.c"), generatorC);

    expect(registry.getGenerator(generatorId("generator.a"))).toBe(generatorA);
    expect(registry.getGenerator(generatorId("generator.b"))).toBe(generatorB);
    expect(registry.getGenerator(generatorId("generator.c"))).toBe(generatorC);
    expect(
      registry.getGenerator(generatorId("generator.unknown")),
    ).toBeUndefined();
  });

  it("rejects duplicate IDs before mutating the original mapping", () => {
    const registry = new GeneratorRegistry();
    const id = generatorId("generator.duplicate");
    const original = createFixtureGenerator();

    registry.registerGenerator(id, original);

    expect(() => registry.registerGenerator(id, original)).toThrow(
      "Generator ID already registered: generator.duplicate",
    );
    expect(registry.getGenerator(id)).toBe(original);
    expect(registry.getGeneratorIds()).toEqual([id]);
  });

  it("rejects the same ID with a different implementation", () => {
    const registry = new GeneratorRegistry();
    const id = generatorId("generator.duplicate-different");
    const original = createFixtureGenerator();
    const replacement = createFixtureGenerator();

    registry.registerGenerator(id, original);

    expect(() => registry.registerGenerator(id, replacement)).toThrow(Error);
    expect(registry.getGenerator(id)).toBe(original);
  });

  it("allows different IDs to share one implementation", () => {
    const registry = new GeneratorRegistry();
    const shared = createFixtureGenerator();
    const idA = generatorId("generator.shared.a");
    const idB = generatorId("generator.shared.b");

    registry.registerGenerator(idA, shared);
    registry.registerGenerator(idB, shared);

    expect(registry.getGenerator(idA)).toBe(shared);
    expect(registry.getGenerator(idB)).toBe(shared);
  });

  it("preserves registration order", () => {
    const registry = new GeneratorRegistry();
    const ids = [
      generatorId("generator.c"),
      generatorId("generator.a"),
      generatorId("generator.b"),
    ];

    for (const id of ids) {
      registry.registerGenerator(id, createFixtureGenerator());
    }

    expect(registry.getGeneratorIds()).toEqual(ids);
  });

  it("returns an isolated generator-ID snapshot", () => {
    const registry = new GeneratorRegistry();
    const idA = generatorId("generator.snapshot.a");
    const idB = generatorId("generator.snapshot.b");

    registry.registerGenerator(idA, createFixtureGenerator());
    registry.registerGenerator(idB, createFixtureGenerator());

    const snapshot = registry.getGeneratorIds();
    (snapshot as MissionGeneratorId[]).reverse();
    (snapshot as MissionGeneratorId[]).push(generatorId("generator.fake"));

    expect(registry.getGeneratorIds()).toEqual([idA, idB]);
  });

  it("keeps separate registry instances independent", () => {
    const registryA = new GeneratorRegistry();
    const registryB = new GeneratorRegistry();
    const idA = generatorId("generator.registry.a");
    const idB = generatorId("generator.registry.b");

    registryA.registerGenerator(idA, createFixtureGenerator());
    registryB.registerGenerator(idB, createFixtureGenerator());

    expect(registryA.getGeneratorIds()).toEqual([idA]);
    expect(registryB.getGeneratorIds()).toEqual([idB]);
    expect(registryA.getGenerator(idB)).toBeUndefined();
    expect(registryB.getGenerator(idA)).toBeUndefined();
  });
});

describe("MissionGenerator contract", () => {
  it("uses templateVersion, config, difficulty, and the caller-supplied RNG", () => {
    const generator = createFixtureGenerator();
    const config = { sampleCount: 3 };
    const context: MissionGeneratorContext = {
      templateVersion: 7,
      config,
      difficulty: Difficulty.HARD,
      rng: createSeededRng("generator-context"),
    };

    const output = generator.generate(context);

    expect(output.learner.objective).toBe("Fixture v7");
    expect(output.learner.data).toMatchObject({
      difficulty: Difficulty.HARD,
      config,
    });
    expect(context.config).toBe(config);
    expect(context.difficulty).toBe(Difficulty.HARD);
  });

  it("reproduces identical output with equal context and fresh RNGs from the same seed", () => {
    const registry = new GeneratorRegistry();
    const id = generatorId("generator.deterministic");
    const generator = createFixtureGenerator();
    const config = { range: 1000 };
    registry.registerGenerator(id, generator);

    const resolved = registry.getGenerator(id)!;
    const first = resolved.generate({
      templateVersion: 2,
      config,
      difficulty: Difficulty.NORMAL,
      rng: createSeededRng("same-interface-seed"),
    });
    const second = resolved.generate({
      templateVersion: 2,
      config,
      difficulty: Difficulty.NORMAL,
      rng: createSeededRng("same-interface-seed"),
    });

    expect(second).toEqual(first);
  });

  it("allows selected different RNG streams to produce different fixture payloads", () => {
    const generator = createFixtureGenerator();
    const first = generator.generate({
      templateVersion: 1,
      difficulty: Difficulty.EASY,
      rng: createSeededRng("fixture-seed-a"),
    });
    const second = generator.generate({
      templateVersion: 1,
      difficulty: Difficulty.EASY,
      rng: createSeededRng("fixture-seed-b"),
    });

    expect(second.learner.data).not.toEqual(first.learner.data);
  });
});

describe("F2.4 capability composition", () => {
  it("feeds registered generator IDs into the existing extension validator", () => {
    const registry = new GeneratorRegistry();
    const template = MissionTemplateSchema.parse({
      id: "mission.generator-registry.fixture",
      version: 1,
      conceptIds: ["concept.generator-registry.fixture"],
      allowedStages: [LearningStage.INDEPENDENT],
      generator: { id: "generator.capability.fixture" },
      grader: { id: "grader.capability.fixture" },
      runtime: { id: "runtime.capability.fixture" },
    });

    registry.registerGenerator(template.generator.id, createFixtureGenerator());

    const capabilities: ExtensionCapabilitySet = {
      generatorIds: registry.getGeneratorIds(),
      graderIds: [template.grader.id],
      runtimeIds: [template.runtime.id],
    };

    expect(
      validateExtensionIds({ missionTemplates: [template] }, capabilities),
    ).toEqual([]);

    const missingGeneratorIssues = validateExtensionIds(
      { missionTemplates: [template] },
      {
        ...capabilities,
        generatorIds: [],
      },
    );

    expect(missingGeneratorIssues).toHaveLength(1);
    expect(missingGeneratorIssues[0]).toMatchObject({
      extensionKind: ExtensionKind.GENERATOR,
      fieldPath: "generator.id",
      referencedId: template.generator.id,
    });
  });
});
