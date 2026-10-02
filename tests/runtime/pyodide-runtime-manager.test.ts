import { describe, expect, it } from "vitest";

import {
  PyodideRuntimeManager,
  type RuntimeWorkerPort,
} from "../../src/core/runtime/pyodide/pyodide-runtime-manager";
import type { RuntimeInitWorkerRequest } from "../../src/core/runtime/pyodide/worker-protocol";

const LOCAL_INDEX_URL = "http://local.test/app/assets/pyodide/";

class FakeWorker implements RuntimeWorkerPort {
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessageerror: ((event: unknown) => void) | null = null;
  readonly postedMessages: RuntimeInitWorkerRequest[] = [];
  terminateCount = 0;

  postMessage(message: RuntimeInitWorkerRequest): void {
    this.postedMessages.push(message);
  }

  terminate(): void {
    this.terminateCount += 1;
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data });
  }

  emitError(error: unknown): void {
    this.onerror?.(error);
  }

  emitMessageError(error: unknown): void {
    this.onmessageerror?.(error);
  }
}

function createHarness() {
  const workers: FakeWorker[] = [];
  const manager = new PyodideRuntimeManager({
    indexURL: LOCAL_INDEX_URL,
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
  });

  return { manager, workers };
}

describe("PyodideRuntimeManager initialization", () => {
  it("sends one local RUNTIME_INIT request and resolves READY", async () => {
    const { manager, workers } = createHarness();
    const initialization = manager.initialize();
    const worker = workers[0];

    expect(worker.postedMessages).toEqual([
      {
        type: "RUNTIME_INIT",
        requestId: "runtime-1",
        indexURL: LOCAL_INDEX_URL,
      },
    ]);

    worker.emitMessage({ type: "READY", requestId: "runtime-1" });

    await expect(initialization).resolves.toEqual({ ok: true });
  });

  it("reuses the ready worker for repeated initialize calls", async () => {
    const { manager, workers } = createHarness();
    const first = manager.initialize();

    workers[0].emitMessage({ type: "READY", requestId: "runtime-1" });
    await expect(first).resolves.toEqual({ ok: true });
    await expect(manager.initialize()).resolves.toEqual({ ok: true });

    expect(workers).toHaveLength(1);
    expect(workers[0].postedMessages).toHaveLength(1);
  });

  it("shares one worker and one init message across concurrent initialize calls", async () => {
    const { manager, workers } = createHarness();
    const first = manager.initialize();
    const second = manager.initialize();

    expect(second).toBe(first);
    expect(workers).toHaveLength(1);
    expect(workers[0].postedMessages).toHaveLength(1);

    workers[0].emitMessage({ type: "READY", requestId: "runtime-1" });

    await expect(Promise.all([first, second])).resolves.toEqual([
      { ok: true },
      { ok: true },
    ]);
  });

  it("normalizes RUNTIME_ERROR, discards the failed worker, and retries fresh", async () => {
    const { manager, workers } = createHarness();
    const first = manager.initialize();

    workers[0].emitMessage({
      type: "RUNTIME_ERROR",
      requestId: "runtime-1",
      error: { code: "PYODIDE_INIT_FAILED", message: "boot failed" },
    });

    await expect(first).resolves.toEqual({
      ok: false,
      error: { code: "PYODIDE_INIT_FAILED", message: "boot failed" },
    });
    expect(workers[0].terminateCount).toBe(1);

    const retry = manager.initialize();
    expect(workers).toHaveLength(2);
    expect(workers[1].postedMessages[0]).toMatchObject({
      type: "RUNTIME_INIT",
      requestId: "runtime-2",
    });

    workers[1].emitMessage({ type: "READY", requestId: "runtime-2" });
    await expect(retry).resolves.toEqual({ ok: true });
  });

  it("normalizes worker error events without exposing the raw event", async () => {
    const { manager, workers } = createHarness();
    const initialization = manager.initialize();
    const rawEvent = { message: "worker exploded", nested: { browser: true } };

    workers[0].emitError(rawEvent);

    const result = await initialization;
    expect(result).toEqual({
      ok: false,
      error: { code: "WORKER_ERROR", message: "worker exploded" },
    });
    expect(result).not.toBe(rawEvent);
    expect(workers[0].terminateCount).toBe(1);
  });

  it("normalizes messageerror during initialization", async () => {
    const { manager, workers } = createHarness();
    const initialization = manager.initialize();

    workers[0].emitMessageError({ message: "decode failed" });

    await expect(initialization).resolves.toEqual({
      ok: false,
      error: { code: "WORKER_MESSAGE_ERROR", message: "decode failed" },
    });
    expect(workers[0].terminateCount).toBe(1);
  });

  it("ignores READY with the wrong request ID", async () => {
    const { manager, workers } = createHarness();
    const initialization = manager.initialize();
    let settled = false;
    void initialization.then(() => {
      settled = true;
    });

    workers[0].emitMessage({ type: "READY", requestId: "runtime-999" });
    await Promise.resolve();
    expect(settled).toBe(false);

    workers[0].emitMessage({ type: "READY", requestId: "runtime-1" });
    await expect(initialization).resolves.toEqual({ ok: true });
  });

  it("ignores a stale old-worker response during a fresh retry", async () => {
    const { manager, workers } = createHarness();
    const first = manager.initialize();
    const oldWorker = workers[0];
    const staleHandler = oldWorker.onmessage;

    oldWorker.emitMessage({
      type: "RUNTIME_ERROR",
      requestId: "runtime-1",
      error: { code: "PYODIDE_INIT_FAILED", message: "first boot failed" },
    });
    await first;

    const retry = manager.initialize();
    let retrySettled = false;
    void retry.then(() => {
      retrySettled = true;
    });

    staleHandler?.({ data: { type: "READY", requestId: "runtime-1" } });
    await Promise.resolve();
    expect(retrySettled).toBe(false);

    workers[1].emitMessage({ type: "READY", requestId: "runtime-2" });
    await expect(retry).resolves.toEqual({ ok: true });
  });
});

