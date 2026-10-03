import { describe, expect, it } from "vitest";

import type { JsonObject } from "../../src/core/domain";
import { resolveDeclarativeGraderConfig } from "../../src/core/grading";

const authored: JsonObject = {
  checks: [
    { type: "NO_EXCEPTION" },
    {
      type: "SHAPE",
      variable: "result",
      expected: { $gradingData: "expectedShape" },
    },
    {
      type: "EXACT_VALUES",
      variable: "result",
      expected: { $gradingData: "expectedValues" },
    },
  ],
};

describe("Phase A declarative grading-data resolution", () => {
  it("resolves hidden generated values before canonical grader validation", () => {
    const resolved = resolveDeclarativeGraderConfig(authored, {
      expectedShape: [2, 3],
      expectedValues: [[1, 2, 3], [4, 5, 6]],
    });

    expect(resolved.checks[1]).toEqual({
      type: "SHAPE",
      variable: "result",
      expected: [2, 3],
    });
    expect(resolved.checks[2]).toEqual({
      type: "EXACT_VALUES",
      variable: "result",
      expected: [[1, 2, 3], [4, 5, 6]],
    });
  });

  it("fails content integration when a referenced hidden value is missing", () => {
    expect(() =>
      resolveDeclarativeGraderConfig(authored, { expectedShape: [2, 3] }),
    ).toThrow(/expectedValues/);
  });

  it("does not mutate authored config or grading data", () => {
    const gradingData = {
      expectedShape: [2, 3],
      expectedValues: [[1, 2, 3], [4, 5, 6]],
    };
    const authoredBefore = JSON.stringify(authored);
    const dataBefore = JSON.stringify(gradingData);

    resolveDeclarativeGraderConfig(authored, gradingData);

    expect(JSON.stringify(authored)).toBe(authoredBefore);
    expect(JSON.stringify(gradingData)).toBe(dataBefore);
  });
});
