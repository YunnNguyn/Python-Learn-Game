export const KnowledgeClassification = {
  MUST_RECALL: "MUST_RECALL",
  MUST_UNDERSTAND: "MUST_UNDERSTAND",
  LOOKUP_OK: "LOOKUP_OK",
} as const;

export type KnowledgeClassification =
  (typeof KnowledgeClassification)[keyof typeof KnowledgeClassification];

export const ConceptSource = {
  CS116: "CS116",
  SUPPLEMENTARY_ML_FOUNDATION: "SUPPLEMENTARY_ML_FOUNDATION",
  EXTRA: "EXTRA",
} as const;

export type ConceptSource =
  (typeof ConceptSource)[keyof typeof ConceptSource];

export const LearningStage = {
  DISCOVER: "DISCOVER",
  GUIDED: "GUIDED",
  INDEPENDENT: "INDEPENDENT",
  TRANSFER: "TRANSFER",
  REVIEW: "REVIEW",
  RETENTION: "RETENTION",
} as const;

export type LearningStage =
  (typeof LearningStage)[keyof typeof LearningStage];

export const LearningActivityType = {
  CODE_MISSION: "CODE_MISSION",
  DEBUG_MISSION: "DEBUG_MISSION",
  PREDICT_OUTPUT: "PREDICT_OUTPUT",
  EXPLAIN_SHAPE: "EXPLAIN_SHAPE",
  RECALL_CODE: "RECALL_CODE",
  BOSS_MISSION: "BOSS_MISSION",
} as const;

export type LearningActivityType =
  (typeof LearningActivityType)[keyof typeof LearningActivityType];

export const MasteryState = {
  UNSEEN: "UNSEEN",
  DISCOVERED: "DISCOVERED",
  PRACTICING: "PRACTICING",
  INDEPENDENT: "INDEPENDENT",
  TRANSFERRED: "TRANSFERRED",
  RETAINED: "RETAINED",
} as const;

export type MasteryState =
  (typeof MasteryState)[keyof typeof MasteryState];

export const ReviewReason = {
  WEAK: "WEAK",
  STALE: "STALE",
  DEPENDENCY: "DEPENDENCY",
  RECENT_FAILURE: "RECENT_FAILURE",
} as const;

export type ReviewReason =
  (typeof ReviewReason)[keyof typeof ReviewReason];

export const Difficulty = {
  EASY: "EASY",
  NORMAL: "NORMAL",
  HARD: "HARD",
} as const;

export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

export const HintLevel = {
  H1: "H1",
  H2: "H2",
  H3: "H3",
  H4: "H4",
} as const;

export type HintLevel = (typeof HintLevel)[keyof typeof HintLevel];
