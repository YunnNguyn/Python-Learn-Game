import { z } from "zod";

import type { MissionInstance } from "../../../core/domain";

export interface MatrixShapeReferenceResult {
  readonly matrix: readonly (readonly number[])[];
  readonly shape: readonly [number, number];
  readonly ndim: 2;
}

const learnerDataSchema = z.object({
  matrix: z.array(z.array(z.number().finite()).min(1)).min(1),
});

function parseRectangularMatrix(instance: MissionInstance): number[][] {
  const { matrix } = learnerDataSchema.parse(instance.learner.data);
  const columnCount = matrix[0]!.length;

  if (matrix.some((row) => row.length !== columnCount)) {
    throw new TypeError(
      "Matrix Shape reference solver requires a non-empty rectangular 2D numeric matrix.",
    );
  }

  return matrix.map((row) => [...row]);
}

export function solveMatrixShapeReference(
  instance: MissionInstance,
): MatrixShapeReferenceResult {
  const matrix = parseRectangularMatrix(instance);

  return {
    matrix,
    shape: [matrix.length, matrix[0]!.length],
    ndim: 2,
  };
}
