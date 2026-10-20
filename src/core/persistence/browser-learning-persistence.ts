import {
  IndexedDbLearningPersistence,
  type IndexedDbLearningPersistenceOptions,
} from "./indexeddb-learning-persistence";
import { MemoryLearningPersistence } from "./memory-learning-persistence";
import { ResilientLearningPersistence } from "./resilient-learning-persistence";
import type { LearningPersistence } from "./learning-persistence";
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
