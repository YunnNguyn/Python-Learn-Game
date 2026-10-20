import type { HintLevel, LearningActivityId } from "../../core/domain";
import { PersistenceClosedError, type LearningPersistence } from "../../core/persistence";
import { isApplicationServicesRetiredError, type ApplicationLifecycle } from "./application-lifecycle";
import { OperationGate } from "./operation-gate";

/*
 * Mission draft scheduling (PHASE-04C.3D.6, M5).
 *
 * A mission draft is the learner's work in progress: the editor source and the
 * hints revealed so far, stored under the activity id. Everything that can
 * write or delete it goes through ONE owner per ApplicationServices set, so the
 * order of writes is decided here and not by whichever timer, effect or promise
 * happens to run first:
 *
 *  - `MissionDraftScheduler` owns one serial channel per activity. At most one
 *    write is in flight per activity; later ones wait, in the order they were
 *    accepted. A write that settles late can therefore never overwrite a newer
 *    one, and a delete is always ordered after every write accepted before it.
 *  - `MissionDraftHandle` is one mission session's view of the draft. It owns the
 *    debounce timer (not React), a monotonic revision per accepted snapshot, and
 *    the user-visible save status. Snapshots (code + hints) are always written
 *    as one record.
 *  - Generation fencing (R1): opening a handle makes it the newest for its
 *    activity and thereby SUPERSEDES every older one. A superseded handle can no
 *    longer admit a save - not through update(), its debounce timer, close() or
 *    flush() - and cannot delete. The check happens at the single point where a
 *    write is admitted (`requestWrite`), synchronously with the enqueue, so no
 *    interleaving can slip an obsolete snapshot in. Work admitted BEFORE the newer
 *    handle opened is not touched: it stays in the channel, in order, and settles
 *    (M4), so the newer handle's later writes always come after it and win.
 *  - Admission is the M4 contract: every accepted write or delete is a durable
 *    operation (`runDurable`), refused once the set is retiring and drained -
 *    allowed to settle - when it was accepted before. A timer that fires after
 *    retirement therefore cannot open a write.
 *
 * LIMITS (documented, not hidden):
 *  - A write that was accepted is only as durable as IndexedDB: if the browser
 *    tab is killed or crashes mid-transaction, nothing here can finish it.
 *  - Retirement cannot flush an unsaved tail (admission is already closed by
 *    contract). Production never retires its single set; this matters for
 *    account switching (later milestones).
 *  - A handle becomes the newest when it is OPENED, i.e. after the session's
 *    resume read and engine load. Two live sessions of one mission are therefore
 *    ordered by opening, not by creation request: a write the older one admits
 *    between the newer one's read and its opening is still legitimate (it was
 *    admitted while the older one was newest) and lands before anything the newer
 *    one writes.
 *  - `ApplicationServices.saveMissionDraft/deleteMissionDraft` are explicit
 *    direct operations without a session identity. They are ordered with every
 *    other write but not fenced; the UI does not use them.
 *  - Clear (M6): every write and delete here takes the set's OperationGate as a
 *    SHARED operation, and `clearLearningData()` is EXCLUSIVE. Writes accepted
 *    before a Clear finish first (`settledAll()`); ones requested while it runs or
 *    waits are delayed behind it and re-checked when they finally start (a handle
 *    retired by the Clear is skipped). `resetForClear()` retires every existing
 *    handle synchronously, so pre-Clear text is never written afterwards - and a
 *    retired handle can no longer DELETE either (its generation still looks
 *    "newest", so ownership is "not superseded", never the generation alone). That
 *    fence also guards the Submit's admitted-work delete. Generations only grow
 *    and are never reset, so a retired handle can never match a newer one.
 *    A write the gate delays is no longer enqueued in the caller's turn - only
 *    while a Clear is pending.
 */

export const MISSION_DRAFT_DEBOUNCE_MS = 350;

/** The learner state a draft stores; always saved as a unit. */
export interface MissionDraftSnapshot {
  readonly code: string;
  readonly hintsUsed: readonly HintLevel[];
}

