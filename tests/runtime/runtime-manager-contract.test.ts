import { describe, expect, it } from "vitest";

import type { JsonObject } from "../../src/core/domain";
import {
  RUNTIME_EXECUTION_STATUS,
  type RuntimeExecutionRequest,
  type RuntimeExecutionResult,
  type RuntimeLifecycleResult,
  type RuntimeManager,
  type RuntimeMissionPreparationRequest,
} from "../../src/core/runtime";

const lifecycleSuccess: RuntimeLifecycleResult = { ok: true };
const lifecycleFailure: RuntimeLifecycleResult = {
  ok: false,
  error: { code: "BOOT_FAILED", message: "Runtime unavailable" },
};

const executionFixtures = {
  success: {
    status: RUNTIME_EXECUTION_STATUS.SUCCESS,
    stdout: "hello\n",
    stderr: "",
    serialized: { value: 3, nested: { ready: true } },
  },
  pythonException: {
    status: RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION,
    stdout: "before failure\n",
    stderr: "ValueError\n",
    exception: {
      type: "ValueError",
      message: "bad value",
      traceback: "Traceback ...",
    },
    serialized: { partial: [1, 2] },
  },
  runtimeError: {
    status: RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR,
    stdout: "",
    stderr: "",
    error: { code: "WORKER_FAILED", message: "Runtime infrastructure failed" },
  },
  timeout: {
    status: RUNTIME_EXECUTION_STATUS.TIMEOUT,
    stdout: "partial output\n",
    stderr: "",
    error: { code: "TIME_LIMIT", message: "Execution timed out" },
  },
} satisfies Record<string, RuntimeExecutionResult>;

class FakeRuntimeManager implements RuntimeManager {
  initialize(): Promise<RuntimeLifecycleResult> {
    return Promise.resolve(lifecycleSuccess);
  }

  prepareMission(
    request: RuntimeMissionPreparationRequest,
  ): Promise<RuntimeLifecycleResult> {
    return Promise.resolve(
      request.runtimeConfig?.forceFailure === true
        ? lifecycleFailure
        : lifecycleSuccess,
    );
  }

  run(_request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    return Promise.resolve(executionFixtures.success);
  }

  submit(_request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    return Promise.resolve(executionFixtures.pythonException);
  }

  dispose(): void {}
}

describe("RuntimeManager public contract", () => {
  it("allows a simple browser-neutral fake to conform to RuntimeManager", async () => {
    const manager: RuntimeManager = new FakeRuntimeManager();

    await expect(manager.initialize()).resolves.toEqual({ ok: true });
    expect(() => manager.dispose()).not.toThrow();
  });

  it("represents lifecycle success and structured system failure", async () => {
    const manager = new FakeRuntimeManager();

    await expect(manager.prepareMission({})).resolves.toEqual(lifecycleSuccess);
    await expect(
      manager.prepareMission({ runtimeConfig: { forceFailure: true } }),
    ).resolves.toEqual(lifecycleFailure);
  });

  it("keeps run and submit as distinct public operations", async () => {
    const manager = new FakeRuntimeManager();
    const request: RuntimeExecutionRequest = { code: "print('hello')" };

    await expect(manager.run(request)).resolves.toEqual(executionFixtures.success);
    await expect(manager.submit(request)).resolves.toEqual(
      executionFixtures.pythonException,
    );
  });
});

describe("Runtime execution result contracts", () => {
  it("exports the four normalized execution statuses", () => {
    expect(RUNTIME_EXECUTION_STATUS).toEqual({
      SUCCESS: "SUCCESS",
      PYTHON_EXCEPTION: "PYTHON_EXCEPTION",
      RUNTIME_ERROR: "RUNTIME_ERROR",
      TIMEOUT: "TIMEOUT",
    });
  });

  it.each(Object.entries(executionFixtures))(
    "represents %s with normalized stdout and stderr strings",
    (_name, result) => {
      expect(typeof result.stdout).toBe("string");
      expect(typeof result.stderr).toBe("string");
    },
  );

  it("keeps learner exceptions separate from runtime infrastructure errors", () => {
    const learnerFailure = executionFixtures.pythonException;
    const systemFailure = executionFixtures.runtimeError;

    expect(learnerFailure.status).toBe("PYTHON_EXCEPTION");
    expect(learnerFailure.exception.type).toBe("ValueError");
    expect(systemFailure.status).toBe("RUNTIME_ERROR");
    expect(systemFailure.error.code).toBe("WORKER_FAILED");
  });

  it("represents timeout as a contract outcome without timer behavior", () => {
    expect(executionFixtures.timeout).toMatchObject({
      status: "TIMEOUT",
      stdout: "partial output\n",
      stderr: "",
    });
  });
});

describe("JSON-safe runtime payload boundary", () => {
  it("composes mission preparation and serialized results with JsonObject", () => {
    const runtimeConfig: JsonObject = {
      packages: ["numpy"],
      flags: { isolated: true },
    };
    const setupData: JsonObject = {
      values: [1, 2, 3],
      label: "sample",
    };
    const request: RuntimeMissionPreparationRequest = {
      runtimeConfig,
      setupData,
    };
    const serialized: JsonObject = executionFixtures.success.serialized;

    expect(request.runtimeConfig).toBe(runtimeConfig);
    expect(request.setupData).toBe(setupData);
    expect(serialized).toEqual({ value: 3, nested: { ready: true } });
  });

  it("uses readonly request contracts without requiring mutation", () => {
    const executionRequest: RuntimeExecutionRequest = { code: "x = 1" };
    const preparationRequest: RuntimeMissionPreparationRequest = {
      setupData: { x: 1 },
    };

    expect(executionRequest.code).toBe("x = 1");
    expect(preparationRequest.setupData).toEqual({ x: 1 });
  });
});
