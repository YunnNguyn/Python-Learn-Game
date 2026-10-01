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
