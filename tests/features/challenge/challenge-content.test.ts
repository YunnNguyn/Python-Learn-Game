import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import { createChallengeServices } from "../../../src/app/services";
import { CHALLENGE_CATALOG } from "../../../src/content/challenges/catalog";
import { DELIVERY_TIME_DEFINITION } from "../../../src/content/challenges/delivery-time/definition";
import solutionCsv from "../../../src/content/challenges/delivery-time/solution.csv?raw";
import { challengePresentation } from "../../../src/content/challenges/presentations";
import { IndexedDbChallengePersistence, parseChallengeDefinition, scoreSubmission } from "../../../src/core/challenge";
import { parseCsv } from "../../../src/core/challenge/csv";
import sampleCsv from "../../../public/challenges/delivery-time/v1/sample_submission.csv?raw";
import testCsv from "../../../public/challenges/delivery-time/v1/test.csv?raw";
import trainCsv from "../../../public/challenges/delivery-time/v1/train.csv?raw";

const LIMITS = { maxBytes: 1_000_000, maxRows: 1000 };

function table(text: string) {
  const parsed = parseCsv(text, LIMITS);
  if (!parsed.ok) throw new Error(`CSV did not parse: ${parsed.code}`);
  return parsed.table;
}

const train = table(trainCsv);
const test = table(testCsv);
const sample = table(sampleCsv);
const solution = table(solutionCsv);
const ids = (rows: readonly (readonly string[])[]) => rows.map((row) => row[0]!);

describe("Delivery-time challenge: definition and catalog", () => {
  it("has one valid catalog entry matching the Design Lock", () => {
    expect(CHALLENGE_CATALOG).toHaveLength(1);
    expect(parseChallengeDefinition(CHALLENGE_CATALOG[0]!.definition).ok).toBe(true);
    expect(DELIVERY_TIME_DEFINITION).toMatchObject({
      id: "delivery-time",
      version: "1",
      title: "Dự đoán thời gian giao hàng",
      metric: "mae",
      idColumn: "order_id",
      targetColumn: "delivery_minutes",
      targetType: "numeric",
    });
  });

  it("is accepted by the services, whose public metadata has no solution content", () => {
    const services = createChallengeServices(
      { catalog: CHALLENGE_CATALOG },
      { persistence: new IndexedDbChallengePersistence(new IDBFactory()) },
    );
    const listing = services.listChallenges();
    expect(listing.ok && listing.value.map((challenge) => challenge.id)).toEqual(["delivery-time"]);
    const text = JSON.stringify(listing);
    expect(text).not.toContain("ORD0"); // no order id, hence no id/label pair, of the solution
  });
});

