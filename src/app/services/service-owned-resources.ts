import type { AttemptRecord, LearningActivity, MissionInstance, MissionTemplate } from "../../core/domain";
import {
  LearningEngine,
  MissionAttemptSession,
  type MissionAttemptSessionOptions,
} from "../../core/learning";
import {
  MetaProgressionEngine,
  type AssembleRobotResult,
  type BuildRobotPartResult,
  type MetaProgressionPersistence,
  type RobotPartId,
} from "../../core/meta-progression";
import type { MissionEngine } from "../../core/missions";
import type { LearningPersistence } from "../../core/persistence";
import type { ApplicationDisposalFailure, ApplicationLifecycle } from "./application-lifecycle";
import type { OperationGate } from "./operation-gate";

/*
 * Service-owned resources (PHASE-04C.3D.5, M4).
 *
 * `services.learning` and `services.metaProgression` are handed to React
 * consumers, and RobotWorkshopPage calls the engine's mutations directly. The
 * lifecycle guard therefore lives ON these objects - not in a facade beside
 * them - so every production call path is covered. Reads and subscriptions are
 * inherited unchanged; the core engines (and their M2/M3 contracts) are not
 * modified.
 *
 * Mutations called from outside are admitted only while the set is active
 * (`runDurable`) and are tracked until they settle. They also take the set's
 * OperationGate (M6): ordinary mutations shared, the engines' clear methods
 * exclusive, so a clear never interleaves with the writes it clears. The set's own composite
 * operations (startup, Submit persistence, clear) were admitted as a whole, so
 * they call the base implementations through `admitted*` below and are not
 * refused half way by a retirement that begins between their steps.
 */

export class ServiceLearningEngine extends LearningEngine {
  constructor(
    persistence: LearningPersistence,
    private readonly lifecycle: ApplicationLifecycle,
    private readonly gate: OperationGate,
  ) {
    super(persistence);
  }

  override recordAttempt(record: AttemptRecord): Promise<void> {
    return this.lifecycle.runDurable(() => this.gate.runShared(() => super.recordAttempt(record)));
  }

  override clearAttempts(): Promise<void> {
    return this.lifecycle.runDurable(() => this.gate.runExclusive(() => super.clearAttempts()));
  }
}

export class ServiceMetaProgressionEngine extends MetaProgressionEngine {
  constructor(
    persistence: MetaProgressionPersistence,
    private readonly lifecycle: ApplicationLifecycle,
    private readonly gate: OperationGate,
  ) {
    super(persistence);
  }

  override reconcileAttempts(attempts: readonly AttemptRecord[]): Promise<void> {
    return this.lifecycle.runDurable(() => this.gate.runShared(() => super.reconcileAttempts(attempts)));
  }

  override recordAttempt(attempt: AttemptRecord): Promise<void> {
    return this.lifecycle.runDurable(() => this.gate.runShared(() => super.recordAttempt(attempt)));
  }

  override buildRobotPart(partId: RobotPartId): Promise<BuildRobotPartResult> {
    return this.lifecycle.runDurable(() => this.gate.runShared(() => super.buildRobotPart(partId)));
  }

  override assembleStarterRobot(): Promise<AssembleRobotResult> {
    return this.lifecycle.runDurable(() => this.gate.runShared(() => super.assembleStarterRobot()));
  }

  override clearAll(): Promise<void> {
    return this.lifecycle.runDurable(() => this.gate.runExclusive(() => super.clearAll()));
  }
}

/** Base (unguarded) mutations, for composite operations already admitted and tracked as a whole. */
export const admitted = {
  learningRecordAttempt: (engine: ServiceLearningEngine, record: AttemptRecord) =>
    LearningEngine.prototype.recordAttempt.call(engine, record),
  learningClearAttempts: (engine: ServiceLearningEngine) =>
    LearningEngine.prototype.clearAttempts.call(engine),
  metaRecordAttempt: (engine: ServiceMetaProgressionEngine, record: AttemptRecord) =>
    MetaProgressionEngine.prototype.recordAttempt.call(engine, record),
  metaReconcileAttempts: (engine: ServiceMetaProgressionEngine, attempts: readonly AttemptRecord[]) =>
    MetaProgressionEngine.prototype.reconcileAttempts.call(engine, attempts),
  metaClearAll: (engine: ServiceMetaProgressionEngine) =>
    MetaProgressionEngine.prototype.clearAll.call(engine),
};

/** The first failure of one resource's cleanup (kept; later failures never replace it). */
export interface CleanupFailure {
  readonly error: unknown;
}

/**
 * Runs one resource's teardown and returns its retained failure, or null when
 * the resource is clean. The owners (MissionAttemptSession, MissionEngine, the
 * runtimes) mark themselves disposed BEFORE tearing down, so after a throw their
 * own `dispose()` is a silent no-op; a retry therefore goes through `retry`
 * (the underlying runtime's idempotent dispose). Without a `retry` a failure
 * is permanent: it is never reported as cleaned up.
 */
function runCleanup(
  prior: CleanupFailure | null,
  dispose: () => void,
  retry: (() => void) | undefined,
): CleanupFailure | null {
  try {
    if (prior === null) dispose();
    else if (retry !== undefined) retry();
    else return prior;
    return null;
  } catch (error) {
    return prior ?? { error };
  }
}

