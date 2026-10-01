import type {
  Concept,
  ContentPackManifest,
  Course,
  LearningActivity,
  Lesson,
  MissionTemplate,
  World,
} from "../domain";

export interface ContentDefinitionSet {
  readonly packs?: readonly ContentPackManifest[];
  readonly concepts?: readonly Concept[];
  readonly courses?: readonly Course[];
  readonly worlds?: readonly World[];
  readonly lessons?: readonly Lesson[];
  readonly activities?: readonly LearningActivity[];
  readonly missionTemplates?: readonly MissionTemplate[];
}

export const ContentDefinitionKind = {
  PACK: "PACK",
  CONCEPT: "CONCEPT",
  COURSE: "COURSE",
  WORLD: "WORLD",
  LESSON: "LESSON",
  ACTIVITY: "ACTIVITY",
  MISSION_TEMPLATE: "MISSION_TEMPLATE",
} as const;

export type ContentDefinitionKind =
  (typeof ContentDefinitionKind)[keyof typeof ContentDefinitionKind];

export const DuplicateIdIssueCode = {
  DUPLICATE_ID: "DUPLICATE_ID",
} as const;

export interface DuplicateIdIssue {
  readonly code: typeof DuplicateIdIssueCode.DUPLICATE_ID;
  readonly kind: ContentDefinitionKind;
  readonly id: string;
  /** Zero-based positions within the corresponding definition-category input. */
  readonly occurrenceIndexes: readonly number[];
  readonly message: string;
}

interface DefinitionWithId {
  readonly id: string;
}

function findDuplicateIds<TDefinition extends DefinitionWithId>(
  definitions: readonly TDefinition[],
  kind: ContentDefinitionKind,
): DuplicateIdIssue[] {
  const occurrencesById = new Map<string, number[]>();

  definitions.forEach((definition, index) => {
    const id = definition.id;
    const occurrenceIndexes = occurrencesById.get(id);

    if (occurrenceIndexes) {
      occurrenceIndexes.push(index);
      return;
    }

    occurrencesById.set(id, [index]);
  });

  const issues: DuplicateIdIssue[] = [];

  for (const [id, occurrenceIndexes] of occurrencesById) {
    if (occurrenceIndexes.length < 2) {
      continue;
    }

    issues.push({
      code: DuplicateIdIssueCode.DUPLICATE_ID,
      kind,
      id,
      occurrenceIndexes: [...occurrenceIndexes],
      message: `Duplicate ${kind} id "${id}" at indexes ${occurrenceIndexes.join(", ")}.`,
    });
  }

  return issues;
}

export function validateDuplicateIds(
  definitions: ContentDefinitionSet,
): readonly DuplicateIdIssue[] {
  return [
    ...findDuplicateIds(definitions.packs ?? [], ContentDefinitionKind.PACK),
    ...findDuplicateIds(
      definitions.concepts ?? [],
      ContentDefinitionKind.CONCEPT,
    ),
    ...findDuplicateIds(definitions.courses ?? [], ContentDefinitionKind.COURSE),
    ...findDuplicateIds(definitions.worlds ?? [], ContentDefinitionKind.WORLD),
    ...findDuplicateIds(definitions.lessons ?? [], ContentDefinitionKind.LESSON),
    ...findDuplicateIds(
      definitions.activities ?? [],
      ContentDefinitionKind.ACTIVITY,
    ),
    ...findDuplicateIds(
      definitions.missionTemplates ?? [],
      ContentDefinitionKind.MISSION_TEMPLATE,
    ),
  ];
}
