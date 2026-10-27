import { describe, expect, it } from "vitest";

import { ChallengeIssueCode, scoreSubmission, type ChallengeIssue } from "../../src/core/challenge";

const MAE = {
  id: "house-prices",
  version: "1.0.0",
  title: "House prices",
  metric: "mae",
  idColumn: "id",
  targetColumn: "price",
  targetType: "numeric",
  limits: { maxSubmissionBytes: 10_000, maxRows: 100 },
};

const ACCURACY = {
  ...MAE,
  id: "pet-labels",
  metric: "accuracy",
  targetColumn: "label",
  targetType: "categorical",
};

const MAE_SOLUTION = "id,price\n001,10\n1,20\nb,30\n";
const ACC_SOLUTION = "id,label\n1,SECRET_cat\n2,SECRET_dog\n3,SECRET_cat\n4,SECRET_bird\n";

function failure(result: ReturnType<typeof scoreSubmission>): readonly ChallengeIssue[] {
  if (result.ok) throw new Error(`expected failure, got score ${result.score}`);
  return result.issues;
}

function codes(result: ReturnType<typeof scoreSubmission>): string[] {
  return failure(result).map((issue) => issue.code);
}

describe("scoreSubmission: success", () => {
  it("scores a golden MAE example", () => {
    const result = scoreSubmission(MAE, MAE_SOLUTION, "id,price\n001,11\n1,22\nb,30\n");
    expect(result).toEqual({ ok: true, metric: "mae", score: 1, rowCount: 3 });
  });

  it("scores a golden Accuracy example, case-sensitively and without normalization", () => {
    const exact = "id,label\n1,SECRET_cat\n2,SECRET_cat\n3,SECRET_cat\n4,SECRET_bird\n";
    expect(scoreSubmission(ACCURACY, ACC_SOLUTION, exact)).toEqual({ ok: true, metric: "accuracy", score: 0.75, rowCount: 4 });

    const cased = "id,label\n1,secret_cat\n2,SECRET_dog\n3,SECRET_cat\n4,SECRET_bird \n";
    expect(scoreSubmission(ACCURACY, ACC_SOLUTION, cased)).toEqual({ ok: true, metric: "accuracy", score: 0.5, rowCount: 4 });
  });

  it("scores 0 and 1 at the accuracy extremes", () => {
    const none = "id,label\n1,x\n2,x\n3,x\n4,x\n";
    expect(scoreSubmission(ACCURACY, ACC_SOLUTION, none)).toMatchObject({ ok: true, score: 0 });
    expect(scoreSubmission(ACCURACY, ACC_SOLUTION, ACC_SOLUTION)).toMatchObject({ ok: true, score: 1 });
  });

  it("is independent of row order and column order", () => {
    const base = scoreSubmission(MAE, MAE_SOLUTION, "id,price\n001,11\n1,22\nb,30\n");
    for (const text of [
      "id,price\nb,30\n1,22\n001,11\n",
      "id,price\n1,22\nb,30\n001,11\n",
      "price,id\n30,b\n22,1\n11,001\n",
    ]) {
      expect(scoreSubmission(MAE, MAE_SOLUTION, text)).toEqual(base);
    }
    const shuffledSolution = "price,id\n30,b\n10,001\n20,1\n";
    expect(scoreSubmission(MAE, shuffledSolution, "id,price\n001,11\n1,22\nb,30\n")).toEqual(base);
  });

  it("treats IDs as opaque strings: 001 and 1 are different", () => {
    expect(scoreSubmission(MAE, MAE_SOLUTION, "id,price\n001,10\n1,20\nb,30\n")).toMatchObject({ ok: true, score: 0 });
    const swapped = scoreSubmission(MAE, MAE_SOLUTION, "id,price\n001,20\n1,10\nb,30\n");
    expect(swapped).toMatchObject({ ok: true, score: 20 / 3 });
    const collapsed = scoreSubmission(MAE, MAE_SOLUTION, "id,price\n1,10\n1,20\nb,30\n");
    expect(codes(collapsed)).toEqual(expect.arrayContaining(["DUPLICATE_ID", "MISSING_IDS"]));
  });

  it("accepts BOM, CRLF, quoting and scientific notation", () => {
    const text = '﻿"id","price"\r\n"001","1.1e1"\r\n"1",+20\r\n"b",3e1';
    expect(scoreSubmission(MAE, MAE_SOLUTION, text)).toMatchObject({ ok: true, score: 1 / 3 });
  });

  it("supports quoted IDs and labels containing commas, quotes and newlines", () => {
    const solution = 'id,label\n"a,1","x\ny"\n"b""2","z"\n';
    const submission = 'id,label\r\n"b""2","z"\r\n"a,1","x\r\ny"\r\n';
    // The second label differs only by CRLF vs LF inside the quoted field: exact comparison.
    expect(scoreSubmission(ACCURACY, solution, submission)).toMatchObject({ ok: true, score: 0.5 });
    expect(scoreSubmission(ACCURACY, solution, solution)).toMatchObject({ ok: true, score: 1 });
  });

  it("is deterministic across repeated runs", () => {
    const rows = Array.from({ length: 500 }, (_, i) => `id${i},${(i * 0.1 + 0.03).toFixed(2)}`);
    const solution = `id,price\n${rows.join("\n")}\n`;
    const submission = `id,price\n${rows.map((row, i) => row.replace(/,.*/, `,${(i * 0.1 + 0.07).toFixed(2)}`)).reverse().join("\n")}\n`;
    const definition = { ...MAE, limits: { maxSubmissionBytes: 1_000_000, maxRows: 1000 } };
    const first = scoreSubmission(definition, solution, submission);
    for (let i = 0; i < 5; i += 1) expect(scoreSubmission(definition, solution, submission)).toEqual(first);
    expect(first).toMatchObject({ ok: true });
    if (first.ok) expect(first.score).toBeCloseTo(0.04, 10);
  });
});

