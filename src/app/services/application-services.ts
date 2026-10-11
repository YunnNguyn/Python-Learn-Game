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
import { HintEngine, HintRegistry } from "../../core/hints";
import { LearningEngine, MissionAttemptSession } from "../../core/learning";
import {
  createBrowserMetaProgressionPersistence,
  MetaProgressionEngine,
} from "../../core/meta-progression";
import { generateMissionInstance, MissionEngine } from "../../core/missions";
import {
  createBrowserLearningPersistence,
  type LearningPersistence,
  type PersistenceScope,
} from "../../core/persistence";
import {
  CORE_RUNTIME_ID,
  type RuntimeSystemError,
  type RuntimeWorkspaceInfo,
} from "../../core/runtime";
import { createLocalPythonRuntimeManager } from "../../core/runtime/local-python";
import { createPyodideRuntimeManager } from "../../core/runtime/pyodide";
import { getActivityAccess } from "../learning-path";

const PENDING_INITIALIZATION: ApplicationInitializationState = Object.freeze({
  status: "pending",
});
const READY_INITIALIZATION: ApplicationInitializationState = Object.freeze({ status: "ready" });

export interface PlayableMissionSession {
  readonly session: MissionAttemptSession;
  readonly initialCode: string;
  readonly variantIndex: number;
  readonly resumedDraft: boolean;
  readonly initialWorkspace?: RuntimeWorkspaceInfo;
}

export interface CreateMissionSessionOptions {
  readonly seed?: string;
  readonly variantIndex?: number;
  readonly resumeDraft?: boolean;
  readonly resetCode?: boolean;
}

export type CreateMissionSessionResult =
  | { readonly ok: true; readonly value: PlayableMissionSession }
  | { readonly ok: false; readonly error: RuntimeSystemError };

/**
 * Observable result of startup (see `createApplicationServices`). `failed` is
 * terminal for a given service set: it is never reset to `pending`.
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
  readonly learning: LearningEngine;
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
  createMissionSession(
    activityId: string,
    options?: CreateMissionSessionOptions,
  ): Promise<CreateMissionSessionResult>;
  saveMissionDraft(input: {
    readonly activityId: LearningActivityId;
    readonly seed: string;
    readonly variantIndex: number;
    readonly code: string;
    readonly hintsUsed: readonly HintLevel[];
  }): Promise<void>;
  deleteMissionDraft(activityId: LearningActivityId): Promise<void>;
  clearLearningData(): Promise<void>;
  getPersistenceKind(): "indexeddb" | "memory";
  getMetaProgressionPersistenceKind(): "indexeddb" | "memory";
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
 * Lifecycle note for FUTURE verified-account switching (not implemented here):
 * there is no dispose() and no runtime switching. Changing the active account
 * means building a NEW set and retiring the old one, which requires:
 * - replacing the service set held by `App.tsx` / `ApplicationServicesProvider`
 *   (React consumers subscribed to the old engines must be unmounted);
 * - disposing every open MissionAttemptSession from the old set (its
 *   `onAttemptRecord` closure still writes to the OLD scope's engines);
 * - cancelling pending draft saves that target the old set;
 * - closing the old IndexedDB connections (persistence classes expose no
 *   close(), so connections stay open until page unload);
 * - never reusing an old set's in-memory engine state under another scope.
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
 */
export function createApplicationServices(
  options: CreateApplicationServicesOptions = {},
): ApplicationServices {
  // Persistence is created first so an invalid scope throws before any registry
  // work or storage access. Both factories validate the same scope value, and
  // neither opens IndexedDB until the first operation.
  const persistence = createBrowserLearningPersistence(options.scope);
  const metaPersistence = createBrowserMetaProgressionPersistence(options.scope);

  const content = new ContentRegistry();
  const generators = new GeneratorRegistry();
  const graders = new GraderRegistry();
  const hints = new HintRegistry();
  const learning = new LearningEngine(persistence);
  const metaProgression = new MetaProgressionEngine(metaPersistence);
  let initializePromise: Promise<void> | null = null;

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

  async function runStartup(): Promise<void> {
    // Read the reward-eligible snapshot first: if provenance cannot be read, no
    // engine has started and nothing has been reconciled.
    const rewardEligibleAttempts = await persistence.getRewardEligibleAttemptsSnapshot();
    await learning.initialize();
    await metaProgression.initialize();
    await metaProgression.reconcileAttempts(rewardEligibleAttempts);
  }

  function initialize(): Promise<void> {
    initializePromise ??= runStartup().then(
      () => {
        setInitializationState(READY_INITIALIZATION);
      },
      (error: unknown) => {
        console.error("Application initialization failed.", error);
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
      try {
        await initialize();
      } catch {
        // A mission must never start on a service set whose startup failed.
        // The raw error stays in getInitializationState() and the console
        // diagnostic; the user-facing message deliberately omits it.
        return failure(
          "APPLICATION_INITIALIZATION_FAILED",
          "Ứng dụng chưa khởi tạo được dữ liệu học tập cục bộ nên chưa thể mở bài thực hành. Hãy đóng các tab khác của ứng dụng rồi tải lại trang.",
        );
      }
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

      const draft =
        options.seed === undefined && options.resumeDraft !== false
          ? await persistence.getMissionDraft(activity.id)
          : null;
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
      const engine = new MissionEngine(runtime, graders);
      const loaded = await engine.loadMission(template, instance);
      if (!loaded.ok) {
        engine.dispose();
        return { ok: false, error: loaded.error };
      }

      const session = new MissionAttemptSession(activity, template, instance, engine, {
        hintEngine: new HintEngine(hintSet ?? null, resumedDraftHintLevels(draft, seed)),
        onAttemptRecord: async (record) => {
          await learning.recordAttempt(record);
          await metaProgression.recordAttempt(record);
        },
      });
      const starterCode =
        instance.learner.starterCode ?? template.starterCode ?? "# Viết mã Python tại đây\n";
      const resumedDraft =
        !options.resetCode && draft !== null && draft.seed === seed;

      return {
        ok: true,
        value: {
          session,
          initialCode: resumedDraft ? draft.code : starterCode,
          variantIndex,
          resumedDraft,
          ...(loaded.workspace !== undefined
            ? { initialWorkspace: loaded.workspace }
            : {}),
        },
      };
    },

    async saveMissionDraft(input) {
      await persistence.saveMissionDraft({
        ...input,
        updatedAt: new Date().toISOString(),
      });
    },

    deleteMissionDraft(activityId) {
      return persistence.deleteMissionDraft(activityId);
    },

    async clearLearningData() {
      // Rejects with the startup error when initialization failed: clearing
      // must not run against half-initialized engines.
      await initialize();
      await learning.clearAttempts();
      await persistence.clearMissionDrafts();
      await metaProgression.clearAll();
    },

    getPersistenceKind() {
      return persistence.kind;
    },

    getMetaProgressionPersistenceKind() {
      return metaProgression.getPersistenceKind();
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

function resumedDraftHintLevels(
  draft: Awaited<ReturnType<LearningPersistence["getMissionDraft"]>>,
  seed: string,
) {
  return draft?.seed === seed ? draft.hintsUsed : [];
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

function failure(code: string, message: string): CreateMissionSessionResult {
  return { ok: false, error: { code, message } };
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallback;
}
