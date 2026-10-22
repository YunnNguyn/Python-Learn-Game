import type { ContentRegistry } from "../core/content";
import {
  LearningStage,
  type Course,
  type CourseId,
  type LearningActivityId,
  type Lesson,
  type LessonId,
} from "../core/domain";
import type { ActivityProgress } from "../core/learning";

/**
 * Course-scoped learning path (PHASE-06 / M8).
 *
 * Until M8 the path flattened the activities of EVERY registered course into one global
 * chain, so a second course would have been locked behind the whole of the first. The
 * path is now owned by the course:
 *
 *  - every course has its own activity order (worlds -> lessons -> activities, in the
 *    order the course declares them);
 *  - the first activity of a course is open on a fresh profile, whatever the other
 *    courses look like;
 *  - an activity opens when the activity before it IN THE SAME COURSE is completed, when
 *    it is itself completed, or when it was ever attempted (legacy attempts are never
 *    locked out);
 *  - nothing a course does is ever read by another course's unlock decision.
 *
 * `getActivityAccess` is the single decision both the UI and `createMissionSession` use,
 * so a direct service call enforces exactly what the lesson page shows.
 *
 * An activity listed by more than one course is open when it is open in ANY of them
 * (sharing an activity can never lock a learner out of it).
 */

export interface ActivityProgressReader {
  getActivityProgress(activityId: LearningActivityId): ActivityProgress;
}

export interface ActivityAccess {
  readonly activityId: LearningActivityId;
  readonly unlocked: boolean;
  readonly prerequisiteActivityId?: LearningActivityId;
  readonly reason: string;
}

export interface NextStudyActivity {
  readonly activityId: LearningActivityId;
  readonly reason: "CONTINUE" | "NEXT" | "COMPLETE_REVIEW";
}

/** The minimal slice of the learning engine needed to find the learner's current course. */
export interface AttemptHistoryReader {
  getAttempts(): readonly { readonly activityId: LearningActivityId; readonly submittedAt: string }[];
}

/**
 * The activities of one course in learning order (each once). Unknown course -> empty.
 * This is the ONLY order an unlock decision is based on.
 */
export function getCourseActivityIds(
  content: ContentRegistry,
  courseId: CourseId,
): readonly LearningActivityId[] {
  const course = content.getCourse(courseId);
  return course === undefined ? [] : collectCourseActivityIds(content, course);
}

/**
 * Without `courseId`: every course's activities, course after course in registration order
 * (each activity once). That is a LISTING order for views and tools; it is NOT an unlock
 * chain - use `getCourseActivityIds` / `getActivityAccess` for unlock rules.
 * With `courseId`: the same as `getCourseActivityIds`.
 */
export function getOrderedActivityIds(
  content: ContentRegistry,
  courseId?: CourseId,
): readonly LearningActivityId[] {
  if (courseId !== undefined) return getCourseActivityIds(content, courseId);

  const ordered: LearningActivityId[] = [];
  const seen = new Set<LearningActivityId>();
  for (const course of content.getCourses()) {
    for (const activityId of collectCourseActivityIds(content, course)) {
      if (seen.has(activityId)) continue;
      seen.add(activityId);
      ordered.push(activityId);
    }
  }
  return ordered;
}

/** The courses that list `activityId`, in registration order (normally exactly one). */
export function getCoursesOfActivity(
  content: ContentRegistry,
  activityId: LearningActivityId,
): readonly Course[] {
  return content
    .getCourses()
    .filter((course) => collectCourseActivityIds(content, course).includes(activityId));
}

/** The course an activity belongs to (the first one that lists it), if any. */
export function getCourseOfActivity(
  content: ContentRegistry,
  activityId: LearningActivityId,
): Course | undefined {
  return getCoursesOfActivity(content, activityId)[0];
}

/** The course whose worlds contain `lessonId` (the first one that lists it), if any. */
export function getCourseOfLesson(
  content: ContentRegistry,
  lessonId: LessonId,
): Course | undefined {
  for (const course of content.getCourses()) {
    for (const worldId of course.worldIds) {
      if (content.getWorld(worldId)?.lessonIds.includes(lessonId)) return course;
    }
  }
  return undefined;
}

/** The lesson that lists `activityId`, looked up inside the course that owns the activity. */
export function getLessonOfActivity(
  content: ContentRegistry,
  activityId: LearningActivityId,
): Lesson | undefined {
  const course = getCourseOfActivity(content, activityId);
  if (course === undefined) return undefined;
  for (const worldId of course.worldIds) {
    const world = content.getWorld(worldId);
    if (world === undefined) continue;
    for (const lessonId of world.lessonIds) {
      const lesson = content.getLesson(lessonId);
      if (lesson?.activityIds.includes(activityId)) return lesson;
    }
  }
  return undefined;
}

/**
 * The activity that follows `activityId` IN ITS OWN COURSE (never in another course), or
 * undefined for the last one. It says nothing about whether that activity is open yet.
 */
export function getNextActivityInCourse(
  content: ContentRegistry,
  activityId: LearningActivityId,
): LearningActivityId | undefined {
  const course = getCourseOfActivity(content, activityId);
  if (course === undefined) return undefined;
  const ordered = collectCourseActivityIds(content, course);
  const index = ordered.indexOf(activityId);
  return index < 0 ? undefined : ordered[index + 1];
}

