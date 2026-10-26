import { describe, expect, it } from "vitest";

import { CS116_PRODUCTION_IDS } from "../../../src/content/cs116";
import { PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS, PYTHON_FOUNDATIONS_M10_ACTIVITY_IDS } from "../../../src/content/python-foundations";
import { M10_SOLUTIONS } from "../../python-foundations/m10-solutions";
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
  CS116_PRODUCTION_IDS.activityLc01,
  CS116_PRODUCTION_IDS.activityLc02,
  CS116_PRODUCTION_IDS.activityLc03,
  CS116_PRODUCTION_IDS.activityLc04,
  CS116_PRODUCTION_IDS.activityLc05,
  CS116_PRODUCTION_IDS.activityLc06,
  CS116_PRODUCTION_IDS.activityLc07,
  CS116_PRODUCTION_IDS.activityLc08,
  CS116_PRODUCTION_IDS.activityLc09,
  CS116_PRODUCTION_IDS.activityLc10,
  CS116_PRODUCTION_IDS.activityLc11,
  CS116_PRODUCTION_IDS.activityLc12,
  CS116_PRODUCTION_IDS.activityLc13,
  CS116_PRODUCTION_IDS.activityW301,
  CS116_PRODUCTION_IDS.activityW302,
  CS116_PRODUCTION_IDS.activityW303,
  CS116_PRODUCTION_IDS.activityW401,
  CS116_PRODUCTION_IDS.activityW402,
] as const;

describe("mission lesson guides", () => {
  it("covers every production learning activity with lesson content and a formative self-check", () => {
    for (const activityId of ACTIVITY_IDS) {
      expect(getMissionLessonGuide(activityId)).not.toBeNull();
      const check = getMissionQuickCheck(activityId);
      expect(check).not.toBeNull();
      expect(check!.options.length).toBeGreaterThanOrEqual(2);
      expect(check!.correctOptionIndex).toBeGreaterThanOrEqual(0);
      expect(check!.correctOptionIndex).toBeLessThan(check!.options.length);
    }
  });

  it("covers PF-01..PF-27 with a guide each, and PF-08..PF-27 (M9, M10, M11) with a quick check each", () => {
    for (const [index, activityId] of PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS.entries()) {
      const guide = getMissionLessonGuide(activityId);
      expect(guide, activityId).not.toBeNull();
      if (index >= 15 && index < 26) {
        expect(guide!.newTopics.length, activityId).toBeGreaterThanOrEqual(2);
        expect(guide!.workflow.length, activityId).toBeGreaterThanOrEqual(3);
      }
      if (index === 26) {
        // The capstone introduces nothing new: it revises what PF-16..PF-26 taught.
        expect(guide!.newTopics, activityId).toEqual([]);
        expect(guide!.reviewTopics?.length ?? 0, activityId).toBeGreaterThanOrEqual(3);
        expect(guide!.workflow.length, activityId).toBeGreaterThanOrEqual(3);
      }
      if (index < 7) continue; // the seven M8 missions keep the quick checks they already had
      const check = getMissionQuickCheck(activityId)!;
      expect(check, activityId).not.toBeNull();
      expect(check.options.length, activityId).toBeGreaterThanOrEqual(3);
      expect(new Set(check.options).size, activityId).toBe(check.options.length);
      expect(check.correctOptionIndex, activityId).toBeLessThan(check.options.length);
    }
  });

  it("a guide teaches a construct but never contains a full line of a mission's reference solution", () => {
    for (const activityId of PYTHON_FOUNDATIONS_M10_ACTIVITY_IDS) {
      const guide = JSON.stringify(getMissionLessonGuide(activityId));
      const reference = M10_SOLUTIONS[activityId]!.reference;
      for (const line of reference.split("\n").map((entry) => entry.trim()).filter((entry) => entry.length > 24 && !entry.startsWith("import") && !entry.startsWith("#"))) {
        expect(guide.includes(line.replaceAll('"', '\\"')), `${activityId}: ${line}`).toBe(false);
      }
    }
  });

  it("keeps unknown activities free of invented lesson content", () => {
    expect(getMissionLessonGuide("unknown.activity")).toBeNull();
    expect(getMissionQuickCheck("unknown.activity")).toBeNull();
  });
});
