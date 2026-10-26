import { z } from "zod";

import { JsonObjectSchema, type JsonObject } from "../domain";

/*
 * Durable storage of imported Exercise Packs (PHASE-05-M7).
 *
 * This contract is deliberately separate from `LearningPersistence`: attempts and
 * drafts are per-learner PROGRESS, packs are CONTENT. Keeping them apart means a
 * future "clear practice progress" can never delete an installed pack, and the
 * CS116 persistence classes and every fake of `LearningPersistence` stay unchanged.
 *
 * Only the `practice` database family has the `practicePacks` store. The persistence
 * layer knows packs as opaque validated JSON plus a few indexed fields; parsing the
 * pack schema is the job of `core/exercise-packs`, which also computes
 * `contentHash` - this layer never trusts or recomputes it.
 */

/** Installed packs per practice database, enforced inside the install transaction. */
export const MAX_INSTALLED_PRACTICE_PACKS = 30;

export const PracticePackRecordSchema = z.strictObject({
  packId: z.string().min(1).max(128),
  packVersion: z.string().min(1).max(64),
  /** SHA-256 (hex) of the pack's canonical JSON, computed by the app at validation time. */
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  installedAt: z.iso.datetime({ offset: true }),
  /** The validated pack document. */
  document: JsonObjectSchema,
});

export interface PracticePackRecord {
  readonly packId: string;
  readonly packVersion: string;
  readonly contentHash: string;
  readonly installedAt: string;
  readonly document: JsonObject;
}

/**
 * Outcome of `installPracticePackIfAbsent`. All four are explicit results, never
 * errors and never storage failures; only `installed` changed the store.
 *  - installed:         the pack was newly stored.
 *  - already-installed: the same pack id with identical content is stored (a no-op).
 *  - conflict:          the pack id is stored with DIFFERENT (or unreadable) content;
 *                       nothing was overwritten. Updating a pack is future work.
 *  - limit-reached:     MAX_INSTALLED_PRACTICE_PACKS packs are already installed.
 */
export type InstallPracticePackResult =
  | { readonly status: "installed" }
  | { readonly status: "already-installed" }
  | {
      readonly status: "conflict";
      readonly existingPackVersion: string | null;
      readonly existingContentHash: string | null;
    }
  | { readonly status: "limit-reached"; readonly limit: number };

export interface PracticePackListing {
  /** Readable records, oldest installation first. */
  readonly records: readonly PracticePackRecord[];
  /** Rows that failed the record schema; they are skipped, never repaired or deleted. */
  readonly unreadableCount: number;
}

export interface PracticePackStore {
  /**
   * Durable, atomic, idempotent install: look the id up and add only if absent, in
   * ONE readwrite transaction, so concurrent installs (in this tab or another) are
   * serialized by IndexedDB and can neither corrupt nor double-write the store.
   *
   * Fails closed: rejects with PracticePackRequiresDurableStorageError instead of
   * writing to volatile memory. Rejects with InvalidPracticePackRecordError before
   * any storage access when `record` fails the record schema.
   */
  installPracticePackIfAbsent(record: PracticePackRecord): Promise<InstallPracticePackResult>;
  /** Null when absent. Rejects with InvalidPracticePackRecordError for a stored row that is unreadable. */
  getPracticePack(packId: string): Promise<PracticePackRecord | null>;
  listPracticePacks(): Promise<PracticePackListing>;
}

export function isPracticePackStore(value: unknown): value is PracticePackStore {
  const candidate = value as Partial<PracticePackStore> | null | undefined;
  return (
    typeof candidate?.installPracticePackIfAbsent === "function" &&
    typeof candidate.getPracticePack === "function" &&
    typeof candidate.listPracticePacks === "function"
  );
}

/** Parses a stored or incoming row; undefined when it is not a valid record. */
export function parsePracticePackRecord(value: unknown): PracticePackRecord | undefined {
  const parsed = PracticePackRecordSchema.safeParse(value);
  return parsed.success ? (parsed.data as PracticePackRecord) : undefined;
}
