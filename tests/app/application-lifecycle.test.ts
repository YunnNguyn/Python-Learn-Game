import { describe, expect, it, vi } from "vitest";

import {
  ApplicationLifecycle,
  ApplicationServicesRetiredError,
  resolveDrainTimeout,
} from "../../src/app/services/application-lifecycle";
import {
  MissionSessionRegistry,
  ServiceOwnedMissionSession,
} from "../../src/app/services/service-owned-resources";
import type { LearningActivity, MissionInstance, MissionTemplate } from "../../src/core/domain";
import type { MissionEngine } from "../../src/core/missions";

/**
 * PHASE-04C.3D.5 (M4) - unit level: admission/drain tracking and the mission
 * session registry. Deferred promises only; no sleeps.
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

function fakeEngine() {
  const engine = { disposed: 0, dispose() { engine.disposed += 1; } };
  return engine;
}

/** An engine whose dispose() throws the given errors, one per call, then succeeds. */
function throwingEngine(...errors: unknown[]) {
  const queue = [...errors];
  const engine = {
    disposed: 0,
    dispose() {
      engine.disposed += 1;
      if (queue.length > 0) throw queue.shift();
    },
  };
  return engine;
}

function ownedSession(registry: MissionSessionRegistry, engine = fakeEngine(), retry?: () => void) {
  const session = new ServiceOwnedMissionSession(
    { id: "activity.unit", stage: "GUIDED" } as unknown as LearningActivity,
    { id: "template.unit", version: 1 } as unknown as MissionTemplate,
    { id: "instance.unit", seed: "s", conceptIds: [] } as unknown as MissionInstance,
    engine as unknown as MissionEngine,
    {},
    (released) => registry.release(released),
    retry,
  );
  registry.register(session);
  return { session, engine };
}

