import type { AttemptRecord } from "../domain";
import { classifyStoredAttempt } from "../persistence/attempt-import";
import {
  fromSyncAttemptDtoV1,
  toSyncAttemptDtoV1,
  type SyncDtoError,
} from "./sync-attempt-dto";

/**
 * Deterministic merge PLANNING for learning-progress sync. Pure: it reads two
 * in-memory collections and returns a description of how they relate. It never
 * uploads, downloads, writes storage, reloads engines, issues rewards, advances
 * cursors, resolves conflicts or associates records with an account.
 *
 * PRECONDITION (caller's responsibility): `localAttempts` and `remoteDtos`
 * belong to the SAME authenticated account. This module cannot verify
 * ownership. A `local_only` classification is NOT permission to upload: upload
 * additionally requires verified ownership and user consent.
 *
 * Equivalence is the existing full-record contract, reused verbatim from
 * `classifyStoredAttempt` (persistence/attempt-import.ts). The only code here
 * that serializes records is `orderingKey`, which is used for ORDERING ONLY and
 * never to decide equality.
 *
 * Guarantees:
 *  - Records are matched by attempt id only. Two ids for the same activity are
 *    independent attempts and are never merged.
 *  - Same id + equivalent content => `exists`; different content => `conflict`.
 *    No winner is ever chosen (timestamps are never consulted for that).
 *  - Duplicates inside ONE input: identical copies (full-record equivalent) are
 *    coalesced into one entry whose `localCopies` / `remoteCopies` / `copies`
 *    reports the count; differing copies are surfaced as a `conflict` listing
 *    every distinct variant. Nothing is picked.
 *  - Same-id ambiguity: when a rejected record shares an id with valid records
 *    on the same side, that id is a conflict (LOCAL_UNSYNCABLE / REMOTE_INVALID),
 *    never exists/local_only/remote_only. Exception: a rejected REMOTE record with
 *    no valid remote copy of the id leaves a valid local record as `local_only`
 *    with `blockedByInvalidRemote: true` (not uploadable).
 *  - Rejected inputs never disappear: unsyncable local records become
 *    `unsyncable_local`, rejected remote envelopes become `invalid_remote`. They
 *    are never coalesced, and a rejected entry can never overwrite or shadow a
 *    valid one with the same id.
 *  - Output order does not depend on input order (see `planAttemptMerge`).
 *  - Inputs (including deep-frozen ones) are never mutated; returned records are
 *    validated copies that share no references with the inputs.
 *  - Diagnostics carry only paths and zod issue codes, never rejected values.
 */

export const AttemptMergeStatus = {
  LOCAL_ONLY: "local_only",
  REMOTE_ONLY: "remote_only",
  EXISTS: "exists",
  CONFLICT: "conflict",
  UNSYNCABLE_LOCAL: "unsyncable_local",
  INVALID_REMOTE: "invalid_remote",
} as const;

export type AttemptMergeStatus = (typeof AttemptMergeStatus)[keyof typeof AttemptMergeStatus];

export const AttemptConflictReason = {
  /** One local variant and one remote variant share an id but differ in content. */
  CONTENT_MISMATCH: "CONTENT_MISMATCH",
  /** The local input holds several differing records for one id. */
  LOCAL_DUPLICATE_CONFLICT: "LOCAL_DUPLICATE_CONFLICT",
  /** The remote input holds several differing records for one id. */
  REMOTE_DUPLICATE_CONFLICT: "REMOTE_DUPLICATE_CONFLICT",
  /** The local record with this id cannot be represented in DTO V1, so it cannot be proven equivalent. */
  LOCAL_UNSYNCABLE: "LOCAL_UNSYNCABLE",
  /**
   * A remote envelope with this id was rejected while valid remote records with
   * the same id exist. The valid copies are not safely actionable until the
   * rejected one is resolved.
   */
  REMOTE_INVALID: "REMOTE_INVALID",
} as const;

export type AttemptConflictReason =
  (typeof AttemptConflictReason)[keyof typeof AttemptConflictReason];

export interface LocalOnlyEntry {
  readonly status: typeof AttemptMergeStatus.LOCAL_ONLY;
  readonly attemptId: string;
  readonly record: AttemptRecord;
  /** Number of identical local copies coalesced into `record` (>= 1). */
  readonly copies: number;
  /** True when a remote entry with this id was rejected: do not upload until resolved. */
  readonly blockedByInvalidRemote: boolean;
}

