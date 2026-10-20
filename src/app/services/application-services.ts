import {
  CS116_PRODUCTION_CONTENT,
  getCs116MissionInstanceValidator,
  registerCs116Generators,
  registerCs116Hints,
  registerCs116ProductionContent,
} from "../../content/cs116";
import { ContentRegistry, validateContent } from "../../core/content";
import {
  Difficulty,
  LearningActivityType,
  type HintLevel,
  type LearningActivityId,
  type MissionTemplate,
} from "../../core/domain";
import { GeneratorRegistry } from "../../core/generators";
import { GraderRegistry, registerCoreGraders } from "../../core/grading";
import { HintRegistry } from "../../core/hints";
import type { LearningEngine } from "../../core/learning";
import {
  createBrowserMetaProgressionPersistence,
  type MetaProgressionEngine,
} from "../../core/meta-progression";
import { generateMissionInstance } from "../../core/missions";
import { createBrowserLearningPersistence, type PersistenceScope } from "../../core/persistence";
import { CORE_RUNTIME_ID } from "../../core/runtime";
import { createLocalPythonRuntimeManager } from "../../core/runtime/local-python";
import { createPyodideRuntimeManager } from "../../core/runtime/pyodide";
import { getActivityAccess } from "../learning-path";
import {
  ApplicationLifecycle,
  ApplicationServicesRetiredError,
  isApplicationServicesRetiredError,
  resolveDrainTimeout,
  type ApplicationDisposalFailure,
  type ApplicationLifecycleState,
  type ApplicationPersistenceCloseStates,
  type ApplicationServicesDisposalResult,
  type DisposeApplicationServicesOptions,
} from "./application-lifecycle";
import { MissionDraftScheduler } from "./mission-draft-scheduler";
import { OperationGate } from "./operation-gate";
import {
  admitted,
  MissionSessionRegistry,
  ServiceLearningEngine,
  ServiceMetaProgressionEngine,
} from "./service-owned-resources";
import {
  failure,
  openResolvedMissionSession,
  retiredFailure,
  type CreateMissionSessionResult,
  type PlayableMissionSession,
} from "./resolved-mission-session";

const PENDING_INITIALIZATION: ApplicationInitializationState = Object.freeze({
  status: "pending",
});
const READY_INITIALIZATION: ApplicationInitializationState = Object.freeze({ status: "ready" });

export interface CreateMissionSessionOptions {
  readonly seed?: string;
  readonly variantIndex?: number;
  readonly resumeDraft?: boolean;
  readonly resetCode?: boolean;
}

// Defined next to the opening phase that produces them (PHASE-05-M7.0); re-exported
// here so every existing import path keeps working.
export type { CreateMissionSessionResult, PlayableMissionSession };

/**
 * Observable result of startup (see `createApplicationServices`). `failed` is
 * terminal for a given service set: it is never reset to `pending`. A set that
 * began retiring before startup finished never becomes `ready`: its startup
 * settles as `failed` with ApplicationServicesRetiredError.
 */
export type ApplicationInitializationState =
  | { readonly status: "pending" }
  | { readonly status: "ready" }
  | { readonly status: "failed"; readonly error: unknown };

