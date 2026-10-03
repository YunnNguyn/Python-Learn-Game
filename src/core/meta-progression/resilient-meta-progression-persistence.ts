import type { MetaProgressionPersistence } from "./meta-progression-persistence";
import { MemoryMetaProgressionPersistence } from "./memory-meta-progression-persistence";
import type { MetaProgressionState } from "./meta-types";

export class ResilientMetaProgressionPersistence
  implements MetaProgressionPersistence
{
  private readonly fallback = new MemoryMetaProgressionPersistence();
  private failedOver = false;

  constructor(private readonly primary: MetaProgressionPersistence) {}

  get kind(): "indexeddb" | "memory" {
    return this.failedOver ? "memory" : this.primary.kind;
  }

  loadState(): Promise<MetaProgressionState | null> {
    return this.execute((store) => store.loadState());
  }

  saveState(state: MetaProgressionState): Promise<void> {
    return this.execute((store) => store.saveState(state));
  }

  clear(): Promise<void> {
    return this.execute((store) => store.clear());
  }

  private async execute<T>(
    operation: (store: MetaProgressionPersistence) => Promise<T>,
  ): Promise<T> {
    if (this.failedOver) return operation(this.fallback);

    try {
      return await operation(this.primary);
    } catch (error) {
      console.warn(
        "IndexedDB reward storage unavailable; falling back to in-memory progression.",
        error,
      );
      this.failedOver = true;
      return operation(this.fallback);
    }
  }
}
