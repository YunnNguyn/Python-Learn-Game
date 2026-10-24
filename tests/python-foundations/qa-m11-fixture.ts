import {
  PYTHON_FOUNDATIONS_M11_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_M11_STARTER_CODE,
} from "../../src/content/python-foundations";
import { M11_SOLUTIONS } from "./m11-solutions";
import { m10FixtureOf } from "./qa-m10-fixture";

/**
 * What qa/m11-acceptance/fixtures/solutions.json must contain: the starters, the reference
 * solutions and the deliberately wrong solutions of ALL twenty-seven Python Foundations
 * missions (PF-01..PF-26 exactly as qa/m10-acceptance has them, plus the M11 capstone PF-27),
 * keyed by activity id. The Edge runner is a plain .mjs file that cannot import TypeScript,
 * so it reads this data as JSON; qa-m11-fixture-sync.test.ts fails if the JSON ever drifts.
 */
export function m11FixtureOf(): Record<string, unknown> {
  const entries: Array<[string, unknown]> = Object.entries(m10FixtureOf());
  for (const id of PYTHON_FOUNDATIONS_M11_ACTIVITY_IDS) {
    const key = id.replace("python-foundations.", "") as keyof typeof PYTHON_FOUNDATIONS_M11_STARTER_CODE;
    const solutions = M11_SOLUTIONS[id]!;
    entries.push([
      id,
      {
        starter: PYTHON_FOUNDATIONS_M11_STARTER_CODE[key],
        reference: solutions.reference,
        wrong: solutions.wrong.map((wrong) => ({
          name: wrong.name,
          code: wrong.code,
          fails: [...wrong.fails],
          ...(wrong.failsFunctions === undefined ? {} : { failsFunctions: [...wrong.failsFunctions] }),
          ...(wrong.raises === undefined ? {} : { raises: wrong.raises }),
        })),
      },
    ]);
  }
  return Object.fromEntries(entries);
}
