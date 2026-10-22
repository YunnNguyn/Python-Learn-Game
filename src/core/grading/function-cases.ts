import { z } from "zod";

import { JsonValueSchema, type JsonValue } from "../domain";

/**
 * Behavioral function grading (PHASE-07 / M9) - the DATA model.
 *
 * A `FUNCTION_CASES` check names a function the learner must define and lists the
 * calls the grader will make: an argument set and the expected outcome per case. It is
 * pure, validated, serializable data. There is no expression language, no `eval` and no
 * hidden script: the arguments are rebuilt into Python objects by a fixed helper from
 * the typed JSON described below, and the expected outcome never leaves the main
 * thread (the worker receives the arguments only and reports what each call did).
 *
 * TYPED VALUES ("PyValue"). Plain JSON stands for the obvious Python value
 * (null/bool/number/str/list/dict). JSON cannot say tuple, set, float-vs-int or ndarray,
 * so four closed wrapper objects exist (any other key starting with "$" is rejected):
 *
 *   {"$tuple": [...]}                           a tuple
 *   {"$set": [...]}                             a set (elements: scalars or tuples)
 *   {"$float": 2}                               the float 2.0 (a JSON 2 is an int)
 *   {"$ndarray": [[...]], "dtype"?, "shape"?}   a NumPy ndarray (numeric / bool leaves)
 *
 * The same encoding is used for the values a learner's function returns, so expected
 * and actual values are compared in one representation, in TypeScript.
 */

export const FUNCTION_CASE_LIMITS = Object.freeze({
  maxChecksPerConfig: 4,
  maxCasesPerCheck: 40,
  maxArguments: 8,
  maxKeywordArguments: 8,
  maxValueDepth: 10,
  maxNodesPerValue: 4_000,
  maxNodesPerCheck: 40_000,
  maxLabelLength: 90,
});

export const FUNCTION_DTYPES = [
  "bool",
  "int8",
  "int16",
  "int32",
  "int64",
  "uint8",
  "uint16",
  "uint32",
  "uint64",
  "float32",
  "float64",
] as const;
export type FunctionDtype = (typeof FUNCTION_DTYPES)[number];

export type PyValue = JsonValue;

export const FunctionCaseVisibility = {
  /** The expected value is shown to the learner when this case fails. */
  EXAMPLE: "example",
  /** Only the label, the arguments and the learner's own result are shown. */
  HIDDEN: "hidden",
} as const;
export type FunctionCaseVisibility =
  (typeof FunctionCaseVisibility)[keyof typeof FunctionCaseVisibility];

export type FunctionCaseExpectation =
  | {
      readonly kind: "RETURNS";
      readonly value: PyValue;
      /** Absolute tolerance for number leaves (default: exact equality). */
      readonly tolerance?: number;
      /** Exact Python type name of the top-level result, e.g. "list", "float64". */
      readonly returnType?: string;
    }
  | {
      readonly kind: "RAISES";
      /** The exception class name; a subclass of it is accepted. */
      readonly exception: string;
    };

export interface FunctionCase {
  readonly id: string;
  readonly label: string;
  readonly visibility?: FunctionCaseVisibility;
  readonly args: readonly PyValue[];
  readonly kwargs?: Readonly<Record<string, PyValue>>;
  readonly expect: FunctionCaseExpectation;
  /** When true the call must not modify its arguments. */
  readonly argsUnchanged?: boolean;
}

export interface FunctionCasesCheck {
  readonly type: "FUNCTION_CASES";
  readonly function: string;
  readonly cases: readonly FunctionCase[];
}

// ----------------------------------------------------------------------------- value kinds

export type PyKind =
  | "none"
  | "bool"
  | "number"
  | "str"
  | "list"
  | "dict"
  | "tuple"
  | "set"
  | "ndarray";

const WRAPPER_KEYS = ["$tuple", "$set", "$float", "$ndarray"] as const;

