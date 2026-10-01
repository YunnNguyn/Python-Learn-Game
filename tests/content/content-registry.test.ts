import { describe, expect, it } from "vitest";

import { ContentRegistry } from "../../src/core/content";
import {
  ConceptSchema,
  ContentPackManifestSchema,
  CourseSchema,
  LearningActivitySchema,
  LessonSchema,
  MissionTemplateSchema,
  WorldSchema,
  type ConceptId,
  type ContentPackId,
  type CourseId,
  type LearningActivityId,
  type LessonId,
  type MissionTemplateId,
  type WorldId,
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

describe("ContentRegistry", () => {
  it("starts empty and returns undefined for missing lookups", () => {
    const registry = new ContentRegistry();

    expect(registry.getPack("missing.pack" as ContentPackId)).toBeUndefined();
    expect(registry.getConcept("missing.concept" as ConceptId)).toBeUndefined();
    expect(registry.getCourse("missing.course" as CourseId)).toBeUndefined();
    expect(registry.getWorld("missing.world" as WorldId)).toBeUndefined();
    expect(registry.getLesson("missing.lesson" as LessonId)).toBeUndefined();
    expect(
      registry.getActivity("missing.activity" as LearningActivityId),
    ).toBeUndefined();
    expect(
      registry.getMissionTemplate(
        "missing.mission-template" as MissionTemplateId,
      ),
    ).toBeUndefined();

    expect(registry.getPacks()).toEqual([]);
    expect(registry.getConcepts()).toEqual([]);
    expect(registry.getCourses()).toEqual([]);
    expect(registry.getWorlds()).toEqual([]);
    expect(registry.getLessons()).toEqual([]);
    expect(registry.getActivities()).toEqual([]);
    expect(registry.getMissionTemplates()).toEqual([]);
  });

  it("registers and retrieves every static F2.1 content definition type", () => {
    const registry = new ContentRegistry();
    const activity = canonicalFixtures.activities[0]!;

    registry.registerPack(canonicalFixtures.pack);
    registry.registerConcept(canonicalFixtures.concepts[0]!);
    registry.registerCourse(canonicalFixtures.course);
    registry.registerWorld(canonicalFixtures.world);
    registry.registerLesson(canonicalFixtures.lesson);
    registry.registerActivity(activity);
    registry.registerMissionTemplate(canonicalFixtures.missionTemplate);

    expect(registry.getPack(canonicalFixtures.pack.id)).toBe(
      canonicalFixtures.pack,
    );
    expect(registry.getConcept(canonicalFixtures.concepts[0]!.id)).toBe(
      canonicalFixtures.concepts[0],
    );
    expect(registry.getCourse(canonicalFixtures.course.id)).toBe(
      canonicalFixtures.course,
    );
    expect(registry.getWorld(canonicalFixtures.world.id)).toBe(
      canonicalFixtures.world,
    );
    expect(registry.getLesson(canonicalFixtures.lesson.id)).toBe(
      canonicalFixtures.lesson,
    );
    expect(registry.getActivity(activity.id)).toBe(activity);
    expect(
      registry.getMissionTemplate(canonicalFixtures.missionTemplate.id),
    ).toBe(canonicalFixtures.missionTemplate);

    expect(registry.getPacks()).toEqual([canonicalFixtures.pack]);
    expect(registry.getConcepts()).toEqual([canonicalFixtures.concepts[0]]);
    expect(registry.getCourses()).toEqual([canonicalFixtures.course]);
    expect(registry.getWorlds()).toEqual([canonicalFixtures.world]);
    expect(registry.getLessons()).toEqual([canonicalFixtures.lesson]);
    expect(registry.getActivities()).toEqual([activity]);
    expect(registry.getMissionTemplates()).toEqual([
      canonicalFixtures.missionTemplate,
    ]);
  });

  it("preserves insertion order without sorting definitions", () => {
    const registry = new ContentRegistry();
    const [baseConcept, derivedConcept] = canonicalFixtures.concepts;

    registry.registerConcept(derivedConcept!);
    registry.registerConcept(baseConcept!);

    expect(registry.getConcept(derivedConcept!.id)).toBe(derivedConcept);
    expect(registry.getConcept(baseConcept!.id)).toBe(baseConcept);
    expect(registry.getConcepts()).toEqual([derivedConcept, baseConcept]);
  });

  it("returns fresh readonly list snapshots rather than internal maps", () => {
    const registry = new ContentRegistry();
    registry.registerConcept(canonicalFixtures.concepts[0]!);

    const first = registry.getConcepts();
    const second = registry.getConcepts();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it("rejects same-category duplicate IDs without overwriting the original", () => {
    const registry = new ContentRegistry();
    const original = canonicalFixtures.concepts[0]!;
    const duplicate = {
      ...original,
      title: "Different definition using the same ConceptId",
    };

    registry.registerConcept(original);

    expect(() => registry.registerConcept(duplicate)).toThrow(
      `Concept already registered: ${original.id}`,
    );
    expect(registry.getConcept(original.id)).toBe(original);
    expect(registry.getConcepts()).toEqual([original]);
  });

  it("keeps branded registry categories as independent namespaces", () => {
    const registry = new ContentRegistry();
    const sharedConcept = ConceptSchema.parse({
      ...foundation1Fixtures.concepts[0],
      id: "test.shared",
    });
    const sharedLesson = LessonSchema.parse({
      ...foundation1Fixtures.lesson,
      id: "test.shared",
    });

    registry.registerConcept(sharedConcept);
    registry.registerLesson(sharedLesson);

    expect(registry.getConcept(sharedConcept.id)).toBe(sharedConcept);
    expect(registry.getLesson(sharedLesson.id)).toBe(sharedLesson);
  });
});
