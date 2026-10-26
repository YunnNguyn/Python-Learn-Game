import { describe, expect, it } from "vitest";

import { getActivityAccess } from "../../src/app/learning-path";
import {
  CourseReviewReason,
  CourseReviewState,
  DEFAULT_COURSE_REVIEW_LIMIT,
  FUTURE_TIMESTAMP_TOLERANCE_MS,
  selectCourseReview,
  type CourseReviewReader,
} from "../../src/app/course-review";
import { deriveActivityVariantSeed } from "../../src/app/services/application-services";
import {
  CS116_PRODUCTION_IDS,
  registerCs116ProductionContent,
} from "../../src/content/cs116";
import {
  PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_IDS,
  registerPythonFoundationsContent,
} from "../../src/content/python-foundations";
import { ContentRegistry } from "../../src/core/content";
import {
  AttemptRecordSchema,
  Difficulty,
  type AttemptRecord,
  type CourseId,
  type LearningActivityId,
} from "../../src/core/domain";

/**
 * PHASE-09 / M11 - review recommendations are scoped to ONE course and to what is unlocked:
 * no other course's activity, no locked activity, at most 3 items, one per activity, a Vietnamese
 * reason for each, and graceful results for an empty profile, a finished profile and bad data.
 */

const PYTHON = PYTHON_FOUNDATIONS_IDS.course as CourseId;
const CS116 = CS116_PRODUCTION_IDS.course as CourseId;
const PF = PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS.map((id) => id as LearningActivityId);
const PF26 = PYTHON_FOUNDATIONS_IDS.activityPf26 as LearningActivityId;
const NOW = new Date("2026-10-23T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function builtIn(): ContentRegistry {
  const content = new ContentRegistry();
  registerCs116ProductionContent(content);
  registerPythonFoundationsContent(content);
  return content;
}

let counter = 0;
function attempt(
  content: ContentRegistry,
  activityId: LearningActivityId,
  at: Date | string,
  passed = true,
  variant = 0,
): AttemptRecord {
  const activity = content.getActivity(activityId)!;
  if (!("missionTemplateId" in activity)) throw new Error("not a mission");
  const template = content.getMissionTemplate(activity.missionTemplateId)!;
  counter += 1;
  return AttemptRecordSchema.parse({
    id: `review-${counter}`,
    activityId,
    missionTemplateId: template.id,
    missionTemplateVersion: template.version,
    seed: deriveActivityVariantSeed(activityId, template.version, variant),
    difficulty: Difficulty.EASY,
    conceptIds: activity.conceptIds,
    learningStage: activity.stage,
    submittedAt: typeof at === "string" ? at : at.toISOString(),
    passed,
    submissionIndex: 1,
    runCountBeforeSubmit: 0,
    hintsUsed: [],
    runtimeErrorCount: 0,
  });
}

function readerOf(attempts: readonly AttemptRecord[]): CourseReviewReader {
  return {
    getAttempts: () => attempts,
    getActivityProgress: (activityId) => {
      const own = attempts.filter((item) => item.activityId === activityId);
      return {
        activityId,
        attemptCount: own.length,
        successfulAttemptCount: own.filter((item) => item.passed).length,
        completed: own.some((item) => item.passed),
      };
    },
  };
}

