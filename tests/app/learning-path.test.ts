import { describe, expect, it } from "vitest";

import {
  getActivityAccess,
  getNextStudyActivity,
  getOrderedActivityIds,
  type ActivityProgressReader,
} from "../../src/app/learning-path";
import {
  CS116_PRODUCTION_IDS,
  registerCs116ProductionContent,
} from "../../src/content/cs116";
import { ContentRegistry } from "../../src/core/content";
import type { LearningActivityId } from "../../src/core/domain";
import type { ActivityProgress } from "../../src/core/learning";

function createContent(): ContentRegistry {
  const content = new ContentRegistry();
  registerCs116ProductionContent(content);
  return content;
}

function progressReader(
  overrides: Readonly<Record<string, Partial<ActivityProgress>>> = {},
): ActivityProgressReader {
  return {
    getActivityProgress(activityId) {
      const override = overrides[String(activityId)] ?? {};
      return {
        activityId,
        attemptCount: 0,
        successfulAttemptCount: 0,
        completed: false,
        ...override,
      };
    },
  };
}

describe("linear learning path", () => {
  it("keeps the seven production activities in curriculum order", () => {
    const content = createContent();

    expect(getOrderedActivityIds(content)).toEqual([
      CS116_PRODUCTION_IDS.activityVs01,
      CS116_PRODUCTION_IDS.activityVs02,
      CS116_PRODUCTION_IDS.activityVs03,
      CS116_PRODUCTION_IDS.activityVs04,
      CS116_PRODUCTION_IDS.activityVs05,
      CS116_PRODUCTION_IDS.activityVs06,
      CS116_PRODUCTION_IDS.activityVs07,
    ]);
  });

  it("unlocks only the first activity for a new learner", () => {
    const content = createContent();
    const progress = progressReader();

    expect(
      getActivityAccess(
        content,
        progress,
        CS116_PRODUCTION_IDS.activityVs01 as LearningActivityId,
      ).unlocked,
    ).toBe(true);
    expect(
      getActivityAccess(
        content,
        progress,
        CS116_PRODUCTION_IDS.activityVs02 as LearningActivityId,
      ).unlocked,
    ).toBe(false);
  });

  it("unlocks the next activity after its predecessor is completed", () => {
    const content = createContent();
    const progress = progressReader({
      [CS116_PRODUCTION_IDS.activityVs01]: {
        attemptCount: 1,
        successfulAttemptCount: 1,
        completed: true,
      },
    });

    expect(
      getActivityAccess(
        content,
        progress,
        CS116_PRODUCTION_IDS.activityVs02 as LearningActivityId,
      ).unlocked,
    ).toBe(true);
    expect(
      getActivityAccess(
        content,
        progress,
        CS116_PRODUCTION_IDS.activityVs03 as LearningActivityId,
      ).unlocked,
    ).toBe(false);
  });

  it("does not strand legacy progress if a later activity already has attempts", () => {
    const content = createContent();
    const progress = progressReader({
      [CS116_PRODUCTION_IDS.activityVs06]: {
        attemptCount: 2,
        successfulAttemptCount: 0,
        completed: false,
      },
    });

    const access = getActivityAccess(
      content,
      progress,
      CS116_PRODUCTION_IDS.activityVs06 as LearningActivityId,
    );

    expect(access.unlocked).toBe(true);
    expect(access.reason).toContain("đã bắt đầu");
  });

  it("recommends continuing an attempted activity before a new locked activity", () => {
    const content = createContent();
    const progress = progressReader({
      [CS116_PRODUCTION_IDS.activityVs01]: {
        attemptCount: 2,
        successfulAttemptCount: 0,
        completed: false,
      },
    });

    expect(getNextStudyActivity(content, progress)).toEqual({
      activityId: CS116_PRODUCTION_IDS.activityVs01,
      reason: "CONTINUE",
    });
  });

  it("recommends the next unlocked activity after completion", () => {
    const content = createContent();
    const progress = progressReader({
      [CS116_PRODUCTION_IDS.activityVs01]: {
        attemptCount: 1,
        successfulAttemptCount: 1,
        completed: true,
      },
    });

    expect(getNextStudyActivity(content, progress)).toEqual({
      activityId: CS116_PRODUCTION_IDS.activityVs02,
      reason: "NEXT",
    });
  });
});
