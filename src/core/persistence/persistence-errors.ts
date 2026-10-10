/**
 * Expected, domain-level persistence outcomes.
 *
 * These are NOT storage failures. ResilientLearningPersistence must rethrow
 * them to the caller instead of switching to in-memory persistence, otherwise a
 * perfectly healthy IndexedDB database would be abandoned (and its records
 * hidden) because of a caller-side condition such as a duplicate attempt id.
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
