import { describe, expect, it } from "vitest";

import {
  ContentDefinitionKind,
  MissingReferenceIssueCode,
  validateReferences,
  type ContentDefinitionSet,
} from "../../src/core/content";
import {
  ConceptSchema,
  ContentPackManifestSchema,
  CourseSchema,
  LearningActivitySchema,
  LearningActivityType,
  LessonSchema,
  MissionTemplateSchema,
  WorldSchema,
} from "../../src/core/domain";
import { foundation1Fixtures } from "../fixtures/foundation1";

const canonicalFixtures = {
  pack: ContentPackManifestSchema.parse(foundation1Fixtures.contentPackManifest),
  concepts: foundation1Fixtures.concepts.map((fixture) => ConceptSchema.parse(fixture)),
  course: CourseSchema.parse(foundation1Fixtures.course),
  world: WorldSchema.parse(foundation1Fixtures.world),
  lesson: LessonSchema.parse(foundation1Fixtures.lesson),
  activities: foundation1Fixtures.activities.map((fixture) =>
    LearningActivitySchema.parse(fixture),
  ),
  missionTemplate: MissionTemplateSchema.parse(foundation1Fixtures.missionTemplate),
};

const coherentDefinitions: ContentDefinitionSet = {
  packs: [canonicalFixtures.pack],
  concepts: canonicalFixtures.concepts,
  courses: [canonicalFixtures.course],
  worlds: [canonicalFixtures.world],
  lessons: [canonicalFixtures.lesson],
  activities: canonicalFixtures.activities,
  missionTemplates: [canonicalFixtures.missionTemplate],
};

