import { IndexedDbMetaProgressionPersistence } from "./indexeddb-meta-progression-persistence";
import { MemoryMetaProgressionPersistence } from "./memory-meta-progression-persistence";
import type { MetaProgressionPersistence } from "./meta-progression-persistence";
import { ResilientMetaProgressionPersistence } from "./resilient-meta-progression-persistence";
import {
  GUEST_DATABASE_BASE_NAMES,
  GUEST_SCOPE,
  resolveScopedDatabaseName,
  type PersistenceScope,
} from "../persistence/persistence-scope";

export function createBrowserMetaProgressionPersistence(
  scope: PersistenceScope = GUEST_SCOPE,
): MetaProgressionPersistence {
  // Validate first so an invalid scope fails even where IndexedDB is unavailable.
  resolveScopedDatabaseName(GUEST_DATABASE_BASE_NAMES.meta, scope);

  if (typeof indexedDB === "undefined") {
    return new MemoryMetaProgressionPersistence();
  }

  return new ResilientMetaProgressionPersistence(
    new IndexedDbMetaProgressionPersistence(indexedDB, scope),
  );
}