export function getActivityAccess(
  content: ContentRegistry,
  progress: ActivityProgressReader,
  activityId: LearningActivityId,
): ActivityAccess {
  const courses = getCoursesOfActivity(content, activityId);
  if (courses.length === 0) {
    return {
      activityId,
      unlocked: false,
      reason: "Hoạt động không nằm trong lộ trình học hiện tại.",
    };
  }

  let firstLocked: ActivityAccess | undefined;
  for (const course of courses) {
    const access = getAccessWithinCourse(
      content,
      progress,
      collectCourseActivityIds(content, course),
      activityId,
    );
    if (access.unlocked) return access;
    firstLocked ??= access;
  }
  return firstLocked!;
}

/**
 * What to study next.
 *
 * With `courseId`: inside that course only. Without it: the first course (registration
 * order) that still has something open to do, else the closing review of the first
 * course - for a single-course registry this is exactly the pre-M8 behavior.
 */
export function getNextStudyActivity(
  content: ContentRegistry,
  progress: ActivityProgressReader,
  courseId?: CourseId,
): NextStudyActivity | null {
  if (courseId !== undefined) {
    return nextStudyInOrder(content, progress, getCourseActivityIds(content, courseId), true);
  }

  const courses = content.getCourses();
  for (const course of courses) {
    const next = nextStudyInOrder(content, progress, collectCourseActivityIds(content, course), false);
    if (next !== null) return next;
  }
  const first = courses[0];
  return first === undefined
    ? null
    : nextStudyInOrder(content, progress, collectCourseActivityIds(content, first), true);
}

/**
 * The course the learner is "in" right now - the minimal course context for views that
 * recommend a single next step across courses (the Today card). It is DERIVED from stored
 * attempts, never stored: the course of the most recent submission, as long as that course
 * still has something to do; otherwise the first course that has. No attempt at all -> the
 * first course in registration order. No new preference or account store is involved.
 */
export function resolveActiveCourse(
  content: ContentRegistry,
  progress: ActivityProgressReader & Partial<AttemptHistoryReader>,
): Course | undefined {
  const courses = content.getCourses();
  const hasWork = (course: Course) =>
    nextStudyInOrder(content, progress, collectCourseActivityIds(content, course), false) !== null;

  const attempts = progress.getAttempts?.() ?? [];
  let latest: { activityId: LearningActivityId; submittedAt: string } | undefined;
  for (const attempt of attempts) {
    if (latest === undefined || attempt.submittedAt >= latest.submittedAt) latest = attempt;
  }
  if (latest !== undefined) {
    const recent = getCourseOfActivity(content, latest.activityId);
    if (recent !== undefined && hasWork(recent)) return recent;
  }
  return courses.find(hasWork) ?? courses[0];
}

function nextStudyInOrder(
  content: ContentRegistry,
  progress: ActivityProgressReader,
  ordered: readonly LearningActivityId[],
  allowCompleteReview: boolean,
): NextStudyActivity | null {
  for (const activityId of ordered) {
    const activityProgress = progress.getActivityProgress(activityId);
    if (activityProgress.completed) continue;

    const access = getAccessWithinCourse(content, progress, ordered, activityId);
    if (!access.unlocked) continue;

    return {
      activityId,
      reason: activityProgress.attemptCount > 0 ? "CONTINUE" : "NEXT",
    };
  }

  if (!allowCompleteReview) return null;

  const finalReviewActivityId = [...ordered]
    .reverse()
    .find((activityId) => content.getActivity(activityId)?.stage === LearningStage.REVIEW);
  const finalActivityId = finalReviewActivityId ?? ordered.at(-1);
  return finalActivityId
    ? { activityId: finalActivityId, reason: "COMPLETE_REVIEW" }
    : null;
}

function getAccessWithinCourse(
  content: ContentRegistry,
  progress: ActivityProgressReader,
  ordered: readonly LearningActivityId[],
  activityId: LearningActivityId,
): ActivityAccess {
  const index = ordered.indexOf(activityId);
  if (index < 0) {
    return {
      activityId,
      unlocked: false,
      reason: "Hoạt động không nằm trong lộ trình học hiện tại.",
    };
  }

  const current = progress.getActivityProgress(activityId);
  if (index === 0 || current.completed || current.attemptCount > 0) {
    return {
      activityId,
      unlocked: true,
      reason:
        current.attemptCount > 0
          ? "Bạn đã bắt đầu hoạt động này nên có thể tiếp tục bất cứ lúc nào."
          : "Hoạt động đầu tiên của lộ trình đã sẵn sàng.",
    };
  }

  const prerequisiteActivityId = ordered[index - 1]!;
  const prerequisite = progress.getActivityProgress(prerequisiteActivityId);
  if (prerequisite.completed) {
    return {
      activityId,
      unlocked: true,
      prerequisiteActivityId,
      reason: "Hoạt động trước đã hoàn thành nên nội dung này đã được mở.",
    };
  }

  const prerequisiteActivity = content.getActivity(prerequisiteActivityId);
  return {
    activityId,
    unlocked: false,
    prerequisiteActivityId,
    reason: prerequisiteActivity
      ? `Hoàn thành “${prerequisiteActivity.title}” để mở hoạt động này.`
      : "Hoàn thành hoạt động trước trong lộ trình để mở nội dung này.",
  };
}

function collectCourseActivityIds(
  content: ContentRegistry,
  course: Course,
): readonly LearningActivityId[] {
  const ordered: LearningActivityId[] = [];
  const seen = new Set<LearningActivityId>();
  for (const worldId of course.worldIds) {
    const world = content.getWorld(worldId);
    if (!world) continue;
    for (const lessonId of world.lessonIds) {
      const lesson = content.getLesson(lessonId);
      if (!lesson) continue;
      for (const activityId of lesson.activityIds) {
        if (seen.has(activityId)) continue;
        seen.add(activityId);
        ordered.push(activityId);
      }
    }
  }
  return ordered;
}
