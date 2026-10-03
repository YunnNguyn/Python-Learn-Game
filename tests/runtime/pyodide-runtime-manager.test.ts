import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PyodideRuntimeManager,
  type RuntimeWorkerPort,
} from "../../src/core/runtime/pyodide/pyodide-runtime-manager";
import type { RuntimeWorkerRequest } from "../../src/core/runtime/pyodide/worker-protocol";

const LOCAL_INDEX_URL = "http://local.test/app/assets/pyodide/";

class FakeWorker implements RuntimeWorkerPort {
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessageerror: ((event: unknown) => void) | null = null;
  readonly postedMessages: RuntimeWorkerRequest[] = [];
  terminateCount = 0;

  postMessage(message: RuntimeWorkerRequest): void {
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

function createHarness(executionTimeoutMs = 5_000) {
  const workers: FakeWorker[] = [];
  const manager = new PyodideRuntimeManager({
    indexURL: LOCAL_INDEX_URL,
    executionTimeoutMs,
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
  });

  return { manager, workers };
}

async function createReadyHarness(executionTimeoutMs = 5_000) {
  const harness = createHarness(executionTimeoutMs);
  const initialization = harness.manager.initialize();
  harness.workers[0].emitMessage({
    type: "READY",
    requestId: "runtime-1",
  });
  await initialization;
  return harness;
}

afterEach(() => {
  vi.useRealTimers();
});

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

describe("PyodideRuntimeManager basic execution", () => {
  it("returns RUNTIME_NOT_READY before initialization without creating a worker", async () => {
    const { manager, workers } = createHarness();

    await expect(manager.run({ code: "print('early')" })).resolves.toEqual({
      status: "RUNTIME_ERROR",
      stdout: "",
      stderr: "",
      error: {
        code: "RUNTIME_NOT_READY",
        message: "Runtime chưa sẵn sàng. Hãy khởi tạo runtime trước khi chạy mã.",
      },
    });
    expect(workers).toHaveLength(0);
  });

  it("sends one correlated RUN_CODE and returns SUCCESS", async () => {
    const { manager, workers } = await createReadyHarness();
    const worker = workers[0];
    const run = manager.run({ code: 'print("hello")' });

    expect(worker.postedMessages).toHaveLength(2);
    expect(worker.postedMessages[1]).toEqual({
      type: "RUN_CODE",
      requestId: "runtime-2",
      code: 'print("hello")',
    });

    worker.emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-2",
      result: {
        status: "SUCCESS",
        stdout: "hello\n",
        stderr: "",
      },
    });

    await expect(run).resolves.toEqual({
      status: "SUCCESS",
      stdout: "hello\n",
      stderr: "",
    });
  });

  it("keeps stdout and stderr separate with exact pass-through", async () => {
    const { manager, workers } = await createReadyHarness();
    const run = manager.run({ code: "print('a')" });

    workers[0].emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-2",
      result: {
        status: "SUCCESS",
        stdout: "a\nb\n",
        stderr: "warning\n",
      },
    });

    await expect(run).resolves.toEqual({
      status: "SUCCESS",
      stdout: "a\nb\n",
      stderr: "warning\n",
    });
  });

  it("returns learner Python exceptions without discarding the ready worker", async () => {
    const { manager, workers } = await createReadyHarness();
    const worker = workers[0];
    const failedRun = manager.run({
      code: 'print("before"); raise ValueError("boom")',
    });

    worker.emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-2",
      result: {
        status: "PYTHON_EXCEPTION",
        stdout: "before\n",
        stderr: "",
        exception: {
          type: "ValueError",
          message: "boom",
        },
      },
    });

    await expect(failedRun).resolves.toEqual({
      status: "PYTHON_EXCEPTION",
      stdout: "before\n",
      stderr: "",
      exception: {
        type: "ValueError",
        message: "boom",
      },
    });
    expect(worker.terminateCount).toBe(0);

    const nextRun = manager.run({ code: 'print("still alive")' });
    expect(worker.postedMessages[2]).toMatchObject({
      type: "RUN_CODE",
      requestId: "runtime-3",
    });
    worker.emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-3",
      result: {
        status: "SUCCESS",
        stdout: "still alive\n",
        stderr: "",
      },
    });

    await expect(nextRun).resolves.toMatchObject({
      status: "SUCCESS",
      stdout: "still alive\n",
    });
  });

  it("returns normalized runtime failures without raw event data", async () => {
    const { manager, workers } = await createReadyHarness();
    const run = manager.run({ code: "x = 1" });
    const rawEvent = {
      message: "worker exploded",
      eventType: "ErrorEvent",
      nested: { browser: true },
    };

    workers[0].emitError(rawEvent);

    const result = await run;
    expect(result).toEqual({
      status: "RUNTIME_ERROR",
      stdout: "",
      stderr: "",
      error: {
        code: "WORKER_ERROR",
        message: "worker exploded",
      },
    });
    expect(JSON.stringify(result)).not.toContain("ErrorEvent");
    expect(JSON.stringify(result)).not.toContain("nested");
    expect(workers[0].terminateCount).toBe(1);
  });

  it("ignores RUN_RESULT with the wrong request ID", async () => {
    const { manager, workers } = await createReadyHarness();
    const run = manager.run({ code: "x = 1" });
    let settled = false;
    void run.then(() => {
      settled = true;
    });

    workers[0].emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-999",
      result: { status: "SUCCESS", stdout: "wrong", stderr: "" },
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    workers[0].emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-2",
      result: { status: "SUCCESS", stdout: "right", stderr: "" },
    });
    await expect(run).resolves.toMatchObject({
      status: "SUCCESS",
      stdout: "right",
    });
  });

  it("rejects a concurrent run with RUNTIME_BUSY without sending another RUN_CODE", async () => {
    const { manager, workers } = await createReadyHarness();
    const first = manager.run({ code: "x = 1" });
    const second = manager.run({ code: "y = 2" });

    await expect(second).resolves.toMatchObject({
      status: "RUNTIME_ERROR",
      error: { code: "RUNTIME_BUSY" },
    });
    expect(workers[0].postedMessages).toHaveLength(2);

    workers[0].emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-2",
      result: { status: "SUCCESS", stdout: "", stderr: "" },
    });
    await expect(first).resolves.toMatchObject({ status: "SUCCESS" });
  });

  it("settles an active run on dispose and ignores its late response", async () => {
    const { manager, workers } = await createReadyHarness();
    const worker = workers[0];
    const run = manager.run({ code: "x = 1" });
    const lateHandler = worker.onmessage;

    manager.dispose();

    await expect(run).resolves.toMatchObject({
      status: "RUNTIME_ERROR",
      error: { code: "RUNTIME_DISPOSED" },
    });
    expect(worker.terminateCount).toBe(1);

    lateHandler?.({
      data: {
        type: "RUN_RESULT",
        requestId: "runtime-2",
        result: { status: "SUCCESS", stdout: "late", stderr: "" },
      },
    });

    await expect(manager.run({ code: "x = 2" })).resolves.toMatchObject({
      status: "RUNTIME_ERROR",
      error: { code: "RUNTIME_DISPOSED" },
    });
    expect(worker.postedMessages).toHaveLength(2);
  });

  it("settles messageerror during a run and discards the failed worker", async () => {
    const { manager, workers } = await createReadyHarness();
    const run = manager.run({ code: "x = 1" });

    workers[0].emitMessageError({ message: "decode failed" });

    await expect(run).resolves.toEqual({
      status: "RUNTIME_ERROR",
      stdout: "",
      stderr: "",
      error: {
        code: "WORKER_MESSAGE_ERROR",
        message: "decode failed",
      },
    });
    expect(workers[0].terminateCount).toBe(1);
  });

  it("allows explicit reinitialization after a worker error during a run", async () => {
    const { manager, workers } = await createReadyHarness();
    const run = manager.run({ code: "x = 1" });

    workers[0].emitError({ message: "run worker failed" });
    await run;

    const reinitialize = manager.initialize();
    expect(workers).toHaveLength(2);
    expect(workers[1].postedMessages[0]).toMatchObject({
      type: "RUNTIME_INIT",
      requestId: "runtime-3",
    });
    workers[1].emitMessage({ type: "READY", requestId: "runtime-3" });
    await expect(reinitialize).resolves.toEqual({ ok: true });
  });

  it("ignores stale failed-worker run responses after a fresh worker is initialized", async () => {
    const { manager, workers } = await createReadyHarness();
    const oldWorker = workers[0];
    const oldRun = manager.run({ code: "x = 1" });
    const staleHandler = oldWorker.onmessage;

    oldWorker.emitError({ message: "old worker failed" });
    await oldRun;

    const reinitialize = manager.initialize();
    workers[1].emitMessage({ type: "READY", requestId: "runtime-3" });
    await reinitialize;

    const currentRun = manager.run({ code: "x = 2" });
    let currentSettled = false;
    void currentRun.then(() => {
      currentSettled = true;
    });

    staleHandler?.({
      data: {
        type: "RUN_RESULT",
        requestId: "runtime-2",
        result: { status: "SUCCESS", stdout: "stale", stderr: "" },
      },
    });
    await Promise.resolve();
    expect(currentSettled).toBe(false);

    workers[1].emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-4",
      result: { status: "SUCCESS", stdout: "fresh", stderr: "" },
    });
    await expect(currentRun).resolves.toMatchObject({
      status: "SUCCESS",
      stdout: "fresh",
    });
  });

  it("returns fresh public result objects for separate runs", async () => {
    const { manager, workers } = await createReadyHarness();
    const sharedResult = {
      status: "SUCCESS" as const,
      stdout: "same\n",
      stderr: "",
    };

    const firstRun = manager.run({ code: "1" });
    workers[0].emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-2",
      result: sharedResult,
    });
    const firstResult = await firstRun;

    const secondRun = manager.run({ code: "2" });
    workers[0].emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-3",
      result: sharedResult,
    });
    const secondResult = await secondRun;

    expect(firstResult).toEqual(sharedResult);
    expect(secondResult).toEqual(sharedResult);
    expect(firstResult).not.toBe(sharedResult);
    expect(secondResult).not.toBe(sharedResult);
    expect(secondResult).not.toBe(firstResult);
  });
});