/**
 *  - idle:      nothing to save (nothing changed since the draft was opened or resumed).
 *  - scheduled: a change is waiting for the debounce; nothing was written yet.
 *  - saving:    a write containing the latest change is queued or in flight.
 *  - saved:     the latest change is durably stored (the persistence promise resolved).
 *  - failed:    the latest change could NOT be stored; the error is kept.
 *  - closed:    the draft was discarded (passed Submit), a newer session of the same
 *               activity superseded this handle, or the set stopped accepting writes.
 */
export type MissionDraftStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "scheduled" }
  | { readonly kind: "saving" }
  | { readonly kind: "saved" }
  | { readonly kind: "failed"; readonly error: unknown }
  | { readonly kind: "closed" };

export interface MissionDraftUpdateOptions {
  /** Write now instead of after the debounce (e.g. a hint was just revealed). */
  readonly immediate?: boolean;
}

/** What the UI may touch. Lifecycle (close, discard) belongs to the owning session. */
export interface MissionDraftHandle {
  /** Records the latest learner state. Synchronous; the write happens later. Ignored once closed, discarded or superseded by a newer session of the same activity. */
  update(snapshot: MissionDraftSnapshot, options?: MissionDraftUpdateOptions): void;
  /** Writes the latest unsaved change now (retrying a failed one) and resolves when nothing is pending. Never rejects. A superseded handle writes nothing. */
  flush(): Promise<void>;
  getStatus(): MissionDraftStatus;
  /** Stable object identity until the status changes (safe for useSyncExternalStore). */
  subscribe(listener: () => void): () => void;
}

/** The service-owned side of a draft handle. */
export interface OwnedMissionDraft extends MissionDraftHandle {
  /**
   * Stops accepting changes and cancels the timer. Writes the latest unsaved
   * change once, best effort (refused if the set is retiring, and skipped if a
   * newer session of the same activity exists). Idempotent; never throws.
   */
  close(): void;
  /**
   * Invalidates the draft: cancels the timer and every not yet started write of this
   * handle, synchronously, then deletes the stored draft - ordered after every write
   * accepted before. Only a handle that still OWNS the draft deletes: one superseded by a
   * newer session of the activity, or retired by a Clear, leaves the draft alone.
   * Never rejects. The ownership check is re-evaluated when the delete is admitted, and again
   * when a delete the gate delayed finally starts.
   */
  discard(): Promise<void>;
  /**
   * `discard()` for the Submit that already crossed the durable-write boundary: its
   * delete belongs to that admitted operation, so it is tracked (and drained) even
   * if retirement began meanwhile. Must only be called from inside that operation.
   */
  discardWithinAdmittedWork(): Promise<void>;
}

export interface MissionDraftIdentity {
  readonly activityId: LearningActivityId;
  readonly seed: string;
  readonly variantIndex: number;
}

export interface MissionDraftWriteInput extends MissionDraftIdentity {
  readonly code: string;
  readonly hintsUsed: readonly HintLevel[];
}

export interface OpenMissionDraftOptions extends MissionDraftIdentity {
  /** What is already stored for this session (a resumed draft). Unchanged input is not rewritten. */
  readonly persisted?: MissionDraftSnapshot | null;
}

const IDLE: MissionDraftStatus = Object.freeze({ kind: "idle" });
const SCHEDULED: MissionDraftStatus = Object.freeze({ kind: "scheduled" });
const SAVING: MissionDraftStatus = Object.freeze({ kind: "saving" });
const SAVED: MissionDraftStatus = Object.freeze({ kind: "saved" });
const CLOSED: MissionDraftStatus = Object.freeze({ kind: "closed" });

/** Cancellation by design (retirement, closed storage): never logged, never shown as a failure. */
function isExpectedCancellation(error: unknown): boolean {
  return isApplicationServicesRetiredError(error) || error instanceof PersistenceClosedError;
}