export interface RemoteOnlyEntry {
  readonly status: typeof AttemptMergeStatus.REMOTE_ONLY;
  readonly attemptId: string;
  readonly record: AttemptRecord;
  /** Number of identical remote copies coalesced into `record` (>= 1). */
  readonly copies: number;
}

export interface ExistsEntry {
  readonly status: typeof AttemptMergeStatus.EXISTS;
  readonly attemptId: string;
  readonly local: AttemptRecord;
  readonly remote: AttemptRecord;
  readonly localCopies: number;
  readonly remoteCopies: number;
}

export interface ConflictEntry {
  readonly status: typeof AttemptMergeStatus.CONFLICT;
  readonly attemptId: string;
  readonly reasons: readonly AttemptConflictReason[];
  /** Every distinct local variant, in deterministic order. Empty for LOCAL_UNSYNCABLE. */
  readonly local: readonly AttemptRecord[];
  /** Every distinct remote variant, in deterministic order. */
  readonly remote: readonly AttemptRecord[];
}

export interface RejectedEntryBase {
  /**
   * The record id when it could be read safely (printable ASCII, no whitespace,
   * at most 512 chars); otherwise null. No other raw content is ever exposed.
   */
  readonly attemptId: string | null;
  readonly error: SyncDtoError;
}

export interface UnsyncableLocalEntry extends RejectedEntryBase {
  readonly status: typeof AttemptMergeStatus.UNSYNCABLE_LOCAL;
}

export interface InvalidRemoteEntry extends RejectedEntryBase {
  readonly status: typeof AttemptMergeStatus.INVALID_REMOTE;
}

export type AttemptMergeEntry =
  | LocalOnlyEntry
  | RemoteOnlyEntry
  | ExistsEntry
  | ConflictEntry
  | UnsyncableLocalEntry
  | InvalidRemoteEntry;

export interface AttemptMergePlan {
  readonly entries: readonly AttemptMergeEntry[];
  readonly counts: Readonly<Record<AttemptMergeStatus, number>>;
}

/**
 * Compares local AttemptRecords with remote SyncAttemptDtoV1 envelopes.
 *
 * Both inputs are `unknown[]` on purpose: persisted and network data are
 * untrusted, and every item is validated here.
 *
 * Output order (independent of input order):
 *  1. Entries that carry records, by earliest `submittedAt` among their records
 *     (compared by the instant, so different offsets for one instant tie), then by
 *     attempt id.
 *  2. Rejected entries (`unsyncable_local`, `invalid_remote`) come after all of
 *     those, ordered by attempt id (null last), status, error code, issue list
 *     and received version. They have no trustworthy timestamp, hence the fallback.
 *  Two valid entries can never share an id, so the order is total.
 */
export function planAttemptMerge(
  localAttempts: readonly unknown[],
  remoteDtos: readonly unknown[],
): AttemptMergePlan {
  const rejected: Array<UnsyncableLocalEntry | InvalidRemoteEntry> = [];
  const localById = new Map<string, AttemptRecord[]>();
  const remoteById = new Map<string, AttemptRecord[]>();
  const rejectedLocalIds = new Set<string>();
  const rejectedRemoteIds = new Set<string>();

  for (const item of localAttempts) {
    const converted = toSyncAttemptDtoV1(item);
    if (converted.ok) {
      push(localById, converted.value.attempt.id, converted.value.attempt);
      continue;
    }
    // Internal correlation uses the exact original id; public disclosure is gated separately.
    const correlated = correlationId(item);
    if (correlated !== null) rejectedLocalIds.add(correlated);
    rejected.push({
      status: AttemptMergeStatus.UNSYNCABLE_LOCAL,
      attemptId: publicId(correlated),
      error: converted.error,
    });
  }

  for (const item of remoteDtos) {
    const converted = fromSyncAttemptDtoV1(item);
    if (converted.ok) {
      push(remoteById, converted.value.id, converted.value);
      continue;
    }
    const correlated = correlationId(isRecord(item) ? item.attempt : undefined);
    if (correlated !== null) rejectedRemoteIds.add(correlated);
    rejected.push({
      status: AttemptMergeStatus.INVALID_REMOTE,
      attemptId: publicId(correlated),
      error: converted.error,
    });
  }

  const valid: Array<{ entry: AttemptMergeEntry; key: ValidKey }> = [];
  const ids = new Set<string>([...localById.keys(), ...remoteById.keys()]);

  for (const id of ids) {
    const localClasses = groupEquivalent(localById.get(id) ?? []);
    const remoteClasses = groupEquivalent(remoteById.get(id) ?? []);
    const entry = classifyId(
      id,
      localClasses,
      remoteClasses,
      rejectedLocalIds.has(id),
      rejectedRemoteIds.has(id),
    );
    valid.push({ entry, key: validKey(id, [...localClasses, ...remoteClasses]) });
  }

  // Rejected local records reserve their id: a valid remote record with the same
  // id can neither be "remote_only" (importing it would collide) nor be proven
  // equivalent, so classifyId reports it as a LOCAL_UNSYNCABLE conflict.

  valid.sort((left, right) => compareValidKeys(left.key, right.key));
  rejected.sort(compareRejected);

  const entries: AttemptMergeEntry[] = [...valid.map((item) => item.entry), ...rejected];
  const counts: Record<AttemptMergeStatus, number> = {
    local_only: 0,
    remote_only: 0,
    exists: 0,
    conflict: 0,
    unsyncable_local: 0,
    invalid_remote: 0,
  };
  for (const entry of entries) counts[entry.status] += 1;

  return { entries, counts };
}

