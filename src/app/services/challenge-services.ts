import {
  createBrowserChallengePersistence,
  metricDirection,
  orderHistory,
  parseChallengeDefinition,
  scoreSubmission,
  selectBest,
  type ChallengeDefinition,
  type ChallengeIssue,
  type ChallengeMetric,
  type ChallengePersistence,
  type SubmissionRecord,
} from "../../core/challenge";
import { sha256Hex, utf8Bytes } from "../../core/exercise-packs/exercise-pack-hash";
import { PersistenceClosedError, PersistenceUpgradeBlockedError, type PersistenceScope } from "../../core/persistence";
import {
  ApplicationLifecycle,
  isApplicationServicesRetiredError,
  resolveDrainTimeout,
  type ApplicationDisposalFailure,
  type ApplicationLifecycleState,
  type DisposeApplicationServicesOptions,
} from "./application-lifecycle";

/*
 * Challenge services (M13.2): scoring and durable history of Kaggle-style CSV submissions.
 *
 * A THIRD, fully separate service set next to the CS116 one and the Practice one. It owns
 * its own persistence (the challenge database of the scope) and lifecycle, and holds no
 * learning engine, no practice service, no meta-progression engine: nothing a submission
 * does can reach attempts, mastery, unlocks or rewards - those objects do not exist here.
 *
 * Catalog: the challenges are injected. Each entry is a definition plus the PRIVATE solution
 * CSV. The public API exposes metadata only (`ChallengeSummary`); the solution never leaves
 * this module. (A browser-only grader cannot keep the solution secret from someone who opens
 * the dev tools; this is a learning experience, not a secure exam.)
 *
 * Versioning rule: a changed solution, dataset or metric MUST ship as a new `definition.version`.
 * History and best score are always those of the catalog's current (active) version; records of
 * older versions stay in storage untouched and are never mixed in.
 *
 * Submission policy: every successful explicit Submit is one new record, even for an identical
 * CSV. The SHA-256 is stored for traceability, not deduplication. A rejected submission, and a
 * scored one that could not be stored, leave nothing behind.
 */

// ------------------------------------------------------------------ public types

export interface ChallengeCatalogEntry {
  /** Validated at construction with `parseChallengeDefinition`. */
  readonly definition: unknown;
  /** Private ground truth; never exposed. */
  readonly solutionCsv: string;
}

export interface ChallengeSummary {
  readonly id: string;
  readonly version: string;
  readonly title: string;
  readonly metric: ChallengeMetric;
  readonly direction: "lower-is-better" | "higher-is-better";
  readonly idColumn: string;
  readonly targetColumn: string;
  readonly targetType: "numeric" | "categorical";
  readonly limits: { readonly maxSubmissionBytes: number; readonly maxRows: number };
}

/** A stored submission, exactly as persisted. */
export type ChallengeSubmission = SubmissionRecord;

export type ChallengeReadErrorCode = "NOT_FOUND" | "CORRUPT" | "STORAGE_UNAVAILABLE" | "UPGRADE_BLOCKED" | "RETIRED";

export interface ChallengeReadError {
  readonly code: ChallengeReadErrorCode;
  readonly message: string;
}

export type ChallengeReadResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ChallengeReadError };

/** Outcome of `submit`. Never an exception. Only `saved` changed the store. */
export type SubmitChallengeOutcome =
  | { readonly status: "saved"; readonly submission: ChallengeSubmission }
  | { readonly status: "rejected"; readonly issues: readonly ChallengeIssue[] }
  | { readonly status: "not-found"; readonly message: string }
  | { readonly status: "storage-unavailable"; readonly message: string }
  | { readonly status: "upgrade-blocked"; readonly message: string }
  | { readonly status: "retired"; readonly message: string };

export interface CreateChallengeServicesOptions {
  /** Same meaning as for the other sets: an opaque storage namespace. Omitted = Guest. */
  readonly scope?: PersistenceScope;
  readonly catalog: readonly ChallengeCatalogEntry[];
}

export interface ChallengeDisposalResult {
  readonly status: "disposed" | "incomplete";
  readonly reason?: "DRAIN_TIMEOUT" | "RESOURCE_CLEANUP_FAILED";
  readonly persistence?: "closed" | "closed-pending-open" | "open" | "unknown";
  readonly pendingDurableOperations?: number;
  readonly failures?: readonly ApplicationDisposalFailure[];
}

