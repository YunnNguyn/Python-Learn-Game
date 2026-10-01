import { describe, expect, it } from "vitest";

import { ContentRegistry } from "../../src/core/content";
import {
  Difficulty,
  MissionInstanceSchema,
  MissionTemplateSchema,
  type MissionTemplate,
} from "../../src/core/domain";
import {
  createMissionInstance,
  resolveMissionTemplate,
  type MissionGeneratorOutput,
} from "../../src/core/missions";
import { foundation1Fixtures } from "../fixtures/foundation1";

function createTemplate(
  changes: Partial<MissionTemplate> = {},
): MissionTemplate {
  return MissionTemplateSchema.parse({
    ...foundation1Fixtures.missionTemplate,
    ...changes,
  });
}

const minimalGenerated: MissionGeneratorOutput = {
  learner: {
    objective: "Inspect the generated data.",
  },
};

describe("createMissionInstance", () => {
  it("creates a minimal canonical instance from template metadata and generated output", () => {
    const template = createTemplate();
    const instance = createMissionInstance({
      template,
      seed: "seed-42",
      difficulty: Difficulty.NORMAL,
      generated: minimalGenerated,
    });

    expect(instance.templateId).toBe(template.id);
    expect(instance.templateVersion).toBe(template.version);
    expect(instance.seed).toBe("seed-42");
    expect(instance.difficulty).toBe(Difficulty.NORMAL);
    expect(instance.conceptIds).toEqual(template.conceptIds);
    expect(instance.learner.objective).toBe("Inspect the generated data.");
    expect(MissionInstanceSchema.safeParse(instance).success).toBe(true);
  });

  it("places full generated learner, runtime, grading, and world payloads in canonical branches", () => {
    const template = createTemplate();
    const generated: MissionGeneratorOutput = {
      learner: {
        objective: "Solve the generated mission.",
        context: "Neutral generated context.",
        starterCode: "generated code",
        data: { rows: [1, 2, 3] },
        visibleTests: [{ name: "visible-check", expected: 3 }],
      },
      runtime: {
        setupData: { variables: { threshold: 2 } },
      },
      grading: {
        data: { expected: [2, 3] },
      },
      world: {
        initialState: { targets: ["r2", "r3"] },
      },
    };

    const instance = createMissionInstance({
      template,
      seed: "full-output",
      difficulty: Difficulty.HARD,
      generated,
    });

    expect(instance.learner).toEqual({
      objective: "Solve the generated mission.",
      context: "Neutral generated context.",
      starterCode: "generated code",
      data: { rows: [1, 2, 3] },
      visibleTests: [{ name: "visible-check", expected: 3 }],
    });
    expect(instance.runtime).toEqual({
      setupData: { variables: { threshold: 2 } },
    });
    expect(instance.grading).toEqual({
      data: { expected: [2, 3] },
    });
    expect(instance.world).toEqual({
      initialState: { targets: ["r2", "r3"] },
    });
  });

  it("falls back to template starter code when generated output omits it", () => {
    const template = createTemplate({ starterCode: "template code" });

    const instance = createMissionInstance({
      template,
      seed: "starter-fallback",
      difficulty: Difficulty.EASY,
      generated: minimalGenerated,
    });

    expect(instance.learner.starterCode).toBe("template code");
  });

  it("prefers generated starter code over the template default", () => {
    const template = createTemplate({ starterCode: "template code" });

    const instance = createMissionInstance({
      template,
      seed: "starter-generated",
      difficulty: Difficulty.EASY,
      generated: {
        learner: {
          objective: "Use generated starter code.",
          starterCode: "generated code",
        },
      },
    });

    expect(instance.learner.starterCode).toBe("generated code");
  });

  it("treats an explicit empty generated starter code as an explicit override", () => {
    const template = createTemplate({ starterCode: "template code" });

    const instance = createMissionInstance({
      template,
      seed: "starter-empty",
      difficulty: Difficulty.EASY,
      generated: {
        learner: {
          objective: "Start from an empty editor.",
          starterCode: "",
        },
      },
    });

    expect(instance.learner.starterCode).toBe("");
  });

  it("omits starter code when neither template nor generated output provides it", () => {
    const template = createTemplate({ starterCode: undefined });

    const instance = createMissionInstance({
      template,
      seed: "starter-absent",
      difficulty: Difficulty.NORMAL,
      generated: minimalGenerated,
    });

    expect(instance.learner.starterCode).toBeUndefined();
    expect("starterCode" in instance.learner).toBe(false);
  });

  it("copies concept IDs from the template in authored order and snapshots the array", () => {
    const template = createTemplate();
    const instance = createMissionInstance({
      template,
      seed: "concept-copy",
      difficulty: Difficulty.NORMAL,
      generated: minimalGenerated,
    });

    expect(instance.conceptIds).toEqual(template.conceptIds);
    expect(instance.conceptIds).not.toBe(template.conceptIds);
  });

  it.each(["seed", "Seed", " seed ", "seed:a/b?c", "Unicode hạt giống 日本語"])(
    "stores seed text exactly: %s",
    (seed) => {
      const instance = createMissionInstance({
        template: createTemplate(),
        seed,
        difficulty: Difficulty.NORMAL,
        generated: minimalGenerated,
      });

      expect(instance.seed).toBe(seed);
    },
  );

  it("reproduces the same instance ID for the same identity inputs", () => {
    const template = createTemplate();
    const input = {
      template,
      seed: "identity-seed",
      difficulty: Difficulty.HARD,
      generated: minimalGenerated,
    } as const;

    expect(createMissionInstance(input).id).toBe(createMissionInstance(input).id);
  });

  it("changes instance ID when only template ID changes", () => {
    const first = createMissionInstance({
      template: createTemplate({ id: "mission.template.alpha" as MissionTemplate["id"] }),
      seed: "same-seed",
      difficulty: Difficulty.NORMAL,
      generated: minimalGenerated,
    });
    const second = createMissionInstance({
      template: createTemplate({ id: "mission.template.beta" as MissionTemplate["id"] }),
      seed: "same-seed",
      difficulty: Difficulty.NORMAL,
      generated: minimalGenerated,
    });

    expect(first.id).not.toBe(second.id);
  });

  it("changes instance ID when only template version changes", () => {
    const first = createMissionInstance({
      template: createTemplate({ version: 1 }),
      seed: "same-seed",
      difficulty: Difficulty.NORMAL,
      generated: minimalGenerated,
    });
    const second = createMissionInstance({
      template: createTemplate({ version: 2 }),
      seed: "same-seed",
      difficulty: Difficulty.NORMAL,
      generated: minimalGenerated,
    });

    expect(first.id).not.toBe(second.id);
  });

  it("changes instance ID when only difficulty changes", () => {
    const template = createTemplate();
    const easy = createMissionInstance({
      template,
      seed: "same-seed",
      difficulty: Difficulty.EASY,
      generated: minimalGenerated,
    });
    const hard = createMissionInstance({
      template,
      seed: "same-seed",
      difficulty: Difficulty.HARD,
      generated: minimalGenerated,
    });

    expect(easy.id).not.toBe(hard.id);
  });

  it("changes instance ID when only seed changes", () => {
    const template = createTemplate();
    const first = createMissionInstance({
      template,
      seed: "seed-a",
      difficulty: Difficulty.NORMAL,
      generated: minimalGenerated,
    });
    const second = createMissionInstance({
      template,
      seed: "seed-b",
      difficulty: Difficulty.NORMAL,
      generated: minimalGenerated,
    });

    expect(first.id).not.toBe(second.id);
  });

  it("uses delimiter-safe browser encoding for template ID and seed", () => {
    const template = createTemplate({
      id: "mission:template/a?b# c_日本語" as MissionTemplate["id"],
      version: 7,
    });
    const seed = "seed:x/y?z# q_日本語";
    const instance = createMissionInstance({
      template,
      seed,
      difficulty: Difficulty.HARD,
      generated: minimalGenerated,
    });

    expect(instance.id).toBe(
      `mission-instance:${encodeURIComponent(template.id)}:v7:HARD:${encodeURIComponent(seed)}`,
    );
  });

  it("keeps instance ID independent of generated payload contents", () => {
    const template = createTemplate();
    const common = {
      template,
      seed: "payload-independent",
      difficulty: Difficulty.NORMAL,
    } as const;

    const first = createMissionInstance({
      ...common,
      generated: { learner: { objective: "First payload", data: { value: 1 } } },
    });
    const second = createMissionInstance({
      ...common,
      generated: { learner: { objective: "Second payload", data: { value: 999 } } },
    });

    expect(first.id).toBe(second.id);
  });

  it("ignores runtime extra fields that try to override canonical identity metadata", () => {
    const template = createTemplate();
    const generated = {
      learner: {
        objective: "Canonical identity stays owned by creation.",
      },
      id: "attacker-instance-id",
      templateId: "mission.template.attacker",
      templateVersion: 999,
      seed: "attacker-seed",
      difficulty: Difficulty.HARD,
      conceptIds: [],
    } as unknown as MissionGeneratorOutput;

    const instance = createMissionInstance({
      template,
      seed: "canonical-seed",
      difficulty: Difficulty.EASY,
      generated,
    });

    expect(instance.templateId).toBe(template.id);
    expect(instance.templateVersion).toBe(template.version);
    expect(instance.seed).toBe("canonical-seed");
    expect(instance.difficulty).toBe(Difficulty.EASY);
    expect(instance.conceptIds).toEqual(template.conceptIds);
    expect(instance.id).not.toBe("attacker-instance-id");
  });

  it("keeps learner, grading, runtime, and world data structurally separate", () => {
    const instance = createMissionInstance({
      template: createTemplate(),
      seed: "boundary-separation",
      difficulty: Difficulty.NORMAL,
      generated: {
        learner: {
          objective: "Respect payload boundaries.",
          data: { learnerOnly: "visible" },
        },
        grading: { data: { gradingOnly: "secret" } },
        runtime: { setupData: { runtimeOnly: true } },
        world: { initialState: { worldOnly: 4 } },
      },
    });

    expect(instance.learner.data).toEqual({ learnerOnly: "visible" });
    expect(instance.grading?.data).toEqual({ gradingOnly: "secret" });
    expect(instance.runtime?.setupData).toEqual({ runtimeOnly: true });
    expect(instance.world?.initialState).toEqual({ worldOnly: 4 });
    expect(instance.learner.data).not.toHaveProperty("gradingOnly");
  });

  it("does not copy template extension configuration into MissionInstance", () => {
    const instance = createMissionInstance({
      template: createTemplate(),
      seed: "no-template-config-copy",
      difficulty: Difficulty.NORMAL,
      generated: minimalGenerated,
    });
    const root = instance as unknown as Record<string, unknown>;

    expect(root.generator).toBeUndefined();
    expect(root.grader).toBeUndefined();
    expect(root.restrictions).toBeUndefined();
    expect(root.hintSetId).toBeUndefined();
    expect(root.visualization).toBeUndefined();
    expect(Object.keys(instance).sort()).toEqual(
      ["conceptIds", "difficulty", "id", "learner", "seed", "templateId", "templateVersion"].sort(),
    );
  });

  it("surfaces canonical schema failure for a blank objective", () => {
    expect(() =>
      createMissionInstance({
        template: createTemplate(),
        seed: "invalid-objective",
        difficulty: Difficulty.NORMAL,
        generated: {
          learner: {
            objective: "   ",
          },
        },
      }),
    ).toThrow("Expected a non-blank string");
  });

  it("surfaces canonical schema failure for non-JSON generated payload data", () => {
    const invalidGenerated = {
      learner: {
        objective: "Reject invalid JSON.",
        data: {
          callback: () => true,
        },
      },
    } as unknown as MissionGeneratorOutput;

    expect(() =>
      createMissionInstance({
        template: createTemplate(),
        seed: "invalid-json",
        difficulty: Difficulty.NORMAL,
        generated: invalidGenerated,
      }),
    ).toThrow("Expected a JSON-compatible object");
  });

  it("does not mutate MissionTemplate or MissionGeneratorOutput inputs", () => {
    const template = createTemplate();
    const generated: MissionGeneratorOutput = {
      learner: {
        objective: "Keep inputs unchanged.",
        data: { values: [1, 2, 3] },
        visibleTests: [{ expected: 3 }],
      },
      grading: { data: { answer: 3 } },
    };
    const templateBefore = structuredClone(template);
    const generatedBefore = structuredClone(generated);

    createMissionInstance({
      template,
      seed: "immutability",
      difficulty: Difficulty.NORMAL,
      generated,
    });

    expect(template).toEqual(templateBefore);
    expect(generated).toEqual(generatedBefore);
  });

  it("creates instances directly from an already resolved template without a registry", () => {
    const template = createTemplate();

    expect(
      createMissionInstance({
        template,
        seed: "already-resolved",
        difficulty: Difficulty.EASY,
        generated: minimalGenerated,
      }).templateId,
    ).toBe(template.id);
  });

  it("composes with F4.2 exact template resolution without a combined production helper", () => {
    const registry = new ContentRegistry();
    const template = createTemplate({
      id: "mission.template.composition" as MissionTemplate["id"],
      version: 6,
    });
    registry.registerMissionTemplate(template);

    const resolved = resolveMissionTemplate(registry, template.id, 6);
    expect(resolved).toBe(template);

    const instance = createMissionInstance({
      template: resolved!,
      seed: "f4.2-to-f4.3",
      difficulty: Difficulty.HARD,
      generated: minimalGenerated,
    });

    expect(instance.templateId).toBe(template.id);
    expect(instance.templateVersion).toBe(6);
    expect(instance.conceptIds).toEqual(template.conceptIds);
  });
});
