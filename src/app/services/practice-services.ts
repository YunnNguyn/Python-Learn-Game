import type { JsonObject, LearningActivityId } from "../../core/domain";
import {
  adaptExercise,
  parsePracticeActivityId,
  practiceActivityId,
  validateExercisePack,
  type AdaptedExercise,
  type ExercisePack,
  type ExercisePackIssue,
  type PackExercise,
} from "../../core/exercise-packs";
import { GraderRegistry, registerCoreGraders } from "../../core/grading";
import {
  PersistenceClosedError,
  PersistenceUpgradeBlockedError,
  createBrowserPracticePersistence,
  type PersistenceScope,
  type PracticePackRecord,
  type PracticePersistence,
} from "../../core/persistence";
import { CORE_RUNTIME_ID } from "../../core/runtime";
import { createPyodideRuntimeManager } from "../../core/runtime/pyodide";
import {
  ApplicationLifecycle,
  ApplicationServicesRetiredError,
  isApplicationServicesRetiredError,
  resolveDrainTimeout,
  type ApplicationDisposalFailure,
  type ApplicationLifecycleState,
  type DisposeApplicationServicesOptions,
} from "./application-lifecycle";
import { MissionDraftScheduler, type MissionOpening } from "./mission-draft-scheduler";
import { OperationGate } from "./operation-gate";
import { pyodideExecutionTimeoutMs } from "./pyodide-execution-timeout";
import {
  failure,
  openResolvedMissionSession,
  retiredFailure,
  type CreateMissionSessionResult,
} from "./resolved-mission-session";
import { MissionSessionRegistry } from "./service-owned-resources";

/*
 * Practice services (PHASE-05-M7): imported Exercise Packs, their progress and the
 * sessions that run them.
 *
 * A practice service set is a SECOND, fully separate set next to the CS116 one
 * (`createApplicationServices`). It owns its own persistence (the practice database
 * of the scope), lifecycle, operation gate, draft scheduler, session registry and
 * grader registry. It holds NO learning engine, NO meta-progression engine, NO
 * content registry and NO CS116 persistence, so nothing a practice exercise does can
 * reach CS116 attempts, mastery, unlocks, review recommendations or robot rewards -
 * not by configuration, but because those objects do not exist here.
 *
 * Opening an exercise reuses `openResolvedMissionSession` (M7.0) with an explicit
 * practice dependency set. Its Submit callback is `recordPracticeAttempt` below,
 * which writes the attempt to the practice database and does nothing else; there is
 * no default callback to fall back on.
 *
 * Every imported exercise runs on `core.pyodide`. This module never constructs a
 * Local Python runtime and has no import of one.
 *
 * Security: an imported pack is trusted-personal content the learner chose to
 * import. Nothing in it is executed on import; its starter code runs only when the
 * learner presses Run or Submit; its `referenceSolution` is never executed here.
 */

// ------------------------------------------------------------------ public types

export type PracticeDifficulty = "easy" | "normal" | "hard";

/**
 * `completed` is null when the progress could not be read (storage error). Null is
 * "unknown", never "zero": a screen must say the progress is unavailable instead of
 * showing 0 completed.
 */
export interface PracticeProgressSummary {
  readonly completed: number | null;
  readonly total: number;
}

export interface PracticePackSummary {
  readonly packId: string;
  readonly version: string;
  readonly title: string;
  readonly description: string;
  readonly topic: string;
  readonly tags: readonly string[];
  readonly exerciseCount: number;
  readonly installedAt: string;
  readonly progress: PracticeProgressSummary;
}

/** A stored pack that failed re-validation on read; listed so it is never silently missing. */
export interface PracticeCorruptPack {
  readonly packId: string;
  readonly installedAt: string;
}

