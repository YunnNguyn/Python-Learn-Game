import {
  PYTHON_FOUNDATIONS_M10_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_M10_STARTER_CODE,
} from "../../src/content/python-foundations";
import { M10_SOLUTIONS } from "./m10-solutions";
import { m9FixtureOf } from "./qa-m9-fixture";

/**
 * What qa/m10-acceptance/fixtures/solutions.json must contain: the starters, the reference
 * solutions and the deliberately wrong solutions of ALL twenty-six Python Foundations
 * missions (PF-01..PF-15 exactly as qa/m9-acceptance has them, plus the eleven M10 ones),
 * keyed by activity id. The Edge runner is a plain .mjs file that cannot import TypeScript,
 * so it reads this data as JSON; qa-m10-fixture-sync.test.ts fails if the JSON ever drifts.
 */
export function m10FixtureOf(): Record<string, unknown> {
  const entries: Array<[string, unknown]> = Object.entries(m9FixtureOf());
  for (const id of PYTHON_FOUNDATIONS_M10_ACTIVITY_IDS) {
    const key = id.replace("python-foundations.", "") as keyof typeof PYTHON_FOUNDATIONS_M10_STARTER_CODE;
    const solutions = M10_SOLUTIONS[id]!;
    entries.push([
      id,
      {
        starter: PYTHON_FOUNDATIONS_M10_STARTER_CODE[key],
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
