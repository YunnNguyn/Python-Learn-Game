import type { AttemptRecord } from "../domain";
import type { MetaProgressionPersistence } from "./meta-progression-persistence";
import {
  createEmptyInventory,
  createEmptyMetaProgressionState,
  RewardReason,
  RobotId,
  type DailyStudyStats,
  type InventoryBalances,
  type MetaProgressionSnapshot,
  type MetaProgressionState,
  type RewardGrant,
  type RobotPartId,
} from "./meta-types";
import {
  areDailyGoalsComplete,
  dailyFirstPassReward,
  dailyGoalProgress,
  dailyGoalsCompleteReward,
  firstActivityPassReward,
  focusedActivityPassReward,
  isFocusedPass,
} from "./reward-policy";
import {
  canAfford,
  getStarterRobotPart,
  STARTER_ROBOT_BLUEPRINT,
} from "./robot-workshop";

export type BuildRobotPartResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: "UNKNOWN_PART" | "ALREADY_BUILT" | "INSUFFICIENT_ITEMS";
      readonly message: string;
    };

export type AssembleRobotResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly code: "ALREADY_ASSEMBLED" | "MISSING_PARTS";
      readonly message: string;
    };

type Listener = () => void;

const EMPTY_DAILY_STATS: DailyStudyStats = {
  attempts: 0,
  passes: 0,
  focusedPasses: 0,
};

export class MetaProgressionEngine {
  private state: MetaProgressionState = createEmptyMetaProgressionState();
  private readonly listeners = new Set<Listener>();
  private initializePromise: Promise<void> | null = null;
  private readyState = false;
  private revision = 0;
  private snapshot: MetaProgressionSnapshot;

  constructor(
    private readonly persistence: MetaProgressionPersistence,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.snapshot = this.createSnapshot();
  }

  initialize(): Promise<void> {
    this.initializePromise ??= this.loadInitialState();
    return this.initializePromise;
  }

  async reconcileAttempts(attempts: readonly AttemptRecord[]): Promise<void> {
    await this.initialize();
    const sorted = [...attempts].sort((left, right) =>
      left.submittedAt.localeCompare(right.submittedAt),
    );
    let changed = false;

    for (const attempt of sorted) {
      if (this.state.processedAttemptIds.includes(attempt.id)) continue;
      const dateKey = localDateKey(new Date(attempt.submittedAt));
      const allowDailyRewards = dateKey === this.currentDateKey();
      this.applyAttempt(attempt, allowDailyRewards);
      changed = true;
    }

    if (this.tryClaimCurrentDailyBonus()) changed = true;
    if (changed) await this.persistAndPublish();
  }

  async recordAttempt(attempt: AttemptRecord): Promise<void> {
    await this.initialize();
    if (this.state.processedAttemptIds.includes(attempt.id)) return;

    const dateKey = localDateKey(new Date(attempt.submittedAt));
    this.applyAttempt(attempt, dateKey === this.currentDateKey());
    this.tryClaimCurrentDailyBonus(attempt.id, attempt.activityId);
    await this.persistAndPublish();
  }

  async buildRobotPart(partId: RobotPartId): Promise<BuildRobotPartResult> {
    await this.initialize();
    const part = getStarterRobotPart(partId);
    if (!part) {
      return {
        ok: false,
        code: "UNKNOWN_PART",
        message: "Không tìm thấy bộ phận robot này.",
      };
    }
    if (this.state.builtRobotPartIds.includes(partId)) {
      return {
        ok: false,
        code: "ALREADY_BUILT",
        message: "Bộ phận này đã được chế tạo.",
      };
    }
    if (!canAfford(this.state.inventory, part.cost)) {
      return {
        ok: false,
        code: "INSUFFICIENT_ITEMS",
        message: "Bạn chưa đủ vật liệu để chế tạo bộ phận này.",
      };
    }

    this.state = {
      ...this.state,
      inventory: subtractInventory(this.state.inventory, part.cost),
      builtRobotPartIds: [...this.state.builtRobotPartIds, partId],
    };
    await this.persistAndPublish();
    return { ok: true };
  }

