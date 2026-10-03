import type { MetaProgressionPersistence } from "./meta-progression-persistence";
import type { MetaProgressionState } from "./meta-types";

export class MemoryMetaProgressionPersistence
  implements MetaProgressionPersistence
{
  readonly kind = "memory" as const;
  private state: MetaProgressionState | null = null;

  async loadState(): Promise<MetaProgressionState | null> {
    return this.state ? structuredClone(this.state) : null;
  }

  async saveState(state: MetaProgressionState): Promise<void> {
    this.state = structuredClone(state);
  }

  async clear(): Promise<void> {
    this.state = null;
  }
}
