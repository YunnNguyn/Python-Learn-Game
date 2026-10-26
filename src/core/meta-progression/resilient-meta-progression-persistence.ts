import { PersistenceClosedError, PersistenceDomainError } from "../persistence/persistence-errors";
import type {
  MetaProgressionPersistence,
  MetaProgressionPersistenceCloseState,
} from "./meta-progression-persistence";
import { MemoryMetaProgressionPersistence } from "./memory-meta-progression-persistence";
import type { MetaProgressionState } from "./meta-types";

/**
 * EXPLICIT OPT-IN volatile failover. NOT used by the browser composition since
 * PHASE-04C.3D.4: `createBrowserMetaProgressionPersistence` fails closed instead,
 * because a silent switch to memory makes rewards look saved while they are
 * lost on reload. A caller that constructs this wrapper deliberately must itself
 * disclose `kind === "memory"` to the learner as volatile rewards.
 *
 * Even when constructed, it never fails over for:
 *  - PersistenceDomainError (closed instance, blocked/newer schema, unreadable
 *    stored state) - those are rethrown and the healthy primary is kept;
 *  - any failure after close() - the real error is reported, never retried in memory.
 */
export class ResilientMetaProgressionPersistence
  implements MetaProgressionPersistence
{
  private readonly fallback = new MemoryMetaProgressionPersistence();
  private failedOver = false;
  /** Set synchronously by close(); never reset. */
  private closed = false;
  private closing: Promise<void> | null = null;

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

  /** Closes the primary and the fallback (idempotent). Nothing is cleared or copied. */
  close(): Promise<void> {
    if (this.closing !== null) return this.closing;
    this.closed = true;
    this.closing = Promise.all([this.primary.close(), this.fallback.close()]).then(
      () => undefined,
    );
    return this.closing;
  }

  getCloseState(): MetaProgressionPersistenceCloseState {
    if (!this.closed) return "open";
    return this.primary.getCloseState() === "closed-pending-open" ? "closed-pending-open" : "closed";
  }

  private async execute<T>(
    operation: (store: MetaProgressionPersistence) => Promise<T>,
  ): Promise<T> {
    if (this.closed) throw new PersistenceClosedError();
    if (this.failedOver) return operation(this.fallback);

    try {
      return await operation(this.primary);
    } catch (error) {
      if (error instanceof PersistenceDomainError) throw error;
      if (this.closed) throw error;
      console.warn(
        "IndexedDB reward storage unavailable; falling back to in-memory progression.",
        error,
      );
      this.failedOver = true;
      return operation(this.fallback);
    }
  }
}
