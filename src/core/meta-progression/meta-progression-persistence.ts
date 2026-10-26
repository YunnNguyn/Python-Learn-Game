import type { LearningPersistenceCloseState } from "../persistence/learning-persistence";
import type { MetaProgressionState } from "./meta-types";

/**
 * Same lifecycle vocabulary as LearningPersistence (PHASE-04C.3D.3):
 *  - open:                close() has not been called.
 *  - closed:              closed; no connection is held and none is pending.
 *  - closed-pending-open: closed, but a browser open request issued BEFORE
 *                         close() is still outstanding (e.g. an upgrade blocked
 *                         by another tab). Its connection is closed the moment
 *                         it arrives; this can last indefinitely.
 */
export type MetaProgressionPersistenceCloseState = LearningPersistenceCloseState;

export interface MetaProgressionPersistence {
  readonly kind: "indexeddb" | "memory";
  /**
   * The stored progression, or `null` when nothing has ever been stored.
   * Stored data that cannot be trusted rejects with
   * MetaProgressionStateUnreadableError - it is never reported as `null`.
   */
  loadState(): Promise<MetaProgressionState | null>;
  /** Resolves only once the state is durably written by this store. */
  saveState(state: MetaProgressionState): Promise<void>;
  clear(): Promise<void>;
  /**
   * Permanently closes this instance (idempotent), mirroring
   * LearningPersistence.close(). Closed synchronously, so from that moment every
   * new operation rejects with PersistenceClosedError and no new transaction
   * starts; a transaction that already started settles normally. Nothing is
   * deleted or reset, nothing is reopened, nothing is redirected to another
   * store, and close() never waits for an outstanding (possibly blocked) open
   * request - `getCloseState()` reports that as `closed-pending-open`.
   */
  close(): Promise<void>;
  getCloseState(): MetaProgressionPersistenceCloseState;
}