describe("scoreSubmission: ID validation", () => {
  it("reports missing IDs and a row count mismatch", () => {
    const result = scoreSubmission(MAE, MAE_SOLUTION, "id,price\n001,10\n1,20\n");
    expect(codes(result)).toEqual(expect.arrayContaining(["ROW_COUNT_MISMATCH", "MISSING_IDS"]));
    const missing = failure(result).find((issue) => issue.code === "MISSING_IDS")!;
    expect(missing.examples).toEqual(["b"]);
    expect(missing.count).toBe(1);
  });

  it("reports extra IDs", () => {
    const result = scoreSubmission(MAE, MAE_SOLUTION, "id,price\n001,10\n1,20\nb,30\nzzz,1\n");
    expect(codes(result)).toEqual(expect.arrayContaining(["ROW_COUNT_MISMATCH", "EXTRA_IDS"]));
  });

  it("reports same-size files with different ID sets as both missing and extra", () => {
    const result = scoreSubmission(MAE, MAE_SOLUTION, "id,price\n001,10\n1,20\nc,30\n");
    expect(codes(result)).toEqual(["MISSING_IDS", "EXTRA_IDS"]);
  });

  it("reports duplicate and empty IDs", () => {
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id,price\n001,10\n001,10\nb,30\n"))).toEqual(
      expect.arrayContaining(["DUPLICATE_ID", "MISSING_IDS"]),
    );
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id,price\n,10\n1,20\nb,30\n"))).toEqual(
      expect.arrayContaining(["EMPTY_ID"]),
    );
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id,price\n  ,10\n1,20\nb,30\n"))).toContain("EMPTY_ID");
  });

  it("does not match IDs loosely (case and whitespace matter)", () => {
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id,price\n001,10\n1,20\nB,30\n"))).toEqual(["MISSING_IDS", "EXTRA_IDS"]);
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id,price\n001,10\n1,20\nb ,30\n"))).toEqual(["MISSING_IDS", "EXTRA_IDS"]);
  });
});

describe("scoreSubmission: structure", () => {
  it("rejects duplicate, missing and unexpected columns", () => {
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id,price,price\n001,1,1\n"))).toContain("DUPLICATE_COLUMN");
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id,id\n001,1\n"))).toEqual(
      expect.arrayContaining(["DUPLICATE_COLUMN", "MISSING_COLUMN"]),
    );
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id,cost\n001,1\n"))).toEqual(["UNEXPECTED_COLUMN", "MISSING_COLUMN"]);
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id,price,extra\n001,1,2\n"))).toEqual(["UNEXPECTED_COLUMN"]);
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id\n001\n"))).toEqual(["MISSING_COLUMN"]);
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "ID,Price\n001,1\n"))).toEqual(["UNEXPECTED_COLUMN", "MISSING_COLUMN"]);
  });

  it("rejects inconsistent column counts, no rows and empty files", () => {
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id,price\n001,10,5\n"))).toEqual(["ROW_COLUMN_COUNT"]);
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id,price\n001\n"))).toEqual(["ROW_COLUMN_COUNT"]);
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id,price\n"))).toEqual(["NO_ROWS"]);
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, ""))).toEqual(["EMPTY_FILE"]);
  });

  it("rejects malformed CSV", () => {
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, 'id,price\n"001,10\n'))).toEqual(["UNTERMINATED_QUOTE"]);
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, 'id,price\n00"1,10\n'))).toEqual(["MALFORMED_QUOTE"]);
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id,price\r001,10\n"))).toEqual(["BARE_CARRIAGE_RETURN"]);
  });

  it("enforces the submission limits from the definition", () => {
    const small = { ...MAE, limits: { maxSubmissionBytes: 20, maxRows: 100 } };
    expect(codes(scoreSubmission(small, MAE_SOLUTION, "id,price\n001,10\n1,20\nb,30\n"))).toEqual(["INPUT_TOO_LARGE"]);
    const fewRows = { ...MAE, limits: { maxSubmissionBytes: 10_000, maxRows: 2 } };
    // The solution itself has 3 rows, which exceeds the definition's row limit.
    expect(failure(scoreSubmission(fewRows, MAE_SOLUTION, MAE_SOLUTION))[0]!.code).toBe("SOLUTION_INVALID");
    const manyRows = `id,price\n${Array.from({ length: 50 }, (_, i) => `${i},1`).join("\n")}\n`;
    const limited = { ...MAE, limits: { maxSubmissionBytes: 10_000, maxRows: 10 } };
    expect(codes(scoreSubmission(limited, "id,price\n1,1\n", manyRows))).toEqual(["TOO_MANY_ROWS"]);
  });
});

