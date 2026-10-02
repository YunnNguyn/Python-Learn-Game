import type { RuntimeSystemError } from "../runtime-contracts";

export interface RuntimeInitWorkerRequest {
  readonly type: "RUNTIME_INIT";
  readonly requestId: string;
  readonly indexURL: string;
}

export interface RuntimeReadyWorkerResponse {
  readonly type: "READY";
  readonly requestId: string;
}

export interface RuntimeErrorWorkerResponse {
  readonly type: "RUNTIME_ERROR";
  readonly requestId: string;
  readonly error: RuntimeSystemError;
}

export type RuntimeWorkerRequest = RuntimeInitWorkerRequest;

export type RuntimeWorkerResponse =
  | RuntimeReadyWorkerResponse
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

export function isRuntimeWorkerResponse(
  value: unknown,
): value is RuntimeWorkerResponse {
  if (!isRecord(value) || typeof value.requestId !== "string") {
    return false;
  }

  if (value.type === "READY") {
    return true;
  }

  if (value.type !== "RUNTIME_ERROR" || !isRecord(value.error)) {
    return false;
  }

  return (
    typeof value.error.message === "string" &&
    (value.error.code === undefined || typeof value.error.code === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
