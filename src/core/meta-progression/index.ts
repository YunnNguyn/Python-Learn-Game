export { createBrowserMetaProgressionPersistence } from "./browser-meta-progression-persistence";
export { IndexedDbMetaProgressionPersistence } from "./indexeddb-meta-progression-persistence";
export {
  MetaProgressionEngine,
  localDateKey,
} from "./meta-progression-engine";
export type {
  AssembleRobotResult,
  BuildRobotPartResult,
} from "./meta-progression-engine";
export type {
  MetaProgressionPersistence,
  MetaProgressionPersistenceCloseState,
} from "./meta-progression-persistence";
export {
  MetaProgressionStateUnreadableError,
  MetaProgressionStateUnreadableReason,
  MetaProgressionStorageUnavailableError,
} from "./meta-progression-errors";
export { MemoryMetaProgressionPersistence } from "./memory-meta-progression-persistence";
export {
  DailyGoalId,
  InventoryItemId,
  MetaProgressionStateSchema,
  RewardGrantSchema,
  RewardReason,
  RobotId,
  RobotPartId,
  createEmptyInventory,
  createEmptyMetaProgressionState,
  inventoryItemLabel,
} from "./meta-types";
export type {
  DailyGoalProgress,
  DailyStudyStats,
  InventoryBalances,
  MetaProgressionSnapshot,
  MetaProgressionState,
  RewardGrant,
} from "./meta-types";
export {
  areDailyGoalsComplete,
  dailyFirstPassReward,
  dailyGoalProgress,
  dailyGoalsCompleteReward,
  firstActivityPassReward,
  focusedActivityPassReward,
  isFocusedPass,
} from "./reward-policy";
export {
  STARTER_ROBOT_BLUEPRINT,
  canAfford,
  getStarterRobotPart,
} from "./robot-workshop";
export type { RobotBlueprint, RobotPartBlueprint } from "./robot-workshop";
