import { describe, expect, it } from "vitest";

import {
  RuntimeObservedValueSchema,
  RuntimeVariableObservationsSchema,
} from "../../src/core/runtime";

describe("runtime observation schemas", () => {
  it("accepts scalar, nested JSON, and ndarray-shaped observations", () => {
    const payload = {
      variables: {
        answer: {
          pythonType: "int",
          isNdarray: false,
          value: 42,
        },
        structured: {
          pythonType: "dict",
          isNdarray: false,
          value: {
            flag: true,
            items: [1, 2, null],
          },
        },
        matrix: {
          pythonType: "ndarray",
          isNdarray: true,
          shape: [2, 3],
          value: [
            [1, 2, 3],
            [4, 5, 6],
          ],
        },
      },
    };

    expect(RuntimeVariableObservationsSchema.parse(payload)).toEqual(payload);
  });

  it("rejects malformed root and observed-value fields strictly", () => {
    expect(
      RuntimeVariableObservationsSchema.safeParse({
        variables: {},
        unexpected: true,
      }).success,
    ).toBe(false);

    expect(
      RuntimeObservedValueSchema.safeParse({
        pythonType: "int",
        isNdarray: false,
        value: 42,
        unexpected: true,
      }).success,
    ).toBe(false);

    expect(
      RuntimeObservedValueSchema.safeParse({
        pythonType: 123,
        isNdarray: false,
      }).success,
    ).toBe(false);
  });

  it("rejects non-finite JSON numbers", () => {
    expect(
      RuntimeObservedValueSchema.safeParse({
        pythonType: "float",
        isNdarray: false,
        value: Number.NaN,
      }).success,
    ).toBe(false);

    expect(
      RuntimeObservedValueSchema.safeParse({
        pythonType: "list",
        isNdarray: false,
        value: [1, Number.POSITIVE_INFINITY],
      }).success,
    ).toBe(false);
  });

  it("rejects unsafe, negative, fractional, and non-finite shape dimensions", () => {
    for (const shape of [
      [-1],
      [1.5],
      [Number.POSITIVE_INFINITY],
      [Number.MAX_SAFE_INTEGER + 1],
    ]) {
      expect(
        RuntimeObservedValueSchema.safeParse({
          pythonType: "ndarray",
          isNdarray: true,
          shape,
        }).success,
      ).toBe(false);
    }
  });
});
