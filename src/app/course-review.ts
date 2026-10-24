import type { ContentRegistry } from "../core/content";
import {
  LearningStage,
  MasteryState,
  ReviewReason,
  type AttemptRecord,
  type Concept,
  type ConceptId,
  type CourseId,
  type LearningActivity,
  type LearningActivityId,
} from "../core/domain";
import {
  deriveConceptProgress,
  RETENTION_DELAY_MS,
  selectReviewRecommendations,
  type ConceptProgress,
} from "../core/learning";
import { findFreshVariantIndex } from "./course-graduation";
import {
  getActivityAccess,
  getCourseActivityIds,
  type ActivityProgressReader,
} from "./learning-path";

/**
 * Course-scoped review recommendations (PHASE-09 / M11).
 *
 * `LearningEngine.getReviewRecommendations` looks at every concept of every course and may point at
 * an activity that is locked or belongs to another course. This selector keeps the same reasons
 * and priorities (it reuses `selectReviewRecommendations`) but:
 *
 *  - reads only the attempts of the given course's own activities, so another course's history
 *    (CS116) cannot create or hide a recommendation;
 *  - recommends only activities that are unlocked right now (`getActivityAccess`) - a recommended
 *    link never leads to a locked screen;
 *  - picks the activity itself (the one that failed for RECENT_FAILURE, a hands-on stage for WEAK,
 *    a REVIEW / INDEPENDENT stage for STALE / DEPENDENCY) instead of "the first REVIEW stage";
 *  - returns at most `limit` (default 3) items, at most one per activity;
 *  - ignores attempts whose timestamp is unreadable or lies in the future (clock skew), and says
 *    how many it ignored;
 *  - adds a RETENTION_CHECK item for a completed course whose closing REVIEW activity has not yet
 *    produced RETAINED evidence. It never claims a concept is retained; the existing mastery rule
 *    decides that, and the text only explains how the evidence can appear (>= 24h later).
 *
 * No scheduler and no new persistence: it is a pure function of the stored attempts and `now`.
 */

export const CourseReviewReason = {
  ...ReviewReason,
  RETENTION_CHECK: "RETENTION_CHECK",
} as const;
export type CourseReviewReason = (typeof CourseReviewReason)[keyof typeof CourseReviewReason];

export const CourseReviewState = {
  /** The learner has not submitted anything in this course yet. */
  NO_ATTEMPTS: "NO_ATTEMPTS",
  /** Something was recommended. */
  ITEMS: "ITEMS",
  /** Nothing is weak, failed, stale or waiting for a retention check. */
  NOTHING_DUE: "NOTHING_DUE",
  /** Something is due, but no unlocked activity of this course can address it. */
  NO_ELIGIBLE_ACTIVITY: "NO_ELIGIBLE_ACTIVITY",
} as const;
export type CourseReviewState = (typeof CourseReviewState)[keyof typeof CourseReviewState];

export interface CourseReviewItem {
  readonly activityId: LearningActivityId;
  readonly activityTitle: string;
  readonly conceptId: ConceptId;
  readonly conceptTitle: string;
  readonly reason: CourseReviewReason;
  /** Vietnamese, one sentence: why this is recommended. */
  readonly why: string;
  readonly priority: number;
  /**
   * Smallest variant index whose seed no stored attempt of `activityId` has used. A pass on a new
   * seed is what adds independent evidence, so review links open this variant (`?variant=N`),
   * except RECENT_FAILURE which resumes the activity as the learner left it. `null` for an
   * activity that has no mission to generate a variant of (the activity page is used instead).
   */
  readonly freshVariantIndex: number | null;
}

export interface CourseReview {
  readonly courseId: CourseId;
  readonly state: CourseReviewState;
  readonly items: readonly CourseReviewItem[];
  /** Attempts of this course skipped because the timestamp is unreadable or in the future. */
  readonly ignoredAttemptCount: number;
}

export interface CourseReviewReader extends ActivityProgressReader {
  getAttempts(): readonly AttemptRecord[];
}

