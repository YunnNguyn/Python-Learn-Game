import type {
  GraderId,
  HintSetId,
  MissionGeneratorId,
  RuntimeId,
  VisualizationModuleId,
} from "../domain";

import {
  ContentDefinitionKind,
  type ContentDefinitionKind as ContentDefinitionKindType,
  type ContentDefinitionSet,
} from "./duplicate-id-validator";

export interface ExtensionCapabilitySet {
  readonly generatorIds?: readonly MissionGeneratorId[];
  readonly graderIds?: readonly GraderId[];
  readonly runtimeIds?: readonly RuntimeId[];
  readonly hintSetIds?: readonly HintSetId[];
  readonly visualizationModuleIds?: readonly VisualizationModuleId[];
}

export const ExtensionKind = {
  GENERATOR: "GENERATOR",
  GRADER: "GRADER",
  RUNTIME: "RUNTIME",
  HINT_SET: "HINT_SET",
  VISUALIZATION_MODULE: "VISUALIZATION_MODULE",
} as const;

export type ExtensionKind = (typeof ExtensionKind)[keyof typeof ExtensionKind];

export const MissingExtensionIssueCode = {
  MISSING_EXTENSION: "MISSING_EXTENSION",
} as const;

export interface MissingExtensionIssue {
  readonly code: typeof MissingExtensionIssueCode.MISSING_EXTENSION;
  readonly sourceKind: ContentDefinitionKindType;
  readonly sourceId: string;
  /** Zero-based position within the missionTemplates input. */
  readonly sourceIndex: number;
  readonly fieldPath: string;
  readonly extensionKind: ExtensionKind;
  readonly referencedId: string;
  readonly message: string;
}

function collectIds(ids: readonly string[] | undefined): ReadonlySet<string> {
  return new Set(ids ?? []);
}

function reportMissingExtension(
  issues: MissingExtensionIssue[],
  sourceId: string,
  sourceIndex: number,
  fieldPath: string,
  extensionKind: ExtensionKind,
  referencedId: string,
  availableIds: ReadonlySet<string>,
): void {
  if (availableIds.has(referencedId)) {
    return;
  }

  const sourceKind = ContentDefinitionKind.MISSION_TEMPLATE;

  issues.push({
    code: MissingExtensionIssueCode.MISSING_EXTENSION,
    sourceKind,
    sourceId,
    sourceIndex,
    fieldPath,
    extensionKind,
    referencedId,
    message: `Missing ${extensionKind} extension "${referencedId}" from ${sourceKind} "${sourceId}" at ${fieldPath}.`,
  });
}

export function validateExtensionIds(
  definitions: ContentDefinitionSet,
  capabilities: ExtensionCapabilitySet,
): readonly MissingExtensionIssue[] {
  const generatorIds = collectIds(capabilities.generatorIds);
  const graderIds = collectIds(capabilities.graderIds);
  const runtimeIds = collectIds(capabilities.runtimeIds);
  const hintSetIds = collectIds(capabilities.hintSetIds);
  const visualizationModuleIds = collectIds(capabilities.visualizationModuleIds);
  const issues: MissingExtensionIssue[] = [];

  (definitions.missionTemplates ?? []).forEach((template, sourceIndex) => {
    reportMissingExtension(
      issues,
      template.id,
      sourceIndex,
      "generator.id",
      ExtensionKind.GENERATOR,
      template.generator.id,
      generatorIds,
    );
    reportMissingExtension(
      issues,
      template.id,
      sourceIndex,
      "grader.id",
      ExtensionKind.GRADER,
      template.grader.id,
      graderIds,
    );
    reportMissingExtension(
      issues,
      template.id,
      sourceIndex,
      "runtime.id",
      ExtensionKind.RUNTIME,
      template.runtime.id,
      runtimeIds,
    );

    if (template.hintSetId !== undefined) {
      reportMissingExtension(
        issues,
        template.id,
        sourceIndex,
        "hintSetId",
        ExtensionKind.HINT_SET,
        template.hintSetId,
        hintSetIds,
      );
    }

    if (template.visualization !== undefined) {
      reportMissingExtension(
        issues,
        template.id,
        sourceIndex,
        "visualization.moduleId",
        ExtensionKind.VISUALIZATION_MODULE,
        template.visualization.moduleId,
        visualizationModuleIds,
      );
    }
  });

  return issues;
}
