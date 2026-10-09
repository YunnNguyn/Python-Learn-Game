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
  it("keeps NumPy followed by the Local Python data-science path in curriculum order", () => {
    const content = createContent();

    expect(getOrderedActivityIds(content)).toEqual([
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
    ]);
  });

  it("unlocks LC-02 only after LC-01 is completed", () => {
    const content = createContent();
    const ordered = getOrderedActivityIds(content);
    const completedBeforeLc01 = Object.fromEntries(
      ordered.slice(0, 7).map((activityId) => [
        String(activityId),
        { attemptCount: 1, successfulAttemptCount: 1, completed: true },
      ]),
    );
    expect(
      getActivityAccess(
        content,
        progressReader(completedBeforeLc01),
        CS116_PRODUCTION_IDS.activityLc02 as LearningActivityId,
      ).unlocked,
    ).toBe(false);

    const completedThroughLc01 = {
      ...completedBeforeLc01,
      [CS116_PRODUCTION_IDS.activityLc01]: {
        attemptCount: 1,
        successfulAttemptCount: 1,
        completed: true,
      },
    };
    expect(
      getActivityAccess(
        content,
        progressReader(completedThroughLc01),
        CS116_PRODUCTION_IDS.activityLc02 as LearningActivityId,
      ).unlocked,
    ).toBe(true);
  });

  it("unlocks LC-03 after LC-02 and LC-04 after LC-03", () => {
    const content = createContent();
    const ordered = getOrderedActivityIds(content);
    const completeThrough = (activityId: string) => {
      const index = ordered.findIndex((candidate) => String(candidate) === activityId);
      return progressReader(
        Object.fromEntries(
          ordered.slice(0, index + 1).map((id) => [
            String(id),
            { attemptCount: 1, successfulAttemptCount: 1, completed: true },
          ]),
        ),
      );
    };

    expect(
      getActivityAccess(
        content,
        completeThrough(CS116_PRODUCTION_IDS.activityLc02),
        CS116_PRODUCTION_IDS.activityLc03 as LearningActivityId,
      ).unlocked,
    ).toBe(true);
    expect(
      getActivityAccess(
        content,
        completeThrough(CS116_PRODUCTION_IDS.activityLc02),
        CS116_PRODUCTION_IDS.activityLc04 as LearningActivityId,
      ).unlocked,
    ).toBe(false);
    expect(
      getActivityAccess(
        content,
        completeThrough(CS116_PRODUCTION_IDS.activityLc03),
        CS116_PRODUCTION_IDS.activityLc04 as LearningActivityId,
      ).unlocked,
    ).toBe(true);
  });

  it("keeps the later F4 pandas → Matplotlib → merge → image sequence linear", () => {
    const content = createContent();
    const ordered = getOrderedActivityIds(content);
    const progressThrough = (activityId: string) => {
      const index = ordered.findIndex((candidate) => String(candidate) === activityId);
      return progressReader(
        Object.fromEntries(
          ordered.slice(0, index + 1).map((id) => [
            String(id),
            { attemptCount: 1, successfulAttemptCount: 1, completed: true },
          ]),
        ),
      );
    };

    expect(
      getActivityAccess(
        content,
        progressThrough(CS116_PRODUCTION_IDS.activityLc09),
        CS116_PRODUCTION_IDS.activityLc10 as LearningActivityId,
      ).unlocked,
    ).toBe(true);
    expect(
      getActivityAccess(
        content,
        progressThrough(CS116_PRODUCTION_IDS.activityLc09),
        CS116_PRODUCTION_IDS.activityLc11 as LearningActivityId,
      ).unlocked,
    ).toBe(false);
    expect(
      getActivityAccess(
        content,
        progressThrough(CS116_PRODUCTION_IDS.activityLc10),
        CS116_PRODUCTION_IDS.activityLc11 as LearningActivityId,
      ).unlocked,
    ).toBe(true);
    expect(
      getActivityAccess(
        content,
        progressThrough(CS116_PRODUCTION_IDS.activityLc11),
        CS116_PRODUCTION_IDS.activityLc12 as LearningActivityId,
      ).unlocked,
    ).toBe(true);
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
  it("keeps the canonical review mission as the post-completion recommendation", () => {
    const content = createContent();
    const overrides = Object.fromEntries(
      getOrderedActivityIds(content).map((activityId) => [
        String(activityId),
        { attemptCount: 1, successfulAttemptCount: 1, completed: true },
      ]),
    );

    expect(getNextStudyActivity(content, progressReader(overrides))).toEqual({
      activityId: CS116_PRODUCTION_IDS.activityVs07,
      reason: "COMPLETE_REVIEW",
    });
  });

});
