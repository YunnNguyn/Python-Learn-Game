import { describe, expect, it } from "vitest";

import {
  ExtensionKind,
  MissingExtensionIssueCode,
  validateExtensionIds,
  type ExtensionCapabilitySet,
} from "../../src/core/content";
import {
  LearningStage,
  MissionTemplateSchema,
  type GraderId,
  type JsonObject,
} from "../../src/core/domain";
import {
  CORE_GRADER_ID,
  DeclarativeGraderCheckType,
  GraderFailureCategory,
  GraderRegistry,
  declarativeGrader,
  gradeDeclaratively,
  registerCoreGraders,
  type Grader,
  type GraderExecutionSnapshot,
  type GraderResult,
} from "../../src/core/grading";

const graderId = (value: string): GraderId => value as GraderId;

const execution: GraderExecutionSnapshot = {
  variables: {
    answer: {
      pythonType: "int",
      isNdarray: false,
      value: 42,
    },
  },
};

const passingConfig: JsonObject = {
  checks: [
    { type: DeclarativeGraderCheckType.NO_EXCEPTION },
    {
      type: DeclarativeGraderCheckType.EXACT_VALUES,
      variable: "answer",
      expected: 42,
    },
  ],
};

function createFixtureGrader(): Grader {
  return {
    grade({ config, gradingData, execution: executionSnapshot }) {
      return {
        passed:
          config?.["required"] === true &&
          gradingData?.["expected"] ===
            executionSnapshot.variables["answer"]?.value,
        checks: [],
        conceptualGuidance: {
          configRequired: config?.["required"] ?? null,
        },
        semanticResult: {
          expected: gradingData?.["expected"] ?? null,
          actual: executionSnapshot.variables["answer"]?.value ?? null,
        },
      };
    },
  };
}

describe("GraderRegistry", () => {
  it("starts empty", () => {
    const registry = new GraderRegistry();

    expect(registry.getGrader(graderId("grader.missing"))).toBeUndefined();
    expect(registry.getGraderIds()).toEqual([]);
  });

  it("registers and returns the canonical implementation reference", () => {
    const registry = new GraderRegistry();
    const id = graderId("grader.fixture");
    const grader = createFixtureGrader();

    registry.registerGrader(id, grader);

    expect(registry.getGrader(id)).toBe(grader);
  });

  it("resolves multiple graders independently", () => {
    const registry = new GraderRegistry();
    const graderA = createFixtureGrader();
    const graderB = createFixtureGrader();
    const graderC = createFixtureGrader();

    registry.registerGrader(graderId("grader.a"), graderA);
    registry.registerGrader(graderId("grader.b"), graderB);
    registry.registerGrader(graderId("grader.c"), graderC);

    expect(registry.getGrader(graderId("grader.a"))).toBe(graderA);
    expect(registry.getGrader(graderId("grader.b"))).toBe(graderB);
    expect(registry.getGrader(graderId("grader.c"))).toBe(graderC);
    expect(registry.getGrader(graderId("grader.unknown"))).toBeUndefined();
  });

  it("rejects duplicate IDs with the same implementation before mutation", () => {
    const registry = new GraderRegistry();
    const id = graderId("grader.duplicate");
    const grader = createFixtureGrader();

    registry.registerGrader(id, grader);

    expect(() => registry.registerGrader(id, grader)).toThrow(
      "Grader ID already registered: grader.duplicate",
    );
    expect(registry.getGrader(id)).toBe(grader);
    expect(registry.getGraderIds()).toEqual([id]);
  });

  it("rejects duplicate IDs with a different implementation without overwrite", () => {
    const registry = new GraderRegistry();
    const id = graderId("grader.duplicate-different");
    const original = createFixtureGrader();
    const replacement = createFixtureGrader();

    registry.registerGrader(id, original);

    expect(() => registry.registerGrader(id, replacement)).toThrow(Error);
    expect(registry.getGrader(id)).toBe(original);
  });

  it("allows different IDs to share one implementation", () => {
    const registry = new GraderRegistry();
    const shared = createFixtureGrader();
    const idA = graderId("grader.shared.a");
    const idB = graderId("grader.shared.b");

    registry.registerGrader(idA, shared);
    registry.registerGrader(idB, shared);

    expect(registry.getGrader(idA)).toBe(shared);
    expect(registry.getGrader(idB)).toBe(shared);
  });

  it("preserves registration order", () => {
    const registry = new GraderRegistry();
    const ids = [
      graderId("grader.c"),
      graderId("grader.a"),
      graderId("grader.b"),
    ];

    for (const id of ids) {
      registry.registerGrader(id, createFixtureGrader());
    }

    expect(registry.getGraderIds()).toEqual(ids);
  });

  it("returns an isolated grader-ID snapshot", () => {
    const registry = new GraderRegistry();
    const idA = graderId("grader.snapshot.a");
    const idB = graderId("grader.snapshot.b");

    registry.registerGrader(idA, createFixtureGrader());
    registry.registerGrader(idB, createFixtureGrader());

    const snapshot = registry.getGraderIds();
    (snapshot as GraderId[]).reverse();
    (snapshot as GraderId[]).push(graderId("grader.fake"));

    expect(registry.getGraderIds()).toEqual([idA, idB]);
  });

  it("keeps separate registry instances independent", () => {
    const registryA = new GraderRegistry();
    const registryB = new GraderRegistry();
    const idA = graderId("grader.registry.a");
    const idB = graderId("grader.registry.b");

    registryA.registerGrader(idA, createFixtureGrader());
    registryB.registerGrader(idB, createFixtureGrader());

    expect(registryA.getGraderIds()).toEqual([idA]);
    expect(registryB.getGraderIds()).toEqual([idB]);
    expect(registryA.getGrader(idB)).toBeUndefined();
    expect(registryB.getGrader(idA)).toBeUndefined();
  });
});