export interface ApplicationServices {
  readonly content: ContentRegistry;
  readonly generators: GeneratorRegistry;
  readonly graders: GraderRegistry;
  readonly hints: HintRegistry;
  /** Reads are unrestricted; mutations are refused once the set is retiring (see M4 contract). */
  readonly learning: LearningEngine;
  /** Reads are unrestricted; mutations are refused once the set is retiring (see M4 contract). */
  readonly metaProgression: MetaProgressionEngine;
  /**
   * Runs (once) and returns the startup promise. On failure it rejects with the
   * underlying error - every call, forever - because a service set that failed
   * to start is never retried in place.
   */
  initialize(): Promise<void>;
  /** Stable object identity until the status changes (safe for useSyncExternalStore). */
  getInitializationState(): ApplicationInitializationState;
  subscribeInitialization(listener: () => void): () => void;
  /** Never rejects; returns an error result instead (including after retirement). */
  createMissionSession(
    activityId: string,
    options?: CreateMissionSessionOptions,
  ): Promise<CreateMissionSessionResult>;
  /**
   * A direct draft write. Not debounced, but ordered with every other draft write
   * and delete of the same activity (M5). Rejects with ApplicationServicesRetiredError
   * once the set is retiring; a write accepted earlier still settles.
   */
  saveMissionDraft(input: {
    readonly activityId: LearningActivityId;
    readonly seed: string;
    readonly variantIndex: number;
    readonly code: string;
    readonly hintsUsed: readonly HintLevel[];
  }): Promise<void>;
  /** Ordered after every draft write accepted before it. Rejects with ApplicationServicesRetiredError once the set is retiring. */
  deleteMissionDraft(activityId: LearningActivityId): Promise<void>;
  /** Rejects with ApplicationServicesRetiredError once the set is retiring. */
  clearLearningData(): Promise<void>;
  getPersistenceKind(): "indexeddb" | "memory";
  getMetaProgressionPersistenceKind(): "indexeddb" | "memory";
  /** Stable object identity until the status changes (safe for useSyncExternalStore). */
  getLifecycleState(): ApplicationLifecycleState;
  subscribeLifecycle(listener: () => void): () => void;
  /**
   * Retires this set (synchronously) and drains it (see the M4 contract on
   * `createApplicationServices`). Idempotent; never rejects. Throws a
   * RangeError synchronously - retiring nothing - for an invalid timeout.
   */
  dispose(options?: DisposeApplicationServicesOptions): Promise<ApplicationServicesDisposalResult>;
}

export interface CreateApplicationServicesOptions {
  /**
   * Local persistence namespace for BOTH learning and meta-progression storage.
   * Omitted (or `undefined`) means Guest, the production default. Pass
   * `GUEST_SCOPE` to state Guest intent explicitly.
   *
   * An account scope is an opaque storage namespace, NOT proof of authentication.
   * It must come from trusted application code after a future verified session;
   * never derive it from a URL, localStorage, form input or any other
   * user-editable source. An invalid scope throws and never falls back to Guest.
   */
  readonly scope?: PersistenceScope;
}

