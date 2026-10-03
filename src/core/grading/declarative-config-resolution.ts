import type { JsonObject, JsonValue } from "../domain";
import { DeclarativeGraderConfigSchema, type DeclarativeGraderConfig } from "./grader-config";

const GRADING_DATA_REFERENCE_KEY = "$gradingData";

/**
 * Resolves authored declarative grader config against hidden per-instance grading data.
 *
 * A reference is an exact one-key JSON object:
 *   { "$gradingData": "expectedShape" }
 * or a dotted path such as:
 *   { "$gradingData": "expected.result" }
 *
 * The returned value is validated by the canonical declarative grader schema, so the
 * grader itself remains unaware of MissionInstance or hidden grading data.
 */
export type ResolvedDeclarativeGraderConfig = DeclarativeGraderConfig & JsonObject;

export function resolveDeclarativeGraderConfig(
  authoredConfig: JsonObject,
  gradingData: JsonObject | undefined,
): ResolvedDeclarativeGraderConfig {
  const resolved = resolveJsonValue(authoredConfig, gradingData, "grader.config");
  return DeclarativeGraderConfigSchema.parse(
    resolved,
  ) as ResolvedDeclarativeGraderConfig;
}

function resolveJsonValue(
  value: JsonValue,
  gradingData: JsonObject | undefined,
  path: string,
): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      resolveJsonValue(item, gradingData, `${path}[${index}]`),
    );
  }

  if (isJsonObject(value)) {
    const keys = Object.keys(value);
    if (
      keys.length === 1 &&
      keys[0] === GRADING_DATA_REFERENCE_KEY &&
      typeof value[GRADING_DATA_REFERENCE_KEY] === "string"
    ) {
      return resolveGradingDataReference(
        gradingData,
        value[GRADING_DATA_REFERENCE_KEY] as string,
        path,
      );
    }

    const resolved: Record<string, JsonValue> = {};
    for (const [key, child] of Object.entries(value)) {
      resolved[key] = resolveJsonValue(child, gradingData, `${path}.${key}`);
    }
    return resolved;
  }

  return value;
}

function resolveGradingDataReference(
  gradingData: JsonObject | undefined,
  reference: string,
  configPath: string,
): JsonValue {
  const segments = reference.split(".");
  if (
    gradingData === undefined ||
    segments.length === 0 ||
    segments.some((segment) => segment.trim().length === 0)
  ) {
    throw new Error(
      `Cannot resolve grading-data reference "${reference}" at ${configPath}.`,
    );
  }

  let current: JsonValue = gradingData;
  for (const segment of segments) {
    if (!isJsonObject(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      throw new Error(
        `Missing grading-data reference "${reference}" at ${configPath}.`,
      );
    }
    current = current[segment]!;
  }

  return cloneJsonValue(current);
}

function cloneJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(cloneJsonValue);
  }
  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cloneJsonValue(child)]),
    );
  }
  return value;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