/**
 * A MissionAttemptSession owned by one service set. Its only additions: being
 * disposed - by the page (`releaseSession`) or by the set's retirement,
 * whichever comes first - removes it from the owner's registry and closes the
 * session's mission draft (M5), and a disposal that throws is remembered
 * (original error kept) so the owner can report an incomplete cleanup instead
 * of a disposal. The M1 Submit contract
 * (cancellation before the durable-write boundary, completion after it) is
 * inherited unchanged: the base class marks itself disposed before anything
 * can throw.
 */
export class ServiceOwnedMissionSession extends MissionAttemptSession {
  private cleanupFailure: CleanupFailure | null = null;

  constructor(
    activity: LearningActivity,
    template: MissionTemplate,
    instance: MissionInstance,
    engine: MissionEngine,
    options: MissionAttemptSessionOptions,
    private readonly onReleased: (session: ServiceOwnedMissionSession) => void,
    private readonly retryCleanup?: () => void,
    private readonly draft?: { close(): void },
  ) {
    super(activity, template, instance, engine, options);
  }

  /** The retained failure of a disposal that threw and has not been retried successfully. */
  getCleanupFailure(): CleanupFailure | null {
    return this.cleanupFailure;
  }

  override dispose(): void {
    // The draft belongs to this session (M5): cancel its timer and save the last
    // unsaved change once. It never throws, so it cannot change the cleanup result.
    try {
      this.draft?.close();
    } catch {
      // Best effort by contract.
    }
    this.cleanupFailure = runCleanup(this.cleanupFailure, () => super.dispose(), this.retryCleanup);
    // Still registered while its cleanup is unresolved, so the owner keeps seeing it.
    if (this.cleanupFailure !== null) throw this.cleanupFailure.error;
    this.onReleased(this);
  }
}

interface FailedEngine extends CleanupFailure {
  readonly retry: (() => void) | undefined;
}

/**
 * The live mission sessions of one service set, plus the MissionEngines still
 * loading for a session that does not exist yet. Holds only live entries:
 * whatever is disposed cleanly is removed at once, so nothing is retained after
 * use. Entries whose disposal failed are kept - and reported - until a retry
 * succeeds.
 */
export class MissionSessionRegistry {
  private readonly sessions = new Set<ServiceOwnedMissionSession>();
  private readonly loadingEngines = new Map<MissionEngine, (() => void) | undefined>();
  private readonly failedEngines = new Map<MissionEngine, FailedEngine>();

  register(session: ServiceOwnedMissionSession): void {
    this.sessions.add(session);
  }

  release(session: ServiceOwnedMissionSession): void {
    this.sessions.delete(session);
  }

  trackLoading(engine: MissionEngine, retryCleanup?: () => void): void {
    this.loadingEngines.set(engine, retryCleanup);
  }

  untrackLoading(engine: MissionEngine): void {
    this.loadingEngines.delete(engine);
  }

  /**
   * Disposes an engine that will never become a session (load failed, load
   * finished after retirement, ...). Never throws: a failure is retained and
   * reported by `getUnresolvedFailures()`, so the caller's own result or error
   * is not replaced by a cleanup error.
   */
  discardEngine(engine: MissionEngine, retryCleanup?: () => void): void {
    this.loadingEngines.delete(engine);
    this.disposeEngine(engine, retryCleanup);
  }

  get size(): number {
    return this.sessions.size;
  }

  get loadingCount(): number {
    return this.loadingEngines.size;
  }

  /**
   * Disposes every live session (cancelling a pending grading through the M1
   * contract) and every engine still loading, and retries any earlier failed
   * disposal. Synchronous and NEVER throws: one resource failing does not stop
   * the others, and the failure is retained (see `getUnresolvedFailures()`).
   * Safe to call again and safe against a session being released concurrently,
   * because every path ends in the same idempotent dispose().
   */
  disposeAll(): void {
    // Failures from EARLIER attempts are retried once; one that fails in this
    // pass is not retried again within it.
    const earlierFailures = [...this.failedEngines];
    for (const [engine, retry] of [...this.loadingEngines]) {
      this.loadingEngines.delete(engine);
      this.disposeEngine(engine, retry);
    }
    for (const [engine, failed] of earlierFailures) this.disposeEngine(engine, failed.retry);
    for (const session of [...this.sessions]) {
      try {
        session.dispose();
      } catch {
        // Retained on the session itself; reported by getUnresolvedFailures().
      }
    }
  }

  /** Owned resources whose disposal failed and has not succeeded since (original errors). */
  getUnresolvedFailures(): readonly ApplicationDisposalFailure[] {
    const failures: ApplicationDisposalFailure[] = [];
    for (const failed of this.failedEngines.values()) {
      failures.push({ resource: "mission-engine", error: failed.error });
    }
    for (const session of this.sessions) {
      const failure = session.getCleanupFailure();
      if (failure !== null) failures.push({ resource: "mission-session", error: failure.error });
    }
    return failures;
  }

  private disposeEngine(engine: MissionEngine, retry: (() => void) | undefined): void {
    const failure = runCleanup(this.failedEngines.get(engine) ?? null, () => engine.dispose(), retry);
    if (failure === null) this.failedEngines.delete(engine);
    else this.failedEngines.set(engine, { ...failure, retry });
  }
}