export interface CourseReviewInput {
  readonly content: ContentRegistry;
  readonly reader: CourseReviewReader;
  readonly courseId: CourseId;
  readonly now: Date;
  readonly limit?: number;
}

export const DEFAULT_COURSE_REVIEW_LIMIT = 3;
/** A submission stamped further ahead than this is treated as a bad clock, not as evidence. */
export const FUTURE_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

const RETENTION_CHECK_PRIORITY = 40;

export function selectCourseReview(input: CourseReviewInput): CourseReview {
  const { content, reader, courseId } = input;
  const limit = Math.max(0, Math.floor(input.limit ?? DEFAULT_COURSE_REVIEW_LIMIT));
  const nowMs = input.now.getTime();
  const activityIds = getCourseActivityIds(content, courseId);
  const inCourse = new Set<LearningActivityId>(activityIds);

  const courseAttempts = reader.getAttempts().filter((attempt) => inCourse.has(attempt.activityId));
  const attempts = courseAttempts.filter((attempt) => {
    const submitted = Date.parse(attempt.submittedAt);
    return Number.isFinite(submitted) && submitted <= nowMs + FUTURE_TIMESTAMP_TOLERANCE_MS;
  });
  const ignoredAttemptCount = courseAttempts.length - attempts.length;
  const finish = (state: CourseReviewState, items: readonly CourseReviewItem[]): CourseReview => ({
    courseId,
    state,
    items,
    ignoredAttemptCount,
  });

  if (attempts.length === 0 || limit === 0 || !Number.isFinite(nowMs)) {
    return finish(CourseReviewState.NO_ATTEMPTS, []);
  }

  const activities = activityIds
    .map((id) => content.getActivity(id))
    .filter((activity): activity is LearningActivity => activity !== undefined);
  const orderOf = new Map(activityIds.map((id, index) => [id, index] as const));
  const concepts = collectConcepts(content, activities);

  const progressByConcept = new Map<ConceptId, ConceptProgress>();
  const latestAttemptPassedByConcept = new Map<ConceptId, boolean | undefined>();
  for (const concept of concepts) {
    progressByConcept.set(concept.id, deriveConceptProgress(concept.id, attempts));
    latestAttemptPassedByConcept.set(
      concept.id,
      [...attempts]
        .sort((left, right) => Date.parse(left.submittedAt) - Date.parse(right.submittedAt))
        .reverse()
        .find((attempt) => attempt.conceptIds.includes(concept.id))?.passed,
    );
  }

  const unlocked = (activity: LearningActivity) =>
    getActivityAccess(content, reader, activity.id).unlocked;
  const unlockedActivities = activities.filter(unlocked);

  const recommendations = selectReviewRecommendations({
    concepts,
    // No activities on purpose: the activity is chosen below, among unlocked ones of this course.
    activities: [],
    progressByConcept,
    latestAttemptPassedByConcept,
    now: input.now,
  }).filter((recommendation) => progressByConcept.has(recommendation.conceptId));

  const items: CourseReviewItem[] = [];
  const taken = new Set<LearningActivityId>();
  let dueCount = 0;
  for (const recommendation of recommendations) {
    const concept = content.getConcept(recommendation.conceptId);
    const progress = progressByConcept.get(recommendation.conceptId);
    // A concept that already has a pass but sits at "discovered" only because the course teaches
    // it exclusively through REVIEW-stage activities cannot be improved by any activity here;
    // repeating it forever would be noise, not a recommendation.
    if (
      recommendation.reason === ReviewReason.WEAK &&
      progress !== undefined &&
      progress.successfulAttemptCount > 0 &&
      !activities.some(
        (activity) =>
          activity.conceptIds.includes(recommendation.conceptId) &&
          activity.stage !== LearningStage.REVIEW,
      )
    ) {
      continue;
    }
    dueCount += 1;
    const activity = chooseActivity(
      recommendation.reason,
      recommendation.conceptId,
      unlockedActivities,
      attempts,
      orderOf,
      taken,
    );
    if (concept === undefined || progress === undefined || activity === undefined) continue;
    taken.add(activity.id);
    items.push({
      freshVariantIndex: freshVariantOf(content, reader, activity),
      activityId: activity.id,
      activityTitle: activity.title,
      conceptId: concept.id,
      conceptTitle: concept.title,
      reason: recommendation.reason,
      why: reasonText(recommendation.reason, concept.title, progress),
      priority: recommendation.priority,
    });
  }

  // A completed course keeps one slot for the retention check: it is the only item that tells the
  // learner how RETAINED evidence can appear, so it must not be crowded out by weaker-priority noise.
  const retention = retentionCheck(
    content,
    reader,
    activities,
    unlockedActivities,
    attempts,
    progressByConcept,
    new Set(),
    nowMs,
  );
  const regularLimit = retention !== null && limit >= 2 ? limit - 1 : limit;
  const chosen = items.slice(0, regularLimit);
  if (retention !== null) {
    dueCount += 1;
    if (chosen.length < limit && !chosen.some((item) => item.activityId === retention.activityId)) {
      chosen.push(retention);
    }
  }
  items.length = 0;
  items.push(...chosen);

  if (items.length > 0) return finish(CourseReviewState.ITEMS, items);
  return finish(
    dueCount > 0 ? CourseReviewState.NO_ELIGIBLE_ACTIVITY : CourseReviewState.NOTHING_DUE,
    [],
  );
}

