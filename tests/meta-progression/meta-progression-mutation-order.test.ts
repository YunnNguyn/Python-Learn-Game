import { describe, expect, it } from "vitest";

import {
  AttemptRecordSchema,
  Difficulty,
  HintLevel,
  LearningStage,
  type AttemptRecord,
} from "../../src/core/domain";
import {
  MemoryMetaProgressionPersistence,
  MetaProgressionEngine,
  RobotPartId,
  createEmptyInventory,
  createEmptyMetaProgressionState,
  type MetaProgressionPersistence,
  type MetaProgressionPersistenceCloseState,
  type MetaProgressionState,
} from "../../src/core/meta-progression";

/**
 * PHASE-04C.3D.4-R1 - MetaProgressionEngine mutation ordering.
 *
 * Every write goes to a persistence whose saves/clears complete only when the
 * test says so, so each interleaving is explicit; no timers are involved.
 * "Persisted" below means what the controlled store committed.
 */

const NOW = () => new Date("2026-10-03T12:00:00.000Z");

function makeAttempt(id: string, activityId: string, overrides: Record<string, unknown> = {}): AttemptRecord {
  return AttemptRecordSchema.parse({
    id,
    activityId,
    missionTemplateId: "template.test",
    missionTemplateVersion: 1,
    seed: `seed:${id}`,
    difficulty: Difficulty.EASY,
    conceptIds: ["concept.a"],
    learningStage: LearningStage.GUIDED,
    startedAt: "2026-10-03T11:00:00.000Z",
    submittedAt: "2026-10-03T11:30:00.000Z",
    passed: true,
    submissionIndex: 1,
    runCountBeforeSubmit: 0,
    hintsUsed: [HintLevel.H1],
    runtimeErrorCount: 0,
    ...overrides,
  });
}

const ATTEMPT_A = makeAttempt("attempt.a", "activity.a", { submittedAt: "2026-10-03T11:10:00.000Z" });
const ATTEMPT_B = makeAttempt("attempt.b", "activity.b", { submittedAt: "2026-10-03T11:20:00.000Z" });

interface PendingWrite {
  readonly kind: "save" | "clear";
  readonly state: MetaProgressionState | null;
  succeed(): void;
  fail(error: unknown): void;
}

/** A store whose writes commit only when the test resolves them. */
class ControlledMetaPersistence implements MetaProgressionPersistence {
  readonly kind = "indexeddb" as const;
  readonly writes: PendingWrite[] = [];
  committed: MetaProgressionState | null;
  /** When set, the next saveState throws synchronously (before returning a promise). */
  throwOnNextSave: unknown = undefined;

  constructor(initial: MetaProgressionState | null = null) {
    this.committed = initial === null ? null : structuredClone(initial);
  }

  loadState(): Promise<MetaProgressionState | null> {
    return Promise.resolve(this.committed === null ? null : structuredClone(this.committed));
  }

  saveState(state: MetaProgressionState): Promise<void> {
    if (this.throwOnNextSave !== undefined) {
      const error = this.throwOnNextSave;
      this.throwOnNextSave = undefined;
      throw error;
    }
    return this.pending("save", structuredClone(state));
  }

  clear(): Promise<void> {
    return this.pending("clear", null);
  }

  close(): Promise<void> {
    return Promise.resolve();
  }

  getCloseState(): MetaProgressionPersistenceCloseState {
    return "open";
  }

  private pending(kind: "save" | "clear", state: MetaProgressionState | null): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.writes.push({
        kind,
        state,
        succeed: () => {
          this.committed = state;
          resolve();
        },
        fail: reject,
      });
    });
  }
}

/** Lets every already-queued continuation run (no timers). */
async function settle(): Promise<void> {
  for (let index = 0; index < 50; index += 1) await Promise.resolve();
}

/** Captures a promise's outcome without leaving a rejection unobserved. */
function observe<T>(promise: Promise<T>) {
  const outcome: { done: boolean; value?: T; error?: unknown } = { done: false };
  const settled = promise.then(
    (value) => {
      outcome.done = true;
      outcome.value = value;
    },
    (error: unknown) => {
      outcome.done = true;
      outcome.error = error;
    },
  );
  return { outcome, settled };
}

async function createEngine(initial: MetaProgressionState | null = null) {
  const store = new ControlledMetaPersistence(initial);
  const engine = new MetaProgressionEngine(store, NOW);
  await engine.initialize();
  return { store, engine };
}

