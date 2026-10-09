import { describe, expect, it } from "vitest";

import {
  LocalPythonRuntimeManager,
  type FetchLike,
  type FetchResponseLike,
} from "../../src/core/runtime/local-python";

interface QueuedResponse {
  readonly status?: number;
  readonly body: unknown;
}

function createFetchQueue(responses: readonly QueuedResponse[]) {
  const calls: Array<{ input: string; init?: Parameters<FetchLike>[1] }> = [];
  let index = 0;
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ input, init });
    const next = responses[index++];
    if (!next) throw new Error("No queued response");
    const status = next.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => next.body,
    } satisfies FetchResponseLike;
  };
  return { fetchImpl, calls };
}

const health = {
  ok: true,
  service: "python-learn-runtime",
  protocolVersion: 2,
  pythonVersion: "3.13.7",
  pythonExecutable: "C:/Python/python.exe",
  pid: 1234,
};

const workspace = {
  datasets: [
    {
      filename: "telemetry.csv",
      relativePath: "data/telemetry.csv",
      bytes: 42,
      description: "Telemetry fixture",
    },
  ],
  artifacts: [],
};

const observations = {
  variables: {
    answer: {
      pythonType: "int",
      isNdarray: false,
      value: 15,
    },
  },
};

describe("LocalPythonRuntimeManager", () => {
  it("health-checks, creates a session, and reuses the ready session", async () => {
    const { fetchImpl, calls } = createFetchQueue([
      { body: health },
      { status: 201, body: { sessionId: "session-1" } },
    ]);
    const manager = new LocalPythonRuntimeManager({ baseUrl: "http://127.0.0.1:8765/", fetchImpl });

    await expect(manager.initialize()).resolves.toEqual({ ok: true });
    await expect(manager.initialize()).resolves.toEqual({ ok: true });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.input).toBe("http://127.0.0.1:8765/health");
    expect(calls[1]?.input).toBe("http://127.0.0.1:8765/sessions");
  });

  it("prepares setup data and runtime config for the session", async () => {
    const { fetchImpl, calls } = createFetchQueue([
      { body: health },
      { status: 201, body: { sessionId: "abc" } },
      { body: { ok: true, workspace } },
    ]);
    const manager = new LocalPythonRuntimeManager({ fetchImpl });
    await manager.initialize();

    await expect(
      manager.prepareMission({
        runtimeConfig: { executionTimeoutSeconds: 45 },
        setupData: { values: [2, 5, 8] },
      }),
    ).resolves.toEqual({ ok: true, workspace });

    expect(calls[2]?.input).toContain("/sessions/abc/prepare");
    expect(JSON.parse(calls[2]?.init?.body ?? "{}")).toEqual({
      runtimeConfig: { executionTimeoutSeconds: 45 },
      setupData: { values: [2, 5, 8] },
    });
  });

  it("normalizes successful submit observations", async () => {
    const { fetchImpl, calls } = createFetchQueue([
      { body: health },
      { status: 201, body: { sessionId: "abc" } },
      {
        body: {
          status: "SUCCESS",
          stdout: "15\n",
          stderr: "",
          serialized: observations,
          workspace: {
            ...workspace,
            artifacts: [
              {
                filename: "predictions.csv",
                relativePath: "artifacts/predictions.csv",
                bytes: 18,
                extension: "csv",
                category: "csv",
              },
            ],
          },
        },
      },
    ]);
    const manager = new LocalPythonRuntimeManager({ fetchImpl });
    await manager.initialize();

    await expect(
      manager.submit({ code: "answer = 15", observeVariables: ["answer"] }),
    ).resolves.toEqual({
      status: "SUCCESS",
      stdout: "15\n",
      stderr: "",
      serialized: observations,
      workspace: {
        ...workspace,
        artifacts: [
          {
            filename: "predictions.csv",
            relativePath: "artifacts/predictions.csv",
            bytes: 18,
            extension: "csv",
            category: "csv",
          },
        ],
      },
    });

    expect(JSON.parse(calls[2]?.init?.body ?? "{}")).toEqual({
      kind: "SUBMIT",
      code: "answer = 15",
      observeVariables: ["answer"],
    });
  });

  it("preserves Python exception traceback and partial observations", async () => {
    const { fetchImpl } = createFetchQueue([
      { body: health },
      { status: 201, body: { sessionId: "abc" } },
      {
        body: {
          status: "PYTHON_EXCEPTION",
          stdout: "",
          stderr: "",
          exception: {
            type: "ValueError",
            message: "boom",
            traceback: 'File "main.py", line 2',
          },
          serialized: observations,
        },
      },
    ]);
    const manager = new LocalPythonRuntimeManager({ fetchImpl });
    await manager.initialize();

    const result = await manager.run({ code: "x = 1\nraise ValueError('boom')" });
    expect(result.status).toBe("PYTHON_EXCEPTION");
    if (result.status === "PYTHON_EXCEPTION") {
      expect(result.exception.traceback).toContain("line 2");
      expect(result.serialized).toEqual(observations);
    }
  });

  it("exposes interrupt and disposes the remote session", async () => {
    const { fetchImpl, calls } = createFetchQueue([
      { body: health },
      { status: 201, body: { sessionId: "abc" } },
      { body: { ok: true } },
      { body: { ok: true } },
    ]);
    const manager = new LocalPythonRuntimeManager({ fetchImpl });
    await manager.initialize();

    await expect(manager.interrupt()).resolves.toEqual({ ok: true });
    manager.dispose();
    await Promise.resolve();

    expect(calls[2]?.input).toContain("/sessions/abc/interrupt");
    expect(calls[3]?.input).toBe("http://127.0.0.1:8765/sessions/abc");
    expect(calls[3]?.init?.method).toBe("DELETE");
  });

  it("reports a useful error when the local service is unavailable", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError("Failed to fetch");
    };
    const manager = new LocalPythonRuntimeManager({ fetchImpl });

    const result = await manager.initialize();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("LOCAL_RUNTIME_UNAVAILABLE");
      expect(result.error.message).toContain("Failed to fetch");
    }
  });
});
