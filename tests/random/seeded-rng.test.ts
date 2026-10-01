import { describe, expect, it } from "vitest";

import {
  SEEDED_RNG_ALGORITHM,
  createSeededRng,
  type SeededRng,
} from "../../src/core/random";

function floatSequence(rng: SeededRng, length = 20): number[] {
  return Array.from({ length }, () => rng.nextFloat());
}

describe("SeededRng", () => {
  it("exports the locked v1 algorithm identifier", () => {
    expect(SEEDED_RNG_ALGORITHM).toBe("fnv1a32-mulberry32-v1");
  });

  it("reproduces the same float stream for the same seed and call sequence", () => {
    const first = createSeededRng("mission-42");
    const second = createSeededRng("mission-42");

    expect(floatSequence(first)).toEqual(floatSequence(second));
  });

  it("recreating an RNG restarts the stream from the beginning", () => {
    const first = createSeededRng("restart-stream");
    const expected = floatSequence(first, 12);

    floatSequence(first, 7);

    expect(floatSequence(createSeededRng("restart-stream"), 12)).toEqual(
      expected,
    );
  });

  it("keeps independent instances from the same seed state-isolated", () => {
    const advanced = createSeededRng("independent-state");
    const untouched = createSeededRng("independent-state");
    const canonical = createSeededRng("independent-state");

    floatSequence(advanced, 6);

    expect(untouched.nextFloat()).toBe(canonical.nextFloat());
  });

  it("locks the golden float vector for fnv1a32 + mulberry32 v1", () => {
    const rng = createSeededRng("f4.1-golden-v1");

    expect(floatSequence(rng, 8)).toEqual([
      0.8471142086200416,
      0.9316760781221092,
      0.06874473160132766,
      0.31883156346157193,
      0.7303449320606887,
      0.6227224743925035,
      0.8598110596649349,
      0.1478172589559108,
    ]);
  });

  it("treats the exact seed text as the deterministic input", () => {
    const lower = floatSequence(createSeededRng("seed"), 6);
    const capitalized = floatSequence(createSeededRng("Seed"), 6);
    const padded = floatSequence(createSeededRng(" seed "), 6);

    expect(lower).not.toEqual(capitalized);
    expect(lower).not.toEqual(padded);
    expect(capitalized).not.toEqual(padded);
  });

  it("produces distinct smoke-test streams for several fixed different seeds", () => {
    const streams = ["alpha", "beta", "gamma", "delta"].map((seed) =>
      floatSequence(createSeededRng(seed), 5),
    );

    expect(new Set(streams.map((stream) => JSON.stringify(stream))).size).toBe(
      streams.length,
    );
  });

  it("keeps nextFloat inside the half-open [0, 1) interval", () => {
    const rng = createSeededRng("float-range");

    for (const value of floatSequence(rng, 512)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("locks a deterministic nextInt golden vector", () => {
    const rng = createSeededRng("integer-golden-v1");

    expect(Array.from({ length: 10 }, () => rng.nextInt(0, 100))).toEqual([
      74, 66, 35, 24, 6, 40, 95, 96, 70, 47,
    ]);
  });

  it("uses half-open nextInt ranges including negatives and size-one ranges", () => {
    const rng = createSeededRng("integer-ranges");

    for (let index = 0; index < 256; index += 1) {
      const value = rng.nextInt(-5, 5);
      expect(value).toBeGreaterThanOrEqual(-5);
      expect(value).toBeLessThan(5);
    }

    expect(Array.from({ length: 20 }, () => rng.nextInt(10, 11))).toEqual(
      Array(20).fill(10),
    );
  });

  it("accepts a nextInt span of exactly 2^32", () => {
    const rng = createSeededRng("full-uint32-span");

    for (let index = 0; index < 32; index += 1) {
      const value = rng.nextInt(-2_147_483_648, 2_147_483_648);
      expect(value).toBeGreaterThanOrEqual(-2_147_483_648);
      expect(value).toBeLessThan(2_147_483_648);
    }
  });

  it.each([
    [5, 5],
    [5, 4],
    [0.5, 3],
    [Number.NaN, 4],
    [0, Number.POSITIVE_INFINITY],
    [Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 2],
    [0, 0x1_0000_0001],
  ])("rejects invalid nextInt bounds (%s, %s)", (min, max) => {
    expect(() => createSeededRng("invalid-range").nextInt(min, max)).toThrow(
      RangeError,
    );
  });

  it("provides deterministic pick without mutating the input", () => {
    const items = ["north", "south", "east", "west"] as const;
    const snapshot = [...items];
    const first = createSeededRng("pick-sequence");
    const second = createSeededRng("pick-sequence");

    const firstPicks = Array.from({ length: 12 }, () => first.pick(items));
    const secondPicks = Array.from({ length: 12 }, () => second.pick(items));

    expect(firstPicks).toEqual(secondPicks);
    expect(items).toEqual(snapshot);
  });

  it("throws RangeError when pick receives an empty list", () => {
    expect(() => createSeededRng("empty-pick").pick([])).toThrow(RangeError);
  });

  it("provides deterministic Fisher-Yates shuffle without mutating input", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const snapshot = [...items];
    const first = createSeededRng("shuffle-sequence");
    const second = createSeededRng("shuffle-sequence");

    const firstResult = first.shuffle(items);
    const secondResult = second.shuffle(items);

    expect(firstResult).toEqual(secondResult);
    expect(items).toEqual(snapshot);
    expect([...firstResult].sort((a, b) => a - b)).toEqual(snapshot);
  });

  it("returns copied arrays for empty and singleton shuffle inputs", () => {
    const rng = createSeededRng("small-shuffles");
    const empty: readonly number[] = [];
    const singleton = [42] as const;

    const emptyResult = rng.shuffle(empty);
    const singletonResult = rng.shuffle(singleton);

    expect(emptyResult).toEqual([]);
    expect(singletonResult).toEqual([42]);
    expect(emptyResult).not.toBe(empty);
    expect(singletonResult).not.toBe(singleton);
  });

  it("preserves generic object references and does not modify object values", () => {
    const first = { id: "a", value: 1 };
    const second = { id: "b", value: 2 };
    const third = { id: "c", value: 3 };
    const items = [first, second, third] as const;
    const before = items.map((item) => ({ ...item }));
    const rng = createSeededRng("object-items");

    const picked = rng.pick(items);
    const shuffled = rng.shuffle(items);

    expect(items).toEqual(before);
    expect(items).toContain(picked);
    expect(shuffled).toHaveLength(items.length);
    expect(new Set(shuffled)).toEqual(new Set(items));
  });
});
