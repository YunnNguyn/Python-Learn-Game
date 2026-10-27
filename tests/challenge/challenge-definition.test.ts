import { describe, expect, it } from "vitest";

import {
  ChallengeIssueCode,
  metricDirection,
  parseChallengeDefinition,
  scoreSubmission,
} from "../../src/core/challenge";
import { meanAbsoluteError, accuracy } from "../../src/core/challenge/metrics";
import { parseStrictNumber } from "../../src/core/challenge/submission-validator";

export const MAE_DEFINITION = {
  id: "house-prices",
  version: "1.0.0",
  title: "House prices",
  metric: "mae",
  idColumn: "id",
  targetColumn: "price",
  targetType: "numeric",
  limits: { maxSubmissionBytes: 10_000, maxRows: 100 },
} as const;

describe("challenge definition", () => {
  it("accepts valid MAE and Accuracy definitions", () => {
    expect(parseChallengeDefinition(MAE_DEFINITION).ok).toBe(true);
    const accuracyDefinition = { ...MAE_DEFINITION, metric: "accuracy", targetType: "categorical", targetColumn: "label" };
    expect(parseChallengeDefinition(accuracyDefinition).ok).toBe(true);
  });

  it("rejects incompatible metric and target type with a dedicated code", () => {
    for (const bad of [
      { ...MAE_DEFINITION, targetType: "categorical" },
      { ...MAE_DEFINITION, metric: "accuracy" },
    ]) {
      const result = parseChallengeDefinition(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issues.map((issue) => issue.code)).toContain(ChallengeIssueCode.METRIC_TARGET_MISMATCH);
    }
  });

  it("rejects unsupported metrics, unknown keys, bad ids, equal columns and bad limits", () => {
    const bads: unknown[] = [
      null,
      "x",
      { ...MAE_DEFINITION, metric: "rmse" },
      { ...MAE_DEFINITION, metric: "mape" },
      { ...MAE_DEFINITION, extra: 1 },
      { ...MAE_DEFINITION, id: "Bad Id" },
      { ...MAE_DEFINITION, version: "" },
      { ...MAE_DEFINITION, title: "  " },
      { ...MAE_DEFINITION, targetColumn: "id" },
      { ...MAE_DEFINITION, idColumn: " id" },
      { ...MAE_DEFINITION, limits: { maxSubmissionBytes: 0, maxRows: 10 } },
      { ...MAE_DEFINITION, limits: { maxSubmissionBytes: 10, maxRows: 1.5 } },
      { ...MAE_DEFINITION, limits: { maxSubmissionBytes: 10 ** 9, maxRows: 10 } },
      { ...MAE_DEFINITION, limits: { maxSubmissionBytes: 10 } },
    ];
    for (const bad of bads) {
      const result = parseChallengeDefinition(bad);
      expect(result.ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("scoreSubmission reports an invalid definition before looking at any CSV", () => {
    const result = scoreSubmission({ ...MAE_DEFINITION, metric: "rmse" }, "garbage", "garbage");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]!.code).toBe(ChallengeIssueCode.INVALID_DEFINITION);
  });

  it("has fixed metric directions", () => {
    expect(metricDirection("mae")).toBe("lower-is-better");
    expect(metricDirection("accuracy")).toBe("higher-is-better");
  });
});

describe("parseStrictNumber", () => {
  it("accepts ordinary decimal and scientific notation", () => {
    const cases: [string, number][] = [
      ["0", 0],
      ["-0", -0],
      ["12", 12],
      ["+3.5", 3.5],
      ["-.5", -0.5],
      ["5.", 5],
      ["007", 7],
      ["1e3", 1000],
      ["1.5E-2", 0.015],
    ];
    for (const [text, value] of cases) {
      expect(parseStrictNumber(text), text).toEqual({ ok: true, value });
    }
  });

  it("rejects hex, separators, whitespace, words and coercion surprises", () => {
    for (const text of ["0x10", "0b1", "1_000", "1,5", " 1", "1 ", "1e", "e5", ".", "+", "--1", "true", "null", "[]", "1n", "٣"]) {
      expect(parseStrictNumber(text), text).toEqual({ ok: false, code: "INVALID_NUMBER" });
    }
  });

  it("rejects NaN, Infinity and out-of-range numbers as non-finite", () => {
    for (const text of ["NaN", "nan", "Infinity", "-Infinity", "inf", "+INF", "1e999", "-1e999"]) {
      expect(parseStrictNumber(text), text).toEqual({ ok: false, code: "NON_FINITE_NUMBER" });
    }
  });
});

describe("metrics", () => {
  it("computes golden MAE and accuracy", () => {
    expect(meanAbsoluteError([11, 22, 30], [10, 20, 30])).toBe(1);
    expect(accuracy(["a", "b", "a", "c"], ["a", "a", "a", "c"])).toBe(0.75);
  });

  it("compensated summation beats naive summation on cancellation-prone input", () => {
    const n = 10_000;
    const predicted = [1e16, ...Array.from({ length: n }, () => 1), 0];
    const actual = [0, ...Array.from({ length: n }, () => 0), 1e16];
    // Exact sum of |diffs| = 2e16 + 10000.
    expect(meanAbsoluteError(predicted, actual) * predicted.length).toBe(2e16 + n);
  });
});
