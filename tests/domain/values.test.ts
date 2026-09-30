import { describe, expect, it } from "vitest";

import {
  ConceptSource,
  Difficulty,
  KnowledgeClassification,
  LearningActivityType,
  LearningStage,
  MasteryState,
  ReviewReason,
  type LearningStage as LearningStageValue,
} from "../../src/core/domain";

describe("canonical domain values", () => {
  it("exposes the derived union type through the domain boundary", () => {
    const stage: LearningStageValue = LearningStage.DISCOVER;

    expect(stage).toBe("DISCOVER");
  });

  it("locks knowledge classification serialized values", () => {
    expect(Object.values(KnowledgeClassification)).toEqual([
      "MUST_RECALL",
      "MUST_UNDERSTAND",
      "LOOKUP_OK",
    ]);
  });

  it("locks concept source serialized values", () => {
    expect(Object.values(ConceptSource)).toEqual([
      "CS116",
      "SUPPLEMENTARY_ML_FOUNDATION",
      "EXTRA",
    ]);
  });

  it("locks learning stage serialized values", () => {
    expect(Object.values(LearningStage)).toEqual([
      "DISCOVER",
      "GUIDED",
      "INDEPENDENT",
      "TRANSFER",
      "REVIEW",
      "RETENTION",
    ]);
  });

  it("locks learning activity type serialized values", () => {
    expect(Object.values(LearningActivityType)).toEqual([
      "CODE_MISSION",
      "DEBUG_MISSION",
      "PREDICT_OUTPUT",
      "EXPLAIN_SHAPE",
      "RECALL_CODE",
      "BOSS_MISSION",
    ]);
  });

  it("locks mastery state serialized values", () => {
    expect(Object.values(MasteryState)).toEqual([
      "UNSEEN",
      "DISCOVERED",
      "PRACTICING",
      "INDEPENDENT",
      "TRANSFERRED",
      "RETAINED",
    ]);
  });

  it("locks review reason serialized values", () => {
    expect(Object.values(ReviewReason)).toEqual([
      "WEAK",
      "STALE",
      "DEPENDENCY",
      "RECENT_FAILURE",
    ]);
  });

  it("locks difficulty serialized values", () => {
    expect(Object.values(Difficulty)).toEqual(["EASY", "NORMAL", "HARD"]);
  });
});