describe("PyodideRuntimeManager mission preparation", () => {
  it("returns RUNTIME_NOT_READY before initialization without sending MISSION_PREPARE", async () => {
    const { manager, workers } = createHarness();

    await expect(manager.prepareMission({})).resolves.toEqual({
      ok: false,
      error: {
        code: "RUNTIME_NOT_READY",
        message:
          "Runtime chưa sẵn sàng. Hãy khởi tạo runtime trước khi chuẩn bị môi trường.",
      },
    });
    expect(workers).toHaveLength(0);
  });

  it("sends one correlated MISSION_PREPARE and resolves MISSION_PREPARED", async () => {
    const { manager, workers } = await createReadyHarness();
    const worker = workers[0];
    const preparation = manager.prepareMission({
      runtimeConfig: {},
      setupData: {
        values: [2, 5, 8],
        threshold: 5,
        metadata: {
          label: "demo",
        },
      },
    });

    expect(worker.postedMessages).toHaveLength(2);
    expect(worker.postedMessages[1]).toEqual({
      type: "MISSION_PREPARE",
      requestId: "runtime-2",
      runtimeConfig: {},
      setupData: {
        values: [2, 5, 8],
        threshold: 5,
        metadata: {
          label: "demo",
        },
      },
    });

    worker.emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-2",
    });

    await expect(preparation).resolves.toEqual({ ok: true });
  });

  it("ignores MISSION_PREPARED with the wrong request ID", async () => {
    const { manager, workers } = await createReadyHarness();
    const worker = workers[0];
    const preparation = manager.prepareMission({ setupData: { value: 10 } });
    let settled = false;
    void preparation.then(() => {
      settled = true;
    });

    worker.emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-999",
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    worker.emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-2",
    });
    await expect(preparation).resolves.toEqual({ ok: true });
  });

  it("blocks prepare while a Run is pending without sending MISSION_PREPARE", async () => {
    const { manager, workers } = await createReadyHarness();
    const worker = workers[0];
    const run = manager.run({ code: "value = 1" });
    const preparation = manager.prepareMission({ setupData: { value: 10 } });

    await expect(preparation).resolves.toMatchObject({
      ok: false,
      error: { code: "RUNTIME_BUSY" },
    });
    expect(worker.postedMessages).toHaveLength(2);

    worker.emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-2",
      result: { status: "SUCCESS", stdout: "", stderr: "" },
    });
    await expect(run).resolves.toMatchObject({ status: "SUCCESS" });
  });

  it("blocks Run while prepare is pending without sending RUN_CODE", async () => {
    const { manager, workers } = await createReadyHarness();
    const worker = workers[0];
    const preparation = manager.prepareMission({ setupData: { value: 10 } });
    const run = manager.run({ code: "print(value)" });

    await expect(run).resolves.toMatchObject({
      status: "RUNTIME_ERROR",
      error: { code: "RUNTIME_BUSY" },
    });
    expect(worker.postedMessages).toHaveLength(2);

    worker.emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-2",
    });
    await expect(preparation).resolves.toEqual({ ok: true });
  });

  it("blocks a concurrent prepare without sending a second MISSION_PREPARE", async () => {
    const { manager, workers } = await createReadyHarness();
    const worker = workers[0];
    const first = manager.prepareMission({ setupData: { value: 10 } });
    const second = manager.prepareMission({ setupData: { value: 20 } });

    await expect(second).resolves.toMatchObject({
      ok: false,
      error: { code: "RUNTIME_BUSY" },
    });
    expect(worker.postedMessages).toHaveLength(2);

    worker.emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-2",
    });
    await expect(first).resolves.toEqual({ ok: true });
  });

  it("keeps the ready worker after a structured preparation failure", async () => {
    const { manager, workers } = await createReadyHarness();
    const worker = workers[0];
    const invalid = manager.prepareMission({
      setupData: { "bad-key": 1 },
    });

    worker.emitMessage({
      type: "RUNTIME_ERROR",
      requestId: "runtime-2",
      error: {
        code: "INVALID_SETUP_DATA",
        message: "invalid setup key",
      },
    });

    await expect(invalid).resolves.toEqual({
      ok: false,
      error: {
        code: "INVALID_SETUP_DATA",
        message: "invalid setup key",
      },
    });
    expect(worker.terminateCount).toBe(0);

    const valid = manager.prepareMission({ setupData: { value: 10 } });
    expect(worker.postedMessages[2]).toMatchObject({
      type: "MISSION_PREPARE",
      requestId: "runtime-3",
    });
    worker.emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-3",
    });
    await expect(valid).resolves.toEqual({ ok: true });
  });

  it("settles prepare on dispose and ignores the late response", async () => {
    const { manager, workers } = await createReadyHarness();
    const worker = workers[0];
    const preparation = manager.prepareMission({ setupData: { value: 10 } });
    const lateHandler = worker.onmessage;

    manager.dispose();

    await expect(preparation).resolves.toMatchObject({
      ok: false,
      error: { code: "RUNTIME_DISPOSED" },
    });
    expect(worker.terminateCount).toBe(1);

    lateHandler?.({
      data: {
        type: "MISSION_PREPARED",
        requestId: "runtime-2",
      },
    });

    await expect(
      manager.prepareMission({ setupData: { value: 20 } }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "RUNTIME_DISPOSED" },
    });
    expect(worker.postedMessages).toHaveLength(2);
  });

  it("settles worker error during prepare and allows explicit reinitialization", async () => {
    const { manager, workers } = await createReadyHarness();
    const preparation = manager.prepareMission({ setupData: { value: 10 } });

    workers[0].emitError({ message: "prepare worker failed" });

    await expect(preparation).resolves.toEqual({
      ok: false,
      error: {
        code: "WORKER_ERROR",
        message: "prepare worker failed",
      },
    });
    expect(workers[0].terminateCount).toBe(1);

    const reinitialize = manager.initialize();
    expect(workers).toHaveLength(2);
    expect(workers[1].postedMessages[0]).toMatchObject({
      type: "RUNTIME_INIT",
      requestId: "runtime-3",
    });
    workers[1].emitMessage({ type: "READY", requestId: "runtime-3" });
    await expect(reinitialize).resolves.toEqual({ ok: true });
  });

  it("settles messageerror during prepare and discards the failed worker", async () => {
    const { manager, workers } = await createReadyHarness();
    const preparation = manager.prepareMission({ setupData: { value: 10 } });

    workers[0].emitMessageError({ message: "prepare decode failed" });

    await expect(preparation).resolves.toEqual({
      ok: false,
      error: {
        code: "WORKER_MESSAGE_ERROR",
        message: "prepare decode failed",
      },
    });
    expect(workers[0].terminateCount).toBe(1);
  });

  it("ignores stale failed-worker prepare responses after a fresh worker is ready", async () => {
    const { manager, workers } = await createReadyHarness();
    const oldWorker = workers[0];
    const failedPrepare = manager.prepareMission({ setupData: { value: 10 } });
    const staleHandler = oldWorker.onmessage;

    oldWorker.emitError({ message: "old prepare worker failed" });
    await failedPrepare;

    const reinitialize = manager.initialize();
    workers[1].emitMessage({ type: "READY", requestId: "runtime-3" });
    await reinitialize;

    const currentPrepare = manager.prepareMission({
      setupData: { value: 20 },
    });
    let currentSettled = false;
    void currentPrepare.then(() => {
      currentSettled = true;
    });

    staleHandler?.({
      data: {
        type: "MISSION_PREPARED",
        requestId: "runtime-2",
      },
    });
    await Promise.resolve();
    expect(currentSettled).toBe(false);

    workers[1].emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-4",
    });
    await expect(currentPrepare).resolves.toEqual({ ok: true });
  });

  it("returns JSON-safe lifecycle results for preparation failures", async () => {
    const { manager, workers } = await createReadyHarness();
    const preparation = manager.prepareMission({
      runtimeConfig: { packages: ["numpy"] },
    });

    workers[0].emitMessage({
      type: "RUNTIME_ERROR",
      requestId: "runtime-2",
      error: {
        code: "UNSUPPORTED_RUNTIME_CONFIG",
        message: "unsupported",
      },
    });

    const result = await preparation;
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "UNSUPPORTED_RUNTIME_CONFIG",
        message: "unsupported",
      },
    });
  });
});

