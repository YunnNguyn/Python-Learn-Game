import { describe, expect, it } from "vitest";

import { toGraderExecutionSnapshot } from "../../src/core/missions";
import {
  RUNTIME_EXECUTION_STATUS,
  type RuntimeVariableObservations,
} from "../../src/core/runtime";

const observations: RuntimeVariableObservations = {
  variables: {
    answer: {
      pythonType: "int",
      isNdarray: false,
      value: 42,
    },
  },
};

describe("toGraderExecutionSnapshot", () => {
  it("maps SUCCESS observations without an exception", () => {
    expect(
      toGraderExecutionSnapshot(
        {
          status: RUNTIME_EXECUTION_STATUS.SUCCESS,
          stdout: "ok\n",
          stderr: "",
        },
        observations,
      ),
    ).toEqual({
      variables: observations.variables,
    });
  });

  it("maps PYTHON_EXCEPTION observations plus normalized exception type/message", () => {
    expect(
      toGraderExecutionSnapshot(
        {
          status: RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION,
          stdout: "before\n",
          stderr: "",
          exception: {
            type: "ValueError",
            message: "boom",
            traceback: "trace",
          },
        },
        observations,
      ),
    ).toEqual({
      variables: observations.variables,
      exception: {
        type: "ValueError",
        message: "boom",
      },
    });
  });

  it("maps RUNTIME_ERROR to empty variables and the system error", () => {
    expect(
      toGraderExecutionSnapshot(
        {
          status: RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR,
          stdout: "",
          stderr: "runtime stderr",
          error: {
            code: "WORKER_ERROR",
            message: "worker failed",
          },
        },
        observations,
      ),
    ).toEqual({
      variables: {},
      exception: {
        type: "WORKER_ERROR",
        message: "worker failed",
      },
    });
  });

  it("maps TIMEOUT deterministically without fabricating observations", () => {
    expect(
      toGraderExecutionSnapshot({
        status: RUNTIME_EXECUTION_STATUS.TIMEOUT,
        stdout: "",
        stderr: "",
      }),
    ).toEqual({
      variables: {},
      exception: {
        type: "TIMEOUT",
        message: "Python execution timed out.",
      },
    });

    expect(
      toGraderExecutionSnapshot({
        status: RUNTIME_EXECUTION_STATUS.TIMEOUT,
        stdout: "",
        stderr: "",
        error: {
          code: "EXECUTION_TIMEOUT",
          message: "execution timed out",
        },
      }),
    ).toEqual({
      variables: {},
      exception: {
        type: "EXECUTION_TIMEOUT",
        message: "execution timed out",
      },
    });
  });
});
