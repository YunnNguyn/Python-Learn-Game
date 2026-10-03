import { describe, expect, it } from "vitest";

import {
  AttemptRecordSchema,
  Difficulty,
  HintLevel,
  LearningStage,
  type LearningActivityId,
} from "../../src/core/domain";
import { MemoryLearningPersistence } from "../../src/core/persistence";

const attempt = AttemptRecordSchema.parse({
  id: "attempt.test.1",
  activityId: "activity.test",
  missionTemplateId: "template.test",
  missionTemplateVersion: 1,
  seed: "seed",
  difficulty: Difficulty.EASY,
  conceptIds: ["concept.test"],
  learningStage: LearningStage.GUIDED,
  submittedAt: "2026-10-03T12:00:00.000Z",
  passed: true,
  submissionIndex: 1,
  runCountBeforeSubmit: 0,
  hintsUsed: [HintLevel.H1],
  runtimeErrorCount: 0,
});

describe("MemoryLearningPersistence", () => {
  it("persists immutable attempt snapshots and mission drafts", async () => {
    const store = new MemoryLearningPersistence();
    await store.addAttempt(attempt);
    await store.saveMissionDraft({
      activityId: "activity.test" as LearningActivityId,
      seed: "seed.variant.1",
      variantIndex: 1,
      code: "answer = 42",
      hintsUsed: [HintLevel.H1, HintLevel.H2],
      updatedAt: "2026-10-03T12:01:00.000Z",
    });

    const attempts = await store.getAttempts();
    const draft = await store.getMissionDraft("activity.test" as LearningActivityId);

    expect(attempts).toEqual([attempt]);
    expect(draft?.code).toBe("answer = 42");
    expect(draft?.hintsUsed).toEqual([HintLevel.H1, HintLevel.H2]);
  });

  it("clears attempts and drafts independently", async () => {
    const store = new MemoryLearningPersistence();
    await store.addAttempt(attempt);
    await store.saveMissionDraft({
      activityId: "activity.test" as LearningActivityId,
      seed: "seed",
      variantIndex: 0,
      code: "x = 1",
      hintsUsed: [],
      updatedAt: "2026-10-03T12:01:00.000Z",
    });

    await store.clearAttempts();
    expect(await store.getAttempts()).toEqual([]);
    expect(await store.getMissionDraft("activity.test" as LearningActivityId)).not.toBeNull();

    await store.clearMissionDrafts();
    expect(await store.getMissionDraft("activity.test" as LearningActivityId)).toBeNull();
  });
});
