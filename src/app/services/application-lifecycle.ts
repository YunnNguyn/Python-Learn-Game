import type { LearningPersistenceCloseState } from "../../core/persistence";
import type { MetaProgressionPersistenceCloseState } from "../../core/meta-progression";

/**
 * Lifecycle of one ApplicationServices set (PHASE-04C.3D.5, M4). It is
 * independent of initialization (pending / ready / failed):
 *
 *  - active:   service-owned work may start.
 *  - retiring: `dispose()` was called. Effective synchronously: from that moment
 *              no mission session, grading or service-owned durable mutation
 *              starts. Work that had already been admitted is being drained
 *              (`drain: "draining"`), or the last drain attempt timed out
 *              (`drain: "incomplete"`); the set stays here until a later
 *              `dispose()` call completes the drain. Never reverts to active.
 *  - disposed: every admitted durable operation settled, every owned mission
 *              session/engine was disposed, AND both persistence instances were
 *              closed afterwards without a close failure. Terminal.
 *
 * `retiring` never means "closed": `drain: "incomplete"` (the wait timed out)
 * and `drain: "cleanup-failed"` (the drain finished but a resource cleanup
 * threw or rejected) both keep the set non-active and not disposed; a later
 * `dispose()` re-enters `draining` and tries again.
 */
export type ApplicationLifecycleState =
  | { readonly status: "active" }
  | {
      readonly status: "retiring";
      readonly drain: "draining" | "incomplete" | "cleanup-failed";
    }
  | {
      readonly status: "disposed";
      readonly persistence: ApplicationPersistenceCloseStates;
    };

export interface ApplicationPersistenceCloseStates {
  /**
   * `closed-pending-open` means the browser still has an open request for this
   * set's OWN database outstanding (typically an upgrade blocked by another
   * tab). Its connection is closed the moment it arrives and is never used.
   */
  readonly learning: LearningPersistenceCloseState;
  readonly metaProgression: MetaProgressionPersistenceCloseState;
}

/**
 * Close states as OBSERVED after a close attempt that may have failed. Each
 * resource is reported on its own: one can already be `closed` while the other
 * is still `open`. `unknown` only when `getCloseState()` itself threw.
 */
export interface ApplicationPersistenceObservedCloseStates {
  readonly learning: LearningPersistenceCloseState | "unknown";
  readonly metaProgression: MetaProgressionPersistenceCloseState | "unknown";
}

export type ApplicationDisposalFailureResource =
  | "mission-session"
  | "mission-engine"
  | "learning-persistence"
  | "meta-progression-persistence";

/**
 * One resource whose cleanup failed. `error` is the ORIGINAL thrown / rejected
 * value, untouched (for a resource that failed again on a retry, the first
 * failure is the one kept).
 */
export interface ApplicationDisposalFailure {
  readonly resource: ApplicationDisposalFailureResource;
  readonly error: unknown;
}

/**
 * Outcome of `ApplicationServices.dispose()`. It never rejects.
 *
 *  - disposed:   drain complete, every owned session/engine disposed, both
 *                persistence instances closed (`closed` or `closed-pending-open`)
 *                with no close failure.
 *  - incomplete / DRAIN_TIMEOUT: the drain did not finish within
 *                `drainTimeoutMs` - an admitted durable write or a mission load
 *                (engine loading plus its cleanup) was still running. NOT a disposal: the set stays `retiring`,
 *                persistence stays open (closing it would cut off writes that
 *                are still running), pending writes are neither discarded nor
 *                moved anywhere, and the set must not be treated as safe to
 *                replace for its scope. Call `dispose()` again to wait once
 *                more. `failures` is present only when owned-resource cleanup
 *                had also failed.
 *  - incomplete / RESOURCE_CLEANUP_FAILED: the drain finished but a cleanup
 *                failed - an owned mission session / engine threw while being
 *                disposed, or a persistence `close()` rejected or left its
 *                resource `open`. NOT a disposal and NOT a drain timeout. The
 *                set stays `retiring`; nothing is reopened or redirected.
 *                `persistence` reports what each store actually looks like now
 *                (a store may already be `closed` while the other failed), and
 *                `failures` carries the original errors. Call `dispose()` again
 *                to retry the failed cleanups.
 */