describe("PR.5 execution timeout and worker replacement", () => {
  it("validates executionTimeoutMs at construction", () => {
    for (const executionTimeoutMs of [
      0,
      -1,
      1.5,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(
        () =>
          new PyodideRuntimeManager({
            indexURL: LOCAL_INDEX_URL,
            executionTimeoutMs,
            createWorker: () => new FakeWorker(),
          }),
      ).toThrow(RangeError);
    }
  });

  it("does not time initialization or mission preparation", async () => {
    vi.useFakeTimers();
    const { manager, workers } = createHarness(10);
    const initialization = manager.initialize();

    vi.advanceTimersByTime(100);
    expect(workers).toHaveLength(1);
    expect(workers[0].terminateCount).toBe(0);

    workers[0].emitMessage({ type: "READY", requestId: "runtime-1" });
    await initialization;

    const preparation = manager.prepareMission({ setupData: { value: 10 } });
    vi.advanceTimersByTime(100);
    expect(workers).toHaveLength(1);
    expect(workers[0].terminateCount).toBe(0);

    workers[0].emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-2",
    });
    await expect(preparation).resolves.toEqual({ ok: true });
  });

  it("clears the timer for normal SUCCESS without replacing the worker", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(50);
    const run = manager.run({ code: "print('ok')" });

    workers[0].emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-2",
      result: {
        status: "SUCCESS",
        stdout: "ok\n",
        stderr: "",
      },
    });

    await expect(run).resolves.toMatchObject({ status: "SUCCESS" });
    vi.advanceTimersByTime(100);
    expect(workers).toHaveLength(1);
    expect(workers[0].terminateCount).toBe(0);
  });

  it("clears the timer for PYTHON_EXCEPTION without replacing the worker", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(50);
    const run = manager.run({ code: "raise ValueError('bad')" });

    workers[0].emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-2",
      result: {
        status: "PYTHON_EXCEPTION",
        stdout: "",
        stderr: "",
        exception: {
          type: "ValueError",
          message: "bad",
        },
      },
    });

    await expect(run).resolves.toMatchObject({ status: "PYTHON_EXCEPTION" });
    vi.advanceTimersByTime(100);
    expect(workers).toHaveLength(1);
    expect(workers[0].terminateCount).toBe(0);
  });

  it("clears the timer for finite RUNTIME_ERROR results without replacing the worker", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(50);
    const run = manager.run({ code: "print('finite')" });

    workers[0].emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-2",
      result: {
        status: "RUNTIME_ERROR",
        stdout: "",
        stderr: "",
        error: {
          code: "FINITE_RUNTIME_ERROR",
          message: "finite failure",
        },
      },
    });

    await expect(run).resolves.toMatchObject({
      status: "RUNTIME_ERROR",
      error: { code: "FINITE_RUNTIME_ERROR" },
    });
    vi.advanceTimersByTime(100);
    expect(workers).toHaveLength(1);
    expect(workers[0].terminateCount).toBe(0);
  });

  it("times out one run, terminates the old worker once, initializes a replacement, and never replays code", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);
    const oldWorker = workers[0];
    const staleHandler = oldWorker.onmessage;
    const run = manager.run({ code: "while True: pass" });
    let settled = false;
    void run.then(() => {
      settled = true;
    });

    vi.advanceTimersByTime(25);

    expect(oldWorker.terminateCount).toBe(1);
    expect(workers).toHaveLength(2);
    expect(workers[1].postedMessages).toEqual([
      {
        type: "RUNTIME_INIT",
        requestId: "runtime-3",
        indexURL: LOCAL_INDEX_URL,
      },
    ]);

    staleHandler?.({
      data: {
        type: "RUN_RESULT",
        requestId: "runtime-2",
        result: {
          status: "SUCCESS",
          stdout: "late\n",
          stderr: "",
        },
      },
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    workers[1].emitMessage({ type: "READY", requestId: "runtime-3" });
    await expect(run).resolves.toEqual({
      status: "TIMEOUT",
      stdout: "",
      stderr: "",
      error: {
        code: "EXECUTION_TIMEOUT",
        message:
          "Mã Python đã vượt quá giới hạn 25 ms. Worker đã được thay thế và runtime đã sẵn sàng lại.",
      },
    });
    expect(workers[1].postedMessages).toHaveLength(1);
  });

  it("keeps TIMEOUT when replacement initialization fails and allows an explicit fresh initialize", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);
    const run = manager.run({ code: "while True: pass" });

    vi.advanceTimersByTime(25);
    workers[1].emitMessage({
      type: "RUNTIME_ERROR",
      requestId: "runtime-3",
      error: {
        code: "PYODIDE_INIT_FAILED",
        message: "replacement boot failed",
      },
    });

    await expect(run).resolves.toMatchObject({
      status: "TIMEOUT",
      error: {
        code: "EXECUTION_TIMEOUT_RECOVERY_FAILED",
      },
    });
    expect(workers[1].terminateCount).toBe(1);

    const retry = manager.initialize();
    expect(workers).toHaveLength(3);
    expect(workers[2].postedMessages[0]).toMatchObject({
      type: "RUNTIME_INIT",
      requestId: "runtime-4",
    });
    workers[2].emitMessage({ type: "READY", requestId: "runtime-4" });
    await expect(retry).resolves.toEqual({ ok: true });
  });

  it("shares one replacement initialization with initialize calls made during recovery", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);
    const run = manager.run({ code: "while True: pass" });

    vi.advanceTimersByTime(25);
    const firstInitialize = manager.initialize();
    const secondInitialize = manager.initialize();

    expect(secondInitialize).toBe(firstInitialize);
    expect(workers).toHaveLength(2);
    expect(workers[1].postedMessages).toHaveLength(1);

    workers[1].emitMessage({ type: "READY", requestId: "runtime-3" });
    await expect(firstInitialize).resolves.toEqual({ ok: true });
    await expect(secondInitialize).resolves.toEqual({ ok: true });
    await expect(run).resolves.toMatchObject({ status: "TIMEOUT" });
    expect(workers).toHaveLength(2);
  });

  it("rejects run and prepareMission as RUNTIME_RECOVERING without posting learner work", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);
    const timedRun = manager.run({ code: "while True: pass" });

    vi.advanceTimersByTime(25);
    const replacement = workers[1];

    await expect(
      manager.run({ code: "print('too soon')" }),
    ).resolves.toMatchObject({
      status: "RUNTIME_ERROR",
      error: { code: "RUNTIME_RECOVERING" },
    });
    await expect(
      manager.prepareMission({ setupData: { value: 10 } }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "RUNTIME_RECOVERING" },
    });
    expect(replacement.postedMessages).toHaveLength(1);

    replacement.emitMessage({ type: "READY", requestId: "runtime-3" });
    await timedRun;
  });

  it("allows generic Run after recovery when no mission had been prepared", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);
    const timedRun = manager.run({ code: "while True: pass" });

    vi.advanceTimersByTime(25);
    workers[1].emitMessage({ type: "READY", requestId: "runtime-3" });
    await timedRun;

    const recoveredRun = manager.run({ code: "print('recovered')" });
    expect(workers[1].postedMessages[1]).toEqual({
      type: "RUN_CODE",
      requestId: "runtime-4",
      code: "print('recovered')",
    });
    workers[1].emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-4",
      result: {
        status: "SUCCESS",
        stdout: "recovered\n",
        stderr: "",
      },
    });
    await expect(recoveredRun).resolves.toMatchObject({
      status: "SUCCESS",
      stdout: "recovered\n",
    });
  });

  it("automatically restores a prepared environment before resolving TIMEOUT", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);
    const preparation = manager.prepareMission({ setupData: { value: 10 } });
    workers[0].emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-2",
    });
    await preparation;

    const timedRun = manager.run({ code: "while True: pass" });
    let settled = false;
    void timedRun.then(() => {
      settled = true;
    });
    vi.advanceTimersByTime(25);
    workers[1].emitMessage({ type: "READY", requestId: "runtime-4" });
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(workers[1].postedMessages[1]).toEqual({
      type: "MISSION_PREPARE",
      requestId: "runtime-5",
      runtimeConfig: undefined,
      setupData: { value: 10 },
    });
    workers[1].emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-5",
    });
    await expect(timedRun).resolves.toMatchObject({
      status: "TIMEOUT",
      error: { code: "EXECUTION_TIMEOUT" },
    });

    const recoveredRun = manager.run({ code: "print(value)" });
    expect(workers[1].postedMessages[2]).toEqual({
      type: "RUN_CODE",
      requestId: "runtime-6",
      code: "print(value)",
    });
    workers[1].emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-6",
      result: {
        status: "SUCCESS",
        stdout: "10\n",
        stderr: "",
      },
    });
    await expect(recoveredRun).resolves.toMatchObject({
      status: "SUCCESS",
      stdout: "10\n",
    });
  });

  it("does not mark the environment lost when the pre-timeout prepare failed", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);
    const failedPreparation = manager.prepareMission({
      runtimeConfig: { packages: ["numpy"] },
    });
    workers[0].emitMessage({
      type: "RUNTIME_ERROR",
      requestId: "runtime-2",
      error: {
        code: "UNSUPPORTED_RUNTIME_CONFIG",
        message: "unsupported",
      },
    });
    await failedPreparation;

    const timedRun = manager.run({ code: "while True: pass" });
    vi.advanceTimersByTime(25);
    workers[1].emitMessage({ type: "READY", requestId: "runtime-4" });
    await timedRun;

    const recoveredRun = manager.run({ code: "print('generic')" });
    expect(workers[1].postedMessages[1]).toMatchObject({
      type: "RUN_CODE",
      requestId: "runtime-5",
    });
    workers[1].emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-5",
      result: {
        status: "SUCCESS",
        stdout: "generic\n",
        stderr: "",
      },
    });
    await expect(recoveredRun).resolves.toMatchObject({ status: "SUCCESS" });
  });

  it("ignores a wrong RUN_RESULT request ID and leaves the timeout active", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);
    const run = manager.run({ code: "while True: pass" });

    workers[0].emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-999",
      result: {
        status: "SUCCESS",
        stdout: "wrong\n",
        stderr: "",
      },
    });
    vi.advanceTimersByTime(25);

    expect(workers[0].terminateCount).toBe(1);
    expect(workers).toHaveLength(2);
    workers[1].emitMessage({ type: "READY", requestId: "runtime-3" });
    await expect(run).resolves.toMatchObject({ status: "TIMEOUT" });
  });

  it("settles RUNTIME_DISPOSED and never replaces the worker when disposed before timeout", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);
    const run = manager.run({ code: "while True: pass" });

    manager.dispose();

    await expect(run).resolves.toMatchObject({
      status: "RUNTIME_ERROR",
      error: { code: "RUNTIME_DISPOSED" },
    });
    vi.advanceTimersByTime(100);
    expect(workers).toHaveLength(1);
    expect(workers[0].terminateCount).toBe(1);
  });

  it("disposes the replacement during recovery without hanging or creating another worker", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);
    const run = manager.run({ code: "while True: pass" });

    vi.advanceTimersByTime(25);
    expect(workers).toHaveLength(2);

    manager.dispose();

    await expect(run).resolves.toMatchObject({
      status: "RUNTIME_ERROR",
      error: { code: "RUNTIME_DISPOSED" },
    });
    expect(workers[0].terminateCount).toBe(1);
    expect(workers[1].terminateCount).toBe(1);
    workers[1].emitMessage({ type: "READY", requestId: "runtime-3" });
    vi.advanceTimersByTime(100);
    expect(workers).toHaveLength(2);
  });

  it("lets a matching result just before the deadline win the race", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);
    const run = manager.run({ code: "print('fast')" });

    vi.advanceTimersByTime(24);
    workers[0].emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-2",
      result: {
        status: "SUCCESS",
        stdout: "fast\n",
        stderr: "",
      },
    });
    vi.advanceTimersByTime(1);

    await expect(run).resolves.toMatchObject({ status: "SUCCESS" });
    expect(workers).toHaveLength(1);
    expect(workers[0].terminateCount).toBe(0);
  });

  it("lets timeout just after the deadline win and ignores a late matching result", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);
    const oldWorker = workers[0];
    const lateHandler = oldWorker.onmessage;
    const run = manager.run({ code: "while True: pass" });

    vi.advanceTimersByTime(25);
    lateHandler?.({
      data: {
        type: "RUN_RESULT",
        requestId: "runtime-2",
        result: {
          status: "SUCCESS",
          stdout: "too late\n",
          stderr: "",
        },
      },
    });

    workers[1].emitMessage({ type: "READY", requestId: "runtime-3" });
    await expect(run).resolves.toMatchObject({
      status: "TIMEOUT",
      error: { code: "EXECUTION_TIMEOUT" },
    });
    expect(oldWorker.terminateCount).toBe(1);
  });
});

