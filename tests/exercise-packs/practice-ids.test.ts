import { describe, expect, it } from "vitest";

import {
  isPracticeSegment,
  parsePracticeActivityId,
  practiceActivityId,
  practiceConceptId,
  practiceHintSetId,
  practiceSeed,
  practiceTemplateId,
} from "../../src/core/exercise-packs";

describe("practice identifiers", () => {
  it("builds namespaced ids from the pack and exercise ids only", () => {
    expect(practiceActivityId("ml-basics.linreg-numpy", "mse-basic")).toBe("practice:ml-basics.linreg-numpy:mse-basic");
    expect(practiceTemplateId("p", "e")).toBe("practice.template:p:e");
    expect(practiceConceptId("p")).toBe("practice.concept:p");
    expect(practiceHintSetId("p", "e")).toBe("practice.hints:p:e");
    expect(practiceSeed("p", "e", 3)).toBe("practice:p:e:r3");
  });

  it("round-trips activity ids", () => {
    const id = practiceActivityId("a1.b-2", "x.y-z");
    expect(parsePracticeActivityId(id)).toEqual({ packId: "a1.b-2", exerciseId: "x.y-z" });
  });

  it("never parses ids outside the namespace or with the wrong shape", () => {
    for (const id of [
      "cs116.numpy.vs01",
      "practice:",
      "practice:only",
      "practice:a:b:c",
      "practice::b",
      "practice:A:b",
      "practice:a:B",
      "practice:a b:c",
      "Practice:a:b",
      "",
    ]) {
      expect(parsePracticeActivityId(id)).toBeNull();
    }
  });

  it("refuses to build ids from invalid segments", () => {
    expect(() => practiceActivityId("A", "b")).toThrow(RangeError);
    expect(() => practiceActivityId("a:b", "c")).toThrow(RangeError);
    expect(() => practiceTemplateId("a", "")).toThrow(RangeError);
    expect(() => practiceConceptId("a/b")).toThrow(RangeError);
    expect(() => practiceSeed("a", "b", 0)).toThrow(RangeError);
    expect(() => practiceSeed("a", "b", 1.5)).toThrow(RangeError);
  });

  it("distinguishes revisions in the seed", () => {
    expect(practiceSeed("p", "e", 1)).not.toBe(practiceSeed("p", "e", 2));
  });

  it("recognises valid segments", () => {
    expect(isPracticeSegment("ml-basics.linreg-numpy")).toBe(true);
    expect(isPracticeSegment("a")).toBe(true);
    expect(isPracticeSegment("a--b")).toBe(false);
    expect(isPracticeSegment("a.")).toBe(false);
    expect(isPracticeSegment("a".repeat(64))).toBe(true);
    expect(isPracticeSegment("a".repeat(65))).toBe(false);
  });
});
