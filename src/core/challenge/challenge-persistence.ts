import { z } from "zod";

import { CHALLENGE_METRICS, type ChallengeMetric } from "./challenge-definition";

/*
 * Durable storage contract of Challenge submissions (M13.2).
 *
 * Challenge has its OWN database (`python-learn-game-challenge`), separate from the
 * Learning, Practice and reward databases: nothing a learner submits here can reach
 * attempts, mastery, unlocks or rewards, and clearing one can never clear the other.
 *
 * A record holds the RESULT of a submission, never the submitted CSV and never any
 * solution label. The SHA-256 of the submitted CSV is kept for traceability only; it
 * is not used to deduplicate.
 *
 * Versioning rule: a changed solution, dataset, metric or scoring rule MUST be
 * published as a NEW challenge `version`. Records are grouped by (challengeId,
 * challengeVersion) and scores of different versions are never compared.
 */

export const SubmissionRecordSchema = z
  .strictObject({
    id: z.string().min(1).max(128),
    challengeId: z.string().min(1).max(64),
    challengeVersion: z.string().min(1).max(64),
    metric: z.enum(CHALLENGE_METRICS),
    score: z.number().finite(),
    rowCount: z.number().int().min(1),
    /** UTC instant, e.g. 2026-10-27T10:00:00.000Z. */
    submittedAt: z.iso.datetime(),
    submissionSha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .refine((record) => (record.metric === "accuracy" ? record.score >= 0 && record.score <= 1 : record.score >= 0), {
    path: ["score"],
    message: "score out of range for metric",
  });

export interface SubmissionRecord {
  readonly id: string;
  readonly challengeId: string;
  readonly challengeVersion: string;
  readonly metric: ChallengeMetric;
  readonly score: number;
  readonly rowCount: number;
  readonly submittedAt: string;
  readonly submissionSha256: string;
}

export type ChallengePersistenceCloseState = "open" | "closed" | "closed-pending-open";

export interface ChallengePersistence {
  /** Always "indexeddb": there is deliberately no memory implementation. */
  readonly kind: "indexeddb";
  /**
   * Adds one record in ONE readwrite transaction and resolves only when it has
   * completed. Never overwrites: a record with an existing id rejects. Rejects with
   * InvalidSubmissionRecordError before any storage access when `record` is invalid.
   */
  addSubmission(record: SubmissionRecord): Promise<void>;
  /** Records of one challenge version, in no particular order. Rejects if a stored row is unreadable. */
  listSubmissions(challengeId: string, challengeVersion: string): Promise<SubmissionRecord[]>;
  /** Synchronous and final: a closed instance never opens a connection or starts a transaction. */
  close(): Promise<void>;
  getCloseState(): ChallengePersistenceCloseState;
}

export function parseSubmissionRecord(value: unknown): SubmissionRecord | undefined {
  const parsed = SubmissionRecordSchema.safeParse(value);
  return parsed.success ? (parsed.data as SubmissionRecord) : undefined;
}

/** `addSubmission` was given a record that fails the record schema. */
export class InvalidSubmissionRecordError extends Error {
  constructor() {
    super("Invalid Challenge submission record.");
    this.name = "InvalidSubmissionRecordError";
  }
}

/** A stored row, or the schema itself, cannot be trusted. Reported, never treated as "no submissions". */
export class ChallengeStorageUnreadableError extends Error {
  constructor(options?: { readonly cause?: unknown }) {
    super("Challenge submission storage is unreadable.");
    this.name = "ChallengeStorageUnreadableError";
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

/** IndexedDB is not available at all; nothing was stored or read. */
export class ChallengeStorageUnavailableError extends Error {
  constructor() {
    super("Challenge submissions require IndexedDB, which is not available.");
    this.name = "ChallengeStorageUnavailableError";
  }
}