describe("PR.6 environment restoration", () => {
  it("snapshots preparation at call time and restores the clean nested baseline without replaying learner code", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);
    const request = {
      runtimeConfig: {
        mode: "practice",
        options: { enabled: true },
      },
      setupData: {
        value: 10,
        config: { enabled: true, value: null },
        items: [1, 2, 3],
      },
    };

    const preparation = manager.prepareMission(request);
    request.runtimeConfig.mode = "mutated";
    request.runtimeConfig.options.enabled = false;
    request.setupData.value = 999;
    request.setupData.config.enabled = false;
    request.setupData.items.push(99);

    expect(workers[0].postedMessages[1]).toEqual({
      type: "MISSION_PREPARE",
      requestId: "runtime-2",
      runtimeConfig: {
        mode: "practice",
        options: { enabled: true },
      },
      setupData: {
        value: 10,
        config: { enabled: true, value: null },
        items: [1, 2, 3],
      },
    });
    workers[0].emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-2",
    });
    await expect(preparation).resolves.toEqual({ ok: true });

    const mutationRun = manager.run({
      code: "value = 99\nconfig['enabled'] = False\nitems.append(99)",
    });
    workers[0].emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-3",
      result: {
        status: "SUCCESS",
        stdout: "",
        stderr: "",
      },
    });
    await mutationRun;

    const timedRun = manager.run({ code: "while True: pass" });
    const staleTimedHandler = workers[0].onmessage;
    let timedSettled = false;
    void timedRun.then(() => {
      timedSettled = true;
    });

    vi.advanceTimersByTime(25);
    expect(workers).toHaveLength(2);
    expect(workers[1].postedMessages).toEqual([
      {
        type: "RUNTIME_INIT",
        requestId: "runtime-5",
        indexURL: LOCAL_INDEX_URL,
      },
    ]);

    staleTimedHandler?.({
      data: {
        type: "RUN_RESULT",
        requestId: "runtime-4",
        result: {
          status: "SUCCESS",
          stdout: "late\n",
          stderr: "",
        },
      },
    });
    await Promise.resolve();
    expect(timedSettled).toBe(false);

    workers[1].emitMessage({ type: "READY", requestId: "runtime-5" });
    await Promise.resolve();
    expect(workers[1].postedMessages[1]).toEqual({
      type: "MISSION_PREPARE",
      requestId: "runtime-6",
      runtimeConfig: {
        mode: "practice",
        options: { enabled: true },
      },
      setupData: {
        value: 10,
        config: { enabled: true, value: null },
        items: [1, 2, 3],
      },
    });
    expect(
      workers[1].postedMessages.some((message) => message.type === "RUN_CODE"),
    ).toBe(false);

    workers[1].emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-999",
    });
    await Promise.resolve();
    expect(timedSettled).toBe(false);

    workers[1].emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-6",
    });
    await expect(timedRun).resolves.toMatchObject({
      status: "TIMEOUT",
      error: { code: "EXECUTION_TIMEOUT" },
    });

    const recoveredRun = manager.run({ code: "print(value)" });
    expect(workers[1].postedMessages[2]).toEqual({
      type: "RUN_CODE",
      requestId: "runtime-7",
      code: "print(value)",
    });
    workers[1].emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-7",
      result: {
        status: "SUCCESS",
        stdout: "10\n",
        stderr: "",
      },
    });
    await expect(recoveredRun).resolves.toMatchObject({
      status: "SUCCESS",
      stdout: "10\n",
    });
  });

  it("preserves the previous successful baseline after a failed prepare and replaces it after a later success", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);

    const firstPreparation = manager.prepareMission({
      setupData: { value: 10 },
    });
    workers[0].emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-2",
    });
    await firstPreparation;

    const failedPreparation = manager.prepareMission({
      setupData: { value: 999 },
    });
    workers[0].emitMessage({
      type: "RUNTIME_ERROR",
      requestId: "runtime-3",
      error: {
        code: "INVALID_SETUP_DATA",
        message: "rejected",
      },
    });
    await expect(failedPreparation).resolves.toMatchObject({ ok: false });

    const firstTimeout = manager.run({ code: "while True: pass" });
    vi.advanceTimersByTime(25);
    workers[1].emitMessage({ type: "READY", requestId: "runtime-5" });
    await Promise.resolve();
    expect(workers[1].postedMessages[1]).toMatchObject({
      type: "MISSION_PREPARE",
      requestId: "runtime-6",
      setupData: { value: 10 },
    });
    workers[1].emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-6",
    });
    await firstTimeout;

    const secondPreparation = manager.prepareMission({
      setupData: { value: 20 },
    });
    workers[1].emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-7",
    });
    await secondPreparation;

    const secondTimeout = manager.run({ code: "while True: pass" });
    vi.advanceTimersByTime(25);
    workers[2].emitMessage({ type: "READY", requestId: "runtime-9" });
    await Promise.resolve();
    expect(workers[2].postedMessages[1]).toMatchObject({
      type: "MISSION_PREPARE",
      requestId: "runtime-10",
      setupData: { value: 20 },
    });
    workers[2].emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-10",
    });
    await secondTimeout;
  });

  it("treats a successful empty prepare as a restorable baseline", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);
    const preparation = manager.prepareMission({});
    workers[0].emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-2",
    });
    await preparation;

    const timedRun = manager.run({ code: "while True: pass" });
    vi.advanceTimersByTime(25);
    workers[1].emitMessage({ type: "READY", requestId: "runtime-4" });
    await Promise.resolve();

    expect(workers[1].postedMessages[1]).toEqual({
      type: "MISSION_PREPARE",
      requestId: "runtime-5",
      runtimeConfig: undefined,
      setupData: undefined,
    });
    workers[1].emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-5",
    });
    await expect(timedRun).resolves.toMatchObject({ status: "TIMEOUT" });
  });

  it("keeps the full recovery pending through restore, guards learner work, and supports manual recovery after restore failure", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);
    const preparation = manager.prepareMission({ setupData: { value: 10 } });
    workers[0].emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-2",
    });
    await preparation;

    const timedRun = manager.run({ code: "while True: pass" });
    let timedSettled = false;
    void timedRun.then(() => {
      timedSettled = true;
    });
    vi.advanceTimersByTime(25);

    const initializeDuringBoot = manager.initialize();
    workers[1].emitMessage({ type: "READY", requestId: "runtime-4" });
    await Promise.resolve();
    const initializeDuringRestore = manager.initialize();
    expect(initializeDuringRestore).toBe(initializeDuringBoot);
    expect(workers[1].postedMessages[1]).toMatchObject({
      type: "MISSION_PREPARE",
      requestId: "runtime-5",
    });

    await expect(
      manager.run({ code: "print('too soon')" }),
    ).resolves.toMatchObject({
      status: "RUNTIME_ERROR",
      error: { code: "RUNTIME_RECOVERING" },
    });
    await expect(
      manager.prepareMission({ setupData: { value: 20 } }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "RUNTIME_RECOVERING" },
    });
    expect(workers[1].postedMessages).toHaveLength(2);

    workers[1].emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-wrong",
    });
    await Promise.resolve();
    expect(timedSettled).toBe(false);

    workers[1].emitMessage({
      type: "RUNTIME_ERROR",
      requestId: "runtime-5",
      error: {
        code: "INVALID_SETUP_DATA",
        message: "restore rejected",
      },
    });

    await expect(timedRun).resolves.toMatchObject({
      status: "TIMEOUT",
      error: { code: "EXECUTION_TIMEOUT_RESTORE_FAILED" },
    });
    await expect(initializeDuringBoot).resolves.toMatchObject({
      ok: false,
      error: { code: "EXECUTION_TIMEOUT_RESTORE_FAILED" },
    });

    await expect(manager.run({ code: "print(value)" })).resolves.toMatchObject({
      status: "RUNTIME_ERROR",
      error: { code: "RUNTIME_ENVIRONMENT_LOST" },
    });
    expect(workers[1].postedMessages).toHaveLength(2);

    const manualPreparation = manager.prepareMission({
      setupData: { value: 20 },
    });
    expect(workers[1].postedMessages[2]).toMatchObject({
      type: "MISSION_PREPARE",
      requestId: "runtime-6",
      setupData: { value: 20 },
    });
    workers[1].emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-6",
    });
    await expect(manualPreparation).resolves.toEqual({ ok: true });

    const recoveredRun = manager.run({ code: "print(value)" });
    workers[1].emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-7",
      result: {
        status: "SUCCESS",
        stdout: "20\n",
        stderr: "",
      },
    });
    await expect(recoveredRun).resolves.toMatchObject({
      status: "SUCCESS",
      stdout: "20\n",
    });
  });

  it("does not attempt mission restoration when replacement initialization fails", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);
    const preparation = manager.prepareMission({ setupData: { value: 10 } });
    workers[0].emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-2",
    });
    await preparation;

    const timedRun = manager.run({ code: "while True: pass" });
    vi.advanceTimersByTime(25);
    workers[1].emitMessage({
      type: "RUNTIME_ERROR",
      requestId: "runtime-4",
      error: {
        code: "PYODIDE_INIT_FAILED",
        message: "replacement boot failed",
      },
    });

    await expect(timedRun).resolves.toMatchObject({
      status: "TIMEOUT",
      error: { code: "EXECUTION_TIMEOUT_RECOVERY_FAILED" },
    });
    expect(workers[1].postedMessages).toEqual([
      {
        type: "RUNTIME_INIT",
        requestId: "runtime-4",
        indexURL: LOCAL_INDEX_URL,
      },
    ]);
  });

  it("settles worker error and messageerror during automatic restoration without retrying", async () => {
    vi.useFakeTimers();

    for (const failureKind of ["error", "messageerror"] as const) {
      const { manager, workers } = await createReadyHarness(25);
      const preparation = manager.prepareMission({ setupData: { value: 10 } });
      workers[0].emitMessage({
        type: "MISSION_PREPARED",
        requestId: "runtime-2",
      });
      await preparation;

      const timedRun = manager.run({ code: "while True: pass" });
      vi.advanceTimersByTime(25);
      workers[1].emitMessage({ type: "READY", requestId: "runtime-4" });
      await Promise.resolve();

      if (failureKind === "error") {
        workers[1].emitError({ message: "restore worker error" });
      } else {
        workers[1].emitMessageError({ message: "restore decode error" });
      }

      await expect(timedRun).resolves.toMatchObject({
        status: "TIMEOUT",
        error: { code: "EXECUTION_TIMEOUT_RESTORE_FAILED" },
      });
      expect(workers).toHaveLength(2);
      expect(workers[1].postedMessages).toHaveLength(2);
      await expect(manager.run({ code: "print(value)" })).resolves.toMatchObject({
        status: "RUNTIME_ERROR",
        error: { code: "RUNTIME_ENVIRONMENT_LOST" },
      });
      manager.dispose();
    }
  });

  it("disposes safely while automatic restoration is pending and ignores its late response", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);
    const preparation = manager.prepareMission({ setupData: { value: 10 } });
    workers[0].emitMessage({
      type: "MISSION_PREPARED",
      requestId: "runtime-2",
    });
    await preparation;

    const timedRun = manager.run({ code: "while True: pass" });
    vi.advanceTimersByTime(25);
    const replacement = workers[1];
    replacement.emitMessage({ type: "READY", requestId: "runtime-4" });
    await Promise.resolve();
    expect(replacement.postedMessages[1]).toMatchObject({
      type: "MISSION_PREPARE",
      requestId: "runtime-5",
    });

    const recoveryInitialization = manager.initialize();
    const lateRestoreHandler = replacement.onmessage;
    manager.dispose();

    await expect(timedRun).resolves.toMatchObject({
      status: "RUNTIME_ERROR",
      error: { code: "RUNTIME_DISPOSED" },
    });
    await expect(recoveryInitialization).resolves.toMatchObject({
      ok: false,
      error: { code: "RUNTIME_DISPOSED" },
    });
    expect(replacement.terminateCount).toBe(1);

    lateRestoreHandler?.({
      data: {
        type: "MISSION_PREPARED",
        requestId: "runtime-5",
      },
    });
    await Promise.resolve();
    expect(workers).toHaveLength(2);
    await expect(manager.initialize()).resolves.toMatchObject({
      ok: false,
      error: { code: "RUNTIME_DISPOSED" },
    });
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