type EquivalenceClass = readonly AttemptRecord[];

function classifyId(
  id: string,
  localClasses: readonly EquivalenceClass[],
  remoteClasses: readonly EquivalenceClass[],
  localRejectedSameId: boolean,
  remoteRejectedSameId: boolean,
): AttemptMergeEntry {
  const hasLocal = localClasses.length > 0;
  const hasRemote = remoteClasses.length > 0;
  const reasons: AttemptConflictReason[] = [];

  if (localClasses.length > 1) reasons.push(AttemptConflictReason.LOCAL_DUPLICATE_CONFLICT);
  if (remoteClasses.length > 1) reasons.push(AttemptConflictReason.REMOTE_DUPLICATE_CONFLICT);
  // Any rejected local record sharing this id makes the id ambiguous, even with no remote copy.
  if (localRejectedSameId) reasons.push(AttemptConflictReason.LOCAL_UNSYNCABLE);
  // A rejected remote record only becomes an ambiguity when valid remote copies exist.
  // With no valid remote copy it is handled below as a blocked local-only entry.
  if (remoteRejectedSameId && hasRemote) reasons.push(AttemptConflictReason.REMOTE_INVALID);

  if (hasLocal && hasRemote && localClasses.length === 1 && remoteClasses.length === 1) {
    const local = localClasses[0]![0]!;
    const remote = remoteClasses[0]![0]!;
    if (classifyStoredAttempt(local, remote) !== "exists") {
      reasons.push(AttemptConflictReason.CONTENT_MISMATCH);
    }
  }

  if (reasons.length > 0) {
    return {
      status: AttemptMergeStatus.CONFLICT,
      attemptId: id,
      reasons: sortReasons(reasons),
      local: localClasses.map((cls) => cls[0]!),
      remote: remoteClasses.map((cls) => cls[0]!),
    };
  }

  // No reasons here means: at most one equivalence class per side, and when both
  // sides exist they are full-record equivalent.
  if (hasLocal && hasRemote) {
    return {
      status: AttemptMergeStatus.EXISTS,
      attemptId: id,
      local: localClasses[0]![0]!,
      remote: remoteClasses[0]![0]!,
      localCopies: localClasses[0]!.length,
      remoteCopies: remoteClasses[0]!.length,
    };
  }

  if (hasLocal) {
    return {
      status: AttemptMergeStatus.LOCAL_ONLY,
      attemptId: id,
      record: localClasses[0]![0]!,
      copies: localClasses[0]!.length,
      // Remote-side rejection with no valid remote copy: never silently upload.
      blockedByInvalidRemote: remoteRejectedSameId,
    };
  }

  return {
    status: AttemptMergeStatus.REMOTE_ONLY,
    attemptId: id,
    record: remoteClasses[0]![0]!,
    copies: remoteClasses[0]!.length,
  };
}

/**
 * Groups same-id records into full-record-equivalence classes using the shared
 * equivalence helper. Classes are sorted by `orderingKey` of their members so
 * the result does not depend on input order.
 */
