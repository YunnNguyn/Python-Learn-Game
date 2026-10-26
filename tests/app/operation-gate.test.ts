import { describe, expect, it } from "vitest";

import { OperationGate } from "../../src/app/services/operation-gate";

/**
 * PHASE-04C.3D.7 (M6) - the gate on its own, with controlled (deferred) promises.
 * Nothing sleeps: ordering is proven by an event log and by promise settlement.
 */

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function turns(count = 20): Promise<void> {
  for (let turn = 0; turn < count; turn += 1) await Promise.resolve();
}

function tracked(log: string[], name: string, gate: Promise<unknown>) {
  return async () => {
    log.push(`${name}:start`);
    try {
      await gate;
      log.push(`${name}:end`);
    } catch (error) {
      log.push(`${name}:error`);
      throw error;
    }
  };
}

describe("M6 OperationGate", () => {
  it("starts a free operation synchronously and runs shared operations concurrently", async () => {
    const gate = new OperationGate();
    const log: string[] = [];
    const a = deferred();
    const b = deferred();
    const first = gate.runShared(tracked(log, "a", a.promise));
    const second = gate.runShared(tracked(log, "b", b.promise));
    expect(log).toEqual(["a:start", "b:start"]); // synchronously, in the caller's turn
    expect(gate.getState()).toEqual({ shared: 2, exclusive: false, waiting: 0 });
    b.resolve();
    a.resolve();
    await Promise.all([first, second]);
    expect(gate.getState()).toEqual({ shared: 0, exclusive: false, waiting: 0 });
  });

  it("an exclusive operation waits for earlier shared ones, and later shared ones wait for it (nothing overtakes)", async () => {
    const gate = new OperationGate();
    const log: string[] = [];
    const early = deferred();
    const clear = deferred();
    const late = deferred();
    const p1 = gate.runShared(tracked(log, "early", early.promise));
    const p2 = gate.runExclusive(tracked(log, "clear", clear.promise));
    const p3 = gate.runShared(tracked(log, "late", late.promise));
    await turns();
    expect(log).toEqual(["early:start"]);
    early.resolve();
    await turns();
    expect(log).toEqual(["early:start", "early:end", "clear:start"]);
    clear.resolve();
    await turns();
    expect(log).toEqual(["early:start", "early:end", "clear:start", "clear:end", "late:start"]);
    late.resolve();
    await Promise.all([p1, p2, p3]);
  });

  it("exclusive operations run one at a time in request order; shared ones queued between them batch together", async () => {
    const gate = new OperationGate();
    const log: string[] = [];
    const steps = [deferred(), deferred(), deferred(), deferred(), deferred()];
    const all = [
      gate.runExclusive(tracked(log, "c1", steps[0]!.promise)),
      gate.runShared(tracked(log, "s1", steps[1]!.promise)),
      gate.runShared(tracked(log, "s2", steps[2]!.promise)),
      gate.runExclusive(tracked(log, "c2", steps[3]!.promise)),
      gate.runShared(tracked(log, "s3", steps[4]!.promise)),
    ];
    await turns();
    expect(log).toEqual(["c1:start"]);
    steps[0]!.resolve();
    await turns();
    expect(log).toEqual(["c1:start", "c1:end", "s1:start", "s2:start"]);
    steps[1]!.resolve();
    await turns();
    expect(log).not.toContain("c2:start"); // s2 still running
    steps[2]!.resolve();
    await turns();
    expect(log.slice(-2)).toEqual(["s2:end", "c2:start"]);
    steps[3]!.resolve();
    await turns();
    expect(log.at(-1)).toBe("s3:start");
    steps[4]!.resolve();
    await Promise.all(all);
  });

  it("releases on failure: the caller gets the original error and the queue keeps moving", async () => {
    const gate = new OperationGate();
    const log: string[] = [];
    const failing = deferred();
    const failure = new Error("clear failed");
    const clear = gate.runExclusive(tracked(log, "clear", failing.promise));
    const after = gate.runShared(async () => {
      log.push("after");
    });
    failing.reject(failure);
    await expect(clear).rejects.toBe(failure);
    await after;
    expect(log).toEqual(["clear:start", "clear:error", "after"]);
    expect(gate.getState()).toEqual({ shared: 0, exclusive: false, waiting: 0 });
  });

  it("a synchronous throw is a rejection and still releases the gate", async () => {
    const gate = new OperationGate();
    const boom = new Error("sync boom");
    await expect(
      gate.runExclusive(() => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    await expect(gate.runShared(async () => "still usable")).resolves.toBe("still usable");
  });

  it("an operation that already holds the gate must not wait for it again (the documented rule): ungated steps complete", async () => {
    const gate = new OperationGate();
    const log: string[] = [];
    const outer = gate.runShared(async () => {
      log.push("outer:start");
      await Promise.resolve(); // its steps are plain awaits, not gate calls
      log.push("outer:end");
    });
    const clear = gate.runExclusive(async () => {
      log.push("clear");
    });
    await Promise.all([outer, clear]);
    expect(log).toEqual(["outer:start", "outer:end", "clear"]);
  });
});
