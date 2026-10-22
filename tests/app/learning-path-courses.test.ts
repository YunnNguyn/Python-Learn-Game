import { describe, expect, it } from "vitest";

import {
  getActivityAccess,
  getCourseActivityIds,
  getCourseOfActivity,
  getCourseOfLesson,
  getCoursesOfActivity,
  getLessonOfActivity,
  getNextActivityInCourse,
  getNextStudyActivity,
  getOrderedActivityIds,
  resolveActiveCourse,
  type ActivityProgressReader,
  type AttemptHistoryReader,
} from "../../src/app/learning-path";
import {
  CS116_PRODUCTION_IDS,
  registerCs116ProductionContent,
} from "../../src/content/cs116";
import {
  PYTHON_FOUNDATIONS_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_IDS,
  registerPythonFoundationsContent,
} from "../../src/content/python-foundations";
import { ContentRegistry } from "../../src/core/content";
import {
  CourseSchema,
  LearningActivityType,
  LearningStage,
  LessonSchema,
  WorldSchema,
  CodeMissionActivitySchema,
  type CourseId,
  type LearningActivityId,
} from "../../src/core/domain";
import type { ActivityProgress } from "../../src/core/learning";

/**
 * PHASE-06 / M8 Part A - every course owns its activity order and its unlock rules.
 * The pre-M8 path flattened all courses into one chain; these tests pin that a second
 * course neither waits for the first nor changes what the first one does.
 */

const CS116 = CS116_PRODUCTION_IDS.course as CourseId;
const PYTHON = PYTHON_FOUNDATIONS_IDS.course as CourseId;
const activity = (id: string) => id as LearningActivityId;
const PF = PYTHON_FOUNDATIONS_ACTIVITY_IDS.map(activity);
const PF1 = PF[0]!;
const PF2 = PF[1]!;
const PF7 = PF[6]!;
const VS01 = activity(CS116_PRODUCTION_IDS.activityVs01);
const VS02 = activity(CS116_PRODUCTION_IDS.activityVs02);
const VS06 = activity(CS116_PRODUCTION_IDS.activityVs06);

function builtIn(order: "cs116-first" | "python-first" = "cs116-first"): ContentRegistry {
  const content = new ContentRegistry();
  if (order === "cs116-first") {
    registerCs116ProductionContent(content);
    registerPythonFoundationsContent(content);
  } else {
    registerPythonFoundationsContent(content);
    registerCs116ProductionContent(content);
  }
  return content;
}

function cs116Only(): ContentRegistry {
  const content = new ContentRegistry();
  registerCs116ProductionContent(content);
  return content;
}

type Overrides = Readonly<Record<string, Partial<ActivityProgress>>>;

function reader(
  overrides: Overrides = {},
  attempts: AttemptHistoryReader["getAttempts"] extends () => infer R ? R : never = [],
): ActivityProgressReader & AttemptHistoryReader {
  return {
    getActivityProgress(activityId) {
      return {
        activityId,
        attemptCount: 0,
        successfulAttemptCount: 0,
        completed: false,
        ...(overrides[String(activityId)] ?? {}),
      };
    },
    getAttempts: () => attempts,
  };
}

const done = { attemptCount: 1, successfulAttemptCount: 1, completed: true } as const;
const completedAll = (ids: readonly LearningActivityId[]): Overrides =>
  Object.fromEntries(ids.map((id) => [String(id), done]));

describe("course-scoped activity order", () => {
  it("each course keeps its own order; the global list is only course after course", () => {
    const content = builtIn();
    const cs116Order = getCourseActivityIds(cs116Only(), CS116);

    expect(getCourseActivityIds(content, CS116)).toEqual(cs116Order);
    expect(getCourseActivityIds(content, PYTHON)).toEqual(PF);
    expect(getOrderedActivityIds(content)).toEqual([...cs116Order, ...PF]);
    expect(getOrderedActivityIds(content, PYTHON)).toEqual(PF);
    expect(getCourseActivityIds(content, "no-such-course" as CourseId)).toEqual([]);
  });

  it("registration order never changes a course's own order", () => {
    const first = builtIn("cs116-first");
    const second = builtIn("python-first");
    expect(getCourseActivityIds(second, CS116)).toEqual(getCourseActivityIds(first, CS116));
    expect(getCourseActivityIds(second, PYTHON)).toEqual(getCourseActivityIds(first, PYTHON));
  });

  it("the two courses share no activity", () => {
    const content = builtIn();
    const cs116 = new Set(getCourseActivityIds(content, CS116));
    for (const id of PF) expect(cs116.has(id)).toBe(false);
    expect(getCoursesOfActivity(content, PF1).map((course) => course.id)).toEqual([PYTHON]);
    expect(getCoursesOfActivity(content, VS01).map((course) => course.id)).toEqual([CS116]);
  });
});

