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
 * so closed wrapper objects exist (any other key starting with "$" is rejected):
 *
 *   {"$tuple": [...]}                           a tuple
 *   {"$set": [...]}                             a set (elements: scalars or tuples)
 *   {"$float": 2}                               the float 2.0 (a JSON 2 is an int)
 *   {"$ndarray": [[...]], "dtype"?, "shape"?}   a NumPy ndarray (numeric / bool leaves)
 *
 * PHASE-08 / M10 adds three more, for pandas and Matplotlib. They are still plain data
 * and still compared in TypeScript; nothing here evaluates text:
 *
 *   {"$dataframe": {"columns": [...], "data": [[...row...]], "index"?, "indexName"?, "dtypes"?}}
 *       a pandas DataFrame (row-major cells; null = missing). In an EXPECTED value, an
 *       omitted "index" / "indexName" / "dtypes" means "not checked".
 *   {"$series": {"data": [...], "index"?, "name"?, "dtype"?}}
 *       a pandas Series (same rule for the optional fields).
 *   {"$figure": {"title"?, "xlabel"?, "ylabel"?, "legend"?, "series"?: [{"kind","x","y","label"?}]}}
 *       a summary of a Matplotlib Axes: the properties a learner controls, never pixels.
 *       In an EXPECTED value a text field is the exact text, or `true` for "any non-blank
 *       text"; `legend` is the list of labels or `true`; an omitted field is not checked.
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
  /** M10: tables and figure summaries stay small enough for the browser. */
  maxTableRows: 200,
  maxTableColumns: 24,
  maxFigureSeries: 8,
  maxFigurePoints: 400,
});

/** M10: dtypes a DataFrame / Series expectation may name (pandas 3 names, as `str(dtype)`). */
export const TABLE_DTYPES = ["int64", "float64", "bool", "str", "object", "category"] as const;
export type TableDtype = (typeof TABLE_DTYPES)[number];

export const FIGURE_SERIES_KINDS = ["line", "bar", "scatter"] as const;
export type FigureSeriesKind = (typeof FIGURE_SERIES_KINDS)[number];

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
  | "ndarray"
  | "dataframe"
  | "series"
  | "figure";

