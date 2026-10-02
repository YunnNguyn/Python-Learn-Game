import { loadPyodide, type PyodideInterface } from "pyodide";
import type { PyProxy } from "pyodide/ffi";

import type { JsonObject } from "../../domain";
import {
  RUNTIME_EXECUTION_STATUS,
  type RuntimeExecutionResult,
  type RuntimePythonException,
  type RuntimeSystemError,
} from "../runtime-contracts";
import {
  isRuntimeInitWorkerRequest,
  isRuntimeMissionPrepareWorkerRequest,
  isRuntimeRunCodeWorkerRequest,
  type RuntimeErrorWorkerResponse,
  type RuntimeMissionPreparedWorkerResponse,
  type RuntimeReadyWorkerResponse,
  type RuntimeRunResultWorkerResponse,
} from "./worker-protocol";
import { createPythonSetupNamespace } from "./setup-conversion";
import { validateSetupKeys } from "./setup-validation";

interface RuntimeWorkerScope {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  postMessage(
    message:
      | RuntimeReadyWorkerResponse
      | RuntimeMissionPreparedWorkerResponse
      | RuntimeRunResultWorkerResponse
      | RuntimeErrorWorkerResponse,
  ): void;
}

const workerScope = globalThis as unknown as RuntimeWorkerScope;
let initializationPromise: Promise<PyodideInterface> | null = null;
let runtime: PyodideInterface | null = null;
let activeNamespace: PyProxy | null = null;
let activeOperationRequestId: string | null = null;

workerScope.onmessage = (event) => {
  if (isRuntimeInitWorkerRequest(event.data)) {
    void initializeRuntime(event.data.requestId, event.data.indexURL);
    return;
  }

  if (isRuntimeMissionPrepareWorkerRequest(event.data)) {
    void prepareMission(
      event.data.requestId,
      event.data.runtimeConfig,
      event.data.setupData,
    );
    return;
  }

  if (isRuntimeRunCodeWorkerRequest(event.data)) {
    void runCode(event.data.requestId, event.data.code);
  }
};

async function initializeRuntime(
  requestId: string,
  indexURL: string,
): Promise<void> {
  try {
    initializationPromise ??= loadPyodide({ indexURL });
    runtime = await initializationPromise;
    activeNamespace ??= createPythonSetupNamespace(runtime, {});

    workerScope.postMessage({
      type: "READY",
      requestId,
    });
  } catch (error) {
    workerScope.postMessage({
      type: "RUNTIME_ERROR",
      requestId,
      error: normalizeInitializationError(error),
    });
  }
}

async function prepareMission(
  requestId: string,
  runtimeConfig: JsonObject | undefined,
  setupData: JsonObject | undefined,
): Promise<void> {
  if (runtime === null) {
    postRuntimeError(
      requestId,
      "RUNTIME_NOT_READY",
      "Python runtime chưa sẵn sàng để chuẩn bị môi trường.",
    );
    return;
  }

  if (activeOperationRequestId !== null) {
    postRuntimeError(
      requestId,
      "RUNTIME_BUSY",
      "Python runtime đang xử lý một thao tác khác.",
    );
    return;
  }

  activeOperationRequestId = requestId;
  let candidateNamespace: PyProxy | null = null;

  try {
    if (
      runtimeConfig !== undefined &&
      Object.keys(runtimeConfig).length > 0
    ) {
      postRuntimeError(
        requestId,
        "UNSUPPORTED_RUNTIME_CONFIG",
        "runtimeConfig hiện chỉ hỗ trợ undefined hoặc object rỗng.",
      );
      return;
    }

    const setup = setupData ?? {};
    const validationError = validateSetupKeys(
      {
        setGlobal: (name, value) => runtime?.globals.set(name, value),
        deleteGlobal: (name) => runtime?.globals.delete(name),
        runPython: (code) => runtime?.runPython(code),
      },
      setup,
    );
    if (validationError !== null) {
      workerScope.postMessage({
        type: "RUNTIME_ERROR",
        requestId,
        error: validationError,
      });
      return;
    }

    candidateNamespace = createPythonSetupNamespace(runtime, setup);

    const previousNamespace = activeNamespace;
    activeNamespace = candidateNamespace;
    candidateNamespace = null;
    previousNamespace?.destroy();

    workerScope.postMessage({
      type: "MISSION_PREPARED",
      requestId,
    });
  } catch (error) {
    candidateNamespace?.destroy();
    postRuntimeError(
      requestId,
      "MISSION_PREPARE_FAILED",
      getErrorMessage(error, "Không thể chuẩn bị môi trường Python."),
    );
  } finally {
    activeOperationRequestId = null;
  }
}