describe("built-in declarative grader", () => {
  it("uses the stable core.declarative ID", () => {
    expect(CORE_GRADER_ID.DECLARATIVE).toBe("core.declarative");
  });

  it("registerCoreGraders registers exactly the declarative grader", () => {
    const registry = new GraderRegistry();

    registerCoreGraders(registry);

    expect(registry.getGraderIds()).toEqual([CORE_GRADER_ID.DECLARATIVE]);
    expect(registry.getGrader(CORE_GRADER_ID.DECLARATIVE)).toBe(
      declarativeGrader,
    );
  });

  it("double core registration uses normal duplicate failure", () => {
    const registry = new GraderRegistry();
    registerCoreGraders(registry);

    expect(() => registerCoreGraders(registry)).toThrow(
      "Grader ID already registered: core.declarative",
    );
  });

  it("matches direct F5.4 behavior for a passing result", () => {
    const registry = new GraderRegistry();
    registerCoreGraders(registry);
    const grader = registry.getGrader(CORE_GRADER_ID.DECLARATIVE)!;

    expect(grader.grade({ config: passingConfig, execution })).toEqual(
      gradeDeclaratively(passingConfig, execution),
    );
  });

  it("matches direct F5.4 failure semantics", () => {
    const failingExecution: GraderExecutionSnapshot = {
      variables: {
        answer: {
          pythonType: "int",
          isNdarray: false,
          value: 7,
        },
      },
    };

    const result = declarativeGrader.grade({
      config: passingConfig,
      execution: failingExecution,
    });

    expect(result).toEqual(gradeDeclaratively(passingConfig, failingExecution));
    expect(result).toMatchObject({
      passed: false,
      checks: [
        { passed: true },
        {
          passed: false,
          category: GraderFailureCategory.VALUE_ERROR,
        },
      ],
    });
  });

  it("throws a developer/content error when config is missing", () => {
    expect(() => declarativeGrader.grade({ execution })).toThrow(
      "Declarative grader requires grader config.",
    );
  });

  it("ignores gradingData until an explicit binding mechanism exists", () => {
    const first = declarativeGrader.grade({
      config: passingConfig,
      gradingData: { expected: 1 },
      execution,
    });
    const second = declarativeGrader.grade({
      config: passingConfig,
      gradingData: { expected: 999 },
      execution,
    });

    expect(second).toEqual(first);
  });
});

describe("custom Grader escape hatch", () => {
  it("receives config, gradingData, and the normalized execution snapshot", () => {
    const grader = createFixtureGrader();
    const config: JsonObject = { required: true };
    const gradingData: JsonObject = { expected: 42 };

    const result = grader.grade({ config, gradingData, execution });

    expect(result).toEqual({
      passed: true,
      checks: [],
      conceptualGuidance: { configRequired: true },
      semanticResult: { expected: 42, actual: 42 },
    });
  });

  it("custom and declarative graders use the common GraderResult contract", () => {
    const customResult: GraderResult = createFixtureGrader().grade({
      config: { required: true },
      gradingData: { expected: 42 },
      execution,
    });
    const declarativeResult: GraderResult = declarativeGrader.grade({
      config: passingConfig,
      execution,
    });

    expect(customResult).toMatchObject({ passed: true, checks: [] });
    expect(declarativeResult).toMatchObject({
      passed: true,
      checks: expect.any(Array),
    });
  });
});

describe("F2.4 capability composition", () => {
  it("feeds registered grader IDs into the existing extension validator", () => {
    const registry = new GraderRegistry();
    registerCoreGraders(registry);
    const template = MissionTemplateSchema.parse({
      id: "mission.grader-registry.fixture",
      version: 1,
      conceptIds: ["concept.grader-registry.fixture"],
      allowedStages: [LearningStage.INDEPENDENT],
      generator: { id: "generator.grader-registry.fixture" },
      grader: {
        id: CORE_GRADER_ID.DECLARATIVE,
        config: passingConfig,
      },
      runtime: { id: "runtime.grader-registry.fixture" },
    });
    const capabilities: ExtensionCapabilitySet = {
      generatorIds: [template.generator.id],
      graderIds: registry.getGraderIds(),
      runtimeIds: [template.runtime.id],
    };

    expect(
      validateExtensionIds({ missionTemplates: [template] }, capabilities),
    ).toEqual([]);
  });

  it("preserves the existing MISSING_EXTENSION result for an unavailable grader", () => {
    const registry = new GraderRegistry();
    registerCoreGraders(registry);
    const template = MissionTemplateSchema.parse({
      id: "mission.grader-registry.missing",
      version: 1,
      conceptIds: ["concept.grader-registry.missing"],
      allowedStages: [LearningStage.INDEPENDENT],
      generator: { id: "generator.grader-registry.missing" },
      grader: { id: "grader.missing" },
      runtime: { id: "runtime.grader-registry.missing" },
    });
    const capabilities: ExtensionCapabilitySet = {
      generatorIds: [template.generator.id],
      graderIds: registry.getGraderIds(),
      runtimeIds: [template.runtime.id],
    };

    expect(
      validateExtensionIds({ missionTemplates: [template] }, capabilities),
    ).toEqual([
      expect.objectContaining({
        code: MissingExtensionIssueCode.MISSING_EXTENSION,
        extensionKind: ExtensionKind.GRADER,
        fieldPath: "grader.id",
        referencedId: template.grader.id,
      }),
    ]);
  });
});
