import {
  LearningStage,
  MasteryState,
  ReviewReason,
  type Concept,
  type ConceptId,
  type LearningActivity,
  type LearningActivityId,
  type ReviewReason as ReviewReasonValue,
} from "../domain";
import type { ConceptProgress } from "./mastery";

const RECENT_FAILURE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export interface ReviewRecommendation {
  readonly conceptId: ConceptId;
  readonly reason: ReviewReasonValue;
  readonly priority: number;
  readonly activityId?: LearningActivityId;
  readonly lastAttemptAt?: string;
}

export function selectReviewRecommendations(input: {
  readonly concepts: readonly Concept[];
  readonly activities: readonly LearningActivity[];
  readonly progressByConcept: ReadonlyMap<ConceptId, ConceptProgress>;
  readonly latestAttemptPassedByConcept: ReadonlyMap<ConceptId, boolean | undefined>;
  readonly now: Date;
}): readonly ReviewRecommendation[] {
  const candidates = new Map<ConceptId, ReviewRecommendation>();
  const nowMs = input.now.getTime();

  const offer = (recommendation: ReviewRecommendation) => {
    const current = candidates.get(recommendation.conceptId);
    if (!current || recommendation.priority > current.priority) {
      candidates.set(recommendation.conceptId, recommendation);
    }
  };

  for (const concept of input.concepts) {
    const progress = input.progressByConcept.get(concept.id);
    if (!progress || progress.mastery === MasteryState.UNSEEN) continue;

    const lastAttemptTime = progress.lastAttemptAt ? Date.parse(progress.lastAttemptAt) : NaN;
    const latestPassed = input.latestAttemptPassedByConcept.get(concept.id);

    if (
      latestPassed === false &&
      Number.isFinite(lastAttemptTime) &&
      nowMs - lastAttemptTime <= RECENT_FAILURE_WINDOW_MS
    ) {
      offer(withActivity(input.activities, {
        conceptId: concept.id,
        reason: ReviewReason.RECENT_FAILURE,
        priority: 100,
        lastAttemptAt: progress.lastAttemptAt,
      }));
      continue;
    }

    if (progress.successfulAttemptCount === 0 || progress.mastery === MasteryState.DISCOVERED) {
      offer(withActivity(input.activities, {
        conceptId: concept.id,
        reason: ReviewReason.WEAK,
        priority: 80,
        lastAttemptAt: progress.lastAttemptAt,
      }));
    } else if (
      progress.lastSuccessAt &&
      nowMs - Date.parse(progress.lastSuccessAt) >= STALE_WINDOW_MS
    ) {
      offer(withActivity(input.activities, {
        conceptId: concept.id,
        reason: ReviewReason.STALE,
        priority: 60,
        lastAttemptAt: progress.lastAttemptAt,
      }));
    }

    if (progress.successfulAttemptCount > 0) {
      for (const prerequisiteId of concept.prerequisites) {
        const prerequisiteProgress = input.progressByConcept.get(prerequisiteId);
        if (
          !prerequisiteProgress ||
          prerequisiteProgress.mastery === MasteryState.UNSEEN ||
          prerequisiteProgress.mastery === MasteryState.DISCOVERED
        ) {
          offer(withActivity(input.activities, {
            conceptId: prerequisiteId,
            reason: ReviewReason.DEPENDENCY,
            priority: 70,
            lastAttemptAt: prerequisiteProgress?.lastAttemptAt,
          }));
        }
      }
    }
  }

  return [...candidates.values()].sort(
    (left, right) => right.priority - left.priority || String(left.conceptId).localeCompare(String(right.conceptId)),
  );
}

function withActivity(
  activities: readonly LearningActivity[],
  recommendation: Omit<ReviewRecommendation, "activityId">,
): ReviewRecommendation {
  const compatible = activities
    .filter((activity) => activity.conceptIds.includes(recommendation.conceptId))
    .sort((left, right) => stagePriority(left.stage) - stagePriority(right.stage));
  const activityId = compatible[0]?.id;
  return activityId ? { ...recommendation, activityId } : recommendation;
}

function stagePriority(stage: LearningStage): number {
  switch (stage) {
    case LearningStage.REVIEW:
      return 0;
    case LearningStage.INDEPENDENT:
      return 1;
    case LearningStage.GUIDED:
      return 2;
    case LearningStage.DISCOVER:
      return 3;
    case LearningStage.TRANSFER:
      return 4;
    case LearningStage.RETENTION:
      return 5;
  }
}
