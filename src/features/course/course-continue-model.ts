import type { ContentRegistry } from "../../core/content";
import type { CourseId, LearningActivityId } from "../../core/domain";
import {
  getCourseActivityIds,
  getNextStudyActivity,
  type ActivityProgressReader,
  type NextStudyActivity,
} from "../../app/learning-path";

/**
 * The single, unambiguous "what next" of ONE course (PHASE-06 / M8): the call to action on a
 * course card and at the top of the course page. It never looks at another course.
 */
export interface CourseContinue {
  readonly courseId: CourseId;
  readonly activityId: LearningActivityId;
  readonly activityTitle: string;
  readonly reason: NextStudyActivity["reason"];
  /** Short button text, for example "Tiếp tục: PF-02 — ...". */
  readonly label: string;
}

export function getCourseContinue(
  content: ContentRegistry,
  progress: ActivityProgressReader,
  courseId: CourseId,
): CourseContinue | null {
  const next = getNextStudyActivity(content, progress, courseId);
  if (next === null) return null;
  const title = content.getActivity(next.activityId)?.title ?? next.activityId;
  const untouchedStart =
    next.reason === "NEXT" &&
    getCourseActivityIds(content, courseId)[0] === next.activityId &&
    progress.getActivityProgress(next.activityId).attemptCount === 0;
  return {
    courseId,
    activityId: next.activityId,
    activityTitle: title,
    reason: next.reason,
    label: continueLabel(next.reason, title, untouchedStart),
  };
}

function continueLabel(
  reason: NextStudyActivity["reason"],
  title: string,
  untouchedStart: boolean,
): string {
  switch (reason) {
    case "CONTINUE":
      return `Tiếp tục: ${title}`;
    case "NEXT":
      return untouchedStart ? `Bắt đầu: ${title}` : `Học tiếp: ${title}`;
    case "COMPLETE_REVIEW":
      return `Ôn tập: ${title}`;
  }
}