describe("course-scoped unlocking", () => {
  it("opens the first activity of EACH course on a fresh profile, and only that one", () => {
    const content = builtIn();
    const fresh = reader();

    expect(getActivityAccess(content, fresh, VS01).unlocked).toBe(true);
    expect(getActivityAccess(content, fresh, PF1).unlocked).toBe(true);
    expect(getActivityAccess(content, fresh, VS02).unlocked).toBe(false);
    const locked = getActivityAccess(content, fresh, PF2);
    expect(locked.unlocked).toBe(false);
    expect(locked.prerequisiteActivityId).toBe(PF1);
    expect(locked.reason).toContain("PF-01");
    for (const id of PF.slice(2)) expect(getActivityAccess(content, fresh, id).unlocked).toBe(false);
  });

  it("completing the whole of CS116 does not unlock anything in Python Foundations", () => {
    const content = builtIn();
    const progress = reader(completedAll(getCourseActivityIds(content, CS116)));

    expect(getActivityAccess(content, progress, PF1).unlocked).toBe(true);
    for (const id of PF.slice(1)) expect(getActivityAccess(content, progress, id).unlocked).toBe(false);
    expect(getNextStudyActivity(content, progress, PYTHON)).toEqual({ activityId: PF1, reason: "NEXT" });
  });

  it("completing the whole of Python Foundations does not unlock anything in CS116", () => {
    const content = builtIn();
    const progress = reader(completedAll(PF));

    expect(getActivityAccess(content, progress, VS01).unlocked).toBe(true);
    expect(getActivityAccess(content, progress, VS02).unlocked).toBe(false);
    expect(getNextStudyActivity(content, progress, CS116)).toEqual({ activityId: VS01, reason: "NEXT" });
  });

  it("unlocks a successor only through its own course's previous activity", () => {
    const content = builtIn();

    const afterPf1 = reader({ [PF1]: done });
    expect(getActivityAccess(content, afterPf1, PF2)).toMatchObject({ unlocked: true, prerequisiteActivityId: PF1 });
    expect(getActivityAccess(content, afterPf1, VS02).unlocked).toBe(false);

    const afterVs01 = reader({ [VS01]: done });
    expect(getActivityAccess(content, afterVs01, VS02).unlocked).toBe(true);
    expect(getActivityAccess(content, afterVs01, PF2).unlocked).toBe(false);
  });

  it("a failed attempt keeps the successor locked; an attempted activity stays reachable", () => {
    const content = builtIn();
    const failedPf1 = reader({ [PF1]: { attemptCount: 2, successfulAttemptCount: 0, completed: false } });

    expect(getActivityAccess(content, failedPf1, PF2).unlocked).toBe(false);
    expect(getActivityAccess(content, failedPf1, PF1).unlocked).toBe(true);
  });

  it("keeps CS116 backward compatible: legacy attempts stay open and the unlock chain is unchanged", () => {
    const withPython = builtIn();
    const before = cs116Only();
    const legacy = reader({ [VS06]: { attemptCount: 3, successfulAttemptCount: 0, completed: false } });

    expect(getActivityAccess(withPython, legacy, VS06).unlocked).toBe(true);
    expect(getActivityAccess(withPython, legacy, VS06).reason).toContain("đã bắt đầu");

    // For every activity of CS116 and any of a few progress states, registering the second
    // course changes nothing.
    const order = getCourseActivityIds(before, CS116);
    const states: Overrides[] = [
      {},
      { [order[0]!]: done },
      completedAll(order.slice(0, 5)),
      completedAll(order),
      { [order[4]!]: { attemptCount: 1, successfulAttemptCount: 0, completed: false } },
    ];
    for (const state of states) {
      for (const id of order) {
        expect(getActivityAccess(withPython, reader(state), id), String(id)).toEqual(
          getActivityAccess(before, reader(state), id),
        );
      }
    }
  });

  it("an activity that no course lists is never open", () => {
    expect(getActivityAccess(builtIn(), reader(), activity("nope")).unlocked).toBe(false);
  });

  it("an activity listed by two courses is open when it is open in either of them", () => {
    const content = new ContentRegistry();
    const make = (id: string) =>
      CodeMissionActivitySchema.parse({
        id,
        type: LearningActivityType.CODE_MISSION,
        title: id,
        conceptIds: [],
        stage: LearningStage.GUIDED,
        missionTemplateId: `${id}.template`,
      });
    for (const id of ["a1", "shared", "b1"]) content.registerActivity(make(id));
    const course = (id: string, ids: string[]) => {
      content.registerLesson(LessonSchema.parse({ id: `${id}.lesson`, title: id, conceptIds: [], activityIds: ids }));
      content.registerWorld(WorldSchema.parse({ id: `${id}.world`, title: id, lessonIds: [`${id}.lesson`] }));
      content.registerCourse(CourseSchema.parse({ id, title: id, worldIds: [`${id}.world`] }));
    };
    course("course-a", ["a1", "shared"]);
    course("course-b", ["shared", "b1"]);

    // Locked behind a1 in course A, but FIRST in course B: open.
    expect(getActivityAccess(content, reader(), activity("shared")).unlocked).toBe(true);
    // b1 follows `shared` in B only.
    expect(getActivityAccess(content, reader(), activity("b1")).unlocked).toBe(false);
    expect(getActivityAccess(content, reader({ shared: done }), activity("b1")).unlocked).toBe(true);
  });
});

