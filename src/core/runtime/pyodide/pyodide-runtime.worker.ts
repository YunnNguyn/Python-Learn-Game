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
  isRuntimeSubmitCodeWorkerRequest,
  type RuntimeErrorWorkerResponse,
  type RuntimeMissionPreparedWorkerResponse,
  type RuntimeReadyWorkerResponse,
  type RuntimeRunResultWorkerResponse,
  type RuntimeSubmitResultWorkerResponse,
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
      | RuntimeSubmitResultWorkerResponse
      | RuntimeErrorWorkerResponse,
  ): void;
}

const workerScope = globalThis as unknown as RuntimeWorkerScope;
let initializationPromise: Promise<PyodideInterface> | null = null;
let runtime: PyodideInterface | null = null;
let activeNamespace: PyProxy | null = null;
let activeOperationRequestId: string | null = null;

const OBSERVATION_HELPER_SOURCE = `
import json
import math

_JS_SAFE_INTEGER = 9007199254740991

def __runtime_json_safe(value, ancestors):
    if value is None or isinstance(value, (bool, str)):
        return True, value

    if isinstance(value, int):
        if abs(value) > _JS_SAFE_INTEGER:
            return False, None
        return True, value

    if isinstance(value, float):
        if not math.isfinite(value):
            return False, None
        return True, value

    if isinstance(value, (list, tuple)):
        identity = id(value)
        if identity in ancestors:
            return False, None
        ancestors.add(identity)
        normalized = []
        try:
            for item in value:
                ok, converted = __runtime_json_safe(item, ancestors)
                if not ok:
                    return False, None
                normalized.append(converted)
            return True, normalized
        finally:
            ancestors.discard(identity)

    if isinstance(value, dict):
        identity = id(value)
        if identity in ancestors:
            return False, None
        ancestors.add(identity)
        normalized = {}
        try:
            for key, item in value.items():
                if not isinstance(key, str):
                    return False, None
                ok, converted = __runtime_json_safe(item, ancestors)
                if not ok:
                    return False, None
                normalized[key] = converted
            return True, normalized
        finally:
            ancestors.discard(identity)

    return False, None

def __runtime_collect(scope, names):
    variables = {}
    for name in names:
        if name not in scope:
            continue

        value = scope[name]
        value_type = type(value)
        is_ndarray = (
            value_type.__module__ == "numpy"
            and value_type.__name__ == "ndarray"
        )
        observed = {
            "pythonType": value_type.__name__,
            "isNdarray": is_ndarray,
        }

        candidate = value
        if is_ndarray:
            try:
                shape = [int(dimension) for dimension in value.shape]
                if all(
                    0 <= dimension <= _JS_SAFE_INTEGER
                    for dimension in shape
                ):
                    observed["shape"] = shape
                candidate = value.tolist()
            except Exception:
                candidate = value

        try:
            ok, normalized = __runtime_json_safe(candidate, set())
            if ok:
                observed["value"] = normalized
        except Exception:
            pass

        variables[name] = observed

    return json.dumps(
        {"variables": variables},
        allow_nan=False,
        separators=(",", ":"),
    )
`;

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
    void runCode(
      event.data.requestId,
      event.data.code,
      event.data.observeVariables,
    );
    return;
  }

  if (isRuntimeSubmitCodeWorkerRequest(event.data)) {
    void submitCode(
      event.data.requestId,
      event.data.code,
      event.data.runtimeConfig,
      event.data.setupData,
      event.data.observeVariables,
    );
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
    const namespaceResult = buildMissionNamespace(
      runtime,
      runtimeConfig,
      setupData,
    );
    if (!namespaceResult.ok) {
      workerScope.postMessage({
        type: "RUNTIME_ERROR",
        requestId,
        error: namespaceResult.error,
      });
      return;
    }

    candidateNamespace = namespaceResult.namespace;

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

type MissionNamespaceResult =
  | {
      readonly ok: true;
      readonly namespace: PyProxy;
    }
  | {
      readonly ok: false;
      readonly error: RuntimeSystemError;
    };

function buildMissionNamespace(
  pyodide: PyodideInterface,
  runtimeConfig: JsonObject | undefined,
  setupData: JsonObject | undefined,
): MissionNamespaceResult {
  if (
    runtimeConfig !== undefined &&
    Object.keys(runtimeConfig).length > 0
  ) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_RUNTIME_CONFIG",
        message: "runtimeConfig hiện chỉ hỗ trợ undefined hoặc object rỗng.",
      },
    };
  }

  const setup = setupData ?? {};
  const validationError = validateSetupKeys(
    {
      setGlobal: (name, value) => pyodide.globals.set(name, value),
      deleteGlobal: (name) => pyodide.globals.delete(name),
      runPython: (code) => pyodide.runPython(code),
    },
    setup,
  );
  if (validationError !== null) {
    return {
      ok: false,
      error: validationError,
    };
  }

  try {
    return {
      ok: true,
      namespace: createPythonSetupNamespace(pyodide, setup),
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "MISSION_PREPARE_FAILED",
        message: getErrorMessage(error, "Không thể chuẩn bị môi trường Python."),
      },
    };
  }
}