describe("scoreSubmission: values", () => {
  it("rejects empty predictions", () => {
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id,price\n001,\n1,20\nb,30\n"))).toEqual(["EMPTY_PREDICTION"]);
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id,price\n001,  \n1,20\nb,30\n"))).toEqual(["EMPTY_PREDICTION"]);
    const acc = "id,label\n1,\n2,x\n3,x\n4,x\n";
    expect(codes(scoreSubmission(ACCURACY, ACC_SOLUTION, acc))).toEqual(["EMPTY_PREDICTION"]);
  });

  it("rejects invalid numeric formats and non-finite values", () => {
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id,price\n001,abc\n1,20\nb,30\n"))).toEqual(["INVALID_NUMBER"]);
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id,price\n001,0x10\n1,20\nb,30\n"))).toEqual(["INVALID_NUMBER"]);
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id,price\n001,NaN\n1,Infinity\nb,1e999\n"))).toEqual(["NON_FINITE_NUMBER"]);
    expect(codes(scoreSubmission(MAE, MAE_SOLUTION, "id,price\n001,NaN\n1,abc\nb,30\n"))).toEqual(
      expect.arrayContaining(["NON_FINITE_NUMBER", "INVALID_NUMBER"]),
    );
  });

  it("aggregates repeated problems into one issue with a count and capped examples", () => {
    const solution = `id,price\n${Array.from({ length: 20 }, (_, i) => `${i},1`).join("\n")}\n`;
    const submission = `id,price\n${Array.from({ length: 20 }, (_, i) => `${i},bad${i}`).join("\n")}\n`;
    const issues = failure(scoreSubmission(MAE, solution, submission));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "INVALID_NUMBER", count: 20, line: 2 });
    expect(issues[0]!.examples).toHaveLength(5);
  });

  it("reports SCORE_NOT_FINITE when the error overflows a double", () => {
    const solution = "id,price\na,1.7e308\nb,-1.7e308\n";
    const result = scoreSubmission({ ...MAE, limits: { maxSubmissionBytes: 1000, maxRows: 10 } }, solution, "id,price\na,-1.7e308\nb,1.7e308\n");
    expect(codes(result)).toEqual(["SCORE_NOT_FINITE"]);
  });
});

describe("scoreSubmission: solution file and secrecy", () => {
  it("blames the challenge, not the learner, for a broken solution", () => {
    for (const bad of ["", "id,price\n1,abc\n", "id,price\n1,1\n1,2\n", "id,cost\n1,1\n", "id,price\n"]) {
      const issues = failure(scoreSubmission(MAE, bad, "id,price\n1,1\n"));
      expect(issues).toHaveLength(1);
      expect(issues[0]!.code).toBe(ChallengeIssueCode.SOLUTION_INVALID);
      expect(issues[0]!.cause).toBeDefined();
    }
  });

  it("never leaks solution labels or values in failure issues", () => {
    const cases: [unknown, string, string][] = [
      [ACCURACY, ACC_SOLUTION, "id,label\n1,x\n2,x\n"],
      [ACCURACY, ACC_SOLUTION, "id,label\n1,x\n2,x\n3,x\n9,x\n"],
      [ACCURACY, ACC_SOLUTION, "id,label\n1,\n2,x\n3,x\n4,x\n"],
      [ACCURACY, ACC_SOLUTION, "id,wrong\n1,x\n"],
      [ACCURACY, "id,label\n1,SECRET_cat\n1,SECRET_dog\n", "id,label\n1,x\n"],
      [MAE, "id,price\n1,123456.789\n2,abc\n", "id,price\n1,1\n"],
      [MAE, "id,price\n1,123456.789\n2,987654.321\n", "id,price\n1,x\n3,2\n"],
    ];
    for (const [definition, solution, submission] of cases) {
      const text = JSON.stringify(failure(scoreSubmission(definition, solution, submission)));
      expect(text).not.toContain("SECRET");
      expect(text).not.toContain("123456");
      expect(text).not.toContain("987654");
    }
  });
});