function isObject(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function pyKindOf(value: PyValue): PyKind {
  if (value === null) return "none";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "str";
  if (Array.isArray(value)) return "list";
  const wrapper = WRAPPER_KEYS.find((key) => Object.prototype.hasOwnProperty.call(value, key));
  switch (wrapper) {
    case "$tuple":
      return "tuple";
    case "$set":
      return "set";
    case "$float":
      return "number";
    case "$ndarray":
      return "ndarray";
    default:
      return "dict";
  }
}

/** The plain number behind a number / "$float" value. */
function numberOf(value: PyValue): number {
  if (typeof value === "number") return value;
  return (value as { $float: number }).$float;
}

function wrapperPayload(value: PyValue, key: string): JsonValue {
  return (value as Record<string, JsonValue>)[key]!;
}

/** The shape of an `$ndarray` wrapper: the explicit `shape`, else inferred from the nesting. */
export function ndarrayShapeOf(value: PyValue): number[] {
  const wrapper = value as Record<string, JsonValue>;
  const explicit = wrapper.shape;
  if (Array.isArray(explicit)) return explicit.map((dimension) => Number(dimension));
  const shape: number[] = [];
  let level: JsonValue = wrapper.$ndarray!;
  while (Array.isArray(level)) {
    shape.push(level.length);
    level = level.length > 0 ? level[0]! : null;
  }
  return shape;
}

function ndarrayLeaves(data: JsonValue, out: (number | boolean)[]): void {
  if (Array.isArray(data)) {
    for (const item of data) ndarrayLeaves(item, out);
  } else {
    out.push(data as number | boolean);
  }
}

// ----------------------------------------------------------------------------- validation

interface Budget {
  nodes: number;
}

/** First problem with a PyValue, or null. */
export function findPyValueIssue(value: PyValue, budget: Budget = { nodes: 0 }): string | null {
  return checkValue(value, 0, budget);
}

function checkValue(value: PyValue, depth: number, budget: Budget): string | null {
  budget.nodes += 1;
  if (budget.nodes > FUNCTION_CASE_LIMITS.maxNodesPerValue) return "giá trị quá lớn";
  if (depth > FUNCTION_CASE_LIMITS.maxValueDepth) return "giá trị lồng quá sâu";

  if (value === null || typeof value === "boolean" || typeof value === "string") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? null : "số không hữu hạn";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const issue = checkValue(item, depth + 1, budget);
      if (issue !== null) return issue;
    }
    return null;
  }
  if (!isObject(value)) return "giá trị không hợp lệ";

  const keys = Object.keys(value);
  const dollarKeys = keys.filter((key) => key.startsWith("$"));
  if (dollarKeys.length === 0) {
    for (const key of keys) {
      const issue = checkValue(value[key]!, depth + 1, budget);
      if (issue !== null) return issue;
    }
    return null;
  }

  const wrapper = dollarKeys[0]!;
  if (!(WRAPPER_KEYS as readonly string[]).includes(wrapper)) {
    return `khóa "${wrapper}" không được hỗ trợ`;
  }

  if (wrapper === "$float") {
    if (keys.length !== 1) return '"$float" không nhận thêm khóa khác';
    return typeof value.$float === "number" && Number.isFinite(value.$float)
      ? null
      : '"$float" cần một số hữu hạn';
  }

  if (wrapper === "$tuple" || wrapper === "$set") {
    if (keys.length !== 1) return `"${wrapper}" không nhận thêm khóa khác`;
    const items = value[wrapper];
    if (!Array.isArray(items)) return `"${wrapper}" cần một danh sách`;
    for (const item of items) {
      if (wrapper === "$set") {
        const kind = pyKindOf(item);
        if (kind === "list" || kind === "dict" || kind === "set" || kind === "ndarray") {
          return "phần tử của set phải là giá trị hashable (số, chuỗi, bool, None hoặc tuple)";
        }
      }
      const issue = checkValue(item, depth + 1, budget);
      if (issue !== null) return issue;
    }
    return null;
  }

  // $ndarray
  const extra = keys.filter((key) => key !== "$ndarray" && key !== "dtype" && key !== "shape");
  if (extra.length > 0) return `"$ndarray" không nhận khóa "${extra[0]}"`;
  const data = value.$ndarray;
  if (!Array.isArray(data) && typeof data !== "number" && typeof data !== "boolean") {
    return '"$ndarray" cần một danh sách (hoặc một số cho mảng 0 chiều)';
  }
  if (value.dtype !== undefined && !(FUNCTION_DTYPES as readonly string[]).includes(String(value.dtype))) {
    return `dtype "${String(value.dtype)}" không được hỗ trợ`;
  }
  const leaves: (number | boolean)[] = [];
  const rectangular = (node: JsonValue, shape: number[], level: number): boolean => {
    if (Array.isArray(node)) {
      if (level >= shape.length || node.length !== shape[level]) return false;
      return node.every((child) => rectangular(child, shape, level + 1));
    }
    if (level !== shape.length) return false;
    if (typeof node !== "number" && typeof node !== "boolean") return false;
    if (typeof node === "number" && !Number.isFinite(node)) return false;
    leaves.push(node);
    return true;
  };
  const inferred: number[] = [];
  let probe: JsonValue = data;
  while (Array.isArray(probe)) {
    inferred.push(probe.length);
    probe = probe.length > 0 ? probe[0]! : null;
  }
  const explicit = value.shape;
  let shape = inferred;
  if (explicit !== undefined) {
    if (
      !Array.isArray(explicit) ||
      !explicit.every((dimension) => typeof dimension === "number" && Number.isSafeInteger(dimension) && dimension >= 0)
    ) {
      return '"shape" cần là danh sách số nguyên không âm';
    }
    shape = explicit as number[];
  }
  const total = shape.reduce((product, dimension) => product * dimension, 1);
  if (total === 0) {
    const flat: (number | boolean)[] = [];
    ndarrayLeaves(data, flat);
    if (flat.length !== 0) return '"shape" không khớp dữ liệu';
  } else if (!rectangular(data, shape, 0)) {
    return explicit === undefined
      ? "$ndarray phải là mảng chữ nhật gồm số hoặc bool"
      : '"shape" không khớp dữ liệu';
  }
  budget.nodes += leaves.length;
  if (budget.nodes > FUNCTION_CASE_LIMITS.maxNodesPerValue) return "giá trị quá lớn";
  return null;
}