export interface PracticeExerciseSummary {
  readonly exerciseId: string;
  readonly activityId: LearningActivityId;
  readonly kind: PackExercise["kind"];
  readonly title: string;
  readonly difficulty: PracticeDifficulty;
  readonly revision: number;
  /** A passed attempt exists for this exercise's CURRENT revision; null = progress could not be read. */
  readonly completed: boolean | null;
  /** Submitted attempts (any revision) for this exercise; null = progress could not be read. */
  readonly attemptCount: number | null;
}

export interface PracticePackDetail extends PracticePackSummary {
  readonly learningObjectives: readonly string[];
  readonly prerequisites: readonly string[];
  /** In authored order. */
  readonly exercises: readonly PracticeExerciseSummary[];
}

export interface PracticeExerciseDetail extends PracticeExerciseSummary {
  readonly packId: string;
  readonly packTitle: string;
  readonly instructions: string;
  /** `debug` exercises only. */
  readonly symptom?: string;
  readonly datasets: readonly { readonly filename: string; readonly description?: string }[];
  readonly feedback: { readonly onPass?: string; readonly onFail?: string };
  readonly explanation?: string;
  /** Shown only after a pass; never executed by the app. */
  readonly referenceSolution?: string;
  readonly previousExerciseId: string | null;
  readonly nextExerciseId: string | null;
}

export type PracticeReadErrorCode =
  | "NOT_FOUND"
  | "CORRUPT"
  | "STORAGE_UNAVAILABLE"
  | "UPGRADE_BLOCKED"
  | "RETIRED";

export interface PracticeReadError {
  readonly code: PracticeReadErrorCode;
  readonly message: string;
}

export type PracticeReadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: PracticeReadError };

export interface PracticeCatalog {
  readonly packs: readonly PracticePackSummary[];
  readonly corrupt: readonly PracticeCorruptPack[];
  /** Rows the store could not even parse. */
  readonly unreadableCount: number;
}

/** Outcome of an install request. It is never an exception. */
export type InstallPracticePackOutcome =
  | { readonly status: "installed"; readonly pack: PracticePackSummary }
  | { readonly status: "already-installed"; readonly pack: PracticePackSummary }
  | { readonly status: "rejected"; readonly issues: readonly ExercisePackIssue[] }
  | { readonly status: "conflict"; readonly packId: string; readonly existingVersion: string | null; readonly message: string }
  | { readonly status: "limit-reached"; readonly limit: number; readonly message: string }
  | { readonly status: "storage-unavailable"; readonly message: string }
  | { readonly status: "upgrade-blocked"; readonly message: string }
  | { readonly status: "retired"; readonly message: string };

export interface CreatePracticeSessionOptions {
  /** false: ignore the stored draft (it is kept until the new code is typed). Default true. */
  readonly resumeDraft?: boolean;
  /** true: start again from the starter code even if a draft exists. */
  readonly resetCode?: boolean;
}

export interface CreatePracticeServicesOptions {
  /** Same meaning as for the CS116 set: an opaque storage namespace. Omitted = Guest. */
  readonly scope?: PersistenceScope;
}

export interface PracticeDisposalResult {
  readonly status: "disposed" | "incomplete";
  readonly reason?: "DRAIN_TIMEOUT" | "RESOURCE_CLEANUP_FAILED";
  readonly persistence?: "closed" | "closed-pending-open" | "open" | "unknown";
  readonly pendingDurableOperations?: number;
  readonly failures?: readonly ApplicationDisposalFailure[];
}

export interface PracticeServices {
  /** Pure and synchronous: used to preview a pasted pack before installing it. */
  validatePack: typeof validateExercisePack;
  /** Validates, then installs durably. Never rejects. */
  installPack(text: string): Promise<InstallPracticePackOutcome>;
  listPacks(): Promise<PracticeReadResult<PracticeCatalog>>;
  getPack(packId: string): Promise<PracticeReadResult<PracticePackDetail>>;
  getExercise(packId: string, exerciseId: string): Promise<PracticeReadResult<PracticeExerciseDetail>>;
  /** Never rejects; returns an error result instead (including after retirement). */
  createExerciseSession(
    packId: string,
    exerciseId: string,
    options?: CreatePracticeSessionOptions,
  ): Promise<CreateMissionSessionResult>;
  getPersistenceKind(): "indexeddb" | "memory";
  getLifecycleState(): ApplicationLifecycleState;
  subscribeLifecycle(listener: () => void): () => void;
  /** Retires and drains this set, then closes its persistence. Idempotent; never rejects. */
  dispose(options?: DisposeApplicationServicesOptions): Promise<PracticeDisposalResult>;
}

