import { describe, expect, it } from "vitest";

import {
  ContentDefinitionKind,
  ExtensionKind,
  MissingExtensionIssueCode,
  validateExtensionIds,
  type ContentDefinitionSet,
  type ExtensionCapabilitySet,
} from "../../src/core/content";
import { MissionTemplateSchema } from "../../src/core/domain";
import { foundation1Fixtures } from "../fixtures/foundation1";

const canonicalTemplate = MissionTemplateSchema.parse(
  foundation1Fixtures.missionTemplate,
);

const allCapabilities: ExtensionCapabilitySet = {
  generatorIds: [canonicalTemplate.generator.id],
  graderIds: [canonicalTemplate.grader.id],
  runtimeIds: [canonicalTemplate.runtime.id],
  hintSetIds: [canonicalTemplate.hintSetId!],
  visualizationModuleIds: [canonicalTemplate.visualization!.moduleId],
};

describe("validateExtensionIds", () => {
  it("returns no issues for empty definitions and capabilities", () => {
    expect(validateExtensionIds({}, {})).toEqual([]);
  });

  it("accepts a template when every referenced extension capability exists", () => {
    expect(
      validateExtensionIds(
        { missionTemplates: [canonicalTemplate] },
        allCapabilities,
      ),
    ).toEqual([]);
  });

  it("reports the three required extension references in canonical field order", () => {
    const template = MissionTemplateSchema.parse({
      ...foundation1Fixtures.missionTemplate,
      hintSetId: undefined,
      visualization: undefined,
    });

    expect(validateExtensionIds({ missionTemplates: [template] }, {})).toEqual([
      {
        code: MissingExtensionIssueCode.MISSING_EXTENSION,
        sourceKind: ContentDefinitionKind.MISSION_TEMPLATE,
        sourceId: template.id,
        sourceIndex: 0,
        fieldPath: "generator.id",
        extensionKind: ExtensionKind.GENERATOR,
        referencedId: template.generator.id,
        message: `Missing GENERATOR extension "${template.generator.id}" from MISSION_TEMPLATE "${template.id}" at generator.id.`,
      },
      {
        code: MissingExtensionIssueCode.MISSING_EXTENSION,
        sourceKind: ContentDefinitionKind.MISSION_TEMPLATE,
        sourceId: template.id,
        sourceIndex: 0,
        fieldPath: "grader.id",
        extensionKind: ExtensionKind.GRADER,
        referencedId: template.grader.id,
        message: `Missing GRADER extension "${template.grader.id}" from MISSION_TEMPLATE "${template.id}" at grader.id.`,
      },
      {
        code: MissingExtensionIssueCode.MISSING_EXTENSION,
        sourceKind: ContentDefinitionKind.MISSION_TEMPLATE,
        sourceId: template.id,
        sourceIndex: 0,
        fieldPath: "runtime.id",
        extensionKind: ExtensionKind.RUNTIME,
        referencedId: template.runtime.id,
        message: `Missing RUNTIME extension "${template.runtime.id}" from MISSION_TEMPLATE "${template.id}" at runtime.id.`,
      },
    ]);
  });

  it("does not report optional extension fields when they are absent", () => {
    const template = MissionTemplateSchema.parse({
      ...foundation1Fixtures.missionTemplate,
      hintSetId: undefined,
      visualization: undefined,
    });
    const capabilities: ExtensionCapabilitySet = {
      generatorIds: [template.generator.id],
      graderIds: [template.grader.id],
      runtimeIds: [template.runtime.id],
    };

    expect(
      validateExtensionIds({ missionTemplates: [template] }, capabilities),
    ).toEqual([]);
  });

  it("reports missing optional hint and visualization references after required fields", () => {
    const capabilities: ExtensionCapabilitySet = {
      generatorIds: [canonicalTemplate.generator.id],
      graderIds: [canonicalTemplate.grader.id],
      runtimeIds: [canonicalTemplate.runtime.id],
    };

    expect(
      validateExtensionIds(
        { missionTemplates: [canonicalTemplate] },
        capabilities,
      ),
    ).toMatchObject([
      {
        fieldPath: "hintSetId",
        extensionKind: ExtensionKind.HINT_SET,
      },
      {
        fieldPath: "visualization.moduleId",
        extensionKind: ExtensionKind.VISUALIZATION_MODULE,
      },
    ]);
  });

  it("reports only capabilities missing from a partial match", () => {
    const capabilities: ExtensionCapabilitySet = {
      generatorIds: [canonicalTemplate.generator.id],
      runtimeIds: [canonicalTemplate.runtime.id],
      visualizationModuleIds: [canonicalTemplate.visualization!.moduleId],
    };

    expect(
      validateExtensionIds(
        { missionTemplates: [canonicalTemplate] },
        capabilities,
      ),
    ).toMatchObject([
      {
        fieldPath: "grader.id",
        extensionKind: ExtensionKind.GRADER,
      },
      {
        fieldPath: "hintSetId",
        extensionKind: ExtensionKind.HINT_SET,
      },
    ]);
  });

  it("treats generator, grader, and runtime as independent namespaces", () => {
    const template = MissionTemplateSchema.parse({
      ...foundation1Fixtures.missionTemplate,
      generator: { id: "extension.shared" },
      grader: { id: "extension.shared" },
      runtime: { id: "extension.shared" },
      hintSetId: undefined,
      visualization: undefined,
    });
    const capabilities: ExtensionCapabilitySet = {
      generatorIds: [template.generator.id],
      graderIds: [template.grader.id],
      runtimeIds: [template.runtime.id],
    };

    expect(
      validateExtensionIds({ missionTemplates: [template] }, capabilities),
    ).toEqual([]);
  });

  it("does not let an ID in the wrong extension category satisfy a reference", () => {
    const template = MissionTemplateSchema.parse({
      ...foundation1Fixtures.missionTemplate,
      generator: { id: "extension.shared" },
      grader: { id: "extension.shared" },
      hintSetId: undefined,
      visualization: undefined,
    });
    const capabilities: ExtensionCapabilitySet = {
      graderIds: [template.grader.id],
      runtimeIds: [template.runtime.id],
    };

    expect(
      validateExtensionIds({ missionTemplates: [template] }, capabilities),
    ).toMatchObject([
      {
        fieldPath: "generator.id",
        extensionKind: ExtensionKind.GENERATOR,
        referencedId: "extension.shared",
      },
    ]);
  });

  it("accepts duplicate IDs inside a capability array", () => {
    const capabilities: ExtensionCapabilitySet = {
      generatorIds: [
        canonicalTemplate.generator.id,
        canonicalTemplate.generator.id,
      ],
      graderIds: [canonicalTemplate.grader.id, canonicalTemplate.grader.id],
      runtimeIds: [canonicalTemplate.runtime.id, canonicalTemplate.runtime.id],
      hintSetIds: [canonicalTemplate.hintSetId!, canonicalTemplate.hintSetId!],
      visualizationModuleIds: [
        canonicalTemplate.visualization!.moduleId,
        canonicalTemplate.visualization!.moduleId,
      ],
    };

    expect(
      validateExtensionIds(
        { missionTemplates: [canonicalTemplate] },
        capabilities,
      ),
    ).toEqual([]);
  });

  it("reports one issue per source occurrence of the same missing runtime", () => {
    const templateA = MissionTemplateSchema.parse({
      ...foundation1Fixtures.missionTemplate,
      id: "mission.template.a",
      hintSetId: undefined,
      visualization: undefined,
    });
    const templateB = MissionTemplateSchema.parse({
      ...foundation1Fixtures.missionTemplate,
      id: "mission.template.b",
      hintSetId: undefined,
      visualization: undefined,
    });
    const capabilities: ExtensionCapabilitySet = {
      generatorIds: [templateA.generator.id],
      graderIds: [templateA.grader.id],
    };

    expect(
      validateExtensionIds(
        { missionTemplates: [templateA, templateB] },
        capabilities,
      ),
    ).toMatchObject([
      {
        sourceId: "mission.template.a",
        sourceIndex: 0,
        fieldPath: "runtime.id",
      },
      {
        sourceId: "mission.template.b",
        sourceIndex: 1,
        fieldPath: "runtime.id",
      },
    ]);
  });

  it("preserves deterministic source and field ordering across templates", () => {
    const templateA = MissionTemplateSchema.parse({
      ...foundation1Fixtures.missionTemplate,
      id: "mission.template.a",
    });
    const templateB = MissionTemplateSchema.parse({
      ...foundation1Fixtures.missionTemplate,
      id: "mission.template.b",
    });

    const issues = validateExtensionIds(
      { missionTemplates: [templateA, templateB] },
      {},
    );

    expect(issues.map(({ sourceIndex, fieldPath }) => [sourceIndex, fieldPath])).toEqual([
      [0, "generator.id"],
      [0, "grader.id"],
      [0, "runtime.id"],
      [0, "hintSetId"],
      [0, "visualization.moduleId"],
      [1, "generator.id"],
      [1, "grader.id"],
      [1, "runtime.id"],
      [1, "hintSetId"],
      [1, "visualization.moduleId"],
    ]);
  });

  it("does not mutate templates, template arrays, or capability arrays", () => {
    const missionTemplates = [canonicalTemplate];
    const generatorIds = [canonicalTemplate.generator.id];
    const graderIds = [canonicalTemplate.grader.id];
    const runtimeIds = [canonicalTemplate.runtime.id];
    const hintSetIds = [canonicalTemplate.hintSetId!];
    const visualizationModuleIds = [canonicalTemplate.visualization!.moduleId];
    const definitions: ContentDefinitionSet = { missionTemplates };
    const capabilities: ExtensionCapabilitySet = {
      generatorIds,
      graderIds,
      runtimeIds,
      hintSetIds,
      visualizationModuleIds,
    };
    const beforeDefinitions = JSON.parse(JSON.stringify(definitions));
    const beforeCapabilities = JSON.parse(JSON.stringify(capabilities));

    validateExtensionIds(definitions, capabilities);

    expect(definitions).toEqual(beforeDefinitions);
    expect(capabilities).toEqual(beforeCapabilities);
    expect(definitions.missionTemplates).toBe(missionTemplates);
    expect(missionTemplates[0]).toBe(canonicalTemplate);
    expect(capabilities.generatorIds).toBe(generatorIds);
    expect(capabilities.graderIds).toBe(graderIds);
    expect(capabilities.runtimeIds).toBe(runtimeIds);
    expect(capabilities.hintSetIds).toBe(hintSetIds);
    expect(capabilities.visualizationModuleIds).toBe(visualizationModuleIds);
  });

  it("ignores JSON-safe extension configs", () => {
    expect(canonicalTemplate.generator.config).toBeDefined();
    expect(canonicalTemplate.grader.config).toBeDefined();
    expect(canonicalTemplate.runtime.config).toBeDefined();
    expect(canonicalTemplate.visualization?.config).toBeDefined();
    expect(
      validateExtensionIds(
        { missionTemplates: [canonicalTemplate] },
        allCapabilities,
      ),
    ).toEqual([]);
  });

  it("does not repeat F2.3 static content reference validation", () => {
    const template = MissionTemplateSchema.parse({
      ...foundation1Fixtures.missionTemplate,
      conceptIds: ["concept.missing"],
    });
    const capabilities: ExtensionCapabilitySet = {
      generatorIds: [template.generator.id],
      graderIds: [template.grader.id],
      runtimeIds: [template.runtime.id],
      hintSetIds: [template.hintSetId!],
      visualizationModuleIds: [template.visualization!.moduleId],
    };

    expect(
      validateExtensionIds({ missionTemplates: [template] }, capabilities),
    ).toEqual([]);
  });
});
