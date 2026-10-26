import {
  PYTHON_FOUNDATIONS_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_M9_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_M9_STARTER_CODE,
  PYTHON_FOUNDATIONS_STARTER_CODE,
} from "../../src/content/python-foundations";
import { M9_SOLUTIONS } from "./m9-solutions";
import { SOLUTIONS } from "./solutions";

/**
 * What qa/m9-acceptance/fixtures/solutions.json must contain: the starters, the reference
 * solutions and the deliberately wrong solutions of ALL fifteen Python Foundations missions
 * (the seven M8 ones and the eight M9 ones), keyed by activity id. The Edge runner is a plain
 * .mjs file that cannot import TypeScript, so it reads this data as JSON; qa-m9-fixture-sync
 * .test.ts fails if the JSON ever drifts from this function.
 */
export function m9FixtureOf(): Record<string, unknown> {
  const entries: Array<[string, unknown]> = [];
  for (const [index, id] of PYTHON_FOUNDATIONS_ACTIVITY_IDS.entries()) {
    const solutions = SOLUTIONS[id]!;
    entries.push([
      id,
      {
        starter: Object.values(PYTHON_FOUNDATIONS_STARTER_CODE)[index] as string,
        reference: solutions.reference,
        wrong: solutions.wrong.map((wrong) => ({
          name: wrong.name,
          code: wrong.code,
          fails: [...wrong.fails],
          ...(wrong.raises === undefined ? {} : { raises: wrong.raises }),
        })),
      },
    ]);
  }
  for (const id of PYTHON_FOUNDATIONS_M9_ACTIVITY_IDS) {
    const key = id.replace("python-foundations.", "") as keyof typeof PYTHON_FOUNDATIONS_M9_STARTER_CODE;
    const solutions = M9_SOLUTIONS[id]!;
    entries.push([
      id,
      {
        starter: PYTHON_FOUNDATIONS_M9_STARTER_CODE[key],
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