  async assembleStarterRobot(): Promise<AssembleRobotResult> {
    await this.initialize();
    if (this.state.assembledRobotIds.includes(RobotId.STARTER_SCOUT)) {
      return {
        ok: false,
        code: "ALREADY_ASSEMBLED",
        message: "Scout-01 đã được lắp ráp hoàn chỉnh.",
      };
    }

    const allPartsBuilt = STARTER_ROBOT_BLUEPRINT.parts.every((part) =>
      this.state.builtRobotPartIds.includes(part.id),
    );
    if (!allPartsBuilt) {
      return {
        ok: false,
        code: "MISSING_PARTS",
        message: "Hãy chế tạo đủ sáu bộ phận trước khi lắp ráp Scout-01.",
      };
    }

    this.state = {
      ...this.state,
      assembledRobotIds: [
        ...this.state.assembledRobotIds,
        RobotId.STARTER_SCOUT,
      ],
    };
    await this.persistAndPublish();
    return { ok: true };
  }

  async clearAll(): Promise<void> {
    await this.initialize();
    await this.persistence.clear();
    this.state = createEmptyMetaProgressionState();
    this.publish();
  }

  getRewardGrantsForAttempt(attemptId: string): readonly RewardGrant[] {
    return this.state.rewardHistory.filter(
      (grant) => grant.sourceAttemptId === attemptId,
    );
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): MetaProgressionSnapshot {
    return this.snapshot;
  }

  getPersistenceKind(): "indexeddb" | "memory" {
    return this.persistence.kind;
  }

  private async loadInitialState(): Promise<void> {
    this.state =
      (await this.persistence.loadState()) ?? createEmptyMetaProgressionState();
    this.readyState = true;
    this.publish();
  }

  private applyAttempt(attempt: AttemptRecord, allowDailyRewards: boolean): void {
    const dateKey = localDateKey(new Date(attempt.submittedAt));
    const focused = isFocusedPass(attempt);
    const previousStats = this.state.dailyStatsByDate[dateKey] ?? EMPTY_DAILY_STATS;
    const nextStats: DailyStudyStats = {
      attempts: previousStats.attempts + 1,
      passes: previousStats.passes + (attempt.passed ? 1 : 0),
      focusedPasses: previousStats.focusedPasses + (focused ? 1 : 0),
    };

    this.state = {
      ...this.state,
      processedAttemptIds: [...this.state.processedAttemptIds, attempt.id],
      dailyStatsByDate: {
        ...this.state.dailyStatsByDate,
        [dateKey]: nextStats,
      },
    };

    if (!attempt.passed) return;

    if (!this.state.rewardedActivityIds.includes(attempt.activityId)) {
      this.addReward({
        id: rewardId(RewardReason.FIRST_ACTIVITY_PASS, attempt.activityId),
        reason: RewardReason.FIRST_ACTIVITY_PASS,
        items: firstActivityPassReward(attempt.learningStage),
        awardedAt: attempt.submittedAt,
        sourceAttemptId: attempt.id,
        sourceActivityId: attempt.activityId,
      });
      this.state = {
        ...this.state,
        rewardedActivityIds: [
          ...this.state.rewardedActivityIds,
          attempt.activityId,
        ],
      };
    }

    if (
      focused &&
      !this.state.focusedRewardedActivityIds.includes(attempt.activityId)
    ) {
      this.addReward({
        id: rewardId(RewardReason.FOCUSED_ACTIVITY_PASS, attempt.activityId),
        reason: RewardReason.FOCUSED_ACTIVITY_PASS,
        items: focusedActivityPassReward(),
        awardedAt: attempt.submittedAt,
        sourceAttemptId: attempt.id,
        sourceActivityId: attempt.activityId,
      });
      this.state = {
        ...this.state,
        focusedRewardedActivityIds: [
          ...this.state.focusedRewardedActivityIds,
          attempt.activityId,
        ],
      };
    }

    if (
      allowDailyRewards &&
      !this.state.dailyFirstPassDateKeys.includes(dateKey)
    ) {
      this.addReward({
        id: rewardId(RewardReason.DAILY_FIRST_PASS, dateKey),
        reason: RewardReason.DAILY_FIRST_PASS,
        items: dailyFirstPassReward(),
        awardedAt: attempt.submittedAt,
        sourceAttemptId: attempt.id,
        sourceActivityId: attempt.activityId,
        sourceDateKey: dateKey,
      });
      this.state = {
        ...this.state,
        dailyFirstPassDateKeys: [...this.state.dailyFirstPassDateKeys, dateKey],
      };
    }
  }

