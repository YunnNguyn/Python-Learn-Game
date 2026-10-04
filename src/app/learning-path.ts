import type { ContentRegistry } from "../core/content";
import { LearningStage, type LearningActivityId } from "../core/domain";
import type { ActivityProgress } from "../core/learning";

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

export function getOrderedActivityIds(content: ContentRegistry): readonly LearningActivityId[] {
  const ordered: LearningActivityId[] = [];
  const seen = new Set<LearningActivityId>();

  for (const course of content.getCourses()) {
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
  }

  return ordered;
}

export function getActivityAccess(
  content: ContentRegistry,
  progress: ActivityProgressReader,
  activityId: LearningActivityId,
): ActivityAccess {
  const ordered = getOrderedActivityIds(content);
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

export function getNextStudyActivity(
  content: ContentRegistry,
  progress: ActivityProgressReader,
): NextStudyActivity | null {
  const ordered = getOrderedActivityIds(content);

  for (const activityId of ordered) {
    const activityProgress = progress.getActivityProgress(activityId);
    if (activityProgress.completed) continue;

    const access = getActivityAccess(content, progress, activityId);
    if (!access.unlocked) continue;

    return {
      activityId,
      reason: activityProgress.attemptCount > 0 ? "CONTINUE" : "NEXT",
    };
  }

  const finalReviewActivityId = [...ordered]
    .reverse()
    .find((activityId) => content.getActivity(activityId)?.stage === LearningStage.REVIEW);
  const finalActivityId = finalReviewActivityId ?? ordered.at(-1);
  return finalActivityId
    ? { activityId: finalActivityId, reason: "COMPLETE_REVIEW" }
    : null;
}
