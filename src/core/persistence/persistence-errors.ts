/**
 * Expected, domain-level persistence outcomes.
 *
 * These are NOT storage failures. ResilientLearningPersistence must rethrow
 * them to the caller instead of switching to in-memory persistence, otherwise a
 * perfectly healthy IndexedDB database would be abandoned (and its records
 * hidden) because of a caller-side condition such as a duplicate attempt id.
 *
 * The same rule covers conditions that must stay VISIBLE rather than be hidden
 * behind a volatile fallback: a blocked/unsupported schema upgrade and an
 * import that cannot be made durable.
 */
export class PersistenceDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceDomainError";
  }
}

/** `addAttempt` was called with an attempt id that is already stored. */
export class DuplicateAttemptError extends PersistenceDomainError {
  readonly attemptId: string;

  constructor(attemptId: string) {
    super(`Attempt already exists: ${attemptId}`);
    this.name = "DuplicateAttemptError";
    this.attemptId = attemptId;
  }
}

/** `addAttemptIfAbsent` was given a record that fails AttemptRecordSchema. */
export class InvalidAttemptRecordError extends PersistenceDomainError {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid AttemptRecord: ${issues.join("; ")}`);
    this.name = "InvalidAttemptRecordError";
    this.issues = issues;
  }
}

/** `importAttemptIfAbsent` was given an origin that is not a known import origin. */
export class InvalidImportOriginError extends PersistenceDomainError {
  constructor() {
    super("Invalid attempt import origin.");
    this.name = "InvalidImportOriginError";
  }
}

/**
 * An import may only be reported as successful if it reached durable storage.
 * Thrown when the store is volatile (memory) or has failed over to memory, or
 * when IndexedDB failed during the import, so an imported attempt is never
 * silently kept only in RAM.
 */
export class ImportRequiresDurableStorageError extends PersistenceDomainError {
  constructor(options?: { readonly cause?: unknown }) {
    super("Imported attempts require durable IndexedDB storage.");
    this.name = "ImportRequiresDurableStorageError";
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

/**
 * The attempt provenance store is missing or holds a row that cannot be
 * trusted, so reward eligibility cannot be decided. Rewards must NOT be
 * computed from unfiltered attempts in this case; the caller sees the failure.
 * Deliberately a domain error: the healthy attempt data is not abandoned for an
 * empty in-memory fallback just because provenance is damaged.
 */
export class AttemptProvenanceUnreadableError extends PersistenceDomainError {
  constructor(options?: { readonly cause?: unknown }) {
    super("Attempt provenance is unreadable; reward eligibility cannot be determined.");
    this.name = "AttemptProvenanceUnreadableError";
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export const PersistenceUpgradeFailureReason = {
  /** Another open connection (typically an old tab) prevents the schema upgrade. */
  BLOCKED: "BLOCKED",
  /** The stored database is a NEWER version than this code understands. */
  VERSION_NEWER_THAN_CODE: "VERSION_NEWER_THAN_CODE",
} as const;

export type PersistenceUpgradeFailureReason =
  (typeof PersistenceUpgradeFailureReason)[keyof typeof PersistenceUpgradeFailureReason];

/**
 * The learning database could not be opened at the schema version this code
 * requires. This is deliberately NOT a silent in-memory fallback: the stored
 * data is intact but unavailable until the blocking tab is closed (or the app
 * is updated), and the caller must be able to observe that.
 */
export class PersistenceUpgradeBlockedError extends PersistenceDomainError {
  readonly reason: PersistenceUpgradeFailureReason;

  constructor(reason: PersistenceUpgradeFailureReason) {
    super(
      reason === PersistenceUpgradeFailureReason.BLOCKED
        ? "IndexedDB upgrade is blocked by another open tab; close other tabs of this app and retry."
        : "IndexedDB holds a newer schema version than this version of the app supports.",
    );
    this.name = "PersistenceUpgradeBlockedError";
    this.reason = reason;
  }
}

/**
 * The persistence instance was closed with `close()` (PHASE-04C.3D.3). Closing is
 * permanent: every later operation rejects with this error, and an operation
 * that was still waiting for its connection when close() ran rejects with it
 * before starting any IndexedDB transaction.
 *
 * A domain error on purpose: an intentional close is never an IndexedDB outage,
 * so ResilientLearningPersistence rethrows it and never fails over to memory.
 */
export class PersistenceClosedError extends PersistenceDomainError {
  constructor() {
    super("Learning persistence has been closed and accepts no further operations.");
    this.name = "PersistenceClosedError";
  }
}