function sameSnapshot(a: MissionDraftSnapshot, b: MissionDraftSnapshot): boolean {
  if (a.code !== b.code || a.hintsUsed.length !== b.hintsUsed.length) return false;
  return a.hintsUsed.every((level, index) => level === b.hintsUsed[index]);
}

const noop = (): void => undefined;

interface Task {
  readonly kind: "save" | "delete";
  input: MissionDraftWriteInput | null;
  readonly owner: object | null;
  readonly coalescible: boolean;
  cancelled: boolean;
  readonly done: Promise<void>;
  resolve(): void;
  reject(error: unknown): void;
}

function createTask(
  kind: Task["kind"],
  input: MissionDraftWriteInput | null,
  owner: object | null,
  coalescible: boolean,
): Task {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const done = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { kind, input, owner, coalescible, cancelled: false, done, resolve, reject };
}

/** The serial write queue of one activity's draft. */
class DraftChannel {
  private readonly queue: Task[] = [];
  private running = false;
  private lastSettled: Promise<void> = Promise.resolve();

  constructor(
    private readonly activityId: LearningActivityId,
    private readonly persistence: LearningPersistence,
    private readonly onIdle: (channel: DraftChannel) => void,
  ) {}

  /**
   * `coalesce`: a save from the same owner that has NOT started yet is replaced by
   * this newer one (latest wins) and both callers share its outcome.
   */
  enqueueSave(input: MissionDraftWriteInput, owner: object | null, coalesce: boolean): Promise<void> {
    if (coalesce) {
      const tail = this.queue[this.queue.length - 1];
      if (tail !== undefined && tail.kind === "save" && tail.coalescible && tail.owner === owner && !tail.cancelled) {
        tail.input = input;
        return tail.done;
      }
    }
    return this.push(createTask("save", input, owner, coalesce));
  }

  enqueueDelete(owner: object | null): Promise<void> {
    return this.push(createTask("delete", null, owner, false));
  }

  /** Saves of `owner` that have not started become no-ops (they would be overwritten or deleted anyway). */
  cancelPending(owner: object): void {
    for (const task of this.queue) {
      if (task.owner === owner && task.kind === "save") task.cancelled = true;
    }
  }

  /** Settles (never rejects) once everything accepted so far has finished. */
  settled(): Promise<void> {
    return this.lastSettled;
  }

  private push(task: Task): Promise<void> {
    this.queue.push(task);
    this.lastSettled = task.done.then(noop, noop);
    if (!this.running) {
      this.running = true;
      // Starts synchronously: the first write reaches persistence in the caller's turn.
      void this.drain();
    }
    return task.done;
  }

  private async drain(): Promise<void> {
    try {
      for (let task = this.queue.shift(); task !== undefined; task = this.queue.shift()) {
        try {
          if (!task.cancelled) await this.run(task);
          task.resolve();
        } catch (error) {
          task.reject(error);
        }
      }
    } finally {
      this.running = false;
      this.onIdle(this);
    }
  }

  private run(task: Task): Promise<void> {
    if (task.kind === "delete") return this.persistence.deleteMissionDraft(this.activityId);
    const input = task.input;
    if (input === null) return Promise.resolve();
    return this.persistence.saveMissionDraft({
      activityId: input.activityId,
      seed: input.seed,
      variantIndex: input.variantIndex,
      code: input.code,
      hintsUsed: input.hintsUsed,
      updatedAt: new Date().toISOString(),
    });
  }
}

/** What a draft handle needs from its scheduler. */
/** What the scheduler may ask a handle when a gate-delayed request finally starts. */
interface DraftOwner {
  /** False once a newer handle or a Clear retired it: its obsolete write is skipped. */
  canWrite(): boolean;
  /**
   * False once a newer handle of the activity opened OR a Clear retired this handle.
   * The newest-generation test alone is not enough: a Clear retires handles without
   * opening a newer one, so the retired handle would still look "newest".
   */
  canDelete(): boolean;
}