describe("the next step is always inside one course", () => {
  it("per course: continue an attempted activity, else the next open one", () => {
    const content = builtIn();
    const progress = reader({
      [PF1]: done,
      [PF2]: { attemptCount: 1, successfulAttemptCount: 0, completed: false },
    });

    expect(getNextStudyActivity(content, progress, PYTHON)).toEqual({ activityId: PF2, reason: "CONTINUE" });
    expect(getNextStudyActivity(content, progress, CS116)).toEqual({ activityId: VS01, reason: "NEXT" });
  });

  it("a finished course recommends its own closing review, never an activity of another course", () => {
    const content = builtIn();
    const progress = reader(completedAll(PF));

    expect(getNextStudyActivity(content, progress, PYTHON)).toEqual({ activityId: PF7, reason: "COMPLETE_REVIEW" });
  });

  it("without a course: the first course with work left, else the first course's review", () => {
    const content = builtIn();

    expect(getNextStudyActivity(content, reader())).toEqual({ activityId: VS01, reason: "NEXT" });
    expect(
      getNextStudyActivity(content, reader(completedAll(getCourseActivityIds(content, CS116)))),
    ).toEqual({ activityId: PF1, reason: "NEXT" });
    expect(getNextStudyActivity(content, reader(completedAll(getOrderedActivityIds(content))))).toEqual({
      activityId: activity(CS116_PRODUCTION_IDS.activityVs07),
      reason: "COMPLETE_REVIEW",
    });
  });

  it("successor and lesson lookups stay inside the activity's course", () => {
    const content = builtIn();
    const lastOfCs116 = getCourseActivityIds(content, CS116).at(-1)!;

    expect(getNextActivityInCourse(content, PF1)).toBe(PF2);
    expect(getNextActivityInCourse(content, PF7)).toBeUndefined();
    expect(getNextActivityInCourse(content, lastOfCs116)).toBeUndefined();
    expect(getNextActivityInCourse(content, activity("nope"))).toBeUndefined();

    expect(getLessonOfActivity(content, PF1)?.id).toBe(PYTHON_FOUNDATIONS_IDS.lessonValuesDecisions);
    expect(getLessonOfActivity(content, PF7)?.id).toBe(PYTHON_FOUNDATIONS_IDS.lessonCollectionsFunctions);
    expect(getCourseOfActivity(content, PF1)?.id).toBe(PYTHON);
    expect(getCourseOfLesson(content, PYTHON_FOUNDATIONS_IDS.lessonCollectionsFunctions as never)?.id).toBe(PYTHON);
    expect(getCourseOfLesson(content, "nope" as never)).toBeUndefined();
  });
});

describe("the course the Today card talks about (derived, nothing stored)", () => {
  const attempt = (activityId: LearningActivityId, submittedAt: string) => ({ activityId, submittedAt });

  it("defaults to the first course on a fresh profile", () => {
    expect(resolveActiveCourse(builtIn(), reader())?.id).toBe(CS116);
  });

  it("follows the course of the most recent submission", () => {
    const content = builtIn();
    const pythonLast = reader({ [VS01]: done, [PF1]: done }, [
      attempt(VS01, "2026-10-20T10:00:00.000Z"),
      attempt(PF1, "2026-10-21T10:00:00.000Z"),
    ]);
    const cs116Last = reader({ [VS01]: done, [PF1]: done }, [
      attempt(PF1, "2026-10-20T10:00:00.000Z"),
      attempt(VS01, "2026-10-21T10:00:00.000Z"),
    ]);

    expect(resolveActiveCourse(content, pythonLast)?.id).toBe(PYTHON);
    expect(resolveActiveCourse(content, cs116Last)?.id).toBe(CS116);
  });

  it("moves on when the most recent course has nothing left to do", () => {
    const content = builtIn();
    const finished = reader(completedAll(getCourseActivityIds(content, CS116)), [
      attempt(VS01, "2026-10-21T10:00:00.000Z"),
    ]);

    expect(resolveActiveCourse(content, finished)?.id).toBe(PYTHON);
  });

  it("an empty registry has no active course", () => {
    expect(resolveActiveCourse(new ContentRegistry(), reader())).toBeUndefined();
  });
});