export type ApplicationServicesDisposalResult =
  | {
      readonly status: "disposed";
      readonly persistence: ApplicationPersistenceCloseStates;
    }
  | {
      readonly status: "incomplete";
      readonly reason: "DRAIN_TIMEOUT";
      /** Service-owned durable operations still in flight when the wait ended. */
      readonly pendingDurableOperations: number;
      /**
       * Mission loads still in flight when the wait ended (present only when > 0). A load
       * owns its engine until the load AND the cleanup that follows it have settled, so the
       * set cannot be declared disposed before then.
       */
      readonly pendingMissionLoads?: number;
      readonly failures?: readonly ApplicationDisposalFailure[];
    }
  | {
      readonly status: "incomplete";
      readonly reason: "RESOURCE_CLEANUP_FAILED";
      readonly persistence: ApplicationPersistenceObservedCloseStates;
      readonly failures: readonly ApplicationDisposalFailure[];
    };

export interface DisposeApplicationServicesOptions {
  /**
   * How long to wait for admitted durable operations to settle (finite, >= 0).
   * Default: DEFAULT_DRAIN_TIMEOUT_MS.
   */
  readonly drainTimeoutMs?: number;
}

export const DEFAULT_DRAIN_TIMEOUT_MS = 10_000;

export const APPLICATION_SERVICES_RETIRED = "APPLICATION_SERVICES_RETIRED";

/**
 * A service-owned operation was requested after its service set began
 * retiring. Nothing was started: no storage was touched and nothing was
 * redirected to another scope or to memory.
 */
export class ApplicationServicesRetiredError extends Error {
  readonly code = APPLICATION_SERVICES_RETIRED;

  constructor() {
    super("These application services are retiring or disposed; no new operation can start.");
    this.name = "ApplicationServicesRetiredError";
  }
}

export function isApplicationServicesRetiredError(
  error: unknown,
): error is ApplicationServicesRetiredError {
  return error instanceof ApplicationServicesRetiredError;
}

const ACTIVE: ApplicationLifecycleState = Object.freeze({ status: "active" });
const DRAINING: ApplicationLifecycleState = Object.freeze({ status: "retiring", drain: "draining" });
const INCOMPLETE: ApplicationLifecycleState = Object.freeze({
  status: "retiring",
  drain: "incomplete",
});
const CLEANUP_FAILED: ApplicationLifecycleState = Object.freeze({
  status: "retiring",
  drain: "cleanup-failed",
});

/**
 * Admission control and drain tracking for one service set.
 *
 * Every service-owned operation that can write durable data runs through
 * `runDurable` (refused unless active) or `trackAdmitted` (for work whose
 * admission was already decided, see below). Both count the operation until it
 * settles - fulfilled OR rejected - and hand the caller the operation's own
 * promise, so results and errors propagate untouched. The tracker only ever
 * observes that promise; it never swallows it for the caller.
 */
export class ApplicationLifecycle {
  private state: ApplicationLifecycleState = ACTIVE;
  private readonly listeners = new Set<() => void>();
  private pending = 0;
  private pendingLoads = 0;
  private readonly drainWaiters = new Set<() => void>();

  getState(): ApplicationLifecycleState {
    return this.state;
  }

