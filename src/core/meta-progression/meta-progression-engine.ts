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

/** What a queued mutation derived: whether it must be written, and its caller's result. */
interface MutationOutcome<T> {
  readonly persist: boolean;
  readonly result: T;
}

const EMPTY_DAILY_STATS: DailyStudyStats = {
  attempts: 0,
  passes: 0,
  focusedPasses: 0,
};

/**
 * Mutation ordering contract (PHASE-04C.3D.4-R1):
 *  - Every state-changing operation (reconcileAttempts, recordAttempt,
 *    buildRobotPart, assembleStarterRobot, clearAll) runs through ONE FIFO
 *    queue, in call order. Derivation, the durable write and publication form a
 *    single logical mutation; the next one starts only after the previous one
 *    settled (succeeded or failed).
 *  - `state` only ever holds COMMITTED state: loaded from, or durably written
 *    to, persistence. A mutation derives its next state from it, writes that,
 *    and commits/publishes only after the write succeeded. Readers
 *    (getSnapshot, getRewardGrantsForAttempt) therefore never see an undurable
 *    change, a failed mutation leaves nothing behind for a later one to
 *    persist, and a successful one is never undone by an earlier failure.
 *  - Each caller receives its own real result or rejection; a failure never
 *    blocks the queue for later operations.
 */
export class MetaProgressionEngine {
  /** Committed state only (see the mutation ordering contract above). */
  private state: MetaProgressionState = createEmptyMetaProgressionState();
  /** Tail of the mutation queue; never rejects, so one failure cannot poison it. */
  private mutationTail: Promise<void> = Promise.resolve();
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

  reconcileAttempts(attempts: readonly AttemptRecord[]): Promise<void> {
    return this.enqueue(() =>
      this.commitDerived(() => {
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
        return { persist: changed, result: undefined };
      }),
    );
  }

  recordAttempt(attempt: AttemptRecord): Promise<void> {
    return this.enqueue(() =>
      this.commitDerived(() => {
        if (this.state.processedAttemptIds.includes(attempt.id)) {
          return { persist: false, result: undefined };
        }

        const dateKey = localDateKey(new Date(attempt.submittedAt));
        this.applyAttempt(attempt, dateKey === this.currentDateKey());
        this.tryClaimCurrentDailyBonus(attempt.id, attempt.activityId);
        return { persist: true, result: undefined };
      }),
    );
  }

  buildRobotPart(partId: RobotPartId): Promise<BuildRobotPartResult> {
    return this.enqueue(() =>
      this.commitDerived<BuildRobotPartResult>(() => {
        const part = getStarterRobotPart(partId);
        if (!part) {
          return {
            persist: false,
            result: {
              ok: false,
              code: "UNKNOWN_PART",
              message: "Không tìm thấy bộ phận robot này.",
            },
          };
        }
        if (this.state.builtRobotPartIds.includes(partId)) {
          return {
            persist: false,
            result: {
              ok: false,
              code: "ALREADY_BUILT",
              message: "Bộ phận này đã được chế tạo.",
            },
          };
        }
        if (!canAfford(this.state.inventory, part.cost)) {
          return {
            persist: false,
            result: {
              ok: false,
              code: "INSUFFICIENT_ITEMS",
              message: "Bạn chưa đủ vật liệu để chế tạo bộ phận này.",
            },
          };
        }

        this.state = {
          ...this.state,
          inventory: subtractInventory(this.state.inventory, part.cost),
          builtRobotPartIds: [...this.state.builtRobotPartIds, partId],
        };
        return { persist: true, result: { ok: true } };
      }),
    );
  }

  assembleStarterRobot(): Promise<AssembleRobotResult> {
    return this.enqueue(() =>
      this.commitDerived<AssembleRobotResult>(() => {
        if (this.state.assembledRobotIds.includes(RobotId.STARTER_SCOUT)) {
          return {
            persist: false,
            result: {
              ok: false,
              code: "ALREADY_ASSEMBLED",
              message: "Scout-01 đã được lắp ráp hoàn chỉnh.",
            },
          };
        }

        const allPartsBuilt = STARTER_ROBOT_BLUEPRINT.parts.every((part) =>
          this.state.builtRobotPartIds.includes(part.id),
        );
        if (!allPartsBuilt) {
          return {
            persist: false,
            result: {
              ok: false,
              code: "MISSING_PARTS",
              message: "Hãy chế tạo đủ sáu bộ phận trước khi lắp ráp Scout-01.",
            },
          };
        }

        this.state = {
          ...this.state,
          assembledRobotIds: [
            ...this.state.assembledRobotIds,
            RobotId.STARTER_SCOUT,
          ],
        };
        return { persist: true, result: { ok: true } };
      }),
    );
  }

  /**
   * Queued like every other mutation: reward/workshop operations called before
   * it are written first and then cleared; those called after it apply to the
   * cleared state. A failed clear changes nothing.
   */
  clearAll(): Promise<void> {
    return this.enqueue(async () => {
      await this.initialize();
      await this.persistence.clear();
      this.state = createEmptyMetaProgressionState();
      this.publish();
    });
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
    // `null` only means "nothing stored yet". Unreadable stored state rejects
    // (MetaProgressionStateUnreadableError) and is never replaced by a fresh
    // profile, so reconciliation can never re-grant rewards over it.
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

  /**
   * Appends `mutation` to the FIFO queue. The returned promise carries the
   * mutation's own result or rejection; the queue tail swallows it so a failed
   * mutation never blocks or fails the ones queued after it. No queued
   * mutation enqueues another one, so the queue cannot deadlock.
   */
  private enqueue<T>(mutation: () => Promise<T>): Promise<T> {
    const run = this.mutationTail.then(mutation);
    this.mutationTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /**
   * One logical mutation, run inside the queue. `derive` computes the next state
   * synchronously from the committed one (reusing the reward helpers, which
   * work on `this.state`); the committed state is restored right away, so
   * readers never see the draft. The draft is committed and published only once
   * the write succeeded: a failed write rejects to the caller and leaves
   * nothing behind - not shown, not "already processed", not written later as a
   * side effect of another save.
   */
  private async commitDerived<T>(derive: () => MutationOutcome<T>): Promise<T> {
    await this.initialize();
    const committed = this.state;
    let outcome: MutationOutcome<T>;
    let next: MetaProgressionState;
    try {
      outcome = derive();
      next = this.state;
    } finally {
      this.state = committed;
    }
    if (!outcome.persist) return outcome.result;

    await this.persistence.saveState(next);
    this.state = next;
    this.publish();
    return outcome.result;
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
