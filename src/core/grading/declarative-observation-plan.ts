import type { JsonObject } from "../domain";

import { DeclarativeGraderConfigSchema } from "./grader-config";

export function getDeclarativeObservationVariables(
  config: JsonObject,
): readonly string[] {
  const parsed = DeclarativeGraderConfigSchema.parse(config);
  const variables: string[] = [];
  const seen = new Set<string>();

  for (const check of parsed.checks) {
    if (!("variable" in check) || seen.has(check.variable)) {
      continue;
    }

    seen.add(check.variable);
    variables.push(check.variable);
  }

  return variables;
}
