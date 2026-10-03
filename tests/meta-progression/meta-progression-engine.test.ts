import { describe, expect, it } from "vitest";

import {
  AttemptRecordSchema,
  Difficulty,
  HintLevel,
  LearningStage,
} from "../../src/core/domain";
import {
  MetaProgressionEngine,
  MemoryMetaProgressionPersistence,
  RewardReason,
} from "../../src/core/meta-progression";

function attempt(input: {
  id: string;
  activityId?: string;
  stage?: LearningStage;
  passed: boolean;
  submittedAt: string;
  hintsUsed?: HintLevel[];
}) {
  return AttemptRecordSchema.parse({
    id: input.id,
    activityId: input.activityId ?? "activity.test",
    missionTemplateId: "template.test",
    missionTemplateVersion: 1,
    seed: `seed:${input.id}`,
    difficulty: Difficulty.EASY,
    conceptIds: ["concept.test"],
    learningStage: input.stage ?? LearningStage.GUIDED,
    submittedAt: input.submittedAt,
    passed: input.passed,
    submissionIndex: 1,
    runCountBeforeSubmit: 0,
    hintsUsed: input.hintsUsed ?? [],
    runtimeErrorCount: 0,
  });
}

describe("MetaProgressionEngine", () => {
  it("turns learning evidence into bounded rewards and claims the daily bonus once", async () => {
    const store = new MemoryMetaProgressionPersistence();
    const engine = new MetaProgressionEngine(
      store,
      () => new Date("2026-10-03T12:00:00.000Z"),
    );
    await engine.initialize();

    await engine.recordAttempt(attempt({
      id: "attempt.fail",
      passed: false,
      submittedAt: "2026-10-03T09:00:00.000Z",
    }));
    await engine.recordAttempt(attempt({
      id: "attempt.pass",
      passed: true,
      submittedAt: "2026-10-03T10:00:00.000Z",
    }));

    const snapshot = engine.getSnapshot();
    expect(snapshot.inventory).toEqual({
      metal_plate: 22,
      circuit_board: 13,
      energy_cell: 2,
    });
    expect(snapshot.dailyGoalsCompleted).toBe(3);
    expect(snapshot.dailyBonusClaimed).toBe(true);

    const grants = engine.getRewardGrantsForAttempt("attempt.pass");
    expect(grants.map((grant) => grant.reason)).toEqual([
      RewardReason.FIRST_ACTIVITY_PASS,
      RewardReason.FOCUSED_ACTIVITY_PASS,
      RewardReason.DAILY_FIRST_PASS,
      RewardReason.DAILY_GOALS_COMPLETE,
    ]);

    await engine.recordAttempt(attempt({
      id: "attempt.pass",
      passed: true,
      submittedAt: "2026-10-03T10:00:00.000Z",
    }));
    expect(engine.getSnapshot().inventory).toEqual(snapshot.inventory);
    expect(engine.getSnapshot().recentRewards).toHaveLength(4);
  });

  it("never grants first-pass or focused rewards twice for the same activity", async () => {
    const engine = new MetaProgressionEngine(
      new MemoryMetaProgressionPersistence(),
      () => new Date("2026-10-03T12:00:00.000Z"),
    );
    await engine.initialize();

    await engine.recordAttempt(attempt({
      id: "first",
      passed: true,
      submittedAt: "2026-10-03T08:00:00.000Z",
      hintsUsed: [HintLevel.H3],
    }));
    await engine.recordAttempt(attempt({
      id: "second",
      passed: true,
      submittedAt: "2026-10-03T09:00:00.000Z",
    }));
    await engine.recordAttempt(attempt({
      id: "third",
      passed: true,
      submittedAt: "2026-10-03T10:00:00.000Z",
    }));

    const reasons = engine
      .getSnapshot()
      .recentRewards.map((grant) => grant.reason);
    expect(reasons.filter((reason) => reason === RewardReason.FIRST_ACTIVITY_PASS)).toHaveLength(1);
    expect(reasons.filter((reason) => reason === RewardReason.FOCUSED_ACTIVITY_PASS)).toHaveLength(1);
    expect(reasons.filter((reason) => reason === RewardReason.DAILY_FIRST_PASS)).toHaveLength(1);
    expect(reasons.filter((reason) => reason === RewardReason.DAILY_GOALS_COMPLETE)).toHaveLength(1);
  });

  it("reconciles old AttemptRecords but does not retroactively farm past daily rewards", async () => {
    const engine = new MetaProgressionEngine(
      new MemoryMetaProgressionPersistence(),
      () => new Date("2026-10-03T12:00:00.000Z"),
    );

    await engine.reconcileAttempts([
      attempt({
        id: "old-pass",
        passed: true,
        submittedAt: "2026-09-20T10:00:00.000Z",
      }),
    ]);

    expect(engine.getSnapshot().inventory).toEqual({
      metal_plate: 12,
      circuit_board: 8,
      energy_cell: 1,
    });
    expect(engine.getSnapshot().recentRewards.map((grant) => grant.reason)).toEqual([
      RewardReason.FOCUSED_ACTIVITY_PASS,
      RewardReason.FIRST_ACTIVITY_PASS,
    ]);
  });
});
