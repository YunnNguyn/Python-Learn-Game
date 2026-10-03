export { CS116_VERTICAL_SLICE_CONCEPTS } from "./vertical-slice-concepts";
export {
  CS116_VERTICAL_SLICE_ACTIVITY_SKELETONS,
  type VerticalSliceActivitySkeleton,
} from "./vertical-slice-activities";
export {
  columnExtractGenerator,
  CS116_GENERATOR_ID,
  matrixShapeGenerator,
  registerCs116Generators,
  thresholdFilterGenerator,
} from "./generators";
export {
  THRESHOLD_FILTER_VALIDATION_CODE,
  thresholdFilterInstanceValidator,
} from "./validators";
export {
  solveColumnExtractReference,
  solveMatrixShapeReference,
  solveThresholdFilterReference,
  type ColumnExtractReferenceResult,
  type MatrixShapeReferenceResult,
  type ThresholdFilterReferenceResult,
} from "./reference-solvers";

export {
  CS116_PRODUCTION_ACTIVITY_VS01,
  CS116_PRODUCTION_CONTENT,
  CS116_PRODUCTION_COURSE,
  CS116_PRODUCTION_IDS,
  CS116_PRODUCTION_LESSON,
  CS116_PRODUCTION_PACK,
  CS116_PRODUCTION_TEMPLATE_VS01,
  CS116_PRODUCTION_WORLD,
} from "./production-content";
export { registerCs116ProductionContent } from "./register-cs116-content";

export {
  CS116_HINT_SET_ID,
  CS116_PRODUCTION_HINT_SETS,
  CS116_VS01_HINT_SET,
  registerCs116Hints,
} from "./production-hints";
