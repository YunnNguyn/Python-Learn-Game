import { describe, expect, it } from "vitest";

import {
  AttemptRecordSchema,
  ConceptSchema,
  ConceptSource,
  Difficulty,
  KnowledgeClassification,
  LearningActivityType,
  LearningStage,
  ReviewReason,
  type LearningActivity,
} from "../../src/core/domain";
import { LearningEngine } from "../../src/core/learning";
import { MemoryLearningPersistence } from "../../src/core/persistence";

const concept = ConceptSchema.parse({
  id: "concept.test",
  title: "Test concept",
  classification: KnowledgeClassification.MUST_UNDERSTAND,
  source: ConceptSource.CS116,
  prerequisites: [],
});

const activity = {
  id: "activity.test",
  type: LearningActivityType.CODE_MISSION,
  title: "Practice",
  conceptIds: [concept.id],
  stage: LearningStage.GUIDED,
  missionTemplateId: "template.test",
} as unknown as LearningActivity;

describe("minimal concept review selection", () => {
  it("prioritizes a recent failed attempt and points back to a compatible activity", async () => {
    const store = new MemoryLearningPersistence();
    await store.addAttempt(AttemptRecordSchema.parse({
      id: "attempt.recent",
      activityId: activity.id,
      missionTemplateId: "template.test",
      missionTemplateVersion: 1,
      seed: "seed",
      difficulty: Difficulty.EASY,
      conceptIds: [concept.id],
      learningStage: LearningStage.GUIDED,
      submittedAt: "2026-10-03T10:00:00.000Z",
      passed: false,
      submissionIndex: 1,
      runCountBeforeSubmit: 0,
      hintsUsed: [],
      runtimeErrorCount: 0,
    }));
    const engine = new LearningEngine(store, () => new Date("2026-10-03T12:00:00.000Z"));
    await engine.initialize();

    expect(engine.getReviewRecommendations([concept], [activity])[0]).toMatchObject({
      conceptId: concept.id,
      reason: ReviewReason.RECENT_FAILURE,
      activityId: activity.id,
    });
  });
});