async function runCode(
  requestId: string,
  code: string,
  observeVariables: readonly string[] | undefined,
): Promise<void> {
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
      await executePython(runtime, activeNamespace, code, observeVariables),
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

async function submitCode(
  requestId: string,
  code: string,
  runtimeConfig: JsonObject | undefined,
  setupData: JsonObject | undefined,
  observeVariables: readonly string[] | undefined,
): Promise<void> {
  if (runtime === null) {
    postSubmitResult(
      requestId,
      executionFailure(
        "RUNTIME_NOT_READY",
        "Python runtime chưa sẵn sàng để nộp mã.",
      ),
    );
    return;
  }

  if (activeOperationRequestId !== null) {
    postSubmitResult(
      requestId,
      executionFailure(
        "RUNTIME_BUSY",
        "Python runtime đang xử lý một thao tác khác.",
      ),
    );
    return;
  }

  activeOperationRequestId = requestId;
  let submitNamespace: PyProxy | null = null;

  try {
    const namespaceResult = buildMissionNamespace(
      runtime,
      runtimeConfig,
      setupData,
    );
    if (!namespaceResult.ok) {
      postSubmitResult(
        requestId,
        executionFailure(
          namespaceResult.error.code ?? "MISSION_PREPARE_FAILED",
          namespaceResult.error.message,
        ),
      );
      return;
    }

    submitNamespace = namespaceResult.namespace;
    postSubmitResult(
      requestId,
      await executePython(runtime, submitNamespace, code, observeVariables),
    );
  } catch (error) {
    postSubmitResult(
      requestId,
      executionFailure(
        "PYODIDE_EXECUTION_FAILED",
        getErrorMessage(error, "Pyodide không thể thực thi mã Python."),
      ),
    );
  } finally {
    submitNamespace?.destroy();
    activeOperationRequestId = null;
  }
}

async function executePython(
  pyodide: PyodideInterface,
  globals: PyProxy,
  code: string,
  observeVariables: readonly string[] | undefined,
): Promise<RuntimeExecutionResult> {
  const stdoutCapture = createOutputCapture();
  const stderrCapture = createOutputCapture();
  let executionValue: unknown;
  let result: RuntimeExecutionResult;

  pyodide.setStdout(stdoutCapture.writer);
  pyodide.setStderr(stderrCapture.writer);

  try {
    executionValue = await pyodide.runPythonAsync(code, { globals });
    destroyPyProxy(pyodide, executionValue);
    executionValue = undefined;

    result = {
      status: RUNTIME_EXECUTION_STATUS.SUCCESS,
      stdout: stdoutCapture.finish(),
      stderr: stderrCapture.finish(),
    };
  } catch (error) {
    destroyPyProxy(pyodide, executionValue);
    executionValue = undefined;

    if (error instanceof pyodide.ffi.PythonError) {
      result = {
        status: RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION,
        stdout: stdoutCapture.finish(),
        stderr: stderrCapture.finish(),
        exception: normalizePythonException(error),
      };
    } else {
      result = executionFailure(
        "PYODIDE_EXECUTION_FAILED",
        getErrorMessage(error, "Pyodide không thể thực thi mã Python."),
        stdoutCapture.finish(),
        stderrCapture.finish(),
      );
    }
  } finally {
    pyodide.setStdout();
    pyodide.setStderr();
  }

  if (
    observeVariables !== undefined &&
    (result.status === RUNTIME_EXECUTION_STATUS.SUCCESS ||
      result.status === RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION)
  ) {
    try {
      return {
        ...result,
        serialized: await collectRuntimeObservations(
          pyodide,
          globals,
          observeVariables,
        ),
      };
    } catch (error) {
      return executionFailure(
        "RUNTIME_OBSERVATION_FAILED",
        getErrorMessage(
          error,
          "Không thể chuẩn hóa quan sát biến Python.",
        ),
        result.stdout,
        result.stderr,
      );
    }
  }

  return result;
}

async function collectRuntimeObservations(
  pyodide: PyodideInterface,
  globals: PyProxy,
  observeVariables: readonly string[],
): Promise<JsonObject> {
  const expression = `(lambda __runtime_ns: (exec(${JSON.stringify(
    OBSERVATION_HELPER_SOURCE,
  )}, __runtime_ns), __runtime_ns["__runtime_collect"](globals(), ${JSON.stringify(
    observeVariables,
  )}))[1])({})`;
  let serializedValue: unknown;

  try {
    serializedValue = await pyodide.runPythonAsync(expression, { globals });
    if (typeof serializedValue !== "string") {
      throw new Error("Runtime observation helper returned a non-string payload.");
    }

    const parsed = JSON.parse(serializedValue) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Runtime observation helper returned an invalid JSON object.");
    }

    return parsed as JsonObject;
  } finally {
    destroyPyProxy(pyodide, serializedValue);
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

function postSubmitResult(
  requestId: string,
  result: RuntimeExecutionResult,
): void {
  workerScope.postMessage({
    type: "SUBMIT_RESULT",
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