describe("PyodideRuntimeManager disposal", () => {
  it("terminates a ready worker exactly once", async () => {
    const { manager, workers } = createHarness();
    const initialization = manager.initialize();

    workers[0].emitMessage({ type: "READY", requestId: "runtime-1" });
    await initialization;

    manager.dispose();
    manager.dispose();

    expect(workers[0].terminateCount).toBe(1);
  });

  it("settles pending initialization on dispose and ignores late READY", async () => {
    const { manager, workers } = createHarness();
    const initialization = manager.initialize();
    const worker = workers[0];
    const lateHandler = worker.onmessage;

    manager.dispose();

    await expect(initialization).resolves.toEqual({
      ok: false,
      error: {
        code: "RUNTIME_DISPOSED",
        message: "Runtime manager đã được hủy trong khi đang khởi tạo.",
      },
    });
    expect(worker.terminateCount).toBe(1);

    lateHandler?.({ data: { type: "READY", requestId: "runtime-1" } });
    await expect(manager.initialize()).resolves.toMatchObject({
      ok: false,
      error: { code: "RUNTIME_DISPOSED" },
    });
  });

  it("never creates a new worker after disposal", async () => {
    const { manager, workers } = createHarness();

    manager.dispose();

    await expect(manager.initialize()).resolves.toMatchObject({
      ok: false,
      error: { code: "RUNTIME_DISPOSED" },
    });
    expect(workers).toHaveLength(0);
  });
});

describe("PR.2 deferred RuntimeManager operations", () => {
  it("returns structured NOT_IMPLEMENTED from prepareMission", async () => {
    const { manager, workers } = createHarness();

    await expect(manager.prepareMission({})).resolves.toMatchObject({
      ok: false,
      error: { code: "NOT_IMPLEMENTED" },
    });
    expect(workers).toHaveLength(0);
  });

  it("keeps run and submit distinct and returns RUNTIME_ERROR / NOT_IMPLEMENTED", async () => {
    const { manager, workers } = createHarness();
    const initialization = manager.initialize();
    workers[0].emitMessage({ type: "READY", requestId: "runtime-1" });
    await initialization;

    const runResult = await manager.run({ code: "print('run')" });
    const submitResult = await manager.submit({ code: "print('submit')" });

    expect(runResult).toEqual({
      status: "RUNTIME_ERROR",
      stdout: "",
      stderr: "",
      error: {
        code: "NOT_IMPLEMENTED",
        message: "run chưa được triển khai trong PR.2.",
      },
    });
    expect(submitResult).toEqual({
      status: "RUNTIME_ERROR",
      stdout: "",
      stderr: "",
      error: {
        code: "NOT_IMPLEMENTED",
        message: "submit chưa được triển khai trong PR.2.",
      },
    });
    expect(runResult).not.toBe(submitResult);
    expect(workers).toHaveLength(1);
    expect(workers[0].postedMessages).toEqual([
      {
        type: "RUNTIME_INIT",
        requestId: "runtime-1",
        indexURL: LOCAL_INDEX_URL,
      },
    ]);
  });

  it("returns only normalized public result data", async () => {
    const { manager, workers } = createHarness();
    const initialization = manager.initialize();
    const rawEvent = {
      message: "browser worker failure",
      worker: workers[0],
      eventType: "ErrorEvent",
    };

    workers[0].emitError(rawEvent);

    const lifecycleResult = await initialization;
    const runResult = await manager.run({ code: "x = 1" });

    expect(JSON.parse(JSON.stringify(lifecycleResult))).toEqual(lifecycleResult);
    expect(JSON.parse(JSON.stringify(runResult))).toEqual(runResult);
    expect(JSON.stringify(lifecycleResult)).not.toContain("ErrorEvent");
    expect(JSON.stringify(lifecycleResult)).not.toContain("postedMessages");
  });
});
