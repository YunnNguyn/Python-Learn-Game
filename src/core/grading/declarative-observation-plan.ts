import type { JsonObject } from "../domain";
import type { FunctionProbeSpec } from "../runtime/function-probes";

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

/**
 * M9: the function calls the runtime must make for this config, one probe per
 * FUNCTION_CASES check in config order. Only function names and arguments are exposed:
 * expectations and labels never leave the grader.
 */
export function getDeclarativeFunctionProbes(
  config: JsonObject,
): readonly FunctionProbeSpec[] {
  const parsed = DeclarativeGraderConfigSchema.parse(config);
  const probes: FunctionProbeSpec[] = [];

  for (const check of parsed.checks) {
    if (check.type === "TYPED_VALUE") {
      // M10: a probe that reads (does not call) the variable; the expectation stays here.
      probes.push({ function: check.variable, mode: "value", cases: [{ args: [] }] });
      continue;
    }
    if (check.type !== "FUNCTION_CASES") {
      continue;
    }

    probes.push({
      function: check.function,
      cases: check.cases.map((testCase) => ({
        args: testCase.args,
        ...(testCase.kwargs !== undefined && Object.keys(testCase.kwargs).length > 0
          ? { kwargs: testCase.kwargs }
          : {}),
        ...(testCase.argsUnchanged === true ? { checkArgsUnchanged: true } : {}),
      })),
    });
  }

  return probes;
}
