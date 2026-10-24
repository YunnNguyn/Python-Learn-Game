import { describe, expect, it } from "vitest";

import fixtureText from "../../qa/m11-acceptance/fixtures/solutions.json?raw";
import {
  PYTHON_FOUNDATIONS_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_M9_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_M10_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_M11_ACTIVITY_IDS,
} from "../../src/content/python-foundations";
import { m11FixtureOf } from "./qa-m11-fixture";

/**
 * The Edge acceptance runner (qa/m11-acceptance, plain .mjs) cannot import the TypeScript test
 * data, so it reads a JSON copy. This test is the guard against that copy drifting: the JSON
 * must be exactly what the M8..M11 solution files and the shipped starters hold. If it fails
 * after a change to those files, regenerate the JSON from `m11FixtureOf()`: write
 * `JSON.stringify(m11FixtureOf(), null, 2) + "\n"` to qa/m11-acceptance/fixtures/solutions.json.
 */
const ALL_IDS = [
  ...PYTHON_FOUNDATIONS_ACTIVITY_IDS,
  ...PYTHON_FOUNDATIONS_M9_ACTIVITY_IDS,
  ...PYTHON_FOUNDATIONS_M10_ACTIVITY_IDS,
  ...PYTHON_FOUNDATIONS_M11_ACTIVITY_IDS,
];

describe("qa/m11-acceptance fixtures", () => {
  it("solutions.json is an exact copy of the starters and of the M8 + M9 + M10 + M11 solution data", () => {
    const fromJson = JSON.parse(fixtureText) as Record<string, unknown>;
    expect(Object.keys(fromJson)).toEqual([...ALL_IDS]);
    expect(ALL_IDS).toHaveLength(27);
    expect(fromJson).toEqual(m11FixtureOf());
  });

  it("every mission has at least one wrong solution that is graded (not a crash) for the runner to submit", () => {
    const fromJson = JSON.parse(fixtureText) as Record<string, { wrong: Array<{ raises?: string; fails: string[]; failsFunctions?: string[] }> }>;
    for (const id of ALL_IDS) {
      const graded = fromJson[id]!.wrong.filter((wrong) => wrong.raises === undefined);
      expect(graded.length, id).toBeGreaterThan(0);
      for (const wrong of graded) expect(wrong.fails.length + (wrong.failsFunctions?.length ?? 0), id).toBeGreaterThan(0);
    }
  });
});
