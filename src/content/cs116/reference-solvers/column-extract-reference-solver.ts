import { z } from "zod";

import type { MissionInstance } from "../../../core/domain";

export interface ColumnExtractReferenceResult {
  readonly values: readonly number[];
  readonly shape: readonly [number];
}

const learnerDataSchema = z.object({
  matrix: z.array(z.array(z.number().finite()).min(1)).min(1),
  targetColumnIndex: z.number().finite().int().nonnegative(),
});

export function solveColumnExtractReference(
  instance: MissionInstance,
): ColumnExtractReferenceResult {
  const { matrix, targetColumnIndex } = learnerDataSchema.parse(
    instance.learner.data,
  );
  const columnCount = matrix[0]!.length;

  if (matrix.some((row) => row.length !== columnCount)) {
    throw new TypeError(
      "Column Extract reference solver requires a non-empty rectangular 2D numeric matrix.",
    );
  }

  if (targetColumnIndex >= columnCount) {
    throw new RangeError(
      "Column Extract targetColumnIndex must be within matrix column bounds.",
    );
  }

  return {
    values: matrix.map((row) => row[targetColumnIndex]!),
    shape: [matrix.length],
  };
}
