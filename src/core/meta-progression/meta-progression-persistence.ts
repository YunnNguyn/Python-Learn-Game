import type { MetaProgressionState } from "./meta-types";

export interface MetaProgressionPersistence {
  readonly kind: "indexeddb" | "memory";
  loadState(): Promise<MetaProgressionState | null>;
  saveState(state: MetaProgressionState): Promise<void>;
  clear(): Promise<void>;
}
