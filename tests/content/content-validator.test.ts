import { describe, expect, it } from "vitest";

import {
  ContentRegistry,
  DuplicateIdIssueCode,
  MissingExtensionIssueCode,
  MissingReferenceIssueCode,
  UnsupportedSchemaVersionIssueCode,
  validateContent,
  type ContentDefinitionSet,
  type ContentValidationContext,
} from "../../src/core/content";
import {
  ConceptSchema,
  ContentPackManifestSchema,
  CourseSchema,
  LearningActivitySchema,
  LessonSchema,
  MissionTemplateSchema,
  WorldSchema,
} from "../../src/core/domain";
import { foundation1Fixtures } from "../fixtures/foundation1";

function createValidDefinitions(): ContentDefinitionSet {
  return {
    packs: [
      ContentPackManifestSchema.parse(
        foundation1Fixtures.contentPackManifest,
      ),
    ],
    concepts: foundation1Fixtures.concepts.map((fixture) =>
      ConceptSchema.parse(fixture),
    ),
    courses: [CourseSchema.parse(foundation1Fixtures.course)],
    worlds: [WorldSchema.parse(foundation1Fixtures.world)],
    lessons: [LessonSchema.parse(foundation1Fixtures.lesson)],
    activities: foundation1Fixtures.activities.map((fixture) =>
      LearningActivitySchema.parse(fixture),
    ),
    missionTemplates: [
      MissionTemplateSchema.parse(foundation1Fixtures.missionTemplate),
    ],
  };
}

function createValidContext(
  definitions: ContentDefinitionSet,
): ContentValidationContext {
  const template = definitions.missionTemplates![0]!;

  return {
    extensionCapabilities: {
      generatorIds: [template.generator.id],
      graderIds: [template.grader.id],
      runtimeIds: [template.runtime.id],
      hintSetIds: [template.hintSetId!],
      visualizationModuleIds: [template.visualization!.moduleId],
    },
    schemaSupport: {
      supportedSchemaVersions: [definitions.packs![0]!.schemaVersion],
    },
  };
}

function createMixedInvalidCase(): {
  definitions: ContentDefinitionSet;
  context: ContentValidationContext;
} {
  const valid = createValidDefinitions();
  const baseConcept = valid.concepts![0]!;
  const invalidCourse = CourseSchema.parse({
    ...foundation1Fixtures.course,
    worldIds: ["world.missing"],
  });
  const invalidTemplate = MissionTemplateSchema.parse({
    ...foundation1Fixtures.missionTemplate,
    generator: {
      ...foundation1Fixtures.missionTemplate.generator,
      id: "generator.missing",
    },
  });
  const unsupportedPack = ContentPackManifestSchema.parse({
    ...foundation1Fixtures.contentPackManifest,
    schemaVersion: 2,
  });

  return {
    definitions: {
      ...valid,
      packs: [unsupportedPack],
      concepts: [...valid.concepts!, baseConcept],
      courses: [invalidCourse],
      missionTemplates: [invalidTemplate],
    },
    context: {
      extensionCapabilities: {
        generatorIds: [],
        graderIds: [invalidTemplate.grader.id],
        runtimeIds: [invalidTemplate.runtime.id],
        hintSetIds: [invalidTemplate.hintSetId!],
        visualizationModuleIds: [invalidTemplate.visualization!.moduleId],
      },
      schemaSupport: {
        supportedSchemaVersions: [1],
      },
    },
  };
}

describe("validateContent", () => {
  it("treats empty content as valid with explicit empty validation context", () => {
    expect(
      validateContent(
        {},
        {
          extensionCapabilities: {},
          schemaSupport: { supportedSchemaVersions: [] },
        },
      ),
    ).toEqual({
      valid: true,
      issues: [],
    });
  });

  it("returns a valid report for a coherent canonical content set", () => {
    const definitions = createValidDefinitions();

    expect(validateContent(definitions, createValidContext(definitions))).toEqual({
      valid: true,
      issues: [],
    });
  });

  it("runs every validation pass and preserves pass-group issue order", () => {
    const { definitions, context } = createMixedInvalidCase();

    const report = validateContent(definitions, context);

    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual([
      DuplicateIdIssueCode.DUPLICATE_ID,
      MissingReferenceIssueCode.MISSING_REFERENCE,
      MissingExtensionIssueCode.MISSING_EXTENSION,
      UnsupportedSchemaVersionIssueCode.UNSUPPORTED_SCHEMA_VERSION,
    ]);
  });

  it("does not mutate content definitions or validation context arrays", () => {
    const definitions = createValidDefinitions();
    const context = createValidContext(definitions);
    const definitionsBefore = JSON.parse(JSON.stringify(definitions));
    const contextBefore = JSON.parse(JSON.stringify(context));
    const concepts = definitions.concepts;
    const generatorIds = context.extensionCapabilities.generatorIds;
    const supportedSchemaVersions = context.schemaSupport.supportedSchemaVersions;

    validateContent(definitions, context);

    expect(definitions).toEqual(definitionsBefore);
    expect(context).toEqual(contextBefore);
    expect(definitions.concepts).toBe(concepts);
    expect(context.extensionCapabilities.generatorIds).toBe(generatorIds);
    expect(context.schemaSupport.supportedSchemaVersions).toBe(
      supportedSchemaVersions,
    );
  });

  it("allows valid preflighted content to be explicitly registered in a fresh registry", () => {
    const definitions = createValidDefinitions();
    const report = validateContent(definitions, createValidContext(definitions));

    expect(report.valid).toBe(true);

    const registry = new ContentRegistry();
    definitions.packs!.forEach((definition) => registry.registerPack(definition));
    definitions.concepts!.forEach((definition) =>
      registry.registerConcept(definition),
    );
    definitions.courses!.forEach((definition) =>
      registry.registerCourse(definition),
    );
    definitions.worlds!.forEach((definition) =>
      registry.registerWorld(definition),
    );
    definitions.lessons!.forEach((definition) =>
      registry.registerLesson(definition),
    );
    definitions.activities!.forEach((definition) =>
      registry.registerActivity(definition),
    );
    definitions.missionTemplates!.forEach((definition) =>
      registry.registerMissionTemplate(definition),
    );

    expect(registry.getPack(definitions.packs![0]!.id)).toBe(
      definitions.packs![0],
    );
    expect(registry.getConcept(definitions.concepts![1]!.id)).toBe(
      definitions.concepts![1],
    );
    expect(registry.getCourse(definitions.courses![0]!.id)).toBe(
      definitions.courses![0],
    );
    expect(registry.getWorld(definitions.worlds![0]!.id)).toBe(
      definitions.worlds![0],
    );
    expect(registry.getLesson(definitions.lessons![0]!.id)).toBe(
      definitions.lessons![0],
    );
    expect(registry.getActivity(definitions.activities![0]!.id)).toBe(
      definitions.activities![0],
    );
    expect(
      registry.getMissionTemplate(definitions.missionTemplates![0]!.id),
    ).toBe(definitions.missionTemplates![0]);
  });

  it("returns invalid so normal loading composition can gate registration", () => {
    const { definitions, context } = createMixedInvalidCase();

    const report = validateContent(definitions, context);

    expect(report.valid).toBe(false);
    expect(report.issues.length).toBeGreaterThan(0);
  });
});
