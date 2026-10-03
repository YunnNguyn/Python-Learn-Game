import { describe, expect, it } from "vitest";

import {
  DeclarativeGraderCheckType,
  getDeclarativeObservationVariables,
} from "../../src/core/grading";

describe("getDeclarativeObservationVariables", () => {
  it("deduplicates variable-bearing checks in first-authored order", () => {
    expect(
      getDeclarativeObservationVariables({
        checks: [
          {
            type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
            variable: "answer",
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "answer",
            expected: "int",
          },
          {
            type: DeclarativeGraderCheckType.NDARRAY_TYPE,
            variable: "answer",
          },
          {
            type: DeclarativeGraderCheckType.SHAPE,
            variable: "answer",
            expected: [3],
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "answer",
            expected: [1, 2, 3],
          },
          {
            type: DeclarativeGraderCheckType.NO_EXCEPTION,
          },
          {
            type: DeclarativeGraderCheckType.SHAPE,
            variable: "other",
            expected: [2, 2],
          },
          {
            type: DeclarativeGraderCheckType.APPROX_VALUES,
            variable: "answer",
            expected: [1, 2, 3],
            absoluteTolerance: 0.01,
          },
        ],
      }),
    ).toEqual(["answer", "other"]);
  });

  it("requests no variables for a NO_EXCEPTION-only config", () => {
    expect(
      getDeclarativeObservationVariables({
        checks: [{ type: DeclarativeGraderCheckType.NO_EXCEPTION }],
      }),
    ).toEqual([]);
  });

  it("reuses canonical declarative config validation", () => {
    expect(() =>
      getDeclarativeObservationVariables({
        checks: [],
      }),
    ).toThrow();
  });
});