describe("MP.2 fresh-state Submit pipeline", () => {
  it("requires a successful mission preparation baseline before Submit", async () => {
    const { manager, workers } = await createReadyHarness();

    await expect(manager.submit({ code: "print('submit')" })).resolves.toMatchObject({
      status: "RUNTIME_ERROR",
      error: { code: "RUNTIME_MISSION_NOT_PREPARED" },
    });
    expect(workers[0].postedMessages).toEqual([
      {
        type: "RUNTIME_INIT",
        requestId: "runtime-1",
        indexURL: LOCAL_INDEX_URL,
      },
    ]);
  });

  it("forwards optional Run observations without sharing the caller array", async () => {
    const { manager, workers } = await createReadyHarness();
    const worker = workers[0];
    const observeVariables = ["answer"];

    const run = manager.run({ code: "answer = 42", observeVariables });
    observeVariables[0] = "mutated-after-send";

    expect(worker.postedMessages[1]).toEqual({
      type: "RUN_CODE",
      requestId: "runtime-2",
      code: "answer = 42",
      observeVariables: ["answer"],
    });

    worker.emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-2",
      result: {
        status: "SUCCESS",
        stdout: "",
        stderr: "",
        serialized: {
          variables: {
            answer: {
              pythonType: "int",
              isNdarray: false,
              value: 42,
            },
          },
        },
      },
    });

    await expect(run).resolves.toMatchObject({
      status: "SUCCESS",
      serialized: {
        variables: {
          answer: { value: 42 },
        },
      },
    });
  });

  it("forwards Submit observations and deep-copies the returned serialized payload", async () => {
    const { manager, workers } = await createReadyHarness();
    const worker = workers[0];
    const preparation = manager.prepareMission({ setupData: { value: 10 } });
    worker.emitMessage({ type: "MISSION_PREPARED", requestId: "runtime-2" });
    await preparation;

    const observeVariables = ["answer"];
    const submit = manager.submit({ code: "answer = value + 32", observeVariables });
    observeVariables.push("late-variable");

    expect(worker.postedMessages[2]).toEqual({
      type: "SUBMIT_CODE",
      requestId: "runtime-3",
      code: "answer = value + 32",
      observeVariables: ["answer"],
      runtimeConfig: undefined,
      setupData: { value: 10 },
    });

    const workerResult = {
      status: "SUCCESS" as const,
      stdout: "",
      stderr: "",
      serialized: {
        variables: {
          answer: {
            pythonType: "int",
            isNdarray: false,
            value: 42,
          },
        },
      },
    };
    worker.emitMessage({
      type: "SUBMIT_RESULT",
      requestId: "runtime-3",
      result: workerResult,
    });

    const result = await submit;
    workerResult.serialized.variables.answer.value = 99;

    expect(result.status).toBe("SUCCESS");
    if (result.status !== "SUCCESS") {
      throw new Error("Expected SUCCESS result");
    }
    expect(result.serialized).toEqual({
      variables: {
        answer: {
          pythonType: "int",
          isNdarray: false,
          value: 42,
        },
      },
    });
    expect(result.serialized).not.toBe(workerResult.serialized);
  });

  it("posts distinct SUBMIT_CODE with the saved clean baseline after a finite Run and leaves Run usable", async () => {
    const { manager, workers } = await createReadyHarness();
    const worker = workers[0];
    const baseline = {
      runtimeConfig: {},
      setupData: {
        value: 10,
        flag: true,
        nothing: null,
        items: [1, 2, 3],
        config: { name: "demo" },
      },
    };
    const preparation = manager.prepareMission(baseline);
    worker.emitMessage({ type: "MISSION_PREPARED", requestId: "runtime-2" });
    await preparation;

    const run = manager.run({ code: "value = 99\nitems.append(99)" });
    expect(worker.postedMessages[2]).toEqual({
      type: "RUN_CODE",
      requestId: "runtime-3",
      code: "value = 99\nitems.append(99)",
    });
    worker.emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-3",
      result: { status: "SUCCESS", stdout: "", stderr: "" },
    });
    await run;

    const submit = manager.submit({ code: "print(value)" });
    expect(worker.postedMessages[3]).toEqual({
      type: "SUBMIT_CODE",
      requestId: "runtime-4",
      code: "print(value)",
      runtimeConfig: {},
      setupData: {
        value: 10,
        flag: true,
        nothing: null,
        items: [1, 2, 3],
        config: { name: "demo" },
      },
    });
    worker.emitMessage({
      type: "SUBMIT_RESULT",
      requestId: "runtime-4",
      result: { status: "SUCCESS", stdout: "10\n", stderr: "" },
    });
    await expect(submit).resolves.toEqual({
      status: "SUCCESS",
      stdout: "10\n",
      stderr: "",
    });

    const runAfterSubmit = manager.run({ code: "print(value)" });
    expect(worker.postedMessages[4]).toEqual({
      type: "RUN_CODE",
      requestId: "runtime-5",
      code: "print(value)",
    });
    worker.emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-5",
      result: { status: "SUCCESS", stdout: "99\n", stderr: "" },
    });
    await expect(runAfterSubmit).resolves.toMatchObject({ status: "SUCCESS" });
  });

  it("starts every Submit from the same saved baseline snapshot", async () => {
    const { manager, workers } = await createReadyHarness();
    const worker = workers[0];
    const request = {
      runtimeConfig: {},
      setupData: {
        flag: true,
        nothing: null,
        items: [1, 2, 3],
        config: { name: "demo" },
      },
    };
    const preparation = manager.prepareMission(request);
    worker.emitMessage({ type: "MISSION_PREPARED", requestId: "runtime-2" });
    await preparation;

    request.setupData.flag = false;
    request.setupData.items.push(99);
    request.setupData.config.name = "mutated outside";

    const first = manager.submit({ code: "items.append(500)" });
    expect(worker.postedMessages[2]).toMatchObject({
      type: "SUBMIT_CODE",
      requestId: "runtime-3",
      setupData: {
        flag: true,
        nothing: null,
        items: [1, 2, 3],
        config: { name: "demo" },
      },
    });
    worker.emitMessage({
      type: "SUBMIT_RESULT",
      requestId: "runtime-3",
      result: { status: "SUCCESS", stdout: "", stderr: "" },
    });
    await first;

    const second = manager.submit({ code: "print(items)" });
    expect(worker.postedMessages[3]).toMatchObject({
      type: "SUBMIT_CODE",
      requestId: "runtime-4",
      setupData: {
        flag: true,
        nothing: null,
        items: [1, 2, 3],
        config: { name: "demo" },
      },
    });
    worker.emitMessage({
      type: "SUBMIT_RESULT",
      requestId: "runtime-4",
      result: { status: "SUCCESS", stdout: "[1, 2, 3]\n", stderr: "" },
    });
    await second;
  });

  it("keeps the latest successful preparation baseline when a later prepare fails, then replaces it after a later success", async () => {
    const { manager, workers } = await createReadyHarness();
    const worker = workers[0];

    const prepareA = manager.prepareMission({ setupData: { value: "A" } });
    worker.emitMessage({ type: "MISSION_PREPARED", requestId: "runtime-2" });
    await prepareA;

    const prepareB = manager.prepareMission({ setupData: { value: "B" } });
    worker.emitMessage({
      type: "RUNTIME_ERROR",
      requestId: "runtime-3",
      error: { code: "MISSION_PREPARE_FAILED", message: "B failed" },
    });
    await expect(prepareB).resolves.toMatchObject({ ok: false });

    const submitA = manager.submit({ code: "print(value)" });
    expect(worker.postedMessages[3]).toMatchObject({
      type: "SUBMIT_CODE",
      requestId: "runtime-4",
      setupData: { value: "A" },
    });
    worker.emitMessage({
      type: "SUBMIT_RESULT",
      requestId: "runtime-4",
      result: { status: "SUCCESS", stdout: "A\n", stderr: "" },
    });
    await submitA;

    const prepareC = manager.prepareMission({ setupData: { value: "C" } });
    worker.emitMessage({ type: "MISSION_PREPARED", requestId: "runtime-5" });
    await prepareC;

    const submitC = manager.submit({ code: "print(value)" });
    expect(worker.postedMessages[5]).toMatchObject({
      type: "SUBMIT_CODE",
      requestId: "runtime-6",
      setupData: { value: "C" },
    });
    worker.emitMessage({
      type: "SUBMIT_RESULT",
      requestId: "runtime-6",
      result: { status: "SUCCESS", stdout: "C\n", stderr: "" },
    });
    await submitC;
  });

  it("guards Run, Submit, and prepareMission concurrency while Submit is pending and reuses READY initialize", async () => {
    const { manager, workers } = await createReadyHarness();
    const worker = workers[0];
    const preparation = manager.prepareMission({ setupData: { value: 10 } });
    worker.emitMessage({ type: "MISSION_PREPARED", requestId: "runtime-2" });
    await preparation;

    const submit = manager.submit({ code: "slow_submit()" });
    await expect(manager.run({ code: "run_race()" })).resolves.toMatchObject({
      status: "RUNTIME_ERROR",
      error: { code: "RUNTIME_BUSY" },
    });
    await expect(manager.submit({ code: "submit_race()" })).resolves.toMatchObject({
      status: "RUNTIME_ERROR",
      error: { code: "RUNTIME_BUSY" },
    });
    await expect(manager.prepareMission({ setupData: { value: 20 } })).resolves.toMatchObject({
      ok: false,
      error: { code: "RUNTIME_BUSY" },
    });
    await expect(manager.initialize()).resolves.toEqual({ ok: true });
    expect(workers).toHaveLength(1);
    expect(worker.postedMessages).toHaveLength(3);

    worker.emitMessage({
      type: "SUBMIT_RESULT",
      requestId: "runtime-3",
      result: { status: "SUCCESS", stdout: "", stderr: "" },
    });
    await submit;
  });

  it("ignores a wrong SUBMIT_RESULT request ID and settles only the correlated response", async () => {
    const { manager, workers } = await createReadyHarness();
    const worker = workers[0];
    const preparation = manager.prepareMission({ setupData: { value: 10 } });
    worker.emitMessage({ type: "MISSION_PREPARED", requestId: "runtime-2" });
    await preparation;

    const submit = manager.submit({ code: "print(value)" });
    let settled = false;
    void submit.then(() => {
      settled = true;
    });
    worker.emitMessage({
      type: "SUBMIT_RESULT",
      requestId: "runtime-wrong",
      result: { status: "SUCCESS", stdout: "wrong\n", stderr: "" },
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    worker.emitMessage({
      type: "SUBMIT_RESULT",
      requestId: "runtime-3",
      result: { status: "SUCCESS", stdout: "10\n", stderr: "" },
    });
    await expect(submit).resolves.toEqual({
      status: "SUCCESS",
      stdout: "10\n",
      stderr: "",
    });
  });

  it("preserves Submit Python-exception output and keeps the worker usable", async () => {
    const { manager, workers } = await createReadyHarness();
    const worker = workers[0];
    const preparation = manager.prepareMission({ setupData: { value: 10 } });
    worker.emitMessage({ type: "MISSION_PREPARED", requestId: "runtime-2" });
    await preparation;

    const submit = manager.submit({ code: "print('before')\nraise ValueError('boom')" });
    worker.emitMessage({
      type: "SUBMIT_RESULT",
      requestId: "runtime-3",
      result: {
        status: "PYTHON_EXCEPTION",
        stdout: "before\n",
        stderr: "",
        exception: {
          type: "ValueError",
          message: "boom",
          traceback: "trace",
        },
      },
    });
    await expect(submit).resolves.toMatchObject({
      status: "PYTHON_EXCEPTION",
      stdout: "before\n",
      exception: { type: "ValueError", message: "boom" },
    });

    const run = manager.run({ code: "print(value)" });
    worker.emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-4",
      result: { status: "SUCCESS", stdout: "10\n", stderr: "" },
    });
    await expect(run).resolves.toMatchObject({ status: "SUCCESS", stdout: "10\n" });
  });

  it("reuses PR.5/PR.6 timeout recovery for Submit without replaying submitted code", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);
    const oldWorker = workers[0];
    const preparation = manager.prepareMission({
      runtimeConfig: {},
      setupData: { value: 10, items: [1, 2, 3], nothing: null },
    });
    oldWorker.emitMessage({ type: "MISSION_PREPARED", requestId: "runtime-2" });
    await preparation;

    const submit = manager.submit({ code: "while True: pass" });
    const staleHandler = oldWorker.onmessage;
    expect(oldWorker.postedMessages[2]).toMatchObject({
      type: "SUBMIT_CODE",
      requestId: "runtime-3",
      code: "while True: pass",
    });

    vi.advanceTimersByTime(25);
    expect(oldWorker.terminateCount).toBe(1);
    expect(workers).toHaveLength(2);
    const replacement = workers[1];
    expect(replacement.postedMessages).toEqual([
      {
        type: "RUNTIME_INIT",
        requestId: "runtime-4",
        indexURL: LOCAL_INDEX_URL,
      },
    ]);

    staleHandler?.({
      data: {
        type: "SUBMIT_RESULT",
        requestId: "runtime-3",
        result: { status: "SUCCESS", stdout: "too late\n", stderr: "" },
      },
    });
    replacement.emitMessage({ type: "READY", requestId: "runtime-4" });
    await Promise.resolve();
    expect(replacement.postedMessages[1]).toEqual({
      type: "MISSION_PREPARE",
      requestId: "runtime-5",
      runtimeConfig: {},
      setupData: { value: 10, items: [1, 2, 3], nothing: null },
    });
    replacement.emitMessage({ type: "MISSION_PREPARED", requestId: "runtime-5" });

    await expect(submit).resolves.toMatchObject({
      status: "TIMEOUT",
      error: { code: "EXECUTION_TIMEOUT" },
    });
    expect(
      replacement.postedMessages.filter((message) => message.type === "SUBMIT_CODE"),
    ).toEqual([]);

    const run = manager.run({ code: "print(value)" });
    expect(replacement.postedMessages[2]).toEqual({
      type: "RUN_CODE",
      requestId: "runtime-6",
      code: "print(value)",
    });
    replacement.emitMessage({
      type: "RUN_RESULT",
      requestId: "runtime-6",
      result: { status: "SUCCESS", stdout: "10\n", stderr: "" },
    });
    await expect(run).resolves.toMatchObject({ status: "SUCCESS", stdout: "10\n" });
  });

  it("settles a pending Submit as disposed, clears its timer, and never creates a replacement worker", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await createReadyHarness(25);
    const worker = workers[0];
    const preparation = manager.prepareMission({ setupData: { value: 10 } });
    worker.emitMessage({ type: "MISSION_PREPARED", requestId: "runtime-2" });
    await preparation;

    const submit = manager.submit({ code: "while True: pass" });
    const lateHandler = worker.onmessage;
    manager.dispose();

    await expect(submit).resolves.toMatchObject({
      status: "RUNTIME_ERROR",
      error: { code: "RUNTIME_DISPOSED" },
    });
    expect(worker.terminateCount).toBe(1);
    vi.advanceTimersByTime(100);
    expect(workers).toHaveLength(1);

    lateHandler?.({
      data: {
        type: "SUBMIT_RESULT",
        requestId: "runtime-3",
        result: { status: "SUCCESS", stdout: "late\n", stderr: "" },
      },
    });
    await expect(manager.initialize()).resolves.toMatchObject({
      ok: false,
      error: { code: "RUNTIME_DISPOSED" },
    });
  });
});

describe("RuntimeManager public result serialization", () => {

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