/** What the unchanged reward rules grant for these attempts recorded one by one. */
async function reference(...attempts: AttemptRecord[]): Promise<MetaProgressionState> {
  const memory = new MemoryMetaProgressionPersistence();
  const engine = new MetaProgressionEngine(memory, NOW);
  for (const attempt of attempts) await engine.recordAttempt(attempt);
  return (await memory.loadState()) ?? createEmptyMetaProgressionState();
}

const grantIds = (engine: MetaProgressionEngine, attemptId: string) =>
  engine.getRewardGrantsForAttempt(attemptId).map((grant) => grant.id);

describe("MetaProgressionEngine mutation ordering", () => {
  it("A. mutation A fails, then B succeeds: A's change never reaches storage or the snapshot", async () => {
    const { store, engine } = await createEngine();
    const a = observe(engine.recordAttempt(ATTEMPT_A));
    const b = observe(engine.recordAttempt(ATTEMPT_B));
    await settle();
    expect(store.writes).toHaveLength(1); // B waits for A

    const failure = new Error("disk full");
    store.writes[0]!.fail(failure);
    await a.settled;
    expect(a.outcome.error).toBe(failure);
    await settle();
    expect(store.writes).toHaveLength(2);
    expect(store.writes[1]!.state?.processedAttemptIds).toEqual(["attempt.b"]); // derived without A

    store.writes[1]!.succeed();
    await b.settled;
    expect(b.outcome.error).toBeUndefined();

    const expected = await reference(ATTEMPT_B);
    expect(store.committed).toEqual(expected);
    expect(engine.getSnapshot().inventory).toEqual(expected.inventory);
    expect(grantIds(engine, "attempt.a")).toEqual([]);
    expect(grantIds(engine, "attempt.b").length).toBeGreaterThan(0);
  });

  it("B. mutation A succeeds, B fails: A stays committed and B is not rolled into it", async () => {
    const { store, engine } = await createEngine();
    const a = observe(engine.recordAttempt(ATTEMPT_A));
    const b = observe(engine.recordAttempt(ATTEMPT_B));
    await settle();
    store.writes[0]!.succeed();
    await a.settled;
    await settle();
    const failure = new Error("write aborted");
    store.writes[1]!.fail(failure);
    await b.settled;

    expect(a.outcome.error).toBeUndefined();
    expect(b.outcome.error).toBe(failure);
    const expected = await reference(ATTEMPT_A);
    expect(store.committed).toEqual(expected);
    expect(engine.getSnapshot().inventory).toEqual(expected.inventory);
    expect(grantIds(engine, "attempt.a").length).toBeGreaterThan(0);
    expect(grantIds(engine, "attempt.b")).toEqual([]);
  });

  it("C. two concurrent reward attempts are applied in call order, each published only once durable", async () => {
    const { store, engine } = await createEngine();
    const initial = engine.getSnapshot();
    const a = observe(engine.recordAttempt(ATTEMPT_A));
    const b = observe(engine.recordAttempt(ATTEMPT_B));
    await settle();

    // A's write is pending: nothing undurable is visible.
    expect(engine.getSnapshot()).toBe(initial);
    expect(grantIds(engine, "attempt.a")).toEqual([]);

    store.writes[0]!.succeed();
    await a.settled;
    const afterA = engine.getSnapshot();
    expect(afterA.inventory).toEqual((await reference(ATTEMPT_A)).inventory);
    await settle();
    expect(engine.getSnapshot()).toBe(afterA); // B still pending

    store.writes[1]!.succeed();
    await b.settled;
    const expected = await reference(ATTEMPT_A, ATTEMPT_B);
    expect(store.committed).toEqual(expected);
    expect(engine.getSnapshot().inventory).toEqual(expected.inventory);
    expect(engine.getSnapshot().revision).toBe(afterA.revision + 1);
  });

  it("D. a reward racing buildRobotPart: the build sees the reward granted before it, in call order", async () => {
    const { store, engine } = await createEngine();
    const reward = observe(engine.recordAttempt(ATTEMPT_A));
    const build = observe(engine.buildRobotPart(RobotPartId.CHASSIS)); // affordable only after the reward
    await settle();
    expect(store.writes).toHaveLength(1);

    store.writes[0]!.succeed();
    await reward.settled;
    await settle();
    expect(store.writes).toHaveLength(2);
    store.writes[1]!.succeed();
    await build.settled;

    expect(build.outcome.value).toEqual({ ok: true });
    const rewarded = await reference(ATTEMPT_A);
    const expectedInventory = {
      ...rewarded.inventory,
      metal_plate: rewarded.inventory.metal_plate - 8,
    };
    expect(store.committed?.inventory).toEqual(expectedInventory);
    expect(store.committed?.builtRobotPartIds).toEqual([RobotPartId.CHASSIS]);
    expect(store.committed?.processedAttemptIds).toEqual(["attempt.a"]);
    expect(engine.getSnapshot().inventory).toEqual(expectedInventory);
    expect(engine.getSnapshot().builtRobotPartIds).toEqual([RobotPartId.CHASSIS]);
  });

  it("D2. a build that fails its write does not consume inventory for a reward queued behind it", async () => {
    const { store, engine } = await createEngine({
      ...createEmptyMetaProgressionState(),
      inventory: { metal_plate: 8, circuit_board: 0, energy_cell: 0 },
    });
    const build = observe(engine.buildRobotPart(RobotPartId.CHASSIS));
    const reward = observe(engine.recordAttempt(ATTEMPT_A));
    await settle();
    store.writes[0]!.fail(new Error("aborted"));
    await build.settled;
    await settle();
    store.writes[1]!.succeed();
    await reward.settled;

    expect(build.outcome.error).toBeInstanceOf(Error);
    const rewarded = await reference(ATTEMPT_A);
    expect(store.committed?.builtRobotPartIds).toEqual([]);
    expect(store.committed?.inventory).toEqual({
      metal_plate: rewarded.inventory.metal_plate + 8,
      circuit_board: rewarded.inventory.circuit_board,
      energy_cell: rewarded.inventory.energy_cell,
    });
    expect(engine.getSnapshot().builtRobotPartIds).toEqual([]);
  });

  it("E. clearAll racing a pending reward save: the reward is written first, then cleared", async () => {
    const { store, engine } = await createEngine();
    const reward = observe(engine.recordAttempt(ATTEMPT_A));
    const clear = observe(engine.clearAll());
    await settle();
    expect(store.writes.map((write) => write.kind)).toEqual(["save"]); // clear waits

    store.writes[0]!.succeed();
    await reward.settled;
    await settle();
    expect(store.writes.map((write) => write.kind)).toEqual(["save", "clear"]);
    store.writes[1]!.succeed();
    await clear.settled;

    expect(reward.outcome.error).toBeUndefined();
    expect(clear.outcome.error).toBeUndefined();
    expect(store.committed).toBeNull();
    expect(engine.getSnapshot().inventory).toEqual(createEmptyInventory());
    expect(grantIds(engine, "attempt.a")).toEqual([]);
  });

  it("E2. a reward called after clearAll applies to the cleared state; a failed clear changes nothing", async () => {
    const { store, engine } = await createEngine(await reference(ATTEMPT_A));
    const failedClear = observe(engine.clearAll());
    await settle();
    store.writes[0]!.fail(new Error("clear failed"));
    await failedClear.settled;
    expect(failedClear.outcome.error).toBeInstanceOf(Error);
    expect(grantIds(engine, "attempt.a").length).toBeGreaterThan(0); // nothing was cleared

    const clear = observe(engine.clearAll());
    const reward = observe(engine.recordAttempt(ATTEMPT_B));
    await settle();
    store.writes[1]!.succeed();
    await clear.settled;
    await settle();
    store.writes[2]!.succeed();
    await reward.settled;

    expect(store.committed).toEqual(await reference(ATTEMPT_B));
    expect(engine.getSnapshot().inventory).toEqual((await reference(ATTEMPT_B)).inventory);
  });

  it("F. completion order cannot be reversed: a later write starts only after the earlier one settled", async () => {
    const { store, engine } = await createEngine();
    const a = observe(engine.recordAttempt(ATTEMPT_A));
    const b = observe(engine.recordAttempt(ATTEMPT_B));
    await settle();

    // B has not even started, so it cannot complete before A and A's (older)
    // state can never land on top of B's newer one.
    expect(store.writes).toHaveLength(1);
    expect(b.outcome.done).toBe(false);

    store.writes[0]!.succeed();
    await settle();
    expect(store.writes).toHaveLength(2);
    expect(store.writes[1]!.state?.processedAttemptIds).toEqual(["attempt.a", "attempt.b"]);
    store.writes[1]!.succeed();
    await Promise.all([a.settled, b.settled]);

    expect(store.committed?.processedAttemptIds).toEqual(["attempt.a", "attempt.b"]);
    expect(engine.getSnapshot().inventory).toEqual((await reference(ATTEMPT_A, ATTEMPT_B)).inventory);
  });

  it("G. a failed mutation stays retryable and is granted exactly once on retry", async () => {
    const { store, engine } = await createEngine();
    const first = observe(engine.recordAttempt(ATTEMPT_A));
    await settle();
    store.writes[0]!.fail(new Error("transient"));
    await first.settled;
    expect(grantIds(engine, "attempt.a")).toEqual([]);

    const retry = observe(engine.recordAttempt(ATTEMPT_A));
    await settle();
    expect(store.writes).toHaveLength(2); // not skipped as "already processed"
    store.writes[1]!.succeed();
    await retry.settled;

    expect(retry.outcome.error).toBeUndefined();
    expect(store.committed).toEqual(await reference(ATTEMPT_A));
    expect(engine.getSnapshot().inventory).toEqual((await reference(ATTEMPT_A)).inventory);
  });

  it("H. a successful reward is never double-granted, by a concurrent duplicate or a later reconcile", async () => {
    const { store, engine } = await createEngine();
    const first = observe(engine.recordAttempt(ATTEMPT_A));
    const duplicate = observe(engine.recordAttempt(ATTEMPT_A));
    await settle();
    store.writes[0]!.succeed();
    await Promise.all([first.settled, duplicate.settled]);

    await engine.reconcileAttempts([ATTEMPT_A]);

    expect(store.writes).toHaveLength(1); // the duplicate and the reconcile wrote nothing
    expect(duplicate.outcome.error).toBeUndefined();
    expect(store.committed).toEqual(await reference(ATTEMPT_A));
    expect(engine.getSnapshot().inventory).toEqual((await reference(ATTEMPT_A)).inventory);
  });

  it("I. a queued operation that throws does not poison the queue", async () => {
    const { store, engine } = await createEngine();
    const failure = new TypeError("synchronous persistence failure");
    store.throwOnNextSave = failure;

    const broken = observe(engine.recordAttempt(ATTEMPT_A));
    const next = observe(engine.recordAttempt(ATTEMPT_B));
    await broken.settled;
    expect(broken.outcome.error).toBe(failure);

    await settle();
    store.writes[0]!.succeed();
    await next.settled;
    expect(next.outcome.error).toBeUndefined();
    expect(store.committed).toEqual(await reference(ATTEMPT_B));

    // And the queue keeps working afterwards.
    const later = observe(engine.buildRobotPart(RobotPartId.CHASSIS));
    await settle();
    store.writes[1]!.succeed();
    await later.settled;
    expect(later.outcome.value).toEqual({ ok: true });
  });

  it("I2. operations queued behind a failed initialization reject with its error and never write", async () => {
    const loadFailure = new Error("unreadable");
    const store = new ControlledMetaPersistence();
    store.loadState = () => Promise.reject(loadFailure);
    const engine = new MetaProgressionEngine(store, NOW);

    const results = await Promise.allSettled([
      engine.reconcileAttempts([ATTEMPT_A]),
      engine.recordAttempt(ATTEMPT_B),
      engine.buildRobotPart(RobotPartId.CHASSIS),
      engine.assembleStarterRobot(),
      engine.clearAll(),
    ]);

    for (const result of results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") expect(result.reason).toBe(loadFailure);
    }
    expect(store.writes).toEqual([]);
    expect(engine.getSnapshot().ready).toBe(false);
  });

  it("J. startup reconciliation cannot be bypassed: workshop and reward calls queue behind it", async () => {
    const store = new ControlledMetaPersistence();
    const engine = new MetaProgressionEngine(store, NOW);

    // Startup: initialize + reconcile, as ApplicationServices does - not awaited.
    const startup = observe(engine.initialize().then(() => engine.reconcileAttempts([ATTEMPT_A])));
    // A workshop click and a submit arrive while reconciliation is pending.
    await settle();
    const build = observe(engine.buildRobotPart(RobotPartId.CHASSIS));
    const reward = observe(engine.recordAttempt(ATTEMPT_B));
    await settle();

    expect(store.writes).toHaveLength(1);
    expect(store.writes[0]!.state?.processedAttemptIds).toEqual(["attempt.a"]);
    store.writes[0]!.succeed();
    await startup.settled;
    await settle();

    expect(store.writes).toHaveLength(2);
    expect(store.writes[1]!.state?.builtRobotPartIds).toEqual([RobotPartId.CHASSIS]); // built on the reconciled rewards
    store.writes[1]!.succeed();
    await build.settled;
    await settle();
    store.writes[2]!.succeed();
    await reward.settled;

    expect(build.outcome.value).toEqual({ ok: true });
    expect(store.committed?.processedAttemptIds).toEqual(["attempt.a", "attempt.b"]);
    expect(store.committed?.builtRobotPartIds).toEqual([RobotPartId.CHASSIS]);
    expect(engine.getSnapshot().builtRobotPartIds).toEqual([RobotPartId.CHASSIS]);
    expect(engine.getSnapshot().inventory).toEqual(store.committed?.inventory);
  });
});