describe("ApplicationLifecycle", () => {
  it("starts active and retires synchronously, exactly once", () => {
    const lifecycle = new ApplicationLifecycle();
    const seen: string[] = [];
    lifecycle.subscribe(() => seen.push(lifecycle.getState().status));
    expect(lifecycle.getState()).toEqual({ status: "active" });

    expect(lifecycle.beginRetirement()).toBe(true);
    expect(lifecycle.getState()).toEqual({ status: "retiring", drain: "draining" });
    expect(lifecycle.beginRetirement()).toBe(false);
    expect(seen).toEqual(["retiring"]);
  });

  it("runDurable refuses after retirement without calling the operation", async () => {
    const lifecycle = new ApplicationLifecycle();
    lifecycle.beginRetirement();
    let called = false;
    const refused = lifecycle.runDurable(async () => {
      called = true;
    });
    await expect(refused).rejects.toBeInstanceOf(ApplicationServicesRetiredError);
    expect(called).toBe(false);
    expect(lifecycle.getPendingDurableOperationCount()).toBe(0);
  });

  it("tracks admitted work until it settles, fulfilled or rejected, and returns its own result", async () => {
    const lifecycle = new ApplicationLifecycle();
    const ok = deferred<string>();
    const bad = deferred<string>();
    const first = lifecycle.runDurable(() => ok.promise);
    const second = lifecycle.runDurable(() => bad.promise);
    expect(lifecycle.getPendingDurableOperationCount()).toBe(2);

    lifecycle.beginRetirement();
    let drained: boolean | null = null;
    const drain = lifecycle.waitForDrain(60_000).then((value) => {
      drained = value;
    });

    ok.resolve("written");
    expect(await first).toBe("written");
    expect(lifecycle.getPendingDurableOperationCount()).toBe(1);
    expect(drained).toBeNull();

    const failure = new Error("disk full");
    bad.reject(failure);
    await expect(second).rejects.toBe(failure); // the caller sees the real error
    await drain;
    expect(drained).toBe(true);
    expect(lifecycle.getPendingDurableOperationCount()).toBe(0);
  });

  it("a synchronous throw inside an admitted operation becomes its rejection and is untracked", async () => {
    const lifecycle = new ApplicationLifecycle();
    const failure = new Error("sync");
    await expect(
      lifecycle.runDurable(() => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(lifecycle.getPendingDurableOperationCount()).toBe(0);
  });

  it("trackAdmitted counts work even while retiring (it was admitted earlier)", async () => {
    const lifecycle = new ApplicationLifecycle();
    lifecycle.beginRetirement();
    const write = deferred();
    const tracked = lifecycle.trackAdmitted(() => write.promise);
    expect(lifecycle.getPendingDurableOperationCount()).toBe(1);
    write.resolve();
    await tracked;
    expect(lifecycle.getPendingDurableOperationCount()).toBe(0);
  });

  it("a drain timeout reports false, never true, while the work keeps running and stays tracked", async () => {
    const lifecycle = new ApplicationLifecycle();
    const write = deferred();
    const tracked = lifecycle.runDurable(() => write.promise);
    lifecycle.beginRetirement();

    expect(await lifecycle.waitForDrain(0)).toBe(false);
    lifecycle.markDrainIncomplete();
    expect(lifecycle.getState()).toEqual({ status: "retiring", drain: "incomplete" });
    expect(lifecycle.getPendingDurableOperationCount()).toBe(1);

    lifecycle.resumeDrain();
    expect(lifecycle.getState()).toEqual({ status: "retiring", drain: "draining" });
    write.resolve();
    await tracked;
    expect(await lifecycle.waitForDrain(0)).toBe(true);
  });

  it("disposed is terminal and reports the persistence close states it was given", () => {
    const lifecycle = new ApplicationLifecycle();
    lifecycle.beginRetirement();
    lifecycle.markDisposed({ learning: "closed", metaProgression: "closed-pending-open" });
    expect(lifecycle.getState()).toEqual({
      status: "disposed",
      persistence: { learning: "closed", metaProgression: "closed-pending-open" },
    });
    lifecycle.markDrainIncomplete();
    lifecycle.resumeDrain();
    expect(lifecycle.getState().status).toBe("disposed");
    expect(lifecycle.beginRetirement()).toBe(false);
  });

  it("rejects an unusable drain timeout instead of waiting without a way to report a blocked state", () => {
    expect(resolveDrainTimeout(undefined)).toBe(10_000);
    expect(resolveDrainTimeout({ drainTimeoutMs: 0 })).toBe(0);
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => resolveDrainTimeout({ drainTimeoutMs: bad })).toThrow(RangeError);
    }
  });
});

describe("MissionSessionRegistry", () => {
  it("removes a session as soon as the page releases it, so nothing disposed is retained", () => {
    const registry = new MissionSessionRegistry();
    const first = ownedSession(registry);
    const second = ownedSession(registry);
    expect(registry.size).toBe(2);

    first.session.dispose(); // releaseSession() in MissionWorkspacePage
    expect(registry.size).toBe(1);
    expect(first.engine.disposed).toBe(1);

    registry.disposeAll();
    expect(registry.size).toBe(0);
    expect(second.engine.disposed).toBe(1);
    expect(first.engine.disposed).toBe(1); // not disposed twice
  });

  it("repeated disposal and release racing disposeAll are harmless", () => {
    const registry = new MissionSessionRegistry();
    const { session, engine } = ownedSession(registry);
    registry.disposeAll();
    session.dispose();
    registry.disposeAll();
    session.dispose();
    expect(engine.disposed).toBe(1);
    expect(registry.size).toBe(0);
  });

  it("disposes engines still loading for a session that does not exist yet, once", () => {
    const registry = new MissionSessionRegistry();
    const loading = fakeEngine();
    registry.trackLoading(loading as unknown as MissionEngine);
    expect(registry.loadingCount).toBe(1);
    registry.disposeAll();
    registry.disposeAll();
    expect(loading.disposed).toBe(1);
    expect(registry.loadingCount).toBe(0);
  });
});

