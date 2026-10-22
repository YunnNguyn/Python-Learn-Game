import type { ContentRegistry } from "../../core/content";
import {
  MasteryState,
  type Course,
  type LearningActivityId,
  type Lesson,
  type World,
} from "../../core/domain";
import type { LearningEngine } from "../../core/learning";

export interface CompletionProgress {
  readonly completed: number;
  readonly total: number;
}

export function getCourseCompletion(
  content: ContentRegistry,
  learning: LearningEngine,
  course: Course,
): CompletionProgress {
  const ids = new Set<LearningActivityId>();
  for (const worldId of course.worldIds) {
    const world = content.getWorld(worldId);
    if (!world) continue;
    collectWorldActivityIds(content, world, ids);
  }
  return completionForIds(learning, ids);
}

export function getWorldCompletion(
  content: ContentRegistry,
  learning: LearningEngine,
  world: World,
): CompletionProgress {
  const ids = new Set<LearningActivityId>();
  collectWorldActivityIds(content, world, ids);
  return completionForIds(learning, ids);
}

export function getLessonCompletion(
  learning: LearningEngine,
  lesson: Lesson,
): CompletionProgress {
  return completionForIds(learning, new Set(lesson.activityIds));
}

export function activityStatusLabel(
  learning: LearningEngine,
  activityId: LearningActivityId,
): string {
  const progress = learning.getActivityProgress(activityId);
  if (progress.completed) return "Đã hoàn thành";
  if (progress.attemptCount > 0) return "Đang luyện";
  return "Chưa học";
}

export function masteryLabel(state: MasteryState): string {
  switch (state) {
    case MasteryState.UNSEEN:
      return "Chưa học";
    case MasteryState.DISCOVERED:
      return "Đã tiếp xúc";
    case MasteryState.PRACTICING:
      return "Đang luyện";
    case MasteryState.INDEPENDENT:
      return "Tự làm được";
    case MasteryState.TRANSFERRED:
      return "Đã vận dụng";
    case MasteryState.RETAINED:
      return "Đã ghi nhớ";
  }
}

function collectWorldActivityIds(
  content: ContentRegistry,
  world: World,
  target: Set<LearningActivityId>,
): void {
  for (const lessonId of world.lessonIds) {
    const lesson = content.getLesson(lessonId);
    if (!lesson) continue;
    for (const activityId of lesson.activityIds) target.add(activityId);
  }
}

function completionForIds(
  learning: LearningEngine,
  ids: ReadonlySet<LearningActivityId>,
): CompletionProgress {
  let completed = 0;
  for (const id of ids) {
    if (learning.getActivityProgress(id).completed) completed += 1;
  }
  return { completed, total: ids.size };
}