async function runCode(requestId: string, code: string): Promise<void> {
  if (runtime === null) {
    postRunResult(
      requestId,
      executionFailure(
        "RUNTIME_NOT_READY",
        "Python runtime chưa sẵn sàng để chạy mã.",
      ),
    );
    return;
  }

  if (activeOperationRequestId !== null) {
    postRunResult(
      requestId,
      executionFailure(
        "RUNTIME_BUSY",
        "Python runtime đang xử lý một thao tác khác.",
      ),
    );
    return;
  }

  activeOperationRequestId = requestId;

  try {
    activeNamespace ??= createPythonSetupNamespace(runtime, {});
    postRunResult(
      requestId,
      await executePython(runtime, activeNamespace, code),
    );
  } catch (error) {
    postRunResult(
      requestId,
      executionFailure(
        "PYODIDE_EXECUTION_FAILED",
        getErrorMessage(error, "Pyodide không thể thực thi mã Python."),
      ),
    );
  } finally {
    activeOperationRequestId = null;
  }
}

async function executePython(
  pyodide: PyodideInterface,
  globals: PyProxy,
  code: string,
): Promise<RuntimeExecutionResult> {
  const stdoutCapture = createOutputCapture();
  const stderrCapture = createOutputCapture();
  let executionValue: unknown;

  pyodide.setStdout(stdoutCapture.writer);
  pyodide.setStderr(stderrCapture.writer);

  try {
    executionValue = await pyodide.runPythonAsync(code, { globals });
    destroyPyProxy(pyodide, executionValue);
    executionValue = undefined;

    return {
      status: RUNTIME_EXECUTION_STATUS.SUCCESS,
      stdout: stdoutCapture.finish(),
      stderr: stderrCapture.finish(),
    };
  } catch (error) {
    destroyPyProxy(pyodide, executionValue);
    executionValue = undefined;

    if (error instanceof pyodide.ffi.PythonError) {
      return {
        status: RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION,
        stdout: stdoutCapture.finish(),
        stderr: stderrCapture.finish(),
        exception: normalizePythonException(error),
      };
    }

    return executionFailure(
      "PYODIDE_EXECUTION_FAILED",
      getErrorMessage(error, "Pyodide không thể thực thi mã Python."),
      stdoutCapture.finish(),
      stderrCapture.finish(),
    );
  } finally {
    pyodide.setStdout();
    pyodide.setStderr();
  }
}

interface OutputCapture {
  readonly writer: {
    write(buffer: Uint8Array): number;
  };
  finish(): string;
}

function createOutputCapture(): OutputCapture {
  const decoder = new TextDecoder();
  let output = "";
  let finished = false;

  return {
    writer: {
      write(buffer) {
        output += decoder.decode(buffer, { stream: true });
        return buffer.length;
      },
    },
    finish() {
      if (!finished) {
        output += decoder.decode();
        finished = true;
      }

      return output;
    },
  };
}

function destroyPyProxy(pyodide: PyodideInterface, value: unknown): void {
  if (value instanceof pyodide.ffi.PyProxy) {
    value.destroy();
  }
}

function normalizePythonException(
  error: Error & { readonly type: string },
): RuntimePythonException {
  return {
    type: error.type,
    message: getErrorMessage(error, "Python gặp lỗi khi thực thi mã."),
  };
}

function postRunResult(
  requestId: string,
  result: RuntimeExecutionResult,
): void {
  workerScope.postMessage({
    type: "RUN_RESULT",
    requestId,
    result,
  });
}

function postRuntimeError(
  requestId: string,
  code: string,
  message: string,
): void {
  workerScope.postMessage({
    type: "RUNTIME_ERROR",
    requestId,
    error: { code, message },
  });
}

function executionFailure(
  code: string,
  message: string,
  stdout = "",
  stderr = "",
): RuntimeExecutionResult {
  return {
    status: RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR,
    stdout,
    stderr,
    error: { code, message },
  };
}

function normalizeInitializationError(error: unknown): RuntimeSystemError {
  return {
    code: "PYODIDE_INIT_FAILED",
    message: getErrorMessage(error, "Không thể khởi tạo Pyodide."),
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim().length > 0
  ) {
    return error.message;
  }

  return fallback;
}
