import { CORE_GRADER_ID, DeclarativeGraderCheckType } from "../../core/grading";
import { CORE_RUNTIME_ID } from "../../core/runtime";

/**
 * Declarative-grader building blocks shared by the M8 content (content.ts) and the M9
 * content (content-m9.ts). Moved here unchanged from content.ts so both modules can use
 * them without importing each other.
 */

export const gradingDataRef = (path: string) => ({ $gradingData: path });
export const pyodideStdlib = { id: CORE_RUNTIME_ID.PYODIDE } as const;

export const exists = (variable: string) => ({
  type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
  variable,
});
export const typeIs = (variable: string, expected: string) => ({
  type: DeclarativeGraderCheckType.PYTHON_TYPE,
  variable,
  expected,
});
export const exactly = (variable: string, ref: string) => ({
  type: DeclarativeGraderCheckType.EXACT_VALUES,
  variable,
  expected: gradingDataRef(ref),
});
export const approx = (variable: string, ref: string) => ({
  type: DeclarativeGraderCheckType.APPROX_VALUES,
  variable,
  expected: gradingDataRef(ref),
  absoluteTolerance: 1e-9,
});

/** Existence, Python type, then value - so feedback can name which of the three is wrong. */
export const intVariable = (variable: string, ref: string) => [
  exists(variable),
  typeIs(variable, "int"),
  exactly(variable, ref),
];
export const floatVariable = (variable: string, ref: string) => [
  exists(variable),
  typeIs(variable, "float"),
  approx(variable, ref),
];
export const strVariable = (variable: string, ref: string) => [
  exists(variable),
  typeIs(variable, "str"),
  exactly(variable, ref),
];
export const boolVariable = (variable: string, ref: string) => [
  exists(variable),
  typeIs(variable, "bool"),
  exactly(variable, ref),
];
export const exactListVariable = (variable: string, ref: string) => [
  exists(variable),
  typeIs(variable, "list"),
  exactly(variable, ref),
];
export const approxListVariable = (variable: string, ref: string) => [
  exists(variable),
  typeIs(variable, "list"),
  approx(variable, ref),
];
export const functionVariable = (variable: string) => [exists(variable), typeIs(variable, "function")];

export const grader = (...groups: readonly (readonly object[])[]) => ({
  id: CORE_GRADER_ID.DECLARATIVE,
  config: {
    checks: [{ type: DeclarativeGraderCheckType.NO_EXCEPTION }, ...groups.flat()],
  },
});

export const dictVariable = (variable: string, ref: string) => [
  exists(variable),
  typeIs(variable, "dict"),
  exactly(variable, ref),
];
export const tupleVariable = (variable: string, ref: string) => [
  exists(variable),
  typeIs(variable, "tuple"),
  exactly(variable, ref),
];
export const exactLiteral = (variable: string, expected: string | number | boolean) => ({
  type: DeclarativeGraderCheckType.EXACT_VALUES,
  variable,
  expected,
});

/** Real NumPy in Pyodide: the same package declaration the CS116 NumPy missions use. */
export const pyodideNumpy = {
  id: CORE_RUNTIME_ID.PYODIDE,
  config: { packages: ["numpy"] },
} as const;

/** A behavioral check: call the learner's function on the cases stored in grading data. */
export const functionCases = (name: string, casesRef: string) => ({
  type: DeclarativeGraderCheckType.FUNCTION_CASES,
  function: name,
  cases: gradingDataRef(casesRef),
});

/** ndarray variable: it exists, is an ndarray, has the expected shape and values. */
export const ndarrayVariable = (variable: string, shapeRef: string | null, valuesRef: string) => [
  exists(variable),
  { type: DeclarativeGraderCheckType.NDARRAY_TYPE, variable },
  ...(shapeRef === null
    ? []
    : [{ type: DeclarativeGraderCheckType.SHAPE, variable, expected: gradingDataRef(shapeRef) }]),
  approx(variable, valuesRef),
];