interface DraftSink {
  requestSave(owner: DraftOwner, input: MissionDraftWriteInput): Promise<void>;
  requestDelete(owner: DraftOwner, activityId: LearningActivityId, admittedWork: boolean): Promise<void>;
  cancelPending(owner: object, activityId: LearningActivityId): void;
  isLatest(activityId: LearningActivityId, generation: number): boolean;
}

export class MissionDraftScheduler implements DraftSink {
  private readonly channels = new Map<LearningActivityId, DraftChannel>();
  /** Per activity: how many handles were ever opened (newest = highest). Tiny: one number per activity. */
  private readonly generations = new Map<LearningActivityId, number>();
  /** Per activity: the newest handle, told to step down (eagerly) when the next one opens. One entry per activity. */
  private readonly newest = new Map<LearningActivityId, DraftHandle>();

  constructor(
    private readonly persistence: LearningPersistence,
    private readonly lifecycle: ApplicationLifecycle,
    private readonly debounceMs: number = MISSION_DRAFT_DEBOUNCE_MS,
    private readonly gate: OperationGate = new OperationGate(),
  ) {}

  /** A direct write (not debounced, not coalesced), still ordered with every other write of the activity. */
  save(input: MissionDraftWriteInput): Promise<void> {
    return this.lifecycle.runDurable(() =>
      this.gate.runShared(() => this.channel(input.activityId).enqueueSave(input, null, false)),
    );
  }

  /** A direct delete, ordered after every write accepted before it. */
  delete(activityId: LearningActivityId): Promise<void> {
    return this.lifecycle.runDurable(() => this.gate.runShared(() => this.channel(activityId).enqueueDelete(null)));
  }

  /**
   * Clear, step 1 (synchronous, at request time): every existing handle steps down
   * (timer and unsaved tail dropped, status "closed"). Writes already queued stay -
   * Clear waits for them. Handles opened afterwards are not affected.
   */
  resetForClear(): void {
    const handles = [...this.newest.values()];
    this.newest.clear();
    for (const handle of handles) handle.supersede();
  }

  /** Clear, step 2: resolves (never rejects) once every write and delete accepted so far has finished. */
  settledAll(): Promise<void> {
    return Promise.all([...this.channels.values()].map((channel) => channel.settled())).then(noop);
  }

  /** Resolves once every write already accepted for `activityId` has finished (read-your-writes). Never rejects. */
  settled(activityId: LearningActivityId): Promise<void> {
    return this.channels.get(activityId)?.settled() ?? Promise.resolve();
  }

  /** A new handle for one mission session; it becomes the newest for its activity. */
  open(options: OpenMissionDraftOptions): OwnedMissionDraft {
    const generation = (this.generations.get(options.activityId) ?? 0) + 1;
    this.generations.set(options.activityId, generation);
    const handle = new DraftHandle(this, options, generation, this.debounceMs);
    // Eager supersession for the STATUS: the older handle's subscribers see "closed"
    // now, not at its next call. Writes are fenced independently (admission-time).
    this.newest.get(options.activityId)?.supersede();
    this.newest.set(options.activityId, handle);
    return handle;
  }

  requestSave(owner: DraftOwner, input: MissionDraftWriteInput): Promise<void> {
    return this.lifecycle.runDurable(() =>
      this.gate.runShared(() =>
        // Re-checked at the moment it really starts: a Clear may have retired the handle meanwhile.
        owner.canWrite() ? this.channel(input.activityId).enqueueSave(input, owner, true) : Promise.resolve(),
      ),
    );
  }

  requestDelete(owner: DraftOwner, activityId: LearningActivityId, admittedWork: boolean): Promise<void> {
    // The Submit's own delete runs inside its already-gated operation: gating it again would wait for itself.
    // Still fenced: being inside the Submit's operation is not authority to delete a draft the
    // handle no longer owns (a Clear retired it, or a newer session took the activity over).
    if (admittedWork) {
      return this.lifecycle.trackAdmitted(() =>
        owner.canDelete() ? this.channel(activityId).enqueueDelete(owner as object) : Promise.resolve(),
      );
    }
    return this.lifecycle.runDurable(() =>
      this.gate.runShared(() =>
        owner.canDelete() ? this.channel(activityId).enqueueDelete(owner as object) : Promise.resolve(),
      ),
    );
  }