export interface ChallengeServices {
  listChallenges(): ChallengeReadResult<readonly ChallengeSummary[]>;
  getChallenge(challengeId: string): ChallengeReadResult<ChallengeSummary>;
  /** Validates, scores, then stores. A success is reported only after the IndexedDB transaction completed. */
  submit(challengeId: string, submissionCsv: string): Promise<SubmitChallengeOutcome>;
  /** Active version only, newest first. */
  listSubmissions(challengeId: string): Promise<ChallengeReadResult<readonly ChallengeSubmission[]>>;
  /** Active version only; null when there is no submission yet. */
  getBest(challengeId: string): Promise<ChallengeReadResult<ChallengeSubmission | null>>;
  getPersistenceKind(): "indexeddb";
  getLifecycleState(): ApplicationLifecycleState;
  subscribeLifecycle(listener: () => void): () => void;
  /** Retires and drains this set, then closes its persistence. Idempotent; never rejects. */
  dispose(options?: DisposeApplicationServicesOptions): Promise<ChallengeDisposalResult>;
}

/** The catalog itself is wrong. A programming/content error, thrown at construction only. */
export class InvalidChallengeCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidChallengeCatalogError";
  }
}

/** Test seam: production code never passes it. */
export interface ChallengeServicesInternals {
  readonly persistence?: ChallengePersistence;
  readonly now?: () => Date;
  readonly generateId?: () => string;
}

// ------------------------------------------------------------------ implementation

interface CatalogItem {
  readonly definition: ChallengeDefinition;
  readonly solutionCsv: string;
  readonly summary: ChallengeSummary;
}

