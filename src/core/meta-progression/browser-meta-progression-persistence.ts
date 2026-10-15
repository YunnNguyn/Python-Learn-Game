import { IndexedDbMetaProgressionPersistence } from "./indexeddb-meta-progression-persistence";
import { MetaProgressionStorageUnavailableError } from "./meta-progression-errors";
import type {
  MetaProgressionPersistence,
  MetaProgressionPersistenceCloseState,
} from "./meta-progression-persistence";
import type { MetaProgressionState } from "./meta-types";
import { PersistenceClosedError } from "../persistence/persistence-errors";
import {
  GUEST_DATABASE_BASE_NAMES,
  GUEST_SCOPE,
  resolveScopedDatabaseName,
  type PersistenceScope,
} from "../persistence/persistence-scope";

/**
 * Reward storage for the browser app.
 *
 * FAIL CLOSED (PHASE-04C.3D.4, R1): rewards are stored in IndexedDB and ONLY
 * there. A storage failure (open error, blocked or newer schema, unreadable
 * state, failed write) reaches the caller - and through
 * `MetaProgressionEngine.initialize()` the application's startup failure state.
 * Without any IndexedDB API the store is "unavailable": every operation rejects
 * with MetaProgressionStorageUnavailableError. Volatile in-memory rewards are
 * never selected by this factory; MemoryMetaProgressionPersistence remains
 * available only by explicit construction (tests, deliberate non-production use).
 */
export function createBrowserMetaProgressionPersistence(
  scope: PersistenceScope = GUEST_SCOPE,
): MetaProgressionPersistence {
  // Validate first so an invalid scope fails even where IndexedDB is unavailable.
  resolveScopedDatabaseName(GUEST_DATABASE_BASE_NAMES.meta, scope);

  if (typeof indexedDB === "undefined") {
    return new UnavailableMetaProgressionPersistence();
  }

  return new IndexedDbMetaProgressionPersistence(indexedDB, scope);
}

/**
 * Stands in for the durable store when the browser has no IndexedDB API. It
 * fails lazily (construction never throws) and holds no state, so nothing can
 * appear saved. `kind` names the durable store it stands in for: it is never
 * "memory". Follows the close contract like the other stores.
 */
class UnavailableMetaProgressionPersistence implements MetaProgressionPersistence {
  readonly kind = "indexeddb" as const;
  private closed = false;

  loadState(): Promise<MetaProgressionState | null> {
    return this.reject();
  }

  saveState(_state: MetaProgressionState): Promise<void> {
    return this.reject();
  }

  clear(): Promise<void> {
    return this.reject();
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  getCloseState(): MetaProgressionPersistenceCloseState {
    return this.closed ? "closed" : "open";
  }

  private reject(): Promise<never> {
    return Promise.reject(
      this.closed ? new PersistenceClosedError() : new MetaProgressionStorageUnavailableError(),
    );
  }
}