  private tryClaimCurrentDailyBonus(
    triggeringAttemptId?: string,
    triggeringActivityId?: string,
  ): boolean {
    const dateKey = this.currentDateKey();
    if (this.state.claimedDailyGoalDateKeys.includes(dateKey)) return false;
    const stats = this.state.dailyStatsByDate[dateKey] ?? EMPTY_DAILY_STATS;
    if (!areDailyGoalsComplete(stats)) return false;

    this.addReward({
      id: rewardId(RewardReason.DAILY_GOALS_COMPLETE, dateKey),
      reason: RewardReason.DAILY_GOALS_COMPLETE,
      items: dailyGoalsCompleteReward(),
      awardedAt: this.now().toISOString(),
      ...(triggeringAttemptId
        ? { sourceAttemptId: triggeringAttemptId }
        : {}),
      ...(triggeringActivityId
        ? { sourceActivityId: triggeringActivityId }
        : {}),
      sourceDateKey: dateKey,
    });
    this.state = {
      ...this.state,
      claimedDailyGoalDateKeys: [
        ...this.state.claimedDailyGoalDateKeys,
        dateKey,
      ],
    };
    return true;
  }

  private addReward(grant: RewardGrant): void {
    if (this.state.rewardHistory.some((item) => item.id === grant.id)) return;
    this.state = {
      ...this.state,
      inventory: addInventory(this.state.inventory, grant.items),
      rewardHistory: [...this.state.rewardHistory, grant],
    };
  }

  private async persistAndPublish(): Promise<void> {
    await this.persistence.saveState(this.state);
    this.publish();
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) listener();
  }

  private createSnapshot(): MetaProgressionSnapshot {
    const dateKey = this.currentDateKey();
    const stats = this.state.dailyStatsByDate[dateKey] ?? EMPTY_DAILY_STATS;
    const goals = dailyGoalProgress(stats);
    return Object.freeze({
      revision: this.revision,
      ready: this.readyState,
      inventory: Object.freeze({ ...this.state.inventory }),
      dailyDateKey: dateKey,
      dailyGoals: Object.freeze(goals.map((goal) => Object.freeze({ ...goal }))),
      dailyGoalsCompleted: goals.filter((goal) => goal.completed).length,
      dailyGoalsTotal: goals.length,
      dailyBonusClaimed: this.state.claimedDailyGoalDateKeys.includes(dateKey),
      builtRobotPartIds: Object.freeze([...this.state.builtRobotPartIds]),
      assembledRobotIds: Object.freeze([...this.state.assembledRobotIds]),
      recentRewards: Object.freeze(
        this.state.rewardHistory.slice(-8).reverse().map((grant) =>
          Object.freeze({
            ...grant,
            items: Object.freeze({ ...grant.items }),
          }),
        ),
      ),
    });
  }

  private currentDateKey(): string {
    return localDateKey(this.now());
  }
}

function addInventory(
  current: InventoryBalances,
  delta: InventoryBalances,
): InventoryBalances {
  return {
    metal_plate: current.metal_plate + delta.metal_plate,
    circuit_board: current.circuit_board + delta.circuit_board,
    energy_cell: current.energy_cell + delta.energy_cell,
  };
}

function subtractInventory(
  current: InventoryBalances,
  cost: InventoryBalances,
): InventoryBalances {
  return {
    metal_plate: current.metal_plate - cost.metal_plate,
    circuit_board: current.circuit_board - cost.circuit_board,
    energy_cell: current.energy_cell - cost.energy_cell,
  };
}

function rewardId(reason: RewardReason, key: string): string {
  return `reward:${reason}:${encodeURIComponent(key)}`;
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
