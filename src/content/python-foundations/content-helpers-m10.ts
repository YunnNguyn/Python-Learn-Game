import { DeclarativeGraderCheckType } from "../../core/grading";
import { CORE_RUNTIME_ID } from "../../core/runtime";

import { gradingDataRef } from "./content-helpers";

/**
 * Grader and runtime building blocks of the M10 missions (PHASE-08). Added next to the M8/M9
 * helpers so content-helpers.ts stays exactly as accepted.
 */

/**
 * A variable that must hold a typed value - an ndarray, a DataFrame, a Series, an Axes or a
 * dict containing them. Compared by the typed comparison of core/grading/function-cases.ts:
 * shape, columns, index, dtype and content are reported separately, and the expected value
 * is never shown to the learner (`reveal` is off).
 */
export const typedValue = (variable: string, ref: string, options: { tolerance?: number } = {}) => ({
  type: DeclarativeGraderCheckType.TYPED_VALUE,
  variable,
  expected: gradingDataRef(ref),
  tolerance: options.tolerance ?? 1e-9,
});

/** Real NumPy + pandas in Pyodide. */
export const pyodidePandas = {
  id: CORE_RUNTIME_ID.PYODIDE,
  config: { packages: ["numpy", "pandas"] },
} as const;

/** Real NumPy + pandas + Matplotlib in Pyodide (headless: the worker selects the Agg backend). */
export const pyodideMatplotlib = {
  id: CORE_RUNTIME_ID.PYODIDE,
  config: { packages: ["numpy", "pandas", "matplotlib"] },
} as const;

/** pandas missions that read CSV files: the files are staged into `data/` before every run. */
export const pyodidePandasWithData = (datasets: readonly { filename: string; content: string }[]) =>
  ({
    id: CORE_RUNTIME_ID.PYODIDE,
    config: { packages: ["numpy", "pandas"], workspace: { datasets: datasets.map((dataset) => ({ ...dataset })) } },
  }) as const;

export const pyodideMatplotlibWithData = (datasets: readonly { filename: string; content: string }[]) =>
  ({
    id: CORE_RUNTIME_ID.PYODIDE,
    config: {
      packages: ["numpy", "pandas", "matplotlib"],
      workspace: { datasets: datasets.map((dataset) => ({ ...dataset })) },
    },
  }) as const;
