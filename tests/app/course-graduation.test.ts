import { describe, expect, it } from "vitest";

import {
  CapstoneEvidence,
  CourseGraduationStatus,
  findFreshVariantIndex,
  getCourseGraduation,
  type GraduationReader,
} from "../../src/app/course-graduation";
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
  HintLevel,
  LearningStage,
  type AttemptRecord,
  type CourseId,
  type LearningActivityId,
} from "../../src/core/domain";
import { LearningEngine } from "../../src/core/learning";
import { MemoryLearningPersistence } from "../../src/core/persistence";

/**
 * PHASE-09 / M11 - the course completion view-model is a pure function of stored attempts:
 * 26/27 is in progress, 27/27 is completed (hints allowed), capstone evidence is a separate and
 * narrower statement, a later failure never revokes completion, RETAINED only comes from the
 * existing mastery rule, and another course's history changes nothing.
 */

const PYTHON = PYTHON_FOUNDATIONS_IDS.course as CourseId;
const CS116 = CS116_PRODUCTION_IDS.course as CourseId;
const PF = PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS.map((id) => id as LearningActivityId);
const PF27 = PYTHON_FOUNDATIONS_IDS.activityPf27 as LearningActivityId;
const PF26 = PYTHON_FOUNDATIONS_IDS.activityPf26 as LearningActivityId;

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
  input: {
    passed?: boolean;
    at: string;
    hints?: HintLevel[];
    variant?: number;
    seed?: string;
  },
): AttemptRecord {
  const activity = content.getActivity(activityId)!;
  if (!("missionTemplateId" in activity)) throw new Error("not a mission");
  const template = content.getMissionTemplate(activity.missionTemplateId)!;
  counter += 1;
  return AttemptRecordSchema.parse({
    id: `attempt-${counter}`,
    activityId,
    missionTemplateId: template.id,
    missionTemplateVersion: template.version,
    seed:
      input.seed ??
      deriveActivityVariantSeed(activityId, template.version, input.variant ?? 0),
    difficulty: Difficulty.EASY,
    conceptIds: activity.conceptIds,
    learningStage: activity.stage,
    submittedAt: input.at,
    passed: input.passed ?? true,
    submissionIndex: 1,
    runCountBeforeSubmit: 0,
    hintsUsed: input.hints ?? [],
    runtimeErrorCount: 0,
  });
}

/** One passing attempt for each of `activityIds`, one minute apart, starting at `start`. */
function passAll(
  content: ContentRegistry,
  activityIds: readonly LearningActivityId[],
  start = Date.parse("2026-10-01T10:00:00.000Z"),
  hintsFor: (id: LearningActivityId) => HintLevel[] = () => [],
): AttemptRecord[] {
  return activityIds.map((id, index) =>
    attempt(content, id, {
      at: new Date(start + index * 60_000).toISOString(),
      hints: hintsFor(id),
    }),
  );
}

async function engineWith(attempts: readonly AttemptRecord[]): Promise<LearningEngine> {
  const store = new MemoryLearningPersistence();
  for (const record of attempts) await store.addAttempt(record);
  const engine = new LearningEngine(store, () => new Date("2026-10-02T12:00:00.000Z"));
  await engine.initialize();
  return engine;
}

