import { describe, expect, it } from "vitest";

import fixtureText from "../../qa/m9-acceptance/fixtures/solutions.json?raw";
import { PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS } from "../../src/content/python-foundations";
import { m9FixtureOf } from "./qa-m9-fixture";

/**
 * The Edge acceptance runner (qa/m9-acceptance, plain .mjs) cannot import the TypeScript test
 * data, so it reads a JSON copy. This test is the guard against that copy drifting: the JSON
 * must be exactly what solutions.ts, m9-solutions.ts and the shipped starters hold.
 * If this fails after a change to those files, regenerate the JSON from `m9FixtureOf()`.
 */
describe("qa/m9-acceptance fixtures", () => {
  it("solutions.json is an exact copy of the starters and of the M8 + M9 solution data", () => {
    const fromJson = JSON.parse(fixtureText) as Record<string, unknown>;
    expect(Object.keys(fromJson)).toEqual([...PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS]);
    expect(fromJson).toEqual(m9FixtureOf());
  });

  it("every M9 mission has at least one wrong solution that is graded (not a crash) for the runner to submit", () => {
    const fromJson = JSON.parse(fixtureText) as Record<string, { wrong: Array<{ raises?: string; fails: string[]; failsFunctions?: string[] }> }>;
    for (const id of PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS) {
      const graded = fromJson[id]!.wrong.filter((wrong) => wrong.raises === undefined);
      expect(graded.length, id).toBeGreaterThan(0);
      for (const wrong of graded) expect(wrong.fails.length + (wrong.failsFunctions?.length ?? 0), id).toBeGreaterThan(0);
    }
  });
});