describe("Delivery-time challenge: dataset consistency", () => {
  it("has the documented columns and sizes", () => {
    expect(train.header).toEqual(["order_id", "distance_km", "traffic_level", "items_count", "delivery_minutes"]);
    expect(test.header).toEqual(["order_id", "distance_km", "traffic_level", "items_count"]);
    expect(sample.header).toEqual(["order_id", "delivery_minutes"]);
    expect(solution.header).toEqual(["order_id", "delivery_minutes"]);
    expect([train.rows.length, test.rows.length, sample.rows.length, solution.rows.length]).toEqual([40, 12, 12, 12]);
  });

  it("uses the same test ids in test.csv, the sample and the solution, disjoint from train", () => {
    expect(new Set(ids(test.rows)).size).toBe(12);
    expect(ids(sample.rows)).toEqual(ids(test.rows));
    expect(ids(solution.rows)).toEqual(ids(test.rows));
    expect(new Set(ids(train.rows)).size).toBe(40);
    const trainIds = new Set(ids(train.rows));
    expect(ids(test.rows).some((id) => trainIds.has(id))).toBe(false);
  });

  it("has realistic, well-formed feature values", () => {
    for (const row of [...train.rows, ...test.rows]) {
      const distance = Number(row[1]);
      const traffic = Number(row[2]);
      const items = Number(row[3]);
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(15);
      expect([0, 1, 2]).toContain(traffic);
      expect(Number.isInteger(items)).toBe(true);
      expect(items).toBeGreaterThanOrEqual(1);
    }
    for (const row of [...train.rows, ...solution.rows]) {
      const minutes = Number(row[row.length - 1]);
      expect(Number.isFinite(minutes)).toBe(true);
      expect(minutes).toBeGreaterThan(5);
      expect(minutes).toBeLessThan(90);
    }
    // Every traffic level occurs in train, so a model can learn from all of them.
    expect(new Set(train.rows.map((row) => row[2]))).toEqual(new Set(["0", "1", "2"]));
  });

  it("keeps delivery time consistent with the features (longer distance and more traffic take longer)", () => {
    const slope = (x: number[], y: number[]) => {
      const mx = x.reduce((a, b) => a + b) / x.length;
      const my = y.reduce((a, b) => a + b) / y.length;
      return x.reduce((a, xi, i) => a + (xi - mx) * (y[i]! - my), 0) / x.reduce((a, xi) => a + (xi - mx) ** 2, 0);
    };
    const minutes = train.rows.map((row) => Number(row[4]));
    expect(slope(train.rows.map((row) => Number(row[1])), minutes)).toBeGreaterThan(1.5);
    expect(slope(train.rows.map((row) => Number(row[2])), minutes)).toBeGreaterThan(2);
  });

  it("ships only train, test and sample as public files; the solution is not among them", () => {
    const publicFiles = import.meta.glob("../../../public/**/*.csv", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    expect(Object.keys(publicFiles).map((path) => path.split("/").pop()).sort()).toEqual(["sample_submission.csv", "test.csv", "train.csv"]);
    for (const content of Object.values(publicFiles)) expect(content).not.toBe(solutionCsv);
  });

  it("publishes no ground-truth label in the public files", () => {
    for (const row of solution.rows) {
      expect(testCsv).not.toContain(`${row[0]},${row[1]}`);
      expect(sampleCsv).not.toContain(`${row[0]},${row[1]}`);
    }
    expect(new Set(sample.rows.map((row) => row[1])).size).toBe(1); // a constant baseline, not per-order labels
  });
});

describe("Delivery-time challenge: scoring", () => {
  const score = (submission: string) => scoreSubmission(DELIVERY_TIME_DEFINITION, solutionCsv, submission);
  const csvOf = (values: readonly number[]) =>
    `order_id,delivery_minutes\n${test.rows.map((row, i) => `${row[0]},${values[i]}`).join("\n")}\n`;

  it("accepts the sample submission, scoring the train-mean baseline", () => {
    const result = score(sampleCsv);
    expect(result).toMatchObject({ ok: true, metric: "mae", rowCount: 12 });
    // Independently computed: mean(train) = 35.4; mean |35.4 - label| over the 12 test orders.
    if (result.ok) expect(result.score).toBeCloseTo(8.616667, 5);
  });

  it("gives MAE 0 for the exact labels and the known MAE for a formula-based fixture", () => {
    expect(score(solutionCsv)).toMatchObject({ ok: true, score: 0 });
    const formula = [44.1, 28.8, 47.9, 50.8, 47, 30.1, 39.9, 34.2, 47.7, 46.8, 31.7, 47];
    const result = score(csvOf(formula));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.score).toBeCloseTo(1.383333, 5);
  });

  it("is independent of row order", () => {
    const lines = sampleCsv.trim().split("\n");
    const shuffled = [lines[0]!, ...lines.slice(1).reverse()].join("\n");
    expect(score(shuffled)).toEqual(score(sampleCsv));
  });

  it("rejects a submission missing an order, with actionable issues and no labels", () => {
    const short = sampleCsv.trim().split("\n").slice(0, -1).join("\n");
    const result = score(short);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["ROW_COUNT_MISMATCH", "MISSING_IDS"]));
      for (const row of solution.rows) expect(JSON.stringify(result.issues)).not.toContain(`,${row[1]}`);
    }
  });
});

describe("Delivery-time challenge: presentation", () => {
  const presentation = challengePresentation("delivery-time")!;

  it("links exactly the three public files, under the versioned static path", () => {
    expect(presentation.files.map((file) => file.filename)).toEqual(["train.csv", "test.csv", "sample_submission.csv"]);
    for (const file of presentation.files) expect(file.url).toMatch(/challenges\/delivery-time\/v1\/[a-z_]+\.csv$/);
    expect(presentation.sampleSubmissionUrl).toMatch(/challenges\/delivery-time\/v1\/sample_submission\.csv$/);
    expect(challengePresentation("nope")).toBeUndefined();
  });

  it("documents every column of the public files", () => {
    const documented = presentation.columns.map((column) => column.name);
    for (const column of [...train.header, ...test.header]) expect(documented).toContain(column);
  });

  it("contains no ground-truth label", () => {
    const text = JSON.stringify(presentation);
    for (const row of solution.rows) expect(text).not.toContain(`${row[0]},${row[1]}`);
  });
});
