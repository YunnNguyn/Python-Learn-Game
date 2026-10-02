import { loadPyodide } from "pyodide";

import type { RuntimeSystemError } from "../runtime-contracts";
import {
  isRuntimeInitWorkerRequest,
  type RuntimeErrorWorkerResponse,
  type RuntimeReadyWorkerResponse,
} from "./worker-protocol";

interface RuntimeWorkerScope {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  postMessage(
    message: RuntimeReadyWorkerResponse | RuntimeErrorWorkerResponse,
  ): void;
}

const workerScope = globalThis as unknown as RuntimeWorkerScope;
let initializationPromise: Promise<void> | null = null;

workerScope.onmessage = (event) => {
  if (!isRuntimeInitWorkerRequest(event.data)) {
    return;
  }

  void initializeRuntime(event.data.requestId, event.data.indexURL);
};

async function initializeRuntime(
  requestId: string,
  indexURL: string,
): Promise<void> {
  try {
    initializationPromise ??= loadPyodide({ indexURL }).then(() => undefined);
    await initializationPromise;

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
