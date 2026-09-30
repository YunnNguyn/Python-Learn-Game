import { describe, expect, it } from "vitest";

import {
  LearningActivitySchema,
  LearningActivityType,
  LearningStage,
  type ConceptId,
  type LearningActivity,
  type LearningActivityId,
  type MissionTemplateId,
} from "../../src/core/domain";

const common = {
  conceptIds: ["concept.test"],
  stage: LearningStage.GUIDED,
};

describe("LearningActivitySchema", () => {
  it.each([
    [
      LearningActivityType.CODE_MISSION,
      {
        id: "activity.test.code",
        title: "Code mission",
        type: LearningActivityType.CODE_MISSION,
        missionTemplateId: "mission.test.code",
        ...common,
      },
    ],
    [
      LearningActivityType.DEBUG_MISSION,
      {
        id: "activity.test.debug",
        title: "Debug mission",
        type: LearningActivityType.DEBUG_MISSION,
        missionTemplateId: "mission.test.debug",
        ...common,
      },
    ],
    [
      LearningActivityType.PREDICT_OUTPUT,
      {
        id: "activity.test.predict",
        title: "Predict output",
        type: LearningActivityType.PREDICT_OUTPUT,
        ...common,
      },
    ],
    [
      LearningActivityType.EXPLAIN_SHAPE,
      {
        id: "activity.test.shape",
        title: "Explain shape",
        type: LearningActivityType.EXPLAIN_SHAPE,
        ...common,
      },
    ],
    [
      LearningActivityType.RECALL_CODE,
      {
        id: "activity.test.recall",
        title: "Recall code",
        type: LearningActivityType.RECALL_CODE,
        ...common,
      },
    ],
    [
      LearningActivityType.BOSS_MISSION,
      {
        id: "activity.test.boss",
        title: "Boss mission",
        type: LearningActivityType.BOSS_MISSION,
        missionTemplateId: "mission.test.boss",
        ...common,
      },
    ],
  ])("parses valid %s activity", (_type, input) => {
    expect(LearningActivitySchema.safeParse(input).success).toBe(true);
  });

  it("preserves branded IDs and allows unresolved local references", () => {
    const activity = LearningActivitySchema.parse({
      id: "activity.test.brands",
      title: "Brand check",
      description: "Neutral fixture",
      type: LearningActivityType.CODE_MISSION,
      conceptIds: ["concept.does.not.exist"],
      stage: LearningStage.INDEPENDENT,
      missionTemplateId: "mission.does.not.exist",
    });

    const id: LearningActivityId = activity.id;
    const conceptId: ConceptId = activity.conceptIds[0]!;

    if (activity.type === LearningActivityType.CODE_MISSION) {
      const missionTemplateId: MissionTemplateId = activity.missionTemplateId;
      expect(missionTemplateId).toBe("mission.does.not.exist");
    }

    expect(id).toBe("activity.test.brands");
    expect(conceptId).toBe("concept.does.not.exist");
  });

  it("narrows mission-backed and non-mission variants by type", () => {
    const handle = (activity: LearningActivity) => {
      if (activity.type === LearningActivityType.CODE_MISSION) {
        const missionTemplateId: MissionTemplateId = activity.missionTemplateId;
        return missionTemplateId;
      }

      if (activity.type === LearningActivityType.PREDICT_OUTPUT) {
        // @ts-expect-error Non-mission activities do not expose missionTemplateId.
        return activity.missionTemplateId;
      }

      return activity.id;
    };

    expect(
      handle(
        LearningActivitySchema.parse({
          id: "activity.test.narrow",
          title: "Narrowing",
          type: LearningActivityType.CODE_MISSION,
          conceptIds: [],
          stage: LearningStage.GUIDED,
          missionTemplateId: "mission.test.narrow",
        }),
      ),
    ).toBe("mission.test.narrow");
  });

  it.each([
    [
      "blank activity ID",
      {
        id: "   ",
        title: "Blank id",
        type: LearningActivityType.PREDICT_OUTPUT,
        conceptIds: [],
        stage: LearningStage.REVIEW,
      },
    ],
    [
      "blank title",
      {
        id: "activity.test.blank-title",
        title: "",
        type: LearningActivityType.PREDICT_OUTPUT,
        conceptIds: [],
        stage: LearningStage.REVIEW,
      },
    ],
    [
      "invalid learning stage",
      {
        id: "activity.test.stage",
        title: "Invalid stage",
        type: LearningActivityType.PREDICT_OUTPUT,
        conceptIds: [],
        stage: "PRACTICE",
      },
    ],
    [
      "conceptIds not an array",
      {
        id: "activity.test.concepts-array",
        title: "Bad concepts",
        type: LearningActivityType.PREDICT_OUTPUT,
        conceptIds: "concept.test",
        stage: LearningStage.REVIEW,
      },
    ],
    [
      "invalid ConceptId element",
      {
        id: "activity.test.concept",
        title: "Bad concept",
        type: LearningActivityType.PREDICT_OUTPUT,
        conceptIds: ["   "],
        stage: LearningStage.REVIEW,
      },
    ],
    [
      "unknown property",
      {
        id: "activity.test.extra",
        title: "Extra property",
        type: LearningActivityType.PREDICT_OUTPUT,
        conceptIds: [],
        stage: LearningStage.REVIEW,
        unexpected: true,
      },
    ],
    [
      "CODE_MISSION without missionTemplateId",
      {
        id: "activity.test.missing-mission",
        title: "Missing mission",
        type: LearningActivityType.CODE_MISSION,
        conceptIds: [],
        stage: LearningStage.GUIDED,
      },
    ],
    [
      "PREDICT_OUTPUT with missionTemplateId",
      {
        id: "activity.test.extra-mission",
        title: "Extra mission",
        type: LearningActivityType.PREDICT_OUTPUT,
        conceptIds: [],
        stage: LearningStage.REVIEW,
        missionTemplateId: "mission.invalid-for-this-type",
      },
    ],
    [
      "unknown activity type",
      {
        id: "activity.test.unknown",
        title: "Unknown",
        type: "QUIZ",
        conceptIds: [],
        stage: LearningStage.REVIEW,
      },
    ],
  ])("rejects %s", (_caseName, input) => {
    expect(LearningActivitySchema.safeParse(input).success).toBe(false);
  });
});