/**
 * Builds one self-contained service set for a single persistence scope.
 *
 * Every call creates new registries, engines and persistence instances; nothing
 * is cached at module level, so two sets never share mutable state. Sets built
 * for the same scope see the same stored data (IndexedDB), not each other's
 * in-memory state.
 *
 * Startup sequence (started eagerly, runs once per set):
 *  1. `persistence.getRewardEligibleAttemptsSnapshot()` - one atomic read of the
 *     attempts that may earn LOCAL rewards (locally submitted + legacy v1
 *     attempts; every `cloud-import` / `guest-copy` attempt is excluded). It is
 *     read from this set's own scoped persistence and BEFORE any engine starts.
 *  2. `learning.initialize()` - loads ALL attempts, imported ones included, so
 *     history, activity progress, concept progress and unlocks see them.
 *  3. `metaProgression.initialize()` - loads stored reward state.
 *  4. `metaProgression.reconcileAttempts(snapshot)` - fed ONLY the snapshot from
 *     step 1. There is no fallback to `learning.getAttempts()` or to any
 *     unfiltered list; if step 1 fails, steps 2-4 never run.
 *
 * Failure policy: any failed step (blocked upgrade, schema newer than this
 * build, unreadable provenance, ...) rejects `initialize()` with the underlying
 * error, moves `getInitializationState()` to `failed`, and is handled for the
 * eager call, so it never becomes an unhandled rejection. `createMissionSession`
 * then returns a failure result and `clearLearningData` rejects. Nothing falls
 * back to Guest, another scope or an empty in-memory store.
 *
 * Recovery: a failed set is NOT retried in place (its engines may be half
 * initialized and cache their own rejected promises). Recovery means building a
 * new set (reloading the page, as the startup failure screen does), after the
 * cause is fixed - e.g. other tabs closed for a blocked upgrade.
 *
 * Lifecycle (PHASE-04C.3D.5, M4) - independent of initialization:
 *  active -> retiring -> disposed  (see ApplicationLifecycleState)
 *  - `dispose()` retires the set SYNCHRONOUSLY: from that moment no mission
 *    session is created, no Submit can start grading (every owned session is
 *    disposed, cancelling a pending grading through the M1 contract without an
 *    AttemptRecord), engines still loading for a session are disposed, and
 *    every service-owned durable mutation - drafts, clear, rewards, workshop,
 *    `services.learning` / `services.metaProgression` mutations - is refused
 *    with ApplicationServicesRetiredError. Remaining startup steps are skipped.
 *  - A mission load in flight (engine loading, plus the cleanup that follows it)
 *    is tracked until it has settled: the engine is torn down at retirement, but
 *    the load's continuation still runs later, so `disposed` is never reported -
 *    and persistence is never closed - before it is over. A cleanup failure in
 *    that continuation therefore decides the outcome; a load that does not settle
 *    within `drainTimeoutMs` yields `DRAIN_TIMEOUT` (with `pendingMissionLoads`),
 *    never `disposed`. The late result of such a load is never handed out.
 *  - Durable work admitted earlier (a Submit past its durable-write boundary,
 *    a started startup step, a draft write, a clear, a workshop build, a queued
 *    reward mutation) is DRAINED: allowed to settle, with its own result or
 *    error delivered to its own caller. Nothing is redirected to another scope
 *    or to memory, and nothing is deleted - attempts, drafts, provenance and
 *    rewards stay stored.
 *  - Only after the drain do both persistence instances close (M2/M3 close
 *    contracts). The result reports each close state, distinguishing `closed`
 *    from `closed-pending-open` (a browser open request for this set's own
 *    database still outstanding; harmless to it, but reopening the SAME scope
 *    may wait for it).
 *  - `disposed` is reported only when nothing failed: every owned session /
 *    engine disposed without throwing, both `close()` calls fulfilled, and both
 *    stores report `closed` or `closed-pending-open`. Otherwise `dispose()`
 *    resolves `{ status: "incomplete", reason: "RESOURCE_CLEANUP_FAILED" }` with
 *    the original errors and each store's observed state; the set stays
 *    `retiring` (never active again, nothing reopened or redirected) and a later
 *    `dispose()` retries the failed cleanups. One failing resource never stops
 *    the others from being processed.
 *  - A drain that does not finish within `drainTimeoutMs` resolves
 *    `{ status: "incomplete", reason: "DRAIN_TIMEOUT" }`: the set stays
 *    `retiring`, persistence stays open, and the set must not be replaced for
 *    its scope yet. A later `dispose()` waits again. A timeout is never reported
 *    as disposal, and a close failure is never reported as a timeout.
 *  - Production currently builds exactly one set per page and never disposes
 *    it; account switching (later milestones) will build a new set only after
 *    the old one reports `disposed`.
 *  Mission drafts (PHASE-04C.3D.6, M5): every draft write and delete of this set
 *  goes through one scheduler (see mission-draft-scheduler.ts). Writes of one
 *  activity are serialized in acceptance order, the 350 ms debounce lives in the
 *  per-session draft handle, and each accepted write is a durable operation of
 *  this lifecycle - so retirement refuses new ones (a timer firing afterwards
 *  opens nothing) and drains the accepted ones. A passed Submit discards its draft
 *  inside the same admitted operation that stores the attempt. Resuming waits for
 *  the activity's earlier draft writes before it reads.
 *  Clear vs everything else (PHASE-04C.3D.7, M6): `clearLearningData()` is the
 *  EXCLUSIVE operation of an OperationGate (see operation-gate.ts); the Submit
 *  persistence (attempt + reward + draft delete), the engines' mutations and the
 *  draft writes are SHARED. Anything accepted before a Clear finishes first and
 *  is then cleared; anything requested while a Clear runs or waits is delayed
 *  until it is done and runs against the cleared store. Existing draft handles
 *  are retired when a Clear is requested; sessions opened afterwards save
 *  normally. Concurrency between shared operations is unchanged.
 */