const pyValueSchema = JsonValueSchema.superRefine((value, context) => {
  const issue = findPyValueIssue(value);
  if (issue !== null) context.addIssue({ code: "custom", message: issue });
});

const identifierSchema = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/, "Expected a Python identifier")
  .refine((name) => !name.startsWith("__runtime_") && !name.startsWith("__probe_"), "Reserved name");

const caseExpectationSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("RETURNS"),
      value: pyValueSchema,
      tolerance: z.number().finite().nonnegative().optional(),
      returnType: z
        .string()
        .regex(/^[A-Za-z_][A-Za-z0-9_]{0,31}$/)
        .optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("RAISES"),
      exception: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/),
    })
    .strict(),
]);

const functionCaseSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,47}$/),
    label: z
      .string()
      .refine((value) => value.trim().length > 0, "Expected a non-blank string")
      .refine((value) => value.length <= FUNCTION_CASE_LIMITS.maxLabelLength, "Label too long"),
    visibility: z.enum([FunctionCaseVisibility.EXAMPLE, FunctionCaseVisibility.HIDDEN]).optional(),
    args: z.array(pyValueSchema).max(FUNCTION_CASE_LIMITS.maxArguments),
    kwargs: z
      .record(identifierSchema, pyValueSchema)
      .refine(
        (value) => Object.keys(value).length <= FUNCTION_CASE_LIMITS.maxKeywordArguments,
        "Too many keyword arguments",
      )
      .optional(),
    expect: caseExpectationSchema,
    argsUnchanged: z.boolean().optional(),
  })
  .strict();

export const FunctionCasesCheckSchema = z
  .object({
    type: z.literal("FUNCTION_CASES"),
    function: identifierSchema,
    cases: z.array(functionCaseSchema).min(1).max(FUNCTION_CASE_LIMITS.maxCasesPerCheck),
  })
  .strict()
  .superRefine((check: FunctionCasesCheck, context) => {
    const seen = new Set<string>();
    for (const [index, item] of check.cases.entries()) {
      if (seen.has(item.id)) {
        context.addIssue({
          code: "custom",
          path: ["cases", index, "id"],
          message: `Duplicate function case id "${item.id}"`,
        });
      }
      seen.add(item.id);
    }
    if (countNodes(check) > FUNCTION_CASE_LIMITS.maxNodesPerCheck) {
      context.addIssue({ code: "custom", message: "FUNCTION_CASES check is too large" });
    }
  });

function countNodes(check: FunctionCasesCheck): number {
  let nodes = 0;
  const walk = (value: JsonValue): void => {
    nodes += 1;
    if (Array.isArray(value)) value.forEach(walk);
    else if (value !== null && typeof value === "object") Object.values(value).forEach(walk);
  };
  for (const item of check.cases) {
    item.args.forEach(walk);
    Object.values(item.kwargs ?? {}).forEach(walk);
    if (item.expect.kind === "RETURNS") walk(item.expect.value);
  }
  return nodes;
}

// ----------------------------------------------------------------------------- comparison

export type PyMismatch = "TYPE" | "DTYPE" | "SHAPE" | "VALUE";

function numbersEqual(actual: number, expected: number, tolerance: number): boolean {
  return tolerance === 0 ? actual === expected : Math.abs(actual - expected) <= tolerance;
}

function canonicalKey(value: PyValue): string {
  switch (pyKindOf(value)) {
    case "number":
      return `n:${numberOf(value)}`;
    case "bool":
      return `b:${String(value)}`;
    case "none":
      return "z";
    case "str":
      return `s:${JSON.stringify(value)}`;
    case "tuple":
      return `t(${(wrapperPayload(value, "$tuple") as PyValue[]).map(canonicalKey).join(",")})`;
    default:
      return JSON.stringify(value);
  }
}