function defaultSubmissionId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  const random = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sub-${Date.now().toString(36)}-${random}`;
}

function summarize(definition: ChallengeDefinition): ChallengeSummary {
  return Object.freeze({
    id: definition.id,
    version: definition.version,
    title: definition.title,
    metric: definition.metric,
    direction: metricDirection(definition.metric),
    idColumn: definition.idColumn,
    targetColumn: definition.targetColumn,
    targetType: definition.targetType,
    limits: Object.freeze({ ...definition.limits }),
  });
}

function buildCatalog(entries: readonly ChallengeCatalogEntry[]): ReadonlyMap<string, CatalogItem> {
  const items = new Map<string, CatalogItem>();
  for (const entry of entries) {
    const parsed = parseChallengeDefinition(entry.definition);
    if (!parsed.ok) {
      throw new InvalidChallengeCatalogError(`Invalid challenge definition: ${parsed.issues.map((issue) => issue.code).join(", ")}.`);
    }
    if (typeof entry.solutionCsv !== "string") {
      throw new InvalidChallengeCatalogError(`Challenge "${parsed.definition.id}" has no solution CSV.`);
    }
    if (items.has(parsed.definition.id)) {
      throw new InvalidChallengeCatalogError(`Duplicate challenge id "${parsed.definition.id}".`);
    }
    items.set(parsed.definition.id, {
      definition: Object.freeze(structuredClone(parsed.definition)),
      solutionCsv: entry.solutionCsv,
      summary: summarize(parsed.definition),
    });
  }
  return items;
}

export function createChallengeServices(
  options: CreateChallengeServicesOptions,
  internals: ChallengeServicesInternals = {},
): ChallengeServices {
  // Catalog first, then storage: an invalid catalog or scope throws before anything opens IndexedDB.
  const catalog = buildCatalog(options.catalog);
  const persistence = internals.persistence ?? createBrowserChallengePersistence(options.scope);
  const now = internals.now ?? (() => new Date());
  const generateId = internals.generateId ?? defaultSubmissionId;

  const lifecycle = new ApplicationLifecycle();
  let disposal: Promise<ChallengeDisposalResult> | null = null;
  let disposed: ChallengeDisposalResult | null = null;

  const retiredError = (): ChallengeReadError => ({
    code: "RETIRED",
    message: "Phiên dữ liệu thử thách này đã đóng. Hãy tải lại trang.",
  });

  const notFound = (): ChallengeReadError => ({ code: "NOT_FOUND", message: "Không tìm thấy thử thách này." });

  function mapStorageError(error: unknown): ChallengeReadError {
    if (isApplicationServicesRetiredError(error) || error instanceof PersistenceClosedError) return retiredError();
    if (error instanceof PersistenceUpgradeBlockedError) {
      return {
        code: "UPGRADE_BLOCKED",
        message: "Kho dữ liệu thử thách đang bị một tab khác của ứng dụng chặn khi nâng cấp. Hãy đóng các tab khác rồi tải lại trang.",
      };
    }
    if (error instanceof Error && error.name === "ChallengeStorageUnreadableError") {
      return { code: "CORRUPT", message: "Dữ liệu bài nộp đã lưu bị hỏng nên không thể đọc." };
    }
    return {
      code: "STORAGE_UNAVAILABLE",
      message: "Không đọc được kho lưu trữ bền vững của thử thách. Trình duyệt có thể đang chặn IndexedDB (ví dụ chế độ riêng tư).",
    };
  }

  // ---------------------------------------------------------------- catalog (synchronous, no storage)

  function listChallenges(): ChallengeReadResult<readonly ChallengeSummary[]> {
    if (!lifecycle.isActive()) return { ok: false, error: retiredError() };
    return { ok: true, value: [...catalog.values()].map((item) => item.summary) };
  }

  function getChallenge(challengeId: string): ChallengeReadResult<ChallengeSummary> {
    if (!lifecycle.isActive()) return { ok: false, error: retiredError() };
    const item = catalog.get(challengeId);
    return item === undefined ? { ok: false, error: notFound() } : { ok: true, value: item.summary };
  }

  // ---------------------------------------------------------------- history

  /** Admitted as a durable operation, so a retirement drains an in-flight read instead of cutting it off. */
  async function readRecords(item: CatalogItem): Promise<ChallengeReadResult<SubmissionRecord[]>> {
    try {
      const records = await lifecycle.runDurable(() =>
        persistence.listSubmissions(item.definition.id, item.definition.version),
      );
      return { ok: true, value: records };
    } catch (error) {
      return { ok: false, error: mapStorageError(error) };
    }
  }

  async function listSubmissions(challengeId: string): Promise<ChallengeReadResult<readonly ChallengeSubmission[]>> {
    if (!lifecycle.isActive()) return { ok: false, error: retiredError() };
    const item = catalog.get(challengeId);
    if (item === undefined) return { ok: false, error: notFound() };
    const read = await readRecords(item);
    return read.ok ? { ok: true, value: orderHistory(item.definition, read.value) } : read;
  }

  async function getBest(challengeId: string): Promise<ChallengeReadResult<ChallengeSubmission | null>> {
    if (!lifecycle.isActive()) return { ok: false, error: retiredError() };
    const item = catalog.get(challengeId);
    if (item === undefined) return { ok: false, error: notFound() };
    const read = await readRecords(item);
    return read.ok ? { ok: true, value: selectBest(item.definition, read.value) } : read;
  }

  // ---------------------------------------------------------------- submit

  async function submit(challengeId: string, submissionCsv: string): Promise<SubmitChallengeOutcome> {
    if (!lifecycle.isActive()) return { status: "retired", message: retiredError().message };
    const item = catalog.get(challengeId);
    if (item === undefined) return { status: "not-found", message: notFound().message };
    if (typeof submissionCsv !== "string") {
      return {
        status: "rejected",
        issues: [{ code: "EMPTY_FILE", message: "Chưa có nội dung bài nộp." }],
      };
    }

    // Pure and synchronous: nothing is stored unless it succeeds.
    const scored = scoreSubmission(item.definition, item.solutionCsv, submissionCsv);
    if (!scored.ok) return { status: "rejected", issues: scored.issues };

    const record: SubmissionRecord = {
      id: generateId(),
      challengeId: item.definition.id,
      challengeVersion: item.definition.version,
      metric: scored.metric,
      score: scored.score,
      rowCount: scored.rowCount,
      submittedAt: now().toISOString(),
      submissionSha256: sha256Hex(utf8Bytes(submissionCsv)),
    };

    try {
      // `runDurable` refuses once retirement began (no `await` since the isActive() check above),
      // and counts the write so a disposal drains it instead of cutting it off.
      await lifecycle.runDurable(() => persistence.addSubmission(record));
    } catch (error) {
      const mapped = mapStorageError(error);
      if (mapped.code === "RETIRED") return { status: "retired", message: mapped.message };
      if (mapped.code === "UPGRADE_BLOCKED") return { status: "upgrade-blocked", message: mapped.message };
      return {
        status: "storage-unavailable",
        message:
          "Bài nộp hợp lệ nhưng KHÔNG được lưu: kho lưu trữ bền vững của trình duyệt (IndexedDB) đang không dùng được. Hãy thử nộp lại sau.",
      };
    }
    return { status: "saved", submission: record };
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
        error: new Error("close() resolved but the challenge persistence still reports an open connection."),
      });
    }
    return { state, failures };
  }

  async function drainAndClose(timeoutMs: number): Promise<ChallengeDisposalResult> {
    const drained = await lifecycle.waitForDrain(timeoutMs);
    if (!drained) {
      lifecycle.markDrainIncomplete();
      return Object.freeze({
        status: "incomplete",
        reason: "DRAIN_TIMEOUT",
        pendingDurableOperations: lifecycle.getPendingDurableOperationCount(),
      });
    }
    const closed = await closePersistence();
    if (closed.failures.length > 0) {
      lifecycle.markCleanupFailed();
      return Object.freeze({
        status: "incomplete",
        reason: "RESOURCE_CLEANUP_FAILED",
        persistence: closed.state,
        failures: Object.freeze(closed.failures),
      });
    }
    // The shared lifecycle type has two slots: this set has one database and no reward store.
    lifecycle.markDisposed({
      learning: closed.state as "closed" | "closed-pending-open",
      metaProgression: "closed",
    });
    return Object.freeze({ status: "disposed", persistence: closed.state });
  }

  return {
    listChallenges,
    getChallenge,
    submit,
    listSubmissions,
    getBest,

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
