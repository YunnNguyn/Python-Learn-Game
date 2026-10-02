import type {
  RuntimeExecutionResult,
  RuntimeSystemError,
} from "../runtime-contracts";

export interface RuntimeInitWorkerRequest {
  readonly type: "RUNTIME_INIT";
  readonly requestId: string;
  readonly indexURL: string;
}

export interface RuntimeRunCodeWorkerRequest {
  readonly type: "RUN_CODE";
  readonly requestId: string;
  readonly code: string;
}

export interface RuntimeReadyWorkerResponse {
  readonly type: "READY";
  readonly requestId: string;
}

export interface RuntimeRunResultWorkerResponse {
  readonly type: "RUN_RESULT";
  readonly requestId: string;
  readonly result: RuntimeExecutionResult;
}

export interface RuntimeErrorWorkerResponse {
  readonly type: "RUNTIME_ERROR";
  readonly requestId: string;
  readonly error: RuntimeSystemError;
}

export type RuntimeWorkerRequest =
  | RuntimeInitWorkerRequest
  | RuntimeRunCodeWorkerRequest;

export type RuntimeWorkerResponse =
  | RuntimeReadyWorkerResponse
  | RuntimeRunResultWorkerResponse
  | RuntimeErrorWorkerResponse;

export function isRuntimeInitWorkerRequest(
  value: unknown,
): value is RuntimeInitWorkerRequest {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.type === "RUNTIME_INIT" &&
    typeof value.requestId === "string" &&
    typeof value.indexURL === "string"
  );
}

export function isRuntimeRunCodeWorkerRequest(
  value: unknown,
): value is RuntimeRunCodeWorkerRequest {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.type === "RUN_CODE" &&
    typeof value.requestId === "string" &&
    typeof value.code === "string"
  );
}

export function isRuntimeWorkerResponse(
  value: unknown,
): value is RuntimeWorkerResponse {
  if (!isRecord(value) || typeof value.requestId !== "string") {
    return false;
  }

  if (value.type === "READY") {
    return true;
  }

  if (value.type === "RUN_RESULT") {
    return isRuntimeExecutionResult(value.result);
  }

  if (value.type !== "RUNTIME_ERROR" || !isRuntimeSystemError(value.error)) {
    return false;
  }

  return true;
}

function isRuntimeExecutionResult(value: unknown): value is RuntimeExecutionResult {
  if (
    !isRecord(value) ||
    typeof value.status !== "string" ||
    typeof value.stdout !== "string" ||
    typeof value.stderr !== "string"
  ) {
    return false;
  }

  if (value.status === "SUCCESS") {
    return true;
  }

  if (value.status === "PYTHON_EXCEPTION") {
    return (
      isRecord(value.exception) &&
      typeof value.exception.message === "string" &&
      (value.exception.type === undefined ||
        typeof value.exception.type === "string") &&
      (value.exception.traceback === undefined ||
        typeof value.exception.traceback === "string")
    );
  }

  if (value.status === "RUNTIME_ERROR") {
    return isRuntimeSystemError(value.error);
  }

  if (value.status === "TIMEOUT") {
    return value.error === undefined || isRuntimeSystemError(value.error);
  }

  return false;
}

function isRuntimeSystemError(value: unknown): value is RuntimeSystemError {
  return (
    isRecord(value) &&
    typeof value.message === "string" &&
    (value.code === undefined || typeof value.code === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