describe("validateReferences", () => {
  it("returns no issues for empty input", () => {
    expect(validateReferences({})).toEqual([]);
  });

  it("returns no issues for a coherent set covering every reference family", () => {
    expect(validateReferences(coherentDefinitions)).toEqual([]);
  });

  it("reports a missing pack course reference with an actionable message", () => {
    const pack = ContentPackManifestSchema.parse({
      ...foundation1Fixtures.contentPackManifest,
      courseIds: ["course.missing"],
    });

    expect(validateReferences({ packs: [pack] })).toEqual([
      {
        code: MissingReferenceIssueCode.MISSING_REFERENCE,
        sourceKind: ContentDefinitionKind.PACK,
        sourceId: pack.id,
        sourceIndex: 0,
        fieldPath: "courseIds[0]",
        targetKind: ContentDefinitionKind.COURSE,
        referencedId: "course.missing",
        message: `Missing COURSE reference "course.missing" from PACK "${pack.id}" at courseIds[0].`,
      },
    ]);
  });

  it("reports a missing pack dependency while accepting self-dependency as existing", () => {
    const pack = ContentPackManifestSchema.parse({
      ...foundation1Fixtures.contentPackManifest,
      id: "pack.self",
      courseIds: [],
      dependencies: ["pack.self", "pack.missing"],
    });

    expect(validateReferences({ packs: [pack] })).toMatchObject([
      {
        sourceKind: ContentDefinitionKind.PACK,
        sourceId: "pack.self",
        sourceIndex: 0,
        fieldPath: "dependencies[1]",
        targetKind: ContentDefinitionKind.PACK,
        referencedId: "pack.missing",
      },
    ]);
  });

  it("reports a missing course world reference", () => {
    const course = CourseSchema.parse({
      ...foundation1Fixtures.course,
      worldIds: ["world.missing"],
    });

    expect(validateReferences({ courses: [course] })).toMatchObject([
      { fieldPath: "worldIds[0]", targetKind: ContentDefinitionKind.WORLD },
    ]);
  });

  it("reports a missing world lesson reference", () => {
    const world = WorldSchema.parse({
      ...foundation1Fixtures.world,
      lessonIds: ["lesson.missing"],
    });

    expect(validateReferences({ worlds: [world] })).toMatchObject([
      { fieldPath: "lessonIds[0]", targetKind: ContentDefinitionKind.LESSON },
    ]);
  });

  it("reports missing lesson concept and activity references in field order", () => {
    const lesson = LessonSchema.parse({
      ...foundation1Fixtures.lesson,
      conceptIds: ["concept.missing"],
      activityIds: ["activity.missing"],
    });

    expect(validateReferences({ lessons: [lesson] })).toMatchObject([
      {
        fieldPath: "conceptIds[0]",
        targetKind: ContentDefinitionKind.CONCEPT,
        referencedId: "concept.missing",
      },
      {
        fieldPath: "activityIds[0]",
        targetKind: ContentDefinitionKind.ACTIVITY,
        referencedId: "activity.missing",
      },
    ]);
  });

  it("reports a missing concept prerequisite while accepting a self prerequisite", () => {
    const concept = ConceptSchema.parse({
      ...foundation1Fixtures.concepts[0],
      id: "concept.self",
      prerequisites: ["concept.self", "concept.missing"],
    });

    expect(validateReferences({ concepts: [concept] })).toMatchObject([
      {
        sourceKind: ContentDefinitionKind.CONCEPT,
        fieldPath: "prerequisites[1]",
        targetKind: ContentDefinitionKind.CONCEPT,
        referencedId: "concept.missing",
      },
    ]);
  });

  it("reports a missing template for every mission-backed activity variant", () => {
    const variants = [
      LearningActivityType.CODE_MISSION,
      LearningActivityType.DEBUG_MISSION,
      LearningActivityType.BOSS_MISSION,
    ].map((type, index) =>
      LearningActivitySchema.parse({
        id: `activity.mission.${index}`,
        title: `Mission ${index}`,
        type,
        conceptIds: [],
        stage: foundation1Fixtures.activities[0].stage,
        missionTemplateId: `mission.missing.${index}`,
      }),
    );

    expect(validateReferences({ activities: variants })).toMatchObject([
      {
        sourceKind: ContentDefinitionKind.ACTIVITY,
        sourceIndex: 0,
        fieldPath: "missionTemplateId",
        targetKind: ContentDefinitionKind.MISSION_TEMPLATE,
        referencedId: "mission.missing.0",
      },
      {
        sourceKind: ContentDefinitionKind.ACTIVITY,
        sourceIndex: 1,
        fieldPath: "missionTemplateId",
        targetKind: ContentDefinitionKind.MISSION_TEMPLATE,
        referencedId: "mission.missing.1",
      },
      {
        sourceKind: ContentDefinitionKind.ACTIVITY,
        sourceIndex: 2,
        fieldPath: "missionTemplateId",
        targetKind: ContentDefinitionKind.MISSION_TEMPLATE,
        referencedId: "mission.missing.2",
      },
    ]);
  });

  it("does not require mission templates for non-mission activities", () => {
    const variants = [
      LearningActivityType.PREDICT_OUTPUT,
      LearningActivityType.EXPLAIN_SHAPE,
      LearningActivityType.RECALL_CODE,
    ].map((type, index) =>
      LearningActivitySchema.parse({
        id: `activity.non-mission.${index}`,
        title: `Non-mission ${index}`,
        type,
        conceptIds: [],
        stage: foundation1Fixtures.activities[1].stage,
      }),
    );

    expect(validateReferences({ activities: variants })).toEqual([]);
  });

  it("reports missing MissionTemplate concept references", () => {
    const template = MissionTemplateSchema.parse({
      ...foundation1Fixtures.missionTemplate,
      conceptIds: ["concept.missing"],
    });

    expect(validateReferences({ missionTemplates: [template] })).toMatchObject([
      {
        sourceKind: ContentDefinitionKind.MISSION_TEMPLATE,
        fieldPath: "conceptIds[0]",
        targetKind: ContentDefinitionKind.CONCEPT,
        referencedId: "concept.missing",
      },
    ]);
  });

  it("ignores MissionTemplate extension IDs in F2.3", () => {
    const template = MissionTemplateSchema.parse({
      ...foundation1Fixtures.missionTemplate,
      conceptIds: [],
      generator: { id: "generator.unregistered" },
      grader: { id: "grader.unregistered" },
      runtime: { id: "runtime.unregistered" },
      hintSetId: "hints.unregistered",
      visualization: { moduleId: "visualization.unregistered" },
    });

    expect(validateReferences({ missionTemplates: [template] })).toEqual([]);
  });

  it("treats a duplicate target ID as existing", () => {
    const conceptA = ConceptSchema.parse({
      ...foundation1Fixtures.concepts[0],
      id: "concept.duplicate",
    });
    const conceptB = ConceptSchema.parse({
      ...foundation1Fixtures.concepts[1],
      id: "concept.duplicate",
      prerequisites: [],
    });
    const lesson = LessonSchema.parse({
      ...foundation1Fixtures.lesson,
      conceptIds: ["concept.duplicate"],
      activityIds: [],
    });

    expect(
      validateReferences({ concepts: [conceptA, conceptB], lessons: [lesson] }),
    ).toEqual([]);
  });

  it("reports repeated missing references once per occurrence", () => {
    const course = CourseSchema.parse({
      ...foundation1Fixtures.course,
      worldIds: ["world.missing", "world.missing"],
    });

    const issues = validateReferences({ courses: [course] });

    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.fieldPath)).toEqual([
      "worldIds[0]",
      "worldIds[1]",
    ]);
  });

  it("orders issues by category, source input, field, and array index", () => {
    const packA = ContentPackManifestSchema.parse({
      ...foundation1Fixtures.contentPackManifest,
      id: "pack.a",
      courseIds: ["course.missing.0", "course.missing.1"],
      dependencies: ["pack.missing"],
    });
    const packB = ContentPackManifestSchema.parse({
      ...foundation1Fixtures.contentPackManifest,
      id: "pack.b",
      courseIds: ["course.missing.2"],
      dependencies: [],
    });
    const concept = ConceptSchema.parse({
      ...foundation1Fixtures.concepts[0],
      prerequisites: ["concept.missing"],
    });
    const course = CourseSchema.parse({
      ...foundation1Fixtures.course,
      worldIds: ["world.missing"],
    });
    const world = WorldSchema.parse({
      ...foundation1Fixtures.world,
      lessonIds: ["lesson.missing"],
    });
    const lesson = LessonSchema.parse({
      ...foundation1Fixtures.lesson,
      conceptIds: ["concept.lesson-missing"],
      activityIds: ["activity.missing"],
    });
    const activity = LearningActivitySchema.parse({
      ...foundation1Fixtures.activities[0],
      missionTemplateId: "mission.missing",
    });
    const template = MissionTemplateSchema.parse({
      ...foundation1Fixtures.missionTemplate,
      conceptIds: ["concept.template-missing"],
    });

    const issues = validateReferences({
      packs: [packA, packB],
      concepts: [concept],
      courses: [course],
      worlds: [world],
      lessons: [lesson],
      activities: [activity],
      missionTemplates: [template],
    });

    expect(
      issues.map(({ sourceKind, sourceIndex, fieldPath }) => [
        sourceKind,
        sourceIndex,
        fieldPath,
      ]),
    ).toEqual([
      [ContentDefinitionKind.PACK, 0, "courseIds[0]"],
      [ContentDefinitionKind.PACK, 0, "courseIds[1]"],
      [ContentDefinitionKind.PACK, 0, "dependencies[0]"],
      [ContentDefinitionKind.PACK, 1, "courseIds[0]"],
      [ContentDefinitionKind.CONCEPT, 0, "prerequisites[0]"],
      [ContentDefinitionKind.COURSE, 0, "worldIds[0]"],
      [ContentDefinitionKind.WORLD, 0, "lessonIds[0]"],
      [ContentDefinitionKind.LESSON, 0, "conceptIds[0]"],
      [ContentDefinitionKind.LESSON, 0, "activityIds[0]"],
      [ContentDefinitionKind.ACTIVITY, 0, "missionTemplateId"],
      [ContentDefinitionKind.MISSION_TEMPLATE, 0, "conceptIds[0]"],
    ]);
  });

  it("does not mutate input arrays, reference arrays, or object values", () => {
    const packs = [
      ContentPackManifestSchema.parse({
        ...foundation1Fixtures.contentPackManifest,
        courseIds: ["course.missing.1", "course.missing.0"],
        dependencies: ["pack.missing"],
      }),
    ];
    const definitions: ContentDefinitionSet = { packs };
    const before = JSON.parse(JSON.stringify(definitions));
    const courseIds = packs[0]!.courseIds;
    const dependencies = packs[0]!.dependencies;

    validateReferences(definitions);

    expect(definitions).toEqual(before);
    expect(definitions.packs).toBe(packs);
    expect(packs[0]!.courseIds).toBe(courseIds);
    expect(packs[0]!.dependencies).toBe(dependencies);
  });
});