const WRAPPER_KEYS = ["$tuple", "$set", "$float", "$ndarray", "$dataframe", "$series", "$figure"] as const;

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
    case "$dataframe":
      return "dataframe";
    case "$series":
      return "series";
    case "$figure":
      return "figure";
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
        if (
          kind === "list" ||
          kind === "dict" ||
          kind === "set" ||
          kind === "ndarray" ||
          kind === "dataframe" ||
          kind === "series" ||
          kind === "figure"
        ) {
          return "phần tử của set phải là giá trị hashable (số, chuỗi, bool, None hoặc tuple)";
        }
      }
      const issue = checkValue(item, depth + 1, budget);
      if (issue !== null) return issue;
    }
    return null;
  }

  if (wrapper === "$dataframe" || wrapper === "$series" || wrapper === "$figure") {
    if (keys.length !== 1) return `"${wrapper}" không nhận thêm khóa khác`;
    const payload = value[wrapper];
    if (!isObject(payload)) return `"${wrapper}" cần một đối tượng`;
    const issue =
      wrapper === "$dataframe"
        ? dataFramePayloadIssue(payload)
        : wrapper === "$series"
          ? seriesPayloadIssue(payload)
          : figurePayloadIssue(payload);
    if (issue !== null) return issue;
    budget.nodes += payloadNodeCount(payload);
    return budget.nodes > FUNCTION_CASE_LIMITS.maxNodesPerValue ? "giá trị quá lớn" : null;
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


// ----------------------------------------------------------------------------- M10 payloads

type Cell = null | boolean | number | string;

export interface DataFramePayload {
  readonly columns: readonly string[];
  readonly data: readonly (readonly Cell[])[];
  readonly index?: readonly (string | number | null)[];
  readonly indexName?: string | null;
  readonly dtypes?: Readonly<Record<string, string>>;
}

export interface SeriesPayload {
  readonly data: readonly Cell[];
  readonly index?: readonly (string | number | null)[];
  readonly name?: string | null;
  readonly dtype?: string;
}

export interface FigureSeriesPayload {
  readonly kind: FigureSeriesKind;
  readonly x: readonly (string | number)[];
  readonly y: readonly number[];
  readonly label?: string | null;
}

export interface FigurePayload {
  readonly title?: string | true;
  readonly xlabel?: string | true;
  readonly ylabel?: string | true;
  readonly legend?: readonly string[] | true;
  readonly series?: readonly FigureSeriesPayload[];
}

const isCell = (value: unknown): value is Cell =>
  value === null ||
  typeof value === "boolean" ||
  typeof value === "string" ||
  (typeof value === "number" && Number.isFinite(value));

const isIndexLabel = (value: unknown): value is string | number | null =>
  value === null || typeof value === "string" || (typeof value === "number" && Number.isFinite(value));

function onlyKeys(payload: Record<string, JsonValue>, allowed: readonly string[]): string | null {
  const extra = Object.keys(payload).find((key) => !allowed.includes(key));
  return extra === undefined ? null : `khóa "${extra}" không được hỗ trợ ở đây`;
}

function dataFramePayloadIssue(payload: Record<string, JsonValue>): string | null {
  const keyIssue = onlyKeys(payload, ["columns", "data", "index", "indexName", "dtypes"]);
  if (keyIssue !== null) return keyIssue;
  const { columns, data, index, indexName, dtypes } = payload;
  if (
    !Array.isArray(columns) ||
    columns.length === 0 ||
    columns.length > FUNCTION_CASE_LIMITS.maxTableColumns ||
    !columns.every((name) => typeof name === "string" && name.trim().length > 0)
  ) {
    return '"columns" cần là danh sách tên cột (chuỗi, không rỗng, tối đa ' + FUNCTION_CASE_LIMITS.maxTableColumns + ")";
  }
  if (new Set(columns as string[]).size !== columns.length) return '"columns" có tên cột trùng nhau';
  if (!Array.isArray(data) || data.length > FUNCTION_CASE_LIMITS.maxTableRows) {
    return '"data" cần là danh sách hàng (tối đa ' + FUNCTION_CASE_LIMITS.maxTableRows + " hàng)";
  }
  for (const row of data) {
    if (!Array.isArray(row) || row.length !== columns.length || !row.every(isCell)) {
      return "mỗi hàng của \"data\" cần đúng một ô cho mỗi cột (null, bool, số hữu hạn hoặc chuỗi)";
    }
  }
  if (index !== undefined && (!Array.isArray(index) || index.length !== data.length || !index.every(isIndexLabel))) {
    return '"index" cần có đúng một nhãn (số hoặc chuỗi) cho mỗi hàng';
  }
  if (indexName !== undefined && indexName !== null && typeof indexName !== "string") {
    return '"indexName" cần là chuỗi hoặc null';
  }
  if (dtypes !== undefined) {
    if (!isObject(dtypes)) return '"dtypes" cần là một đối tượng cột → dtype';
    for (const [column, dtype] of Object.entries(dtypes)) {
      if (!(columns as string[]).includes(column)) return `"dtypes" nhắc tới cột "${column}" không có trong "columns"`;
      if (!(TABLE_DTYPES as readonly string[]).includes(String(dtype))) return `dtype "${String(dtype)}" không được hỗ trợ`;
    }
  }
  return null;
}

function seriesPayloadIssue(payload: Record<string, JsonValue>): string | null {
  const keyIssue = onlyKeys(payload, ["data", "index", "name", "dtype"]);
  if (keyIssue !== null) return keyIssue;
  const { data, index, name, dtype } = payload;
  if (!Array.isArray(data) || data.length > FUNCTION_CASE_LIMITS.maxTableRows || !data.every(isCell)) {
    return '"data" cần là danh sách ô (null, bool, số hữu hạn hoặc chuỗi), tối đa ' + FUNCTION_CASE_LIMITS.maxTableRows;
  }
  if (index !== undefined && (!Array.isArray(index) || index.length !== data.length || !index.every(isIndexLabel))) {
    return '"index" cần có đúng một nhãn cho mỗi phần tử';
  }
  if (name !== undefined && name !== null && typeof name !== "string") return '"name" cần là chuỗi hoặc null';
  if (dtype !== undefined && !(TABLE_DTYPES as readonly string[]).includes(String(dtype))) {
    return `dtype "${String(dtype)}" không được hỗ trợ`;
  }
  return null;
}

function figurePayloadIssue(payload: Record<string, JsonValue>): string | null {
  const keyIssue = onlyKeys(payload, ["title", "xlabel", "ylabel", "legend", "series"]);
  if (keyIssue !== null) return keyIssue;
  for (const field of ["title", "xlabel", "ylabel"] as const) {
    const text = payload[field];
    if (text !== undefined && typeof text !== "string" && text !== true) {
      return `"${field}" cần là chuỗi (hoặc true: bất kỳ chuỗi không rỗng)`;
    }
  }
  const { legend, series } = payload;
  if (legend !== undefined && legend !== true && !(Array.isArray(legend) && legend.every((label) => typeof label === "string"))) {
    return '"legend" cần là danh sách nhãn (hoặc true)';
  }
  if (series !== undefined) {
    if (!Array.isArray(series) || series.length > FUNCTION_CASE_LIMITS.maxFigureSeries) {
      return '"series" cần là danh sách tối đa ' + FUNCTION_CASE_LIMITS.maxFigureSeries + " phần tử";
    }
    for (const entry of series) {
      if (!isObject(entry)) return "mỗi series cần là một đối tượng";
      const seriesKeys = onlyKeys(entry, ["kind", "x", "y", "label"]);
      if (seriesKeys !== null) return seriesKeys;
      if (!(FIGURE_SERIES_KINDS as readonly string[]).includes(String(entry.kind))) return "loại series phải là line, bar hoặc scatter";
      const { x, y, label } = entry;
      if (
        !Array.isArray(x) ||
        !Array.isArray(y) ||
        x.length !== y.length ||
        x.length > FUNCTION_CASE_LIMITS.maxFigurePoints ||
        !x.every((item) => typeof item === "string" || (typeof item === "number" && Number.isFinite(item))) ||
        !y.every((item) => typeof item === "number" && Number.isFinite(item))
      ) {
        return "x và y của series cần cùng độ dài (tối đa " + FUNCTION_CASE_LIMITS.maxFigurePoints + " điểm), y là số hữu hạn";
      }
      if (label !== undefined && label !== null && typeof label !== "string") return '"label" của series cần là chuỗi hoặc null';
    }
  }
  return null;
}

function payloadNodeCount(payload: Record<string, JsonValue>): number {
  let nodes = 0;
  const walk = (value: JsonValue): void => {
    nodes += 1;
    if (Array.isArray(value)) value.forEach(walk);
    else if (value !== null && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(payload);
  return nodes;
}

export const PyValueSchema = JsonValueSchema.superRefine((value, context) => {
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
      value: PyValueSchema,
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
    args: z.array(PyValueSchema).max(FUNCTION_CASE_LIMITS.maxArguments),
    kwargs: z
      .record(identifierSchema, PyValueSchema)
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

export type PyMismatch = "TYPE" | "DTYPE" | "SHAPE" | "VALUE" | "COLUMNS" | "INDEX" | "FIGURE";

/** A difference and, when useful, a short Vietnamese explanation that never contains expected row values. */
export interface PyDifference {
  readonly mismatch: PyMismatch;
  readonly detail?: string;
}

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
    case "dataframe":
      return diffDataFrame(actual, expected, tolerance) === null;
    case "series":
      return diffSeries(actual, expected, tolerance) === null;
    case "figure":
      return diffFigure(actual, expected, tolerance) === null;
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
 * (or ndarray dtype), a different shape, different columns / index / dtype / figure
 * properties (M10), or a different value - plus, for the pandas / figure kinds, a short
 * explanation that mentions only what the learner's own result looks like and the
 * schema the task prescribes, never the expected row values.
 */
export function diffPyValues(actual: PyValue, expected: PyValue, tolerance = 0): PyDifference | null {
  const actualKind = pyKindOf(actual);
  const expectedKind = pyKindOf(expected);
  if (actualKind !== expectedKind) return { mismatch: "TYPE" };

  if (expectedKind === "ndarray") {
    const expectedDtype = (expected as Record<string, JsonValue>).dtype;
    const actualDtype = (actual as Record<string, JsonValue>).dtype;
    if (expectedDtype !== undefined && actualDtype !== expectedDtype) {
      return { mismatch: "DTYPE", detail: `dtype của mảng là ${String(actualDtype)}, đề yêu cầu ${String(expectedDtype)}.` };
    }
    const actualShape = ndarrayShapeOf(actual);
    const expectedShape = ndarrayShapeOf(expected);
    if (actualShape.length !== expectedShape.length || actualShape.some((dimension, i) => dimension !== expectedShape[i])) {
      return { mismatch: "SHAPE", detail: `shape của mảng là (${actualShape.join(", ")}), đề yêu cầu (${expectedShape.join(", ")}).` };
    }
  }
  if (expectedKind === "dataframe") return diffDataFrame(actual, expected, tolerance);
  if (expectedKind === "series") return diffSeries(actual, expected, tolerance);
  if (expectedKind === "figure") return diffFigure(actual, expected, tolerance);

  return deepEqual(actual, expected, tolerance) ? null : { mismatch: "VALUE" };
}

export function comparePyValues(actual: PyValue, expected: PyValue, tolerance = 0): PyMismatch | null {
  return diffPyValues(actual, expected, tolerance)?.mismatch ?? null;
}

// ----- M10: pandas and figure comparison

const frameOf = (value: PyValue): DataFramePayload => wrapperPayload(value, "$dataframe") as unknown as DataFramePayload;
const seriesOf = (value: PyValue): SeriesPayload => wrapperPayload(value, "$series") as unknown as SeriesPayload;
const figureOf = (value: PyValue): FigurePayload => wrapperPayload(value, "$figure") as unknown as FigurePayload;

function cellsEqual(actual: Cell, expected: Cell, tolerance: number): boolean {
  if (actual === null || expected === null) return actual === expected;
  if (typeof actual === "number" && typeof expected === "number") return numbersEqual(actual, expected, tolerance);
  return typeof actual === typeof expected && actual === expected;
}

const sameList = (left: readonly unknown[], right: readonly unknown[]): boolean =>
  left.length === right.length && left.every((item, index) => item === right[index]);

const listText = (values: readonly unknown[], limit = 8): string => {
  const shown = values.slice(0, limit).map((item) => (typeof item === "string" ? `'${item}'` : String(item)));
  return `[${shown.join(", ")}${values.length > limit ? ", …" : ""}]`;
};

function diffDataFrame(actual: PyValue, expected: PyValue, tolerance: number): PyDifference | null {
  const a = frameOf(actual);
  const e = frameOf(expected);

  if (!sameList(a.columns, e.columns)) {
    return {
      mismatch: "COLUMNS",
      detail: `Các cột của DataFrame là ${listText(a.columns)}; đề yêu cầu đúng tên và thứ tự ${listText(e.columns)}.`,
    };
  }
  if (a.data.length !== e.data.length) {
    return {
      mismatch: "SHAPE",
      detail: `DataFrame của bạn có ${a.data.length} hàng × ${a.columns.length} cột — số hàng chưa đúng yêu cầu.`,
    };
  }
  if (e.index !== undefined && a.index !== undefined && !sameList(a.index, e.index)) {
    return {
      mismatch: "INDEX",
      detail: `Chỉ số hàng (index) hiện là ${listText(a.index)} — chưa đúng nhãn hoặc thứ tự mà đề yêu cầu.`,
    };
  }
  if (e.indexName !== undefined && (a.indexName ?? null) !== e.indexName) {
    return {
      mismatch: "INDEX",
      detail: `Tên của index là ${a.indexName === null || a.indexName === undefined ? "None" : `'${a.indexName}'`}; đề yêu cầu ${e.indexName === null ? "None" : `'${e.indexName}'`}.`,
    };
  }
  if (e.dtypes !== undefined) {
    for (const column of e.columns) {
      const wanted = e.dtypes[column];
      const got = a.dtypes?.[column];
      if (wanted !== undefined && got !== wanted) {
        return { mismatch: "DTYPE", detail: `Cột '${column}' có dtype ${got ?? "không rõ"}; đề yêu cầu ${wanted}.` };
      }
    }
  }
  for (let row = 0; row < e.data.length; row += 1) {
    for (let col = 0; col < e.columns.length; col += 1) {
      if (!cellsEqual(a.data[row]![col]!, e.data[row]![col]!, tolerance)) {
        const label = a.index !== undefined ? `, index ${String(a.index[row])}` : "";
        return {
          mismatch: "VALUE",
          detail: `Giá trị ở cột '${e.columns[col]}', hàng thứ ${row + 1}${label} chưa đúng (bạn có ${cellText(a.data[row]![col]!)}).`,
        };
      }
    }
  }
  return null;
}

const cellText = (cell: Cell): string => (cell === null ? "ô trống / NaN" : typeof cell === "string" ? `'${cell}'` : String(cell));

function diffSeries(actual: PyValue, expected: PyValue, tolerance: number): PyDifference | null {
  const a = seriesOf(actual);
  const e = seriesOf(expected);
  if (a.data.length !== e.data.length) {
    return { mismatch: "SHAPE", detail: `Series của bạn có ${a.data.length} phần tử — số phần tử chưa đúng yêu cầu.` };
  }
  if (e.name !== undefined && (a.name ?? null) !== e.name) {
    return {
      mismatch: "COLUMNS",
      detail: `Tên Series là ${a.name === null || a.name === undefined ? "None" : `'${a.name}'`}; đề yêu cầu ${e.name === null ? "None" : `'${e.name}'`}.`,
    };
  }
  if (e.index !== undefined && a.index !== undefined && !sameList(a.index, e.index)) {
    return { mismatch: "INDEX", detail: `Chỉ số (index) hiện là ${listText(a.index)} — chưa đúng nhãn hoặc thứ tự mà đề yêu cầu.` };
  }
  if (e.dtype !== undefined && a.dtype !== e.dtype) {
    return { mismatch: "DTYPE", detail: `Series có dtype ${a.dtype ?? "không rõ"}; đề yêu cầu ${e.dtype}.` };
  }
  for (let position = 0; position < e.data.length; position += 1) {
    if (!cellsEqual(a.data[position]!, e.data[position]!, tolerance)) {
      const label = a.index !== undefined ? ` (index ${String(a.index[position])})` : "";
      return { mismatch: "VALUE", detail: `Phần tử thứ ${position + 1}${label} chưa đúng (bạn có ${cellText(a.data[position]!)}).` };
    }
  }
  return null;
}

function diffFigure(actual: PyValue, expected: PyValue, tolerance: number): PyDifference | null {
  const a = figureOf(actual);
  const e = figureOf(expected);
  const fieldNames = { title: "Tiêu đề", xlabel: "Nhãn trục x", ylabel: "Nhãn trục y" } as const;

  for (const field of ["title", "xlabel", "ylabel"] as const) {
    const wanted = e[field];
    if (wanted === undefined) continue;
    const got = typeof a[field] === "string" ? (a[field] as string).trim() : "";
    const ok = wanted === true ? got !== "" : got === wanted.trim();
    if (!ok) {
      return {
        mismatch: "FIGURE",
        detail:
          got === ""
            ? `${fieldNames[field]} của biểu đồ đang để trống.`
            : `${fieldNames[field]} hiện là '${got}' — chưa đúng như đề yêu cầu.`,
      };
    }
  }

  if (e.series !== undefined) {
    const actualSeries = a.series ?? [];
    if (actualSeries.length !== e.series.length) {
      return {
        mismatch: "FIGURE",
        detail: `Biểu đồ có ${actualSeries.length} nhóm dữ liệu (series); đề yêu cầu ${e.series.length}.`,
      };
    }
    for (let index = 0; index < e.series.length; index += 1) {
      const want = e.series[index]!;
      const got = actualSeries[index]!;
      const name = `series ${index + 1}`;
      if (got.kind !== want.kind) {
        return { mismatch: "FIGURE", detail: `${name} đang vẽ kiểu ${got.kind}; đề yêu cầu kiểu ${want.kind}.` };
      }
      if (want.label !== undefined && (got.label ?? null) !== want.label) {
        return {
          mismatch: "FIGURE",
          detail: `Nhãn của ${name} là ${got.label === null || got.label === undefined ? "None" : `'${got.label}'`} — chưa đúng như đề yêu cầu.`,
        };
      }
      if (got.x.length !== want.x.length || got.y.length !== want.y.length) {
        return { mismatch: "FIGURE", detail: `${name} có ${got.x.length} điểm dữ liệu; đề yêu cầu ${want.x.length}.` };
      }
      if (!got.x.every((value, position) => axisValueEqual(value, want.x[position]!, tolerance))) {
        return { mismatch: "FIGURE", detail: `Dữ liệu trục x của ${name} chưa khớp yêu cầu (kiểm tra thứ tự và nhóm).` };
      }
      if (!got.y.every((value, position) => numbersEqual(value, want.y[position]!, tolerance))) {
        return { mismatch: "FIGURE", detail: `Dữ liệu trục y của ${name} chưa khớp yêu cầu (kiểm tra cách tổng hợp và thứ tự).` };
      }
    }
  }

  if (e.legend !== undefined) {
    const labels: readonly string[] = Array.isArray(a.legend) ? a.legend : [];
    if (e.legend === true) {
      if (labels.length === 0) return { mismatch: "FIGURE", detail: "Biểu đồ chưa có chú giải (legend)." };
    } else if (!sameList(labels, e.legend)) {
      return {
        mismatch: "FIGURE",
        detail: labels.length === 0 ? "Biểu đồ chưa có chú giải (legend)." : `Chú giải hiện là ${listText(labels)} — chưa đúng như đề yêu cầu.`,
      };
    }
  }
  return null;
}

function axisValueEqual(actual: string | number, expected: string | number, tolerance: number): boolean {
  if (typeof actual === "number" && typeof expected === "number") return numbersEqual(actual, expected, tolerance);
  return typeof actual === typeof expected && actual === expected;
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
    case "dataframe": {
      const frame = frameOf(value);
      const rows = frame.data.map((row) => `[${row.map((cell) => renderValue(cell)).join(", ")}]`).join(", ");
      const index = frame.index !== undefined ? `, index=${renderValue(frame.index as unknown as PyValue)}` : "";
      const dtypes = frame.dtypes !== undefined ? `, dtypes=${renderValue(frame.dtypes as unknown as PyValue)}` : "";
      return `DataFrame(columns=${renderValue(frame.columns as unknown as PyValue)}, rows=[${rows}]${index}${dtypes})`;
    }
    case "series": {
      const series = seriesOf(value);
      const index = series.index !== undefined ? `, index=${renderValue(series.index as unknown as PyValue)}` : "";
      const name = series.name !== undefined ? `, name=${series.name === null ? "None" : renderValue(series.name)}` : "";
      const dtype = series.dtype !== undefined ? `, dtype=${series.dtype}` : "";
      return `Series(${renderValue(series.data as unknown as PyValue)}${index}${name}${dtype})`;
    }
    case "figure": {
      const figure = figureOf(value);
      const text = (field: "title" | "xlabel" | "ylabel") =>
        figure[field] === undefined ? [] : [`${field}=${figure[field] === true ? "…" : renderValue(figure[field] as string)}`];
      const parts = [
        ...text("title"),
        ...text("xlabel"),
        ...text("ylabel"),
        ...(figure.legend === undefined ? [] : [`legend=${figure.legend === true ? "…" : renderValue(figure.legend as unknown as PyValue)}`]),
        ...(figure.series === undefined
          ? []
          : [
              `series=[${figure.series
                .map(
                  (entry) =>
                    `${entry.kind}(x=${renderValue(entry.x as unknown as PyValue)}, y=${renderValue(entry.y as unknown as PyValue)}${entry.label ? `, label=${renderValue(entry.label)}` : ""})`,
                )
                .join(", ")}]`,
            ]),
      ];
      return `Axes(${parts.join(", ")})`;
    }
  }
}
