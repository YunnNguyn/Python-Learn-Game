/*
 * Operation gate (PHASE-04C.3D.7, M6).
 *
 * One small reader/writer gate per ApplicationServices set. It exists for a single
 * reason: "Clear learning data" must not interleave with the durable mutations
 * that create the same data (attempt, reward, draft, workshop), and none of them
 * may recreate data after Clear reported success.
 *
 *  - SHARED:    every ordinary durable mutation (Submit persistence, engine
 *               mutations, draft writes). Shared operations run concurrently with
 *               each other exactly as before.
 *  - EXCLUSIVE: Clear (and the engines' own clear methods). Starts only when no
 *               shared operation is running and runs alone.
 *
 * Policy (FIFO, so nothing starves and the order is observable):
 *  - An operation that started before an exclusive one finishes first.
 *  - An operation requested while an exclusive one is running OR WAITING queues
 *    behind it and then runs against the cleared store - it is delayed, never
 *    dropped or refused.
 *  - With nothing exclusive running or queued a shared operation starts
 *    synchronously, so the ordering guarantees of M1-M5 (a first write reaches
 *    persistence in the caller's turn) are unchanged.
 *  - Always released, whether the operation resolves or rejects; the caller gets
 *    the operation's own result or original error.
 *
 * DEADLOCK RULE: only the OUTERMOST operation takes the gate. An operation that
 * holds it must call the ungated base paths (`admitted*`, `trackAdmitted`) for its
 * steps - waiting for the gate while holding it would wait for itself.
 */

type Kind = "shared" | "exclusive";

interface Waiter {
  readonly kind: Kind;
  start(): void;
}

export class OperationGate {
  private sharedRunning = 0;
  private exclusiveRunning = false;
  private readonly queue: Waiter[] = [];

  runShared<T>(operation: () => Promise<T>): Promise<T> {
    return this.run("shared", operation);
  }

  runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    return this.run("exclusive", operation);
  }

  /** For tests and diagnostics. */
  getState(): { readonly shared: number; readonly exclusive: boolean; readonly waiting: number } {
    return { shared: this.sharedRunning, exclusive: this.exclusiveRunning, waiting: this.queue.length };
  }

  private run<T>(kind: Kind, operation: () => Promise<T>): Promise<T> {
    // Free: start synchronously. Otherwise wait in line (nobody overtakes a queued exclusive).
    if (this.queue.length === 0 && this.canStart(kind)) return this.start(kind, operation);
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        kind,
        start: () => {
          this.start(kind, operation).then(resolve, reject);
        },
      });
    });
  }

  private canStart(kind: Kind): boolean {
    if (this.exclusiveRunning) return false;
    return kind === "shared" || this.sharedRunning === 0;
  }

  private start<T>(kind: Kind, operation: () => Promise<T>): Promise<T> {
    if (kind === "shared") this.sharedRunning += 1;
    else this.exclusiveRunning = true;
    let running: Promise<T>;
    try {
      running = Promise.resolve(operation());
    } catch (error) {
      running = Promise.reject(error);
    }
    const release = (): void => {
      if (kind === "shared") this.sharedRunning -= 1;
      else this.exclusiveRunning = false;
      this.pump();
    };
    running.then(release, release);
    return running;
  }

  private pump(): void {
    for (let head = this.queue[0]; head !== undefined && this.canStart(head.kind); head = this.queue[0]) {
      this.queue.shift();
      head.start();
    }
  }
}
