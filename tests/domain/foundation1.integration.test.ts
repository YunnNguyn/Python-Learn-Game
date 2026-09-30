import { describe, expect, it } from "vitest";

import {
  AttemptRecordSchema,
  ConceptSchema,
  ConceptSource,
  ContentPackManifestSchema,
  CourseSchema,
  Difficulty,
  HintLevel,
  JsonObjectSchema,
  JsonValueSchema,
  KnowledgeClassification,
  LearningActivitySchema,
  LearningActivityType,
  LearningStage,
  LessonSchema,
  MasteryState,
  MissionInstanceSchema,
  MissionTemplateSchema,
  ReviewReason,
  WorldEventSchema,
  WorldSchema,
  type AttemptRecordId,
  type ConceptId,
  type ContentPackId,
  type GraderId,
  type JsonObject,
  type JsonValue,
  type LearningActivityId,
  type MissionGeneratorId,
  type MissionInstanceId,
  type MissionTemplateId,
  type WorldEventType,
  type WorldId,
} from "../../src/core/domain";
import {
  foundation1Fixtures,
  foundation1InvalidFixtures,
} from "../fixtures/foundation1";

describe("Foundation 1 public domain integration", () => {
  it("parses one coherent fixture family through every major public schema", () => {
    const concepts = foundation1Fixtures.concepts.map((fixture) =>
      ConceptSchema.parse(fixture),
    );
    const course = CourseSchema.parse(foundation1Fixtures.course);
    const world = WorldSchema.parse(foundation1Fixtures.world);
    const lesson = LessonSchema.parse(foundation1Fixtures.lesson);
    const activities = foundation1Fixtures.activities.map((fixture) =>
      LearningActivitySchema.parse(fixture),
    );
    const missionTemplate = MissionTemplateSchema.parse(
      foundation1Fixtures.missionTemplate,
    );
    const missionInstance = MissionInstanceSchema.parse(
      foundation1Fixtures.missionInstance,
    );
    const contentPack = ContentPackManifestSchema.parse(
      foundation1Fixtures.contentPackManifest,
    );
    const attempt = AttemptRecordSchema.parse(
      foundation1Fixtures.attemptRecord,
    );
    const worldEvent = WorldEventSchema.parse(foundation1Fixtures.worldEvent);

    expect(concepts[1]?.prerequisites).toEqual(["concept.base"]);
    expect(course.worldIds).toEqual([world.id]);
    expect(world.lessonIds).toEqual([lesson.id]);
    expect(lesson.activityIds).toEqual(activities.map((activity) => activity.id));
    expect(missionInstance.templateId).toBe(missionTemplate.id);
    expect(contentPack.courseIds).toEqual([course.id]);
    expect(attempt.seed).toBe(missionInstance.seed);
    expect(worldEvent.payload).toEqual({ ids: ["r2", "r5"], count: 2 });
  });

  it("preserves branded identities across public schema outputs", () => {
    const concept = ConceptSchema.parse(foundation1Fixtures.concepts[0]);
    const course = CourseSchema.parse(foundation1Fixtures.course);
    const lesson = LessonSchema.parse(foundation1Fixtures.lesson);
    const activity = LearningActivitySchema.parse(
      foundation1Fixtures.activities[0],
    );
    const missionTemplate = MissionTemplateSchema.parse(
      foundation1Fixtures.missionTemplate,
    );
    const missionInstance = MissionInstanceSchema.parse(
      foundation1Fixtures.missionInstance,
    );
    const contentPack = ContentPackManifestSchema.parse(
      foundation1Fixtures.contentPackManifest,
    );
    const attempt = AttemptRecordSchema.parse(
      foundation1Fixtures.attemptRecord,
    );
    const worldEvent = WorldEventSchema.parse(foundation1Fixtures.worldEvent);

    const conceptId: ConceptId = concept.id;
    const worldId: WorldId = course.worldIds[0]!;
    const activityId: LearningActivityId = lesson.activityIds[0]!;
    const generatorId: MissionGeneratorId = missionTemplate.generator.id;
    const graderId: GraderId = missionTemplate.grader.id;
    const instanceId: MissionInstanceId = missionInstance.id;
    const packId: ContentPackId = contentPack.id;
    const attemptId: AttemptRecordId = attempt.id;
    const eventType: WorldEventType = worldEvent.type;

    if (activity.type !== LearningActivityType.CODE_MISSION) {
      throw new Error("Expected mission-backed integration fixture");
    }
    const missionTemplateId: MissionTemplateId = activity.missionTemplateId;

    expect([
      conceptId,
      worldId,
      activityId,
      missionTemplateId,
      generatorId,
      graderId,
      instanceId,
      packId,
      attemptId,
      eventType,
    ]).toEqual([
      "concept.base",
      "world.test",
      "activity.guided",
      "mission.template.test",
      "generator.test",
      "grader.test",
      "mission.instance.test",
      "pack.test",
      "attempt.test",
      "TEST_TARGETS_SELECTED",
    ]);
  });

  it("round-trips representative serializable contracts through JSON", () => {
    const roundTrip = <T>(schema: { parse(value: unknown): T }, fixture: unknown) => {
      const parsed = schema.parse(fixture);
      const serialized = JSON.stringify(parsed);
      const reparsed = schema.parse(JSON.parse(serialized) as unknown);
      expect(reparsed).toEqual(parsed);
    };

    roundTrip(MissionTemplateSchema, foundation1Fixtures.missionTemplate);
    roundTrip(MissionInstanceSchema, foundation1Fixtures.missionInstance);
    roundTrip(
      ContentPackManifestSchema,
      foundation1Fixtures.contentPackManifest,
    );
    roundTrip(AttemptRecordSchema, foundation1Fixtures.attemptRecord);
    roundTrip(WorldEventSchema, foundation1Fixtures.worldEvent);
  });

  it("rejects representative architecture-boundary regressions", () => {
    const cases = [
      [ConceptSchema, foundation1InvalidFixtures.conceptUnexpectedProperty],
      [CourseSchema, foundation1InvalidFixtures.courseMalformedWorldId],
      [
        LearningActivitySchema,
        foundation1InvalidFixtures.missionActivityMissingTemplate,
      ],
      [
        MissionTemplateSchema,
        foundation1InvalidFixtures.missionTemplateNonJsonConfig,
      ],
      [
        MissionInstanceSchema,
        foundation1InvalidFixtures.missionInstanceLearnerLeak,
      ],
      [
        ContentPackManifestSchema,
        foundation1InvalidFixtures.contentPackInvalidSchemaVersion,
      ],
      [AttemptRecordSchema, foundation1InvalidFixtures.attemptRecordSubmitCount],
      [WorldEventSchema, foundation1InvalidFixtures.worldEventTransportState],
    ] as const;

    for (const [schema, fixture] of cases) {
      expect(schema.safeParse(fixture).success).toBe(false);
    }
  });

  it("keeps supporting vocabulary and JSON boundaries available through the public barrel", () => {
    expect(KnowledgeClassification.MUST_RECALL).toBe("MUST_RECALL");
    expect(ConceptSource.EXTRA).toBe("EXTRA");
    expect(LearningStage.TRANSFER).toBe("TRANSFER");
    expect(LearningActivityType.PREDICT_OUTPUT).toBe("PREDICT_OUTPUT");
    expect(MasteryState.RETAINED).toBe("RETAINED");
    expect(ReviewReason.RECENT_FAILURE).toBe("RECENT_FAILURE");
    expect(Difficulty.HARD).toBe("HARD");
    expect(HintLevel.H4).toBe("H4");

    const object: JsonObject = {
      nested: { values: [1, "two", true, null] },
    };
    const value: JsonValue = [object, "serializable"];

    expect(JsonObjectSchema.parse(object)).toEqual(object);
    expect(JsonValueSchema.parse(value)).toEqual(value);
  });
});