  isActive(): boolean {
    return this.state.status === "active";
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getPendingDurableOperationCount(): number {
    return this.pending;
  }

  /** Mission loads (engine loading plus the cleanup that follows it) not settled yet. */
  getPendingMissionLoadCount(): number {
    return this.pendingLoads;
  }

  /** Admits `operation` only while active; otherwise rejects without calling it. */
  runDurable<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.isActive()) return Promise.reject(new ApplicationServicesRetiredError());
    return this.trackAdmitted(operation);
  }

  /**
   * Tracks work whose admission was decided elsewhere and must not be refused
   * by a retirement that began in between - i.e. a Submit that already crossed
   * the M1 durable-write boundary, and the startup sequence. Such work only
   * starts while its owner is still active (see application-services.ts), so it
   * is always counted before a drain could finish.
   */
  trackAdmitted<T>(operation: () => Promise<T>): Promise<T> {
    this.pending += 1;
    let running: Promise<T>;
    try {
      running = Promise.resolve(operation());
    } catch (error) {
      running = Promise.reject(error);
    }
    const settle = () => {
      this.pending -= 1;
      this.notifyIfDrained();
    };
    // Observed for the count only; the caller still receives `running` itself.
    running.then(settle, settle);
    return running;
  }

  /**
   * Tracks one mission load - from the moment its engine exists until the load AND
   * any cleanup of that engine have settled (the operation must include them). A
   * load owns a resource (a runtime) that retirement disposes at once, but whose
   * continuation still runs later; the set is not drained, and so cannot be
   * disposed, before that continuation is over. Not an admission check: the caller
   * starts it only while the set is active (no `await` between its last check and
   * this call). Counted until settled - fulfilled or rejected - and the caller gets
   * the operation's own promise.
   */
  trackLoad<T>(operation: () => Promise<T>): Promise<T> {
    this.pendingLoads += 1;
    let running: Promise<T>;
    try {
      running = Promise.resolve(operation());
    } catch (error) {
      running = Promise.reject(error);
    }
    const settle = () => {
      this.pendingLoads -= 1;
      this.notifyIfDrained();
    };
    running.then(settle, settle);
    return running;
  }

  /** active -> retiring (synchronous, idempotent). Returns true on the first call. */
  beginRetirement(): boolean {
    if (this.state.status !== "active") return false;
    this.setState(DRAINING);
    return true;
  }

  /** Re-enters `draining` for a repeated dispose() after an incomplete outcome. */
  resumeDrain(): void {
    if (this.state === INCOMPLETE || this.state === CLEANUP_FAILED) this.setState(DRAINING);
  }

  markDrainIncomplete(): void {
    if (this.state.status === "retiring") this.setState(INCOMPLETE);
  }

  /** The drain finished but a resource cleanup failed: still retiring, never disposed. */
  markCleanupFailed(): void {
    if (this.state.status === "retiring") this.setState(CLEANUP_FAILED);
  }

  markDisposed(persistence: ApplicationPersistenceCloseStates): void {
    this.setState(Object.freeze({ status: "disposed", persistence: Object.freeze({ ...persistence }) }));
  }

  /**
   * Resolves true once no tracked operation (durable write or mission load) is in flight, or false when
   * `timeoutMs` elapses first. Never rejects. A timeout says nothing about the
   * pending work, which keeps running and stays tracked.
   */
  waitForDrain(timeoutMs: number): Promise<boolean> {
    if (this.isDrained()) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onDrained = () => {
        this.drainWaiters.delete(onDrained);
        if (timer !== undefined) clearTimeout(timer);
        resolve(true);
      };
      this.drainWaiters.add(onDrained);
      timer = setTimeout(() => {
        this.drainWaiters.delete(onDrained);
        resolve(this.isDrained());
      }, timeoutMs);
    });
  }

  private isDrained(): boolean {
    return this.pending === 0 && this.pendingLoads === 0;
  }

  private notifyIfDrained(): void {
    if (!this.isDrained()) return;
    for (const waiter of [...this.drainWaiters]) waiter();
  }

  private setState(next: ApplicationLifecycleState): void {
    this.state = next;
    for (const listener of [...this.listeners]) {
      // A throwing subscriber must not abort a synchronous retirement half way
      // (or stop the other subscribers from hearing about it).
      try {
        listener();
      } catch (error) {
        console.error("A lifecycle listener threw.", error);
      }
    }
  }
}

export function resolveDrainTimeout(options: DisposeApplicationServicesOptions | undefined): number {
  const value = options?.drainTimeoutMs ?? DEFAULT_DRAIN_TIMEOUT_MS;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    // A drain must always be able to report that it is blocked.
    throw new RangeError("drainTimeoutMs must be a finite number >= 0.");
  }
  return value;
}
