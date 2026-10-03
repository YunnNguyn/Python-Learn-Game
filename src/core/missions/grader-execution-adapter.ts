import type { GraderExecutionSnapshot } from "../grading";
import {
  RUNTIME_EXECUTION_STATUS,
  type RuntimeExecutionResult,
  type RuntimeVariableObservations,
} from "../runtime";

export function toGraderExecutionSnapshot(
  execution: RuntimeExecutionResult,
  observations?: RuntimeVariableObservations,
): GraderExecutionSnapshot {
  if (execution.status === RUNTIME_EXECUTION_STATUS.SUCCESS) {
    return {
      variables: observations?.variables ?? {},
    };
  }

  if (execution.status === RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION) {
    return {
      variables: observations?.variables ?? {},
      exception: {
        type: execution.exception.type,
        message: execution.exception.message,
      },
    };
  }

  if (execution.status === RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR) {
    return {
      variables: {},
      exception: {
        type: execution.error.code,
        message: execution.error.message,
      },
    };
  }

  return {
    variables: {},
    exception: {
      type: execution.error?.code ?? "TIMEOUT",
      message: execution.error?.message ?? "Python execution timed out.",
    },
  };
}
