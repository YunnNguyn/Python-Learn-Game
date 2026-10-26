/**
 * Hard limits of the Exercise Pack importer (PHASE-05-M7).
 *
 * Every limit is enforced BEFORE the expensive work it protects: the byte size
 * before parsing, the nesting depth before JSON.parse allocates the structure, the
 * node count right after parsing, and the per-field limits by the strict schema.
 * Starting values from the approved audit (S6); adjust them here, in one place.
 */
export const EXERCISE_PACK_LIMITS = Object.freeze({
  /** UTF-8 size of the pack document. */
  maxPackBytes: 512 * 1024,
  /** Maximum JSON nesting depth (the document root is depth 1). */
  maxDepth: 20,
  /** Maximum number of JSON values (objects, arrays and scalars) in the document. */
  maxNodes: 50_000,
  maxExercises: 50,
  maxIdLength: 64,
  maxTitleLength: 120,
  maxShortTextLength: 300,
  maxDescriptionLength: 2_000,
  /** instructions, explanation, feedback texts, hint texts and dataset descriptions. */
  maxTextLength: 64 * 1024,
  maxHintLength: 2_000,
  maxStarterCodeLength: 32 * 1024,
  maxReferenceSolutionLength: 32 * 1024,
  maxTags: 10,
  maxTagLength: 40,
  maxLearningObjectives: 10,
  maxPrerequisites: 10,
  maxDatasetsPerExercise: 8,
  maxDatasetBytesPerExercise: 256 * 1024,
  maxDatasetFilenameLength: 64,
  maxChecksPerExercise: 20,
  maxHintsPerExercise: 4,
  maxSetupVariables: 20,
  maxIdentifierLength: 64,
  maxPackagesPerExercise: 7,
  /** Issues reported per validation; the rest is summarised as one "N more" entry. */
  maxReportedIssues: 50,
});

export const EXERCISE_PACK_FORMAT = "python-learn-game.exercise-pack" as const;
export const SUPPORTED_EXERCISE_PACK_SCHEMA_VERSIONS = Object.freeze([1] as const);
export const SUPPORTED_EXERCISE_KINDS = Object.freeze(["code", "debug"] as const);
