import { describe, expect, it } from "vitest";

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

async function createReadyHarness() {
  const harness = createHarness();
  const initialization = harness.manager.initialize();
  harness.workers[0].emitMessage({
    type: "READY",
    requestId: "runtime-1",
  });
  await initialization;
  return harness;
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

describe("PR.4 deferred RuntimeManager operations", () => {
  it("keeps submit unimplemented and distinct from run execution", async () => {
    const { manager, workers } = createHarness();
    const initialization = manager.initialize();
    workers[0].emitMessage({ type: "READY", requestId: "runtime-1" });
    await initialization;

    const submitResult = await manager.submit({ code: "print('submit')" });

    expect(submitResult).toEqual({
      status: "RUNTIME_ERROR",
      stdout: "",
      stderr: "",
      error: {
        code: "NOT_IMPLEMENTED",
        message: "submit chưa được triển khai trong PR.3.",
      },
    });
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