function collectConcepts(
  content: ContentRegistry,
  activities: readonly LearningActivity[],
): readonly Concept[] {
  const seen = new Set<ConceptId>();
  const concepts: Concept[] = [];
  for (const activity of activities) {
    for (const conceptId of activity.conceptIds) {
      if (seen.has(conceptId)) continue;
      seen.add(conceptId);
      const concept = content.getConcept(conceptId);
      if (concept !== undefined) concepts.push(concept);
    }
  }
  return concepts;
}

const HANDS_ON_FIRST: readonly LearningStage[] = [
  LearningStage.GUIDED,
  LearningStage.DISCOVER,
  LearningStage.INDEPENDENT,
  LearningStage.REVIEW,
  LearningStage.TRANSFER,
  LearningStage.RETENTION,
];
const CONSOLIDATE_FIRST: readonly LearningStage[] = [
  LearningStage.REVIEW,
  LearningStage.INDEPENDENT,
  LearningStage.TRANSFER,
  LearningStage.GUIDED,
  LearningStage.DISCOVER,
  LearningStage.RETENTION,
];

function chooseActivity(
  reason: CourseReviewReason,
  conceptId: ConceptId,
  unlockedActivities: readonly LearningActivity[],
  attempts: readonly AttemptRecord[],
  orderOf: ReadonlyMap<LearningActivityId, number>,
  taken: ReadonlySet<LearningActivityId>,
): LearningActivity | undefined {
  const candidates = unlockedActivities.filter(
    (activity) => activity.conceptIds.includes(conceptId) && !taken.has(activity.id),
  );
  if (candidates.length === 0) return undefined;

  if (reason === ReviewReason.RECENT_FAILURE) {
    const failed = [...attempts]
      .sort((left, right) => Date.parse(right.submittedAt) - Date.parse(left.submittedAt))
      .find((attempt) => attempt.conceptIds.includes(conceptId) && !attempt.passed);
    const retry = failed && candidates.find((activity) => activity.id === failed.activityId);
    if (retry !== undefined) return retry;
  }

  const stages = reason === ReviewReason.WEAK ? HANDS_ON_FIRST : CONSOLIDATE_FIRST;
  return [...candidates].sort(
    (left, right) =>
      stages.indexOf(left.stage) - stages.indexOf(right.stage) ||
      (orderOf.get(left.id) ?? 0) - (orderOf.get(right.id) ?? 0),
  )[0];
}

