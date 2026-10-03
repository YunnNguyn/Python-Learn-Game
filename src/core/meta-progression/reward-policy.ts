import {
  HintLevel,
  LearningStage,
  type AttemptRecord,
} from "../domain";
import {
  DailyGoalId,
  InventoryItemId,
  type DailyGoalProgress,
  type DailyStudyStats,
  type InventoryBalances,
} from "./meta-types";

export const DAILY_GOAL_DEFINITIONS = [
  {
    id: DailyGoalId.SUBMIT_TWICE,
    title: "Nộp bài 2 lần",
    description: "Hai lần Nộp bài bất kỳ trong ngày.",
    target: 2,
  },
  {
    id: DailyGoalId.PASS_ONCE,
    title: "Đạt ít nhất 1 bài",
    description: "Có một lần Nộp bài đạt yêu cầu.",
    target: 1,
  },
  {
    id: DailyGoalId.FOCUSED_PASS,
    title: "Một lần đạt độc lập",
    description: "Đạt bài mà không mở gợi ý H3 hoặc H4.",
    target: 1,
  },
] as const;

export function firstActivityPassReward(
  stage: AttemptRecord["learningStage"],
): InventoryBalances {
  switch (stage) {
    case LearningStage.INDEPENDENT:
      return inventory(14, 8, 1);
    case LearningStage.TRANSFER:
      return inventory(12, 10, 2);
    case LearningStage.REVIEW:
    case LearningStage.RETENTION:
      return inventory(8, 8, 1);
    case LearningStage.DISCOVER:
    case LearningStage.GUIDED:
      return inventory(12, 6, 1);
  }
}

export function focusedActivityPassReward(): InventoryBalances {
  return inventory(0, 2, 0);
}

export function dailyFirstPassReward(): InventoryBalances {
  return inventory(4, 2, 0);
}

export function dailyGoalsCompleteReward(): InventoryBalances {
  return inventory(6, 3, 1);
}

export function isFocusedPass(attempt: AttemptRecord): boolean {
  return (
    attempt.passed &&
    !attempt.hintsUsed.includes(HintLevel.H3) &&
    !attempt.hintsUsed.includes(HintLevel.H4)
  );
}

export function dailyGoalProgress(stats: DailyStudyStats): readonly DailyGoalProgress[] {
  const values = {
    [DailyGoalId.SUBMIT_TWICE]: stats.attempts,
    [DailyGoalId.PASS_ONCE]: stats.passes,
    [DailyGoalId.FOCUSED_PASS]: stats.focusedPasses,
  } satisfies Record<DailyGoalId, number>;

  return DAILY_GOAL_DEFINITIONS.map((definition) => {
    const current = Math.min(values[definition.id], definition.target);
    return {
      ...definition,
      current,
      completed: current >= definition.target,
    };
  });
}

export function areDailyGoalsComplete(stats: DailyStudyStats): boolean {
  return dailyGoalProgress(stats).every((goal) => goal.completed);
}

function inventory(
  metalPlate: number,
  circuitBoard: number,
  energyCell: number,
): InventoryBalances {
  return {
    [InventoryItemId.METAL_PLATE]: metalPlate,
    [InventoryItemId.CIRCUIT_BOARD]: circuitBoard,
    [InventoryItemId.ENERGY_CELL]: energyCell,
  };
}
