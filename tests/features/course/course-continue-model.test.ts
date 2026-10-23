import { describe, expect, it } from "vitest";

import type { ActivityProgressReader } from "../../../src/app/learning-path";
import { CS116_PRODUCTION_IDS, registerCs116ProductionContent } from "../../../src/content/cs116";
import {
  PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_IDS,
  registerPythonFoundationsContent,
} from "../../../src/content/python-foundations";
import { ContentRegistry } from "../../../src/core/content";
import type { CourseId, LearningActivityId } from "../../../src/core/domain";
import type { ActivityProgress } from "../../../src/core/learning";
import { getCourseContinue } from "../../../src/features/course/course-continue-model";

/**
 * PHASE-06 / M8 Part C - the one "continue" action of a course: it always names an activity
 * of THAT course, in a state the learner can actually open.
 */

const PYTHON = PYTHON_FOUNDATIONS_IDS.course as CourseId;
const CS116 = CS116_PRODUCTION_IDS.course as CourseId;
// PHASE-07 / M9: the course lists the seven M8 activities followed by the eight M9 ones.
const PF = PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS as readonly string[];

function content(): ContentRegistry {
  const registry = new ContentRegistry();
  registerCs116ProductionContent(registry);
  registerPythonFoundationsContent(registry);
  return registry;
}

function progress(overrides: Readonly<Record<string, Partial<ActivityProgress>>> = {}): ActivityProgressReader {
  return {
    getActivityProgress: (activityId) => ({
      activityId,
      attemptCount: 0,
      successfulAttemptCount: 0,
      completed: false,
      ...(overrides[String(activityId)] ?? {}),
    }),
  };
}

const done = { attemptCount: 1, successfulAttemptCount: 1, completed: true } as const;

describe("getCourseContinue", () => {
  it("starts an untouched course at its first activity", () => {
    const next = getCourseContinue(content(), progress(), PYTHON);

    expect(next).toMatchObject({ courseId: PYTHON, activityId: PF[0], reason: "NEXT" });
    expect(next?.label.startsWith("Bắt đầu:")).toBe(true);
    expect(next?.label).toContain(next!.activityTitle);
  });

  it("moves on to the next activity once the previous one is completed", () => {
    const next = getCourseContinue(content(), progress({ [PF[0]!]: done }), PYTHON);

    expect(next).toMatchObject({ activityId: PF[1], reason: "NEXT" });
    expect(next?.label.startsWith("Học tiếp:")).toBe(true);
  });

  it("resumes an activity that was attempted but not completed", () => {
    const next = getCourseContinue(
      content(),
      progress({ [PF[0]!]: done, [PF[1]!]: { attemptCount: 2, successfulAttemptCount: 0, completed: false } }),
      PYTHON,
    );

    expect(next).toMatchObject({ activityId: PF[1], reason: "CONTINUE" });
    expect(next?.label.startsWith("Tiếp tục:")).toBe(true);
  });

  it("offers the closing review once the course is complete", () => {
    const all = Object.fromEntries(PF.map((id) => [id, done]));
    const next = getCourseContinue(content(), progress(all), PYTHON);

    // The closing REVIEW-stage mission is the PF-26 mini-project (PF-07 and PF-13 are no longer the end of the course).
    expect(next).toMatchObject({ activityId: PF[25], reason: "COMPLETE_REVIEW" });
    expect(next?.label.startsWith("Ôn tập:")).toBe(true);
  });

  it("each course points into itself, whatever the other course has done", () => {
    const all = Object.fromEntries(PF.map((id) => [id, done]));
    const registry = content();

    const cs116 = getCourseContinue(registry, progress(all), CS116);
    expect(cs116?.activityId).toBe(CS116_PRODUCTION_IDS.activityVs01);
    expect(PF).not.toContain(cs116?.activityId);

    const python = getCourseContinue(
      registry,
      progress({ [CS116_PRODUCTION_IDS.activityVs01]: done, [CS116_PRODUCTION_IDS.activityVs02]: done }),
      PYTHON,
    );
    expect(python?.activityId).toBe(PF[0]);
  });

  it("returns nothing for an unknown course", () => {
    expect(getCourseContinue(content(), progress(), "no-such-course" as CourseId)).toBeNull();
  });

  it("never recommends a locked activity", () => {
    const registry = content();
    for (const state of [{}, { [PF[0]!]: done }, { [PF[0]!]: done, [PF[1]!]: done, [PF[2]!]: done }]) {
      const next = getCourseContinue(registry, progress(state), PYTHON);
      const index = PF.indexOf(next!.activityId);
      for (const earlier of PF.slice(0, index)) {
        if (next!.reason === "COMPLETE_REVIEW") continue;
        expect((state as Record<string, unknown>)[earlier], `${next!.activityId} needs ${earlier}`).toBeDefined();
      }
      expect(registry.getActivity(next!.activityId as LearningActivityId)).toBeDefined();
    }
  });
});
