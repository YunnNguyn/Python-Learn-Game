import {
  IndexedDbLearningPersistence,
  type IndexedDbLearningPersistenceOptions,
} from "./indexeddb-learning-persistence";
import { MemoryLearningPersistence } from "./memory-learning-persistence";
import { ResilientLearningPersistence } from "./resilient-learning-persistence";
import type { LearningPersistence } from "./learning-persistence";
import type { PracticePackStore } from "./practice-pack-store";
import { UnavailablePracticePersistence } from "./unavailable-practice-persistence";
import {
  GUEST_DATABASE_BASE_NAMES,
  GUEST_SCOPE,
  assertLearningDatabaseBaseName,
  resolveScopedDatabaseName,
  type PersistenceScope,
} from "./persistence-scope";

/**
 * `options` is optional; omitting it (every existing caller) opens exactly the
 * original Learning database. Pass `{ databaseBaseName: GUEST_DATABASE_BASE_NAMES.practice }`
 * for the separate practice database.
 */
export function createBrowserLearningPersistence(
  scope: PersistenceScope = GUEST_SCOPE,
  options: IndexedDbLearningPersistenceOptions = {},
): LearningPersistence {
  // Only `undefined` selects the default; null or any other junk is validated (and rejected) below.
  const baseName: unknown =
    options.databaseBaseName === undefined ? GUEST_DATABASE_BASE_NAMES.learning : options.databaseBaseName;
  // Validate first so an invalid base name or scope fails even where IndexedDB is unavailable.
  assertLearningDatabaseBaseName(baseName);
  resolveScopedDatabaseName(baseName, scope);

  if (typeof indexedDB === "undefined") {
    return new MemoryLearningPersistence();
  }

  return new ResilientLearningPersistence(
    new IndexedDbLearningPersistence(indexedDB, scope, { databaseBaseName: baseName }),
  );
}

/** What a practice service set needs from storage: learner progress plus installed packs. */
export type PracticePersistence = LearningPersistence & PracticePackStore;

/**
 * The practice database (`python-learn-game-practice`) for `scope`, DURABLE ONLY.
 *
 * Unlike `createBrowserLearningPersistence` (CS116, whose in-memory failover is
 * unchanged), this never wraps the store in `ResilientLearningPersistence` and never
 * falls back to memory: if IndexedDB is unavailable or fails, the operation fails
 * and the caller reports it. Practice attempts, drafts and packs are therefore never
 * "saved" in RAM only. The same single schema owner (`IndexedDbLearningPersistence`)
 * serves the database, so there is no second persistence implementation.
 * Without IndexedDB at all the store refuses every operation.
 */
export function createBrowserPracticePersistence(scope: PersistenceScope = GUEST_SCOPE): PracticePersistence {
  const baseName = GUEST_DATABASE_BASE_NAMES.practice;
  // Validate first so an invalid scope fails even where IndexedDB is unavailable.
  resolveScopedDatabaseName(baseName, scope);

  if (typeof indexedDB === "undefined") {
    return new UnavailablePracticePersistence();
  }

  return new IndexedDbLearningPersistence(indexedDB, scope, { databaseBaseName: baseName });
}
