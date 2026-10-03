import { IndexedDbMetaProgressionPersistence } from "./indexeddb-meta-progression-persistence";
import { MemoryMetaProgressionPersistence } from "./memory-meta-progression-persistence";
import type { MetaProgressionPersistence } from "./meta-progression-persistence";
import { ResilientMetaProgressionPersistence } from "./resilient-meta-progression-persistence";

export function createBrowserMetaProgressionPersistence(): MetaProgressionPersistence {
  if (typeof indexedDB === "undefined") {
    return new MemoryMetaProgressionPersistence();
  }

  return new ResilientMetaProgressionPersistence(
    new IndexedDbMetaProgressionPersistence(indexedDB),
  );
}
