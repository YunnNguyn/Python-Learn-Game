import { describe, expect, it } from "vitest";

import {
  Difficulty,
  MissionInstanceSchema,
  type ConceptId,
  type MissionInstance,
  type MissionInstanceId,
  type MissionTemplateId,
} from "../../src/core/domain";

describe("MissionInstanceSchema", () => {
  const minimalInstance = {
    id: "mission-instance.neutral.minimal",
    templateId: "mission-template.neutral",
    templateVersion: 1,
    seed: "seed-001",
    difficulty: Difficulty.NORMAL,
    conceptIds: [],
    learner: {
      objective: "Produce the requested neutral result.",
    },
  };

  it("parses a minimal generated instance", () => {
    expect(MissionInstanceSchema.parse(minimalInstance)).toEqual(minimalInstance);
  });

  it("parses the full partitioned instance shape", () => {
    const parsed = MissionInstanceSchema.parse({
      id: "mission-instance.neutral.full",
      templateId: "mission-template.neutral.full",
      templateVersion: 3,
      seed: "template:test:42",
      difficulty: Difficulty.HARD,
      conceptIds: ["concept.alpha", "concept.beta"],
      learner: {
        objective: "Transform the supplied neutral data.",
        context: "A neutral generated exercise fixture.",
        starterCode: "",
        data: {
          matrix: [[1, 2], [3, 4]],
          labels: ["left", "right"],
          metadata: { active: true },
        },
        visibleTests: [
          { name: "shape", input: { rows: 2, columns: 2 } },
          { name: "sample", expectedKind: "number" },
        ],
      },
      runtime: {
        setupData: {
          variables: { threshold: 0.5 },
          samples: [1, 2, 3],
        },
      },
      grading: {
        data: {
          expected: { shape: [2, 2] },
          tolerance: 0.001,
        },
      },
      world: {
        initialState: {
          entities: [{ id: "entity-1", status: "idle" }],
          indicators: { ready: true },
        },
      },
    });

    expect(parsed.learner.starterCode).toBe("");
    expect(parsed.runtime?.setupData).toMatchObject({ samples: [1, 2, 3] });
    expect(parsed.grading?.data).toMatchObject({ tolerance: 0.001 });
    expect(parsed.world?.initialState).toMatchObject({
      indicators: { ready: true },
    });
  });

  it.each(["seed-001", "123", "template:test:42"])(
    "accepts string seed %s without interpreting it",
    (seed) => {
      expect(
        MissionInstanceSchema.safeParse({ ...minimalInstance, seed }).success,
      ).toBe(true);
    },
  );

  it("preserves branded IDs and canonical Difficulty typing", () => {
    const instance = MissionInstanceSchema.parse({
      ...minimalInstance,
      id: "mission-instance.unresolved",
      templateId: "mission-template.does.not.exist",
      conceptIds: ["concept.does.not.exist"],
      difficulty: Difficulty.EASY,
    });

    const instanceId: MissionInstanceId = instance.id;
    const templateId: MissionTemplateId = instance.templateId;
    const conceptId: ConceptId = instance.conceptIds[0]!;
    const difficulty: Difficulty = instance.difficulty;

    expect(instanceId).toBe("mission-instance.unresolved");
    expect(templateId).toBe("mission-template.does.not.exist");
    expect(conceptId).toBe("concept.does.not.exist");
    expect(difficulty).toBe(Difficulty.EASY);
  });

  it("keeps grader-only fields out of the learner type", () => {
    const readLearner = (instance: MissionInstance) => {
      // @ts-expect-error Learner payload intentionally has no grading field.
      return instance.learner.grading;
    };

    expect(readLearner(MissionInstanceSchema.parse(minimalInstance))).toBeUndefined();
  });

  it.each([
    ["blank instance ID", { ...minimalInstance, id: "   " }],
    ["blank template ID", { ...minimalInstance, templateId: "" }],
    ["templateVersion zero", { ...minimalInstance, templateVersion: 0 }],
    ["fractional templateVersion", { ...minimalInstance, templateVersion: 1.5 }],
    ["NaN templateVersion", { ...minimalInstance, templateVersion: Number.NaN }],
    [
      "infinite templateVersion",
      { ...minimalInstance, templateVersion: Number.POSITIVE_INFINITY },
    ],
    ["blank seed", { ...minimalInstance, seed: "   " }],
    ["numeric seed", { ...minimalInstance, seed: 123 }],
    ["invalid difficulty", { ...minimalInstance, difficulty: "EXTREME" }],
    ["conceptIds not an array", { ...minimalInstance, conceptIds: "concept.one" }],
    ["blank concept ID", { ...minimalInstance, conceptIds: [" "] }],
    ["missing learner", { ...minimalInstance, learner: undefined }],
    [
      "blank learner objective",
      { ...minimalInstance, learner: { objective: "  " } },
    ],
    [
      "learner unexpected key",
      {
        ...minimalInstance,
        learner: { objective: "Neutral objective", graderData: {} },
      },
    ],
    [
      "learner data root array",
      { ...minimalInstance, learner: { objective: "Neutral objective", data: [] } },
    ],
    [
      "visibleTests not an array",
      {
        ...minimalInstance,
        learner: { objective: "Neutral objective", visibleTests: {} },
      },
    ],
    [
      "visibleTests contains non-object JSON root",
      {
        ...minimalInstance,
        learner: { objective: "Neutral objective", visibleTests: [{ ok: true }, [1, 2]] },
      },
    ],
    [
      "runtime unexpected key",
      { ...minimalInstance, runtime: { setupData: {}, setupCode: "x = 1" } },
    ],
    [
      "non-JSON runtime setupData",
      { ...minimalInstance, runtime: { setupData: { createdAt: new Date() } } },
    ],
    [
      "grading unexpected key",
      { ...minimalInstance, grading: { data: {}, objective: "leak" } },
    ],
    [
      "non-JSON grading data",
      { ...minimalInstance, grading: { data: { answer: 1n } } },
    ],
    [
      "world unexpected key",
      { ...minimalInstance, world: { initialState: {}, graderAnswer: 42 } },
    ],
    [
      "non-JSON world initialState",
      {
        ...minimalInstance,
        world: { initialState: { callback: () => true } },
      },
    ],
    ["unexpected top-level field", { ...minimalInstance, hiddenTests: [] }],
    ["template-only allowedStages", { ...minimalInstance, allowedStages: [] }],
    [
      "template-only generator",
      { ...minimalInstance, generator: { id: "generator.neutral" } },
    ],
    [
      "template-only grader",
      { ...minimalInstance, grader: { id: "grader.neutral" } },
    ],
    ["template-only hintSetId", { ...minimalInstance, hintSetId: "hints.neutral" }],
    ["template-only restrictions", { ...minimalInstance, restrictions: {} }],
  ])("rejects %s", (_caseName, input) => {
    expect(MissionInstanceSchema.safeParse(input).success).toBe(false);
  });

  it("permits generic JSON keys inside their owning payload data", () => {
    const result = MissionInstanceSchema.safeParse({
      ...minimalInstance,
      learner: {
        objective: "Neutral objective",
        data: { graderData: { displayLabel: "just data" } },
      },
      grading: {
        data: { objective: "grader-owned generic payload value" },
      },
      world: {
        initialState: { graderAnswer: 42 },
      },
    });

    expect(result.success).toBe(true);
  });

  it("allows unresolved template and concept references locally", () => {
    expect(
      MissionInstanceSchema.safeParse({
        ...minimalInstance,
        templateId: "mission-template.missing",
        templateVersion: 999,
        conceptIds: ["concept.missing.one", "concept.missing.two"],
      }).success,
    ).toBe(true);
  });
});