function fakeReader(attempts: readonly AttemptRecord[]): GraduationReader {
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

describe("course graduation (M11)", () => {
  const content = builtIn();

  it("lists 27 activities in the course and PF-27 is last, PF-26 second to last", () => {
    expect(PF).toHaveLength(27);
    expect(PF[26]).toBe(PF27);
    expect(PF[25]).toBe(PF26);
    expect(getCourseGraduation(content, fakeReader([]), PYTHON)!.totalCount).toBe(27);
  });

  it("a fresh profile is IN_PROGRESS 0/27 with no capstone evidence and no retention", () => {
    const view = getCourseGraduation(content, fakeReader([]), PYTHON)!;
    expect(view.status).toBe(CourseGraduationStatus.IN_PROGRESS);
    expect(view.completedCount).toBe(0);
    expect(view.remainingActivityIds).toHaveLength(27);
    expect(view.completedAt).toBeUndefined();
    expect(view.capstone?.evidence).toBe(CapstoneEvidence.NONE);
    expect(view.capstone?.passed).toBe(false);
    expect(view.capstone?.freshVariantIndex).toBe(0);
    expect(view.retention.retainedConceptCount).toBe(0);
  });

  it("26/26 legacy completion (PF-01..PF-26 only) stays IN_PROGRESS and points at PF-27", () => {
    const view = getCourseGraduation(content, fakeReader(passAll(content, PF.slice(0, 26))), PYTHON)!;
    expect(view.status).toBe(CourseGraduationStatus.IN_PROGRESS);
    expect(view.completedCount).toBe(26);
    expect(view.totalCount).toBe(27);
    expect(view.remainingActivityIds).toEqual([PF27]);
    expect(view.completedAt).toBeUndefined();
    expect(view.capstone?.evidence).toBe(CapstoneEvidence.NONE);
  });

  it("27/27 is COMPLETED even when every activity used hints, and the capstone says WITH_SUPPORT for H3/H4", () => {
    const attempts = passAll(content, PF, undefined, () => [HintLevel.H1, HintLevel.H3]);
    const view = getCourseGraduation(content, fakeReader(attempts), PYTHON)!;
    expect(view.status).toBe(CourseGraduationStatus.COMPLETED);
    expect(view.completedCount).toBe(27);
    expect(view.remainingActivityIds).toEqual([]);
    expect(view.capstone?.passed).toBe(true);
    expect(view.capstone?.evidence).toBe(CapstoneEvidence.WITH_SUPPORT);
    expect(view.completedAt).toBe(attempts.at(-1)!.submittedAt);
  });

  it("H1/H2 do not break independent capstone evidence; H3/H4 do, until an independent retry", () => {
    const base = passAll(content, PF.slice(0, 26));
    const withH2 = [...base, attempt(content, PF27, { at: "2026-10-01T12:00:00.000Z", hints: [HintLevel.H1, HintLevel.H2] })];
    expect(getCourseGraduation(content, fakeReader(withH2), PYTHON)!.capstone?.evidence).toBe(
      CapstoneEvidence.INDEPENDENT,
    );

    const withH4 = [...base, attempt(content, PF27, { at: "2026-10-01T12:00:00.000Z", hints: [HintLevel.H4] })];
    expect(getCourseGraduation(content, fakeReader(withH4), PYTHON)!.capstone?.evidence).toBe(
      CapstoneEvidence.WITH_SUPPORT,
    );

    // The learner then retries on a fresh variant without H3/H4: the evidence upgrades,
    // completion (already COMPLETED) is unchanged.
    const retried = [
      ...withH4,
      attempt(content, PF27, { at: "2026-10-03T12:00:00.000Z", hints: [], variant: 1 }),
    ];
    const view = getCourseGraduation(content, fakeReader(retried), PYTHON)!;
    expect(view.status).toBe(CourseGraduationStatus.COMPLETED);
    expect(view.capstone?.evidence).toBe(CapstoneEvidence.INDEPENDENT);
    expect(view.capstone?.passedAttemptCount).toBe(2);
    expect(view.capstone?.freshVariantIndex).toBe(2);
  });

  it("a failure after completion never revokes it and never downgrades capstone evidence", () => {
    const completed = passAll(content, PF);
    const before = getCourseGraduation(content, fakeReader(completed), PYTHON)!;
    const failed = [
      ...completed,
      attempt(content, PF27, { passed: false, at: "2026-10-09T09:00:00.000Z", variant: 1 }),
      attempt(content, PF[3]!, { passed: false, at: "2026-10-09T09:05:00.000Z" }),
    ];
    const after = getCourseGraduation(content, fakeReader(failed), PYTHON)!;
    expect(after.status).toBe(CourseGraduationStatus.COMPLETED);
    expect(after.completedCount).toBe(before.completedCount);
    expect(after.completedAt).toBe(before.completedAt);
    expect(after.capstone?.evidence).toBe(before.capstone?.evidence);
    expect(after.capstone?.attemptCount).toBe(before.capstone!.attemptCount + 1);
  });

  it("is derived from stored attempts only: the same attempts reloaded into a new engine give the same view", async () => {
    const attempts = passAll(content, PF);
    const first = getCourseGraduation(content, await engineWith(attempts), PYTHON);
    const reloaded = getCourseGraduation(content, await engineWith(attempts), PYTHON);
    expect(reloaded).toEqual(first);
    expect(first!.status).toBe(CourseGraduationStatus.COMPLETED);
  });

  it("same-day attempts never produce RETAINED; a REVIEW pass >= 24h after the first success does", () => {
    const sameDay = passAll(content, PF, Date.parse("2026-10-01T08:00:00.000Z"));
    // Re-attempt the closing REVIEW activity a few hours later.
    const reviewAgain = attempt(content, PF26, { at: "2026-10-01T20:00:00.000Z", variant: 1 });
    const view = getCourseGraduation(content, fakeReader([...sameDay, reviewAgain]), PYTHON)!;
    expect(view.retention.retainedConceptCount).toBe(0);
    expect(view.retention.conceptCount).toBeGreaterThan(10);

    const nextDay = attempt(content, PF26, { at: "2026-10-03T09:00:00.000Z", variant: 2 });
    const later = getCourseGraduation(content, fakeReader([...sameDay, reviewAgain, nextDay]), PYTHON)!;
    expect(later.retention.retainedConceptCount).toBeGreaterThan(0);
    expect(later.retention.retainedConceptCount).toBeLessThanOrEqual(later.retention.conceptCount);
    // Retention is evidence about concepts; it does not change completion.
    expect(later.status).toBe(CourseGraduationStatus.COMPLETED);
  });

  it("is course scoped: CS116 history changes nothing in Python Foundations, and CS116 has no capstone", () => {
    const python = passAll(content, PF.slice(0, 26));
    const cs116Ids = content
      .getCourse(CS116)!
      .worldIds.flatMap((worldId) => content.getWorld(worldId)!.lessonIds)
      .flatMap((lessonId) => content.getLesson(lessonId)!.activityIds)
      .filter((id) => "missionTemplateId" in content.getActivity(id)!);
    const cs116 = passAll(content, cs116Ids, Date.parse("2026-09-20T10:00:00.000Z"));
    expect(cs116.length).toBeGreaterThan(3);

    const withoutCs = getCourseGraduation(content, fakeReader(python), PYTHON)!;
    const withCs = getCourseGraduation(content, fakeReader([...python, ...cs116]), PYTHON)!;
    expect(withCs).toEqual(withoutCs);

    const cs116View = getCourseGraduation(content, fakeReader([...python, ...cs116]), CS116)!;
    expect(cs116View.capstone).toBeNull();
    expect(cs116View.totalCount).toBe(getCourseGraduation(content, fakeReader([]), CS116)!.totalCount);
    expect(cs116View.remainingActivityIds.every((id) => !PF.includes(id))).toBe(true);
  });

  it("returns null for an unknown course", () => {
    expect(getCourseGraduation(content, fakeReader([]), "no-such-course" as CourseId)).toBeNull();
  });

  it("completedAt is the latest first-pass time and is omitted when a timestamp is unreadable", () => {
    const attempts = passAll(content, PF);
    const view = getCourseGraduation(content, fakeReader(attempts), PYTHON)!;
    expect(view.completedAt).toBe(attempts.at(-1)!.submittedAt);

    const broken = attempts.map((item, index) =>
      index === 5 ? ({ ...item, submittedAt: "not-a-date" } as AttemptRecord) : item,
    );
    const brokenView = getCourseGraduation(content, fakeReader(broken), PYTHON)!;
    expect(brokenView.status).toBe(CourseGraduationStatus.COMPLETED);
    expect(brokenView.completedAt).toBeUndefined();
  });

  it("findFreshVariantIndex returns the smallest unused variant and skips used ones", () => {
    const seedOf = (n: number) => deriveActivityVariantSeed(PF27, 1, n);
    expect(findFreshVariantIndex(PF27, 1, [])).toBe(0);
    expect(findFreshVariantIndex(PF27, 1, [{ seed: seedOf(0) }])).toBe(1);
    expect(findFreshVariantIndex(PF27, 1, [{ seed: seedOf(0) }, { seed: seedOf(2) }])).toBe(1);
    expect(
      findFreshVariantIndex(PF27, 1, [0, 1, 2, 3, 4].map((n) => ({ seed: seedOf(n) }))),
    ).toBe(5);
    // A seed of another shape (an explicit seed) never blocks a derived variant.
    expect(findFreshVariantIndex(PF27, 1, [{ seed: "custom-seed" }])).toBe(0);
  });
});
