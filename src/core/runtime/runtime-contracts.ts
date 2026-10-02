import type { JsonObject } from "../domain";

export interface RuntimeMissionPreparationRequest {
  readonly runtimeConfig?: JsonObject;
  readonly setupData?: JsonObject;
}

export interface RuntimeExecutionRequest {
  readonly code: string;
}

export interface RuntimeSystemError {
  readonly code?: string;
  readonly message: string;
}

export interface RuntimePythonException {
  readonly type?: string;
  readonly message: string;
  readonly traceback?: string;
}

export type RuntimeLifecycleResult =
  | {
      readonly ok: true;
    }
  | {
      readonly ok: false;
      readonly error: RuntimeSystemError;
    };

export const RUNTIME_EXECUTION_STATUS = {
  SUCCESS: "SUCCESS",
  PYTHON_EXCEPTION: "PYTHON_EXCEPTION",
  RUNTIME_ERROR: "RUNTIME_ERROR",
  TIMEOUT: "TIMEOUT",
} as const;

export type RuntimeExecutionStatus =
  (typeof RUNTIME_EXECUTION_STATUS)[keyof typeof RUNTIME_EXECUTION_STATUS];

export interface RuntimeExecutionSuccess {
  readonly status: typeof RUNTIME_EXECUTION_STATUS.SUCCESS;
  readonly stdout: string;
  readonly stderr: string;
  readonly serialized?: JsonObject;
}

export interface RuntimeExecutionPythonException {
  readonly status: typeof RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION;
  readonly stdout: string;
  readonly stderr: string;
  readonly exception: RuntimePythonException;
  readonly serialized?: JsonObject;
}

export interface RuntimeExecutionSystemFailure {
  readonly status: typeof RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: RuntimeSystemError;
}

export interface RuntimeExecutionTimeout {
  readonly status: typeof RUNTIME_EXECUTION_STATUS.TIMEOUT;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: RuntimeSystemError;
}

export type RuntimeExecutionResult =
  | RuntimeExecutionSuccess
  | RuntimeExecutionPythonException
  | RuntimeExecutionSystemFailure
  | RuntimeExecutionTimeout;
