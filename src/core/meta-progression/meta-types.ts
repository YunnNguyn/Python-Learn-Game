import { z } from "zod";

export const InventoryItemId = {
  METAL_PLATE: "metal_plate",
  CIRCUIT_BOARD: "circuit_board",
  ENERGY_CELL: "energy_cell",
} as const;

export type InventoryItemId =
  (typeof InventoryItemId)[keyof typeof InventoryItemId];

export const RewardReason = {
  FIRST_ACTIVITY_PASS: "FIRST_ACTIVITY_PASS",
  FOCUSED_ACTIVITY_PASS: "FOCUSED_ACTIVITY_PASS",
  DAILY_FIRST_PASS: "DAILY_FIRST_PASS",
  DAILY_GOALS_COMPLETE: "DAILY_GOALS_COMPLETE",
} as const;

export type RewardReason =
  (typeof RewardReason)[keyof typeof RewardReason];

export const DailyGoalId = {
  SUBMIT_TWICE: "SUBMIT_TWICE",
  PASS_ONCE: "PASS_ONCE",
  FOCUSED_PASS: "FOCUSED_PASS",
} as const;

export type DailyGoalId = (typeof DailyGoalId)[keyof typeof DailyGoalId];

export const RobotPartId = {
  CHASSIS: "chassis",
  DRIVE: "drive",
  SENSOR: "sensor",
  POWER: "power",
  ARM: "arm",
  AI_CORE: "ai_core",
} as const;

export type RobotPartId = (typeof RobotPartId)[keyof typeof RobotPartId];

export const RobotId = {
  STARTER_SCOUT: "starter_scout",
} as const;

export type RobotId = (typeof RobotId)[keyof typeof RobotId];

export interface InventoryBalances {
  readonly metal_plate: number;
  readonly circuit_board: number;
  readonly energy_cell: number;
}

export interface RewardGrant {
  readonly id: string;
  readonly reason: RewardReason;
  readonly items: InventoryBalances;
  readonly awardedAt: string;
  readonly sourceAttemptId?: string;
  readonly sourceActivityId?: string;
  readonly sourceDateKey?: string;
}

export interface DailyStudyStats {
  readonly attempts: number;
  readonly passes: number;
  readonly focusedPasses: number;
}

export interface MetaProgressionState {
  readonly version: 1;
  readonly inventory: InventoryBalances;
  readonly processedAttemptIds: readonly string[];
  readonly rewardedActivityIds: readonly string[];
  readonly focusedRewardedActivityIds: readonly string[];
  readonly dailyFirstPassDateKeys: readonly string[];
  readonly claimedDailyGoalDateKeys: readonly string[];
  readonly dailyStatsByDate: Readonly<Record<string, DailyStudyStats>>;
  readonly rewardHistory: readonly RewardGrant[];
  readonly builtRobotPartIds: readonly RobotPartId[];
  readonly assembledRobotIds: readonly RobotId[];
}

export interface DailyGoalProgress {
  readonly id: DailyGoalId;
  readonly title: string;
  readonly description: string;
  readonly current: number;
  readonly target: number;
  readonly completed: boolean;
}

export interface MetaProgressionSnapshot {
  readonly revision: number;
  readonly ready: boolean;
  readonly inventory: InventoryBalances;
  readonly dailyDateKey: string;
  readonly dailyGoals: readonly DailyGoalProgress[];
  readonly dailyGoalsCompleted: number;
  readonly dailyGoalsTotal: number;
  readonly dailyBonusClaimed: boolean;
  readonly builtRobotPartIds: readonly RobotPartId[];
  readonly assembledRobotIds: readonly RobotId[];
  readonly recentRewards: readonly RewardGrant[];
}

const inventorySchema = z.strictObject({
  metal_plate: z.number().finite().int().min(0),
  circuit_board: z.number().finite().int().min(0),
  energy_cell: z.number().finite().int().min(0),
});

const dailyStudyStatsSchema = z.strictObject({
  attempts: z.number().finite().int().min(0),
  passes: z.number().finite().int().min(0),
  focusedPasses: z.number().finite().int().min(0),
});

export const RewardGrantSchema = z.strictObject({
  id: z.string().trim().min(1),
  reason: z.enum(RewardReason),
  items: inventorySchema,
  awardedAt: z.iso.datetime({ offset: true }),
  sourceAttemptId: z.string().trim().min(1).optional(),
  sourceActivityId: z.string().trim().min(1).optional(),
  sourceDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const MetaProgressionStateSchema = z.strictObject({
  version: z.literal(1),
  inventory: inventorySchema,
  processedAttemptIds: z.array(z.string().trim().min(1)),
  rewardedActivityIds: z.array(z.string().trim().min(1)),
  focusedRewardedActivityIds: z.array(z.string().trim().min(1)),
  dailyFirstPassDateKeys: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  claimedDailyGoalDateKeys: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  dailyStatsByDate: z.record(z.string(), dailyStudyStatsSchema),
  rewardHistory: z.array(RewardGrantSchema),
  builtRobotPartIds: z.array(z.enum(RobotPartId)),
  assembledRobotIds: z.array(z.enum(RobotId)),
});

export function createEmptyInventory(): InventoryBalances {
  return {
    metal_plate: 0,
    circuit_board: 0,
    energy_cell: 0,
  };
}

export function createEmptyMetaProgressionState(): MetaProgressionState {
  return {
    version: 1,
    inventory: createEmptyInventory(),
    processedAttemptIds: [],
    rewardedActivityIds: [],
    focusedRewardedActivityIds: [],
    dailyFirstPassDateKeys: [],
    claimedDailyGoalDateKeys: [],
    dailyStatsByDate: {},
    rewardHistory: [],
    builtRobotPartIds: [],
    assembledRobotIds: [],
  };
}

export function inventoryItemLabel(itemId: InventoryItemId): string {
  switch (itemId) {
    case InventoryItemId.METAL_PLATE:
      return "Tấm kim loại";
    case InventoryItemId.CIRCUIT_BOARD:
      return "Bo mạch";
    case InventoryItemId.ENERGY_CELL:
      return "Pin năng lượng";
  }
}