function deepEqual(actual: PyValue, expected: PyValue, tolerance: number): boolean {
  const kind = pyKindOf(actual);
  if (kind !== pyKindOf(expected)) return false;
  switch (kind) {
    case "none":
      return true;
    case "bool":
    case "str":
      return actual === expected;
    case "number":
      return numbersEqual(numberOf(actual), numberOf(expected), tolerance);
    case "list": {
      const left = actual as PyValue[];
      const right = expected as PyValue[];
      return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]!, tolerance));
    }
    case "tuple": {
      const left = wrapperPayload(actual, "$tuple") as PyValue[];
      const right = wrapperPayload(expected, "$tuple") as PyValue[];
      return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]!, tolerance));
    }
    case "set": {
      const left = wrapperPayload(actual, "$set") as PyValue[];
      const right = wrapperPayload(expected, "$set") as PyValue[];
      const rightKeys = new Set(right.map(canonicalKey));
      const leftKeys = new Set(left.map(canonicalKey));
      return leftKeys.size === rightKeys.size && [...leftKeys].every((key) => rightKeys.has(key));
    }
    case "dict": {
      const left = actual as Record<string, PyValue>;
      const right = expected as Record<string, PyValue>;
      const leftKeys = Object.keys(left);
      return (
        leftKeys.length === Object.keys(right).length &&
        leftKeys.every(
          (key) => Object.prototype.hasOwnProperty.call(right, key) && deepEqual(left[key]!, right[key]!, tolerance),
        )
      );
    }
    case "ndarray": {
      const leftLeaves: (number | boolean)[] = [];
      const rightLeaves: (number | boolean)[] = [];
      ndarrayLeaves(wrapperPayload(actual, "$ndarray"), leftLeaves);
      ndarrayLeaves(wrapperPayload(expected, "$ndarray"), rightLeaves);
      return (
        leftLeaves.length === rightLeaves.length &&
        leftLeaves.every((item, index) => {
          const other = rightLeaves[index]!;
          if (typeof item === "boolean" || typeof other === "boolean") return item === other;
          return numbersEqual(item, other, tolerance);
        })
      );
    }
  }
}

/**
 * Compares what a function returned against the expected value. `null` means equal.
 * Otherwise the answer says what KIND of difference it is: a different top-level type
 * (or ndarray dtype), a different ndarray shape, or a different value.
 */
export function comparePyValues(actual: PyValue, expected: PyValue, tolerance = 0): PyMismatch | null {
  const actualKind = pyKindOf(actual);
  const expectedKind = pyKindOf(expected);
  if (actualKind !== expectedKind) return "TYPE";

  if (expectedKind === "ndarray") {
    const expectedDtype = (expected as Record<string, JsonValue>).dtype;
    const actualDtype = (actual as Record<string, JsonValue>).dtype;
    if (expectedDtype !== undefined && actualDtype !== expectedDtype) return "DTYPE";
    const actualShape = ndarrayShapeOf(actual);
    const expectedShape = ndarrayShapeOf(expected);
    if (actualShape.length !== expectedShape.length || actualShape.some((dimension, i) => dimension !== expectedShape[i])) {
      return "SHAPE";
    }
  }

  return deepEqual(actual, expected, tolerance) ? null : "VALUE";
}

// ----------------------------------------------------------------------------- display

/** Python-looking text for a typed value, clipped to `maxLength` characters. */
export function formatPyValue(value: PyValue, maxLength = 120): string {
  const text = renderValue(value);
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function renderValue(value: PyValue): string {
  switch (pyKindOf(value)) {
    case "none":
      return "None";
    case "bool":
      return value === true ? "True" : "False";
    case "number": {
      const wrapped = typeof value !== "number";
      const number = numberOf(value);
      return wrapped && Number.isInteger(number) ? `${number}.0` : String(number);
    }
    case "str":
      return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;
    case "list":
      return `[${(value as PyValue[]).map(renderValue).join(", ")}]`;
    case "tuple": {
      const items = wrapperPayload(value, "$tuple") as PyValue[];
      return items.length === 1 ? `(${renderValue(items[0]!)},)` : `(${items.map(renderValue).join(", ")})`;
    }
    case "set": {
      const items = wrapperPayload(value, "$set") as PyValue[];
      return items.length === 0 ? "set()" : `{${items.map(renderValue).join(", ")}}`;
    }
    case "dict":
      return `{${Object.entries(value as Record<string, PyValue>)
        .map(([key, item]) => `${renderValue(key)}: ${renderValue(item)}`)
        .join(", ")}}`;
    case "ndarray":
      return `array(${renderValue(wrapperPayload(value, "$ndarray"))})`;
  }
}
