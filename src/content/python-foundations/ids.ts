/**
 * Stable identifiers of the native "Python Foundations" content (PHASE-06 / M8).
 *
 * Every id lives in the `python-foundations` namespace (concepts in `python.*`), so it can
 * never equal a CS116 id (`cs116.*`, `python-ml.*`, `numpy.*`, `pandas.*`, ...) nor an
 * imported practice id (`practice...`). Ids are persisted in attempts and drafts: never
 * rename one, only add.
 */
export const PYTHON_FOUNDATIONS_IDS = {
  pack: "python-foundations",
  course: "python-foundations",
  world: "python-foundations.core",
  lessonValuesDecisions: "python-foundations.values-decisions",
  lessonCollectionsFunctions: "python-foundations.collections-functions",
  // M9 (PHASE-07): two further worlds in the SAME course. Additive: no id above changes.
  worldCollections: "python-foundations.collections",
  worldNumpy: "python-foundations.numpy-intro",
  lessonSequencesRecords: "python-foundations.sequences-records",
  lessonFunctionsProjects: "python-foundations.functions-projects",
  lessonNumpyArrays: "python-foundations.numpy-arrays",
  activityPf01: "python-foundations.pf01",
  activityPf02: "python-foundations.pf02",
  activityPf03: "python-foundations.pf03",
  activityPf04: "python-foundations.pf04",
  activityPf05: "python-foundations.pf05",
  activityPf06: "python-foundations.pf06",
  activityPf07: "python-foundations.pf07",
  activityPf08: "python-foundations.pf08",
  activityPf09: "python-foundations.pf09",
  activityPf10: "python-foundations.pf10",
  activityPf11: "python-foundations.pf11",
  activityPf12: "python-foundations.pf12",
  activityPf13: "python-foundations.pf13",
  activityPf14: "python-foundations.pf14",
  activityPf15: "python-foundations.pf15",
  templatePf01: "python-foundations.pf01",
  templatePf02: "python-foundations.pf02",
  templatePf03: "python-foundations.pf03",
  templatePf04: "python-foundations.pf04",
  templatePf05: "python-foundations.pf05",
  templatePf06: "python-foundations.pf06",
  templatePf07: "python-foundations.pf07",
  templatePf08: "python-foundations.pf08",
  templatePf09: "python-foundations.pf09",
  templatePf10: "python-foundations.pf10",
  templatePf11: "python-foundations.pf11",
  templatePf12: "python-foundations.pf12",
  templatePf13: "python-foundations.pf13",
  templatePf14: "python-foundations.pf14",
  templatePf15: "python-foundations.pf15",
} as const;

/** The seven activity ids in course order. */
export const PYTHON_FOUNDATIONS_ACTIVITY_IDS = [
  PYTHON_FOUNDATIONS_IDS.activityPf01,
  PYTHON_FOUNDATIONS_IDS.activityPf02,
  PYTHON_FOUNDATIONS_IDS.activityPf03,
  PYTHON_FOUNDATIONS_IDS.activityPf04,
  PYTHON_FOUNDATIONS_IDS.activityPf05,
  PYTHON_FOUNDATIONS_IDS.activityPf06,
  PYTHON_FOUNDATIONS_IDS.activityPf07,
] as const;

/**
 * The eight M9 activity ids in course order (M9-01..M9-08 = PF-08..PF-15). They continue
 * the same course after PF-07; nothing about PF-01..PF-07 changes.
 */
export const PYTHON_FOUNDATIONS_M9_ACTIVITY_IDS = [
  PYTHON_FOUNDATIONS_IDS.activityPf08,
  PYTHON_FOUNDATIONS_IDS.activityPf09,
  PYTHON_FOUNDATIONS_IDS.activityPf10,
  PYTHON_FOUNDATIONS_IDS.activityPf11,
  PYTHON_FOUNDATIONS_IDS.activityPf12,
  PYTHON_FOUNDATIONS_IDS.activityPf13,
  PYTHON_FOUNDATIONS_IDS.activityPf14,
  PYTHON_FOUNDATIONS_IDS.activityPf15,
] as const;

/** Every activity of the course, PF-01..PF-15, in course order. */
export const PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS = [
  ...PYTHON_FOUNDATIONS_ACTIVITY_IDS,
  ...PYTHON_FOUNDATIONS_M9_ACTIVITY_IDS,
] as const;
