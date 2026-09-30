import { describe, expect, it } from "vitest";

import {
  JsonObjectSchema,
  JsonValueSchema,
  LearningStage,
  MissionTemplateSchema,
  type ConceptId,
  type GraderId,
  type HintSetId,
  type JsonObject,
  type JsonValue,
  type MissionGeneratorId,
  type MissionTemplate,
  type MissionTemplateId,
  type RuntimeId,
  type VisualizationModuleId,
} from "../../src/core/domain";

describe("JSON domain contract", () => {
  it("accepts nested JSON values and objects", () => {
    const value = {
      label: "neutral",
      count: 3,
      enabled: true,
      empty: null,
      nested: {
        thresholds: [0, 0.5, 1],
        labels: ["a", "b"],
      },
    };

    expect(JsonValueSchema.safeParse(value).success).toBe(true);
    expect(JsonObjectSchema.safeParse(value).success).toBe(true);
  });

  it("accepts arrays as JsonValue but not as JsonObject", () => {
    expect(JsonValueSchema.safeParse([1, "two", null]).success).toBe(true);
    expect(JsonObjectSchema.safeParse([1, "two", null]).success).toBe(false);
  });

  it.each([
    ["undefined", undefined],
    ["function", () => true],
    ["symbol", Symbol("json")],
    ["BigInt", 1n],
    ["Date", new Date("2026-01-01T00:00:00.000Z")],
    ["Map", new Map([["key", "value"]])],
    ["Set", new Set([1])],
    ["class instance", new (class ExampleConfig { value = 1; })()],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("rejects non-JSON %s values", (_caseName, value) => {
    expect(JsonValueSchema.safeParse(value).success).toBe(false);
  });

  it("rejects non-JSON values nested inside plain objects", () => {
    expect(JsonObjectSchema.safeParse({ value: undefined }).success).toBe(false);
    expect(JsonObjectSchema.safeParse({ value: { nested: new Date() } }).success).toBe(
      false,
    );
  });

  it("rejects cyclic values", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(JsonObjectSchema.safeParse(cyclic).success).toBe(false);
  });

  it("keeps the compile-time JSON contract narrow", () => {
    const nestedValue: JsonValue = {
      values: [1, "two", false, null, { deep: [3] }],
    };
    const nestedObject: JsonObject = { nested: nestedValue };

    // @ts-expect-error Date is not a JSON value.
    const invalidDate: JsonValue = new Date();
    // @ts-expect-error Map is not a JSON value.
    const invalidMap: JsonValue = new Map<string, string>();
    // @ts-expect-error Functions are not JSON values.
    const invalidFunction: JsonValue = () => true;
    // @ts-expect-error BigInt is not a JSON value.
    const invalidBigInt: JsonValue = 1n;
    // @ts-expect-error undefined is not a JSON value.
    const invalidUndefined: JsonValue = undefined;

    expect(nestedObject).toEqual({ nested: nestedValue });
    void invalidDate;
    void invalidMap;
    void invalidFunction;
    void invalidBigInt;
    void invalidUndefined;
  });
});

describe("MissionTemplateSchema", () => {
  const minimalTemplate = {
    id: "mission-template.neutral.minimal",
    version: 1,
    conceptIds: [],
    allowedStages: [],
    generator: { id: "generator.neutral" },
    grader: { id: "grader.neutral" },
    runtime: { id: "runtime.neutral" },
  };

  it("parses a minimal template", () => {
    expect(MissionTemplateSchema.parse(minimalTemplate)).toMatchObject(
      minimalTemplate,
    );
  });

  it("parses the full locked template shape", () => {
    const parsed = MissionTemplateSchema.parse({
      id: "mission-template.neutral.full",
      version: 2,
      conceptIds: ["concept.alpha", "concept.beta"],
      allowedStages: [LearningStage.GUIDED, LearningStage.INDEPENDENT],
      generator: {
        id: "generator.full",
        config: {
          dimensions: [2, 4],
          metadata: { mode: "neutral", enabled: true },
        },
      },
      grader: {
        id: "grader.full",
        config: { tolerance: 0.001, checks: ["shape", "values"] },
      },
      runtime: {
        id: "runtime.full",
        config: { timeoutMs: 1500, flags: { isolated: true } },
      },
      starterCode: "",
      hintSetId: "hint-set.full",
      visualization: {
        moduleId: "visualization.full",
        config: { layout: { rows: 2, columns: 3 } },
      },
      restrictions: {
        forbiddenCalls: ["example.call"],
        limits: { attempts: 3 },
      },
    });

    expect(parsed.allowedStages).toEqual([
      LearningStage.GUIDED,
      LearningStage.INDEPENDENT,
    ]);
    expect(parsed.starterCode).toBe("");
  });

  it("preserves all branded ID output types", () => {
    const template = MissionTemplateSchema.parse({
      ...minimalTemplate,
      conceptIds: ["concept.unresolved"],
      hintSetId: "hint-set.unresolved",
      visualization: { moduleId: "visualization.unresolved" },
    });

    const templateId: MissionTemplateId = template.id;
    const conceptId: ConceptId = template.conceptIds[0]!;
    const generatorId: MissionGeneratorId = template.generator.id;
    const graderId: GraderId = template.grader.id;
    const runtimeId: RuntimeId = template.runtime.id;
    const hintSetId: HintSetId | undefined = template.hintSetId;
    const visualizationModuleId: VisualizationModuleId =
      template.visualization!.moduleId;

    expect(templateId).toBe("mission-template.neutral.minimal");
    expect(conceptId).toBe("concept.unresolved");
    expect(generatorId).toBe("generator.neutral");
    expect(graderId).toBe("grader.neutral");
    expect(runtimeId).toBe("runtime.neutral");
    expect(hintSetId).toBe("hint-set.unresolved");
    expect(visualizationModuleId).toBe("visualization.unresolved");
  });

  it("keeps MissionTemplate free of MissionInstance-only fields", () => {
    const useTemplate = (template: MissionTemplate) => {
      // @ts-expect-error MissionTemplate does not own a seed.
      return template.seed;
    };

    expect(useTemplate(MissionTemplateSchema.parse(minimalTemplate))).toBeUndefined();
  });

  it.each([
    ["missing id", { ...minimalTemplate, id: undefined }],
    ["blank id", { ...minimalTemplate, id: "   " }],
    ["version zero", { ...minimalTemplate, version: 0 }],
    ["negative version", { ...minimalTemplate, version: -1 }],
    ["fractional version", { ...minimalTemplate, version: 1.5 }],
    ["NaN version", { ...minimalTemplate, version: Number.NaN }],
    ["infinite version", { ...minimalTemplate, version: Number.POSITIVE_INFINITY }],
    ["conceptIds not an array", { ...minimalTemplate, conceptIds: "concept.one" }],
    ["blank concept ID", { ...minimalTemplate, conceptIds: [" "] }],
    ["allowedStages not an array", { ...minimalTemplate, allowedStages: "GUIDED" }],
    ["invalid learning stage", { ...minimalTemplate, allowedStages: ["PRACTICE"] }],
    ["missing generator", { ...minimalTemplate, generator: undefined }],
    ["blank generator id", { ...minimalTemplate, generator: { id: "" } }],
    [
      "non-object generator config",
      { ...minimalTemplate, generator: { id: "generator.neutral", config: [] } },
    ],
    [
      "unknown generator binding field",
      { ...minimalTemplate, generator: { id: "generator.neutral", confg: {} } },
    ],
    ["missing grader", { ...minimalTemplate, grader: undefined }],
    [
      "invalid grader config",
      { ...minimalTemplate, grader: { id: "grader.neutral", config: "bad" } },
    ],
    ["missing runtime", { ...minimalTemplate, runtime: undefined }],
    [
      "invalid runtime binding",
      { ...minimalTemplate, runtime: { id: "runtime.neutral", unexpected: true } },
    ],
    ["blank hintSetId", { ...minimalTemplate, hintSetId: " " }],
    [
      "blank visualization module ID",
      { ...minimalTemplate, visualization: { moduleId: "" } },
    ],
    [
      "non-object visualization config",
      {
        ...minimalTemplate,
        visualization: { moduleId: "visualization.neutral", config: [1, 2] },
      },
    ],
    [
      "non-JSON nested config value",
      {
        ...minimalTemplate,
        generator: {
          id: "generator.neutral",
          config: { createdAt: new Date() },
        },
      },
    ],
    ["non-object restrictions", { ...minimalTemplate, restrictions: [] }],
    ["unexpected template property", { ...minimalTemplate, seed: 12345 }],
  ])("rejects %s", (_caseName, input) => {
    expect(MissionTemplateSchema.safeParse(input).success).toBe(false);
  });

  it("allows unresolved local references without registry lookup", () => {
    const result = MissionTemplateSchema.safeParse({
      ...minimalTemplate,
      id: "mission-template.does.not.exist",
      conceptIds: ["concept.does.not.exist"],
      generator: { id: "generator.does.not.exist" },
      grader: { id: "grader.does.not.exist" },
      runtime: { id: "runtime.does.not.exist" },
      hintSetId: "hint-set.does.not.exist",
      visualization: { moduleId: "visualization.does.not.exist" },
    });

    expect(result.success).toBe(true);
  });
});
