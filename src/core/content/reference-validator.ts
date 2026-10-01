import { LearningActivityType } from "../domain";

import {
  ContentDefinitionKind,
  type ContentDefinitionSet,
  type ContentDefinitionKind as ContentDefinitionKindType,
} from "./duplicate-id-validator";

export const MissingReferenceIssueCode = {
  MISSING_REFERENCE: "MISSING_REFERENCE",
} as const;

export interface MissingReferenceIssue {
  readonly code: typeof MissingReferenceIssueCode.MISSING_REFERENCE;
  readonly sourceKind: ContentDefinitionKindType;
  readonly sourceId: string;
  /** Zero-based position within the corresponding source-category input. */
  readonly sourceIndex: number;
  readonly fieldPath: string;
  readonly targetKind: ContentDefinitionKindType;
  readonly referencedId: string;
  readonly message: string;
}

interface DefinitionWithId {
  readonly id: string;
}

function collectIds(definitions: readonly DefinitionWithId[]): ReadonlySet<string> {
  return new Set(definitions.map((definition) => definition.id));
}

function reportMissingReference(
  issues: MissingReferenceIssue[],
  sourceKind: ContentDefinitionKindType,
  sourceId: string,
  sourceIndex: number,
  fieldPath: string,
  targetKind: ContentDefinitionKindType,
  referencedId: string,
  targetIds: ReadonlySet<string>,
): void {
  if (targetIds.has(referencedId)) {
    return;
  }

  issues.push({
    code: MissingReferenceIssueCode.MISSING_REFERENCE,
    sourceKind,
    sourceId,
    sourceIndex,
    fieldPath,
    targetKind,
    referencedId,
    message: `Missing ${targetKind} reference "${referencedId}" from ${sourceKind} "${sourceId}" at ${fieldPath}.`,
  });
}

function reportMissingReferences(
  issues: MissingReferenceIssue[],
  sourceKind: ContentDefinitionKindType,
  sourceId: string,
  sourceIndex: number,
  fieldName: string,
  referencedIds: readonly string[],
  targetKind: ContentDefinitionKindType,
  targetIds: ReadonlySet<string>,
): void {
  referencedIds.forEach((referencedId, referenceIndex) => {
    reportMissingReference(
      issues,
      sourceKind,
      sourceId,
      sourceIndex,
      `${fieldName}[${referenceIndex}]`,
      targetKind,
      referencedId,
      targetIds,
    );
  });
}

export function validateReferences(
  definitions: ContentDefinitionSet,
): readonly MissingReferenceIssue[] {
  const packIds = collectIds(definitions.packs ?? []);
  const conceptIds = collectIds(definitions.concepts ?? []);
  const courseIds = collectIds(definitions.courses ?? []);
  const worldIds = collectIds(definitions.worlds ?? []);
  const lessonIds = collectIds(definitions.lessons ?? []);
  const activityIds = collectIds(definitions.activities ?? []);
  const missionTemplateIds = collectIds(definitions.missionTemplates ?? []);
  const issues: MissingReferenceIssue[] = [];

  (definitions.packs ?? []).forEach((pack, sourceIndex) => {
    reportMissingReferences(
      issues,
      ContentDefinitionKind.PACK,
      pack.id,
      sourceIndex,
      "courseIds",
      pack.courseIds,
      ContentDefinitionKind.COURSE,
      courseIds,
    );
    reportMissingReferences(
      issues,
      ContentDefinitionKind.PACK,
      pack.id,
      sourceIndex,
      "dependencies",
      pack.dependencies,
      ContentDefinitionKind.PACK,
      packIds,
    );
  });

  (definitions.concepts ?? []).forEach((concept, sourceIndex) => {
    reportMissingReferences(
      issues,
      ContentDefinitionKind.CONCEPT,
      concept.id,
      sourceIndex,
      "prerequisites",
      concept.prerequisites,
      ContentDefinitionKind.CONCEPT,
      conceptIds,
    );
  });

  (definitions.courses ?? []).forEach((course, sourceIndex) => {
    reportMissingReferences(
      issues,
      ContentDefinitionKind.COURSE,
      course.id,
      sourceIndex,
      "worldIds",
      course.worldIds,
      ContentDefinitionKind.WORLD,
      worldIds,
    );
  });

  (definitions.worlds ?? []).forEach((world, sourceIndex) => {
    reportMissingReferences(
      issues,
      ContentDefinitionKind.WORLD,
      world.id,
      sourceIndex,
      "lessonIds",
      world.lessonIds,
      ContentDefinitionKind.LESSON,
      lessonIds,
    );
  });

  (definitions.lessons ?? []).forEach((lesson, sourceIndex) => {
    reportMissingReferences(
      issues,
      ContentDefinitionKind.LESSON,
      lesson.id,
      sourceIndex,
      "conceptIds",
      lesson.conceptIds,
      ContentDefinitionKind.CONCEPT,
      conceptIds,
    );
    reportMissingReferences(
      issues,
      ContentDefinitionKind.LESSON,
      lesson.id,
      sourceIndex,
      "activityIds",
      lesson.activityIds,
      ContentDefinitionKind.ACTIVITY,
      activityIds,
    );
  });

  (definitions.activities ?? []).forEach((activity, sourceIndex) => {
    switch (activity.type) {
      case LearningActivityType.CODE_MISSION:
      case LearningActivityType.DEBUG_MISSION:
      case LearningActivityType.BOSS_MISSION:
        reportMissingReference(
          issues,
          ContentDefinitionKind.ACTIVITY,
          activity.id,
          sourceIndex,
          "missionTemplateId",
          ContentDefinitionKind.MISSION_TEMPLATE,
          activity.missionTemplateId,
          missionTemplateIds,
        );
        break;
      case LearningActivityType.PREDICT_OUTPUT:
      case LearningActivityType.EXPLAIN_SHAPE:
      case LearningActivityType.RECALL_CODE:
        break;
    }
  });

  (definitions.missionTemplates ?? []).forEach((template, sourceIndex) => {
    reportMissingReferences(
      issues,
      ContentDefinitionKind.MISSION_TEMPLATE,
      template.id,
      sourceIndex,
      "conceptIds",
      template.conceptIds,
      ContentDefinitionKind.CONCEPT,
      conceptIds,
    );
  });

  return issues;
}
