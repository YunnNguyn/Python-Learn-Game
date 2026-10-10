import { AttemptRecordSchema, type AttemptRecord } from "../domain";
import { InvalidAttemptRecordError } from "./persistence-errors";

/**
 * Pure helpers for `addAttemptIfAbsent`. They never touch storage, so every
 * persistence implementation shares identical validation and comparison rules.
 */

/** Validates an incoming record with the existing schema (no coercion of the contract). */
export function parseAttemptForImport(record: unknown): AttemptRecord {
  const result = AttemptRecordSchema.safeParse(record);
  if (!result.success) {
    throw new InvalidAttemptRecordError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    );
  }
  return result.data;
}

/**
 * Decides whether a stored value with the same id is the same persisted content.
 * A stored value that no longer satisfies the schema can never be proven
 * equivalent, so it is reported as a conflict (and, by callers, left untouched).
 */
export function classifyStoredAttempt(
  incoming: AttemptRecord,
  stored: unknown,
): "exists" | "conflict" {
  const parsedStored = AttemptRecordSchema.safeParse(stored);
  if (!parsedStored.success) return "conflict";
  return canonicalJson(incoming) === canonicalJson(parsedStored.data) ? "exists" : "conflict";
}

/** Key-order-insensitive serialization; `undefined` properties are ignored. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalize(entry)] as const);
    return Object.fromEntries(entries);
  }
  return value;
}