// ------------------------------------------------------------------ implementation

const DIFFICULTY_LABELS: ReadonlySet<string> = new Set(["easy", "normal", "hard"]);

interface LoadedPack {
  readonly record: PracticePackRecord;
  readonly pack: ExercisePack;
}

type LoadPackResult =
  | { readonly ok: true; readonly loaded: LoadedPack }
  | { readonly ok: false; readonly error: PracticeReadError };

/**
 * Test seam: lets a test supply its own persistence. Production code never passes it.
 */
export interface PracticeServicesInternals {
  readonly persistence?: PracticePersistence;
}

export function createPracticeServices(
  options: CreatePracticeServicesOptions = {},
  internals: PracticeServicesInternals = {},
): PracticeServices {
  // Created first so an invalid scope throws before anything else; opens no IndexedDB.
  const persistence = internals.persistence ?? createBrowserPracticePersistence(options.scope);

  const lifecycle = new ApplicationLifecycle();
  const gate = new OperationGate();
  const sessions = new MissionSessionRegistry();
  const drafts = new MissionDraftScheduler(persistence, lifecycle, undefined, gate);
  const graders = new GraderRegistry();
  registerCoreGraders(graders);

  let disposal: Promise<PracticeDisposalResult> | null = null;
  let disposed: PracticeDisposalResult | null = null;

  const retiredError = (): PracticeReadError => ({
    code: "RETIRED",
    message: "Phiên dữ liệu luyện tập này đã đóng. Hãy tải lại trang.",
  });

  function mapStorageError(error: unknown): PracticeReadError {
    if (isApplicationServicesRetiredError(error) || error instanceof PersistenceClosedError) return retiredError();
    if (error instanceof PersistenceUpgradeBlockedError) {
      return {
        code: "UPGRADE_BLOCKED",
        message: "Kho dữ liệu luyện tập đang bị một tab khác của ứng dụng chặn khi nâng cấp. Hãy đóng các tab khác rồi tải lại trang.",
      };
    }
    return {
      code: "STORAGE_UNAVAILABLE",
      message: "Không đọc được kho lưu trữ bền vững của phần luyện tập. Trình duyệt có thể đang chặn IndexedDB (ví dụ chế độ riêng tư).",
    };
  }

  /**
   * Every read validates the stored document again. There is deliberately NO cache:
   * a cache keyed by the row's own metadata (packId + contentHash) would keep serving
   * the old content after the document in IndexedDB was modified without changing that
   * metadata. The stored document must be a valid pack, be the pack it claims to be,
   * and hash (computed here, from the document) to the hash it was stored with;
   * otherwise the row is damaged and is never used - and never repaired or overwritten.
   */
  function revalidate(record: PracticePackRecord): ExercisePack | null {
    const result = validateExercisePack(record.document);
    if (!result.ok || result.contentHash !== record.contentHash || result.pack.pack.id !== record.packId) {
      return null;
    }
    return result.pack;
  }

  async function loadPack(packId: string): Promise<LoadPackResult> {
    if (!lifecycle.isActive()) return { ok: false, error: retiredError() };
    let record: PracticePackRecord | null;
    try {
      record = await persistence.getPracticePack(packId);
    } catch (error) {
      if (error instanceof Error && error.name === "InvalidPracticePackRecordError") {
        return { ok: false, error: { code: "CORRUPT", message: "Pack này đã bị hỏng trong kho lưu trữ nên không thể mở." } };
      }
      return { ok: false, error: mapStorageError(error) };
    }
    if (!lifecycle.isActive()) return { ok: false, error: retiredError() };
    if (record === null) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Không tìm thấy pack này. Có thể nó chưa được cài đặt." } };
    }
    const pack = revalidate(record);
    if (pack === null) {
      return { ok: false, error: { code: "CORRUPT", message: "Pack này đã bị hỏng trong kho lưu trữ nên không thể mở." } };
    }
    return { ok: true, loaded: { record, pack } };
  }

  /** Per activity: attempts and whether the CURRENT revision has a passed attempt. */
  type ProgressMap = ReadonlyMap<string, { attempts: number; passedRevisions: ReadonlySet<number> }>;
  /** null = the attempts could not be read. It is never an empty map. */
  type ProgressRead = ProgressMap | null;

  async function readProgress(): Promise<ProgressMap> {
    const attempts = await persistence.getAttempts();
    const byActivity = new Map<string, { attempts: number; passedRevisions: Set<number> }>();
    for (const attempt of attempts) {
      const entry = byActivity.get(attempt.activityId) ?? { attempts: 0, passedRevisions: new Set<number>() };
      entry.attempts += 1;
      if (attempt.passed) entry.passedRevisions.add(attempt.missionTemplateVersion);
      byActivity.set(attempt.activityId, entry);
    }
    return byActivity;
  }

  function summarizeExercise(
    pack: ExercisePack,
    exercise: PackExercise,
    progress: ProgressRead,
  ): PracticeExerciseSummary {
    const activityId = practiceActivityId(pack.pack.id, exercise.id);
    const entry = progress?.get(activityId);
    return {
      exerciseId: exercise.id,
      activityId,
      kind: exercise.kind,
      title: exercise.title,
      difficulty: DIFFICULTY_LABELS.has(exercise.difficulty) ? exercise.difficulty : "normal",
      revision: exercise.revision,
      completed: progress === null ? null : (entry?.passedRevisions.has(exercise.revision) ?? false),
      attemptCount: progress === null ? null : (entry?.attempts ?? 0),
    };
  }

  function summarizePack(
    record: PracticePackRecord,
    pack: ExercisePack,
    progress: ProgressRead,
  ): PracticePackSummary & { readonly exercises: readonly PracticeExerciseSummary[] } {
    const exercises = pack.exercises.map((exercise) => summarizeExercise(pack, exercise, progress));
    return {
      packId: pack.pack.id,
      version: pack.pack.version,
      title: pack.pack.title,
      description: pack.pack.description,
      topic: pack.pack.topic,
      tags: pack.pack.tags,
      exerciseCount: exercises.length,
      installedAt: record.installedAt,
      progress: {
        completed: progress === null ? null : exercises.filter((exercise) => exercise.completed === true).length,
        total: exercises.length,
      },
      exercises,
    };
  }

  /**
   * Progress is secondary to content: an unreadable attempts store must not hide the
   * packs. But it is never reported as "nothing done": null marks progress as unknown.
   */
  async function safeProgress(): Promise<ProgressRead> {
    try {
      return await readProgress();
    } catch (error) {
      console.error("Practice progress could not be read.", error);
      return null;
    }
  }

  // ---------------------------------------------------------------- install

  async function installPack(text: string): Promise<InstallPracticePackOutcome> {
    if (!lifecycle.isActive()) return { status: "retired", message: retiredError().message };
    const validation = validateExercisePack(text);
    if (!validation.ok) return { status: "rejected", issues: validation.issues };

    const record: PracticePackRecord = {
      packId: validation.pack.pack.id,
      packVersion: validation.pack.pack.version,
      contentHash: validation.contentHash,
      installedAt: new Date().toISOString(),
      document: validation.pack as unknown as JsonObject,
    };
    try {
      // Admitted as a durable operation: a retirement drains it instead of cutting it off.
      const result = await lifecycle.runDurable(() => persistence.installPracticePackIfAbsent(record));
      // Progress is read, not assumed: a re-installed id may already have attempts, and an
      // unreadable attempts store yields null ("unknown"), never a made-up zero.
      const summary = async (): Promise<PracticePackSummary> => {
        const { exercises: _exercises, ...rest } = summarizePack(record, validation.pack, await safeProgress());
        return rest;
      };
      switch (result.status) {
        case "installed":
          return { status: "installed", pack: await summary() };
        case "already-installed":
          return { status: "already-installed", pack: await summary() };
        case "conflict":
          return {
            status: "conflict",
            packId: record.packId,
            existingVersion: result.existingPackVersion,
            message:
              `Đã có một pack khác với mã "${record.packId}"` +
              (result.existingPackVersion !== null ? ` (phiên bản ${result.existingPackVersion})` : "") +
              ". Ứng dụng không ghi đè pack đã cài; hãy đổi mã pack nếu đây là một pack mới. Cập nhật pack sẽ được hỗ trợ sau.",
          };
        case "limit-reached":
          return {
            status: "limit-reached",
            limit: result.limit,
            message: `Đã cài tối đa ${result.limit} pack. Hiện chưa có chức năng gỡ pack.`,
          };
      }
    } catch (error) {
      const mapped = mapStorageError(error);
      if (mapped.code === "RETIRED") return { status: "retired", message: mapped.message };
      if (mapped.code === "UPGRADE_BLOCKED") return { status: "upgrade-blocked", message: mapped.message };
      return {
        status: "storage-unavailable",
        message:
          "Không thể cài đặt: pack chỉ được lưu vào kho bền vững của trình duyệt (IndexedDB) và kho này đang không dùng được. Không có gì được lưu.",
      };
    }
  }

  // ---------------------------------------------------------------- reads

  async function listPacks(): Promise<PracticeReadResult<PracticeCatalog>> {
    if (!lifecycle.isActive()) return { ok: false, error: retiredError() };
    try {
      const listing = await persistence.listPracticePacks();
      if (!lifecycle.isActive()) return { ok: false, error: retiredError() };
      const progress = await safeProgress();
      const packs: PracticePackSummary[] = [];
      const corrupt: PracticeCorruptPack[] = [];
      for (const record of listing.records) {
        const pack = revalidate(record);
        if (pack === null) {
          corrupt.push({ packId: record.packId, installedAt: record.installedAt });
          continue;
        }
        const { exercises: _exercises, ...summary } = summarizePack(record, pack, progress);
        packs.push(summary);
      }
      return { ok: true, value: { packs, corrupt, unreadableCount: listing.unreadableCount } };
    } catch (error) {
      return { ok: false, error: mapStorageError(error) };
    }
  }

  async function getPack(packId: string): Promise<PracticeReadResult<PracticePackDetail>> {
    const loaded = await loadPack(packId);
    if (!loaded.ok) return loaded;
    const { record, pack } = loaded.loaded;
    const progress = await safeProgress();
    const summary = summarizePack(record, pack, progress);
    return {
      ok: true,
      value: {
        ...summary,
        learningObjectives: pack.pack.learningObjectives,
        prerequisites: pack.pack.prerequisites,
      },
    };
  }

  async function getExercise(packId: string, exerciseId: string): Promise<PracticeReadResult<PracticeExerciseDetail>> {
    const loaded = await loadPack(packId);
    if (!loaded.ok) return loaded;
    const { pack } = loaded.loaded;
    const index = pack.exercises.findIndex((exercise) => exercise.id === exerciseId);
    if (index < 0) {
      return { ok: false, error: { code: "NOT_FOUND", message: "Không tìm thấy bài này trong pack." } };
    }
    const exercise = pack.exercises[index]!;
    const progress = await safeProgress();
    const summary = summarizeExercise(pack, exercise, progress);
    return {
      ok: true,
      value: {
        ...summary,
        packId: pack.pack.id,
        packTitle: pack.pack.title,
        instructions: exercise.instructions,
        ...(exercise.kind === "debug" && exercise.symptom !== undefined ? { symptom: exercise.symptom } : {}),
        datasets: (exercise.datasets ?? []).map((dataset) => ({
          filename: dataset.filename,
          ...(dataset.description !== undefined ? { description: dataset.description } : {}),
        })),
        feedback: { ...(exercise.feedback ?? {}) },
        ...(exercise.explanation !== undefined ? { explanation: exercise.explanation } : {}),
        ...(exercise.referenceSolution !== undefined ? { referenceSolution: exercise.referenceSolution } : {}),
        previousExerciseId: index > 0 ? pack.exercises[index - 1]!.id : null,
        nextExerciseId: index < pack.exercises.length - 1 ? pack.exercises[index + 1]!.id : null,
      },
    };
  }

  // ---------------------------------------------------------------- sessions

  /** Reads the stored draft after every draft write already accepted for the activity has finished. */
  function readExerciseDraft(activityId: LearningActivityId) {
    return gate.runShared(async () => {
      await drafts.settled(activityId);
      return persistence.getMissionDraft(activityId);
    });
  }

  /**
   * THE practice Submit callback: one attempt, one store. It is called by
   * `openResolvedMissionSession` from inside an operation that is already admitted
   * to this set's lifecycle and holds this set's gate shared, so it uses the
   * ungated base path. It writes the practice database only - there is no learning
   * engine, no reward engine and no CS116 persistence in this module to call.
   */
  async function recordPracticeAttempt(record: Parameters<PracticePersistence["addAttempt"]>[0]): Promise<void> {
    await persistence.addAttempt(record);
  }

  async function openExerciseSession(
    packId: string,
    exerciseId: string,
    sessionOptions: CreatePracticeSessionOptions,
    requested: MissionOpening | null,
  ): Promise<CreateMissionSessionResult> {
    const loaded = await loadPack(packId);
    if (!loaded.ok) {
      if (loaded.error.code === "RETIRED") return retiredFailure();
      return failure(
        loaded.error.code === "NOT_FOUND" ? "PRACTICE_PACK_NOT_FOUND" : `PRACTICE_${loaded.error.code}`,
        loaded.error.message,
      );
    }
    const pack = loaded.loaded.pack;
    const exercise = pack.exercises.find((candidate) => candidate.id === exerciseId);
    if (exercise === undefined) {
      return failure("PRACTICE_EXERCISE_NOT_FOUND", "Không tìm thấy bài này trong pack.");
    }

    let adapted: AdaptedExercise;
    try {
      adapted = adaptExercise(pack, exercise);
    } catch {
      return failure("PRACTICE_EXERCISE_INVALID", "Bài này không thể chuyển thành nhiệm vụ chạy được. Pack có thể đã bị hỏng.");
    }
    if (adapted.template.runtime.id !== CORE_RUNTIME_ID.PYODIDE) {
      // Unreachable by construction; asserted because imported content must never leave Pyodide.
      return failure("RUNTIME_UNSUPPORTED", "Bài luyện tập chỉ chạy bằng Pyodide trong trình duyệt.");
    }

    // Read-your-writes: the final save of the session the learner just left lands before this read.
    let storedDraft = null;
    if (sessionOptions.resumeDraft !== false) {
      try {
        storedDraft = await readExerciseDraft(adapted.activity.id);
      } catch (error) {
        if (!lifecycle.isActive() || isApplicationServicesRetiredError(error)) return retiredFailure();
        // A draft that cannot be READ is not "no draft": opening from the starter code would let
        // the first autosave overwrite the stored draft. Report the storage error instead.
        const mapped = mapStorageError(error);
        return failure(`PRACTICE_${mapped.code}`, mapped.message);
      }
    }
    if (!lifecycle.isActive()) return retiredFailure();

    const runtime = createPyodideRuntimeManager({ executionTimeoutMs: pyodideExecutionTimeoutMs(adapted.template) });
    // No `await` separates the last `isActive()` check above from this call, and the helper
    // awaits nothing before it tracks the load, so a load can only start while active.
    return openResolvedMissionSession(
      { lifecycle, gate, drafts, sessions, graders, recordSubmittedAttempt: recordPracticeAttempt },
      {
        activity: adapted.activity,
        template: adapted.template,
        instance: adapted.instance,
        seed: adapted.seed,
        variantIndex: 0,
        hintSet: adapted.hintSet,
        runtime,
        storedDraft,
        resetCode: Boolean(sessionOptions.resetCode),
        // Taken at the request boundary; the fallback is unreachable (ids that cannot form an activity id
        // never get past loadPack) and only keeps the type total.
        opening: requested ?? drafts.beginOpening(adapted.activity.id),
      },
    );
  }

  async function createExerciseSession(
    packId: string,
    exerciseId: string,
    sessionOptions: CreatePracticeSessionOptions = {},
  ): Promise<CreateMissionSessionResult> {
    if (!lifecycle.isActive()) return retiredFailure();
    // The opening ticket is taken NOW, synchronously, before the first await (M7-R2).
    let requested: MissionOpening | null = null;
    try {
      requested = drafts.beginOpening(practiceActivityId(packId, exerciseId));
    } catch {
      // Malformed ids: the pack lookup reports them exactly as before.
    }
    try {
      return await openExerciseSession(packId, exerciseId, sessionOptions, requested);
    } catch (error) {
      if (!lifecycle.isActive()) return retiredFailure();
      console.error("Practice session could not be created.", error);
      return failure("PRACTICE_SESSION_UNAVAILABLE", "Không thể mở bài luyện tập lúc này. Hãy tải lại trang để thử lại.");
    }
  }

  // ---------------------------------------------------------------- disposal

  async function closePersistence(): Promise<{
    readonly state: "closed" | "closed-pending-open" | "open" | "unknown";
    readonly failures: ApplicationDisposalFailure[];
  }> {
    const failures: ApplicationDisposalFailure[] = [];
    try {
      await persistence.close();
    } catch (error) {
      failures.push({ resource: "learning-persistence", error });
    }
    let state: "closed" | "closed-pending-open" | "open" | "unknown";
    try {
      state = persistence.getCloseState();
    } catch (error) {
      state = "unknown";
      failures.push({ resource: "learning-persistence", error });
    }
    if (state === "open" && failures.length === 0) {
      failures.push({
        resource: "learning-persistence",
        error: new Error("close() resolved but the practice persistence still reports an open connection."),
      });
    }
    return { state, failures };
  }

  async function drainAndClose(timeoutMs: number): Promise<PracticeDisposalResult> {
    const drained = await lifecycle.waitForDrain(timeoutMs);
    if (!drained) {
      lifecycle.markDrainIncomplete();
      const ownedFailures = sessions.getUnresolvedFailures();
      return Object.freeze({
        status: "incomplete",
        reason: "DRAIN_TIMEOUT",
        pendingDurableOperations: lifecycle.getPendingDurableOperationCount(),
        ...(ownedFailures.length > 0 ? { failures: Object.freeze([...ownedFailures]) } : {}),
      });
    }
    const closed = await closePersistence();
    const failures = [...sessions.getUnresolvedFailures(), ...closed.failures];
    if (failures.length > 0) {
      lifecycle.markCleanupFailed();
      return Object.freeze({
        status: "incomplete",
        reason: "RESOURCE_CLEANUP_FAILED",
        persistence: closed.state,
        failures: Object.freeze(failures),
      });
    }
    // The practice set owns no meta-progression store, so no connection exists for that slot.
    lifecycle.markDisposed({
      learning: closed.state as "closed" | "closed-pending-open",
      metaProgression: "closed",
    });
    return Object.freeze({ status: "disposed", persistence: closed.state });
  }

  return {
    validatePack: validateExercisePack,
    installPack,
    listPacks,
    getPack,
    getExercise,
    createExerciseSession,

    getPersistenceKind() {
      return persistence.kind;
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

export { ApplicationServicesRetiredError, parsePracticeActivityId };
