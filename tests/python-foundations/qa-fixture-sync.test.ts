import { describe, expect, it } from "vitest";

import fixtureText from "../../qa/m8-acceptance/fixtures/solutions.json?raw";
import {
  PYTHON_FOUNDATIONS_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_STARTER_CODE,
} from "../../src/content/python-foundations";
import { SOLUTIONS } from "./solutions";

const starterOf = (id: string): string =>
  Object.values(PYTHON_FOUNDATIONS_STARTER_CODE)[PYTHON_FOUNDATIONS_ACTIVITY_IDS.indexOf(id as never)] as string;

/**
 * The Edge acceptance runner (qa/m8-acceptance, plain .mjs) cannot import the TypeScript test
 * data, so it reads a JSON copy. This test is the guard against that copy drifting: the JSON
 * must be exactly what solutions.ts and content.ts hold (same ids, starter, reference and wrong solutions in the same order).
 * If this fails after a change to solutions.ts, copy the changed entries into the JSON file.
 */
describe("qa/m8-acceptance fixtures", () => {
  it("solutions.json is an exact copy of the starters and tests/python-foundations/solutions.ts", () => {
    const fromJson = JSON.parse(fixtureText) as Record<string, unknown>;

    const expected = Object.fromEntries(
      Object.keys(SOLUTIONS)
        .sort()
        .map((id) => [
          id,
          {
            starter: starterOf(id),
            reference: SOLUTIONS[id]!.reference,
            wrong: SOLUTIONS[id]!.wrong.map((wrong) => ({
              name: wrong.name,
              code: wrong.code,
              fails: [...wrong.fails],
              ...(wrong.raises === undefined ? {} : { raises: wrong.raises }),
            })),
          },
        ]),
    );

    expect(fromJson).toEqual(expected);
  });
});
