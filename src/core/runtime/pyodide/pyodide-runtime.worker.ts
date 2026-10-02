import { loadPyodide, type PyodideInterface } from "pyodide";

import {
  RUNTIME_EXECUTION_STATUS,
  type RuntimeExecutionResult,
  type RuntimePythonException,
  type RuntimeSystemError,
} from "../runtime-contracts";
import {
  isRuntimeInitWorkerRequest,
  isRuntimeRunCodeWorkerRequest,
  type RuntimeErrorWorkerResponse,
  type RuntimeReadyWorkerResponse,
  type RuntimeRunResultWorkerResponse,
} from "./worker-protocol";

interface RuntimeWorkerScope {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  postMessage(
    message:
      | RuntimeReadyWorkerResponse
      | RuntimeRunResultWorkerResponse
      | RuntimeErrorWorkerResponse,
  ): void;
}

const workerScope = globalThis as unknown as RuntimeWorkerScope;
let initializationPromise: Promise<PyodideInterface> | null = null;
let runtime: PyodideInterface | null = null;
let activeRunRequestId: string | null = null;

workerScope.onmessage = (event) => {
  if (isRuntimeInitWorkerRequest(event.data)) {
    void initializeRuntime(event.data.requestId, event.data.indexURL);
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

  if (activeRunRequestId !== null) {
    postRunResult(
      requestId,
      executionFailure(
        "RUNTIME_BUSY",
        "Python runtime đang xử lý một lần chạy khác.",
      ),
    );
    return;
  }

  activeRunRequestId = requestId;

  try {
    postRunResult(requestId, await executePython(runtime, code));
  } catch (error) {
    postRunResult(
      requestId,
      executionFailure(
        "PYODIDE_EXECUTION_FAILED",
        getErrorMessage(error, "Pyodide không thể thực thi mã Python."),
      ),
    );
  } finally {
    activeRunRequestId = null;
  }
}

async function executePython(
  pyodide: PyodideInterface,
  code: string,
): Promise<RuntimeExecutionResult> {
  const stdoutCapture = createOutputCapture();
  const stderrCapture = createOutputCapture();
  let executionValue: unknown;

  pyodide.setStdout(stdoutCapture.writer);
  pyodide.setStderr(stderrCapture.writer);

  try {
    executionValue = await pyodide.runPythonAsync(code);
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