const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("course review (M11)", () => {
  const content = builtIn();
  const review = (attempts: readonly AttemptRecord[], courseId = PYTHON, limit?: number) =>
    selectCourseReview({
      content,
      reader: readerOf(attempts),
      courseId,
      now: NOW,
      ...(limit === undefined ? {} : { limit }),
    });

  it("a profile with no attempts has nothing to review (and says so)", () => {
    const result = review([]);
    expect(result.state).toBe(CourseReviewState.NO_ATTEMPTS);
    expect(result.items).toEqual([]);
    expect(result.ignoredAttemptCount).toBe(0);
  });

  it("a recent failure recommends re-trying the activity that failed, with a Vietnamese reason", () => {
    const attempts = [
      attempt(content, PF[0]!, ago(5 * DAY)),
      attempt(content, PF[1]!, ago(4 * DAY)),
      attempt(content, PF[2]!, ago(1 * DAY), false),
    ];
    const result = review(attempts);
    expect(result.state).toBe(CourseReviewState.ITEMS);
    const top = result.items[0]!;
    expect(top.reason).toBe(CourseReviewReason.RECENT_FAILURE);
    expect(top.activityId).toBe(PF[2]);
    expect(top.why).toMatch(/chưa đạt/);
    expect(top.why.length).toBeGreaterThan(20);
    expect(top.conceptTitle.length).toBeGreaterThan(0);
  });

  it("never recommends a locked activity or one of another course", () => {
    // Only PF-01 was attempted (and failed): PF-02.. are locked.
    const attempts = [attempt(content, PF[0]!, ago(1 * DAY), false)];
    const result = review(attempts);
    const pfSet = new Set(PF);
    for (const item of result.items) {
      expect(pfSet.has(item.activityId)).toBe(true);
      expect(getActivityAccess(content, readerOf(attempts), item.activityId).unlocked).toBe(true);
    }
    expect(result.items.map((item) => item.activityId)).toEqual([PF[0]]);
  });

  it("returns at most 3 items, at most one per activity, ordered by priority", () => {
    const attempts = PF.slice(0, 12).flatMap((id, index) => [
      attempt(content, id, ago((40 - index) * DAY), index % 2 === 0),
    ]);
    const result = review(attempts);
    expect(result.items.length).toBeLessThanOrEqual(DEFAULT_COURSE_REVIEW_LIMIT);
    expect(new Set(result.items.map((item) => item.activityId)).size).toBe(result.items.length);
    const priorities = result.items.map((item) => item.priority);
    expect([...priorities].sort((left, right) => right - left)).toEqual(priorities);
    for (const item of result.items) expect(item.why.length).toBeGreaterThan(10);
    expect(review(attempts, PYTHON, 1).items).toHaveLength(1);
    expect(review(attempts, PYTHON, 0).items).toHaveLength(0);
  });

  it("many stale concepts are still capped at 3 and flagged STALE", () => {
    const attempts = PF.slice(0, 10).map((id, index) => attempt(content, id, ago((60 - index) * DAY)));
    const result = review(attempts);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.length).toBeLessThanOrEqual(3);
    expect(result.items.some((item) => item.reason === CourseReviewReason.STALE)).toBe(true);
  });

  it("CS116 history cannot create or hide a Python Foundations recommendation", () => {
    const python = [
      attempt(content, PF[0]!, ago(5 * DAY)),
      attempt(content, PF[1]!, ago(1 * DAY), false),
    ];
    const cs116Ids = content
      .getCourse(CS116)!
      .worldIds.flatMap((worldId) => content.getWorld(worldId)!.lessonIds)
      .flatMap((lessonId) => content.getLesson(lessonId)!.activityIds)
      .filter((id) => "missionTemplateId" in content.getActivity(id)!);
    const cs116 = cs116Ids.slice(0, 4).map((id) => attempt(content, id, ago(1 * DAY), false));

    expect(review([...python, ...cs116])).toEqual(review(python));
    // ... and the CS116 review only offers CS116 activities.
    const cs116Review = review([...python, ...cs116], CS116);
    expect(cs116Review.items.length).toBeGreaterThan(0);
    for (const item of cs116Review.items) expect(cs116Ids).toContain(item.activityId);
  });

  it("a finished course with nothing weak or stale offers a retention check, never a RETAINED claim", () => {
    const attempts = PF.map((id, index) => attempt(content, id, ago(2 * DAY - index * 60_000)));
    const result = review(attempts);
    expect(result.state).toBe(CourseReviewState.ITEMS);
    const retention = result.items.find((item) => item.reason === CourseReviewReason.RETENTION_CHECK);
    expect(retention).toBeDefined();
    expect(retention!.why).not.toMatch(/đã ghi nhớ|thành thạo|RETAINED/i);
    expect(retention!.why).toMatch(/24 giờ/);
  });

  it("the retention check disappears once REVIEW evidence >= 24h exists for every review concept", () => {
    const first = PF.map((id, index) => attempt(content, id, ago(10 * DAY - index * 60_000)));
    const again = PF.filter((id) => content.getActivity(id)!.stage === "REVIEW").map((id, index) =>
      attempt(content, id, ago(1 * DAY - index * 60_000), true, 1),
    );
    const result = review([...first, ...again]);
    expect(result.items.some((item) => item.reason === CourseReviewReason.RETENTION_CHECK)).toBe(false);
  });

  it("nothing due: fresh passes on a single activity, no failure, no staleness", () => {
    const result = review([attempt(content, PF[0]!, ago(1 * DAY))]);
    // PF-01's concepts are only "discovered" or "practicing" - either a WEAK item for PF-01
    // itself or nothing; it must never be a different/locked activity.
    expect([CourseReviewState.ITEMS, CourseReviewState.NOTHING_DUE]).toContain(result.state);
    for (const item of result.items) expect(item.activityId).toBe(PF[0]);
  });

  it("ignores unreadable and future timestamps and reports how many", () => {
    const good = [attempt(content, PF[0]!, ago(2 * DAY)), attempt(content, PF[1]!, ago(1 * DAY), false)];
    // Extra attempts on activities that are already open, so only the timestamp rule differs.
    const bad = [
      { ...attempt(content, PF[1]!, ago(1 * DAY), false, 3), submittedAt: "garbage" } as AttemptRecord,
      attempt(
        content,
        PF[0]!,
        new Date(NOW.getTime() + FUTURE_TIMESTAMP_TOLERANCE_MS + 60 * DAY),
        false,
        4,
      ),
    ];
    const withBad = review([...good, ...bad]);
    expect(withBad.ignoredAttemptCount).toBe(2);
    // freshVariantIndex still counts every stored seed, so compare the rest.
    const strip = (value: ReturnType<typeof review>) => ({
      ...value,
      ignoredAttemptCount: 0,
      items: value.items.map(({ freshVariantIndex: _ignored, ...item }) => item),
    });
    expect(strip(withBad)).toEqual(strip(review(good)));
  });

  it("every item carries a fresh variant index that no stored attempt of that activity has used", () => {
    const attempts = [
      attempt(content, PF[0]!, ago(5 * DAY), true, 0),
      attempt(content, PF[1]!, ago(2 * DAY), false, 0),
      attempt(content, PF[1]!, ago(1 * DAY), false, 1),
    ];
    const result = review(attempts);
    const failing = result.items.find((item) => item.activityId === PF[1]);
    expect(failing?.freshVariantIndex).toBe(2);
    for (const item of result.items) {
      const used = attempts.filter((a) => a.activityId === item.activityId).map((a) => a.seed);
      const activity = content.getActivity(item.activityId)!;
      const template = content.getMissionTemplate(
        (activity as unknown as { missionTemplateId: never }).missionTemplateId,
      )!;
      expect(used).not.toContain(deriveActivityVariantSeed(item.activityId, template.version, item.freshVariantIndex!));
    }
  });

  it("a profile whose only attempts are unreadable is reported as having no usable attempts", () => {
    const broken = [{ ...attempt(content, PF[0]!, ago(DAY), false), submittedAt: "x" } as AttemptRecord];
    const result = review(broken);
    expect(result.state).toBe(CourseReviewState.NO_ATTEMPTS);
    expect(result.ignoredAttemptCount).toBe(1);
  });

  it("unknown course -> NO_ATTEMPTS, never throws", () => {
    expect(review([attempt(content, PF[0]!, ago(DAY))], "nope" as CourseId).state).toBe(
      CourseReviewState.NO_ATTEMPTS,
    );
  });

  it("PF-26 / PF-27 closing activities can be recommended once unlocked, not before", () => {
    // Everything up to PF-25 passed; PF-26 failed recently: PF-26 is unlocked and offered, PF-27 is not.
    const attempts = [
      ...PF.slice(0, 25).map((id, index) => attempt(content, id, ago((30 - index) * 60_000 + 2 * DAY))),
      attempt(content, PF26, ago(DAY), false),
    ];
    const result = review(attempts);
    expect(result.items.some((item) => item.activityId === PF[26])).toBe(false);
    expect(result.items.some((item) => item.activityId === PF26)).toBe(true);
  });
});
