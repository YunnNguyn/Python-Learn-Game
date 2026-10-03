import { describe, expect, it } from "vitest";

import {
  AttemptRecordSchema,
  Difficulty,
  HintLevel,
  LearningStage,
  MasteryState,
  type ConceptId,
  type LearningActivityId,
} from "../../src/core/domain";
import { LearningEngine } from "../../src/core/learning";
import { MemoryLearningPersistence } from "../../src/core/persistence";

function record(input: {
  id: string;
  stage: LearningStage;
  passed: boolean;
  seed: string;
  submittedAt: string;
  hintsUsed?: HintLevel[];
}) {
  return AttemptRecordSchema.parse({
    id: input.id,
    activityId: "activity.test",
    missionTemplateId: "template.test",
    missionTemplateVersion: 1,
    seed: input.seed,
    difficulty: Difficulty.EASY,
    conceptIds: ["concept.test"],
    learningStage: input.stage,
    submittedAt: input.submittedAt,
    passed: input.passed,
    submissionIndex: 1,
    runCountBeforeSubmit: 0,
    hintsUsed: input.hintsUsed ?? [],
    runtimeErrorCount: 0,
  });
}

describe("LearningEngine", () => {
  it("loads durable attempts and never lets a later failure erase mastery", async () => {
    const store = new MemoryLearningPersistence();
    await store.addAttempt(record({
      id: "a1",
      stage: LearningStage.GUIDED,
      passed: true,
      seed: "s1",
      submittedAt: "2026-10-01T10:00:00.000Z",
    }));
    await store.addAttempt(record({
      id: "a2",
      stage: LearningStage.GUIDED,
      passed: false,
      seed: "s1",
      submittedAt: "2026-10-02T10:00:00.000Z",
    }));

    const engine = new LearningEngine(store);
    await engine.initialize();

    expect(engine.getConceptProgress("concept.test" as ConceptId).mastery).toBe(
      MasteryState.PRACTICING,
    );
    expect(engine.getActivityProgress("activity.test" as LearningActivityId)).toMatchObject({
      attemptCount: 2,
      successfulAttemptCount: 1,
      completed: true,
      lastPassed: false,
    });
  });

  it("requires two independent seeds without H3/H4 for INDEPENDENT evidence", async () => {
    const store = new MemoryLearningPersistence();
    const engine = new LearningEngine(store);
    await engine.initialize();

    await engine.recordAttempt(record({
      id: "i1",
      stage: LearningStage.INDEPENDENT,
      passed: true,
      seed: "seed-a",
      submittedAt: "2026-10-01T10:00:00.000Z",
    }));
    await engine.recordAttempt(record({
      id: "i2",
      stage: LearningStage.INDEPENDENT,
      passed: true,
      seed: "seed-b",
      submittedAt: "2026-10-01T11:00:00.000Z",
      hintsUsed: [HintLevel.H3],
    }));

    expect(engine.getConceptProgress("concept.test" as ConceptId).mastery).toBe(
      MasteryState.DISCOVERED,
    );

    await engine.recordAttempt(record({
      id: "i3",
      stage: LearningStage.INDEPENDENT,
      passed: true,
      seed: "seed-c",
      submittedAt: "2026-10-01T12:00:00.000Z",
      hintsUsed: [HintLevel.H1],
    }));

    expect(engine.getConceptProgress("concept.test" as ConceptId).mastery).toBe(
      MasteryState.INDEPENDENT,
    );
  });

  it("publishes stable progress snapshots when attempts change", async () => {
    const engine = new LearningEngine(new MemoryLearningPersistence());
    let notifications = 0;
    engine.subscribe(() => notifications += 1);
    await engine.initialize();
    const before = engine.getSnapshot();

    await engine.recordAttempt(record({
      id: "n1",
      stage: LearningStage.GUIDED,
      passed: true,
      seed: "seed",
      submittedAt: "2026-10-03T10:00:00.000Z",
    }));

    expect(engine.getSnapshot().revision).toBeGreaterThan(before.revision);
    expect(engine.getSnapshot().attemptCount).toBe(1);
    expect(notifications).toBeGreaterThanOrEqual(2);
  });
});
