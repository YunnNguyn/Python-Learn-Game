import { describe, expect, it } from "vitest";

import {
  CourseSchema,
  LessonSchema,
  WorldSchema,
  type ConceptId,
  type Course,
  type CourseId,
  type LearningActivityId,
  type Lesson,
  type LessonId,
  type World,
  type WorldId,
} from "../../src/core/domain";

describe("curriculum hierarchy schemas", () => {
  it("parses minimal Course, World, and Lesson objects", () => {
    const course = CourseSchema.parse({
      id: "course.test",
      title: "Test course",
      worldIds: [],
    });
    const world = WorldSchema.parse({
      id: "world.test",
      title: "Test world",
      lessonIds: [],
    });
    const lesson = LessonSchema.parse({
      id: "lesson.test",
      title: "Test lesson",
      conceptIds: [],
      activityIds: [],
    });

    const courseId: CourseId = course.id;
    const worldId: WorldId = world.id;
    const lessonId: LessonId = lesson.id;

    expect(courseId).toBe("course.test");
    expect(worldId).toBe("world.test");
    expect(lessonId).toBe("lesson.test");
  });

  it("parses full hierarchy objects and preserves supplied reference order", () => {
    const course = CourseSchema.parse({
      id: "course.full",
      title: "Full course",
      description: "Course fixture",
      worldIds: ["world.first", "world.does.not.exist", "world.first"],
    });
    const world = WorldSchema.parse({
      id: "world.full",
      title: "Full world",
      description: "World fixture",
      lessonIds: ["lesson.first", "lesson.does.not.exist"],
    });
    const lesson = LessonSchema.parse({
      id: "lesson.full",
      title: "Full lesson",
      description: "Lesson fixture",
      conceptIds: ["concept.test", "concept.does.not.exist"],
      activityIds: ["activity.test", "activity.does.not.exist"],
    });

    const courseWorldId: WorldId = course.worldIds[0]!;
    const worldLessonId: LessonId = world.lessonIds[0]!;
    const lessonConceptId: ConceptId = lesson.conceptIds[0]!;
    const lessonActivityId: LearningActivityId = lesson.activityIds[0]!;

    expect(course.worldIds).toEqual([
      "world.first",
      "world.does.not.exist",
      "world.first",
    ]);
    expect(world.lessonIds).toEqual([
      "lesson.first",
      "lesson.does.not.exist",
    ]);
    expect(lesson.conceptIds).toContain("concept.does.not.exist");
    expect(lesson.activityIds).toContain("activity.does.not.exist");
    expect(courseWorldId).toBe("world.first");
    expect(worldLessonId).toBe("lesson.first");
    expect(lessonConceptId).toBe("concept.test");
    expect(lessonActivityId).toBe("activity.test");
  });

  it("retains branded IDs in the public inferred types", () => {
    const course = CourseSchema.parse({
      id: "course.typed",
      title: "Typed course",
      worldIds: ["world.typed"],
    });
    const world = WorldSchema.parse({
      id: "world.typed",
      title: "Typed world",
      lessonIds: ["lesson.typed"],
    });
    const lesson = LessonSchema.parse({
      id: "lesson.typed",
      title: "Typed lesson",
      conceptIds: ["concept.typed"],
      activityIds: ["activity.typed"],
    });

    const typedCourse: Course = course;
    const typedWorld: World = world;
    const typedLesson: Lesson = lesson;

    const courseId: Course["id"] = typedCourse.id;
    const worldId: Course["worldIds"][number] = typedCourse.worldIds[0]!;
    const lessonId: World["lessonIds"][number] = typedWorld.lessonIds[0]!;
    const conceptId: Lesson["conceptIds"][number] = typedLesson.conceptIds[0]!;
    const activityId: Lesson["activityIds"][number] =
      typedLesson.activityIds[0]!;

    expect([courseId, worldId, lessonId, conceptId, activityId]).toEqual([
      "course.typed",
      "world.typed",
      "lesson.typed",
      "concept.typed",
      "activity.typed",
    ]);
  });

  it("keeps hierarchy ID brands incompatible across domains", () => {
    const courseId = "course.test" as CourseId;
    const worldId = "world.test" as WorldId;
    const conceptId = "concept.test" as ConceptId;

    // @ts-expect-error CourseId cannot substitute for WorldId.
    const invalidWorldId: WorldId = courseId;

    // @ts-expect-error WorldId cannot substitute for LessonId.
    const invalidLessonId: LessonId = worldId;

    // @ts-expect-error ConceptId cannot substitute for LearningActivityId.
    const invalidActivityId: LearningActivityId = conceptId;

    expect([invalidWorldId, invalidLessonId, invalidActivityId]).toEqual([
      courseId,
      worldId,
      conceptId,
    ]);
  });

  it.each([
    [
      "missing id",
      CourseSchema,
      { title: "Missing id", worldIds: [] },
    ],
    [
      "blank id",
      CourseSchema,
      { id: "   ", title: "Blank id", worldIds: [] },
    ],
    [
      "blank title",
      CourseSchema,
      { id: "course.blank-title", title: "", worldIds: [] },
    ],
    [
      "worldIds not an array",
      CourseSchema,
      { id: "course.bad-worlds", title: "Bad worlds", worldIds: "world.test" },
    ],
    [
      "invalid WorldId element",
      CourseSchema,
      { id: "course.bad-world", title: "Bad world", worldIds: [""] },
    ],
    [
      "lessonIds not an array",
      WorldSchema,
      { id: "world.bad-lessons", title: "Bad lessons", lessonIds: "lesson.test" },
    ],
    [
      "invalid LessonId element",
      WorldSchema,
      { id: "world.bad-lesson", title: "Bad lesson", lessonIds: ["   "] },
    ],
    [
      "conceptIds malformed",
      LessonSchema,
      {
        id: "lesson.bad-concepts",
        title: "Bad concepts",
        conceptIds: [42],
        activityIds: [],
      },
    ],
    [
      "activityIds malformed",
      LessonSchema,
      {
        id: "lesson.bad-activities",
        title: "Bad activities",
        conceptIds: [],
        activityIds: [null],
      },
    ],
    [
      "unexpected key",
      CourseSchema,
      {
        id: "course.extra",
        title: "Extra",
        worldIds: [],
        unexpected: true,
      },
    ],
    [
      "redundant World.courseId parent reference",
      WorldSchema,
      {
        id: "world.parent",
        title: "Parent reference",
        lessonIds: [],
        courseId: "course.test",
      },
    ],
    [
      "redundant Lesson.worldId parent reference",
      LessonSchema,
      {
        id: "lesson.parent",
        title: "Parent reference",
        conceptIds: [],
        activityIds: [],
        worldId: "world.test",
      },
    ],
  ])("rejects %s", (_caseName, schema, input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });
});
