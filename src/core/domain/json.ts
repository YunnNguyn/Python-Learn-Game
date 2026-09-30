import { z } from "zod";

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

export type JsonObject = {
  [key: string]: JsonValue;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isJsonValue = (value: unknown, ancestors: Set<object>): value is JsonValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      return false;
    }

    ancestors.add(value);
    const valid = value.every((item) => isJsonValue(item, ancestors));
    ancestors.delete(value);
    return valid;
  }

  if (!isPlainObject(value)) {
    return false;
  }

  if (ancestors.has(value)) {
    return false;
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    return false;
  }

  ancestors.add(value);
  const valid = Object.values(value).every((item) =>
    isJsonValue(item, ancestors),
  );
  ancestors.delete(value);
  return valid;
};

export const JsonValueSchema: z.ZodType<JsonValue> = z.custom<JsonValue>(
  (value) => isJsonValue(value, new Set<object>()),
  { message: "Expected a JSON-compatible value" },
);

export const JsonObjectSchema: z.ZodType<JsonObject> = z.custom<JsonObject>(
  (value) =>
    isPlainObject(value) && isJsonValue(value, new Set<object>()),
  { message: "Expected a JSON-compatible object" },
);
