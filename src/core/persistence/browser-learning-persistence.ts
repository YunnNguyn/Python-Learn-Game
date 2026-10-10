import { IndexedDbLearningPersistence } from "./indexeddb-learning-persistence";
import { MemoryLearningPersistence } from "./memory-learning-persistence";
import { ResilientLearningPersistence } from "./resilient-learning-persistence";
import type { LearningPersistence } from "./learning-persistence";
import {
  GUEST_DATABASE_BASE_NAMES,
  GUEST_SCOPE,
  resolveScopedDatabaseName,
  type PersistenceScope,
} from "./persistence-scope";

export function createBrowserLearningPersistence(
  scope: PersistenceScope = GUEST_SCOPE,
): LearningPersistence {
  // Validate first so an invalid scope fails even where IndexedDB is unavailable.
  resolveScopedDatabaseName(GUEST_DATABASE_BASE_NAMES.learning, scope);

  if (typeof indexedDB === "undefined") {
    return new MemoryLearningPersistence();
  }

  return new ResilientLearningPersistence(new IndexedDbLearningPersistence(indexedDB, scope));
}