function reasonText(
  reason: CourseReviewReason,
  conceptTitle: string,
  progress: ConceptProgress,
): string {
  switch (reason) {
    case ReviewReason.RECENT_FAILURE:
      return `Lần nộp gần nhất liên quan tới “${conceptTitle}” chưa đạt (trong 7 ngày qua) — làm lại để chốt phần này.`;
    case ReviewReason.WEAK:
      return progress.successfulAttemptCount === 0
        ? `Bạn đã thử “${conceptTitle}” nhưng chưa có lần nộp đạt.`
        : `“${conceptTitle}” mới ở mức đã tiếp xúc, chưa có bằng chứng luyện tập đủ vững — làm lại trên một đề mới để bổ sung.`;
    case ReviewReason.STALE:
      return `Lần đạt gần nhất của “${conceptTitle}” đã hơn 14 ngày — ôn lại để không quên.`;
    case ReviewReason.DEPENDENCY:
      return `“${conceptTitle}” là kiến thức nền cho phần bạn đã đạt nhưng chưa có bằng chứng vững.`;
    case CourseReviewReason.RETENTION_CHECK:
      return `Đã hoàn thành khóa, nhưng “${conceptTitle}” chưa có bằng chứng ghi nhớ: làm lại bài ôn tập này sau ít nhất 24 giờ kể từ lần đạt đầu tiên.`;
  }
}

function retentionCheck(
  content: ContentRegistry,
  reader: CourseReviewReader,
  activities: readonly LearningActivity[],
  unlockedActivities: readonly LearningActivity[],
  attempts: readonly AttemptRecord[],
  progressByConcept: ReadonlyMap<ConceptId, ConceptProgress>,
  taken: ReadonlySet<LearningActivityId>,
  nowMs: number,
): CourseReviewItem | null {
  if (activities.length === 0) return null;
  if (!activities.every((activity) => reader.getActivityProgress(activity.id).completed)) return null;

  const unlockedIds = new Set(unlockedActivities.map((activity) => activity.id));
  for (const activity of [...activities].reverse()) {
    if (activity.stage !== LearningStage.REVIEW) continue;
    if (!unlockedIds.has(activity.id) || taken.has(activity.id)) continue;
    const conceptId = activity.conceptIds.find((id) => {
      const progress = progressByConcept.get(id);
      return progress !== undefined && progress.mastery !== MasteryState.RETAINED;
    });
    const concept = conceptId === undefined ? undefined : content.getConcept(conceptId);
    if (conceptId === undefined || concept === undefined) continue;

    const firstSuccess = attempts
      .filter((attempt) => attempt.passed && attempt.conceptIds.includes(conceptId))
      .map((attempt) => Date.parse(attempt.submittedAt))
      .sort((left, right) => left - right)[0];
    const waiting = firstSuccess !== undefined && nowMs - firstSuccess < RETENTION_DELAY_MS;
    return {
      activityId: activity.id,
      activityTitle: activity.title,
      conceptId,
      conceptTitle: concept.title,
      reason: CourseReviewReason.RETENTION_CHECK,
      why: waiting
        ? `Chưa đủ 24 giờ kể từ lần đạt đầu tiên của “${concept.title}” — quay lại làm lại bài ôn tập này sau đó để có bằng chứng ghi nhớ.`
        : reasonText(CourseReviewReason.RETENTION_CHECK, concept.title, progressByConcept.get(conceptId)!),
      priority: RETENTION_CHECK_PRIORITY,
      freshVariantIndex: freshVariantOf(content, reader, activity),
    };
  }
  return null;
}

function freshVariantOf(
  content: ContentRegistry,
  reader: CourseReviewReader,
  activity: LearningActivity,
): number | null {
  if (!("missionTemplateId" in activity)) return null;
  const template = content.getMissionTemplate(activity.missionTemplateId);
  if (template === undefined) return null;
  return findFreshVariantIndex(
    activity.id,
    template.version,
    reader.getAttempts().filter((attempt) => attempt.activityId === activity.id),
  );
}
