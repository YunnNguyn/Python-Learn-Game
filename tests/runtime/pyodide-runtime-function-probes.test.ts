import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PyodideRuntimeManager,
  type RuntimeWorkerPort,
} from "../../src/core/runtime/pyodide/pyodide-runtime-manager";
import {
  isRuntimeSubmitCodeWorkerRequest,
  type RuntimeWorkerRequest,
} from "../../src/core/runtime/pyodide/worker-protocol";
import {
  FunctionProbeObservationSchema,
  FunctionProbeSpecSchema,
  RuntimeVariableObservationsSchema,
} from "../../src/core/runtime";

/**
 * PHASE-07 / M9: the transport of function probes. The manager forwards them on Submit
 * only (never on Run), the worker protocol guard accepts them, and the execution
 * deadline that already covers a Submit covers the probes too - they run inside it.
 */

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
}

async function readyManager(executionTimeoutMs = 5_000) {
  const workers: FakeWorker[] = [];
  const manager = new PyodideRuntimeManager({
    indexURL: "http://local.test/app/assets/pyodide/",
    executionTimeoutMs,
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
  });
  const init = manager.initialize();
  workers[0]!.emitMessage({ type: "READY", requestId: "runtime-1" });
  await init;
  return { manager, workers };
}

afterEach(() => {
  vi.useRealTimers();
});

const PROBES = [{ function: "total", cases: [{ args: [[1, 2, 3]] }, { args: [[]], checkArgsUnchanged: true }] }];

describe("function probes through the runtime manager", () => {
  it("forwards functionProbes on Submit, with the baseline, and only when there are some", async () => {
    const { manager, workers } = await readyManager();
    const worker = workers[0]!;
    const prepared = manager.prepareMission({ runtimeConfig: {}, setupData: { k: 1 } });
    worker.emitMessage({ type: "MISSION_PREPARED", requestId: "runtime-2" });
    await prepared;

    const submit = manager.submit({ code: "def total(v):\n    return sum(v)", observeVariables: [], functionProbes: PROBES });
    expect(worker.postedMessages[2]).toEqual({
      type: "SUBMIT_CODE",
      requestId: "runtime-3",
      code: "def total(v):\n    return sum(v)",
      observeVariables: [],
      functionProbes: PROBES,
      runtimeConfig: {},
      setupData: { k: 1 },
    });
    expect(isRuntimeSubmitCodeWorkerRequest(worker.postedMessages[2])).toBe(true);
    worker.emitMessage({ type: "SUBMIT_RESULT", requestId: "runtime-3", result: { status: "SUCCESS", stdout: "", stderr: "" } });
    await submit;

    const plain = manager.submit({ code: "x = 1", observeVariables: ["x"], functionProbes: [] });
    expect("functionProbes" in worker.postedMessages[3]!).toBe(false);
    worker.emitMessage({ type: "SUBMIT_RESULT", requestId: "runtime-4", result: { status: "SUCCESS", stdout: "", stderr: "" } });
    await plain;
  });

  it("never forwards functionProbes on Run", async () => {
    const { manager, workers } = await readyManager();
    const worker = workers[0]!;
    const run = manager.run({ code: "print(1)", functionProbes: PROBES });
    expect(worker.postedMessages[1]).toEqual({ type: "RUN_CODE", requestId: "runtime-2", code: "print(1)" });
    worker.emitMessage({ type: "RUN_RESULT", requestId: "runtime-2", result: { status: "SUCCESS", stdout: "1\n", stderr: "" } });
    await run;
  });

  it("a Submit with probes that never finishes hits the existing execution deadline, and is not replayed", async () => {
    vi.useFakeTimers();
    const { manager, workers } = await readyManager(25);
    const oldWorker = workers[0]!;
    const preparation = manager.prepareMission({ runtimeConfig: {}, setupData: { k: 1 } });
    oldWorker.emitMessage({ type: "MISSION_PREPARED", requestId: "runtime-2" });
    await preparation;

    const submit = manager.submit({ code: "def total(v):\n    while True:\n        pass", observeVariables: [], functionProbes: PROBES });
    expect(oldWorker.postedMessages[2]).toMatchObject({ type: "SUBMIT_CODE", functionProbes: PROBES });

    vi.advanceTimersByTime(25);
    expect(oldWorker.terminateCount).toBe(1);
    expect(workers).toHaveLength(2);
    const replacement = workers[1]!;
    replacement.emitMessage({ type: "READY", requestId: "runtime-4" });
    await Promise.resolve();
    replacement.emitMessage({ type: "MISSION_PREPARED", requestId: "runtime-5" });

    await expect(submit).resolves.toMatchObject({ status: "TIMEOUT", error: { code: "EXECUTION_TIMEOUT" } });
    expect(replacement.postedMessages.filter((message) => message.type === "SUBMIT_CODE")).toEqual([]);
  });

  it("dispose() while the probes run terminates the worker and resolves the Submit as disposed (cancellation)", async () => {
    const { manager, workers } = await readyManager();
    const preparation = manager.prepareMission({ runtimeConfig: {}, setupData: {} });
    workers[0]!.emitMessage({ type: "MISSION_PREPARED", requestId: "runtime-2" });
    await preparation;
    const submit = manager.submit({ code: "def total(v):\n    return 1", observeVariables: [], functionProbes: PROBES });
    manager.dispose();
    expect(workers[0]!.terminateCount).toBe(1);
    await expect(submit).resolves.toMatchObject({ status: "RUNTIME_ERROR", error: { code: "RUNTIME_DISPOSED" } });
  });
});

describe("probe schemas", () => {
  it("accept the shapes the helper produces and the engine sends", () => {
    expect(FunctionProbeSpecSchema.safeParse(PROBES[0]).success).toBe(true);
    for (const entry of [
      { function: "f", status: "OK", cases: [{ outcome: "returned", pythonType: "int", value: 1 }] },
      { function: "f", status: "OK", cases: [{ outcome: "raised", exceptionType: "ValueError", exceptionMro: ["ValueError"], message: "x", argsMutated: false }] },
      { function: "f", status: "OK", cases: [{ outcome: "unsupported", pythonType: "generator", reason: "r" }] },
      { function: "f", status: "MISSING", cases: [] },
    ]) {
      expect(FunctionProbeObservationSchema.safeParse(entry).success, JSON.stringify(entry)).toBe(true);
    }
    expect(RuntimeVariableObservationsSchema.safeParse({ variables: {}, functionResults: [] }).success).toBe(true);
    expect(RuntimeVariableObservationsSchema.safeParse({ variables: {} }).success).toBe(true);
  });

  it("reject unknown fields and unknown outcomes (the payload is strict)", () => {
    expect(FunctionProbeObservationSchema.safeParse({ function: "f", status: "OK", cases: [{ outcome: "returned", pythonType: "int", value: 1, extra: 1 }] }).success).toBe(false);
    expect(FunctionProbeObservationSchema.safeParse({ function: "f", status: "OK", cases: [{ outcome: "exploded" }] }).success).toBe(false);
    expect(FunctionProbeObservationSchema.safeParse({ function: "f", status: "WEIRD", cases: [] }).success).toBe(false);
    expect(RuntimeVariableObservationsSchema.safeParse({ variables: {}, other: 1 }).success).toBe(false);
  });
});
