import { describe, expect, it } from "vitest";

import { CS116_PRODUCTION_IDS } from "../../../src/content/cs116";
import {
  getMissionLessonGuide,
  getMissionQuickCheck,
} from "../../../src/features/mission-workspace/mission-lesson-guides";

const ACTIVITY_IDS = [
  CS116_PRODUCTION_IDS.activityVs01,
  CS116_PRODUCTION_IDS.activityVs02,
  CS116_PRODUCTION_IDS.activityVs03,
  CS116_PRODUCTION_IDS.activityVs04,
  CS116_PRODUCTION_IDS.activityVs05,
  CS116_PRODUCTION_IDS.activityVs06,
  CS116_PRODUCTION_IDS.activityVs07,
] as const;

describe("mission lesson guides", () => {
  it("covers every production NumPy activity with lesson content and a formative self-check", () => {
    for (const activityId of ACTIVITY_IDS) {
      expect(getMissionLessonGuide(activityId)).not.toBeNull();
      const check = getMissionQuickCheck(activityId);
      expect(check).not.toBeNull();
      expect(check!.options.length).toBeGreaterThanOrEqual(2);
      expect(check!.correctOptionIndex).toBeGreaterThanOrEqual(0);
      expect(check!.correctOptionIndex).toBeLessThan(check!.options.length);
    }
  });

  it("keeps unknown activities free of invented lesson content", () => {
    expect(getMissionLessonGuide("unknown.activity")).toBeNull();
    expect(getMissionQuickCheck("unknown.activity")).toBeNull();
  });
});
