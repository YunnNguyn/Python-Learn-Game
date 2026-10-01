import { describe, expect, it } from "vitest";

import {
  ContentDefinitionKind,
  DuplicateIdIssueCode,
  validateDuplicateIds,
  type ContentDefinitionSet,
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

const canonicalFixtures = {
  pack: ContentPackManifestSchema.parse(
    foundation1Fixtures.contentPackManifest,
  ),
  concepts: foundation1Fixtures.concepts.map((fixture) =>
    ConceptSchema.parse(fixture),
  ),
  course: CourseSchema.parse(foundation1Fixtures.course),
  world: WorldSchema.parse(foundation1Fixtures.world),
  lesson: LessonSchema.parse(foundation1Fixtures.lesson),
  activities: foundation1Fixtures.activities.map((fixture) =>
    LearningActivitySchema.parse(fixture),
  ),
  missionTemplate: MissionTemplateSchema.parse(
    foundation1Fixtures.missionTemplate,
  ),
};

describe("validateDuplicateIds", () => {
  it("returns no issues for omitted or explicitly empty categories", () => {
    expect(validateDuplicateIds({})).toEqual([]);
    expect(
      validateDuplicateIds({
        packs: [],
        concepts: [],
        courses: [],
        worlds: [],
        lessons: [],
        activities: [],
        missionTemplates: [],
      }),
    ).toEqual([]);
  });

  it("returns no issues when all seven categories have unique top-level IDs", () => {
    const definitions: ContentDefinitionSet = {
      packs: [canonicalFixtures.pack],
      concepts: canonicalFixtures.concepts,
      courses: [canonicalFixtures.course],
      worlds: [canonicalFixtures.world],
      lessons: [canonicalFixtures.lesson],
      activities: canonicalFixtures.activities,
      missionTemplates: [canonicalFixtures.missionTemplate],
    };

    expect(validateDuplicateIds(definitions)).toEqual([]);
  });

  it("reports one actionable issue for a duplicate concept ID", () => {
    const [conceptA, conceptB] = canonicalFixtures.concepts;

    expect(
      validateDuplicateIds({ concepts: [conceptA!, conceptB!, conceptA!] }),
    ).toEqual([
      {
        code: DuplicateIdIssueCode.DUPLICATE_ID,
        kind: ContentDefinitionKind.CONCEPT,
        id: conceptA!.id,
        occurrenceIndexes: [0, 2],
        message: `Duplicate CONCEPT id "${conceptA!.id}" at indexes 0, 2.`,
      },
    ]);
  });

  it("groups three occurrences into one activity issue", () => {
    const [activityA, activityB] = canonicalFixtures.activities;

    const issues = validateDuplicateIds({
      activities: [activityA!, activityB!, activityA!, activityA!],
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: DuplicateIdIssueCode.DUPLICATE_ID,
      kind: ContentDefinitionKind.ACTIVITY,
      id: activityA!.id,
      occurrenceIndexes: [0, 2, 3],
    });
  });

  it("orders duplicate groups by first occurrence rather than by ID", () => {
    const [conceptA, conceptB] = canonicalFixtures.concepts;

    const issues = validateDuplicateIds({
      concepts: [conceptB!, conceptA!, conceptB!, conceptA!],
    });

    expect(issues.map((issue) => issue.id)).toEqual([
      conceptB!.id,
      conceptA!.id,
    ]);
    expect(issues.map((issue) => issue.occurrenceIndexes)).toEqual([
      [0, 2],
      [1, 3],
    ]);
  });

  it("orders issues by the canonical category order", () => {
    const concept = canonicalFixtures.concepts[0]!;

    const issues = validateDuplicateIds({
      packs: [canonicalFixtures.pack, canonicalFixtures.pack],
      concepts: [concept, concept],
      lessons: [canonicalFixtures.lesson, canonicalFixtures.lesson],
      missionTemplates: [
        canonicalFixtures.missionTemplate,
        canonicalFixtures.missionTemplate,
      ],
    });

    expect(issues.map((issue) => issue.kind)).toEqual([
      ContentDefinitionKind.PACK,
      ContentDefinitionKind.CONCEPT,
      ContentDefinitionKind.LESSON,
      ContentDefinitionKind.MISSION_TEMPLATE,
    ]);
  });

  it("allows equal runtime ID strings in different categories", () => {
    const concept = ConceptSchema.parse({
      ...foundation1Fixtures.concepts[0],
      id: "shared.id",
    });
    const lesson = LessonSchema.parse({
      ...foundation1Fixtures.lesson,
      id: "shared.id",
    });

    expect(
      validateDuplicateIds({ concepts: [concept], lessons: [lesson] }),
    ).toEqual([]);
  });

  it("treats different activity subtypes as one activity ID namespace", () => {
    const codeMission = canonicalFixtures.activities[0]!;
    const predictOutput = LearningActivitySchema.parse({
      ...foundation1Fixtures.activities[1],
      id: codeMission.id,
    });

    expect(
      validateDuplicateIds({ activities: [codeMission, predictOutput] }),
    ).toMatchObject([
      {
        kind: ContentDefinitionKind.ACTIVITY,
        id: codeMission.id,
        occurrenceIndexes: [0, 1],
      },
    ]);
  });

  it("treats mission-template versions as the same ID namespace", () => {
    const templateV1 = canonicalFixtures.missionTemplate;
    const templateV2 = {
      ...templateV1,
      version: templateV1.version + 1,
    };

    expect(
      validateDuplicateIds({ missionTemplates: [templateV1, templateV2] }),
    ).toMatchObject([
      {
        kind: ContentDefinitionKind.MISSION_TEMPLATE,
        id: templateV1.id,
        occurrenceIndexes: [0, 1],
      },
    ]);
  });

  it("does not treat duplicate references inside a definition as duplicate definitions", () => {
    const course = CourseSchema.parse({
      ...foundation1Fixtures.course,
      worldIds: ["world.missing", "world.missing"],
    });

    expect(validateDuplicateIds({ courses: [course] })).toEqual([]);
  });

  it("does not mutate definition arrays or their ordering", () => {
    const [conceptA, conceptB] = canonicalFixtures.concepts;
    const concepts = [conceptB!, conceptA!, conceptB!];
    const before = [...concepts];

    validateDuplicateIds({ concepts });

    expect(concepts).toEqual(before);
    expect(concepts[0]).toBe(before[0]);
    expect(concepts[1]).toBe(before[1]);
    expect(concepts[2]).toBe(before[2]);
  });
});
