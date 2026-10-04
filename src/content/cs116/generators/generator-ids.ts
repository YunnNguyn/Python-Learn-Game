import type { MissionGeneratorId } from "../../../core/domain";

const generatorId = (value: string): MissionGeneratorId =>
  value as MissionGeneratorId;

export const CS116_GENERATOR_ID = {
  MATRIX_SHAPE: generatorId("cs116.numpy.matrix-shape"),
  COLUMN_EXTRACT: generatorId("cs116.numpy.column-extract"),
  THRESHOLD_FILTER: generatorId("cs116.numpy.threshold-filter"),
  HOSTILE_CONTACT: generatorId("cs116.numpy.hostile-contact"),
} as const;
