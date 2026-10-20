import { loadPyodide, type PyodideInterface } from "pyodide";
import type { PyProxy } from "pyodide/ffi";

import type { JsonObject } from "../../domain";
import {
  RUNTIME_EXECUTION_STATUS,
  type RuntimeExecutionResult,
  type RuntimePythonException,
  type RuntimeSystemError,
  type RuntimeWorkspaceInfo,
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
import { buildObservationExpression } from "./observation-helper";
import {
  isAllowedRuntimeConfigKey,
  isAllowedRuntimePackage,
  isSimpleDatasetFilename,
} from "./runtime-config-rules";
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

workerScope.onmessage = (event) => {
  if (isRuntimeInitWorkerRequest(event.data)) {
    void initializeRuntime(
      event.data.requestId,
      event.data.indexURL,
      event.data.packageBaseURL,
    );
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
  packageBaseURL: string | undefined,
): Promise<void> {
  try {
    initializationPromise ??= loadPyodide({
      indexURL,
      ...(packageBaseURL !== undefined
        ? { packageBaseUrl: packageBaseURL }
        : {}),
    });
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
    const packageError = await ensureRuntimePackages(runtime, runtimeConfig);
    if (packageError !== null) {
      workerScope.postMessage({
        type: "RUNTIME_ERROR",
        requestId,
        error: packageError,
      });
      return;
    }

    const workspaceError = stageMissionWorkspace(runtime, runtimeConfig);
    if (workspaceError !== null) {
      workerScope.postMessage({
        type: "RUNTIME_ERROR",
        requestId,
        error: workspaceError,
      });
      return;
    }

    const namespaceResult = buildMissionNamespace(
      runtime,
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

async function ensureRuntimePackages(
  pyodide: PyodideInterface,
  runtimeConfig: JsonObject | undefined,
): Promise<RuntimeSystemError | null> {
  if (runtimeConfig === undefined || Object.keys(runtimeConfig).length === 0) {
    return null;
  }

  const unknownKey = Object.keys(runtimeConfig).find(
    (key) => !isAllowedRuntimeConfigKey(key),
  );
  if (unknownKey !== undefined) {
    return {
      code: "UNSUPPORTED_RUNTIME_CONFIG",
      message: `runtimeConfig không hỗ trợ trường: ${unknownKey}.`,
    };
  }

  const packages = runtimeConfig.packages;
  if (packages === undefined) {
    return null;
  }
  if (
    !Array.isArray(packages) ||
    !packages.every(
      (packageName) =>
        typeof packageName === "string" && packageName.trim().length > 0,
    )
  ) {
    return {
      code: "INVALID_RUNTIME_CONFIG",
      message: "runtimeConfig.packages phải là danh sách tên package hợp lệ.",
    };
  }

  const requestedPackages = [...new Set(packages as string[])];
  const unsupported = requestedPackages.filter(
    (packageName) => !isAllowedRuntimePackage(packageName),
  );
  if (unsupported.length > 0) {
    return {
      code: "UNSUPPORTED_RUNTIME_PACKAGE",
      message: `Package chưa được bật cho nội dung production: ${unsupported.join(", ")}.`,
    };
  }

  if (requestedPackages.length === 0) {
    return null;
  }

  try {
    await pyodide.loadPackage(requestedPackages);
    return null;
  } catch (error) {
    return {
      code: "RUNTIME_PACKAGE_LOAD_FAILED",
      message: getErrorMessage(
        error,
        `Không thể tải package Python: ${requestedPackages.join(", ")}.`,
      ),
    };
  }
}

// Stage trusted inline datasets into the Pyodide virtual filesystem and reset
// artifacts/, mirroring the Local Python workspace contract: before each
// authoritative execution data/ is rebuilt from authored content and
// artifacts/ is cleared, so reported outputs belong to the current run.
function stageMissionWorkspace(
  pyodide: PyodideInterface,
  runtimeConfig: JsonObject | undefined,
): RuntimeSystemError | null {
  const workspace = runtimeConfig?.workspace;
  if (workspace === undefined) {
    // Still ensure the standard directories exist for missions that only
    // write artifacts without declaring datasets.
    pyodide.runPython(
      'import os, shutil\nos.makedirs("data", exist_ok=True)\nshutil.rmtree("artifacts", ignore_errors=True)\nos.makedirs("artifacts", exist_ok=True)\n',
    );
    return null;
  }

  if (
    typeof workspace !== "object" ||
    workspace === null ||
    Array.isArray(workspace)
  ) {
    return {
      code: "INVALID_RUNTIME_CONFIG",
      message: "runtimeConfig.workspace phải là object.",
    };
  }

  const datasets = (workspace as JsonObject).datasets ?? [];
  if (!Array.isArray(datasets)) {
    return {
      code: "INVALID_RUNTIME_CONFIG",
      message: "runtimeConfig.workspace.datasets phải là danh sách.",
    };
  }

  const normalized: { filename: string; content: string }[] = [];
  for (const entry of datasets) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      Array.isArray(entry) ||
      typeof (entry as JsonObject).filename !== "string" ||
      typeof (entry as JsonObject).content !== "string"
    ) {
      return {
        code: "INVALID_DATASETS",
        message: "Mỗi dataset cần filename và content dạng chuỗi.",
      };
    }
    const filename = (entry as JsonObject).filename as string;
    if (!isSimpleDatasetFilename(filename)) {
      return {
        code: "INVALID_DATASETS",
        message: `Tên dataset không hợp lệ: ${filename}.`,
      };
    }
    normalized.push({
      filename,
      content: (entry as JsonObject).content as string,
    });
  }

  try {
    pyodide.globals.set("__mission_datasets_json", JSON.stringify(normalized));
    pyodide.runPython(
      'import os, shutil, json, pathlib\n' +
        'os.makedirs("data", exist_ok=True)\n' +
        'shutil.rmtree("artifacts", ignore_errors=True)\n' +
        'os.makedirs("artifacts", exist_ok=True)\n' +
        'for __entry in json.loads(__mission_datasets_json):\n' +
        '    (pathlib.Path("data") / __entry["filename"]).write_text(__entry["content"], encoding="utf-8")\n' +
        'del __entry\n',
    );
    return null;
  } catch (error) {
    return {
      code: "WORKSPACE_PREPARATION_FAILED",
      message: getErrorMessage(error, "Không thể dựng workspace Pyodide."),
    };
  } finally {
    pyodide.globals.delete("__mission_datasets_json");
  }
}

function buildMissionNamespace(
  pyodide: PyodideInterface,
  setupData: JsonObject | undefined,
): MissionNamespaceResult {
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
    const packageError = await ensureRuntimePackages(runtime, runtimeConfig);
    if (packageError !== null) {
      postSubmitResult(
        requestId,
        executionFailure(
          packageError.code ?? "MISSION_PREPARE_FAILED",
          packageError.message,
        ),
      );
      return;
    }

    const workspaceError = stageMissionWorkspace(runtime, runtimeConfig);
    if (workspaceError !== null) {
      postSubmitResult(
        requestId,
        executionFailure(
          workspaceError.code ?? "WORKSPACE_PREPARATION_FAILED",
          workspaceError.message,
        ),
      );
      return;
    }

    const namespaceResult = buildMissionNamespace(
      runtime,
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

// Scan the data/ and artifacts/ directories in the Pyodide virtual filesystem
// after execution and return a RuntimeWorkspaceInfo. Small image artifacts are
// inlined as base64 data URLs so the mission workspace can display the figure
// or image the learner just produced (the browser can't read the virtual FS
// directly). This is workspace/presentation metadata, kept separate from the
// grader's variable observations.
const WORKSPACE_SCAN_SOURCE = `
import os, json, base64, pathlib

def __plg_scan(dirname, want_image_data):
    items = []
    base = pathlib.Path(dirname)
    if base.is_dir():
        for p in sorted(base.iterdir()):
            if not p.is_file():
                continue
            ext = p.suffix.lower().lstrip(".")
            size = p.stat().st_size
            category = {
                "png": "image", "jpg": "image", "jpeg": "image",
                "gif": "image", "webp": "image", "bmp": "image",
                "csv": "csv", "json": "json", "txt": "text",
            }.get(ext, "file")
            item = {
                "filename": p.name,
                "relativePath": dirname + "/" + p.name,
                "bytes": size,
                "extension": ext,
                "category": category,
            }
            if want_image_data and category == "image" and 0 < size <= 2_000_000:
                mime = {
                    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                    "gif": "image/gif", "webp": "image/webp", "bmp": "image/bmp",
                }.get(ext, "application/octet-stream")
                encoded = base64.b64encode(p.read_bytes()).decode("ascii")
                item["dataUrl"] = "data:" + mime + ";base64," + encoded
            items.append(item)
    return items

__plg_ws = json.dumps({
    "datasets": __plg_scan("data", False),
    "artifacts": __plg_scan("artifacts", True),
})
`;

function scanWorkspace(
  pyodide: PyodideInterface,
): RuntimeWorkspaceInfo | undefined {
  try {
    pyodide.runPython(WORKSPACE_SCAN_SOURCE);
    const raw = pyodide.globals.get("__plg_ws") as unknown;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : undefined;
    return parsed as RuntimeWorkspaceInfo | undefined;
  } catch {
    return undefined;
  } finally {
    try {
      pyodide.runPython(
        'for __n in ("__plg_ws", "__plg_scan"):\n'
          + '    globals().pop(__n, None)\n',
      );
    } catch {
      // best-effort cleanup only
    }
  }
}

function withWorkspace(
  result: RuntimeExecutionResult,
  workspace: RuntimeWorkspaceInfo | undefined,
): RuntimeExecutionResult {
  return workspace === undefined ? result : { ...result, workspace };
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

  const producedOutput =
    result.status === RUNTIME_EXECUTION_STATUS.SUCCESS ||
    result.status === RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION;
  const workspace = producedOutput ? scanWorkspace(pyodide) : undefined;

  if (
    observeVariables !== undefined &&
    (result.status === RUNTIME_EXECUTION_STATUS.SUCCESS ||
      result.status === RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION)
  ) {
    try {
      return withWorkspace(
        {
          ...result,
          serialized: await collectRuntimeObservations(
            pyodide,
            globals,
            observeVariables,
          ),
        },
        workspace,
      );
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

  return withWorkspace(result, workspace);
}

async function collectRuntimeObservations(
  pyodide: PyodideInterface,
  globals: PyProxy,
  observeVariables: readonly string[],
): Promise<JsonObject> {
  const expression = buildObservationExpression(observeVariables);
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