describe("R1 - lifecycle outcome states and listener isolation", () => {
  it("cleanup-failed is retiring (never disposed or active) and a repeated dispose resumes draining", () => {
    const lifecycle = new ApplicationLifecycle();
    lifecycle.beginRetirement();
    lifecycle.markCleanupFailed();
    expect(lifecycle.getState()).toEqual({ status: "retiring", drain: "cleanup-failed" });
    expect(lifecycle.isActive()).toBe(false);
    expect(lifecycle.beginRetirement()).toBe(false);

    lifecycle.resumeDrain();
    expect(lifecycle.getState()).toEqual({ status: "retiring", drain: "draining" });
    lifecycle.markCleanupFailed();
    lifecycle.markDisposed({ learning: "closed", metaProgression: "closed" });
    lifecycle.markCleanupFailed(); // terminal
    expect(lifecycle.getState().status).toBe("disposed");
  });

  it("a throwing subscriber cannot abort a retirement or hide it from the other subscribers", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const lifecycle = new ApplicationLifecycle();
    const seen: string[] = [];
    lifecycle.subscribe(() => {
      throw new Error("subscriber failed");
    });
    lifecycle.subscribe(() => seen.push(lifecycle.getState().status));
    expect(() => lifecycle.beginRetirement()).not.toThrow();
    expect(lifecycle.getState()).toEqual({ status: "retiring", drain: "draining" });
    expect(seen).toEqual(["retiring"]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("R1 - MissionSessionRegistry exception safety", () => {
  it("disposeAll never throws, processes every resource, and reports the original errors", () => {
    const registry = new MissionSessionRegistry();
    const boomEngine = new Error("loading engine");
    const boomSession = new Error("session engine");
    const loading = throwingEngine(boomEngine);
    registry.trackLoading(loading as unknown as MissionEngine, () => loading.dispose());
    const failing = throwingEngine(boomSession);
    const first = ownedSession(registry, failing, () => failing.dispose());
    const healthy = ownedSession(registry);

    expect(() => registry.disposeAll()).not.toThrow();

    expect(loading.disposed).toBe(1);
    expect(failing.disposed).toBe(1);
    expect(healthy.engine.disposed).toBe(1); // processed despite the failure before it
    expect(registry.getUnresolvedFailures()).toEqual([
      { resource: "mission-engine", error: boomEngine },
      { resource: "mission-session", error: boomSession },
    ]);
    expect(registry.size).toBe(1); // only the failed session stays registered
    expect(first.session.getCleanupFailure()?.error).toBe(boomSession);
  });

  it("a retry clears the failure; nothing that already succeeded is disposed twice", () => {
    const registry = new MissionSessionRegistry();
    const failing = throwingEngine(new Error("once"));
    ownedSession(registry, failing, () => failing.dispose());
    const healthy = ownedSession(registry);

    registry.disposeAll();
    expect(registry.getUnresolvedFailures()).toHaveLength(1);
    registry.disposeAll();

    expect(registry.getUnresolvedFailures()).toEqual([]);
    expect(registry.size).toBe(0);
    expect(failing.disposed).toBe(2); // the failed teardown only
    expect(healthy.engine.disposed).toBe(1);
  });

  it("without a way to retry, a failed disposal stays failed - never a silent success - and keeps the first error", () => {
    const registry = new MissionSessionRegistry();
    const first = new Error("first");
    const failing = throwingEngine(first);
    const { session } = ownedSession(registry, failing); // no retry callback

    registry.disposeAll();
    registry.disposeAll();
    expect(() => session.dispose()).toThrow("first");
    expect(registry.getUnresolvedFailures()).toEqual([{ resource: "mission-session", error: first }]);
    expect(failing.disposed).toBe(1); // base dispose is a no-op after it marked itself disposed
  });

  it("a retry that throws again keeps the FIRST error", () => {
    const registry = new MissionSessionRegistry();
    const first = new Error("first");
    const failing = throwingEngine(first, new Error("second"));
    ownedSession(registry, failing, () => failing.dispose());
    registry.disposeAll();
    registry.disposeAll();
    expect(registry.getUnresolvedFailures()).toEqual([{ resource: "mission-session", error: first }]);
  });

  it("discardEngine never throws and the failure is retained until a retry succeeds", () => {
    const registry = new MissionSessionRegistry();
    const boom = new Error("discard");
    const engine = throwingEngine(boom);
    const retry = () => engine.dispose();
    registry.trackLoading(engine as unknown as MissionEngine, retry);

    expect(() => registry.discardEngine(engine as unknown as MissionEngine, retry)).not.toThrow();
    expect(registry.loadingCount).toBe(0);
    expect(registry.getUnresolvedFailures()).toEqual([{ resource: "mission-engine", error: boom }]);

    registry.disposeAll();
    expect(registry.getUnresolvedFailures()).toEqual([]);
    expect(engine.disposed).toBe(2);
  });

  it("a page release that throws is observed by the registry (the session stays registered)", () => {
    const registry = new MissionSessionRegistry();
    const boom = new Error("release");
    const failing = throwingEngine(boom);
    const { session } = ownedSession(registry, failing, () => failing.dispose());
    expect(() => session.dispose()).toThrow("release"); // releaseSession() in the page
    expect(registry.size).toBe(1);
    expect(registry.getUnresolvedFailures()).toEqual([{ resource: "mission-session", error: boom }]);
  });
});


describe("R2 - mission load tracking", () => {
  it("a tracked load holds the drain until it has settled - fulfilled or rejected - and hands the caller its own promise", async () => {
    const lifecycle = new ApplicationLifecycle();
    const done = deferred<string>();
    const tracked = lifecycle.trackLoad(() => done.promise);
    expect(lifecycle.getPendingMissionLoadCount()).toBe(1);
    expect(lifecycle.getPendingDurableOperationCount()).toBe(0); // counted separately from durable writes
    expect(await lifecycle.waitForDrain(0)).toBe(false); // a timeout is not a drain

    const drained = deferred<boolean>();
    void lifecycle.waitForDrain(60_000).then(drained.resolve);
    done.resolve("loaded");
    await expect(tracked).resolves.toBe("loaded");
    expect(await drained.promise).toBe(true);
    expect(lifecycle.getPendingMissionLoadCount()).toBe(0);

    const failing = deferred<string>();
    const rejected = lifecycle.trackLoad(() => failing.promise);
    const observed = rejected.catch((error: unknown) => error);
    failing.reject(new Error("load failed"));
    expect(await observed).toEqual(new Error("load failed"));
    expect(await lifecycle.waitForDrain(0)).toBe(true);
    expect(lifecycle.getPendingMissionLoadCount()).toBe(0);
  });

  it("the drain needs durable writes AND loads to be finished", async () => {
    const lifecycle = new ApplicationLifecycle();
    const write = deferred();
    const load = deferred();
    void lifecycle.trackAdmitted(() => write.promise);
    void lifecycle.trackLoad(() => load.promise);
    const drained = deferred<boolean>();
    void lifecycle.waitForDrain(60_000).then(drained.resolve);

    write.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(lifecycle.getPendingDurableOperationCount()).toBe(0);
    expect(await lifecycle.waitForDrain(0)).toBe(false); // the load is still running
    load.resolve();
    expect(await drained.promise).toBe(true);
  });

  it("a load operation that throws synchronously is counted and released", async () => {
    const lifecycle = new ApplicationLifecycle();
    const tracked = lifecycle.trackLoad(() => {
      throw new Error("sync");
    });
    await expect(tracked).rejects.toThrow("sync");
    expect(await lifecycle.waitForDrain(0)).toBe(true);
    expect(lifecycle.getPendingMissionLoadCount()).toBe(0);
  });
});
