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
  activityPf01: "python-foundations.pf01",
  activityPf02: "python-foundations.pf02",
  activityPf03: "python-foundations.pf03",
  activityPf04: "python-foundations.pf04",
  activityPf05: "python-foundations.pf05",
  activityPf06: "python-foundations.pf06",
  activityPf07: "python-foundations.pf07",
  templatePf01: "python-foundations.pf01",
  templatePf02: "python-foundations.pf02",
  templatePf03: "python-foundations.pf03",
  templatePf04: "python-foundations.pf04",
  templatePf05: "python-foundations.pf05",
  templatePf06: "python-foundations.pf06",
  templatePf07: "python-foundations.pf07",
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
