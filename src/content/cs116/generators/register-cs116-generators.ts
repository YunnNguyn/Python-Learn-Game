import { GeneratorRegistry } from "../../../core/generators";

import { columnExtractGenerator } from "./column-extract-generator";
import { csvInspectionGenerator } from "./csv-inspection-generator";
import { CS116_GENERATOR_ID } from "./generator-ids";
import { hostileContactGenerator } from "./hostile-contact-generator";
import { matrixShapeGenerator } from "./matrix-shape-generator";
import { pandasPracticeGenerator } from "./pandas-practice-generator";
import { dataSciencePracticeGenerator } from "./data-science-practice-generator";
import { thresholdFilterGenerator } from "./threshold-filter-generator";

export function registerCs116Generators(registry: GeneratorRegistry): void {
  registry.registerGenerator(
    CS116_GENERATOR_ID.MATRIX_SHAPE,
    matrixShapeGenerator,
  );
  registry.registerGenerator(
    CS116_GENERATOR_ID.COLUMN_EXTRACT,
    columnExtractGenerator,
  );
  registry.registerGenerator(
    CS116_GENERATOR_ID.THRESHOLD_FILTER,
    thresholdFilterGenerator,
  );
  registry.registerGenerator(
    CS116_GENERATOR_ID.HOSTILE_CONTACT,
    hostileContactGenerator,
  );
  registry.registerGenerator(
    CS116_GENERATOR_ID.CSV_INSPECTION,
    csvInspectionGenerator,
  );
  registry.registerGenerator(
    CS116_GENERATOR_ID.PANDAS_PRACTICE,
    pandasPracticeGenerator,
  );
  registry.registerGenerator(
    CS116_GENERATOR_ID.DATA_SCIENCE_PRACTICE,
    dataSciencePracticeGenerator,
  );
}