function groupEquivalent(records: readonly AttemptRecord[]): EquivalenceClass[] {
  const classes: AttemptRecord[][] = [];
  for (const record of records) {
    const match = classes.find((cls) => classifyStoredAttempt(cls[0]!, record) === "exists");
    if (match) match.push(record);
    else classes.push([record]);
  }
  return classes
    .map((cls) => [...cls].sort(byOrderingKey))
    .sort((left, right) => byOrderingKey(left[0]!, right[0]!));
}

const REASON_ORDER: readonly AttemptConflictReason[] = [
  AttemptConflictReason.CONTENT_MISMATCH,
  AttemptConflictReason.LOCAL_DUPLICATE_CONFLICT,
  AttemptConflictReason.REMOTE_DUPLICATE_CONFLICT,
  AttemptConflictReason.LOCAL_UNSYNCABLE,
  AttemptConflictReason.REMOTE_INVALID,
];

function sortReasons(reasons: readonly AttemptConflictReason[]): AttemptConflictReason[] {
  return REASON_ORDER.filter((reason) => reasons.includes(reason));
}

interface ValidKey {
  readonly ms: number;
  readonly id: string;
}

function validKey(id: string, classes: readonly EquivalenceClass[]): ValidKey {
  let best: AttemptRecord | undefined;
  for (const cls of classes) {
    const candidate = cls[0]!;
    if (best === undefined || compareRecordTime(candidate, best) < 0) best = candidate;
  }
  // Every valid entry holds at least one record, so `best` is always defined.
  return { ms: instantOf(best!.submittedAt), id };
}

/**
 * Orders valid entries by the instant of `submittedAt`, then by attempt id.
 * Two strings that name the same instant with different offsets (for example
 * `...T12:00:00.000+07:00` and `...T05:00:00.000Z`) compare EQUAL on the instant,
 * so the id decides and the raw string never does.
 */
function compareValidKeys(left: ValidKey, right: ValidKey): number {
  return compareNumbers(left.ms, right.ms) || compareStrings(left.id, right.id);
}

function compareRecordTime(left: AttemptRecord, right: AttemptRecord): number {
  return (
    compareNumbers(instantOf(left.submittedAt), instantOf(right.submittedAt)) ||
    byOrderingKey(left, right)
  );
}

/**
 * Epoch milliseconds for a timestamp. The schema accepts only calendar-valid ISO
 * datetimes with an offset, so this is always finite in practice; an unparsable
 * value still maps to +Infinity so ordering stays total and deterministic.
 */
function instantOf(value: string): number {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

function compareNumbers(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareRejected(
  left: UnsyncableLocalEntry | InvalidRemoteEntry,
  right: UnsyncableLocalEntry | InvalidRemoteEntry,
): number {
  if ((left.attemptId === null) !== (right.attemptId === null)) {
    return left.attemptId === null ? 1 : -1;
  }
  return (
    compareStrings(left.attemptId ?? "", right.attemptId ?? "") ||
    compareStrings(left.status, right.status) ||
    compareStrings(left.error.code, right.error.code) ||
    compareStrings(JSON.stringify(left.error.issues), JSON.stringify(right.error.issues)) ||
    compareNumbers(
      left.error.receivedVersion ?? Number.NEGATIVE_INFINITY,
      right.error.receivedVersion ?? Number.NEGATIVE_INFINITY,
    )
  );
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function byOrderingKey(left: AttemptRecord, right: AttemptRecord): number {
  return compareStrings(orderingKey(left), orderingKey(right));
}

/** Key-order-insensitive string used ONLY to order records. Never used for equality. */
function orderingKey(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => compareStrings(left, right))
        .map(([key, entry]) => [key, sortKeys(entry)]),
    );
  }
  return value;
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

const SAFE_ID = /^[\x21-\x7e]{1,512}$/;

/**
 * Exact original id of a rejected record, used ONLY for same-id correlation
 * with valid records. No trimming, case folding, truncation or other
 * normalization: the schema accepts any non-blank string id, so two ids match
 * only when they are identical code-unit sequences. Non-strings yield null.
 */
function correlationId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const id = value.id;
  return typeof id === "string" ? id : null;
}

/**
 * Public diagnostic disclosure: the id is shown only when it is printable ASCII
 * without whitespace and at most 512 characters. Anything else is reported as null.
 */
function publicId(id: string | null): string | null {
  return id !== null && SAFE_ID.test(id) ? id : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
