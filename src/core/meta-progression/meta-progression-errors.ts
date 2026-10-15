import { PersistenceDomainError } from "../persistence/persistence-errors";

export const MetaProgressionStateUnreadableReason = {
  /** A stored progression record exists but fails MetaProgressionStateSchema (or is not a record at all). */
  MALFORMED_STATE: "MALFORMED_STATE",
  /** The database exists at the expected version but its progression store is missing. */
  MISSING_STORE: "MISSING_STORE",
} as const;

export type MetaProgressionStateUnreadableReason =
  (typeof MetaProgressionStateUnreadableReason)[keyof typeof MetaProgressionStateUnreadableReason];

/**
 * Saved reward/workshop state exists but cannot be trusted (PHASE-04C.3D.4).
 *
 * FAIL CLOSED: it is never replaced by an empty profile, because reconciliation
 * would then re-grant every reward and the next save would overwrite the stored
 * record - erasing built robot parts and the evidence of what was spent. The
 * stored record is left exactly as it is.
 *
 * A domain error on purpose: a damaged record is not an IndexedDB outage, so no
 * wrapper may answer it by switching to a volatile in-memory store.
 */
export class MetaProgressionStateUnreadableError extends PersistenceDomainError {
  readonly reason: MetaProgressionStateUnreadableReason;

  constructor(reason: MetaProgressionStateUnreadableReason, options?: { readonly cause?: unknown }) {
    super(
      reason === MetaProgressionStateUnreadableReason.MISSING_STORE
        ? "The reward progression store is missing; saved rewards cannot be read."
        : "Saved reward progression data is unreadable; it was left untouched.",
    );
    this.name = "MetaProgressionStateUnreadableError";
    this.reason = reason;
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

/**
 * The browser offers no IndexedDB API at all, so rewards cannot be stored
 * durably (PHASE-04C.3D.4-R1). Raised lazily by the first operation - never
 * while the application services are being constructed - so it reaches
 * `initialize()` and the startup failure state instead of crashing rendering.
 *
 * A domain error on purpose: volatile in-memory rewards are never selected as
 * a silent substitute.
 */
export class MetaProgressionStorageUnavailableError extends PersistenceDomainError {
  constructor() {
    super("IndexedDB is not available in this browser; rewards cannot be saved durably.");
    this.name = "MetaProgressionStorageUnavailableError";
  }
}
