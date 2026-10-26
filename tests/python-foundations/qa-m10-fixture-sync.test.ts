import { describe, expect, it } from "vitest";

import fixtureText from "../../qa/m10-acceptance/fixtures/solutions.json?raw";
import {
  PYTHON_FOUNDATIONS_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_M9_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_M10_ACTIVITY_IDS,
} from "../../src/content/python-foundations";
import { m10FixtureOf } from "./qa-m10-fixture";

/**
 * The Edge acceptance runner (qa/m10-acceptance, plain .mjs) cannot import the TypeScript test
 * data, so it reads a JSON copy. This test is the guard against that copy drifting: the JSON
 * must be exactly what solutions.ts, m9-solutions.ts, m10-solutions.ts and the shipped
 * starters hold. If it fails after a change to those files, regenerate the JSON from
 * `m10FixtureOf()`: write `JSON.stringify(m10FixtureOf(), null, 2) + "\n"` to qa/m10-acceptance/fixtures/solutions.json.
 */
// qa/m10-acceptance is frozen at the 26 missions of M8 + M9 + M10; PF-27 lives in qa/m11-acceptance.
const M10_ERA_IDS = [
  ...PYTHON_FOUNDATIONS_ACTIVITY_IDS,
  ...PYTHON_FOUNDATIONS_M9_ACTIVITY_IDS,
  ...PYTHON_FOUNDATIONS_M10_ACTIVITY_IDS,
];

describe("qa/m10-acceptance fixtures", () => {
  it("solutions.json is an exact copy of the starters and of the M8 + M9 + M10 solution data", () => {
    const fromJson = JSON.parse(fixtureText) as Record<string, unknown>;
    expect(Object.keys(fromJson)).toEqual([...M10_ERA_IDS]);
    expect(fromJson).toEqual(m10FixtureOf());
  });

  it("every mission has at least one wrong solution that is graded (not a crash) for the runner to submit", () => {
    const fromJson = JSON.parse(fixtureText) as Record<string, { wrong: Array<{ raises?: string; fails: string[]; failsFunctions?: string[] }> }>;
    for (const id of M10_ERA_IDS) {
      const graded = fromJson[id]!.wrong.filter((wrong) => wrong.raises === undefined);
      expect(graded.length, id).toBeGreaterThan(0);
      for (const wrong of graded) expect(wrong.fails.length + (wrong.failsFunctions?.length ?? 0), id).toBeGreaterThan(0);
    }
  });
});
