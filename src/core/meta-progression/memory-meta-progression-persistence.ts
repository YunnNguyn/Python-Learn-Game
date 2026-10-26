import { PersistenceClosedError } from "../persistence/persistence-errors";
import type {
  MetaProgressionPersistence,
  MetaProgressionPersistenceCloseState,
} from "./meta-progression-persistence";
import type { MetaProgressionState } from "./meta-types";

/**
 * VOLATILE: everything stored here disappears with the page. Intended for tests
 * and for explicit construction only; the browser composition never switches to
 * it after a storage failure (PHASE-04C.3D.4).
 */
export class MemoryMetaProgressionPersistence
  implements MetaProgressionPersistence
{
  readonly kind = "memory" as const;
  private state: MetaProgressionState | null = null;
  private closed = false;

  async loadState(): Promise<MetaProgressionState | null> {
    this.assertOpen();
    return this.state ? structuredClone(this.state) : null;
  }

  async saveState(state: MetaProgressionState): Promise<void> {
    this.assertOpen();
    this.state = structuredClone(state);
  }

  async clear(): Promise<void> {
    this.assertOpen();
    this.state = null;
  }

  /** Idempotent; the held state is not cleared, only made unreachable. */
  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  getCloseState(): MetaProgressionPersistenceCloseState {
    return this.closed ? "closed" : "open";
  }

  private assertOpen(): void {
    if (this.closed) throw new PersistenceClosedError();
  }
}