export function createApplicationServices(
  options: CreateApplicationServicesOptions = {},
): ApplicationServices {
  // Persistence is created first so an invalid scope throws before any registry
  // work or storage access. Both factories validate the same scope value, and
  // neither opens IndexedDB until the first operation.
  const persistence = createBrowserLearningPersistence(options.scope);
  const metaPersistence = createBrowserMetaProgressionPersistence(options.scope);

  const lifecycle = new ApplicationLifecycle();
  const sessions = new MissionSessionRegistry();
  const gate = new OperationGate();
  const drafts = new MissionDraftScheduler(persistence, lifecycle, undefined, gate);
  const content = new ContentRegistry();
  const generators = new GeneratorRegistry();
  const graders = new GraderRegistry();
  const hints = new HintRegistry();
  const learning = new ServiceLearningEngine(persistence, lifecycle, gate);
  const metaProgression = new ServiceMetaProgressionEngine(metaPersistence, lifecycle, gate);
  let initializePromise: Promise<void> | null = null;
  let disposal: Promise<ApplicationServicesDisposalResult> | null = null;
  let disposed: ApplicationServicesDisposalResult | null = null;

  registerCs116Generators(generators);
  registerCoreGraders(graders);
  registerCs116Hints(hints);

  const validation = validateContent(CS116_PRODUCTION_CONTENT, {
    extensionCapabilities: {
      generatorIds: generators.getGeneratorIds(),
      graderIds: graders.getGraderIds(),
      runtimeIds: [CORE_RUNTIME_ID.PYODIDE, CORE_RUNTIME_ID.LOCAL_PYTHON],
      hintSetIds: hints.getHintSetIds(),
    },
    schemaSupport: { supportedSchemaVersions: [1] },
  });

  if (!validation.valid) {
    throw new Error(
      `Built-in content validation failed: ${validation.issues
        .map((issue) => issue.message)
        .join(" | ")}`,
    );
  }

  registerCs116ProductionContent(content);

  let initializationState: ApplicationInitializationState = PENDING_INITIALIZATION;
  const initializationListeners = new Set<() => void>();

  function setInitializationState(next: ApplicationInitializationState): void {
    initializationState = next;
    for (const listener of initializationListeners) listener();
  }

  /** Throws once retirement began: the remaining startup steps must not run. */
  function assertActive(): void {
    if (!lifecycle.isActive()) throw new ApplicationServicesRetiredError();
  }

  async function runStartup(): Promise<void> {
    // Read the reward-eligible snapshot first: if provenance cannot be read, no
    // engine has started and nothing has been reconciled.
    const rewardEligibleAttempts = await persistence.getRewardEligibleAttemptsSnapshot();
    assertActive();
    await learning.initialize();
    assertActive();
    await metaProgression.initialize();
    assertActive();
    // Admitted as part of the (tracked) startup operation.
    await admitted.metaReconcileAttempts(metaProgression, rewardEligibleAttempts);
    // Completed, but the set retired meanwhile: never report it ready.
    assertActive();
  }

  function initialize(): Promise<void> {
    // Startup is tracked as one durable operation from the moment it starts (at
    // construction, while active), so a drain waits for its in-flight step.
    initializePromise ??= lifecycle.trackAdmitted(runStartup).then(
      () => {
        setInitializationState(READY_INITIALIZATION);
      },
      (error: unknown) => {
        if (!isApplicationServicesRetiredError(error)) {
          console.error("Application initialization failed.", error);
        }
        setInitializationState(Object.freeze({ status: "failed", error }));
        throw error;
      },
    );
    return initializePromise;
  }

  // Eager start. The rejection is observed here (so it cannot surface as an
  // unhandled rejection) and stays visible through getInitializationState() and
  // through every explicit `initialize()` call, which still rejects.
  initialize().catch(() => undefined);

  /** Reads the stored draft after every draft write already accepted for the activity has finished. */
  async function readMissionDraft(activityId: LearningActivityId) {
    // Shared on the OperationGate (M6): a Clear that is running or waiting finishes
    // first, so a session opened around a Clear never resumes a draft it deleted.
    return gate.runShared(async () => {
      await drafts.settled(activityId);
      return persistence.getMissionDraft(activityId);
    });
  }

  async function openMissionSession(
    activityId: string,
    options: CreateMissionSessionOptions,
  ): Promise<CreateMissionSessionResult> {
    try {
      await initialize();
    } catch {
      if (!lifecycle.isActive()) return retiredFailure();
      // A mission must never start on a service set whose startup failed.
      // The raw error stays in getInitializationState() and the console
      // diagnostic; the user-facing message deliberately omits it.
      return failure(
        "APPLICATION_INITIALIZATION_FAILED",
        "Ứng dụng chưa khởi tạo được dữ liệu học tập cục bộ nên chưa thể mở bài thực hành. Hãy đóng các tab khác của ứng dụng rồi tải lại trang.",
      );
    }
    if (!lifecycle.isActive()) return retiredFailure();

    const activity = content.getActivity(activityId as LearningActivityId);
    if (activity === undefined) {
      return failure(
        "ACTIVITY_NOT_FOUND",
        "Không tìm thấy hoạt động học cần mở.",
      );
    }

    const access = getActivityAccess(content, learning, activity.id);
    if (!access.unlocked) {
      return failure("ACTIVITY_LOCKED", access.reason);
    }

    if (
      activity.type !== LearningActivityType.CODE_MISSION &&
      activity.type !== LearningActivityType.DEBUG_MISSION &&
      activity.type !== LearningActivityType.BOSS_MISSION
    ) {
      return failure(
        "ACTIVITY_NOT_EXECUTABLE",
        "Hoạt động này chưa sử dụng không gian chạy mã Python.",
      );
    }

    const template = content.getMissionTemplate(activity.missionTemplateId);
    if (template === undefined) {
      return failure(
        "MISSION_TEMPLATE_NOT_FOUND",
        "Không tìm thấy cấu hình nhiệm vụ cho hoạt động này.",
      );
    }

    // Read-your-writes: a draft write accepted earlier for this activity (typically
    // the final save of the session the learner just left) lands before the read.
    const draft =
      options.seed === undefined && options.resumeDraft !== false
        ? await readMissionDraft(activity.id)
        : null;
    if (!lifecycle.isActive()) return retiredFailure();
    const variantIndex = options.variantIndex ?? draft?.variantIndex ?? 0;
    const seed =
      options.seed ??
      draft?.seed ??
      deriveActivityVariantSeed(activity.id, template.version, variantIndex);

    let instance;
    try {
      instance = generateMissionInstance({
        template,
        generatorRegistry: generators,
        baseSeed: seed,
        difficulty: Difficulty.EASY,
        validator: getCs116MissionInstanceValidator(template.generator.id),
      }).instance;
    } catch (error) {
      return failure(
        "MISSION_GENERATION_FAILED",
        getErrorMessage(error, "Không thể tạo dữ liệu cho nhiệm vụ."),
      );
    }

    const hintSet = template.hintSetId
      ? hints.getHintSet(template.hintSetId)
      : undefined;
    if (template.hintSetId && !hintSet) {
      return failure(
        "HINT_SET_NOT_FOUND",
        "Không tìm thấy bộ gợi ý của nhiệm vụ.",
      );
    }

    const runtime = createRuntimeManager(template);
    if (runtime === null) {
      return failure(
        "RUNTIME_UNSUPPORTED",
        "Mission đang yêu cầu một Python runtime mà ứng dụng chưa hỗ trợ.",
      );
    }
    // No `await` separates the last `isActive()` check above from this call, so a
    // load can only start while the set is active (openResolvedMissionSession awaits
    // nothing before it tracks the load either).
    return openResolvedMissionSession(
      {
        lifecycle,
        gate,
        drafts,
        sessions,
        graders,
        // The CS116 Submit path: attempt, then reward (both base paths; the helper
        // admits the operation and holds the gate). Every other caller of the helper
        // must pass its own callback.
        recordSubmittedAttempt: async (record) => {
          await admitted.learningRecordAttempt(learning, record);
          await admitted.metaRecordAttempt(metaProgression, record);
        },
      },
      {
        activity,
        template,
        instance,
        seed,
        variantIndex,
        hintSet,
        runtime,
        storedDraft: draft,
        resetCode: Boolean(options.resetCode),
      },
    );
  }

  /**
   * Closes one persistence instance and reports what it actually looks like.
   * A close that rejects/throws, a `getCloseState()` that throws, and a close
   * that resolves but leaves the store `open` are all failures - never swallowed
   * and never turned into a disposal. The original error is kept.
   */
  async function closePersistence<State extends string>(
    resource: "learning-persistence" | "meta-progression-persistence",
    store: { close(): Promise<void>; getCloseState(): State },
  ): Promise<{ readonly state: State | "unknown"; readonly failures: ApplicationDisposalFailure[] }> {
    const failures: ApplicationDisposalFailure[] = [];
    try {
      await store.close();
    } catch (error) {
      failures.push({ resource, error });
    }
    let state: State | "unknown";
    try {
      state = store.getCloseState();
    } catch (error) {
      state = "unknown";
      failures.push({ resource, error });
    }
    if (state === "open" && failures.length === 0) {
      failures.push({
        resource,
        error: new Error("close() resolved but the persistence instance still reports an open connection."),
      });
    }
    return { state, failures };
  }

  async function drainAndClose(timeoutMs: number): Promise<ApplicationServicesDisposalResult> {
    const drained = await lifecycle.waitForDrain(timeoutMs);
    if (!drained) {
      lifecycle.markDrainIncomplete();
      const ownedFailures = sessions.getUnresolvedFailures();
      const pendingLoads = lifecycle.getPendingMissionLoadCount();
      return Object.freeze({
        status: "incomplete",
        reason: "DRAIN_TIMEOUT",
        pendingDurableOperations: lifecycle.getPendingDurableOperationCount(),
        ...(pendingLoads > 0 ? { pendingMissionLoads: pendingLoads } : {}),
        ...(ownedFailures.length > 0 ? { failures: Object.freeze([...ownedFailures]) } : {}),
      });
    }
    // Nothing service-owned is in flight any more and nothing new can be
    // admitted, so closing cannot cut off a write. A mission session whose
    // runtime failed to dispose cannot write either (its session is already
    // marked disposed, so no Submit can reach the durable-write boundary), so
    // persistence is closed regardless and the failure is reported alongside.
    const [learningClose, metaClose] = await Promise.all([
      closePersistence("learning-persistence", persistence),
      closePersistence("meta-progression-persistence", metaPersistence),
    ]);
    const failures = [
      ...sessions.getUnresolvedFailures(),
      ...learningClose.failures,
      ...metaClose.failures,
    ];
    if (failures.length > 0) {
      // Still non-active. Whatever is already closed stays closed; whatever
      // failed is reported as it is now - never claimed open or closed blindly.
      lifecycle.markCleanupFailed();
      return Object.freeze({
        status: "incomplete",
        reason: "RESOURCE_CLEANUP_FAILED",
        persistence: Object.freeze({
          learning: learningClose.state,
          metaProgression: metaClose.state,
        }),
        failures: Object.freeze(failures),
      });
    }
    // No failure was recorded, so both states are terminal (`open` and
    // `unknown` each add a failure above).
    const closeStates: ApplicationPersistenceCloseStates = Object.freeze({
      learning: learningClose.state as Exclude<typeof learningClose.state, "open" | "unknown">,
      metaProgression: metaClose.state as Exclude<typeof metaClose.state, "open" | "unknown">,
    });
    lifecycle.markDisposed(closeStates);
    return Object.freeze({ status: "disposed", persistence: closeStates });
  }

  return {
    content,
    generators,
    graders,
    hints,
    learning,
    metaProgression,
    initialize,

    getInitializationState() {
      return initializationState;
    },

    subscribeInitialization(listener) {
      initializationListeners.add(listener);
      return () => {
        initializationListeners.delete(listener);
      };
    },

    async createMissionSession(activityId, options = {}) {
      if (!lifecycle.isActive()) return retiredFailure();
      try {
        return await openMissionSession(activityId, options);
      } catch (error) {
        if (!lifecycle.isActive()) return retiredFailure();
        console.error("Mission session could not be created.", error);
        return failure(
          "MISSION_SESSION_UNAVAILABLE",
          "Không thể mở bài thực hành lúc này. Hãy tải lại trang để thử lại.",
        );
      }
    },

    saveMissionDraft(input) {
      return drafts.save(input);
    },

    deleteMissionDraft(activityId) {
      return drafts.delete(activityId);
    },

    clearLearningData() {
      // Admitted as one operation. Rejects with the startup error when
      // initialization failed: clearing must not run against half-initialized
      // engines.
      return lifecycle.runDurable(() => {
        // Synchronous, at request time: every existing draft handle steps down, so
        // text typed before Clear (a debounce timer, an unsaved tail, a late close)
        // can never be written afterwards. Handles opened after Clear are unaffected.
        drafts.resetForClear();
        // Exclusive (M6): starts when every earlier mutation has finished, blocks
        // every later one until it is done. Steps are the ungated base paths.
        return gate.runExclusive(async () => {
          await initialize();
          // Draft deletes/saves accepted earlier (including the detached delete of a
          // passed Submit) finish before storage is cleared.
          await drafts.settledAll();
          await admitted.learningClearAttempts(learning);
          await persistence.clearMissionDrafts();
          await admitted.metaClearAll(metaProgression);
        });
      });
    },

    getPersistenceKind() {
      return persistence.kind;
    },

    getMetaProgressionPersistenceKind() {
      return metaProgression.getPersistenceKind();
    },

    getLifecycleState() {
      return lifecycle.getState();
    },

    subscribeLifecycle(listener) {
      return lifecycle.subscribe(listener);
    },

    dispose(disposeOptions) {
      const timeoutMs = resolveDrainTimeout(disposeOptions);
      if (disposed !== null) return Promise.resolve(disposed);
      if (disposal !== null) return disposal;

      // Synchronous retirement: admission closes before anything else runs.
      if (!lifecycle.beginRetirement()) lifecycle.resumeDrain();
      sessions.disposeAll();

      const current = drainAndClose(timeoutMs).then((result) => {
        if (result.status === "disposed") disposed = result;
        // An incomplete drain may be awaited again by a later dispose().
        disposal = null;
        return result;
      });
      disposal = current;
      return current;
    },
  };
}