  cancelPending(owner: object, activityId: LearningActivityId): void {
    this.channels.get(activityId)?.cancelPending(owner);
  }

  isLatest(activityId: LearningActivityId, generation: number): boolean {
    return this.generations.get(activityId) === generation;
  }

  private channel(activityId: LearningActivityId): DraftChannel {
    let channel = this.channels.get(activityId);
    if (channel === undefined) {
      channel = new DraftChannel(activityId, this.persistence, (idle) => {
        if (this.channels.get(activityId) === idle) this.channels.delete(activityId);
      });
      this.channels.set(activityId, channel);
    }
    return channel;
  }
}

class DraftHandle implements OwnedMissionDraft, DraftOwner {
  private latest: MissionDraftSnapshot | null;
  /** Incremented for every accepted change; a write carries the revision it was started for. */
  private revision = 0;
  private requestedRevision = 0;
  private persistedRevision = 0;
  private outstanding = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private failure: { readonly revision: number; readonly error: unknown } | null = null;
  private phase: "open" | "closed" | "discarded" = "open";
  /** The set refused or cancelled a write by design: nothing more is attempted. */
  private abandoned = false;
  /** A newer handle of the same activity opened. Sticky: generations only grow. */
  private superseded = false;
  private discarding: Promise<void> | null = null;
  private status: MissionDraftStatus = IDLE;
  private readonly listeners = new Set<() => void>();
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly sink: DraftSink,
    private readonly identity: OpenMissionDraftOptions,
    private readonly generation: number,
    private readonly debounceMs: number,
  ) {
    const persisted = identity.persisted ?? null;
    this.latest = persisted === null ? null : { code: persisted.code, hintsUsed: [...persisted.hintsUsed] };
  }

  update(snapshot: MissionDraftSnapshot, options: MissionDraftUpdateOptions = {}): void {
    if (this.phase !== "open" || this.abandoned || this.isSuperseded()) return;
    const unchanged = this.latest !== null && sameSnapshot(this.latest, snapshot);
    if (unchanged) {
      // Nothing new; an immediate request still releases a change that is only waiting for the debounce.
      if (options.immediate === true && this.timer !== null) this.requestWrite();
      return;
    }
    this.latest = { code: snapshot.code, hintsUsed: [...snapshot.hintsUsed] };
    this.revision += 1;
    if (options.immediate === true) {
      this.requestWrite();
    } else {
      this.clearTimer();
      this.timer = setTimeout(() => {
        this.timer = null;
        this.requestWrite();
      }, this.debounceMs);
      this.refresh();
    }
  }

  flush(): Promise<void> {
    if (this.phase === "discarded") return Promise.resolve();
    this.requestWrite();
    if (this.outstanding === 0 && this.timer === null) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.idleWaiters.push(resolve);
    });
  }

  close(): void {
    if (this.phase !== "open") return;
    this.phase = "closed";
    this.clearTimer();
    try {
      this.requestWrite();
    } catch {
      // close() never throws: the session's own teardown must not be affected.
    }
    this.refresh();
  }

  discard(): Promise<void> {
    return this.invalidate(false);
  }

  discardWithinAdmittedWork(): Promise<void> {
    return this.invalidate(true);
  }

  getStatus(): MissionDraftStatus {
    return this.status;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private invalidate(admittedWork: boolean): Promise<void> {
    if (this.discarding !== null) return this.discarding;
    // Synchronous: from here no timer, no new change and no queued write of this
    // handle can put the draft back.
    this.phase = "discarded";
    this.clearTimer();
    this.latest = null;
    this.sink.cancelPending(this, this.identity.activityId);
    if (this.canDelete()) {
      this.discarding = this.sink.requestDelete(this, this.identity.activityId, admittedWork).then(
        () => undefined,
        (error: unknown) => {
          if (!isExpectedCancellation(error)) {
            console.warn("Could not delete the mission draft after a passed submit.", error);
          }
        },
      );
    } else {
      // A newer session opened this activity, or a Clear retired this handle: the draft is not ours to delete.
      this.discarding = Promise.resolve();
    }
    this.refresh();
    this.releaseIdleWaiters();
    return this.discarding;
  }

  canWrite(): boolean {
    return !this.isSuperseded();
  }

  canDelete(): boolean {
    return !this.isSuperseded();
  }

  /**
   * The generation fence. Checked wherever a write could be admitted; the first
   * time it fails the handle drops its obsolete tail and timer for good.
   */
  private isSuperseded(): boolean {
    if (this.superseded) return true;
    if (this.sink.isLatest(this.identity.activityId, this.generation)) return false;
    this.supersede();
    return true;
  }

  /**
   * Called by the scheduler when a newer handle of the activity opens (never during
   * render). Drops the obsolete timer and tail and publishes "closed"; writes this
   * handle already admitted keep settling and keep being observed, but can no longer
   * change the status.
   */
  supersede(): void {
    if (this.superseded) return;
    this.superseded = true;
    this.clearTimer();
    this.latest = null;
    this.refresh();
    this.releaseIdleWaiters();
  }

  private requestWrite(): void {
    this.clearTimer();
    if (this.isSuperseded()) {
      // Admission is refused: a newer session owns this activity's draft.
      this.refresh();
      return;
    }
    const snapshot = this.latest;
    if (snapshot === null || this.abandoned || this.phase === "discarded") {
      this.refresh();
      return;
    }
    if (this.revision <= this.persistedRevision) {
      this.refresh();
      return;
    }
    // Already requested and not failed: the write in flight carries this revision.
    if (this.revision <= this.requestedRevision && this.failure === null) {
      this.refresh();
      return;
    }
    const revision = this.revision;
    this.requestedRevision = revision;
    this.failure = null;
    this.outstanding += 1;
    let write: Promise<void>;
    try {
      write = this.sink.requestSave(this, {
        activityId: this.identity.activityId,
        seed: this.identity.seed,
        variantIndex: this.identity.variantIndex,
        code: snapshot.code,
        hintsUsed: snapshot.hintsUsed,
      });
    } catch (error) {
      write = Promise.reject(error);
    }
    write.then(
      () => this.settleWrite(revision, null),
      (error: unknown) => this.settleWrite(revision, { error }),
    );
    this.refresh();
  }

  private settleWrite(revision: number, failed: { readonly error: unknown } | null): void {
    this.outstanding -= 1;
    if (failed === null) {
      if (revision > this.persistedRevision) this.persistedRevision = revision;
      if (this.failure !== null && this.failure.revision <= this.persistedRevision) this.failure = null;
    } else if (isExpectedCancellation(failed.error)) {
      this.abandoned = true;
    } else {
      console.warn("Could not save the mission draft.", failed.error);
      // A stale failure (an older revision, a newer one already stored) is not reported.
      if (revision > this.persistedRevision) this.failure = { revision, error: failed.error };
    }
    this.refresh();
    this.releaseIdleWaiters();
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private releaseIdleWaiters(): void {
    if (this.outstanding > 0 || this.timer !== null) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  private computeStatus(): MissionDraftStatus {
    if (this.phase === "discarded" || this.abandoned || this.superseded) return CLOSED;
    if (this.timer !== null) return SCHEDULED;
    if (this.outstanding > 0) return SAVING;
    if (this.failure !== null) {
      return this.status.kind === "failed" && this.status.error === this.failure.error
        ? this.status
        : Object.freeze({ kind: "failed" as const, error: this.failure.error });
    }
    return this.persistedRevision > 0 ? SAVED : IDLE;
  }

  private refresh(): void {
    const next = this.computeStatus();
    if (next === this.status) return;
    this.status = next;
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        console.error("A mission draft status listener threw.", error);
      }
    }
  }
}
