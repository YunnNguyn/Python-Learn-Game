import type { JsonValue, MissionGeneratorId } from "../../core/domain";
import type { FunctionCase, PyValue, TableDtype } from "../../core/grading";
import type { SeededRng } from "../../core/random";

/**
 * Shared building blocks of the M10 generators (PHASE-08), PF-16..PF-26.
 *
 * Same contract as the M9 generators: pure functions of the seeded RNG; expected values
 * are computed here in TypeScript (the Python reference solutions live in tests/ and are
 * checked against these values on a real Pyodide). The only new things are the typed
 * wrappers for pandas and Matplotlib values ($dataframe, $series, $figure).
 */

export const generatorId = (value: string): MissionGeneratorId => value as MissionGeneratorId;

export const TOLERANCE = 1e-9;

// ---------------------------------------------------------------- typed values

export const tup = (...items: PyValue[]): PyValue => ({ $tuple: items });

export type NdDtype = "float64" | "int64" | "float32" | "uint8" | "bool";

export const nd = (data: PyValue, dtype: NdDtype, shape?: readonly number[]): PyValue => ({
  $ndarray: data,
  dtype,
  ...(shape !== undefined ? { shape: [...shape] } : {}),
});

export interface FrameOptions {
  readonly index?: readonly (string | number)[];
  readonly indexName?: string | null;
  readonly dtypes?: Readonly<Record<string, TableDtype>>;
}

/** A `$dataframe` value. Omitted options mean "not checked" in an expected value. */
export function frame(columns: readonly string[], rows: readonly PyValue[][], options: FrameOptions = {}): PyValue {
  return {
    $dataframe: {
      columns: [...columns],
      data: rows.map((row) => [...row]),
      ...(options.index !== undefined ? { index: [...options.index] } : {}),
      ...(options.indexName !== undefined ? { indexName: options.indexName } : {}),
      ...(options.dtypes !== undefined ? { dtypes: { ...options.dtypes } } : {}),
    },
  };
}

/** Builds the argument-side `$dataframe` of a dict-of-columns (every column given). */
export function frameFromColumns(
  columns: Readonly<Record<string, readonly PyValue[]>>,
  options: FrameOptions = {},
): PyValue {
  const names = Object.keys(columns);
  const length = columns[names[0]!]!.length;
  const rows = Array.from({ length }, (_, index) => names.map((name) => columns[name]![index]!));
  return frame(names, rows, options);
}

export interface SeriesOptions {
  readonly index?: readonly (string | number)[];
  readonly name?: string | null;
  readonly dtype?: TableDtype;
}

export function seriesOf(data: readonly PyValue[], options: SeriesOptions = {}): PyValue {
  return {
    $series: {
      data: [...data],
      ...(options.index !== undefined ? { index: [...options.index] } : {}),
      ...(options.name !== undefined ? { name: options.name } : {}),
      ...(options.dtype !== undefined ? { dtype: options.dtype } : {}),
    },
  };
}

export interface FigureSeries {
  readonly kind: "line" | "bar" | "scatter";
  readonly x: readonly (string | number)[];
  readonly y: readonly number[];
  readonly label?: string;
}

export interface FigureSpec {
  readonly title?: string | true;
  readonly xlabel?: string | true;
  readonly ylabel?: string | true;
  readonly legend?: readonly string[] | true;
  readonly series?: readonly FigureSeries[];
}

export const figure = (spec: FigureSpec): PyValue => ({
  $figure: {
    ...(spec.title !== undefined ? { title: spec.title } : {}),
    ...(spec.xlabel !== undefined ? { xlabel: spec.xlabel } : {}),
    ...(spec.ylabel !== undefined ? { ylabel: spec.ylabel } : {}),
    ...(spec.legend !== undefined ? { legend: spec.legend === true ? true : [...spec.legend] } : {}),
    ...(spec.series !== undefined
      ? {
          series: spec.series.map((entry) => ({
            kind: entry.kind,
            x: [...entry.x],
            y: [...entry.y],
            ...(entry.label !== undefined ? { label: entry.label } : {}),
          })),
        }
      : {}),
  },
});

// ---------------------------------------------------------------- cases

export const hiddenCase = (
  id: string,
  label: string,
  args: readonly PyValue[],
  expect: FunctionCase["expect"],
  argsUnchanged = true,
): FunctionCase => ({ id, label, visibility: "hidden", args, expect, argsUnchanged });

export const exampleCase = (
  id: string,
  label: string,
  args: readonly PyValue[],
  expect: FunctionCase["expect"],
): FunctionCase => ({ id, label, visibility: "example", args, expect, argsUnchanged: true });

export const returns = (value: PyValue, returnType: string, tolerance?: number): FunctionCase["expect"] => ({
  kind: "RETURNS",
  value,
  returnType,
  ...(tolerance !== undefined ? { tolerance } : {}),
});

export const raises = (exception: string): FunctionCase["expect"] => ({ kind: "RAISES", exception });

/** Declarative cases are plain serializable data; `grading.data` just needs them typed as JSON. */
export const asJson = (cases: readonly FunctionCase[]): JsonValue[] => cases as unknown as JsonValue[];

// ---------------------------------------------------------------- numeric helpers

export function range(start: number, stop: number): number[] {
  const out: number[] = [];
  for (let value = start; value < stop; value += 1) out.push(value);
  return out;
}

export const randomInts = (rng: SeededRng, count: number, low: number, high: number): number[] =>
  Array.from({ length: count }, () => rng.nextInt(low, high));

/** `count` distinct integers from [low, high). */
export const distinctInts = (rng: SeededRng, low: number, high: number, count: number): number[] =>
  rng.shuffle(range(low, high)).slice(0, count);

export const sumOf = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

export const meanOf = (values: readonly number[]): number => sumOf(values) / values.length;

/** Population standard deviation (NumPy's default, ddof=0). */
export function populationStd(values: readonly number[]): number {
  const mean = meanOf(values);
  return Math.sqrt(meanOf(values.map((value) => (value - mean) ** 2)));
}

export function shapeSize(shape: readonly number[]): number {
  return shape.reduce((product, dimension) => product * dimension, 1);
}

/** Transposes a rectangular matrix given as rows. */
export const columnsOf = (rows: readonly (readonly number[])[]): number[][] =>
  rows.length === 0 ? [] : rows[0]!.map((_, column) => rows.map((row) => row[column]!));

/** Median of a non-empty list (mean of the two middle values for an even count). */
export function medianOf(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** Compares two strings the way Python's `sorted()` does for plain ASCII/Latin text. */
export const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
