import type { ContentRegistry } from "../content";
import type {
  ConceptId,
  LearningActivity,
  LearningActivityId,
  LearningActivityType,
  LearningStage,
} from "../domain";

export interface ActivityRegistry {
  getActivity(id: LearningActivityId): LearningActivity | undefined;

  getActivitiesByConcept(conceptId: ConceptId): readonly LearningActivity[];

  getActivitiesByStage(stage: LearningStage): readonly LearningActivity[];

  getActivitiesByType(type: LearningActivityType): readonly LearningActivity[];
}

export function buildActivityRegistry(
  contentRegistry: ContentRegistry,
): ActivityRegistry {
  const activities = contentRegistry.getActivities();
  const activitiesById = new Map<LearningActivityId, LearningActivity>();
  const activitiesByConcept = new Map<ConceptId, LearningActivity[]>();
  const activitiesByStage = new Map<LearningStage, LearningActivity[]>();
  const activitiesByType = new Map<LearningActivityType, LearningActivity[]>();

  const append = <TKey>(
    index: Map<TKey, LearningActivity[]>,
    key: TKey,
    activity: LearningActivity,
  ): void => {
    const matches = index.get(key);

    if (matches) {
      matches.push(activity);
      return;
    }

    index.set(key, [activity]);
  };

  for (const activity of activities) {
    activitiesById.set(activity.id, activity);

    for (const conceptId of new Set(activity.conceptIds)) {
      append(activitiesByConcept, conceptId, activity);
    }

    append(activitiesByStage, activity.stage, activity);
    append(activitiesByType, activity.type, activity);
  }

  return {
    getActivity(id) {
      return activitiesById.get(id);
    },

    getActivitiesByConcept(conceptId) {
      return [...(activitiesByConcept.get(conceptId) ?? [])];
    },

    getActivitiesByStage(stage) {
      return [...(activitiesByStage.get(stage) ?? [])];
    },

    getActivitiesByType(type) {
      return [...(activitiesByType.get(type) ?? [])];
    },
  };
}