// Heavy Pyodide packages (pandas, Matplotlib, scikit-learn, OpenCV) can take
// several seconds to import the first time in a fresh namespace, especially on
// modest machines, so Data/ML missions need a much longer execution deadline
// than the light NumPy exercises. We widen the timeout only for missions that
// actually request those packages (or stage a dataset workspace); plain NumPy
// missions keep a snappy deadline so infinite loops recover quickly.
const PYODIDE_LIGHT_TIMEOUT_MS = 15_000;
const PYODIDE_HEAVY_TIMEOUT_MS = 60_000;

function pyodideExecutionTimeoutMs(template: MissionTemplate): number {
  const config = template.runtime.config;
  if (config === undefined) {
    return PYODIDE_LIGHT_TIMEOUT_MS;
  }
  const packages = Array.isArray(config.packages)
    ? (config.packages as unknown[])
    : [];
  const hasHeavyPackage = packages.some(
    (name) => typeof name === "string" && name.toLowerCase() !== "numpy",
  );
  const hasWorkspace = config.workspace !== undefined;
  return hasHeavyPackage || hasWorkspace
    ? PYODIDE_HEAVY_TIMEOUT_MS
    : PYODIDE_LIGHT_TIMEOUT_MS;
}

function createRuntimeManager(template: MissionTemplate) {
  if (template.runtime.id === CORE_RUNTIME_ID.PYODIDE) {
    return createPyodideRuntimeManager({
      executionTimeoutMs: pyodideExecutionTimeoutMs(template),
    });
  }
  if (template.runtime.id === CORE_RUNTIME_ID.LOCAL_PYTHON) {
    return createLocalPythonRuntimeManager();
  }
  return null;
}

export function deriveActivityVariantSeed(
  activityId: LearningActivityId,
  templateVersion: number,
  variantIndex: number,
): string {
  if (!Number.isSafeInteger(variantIndex) || variantIndex < 0) {
    throw new RangeError("variantIndex must be a non-negative safe integer.");
  }

  return `play:${activityId}:v${templateVersion}:variant:${variantIndex}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;
}
