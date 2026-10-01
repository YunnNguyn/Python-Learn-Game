import { describe, expect, it } from "vitest";

import {
  buildActivityRegistry,
  type ActivityRegistry,
} from "../../src/core/activities";
import { ContentRegistry } from "../../src/core/content";
import {
  LearningActivitySchema,
  LearningActivityType,
  LearningStage,
  type ConceptId,
  type LearningActivity,
  type LearningActivityId,
} from "../../src/core/domain";

function createActivity(
  id: string,
  {
    conceptIds = ["concept.default"],
    stage = LearningStage.GUIDED,
    type = LearningActivityType.PREDICT_OUTPUT,
  }: {
    conceptIds?: readonly string[];
    stage?: LearningStage;
    type?: LearningActivityType;
  } = {},
): LearningActivity {
  const common = {
    id,
    title: `Activity ${id}`,
    conceptIds,
    stage,
    type,
  };

  if (
    type === LearningActivityType.CODE_MISSION ||
    type === LearningActivityType.DEBUG_MISSION ||
    type === LearningActivityType.BOSS_MISSION
  ) {
    return LearningActivitySchema.parse({
      ...common,
      missionTemplateId: `mission-template.${id}`,
    });
  }

  return LearningActivitySchema.parse(common);
}

function buildFromActivities(
  activities: readonly LearningActivity[],
): {
  contentRegistry: ContentRegistry;
  activityRegistry: ActivityRegistry;
} {
  const contentRegistry = new ContentRegistry();
  activities.forEach((activity) => contentRegistry.registerActivity(activity));

  return {
    contentRegistry,
    activityRegistry: buildActivityRegistry(contentRegistry),
  };
}

describe("ActivityRegistry", () => {
  it("builds empty query indexes from an empty ContentRegistry", () => {
    const registry = buildActivityRegistry(new ContentRegistry());

    expect(
      registry.getActivity("activity.missing" as LearningActivityId),
    ).toBeUndefined();
    expect(
      registry.getActivitiesByConcept("concept.missing" as ConceptId),
    ).toEqual([]);
    expect(registry.getActivitiesByStage(LearningStage.REVIEW)).toEqual([]);
    expect(
      registry.getActivitiesByType(LearningActivityType.RECALL_CODE),
    ).toEqual([]);
  });

  it("looks up registered activities by canonical activity ID", () => {
    const activity = createActivity("activity.one");
    const { activityRegistry } = buildFromActivities([activity]);

    expect(activityRegistry.getActivity(activity.id)).toBe(activity);
    expect(
      activityRegistry.getActivity("activity.missing" as LearningActivityId),
    ).toBeUndefined();
  });

  it("queries activities by Concept ID and returns [] for no matches", () => {
    const activityA = createActivity("activity.a", {
      conceptIds: ["concept.x"],
    });
    const activityB = createActivity("activity.b", {
      conceptIds: ["concept.y"],
    });
    const { activityRegistry } = buildFromActivities([activityA, activityB]);

    expect(
      activityRegistry.getActivitiesByConcept(
        activityA.conceptIds[0]!,
      ),
    ).toEqual([activityA]);
    expect(
      activityRegistry.getActivitiesByConcept(
        "concept.not.registered" as ConceptId,
      ),
    ).toEqual([]);
  });

  it("indexes a multi-concept activity under every authored Concept ID", () => {
    const activity = createActivity("activity.multi", {
      conceptIds: ["concept.a", "concept.b"],
    });
    const { activityRegistry } = buildFromActivities([activity]);

    expect(
      activityRegistry.getActivitiesByConcept(activity.conceptIds[0]!),
    ).toEqual([activity]);
    expect(
      activityRegistry.getActivitiesByConcept(activity.conceptIds[1]!),
    ).toEqual([activity]);
  });

  it("indexes duplicate Concept IDs within one activity only once without modifying authored data", () => {
    const activity = createActivity("activity.duplicate-concept", {
      conceptIds: ["concept.a", "concept.a"],
    });
    const authoredConceptIds = [...activity.conceptIds];
    const { activityRegistry } = buildFromActivities([activity]);

    expect(
      activityRegistry.getActivitiesByConcept(activity.conceptIds[0]!),
    ).toEqual([activity]);
    expect(activity.conceptIds).toEqual(authoredConceptIds);
  });

  it("queries activities by LearningStage", () => {
    const discover = createActivity("activity.discover", {
      stage: LearningStage.DISCOVER,
    });
    const review = createActivity("activity.review", {
      stage: LearningStage.REVIEW,
    });
    const retention = createActivity("activity.retention", {
      stage: LearningStage.RETENTION,
    });
    const { activityRegistry } = buildFromActivities([
      discover,
      review,
      retention,
    ]);

    expect(activityRegistry.getActivitiesByStage(LearningStage.REVIEW)).toEqual([
      review,
    ]);
  });

  it("queries both mission-backed and non-mission activities by LearningActivityType", () => {
    const codeMission = createActivity("activity.code", {
      type: LearningActivityType.CODE_MISSION,
    });
    const predictOutput = createActivity("activity.predict", {
      type: LearningActivityType.PREDICT_OUTPUT,
    });
    const recallCode = createActivity("activity.recall", {
      type: LearningActivityType.RECALL_CODE,
    });
    const { activityRegistry } = buildFromActivities([
      codeMission,
      predictOutput,
      recallCode,
    ]);

    expect(
      activityRegistry.getActivitiesByType(LearningActivityType.CODE_MISSION),
    ).toEqual([codeMission]);
    expect(
      activityRegistry.getActivitiesByType(
        LearningActivityType.PREDICT_OUTPUT,
      ),
    ).toEqual([predictOutput]);
  });

  it("preserves ContentRegistry insertion order across concept, stage, and type queries", () => {
    const activityC = createActivity("activity.c", {
      conceptIds: ["concept.shared"],
      stage: LearningStage.INDEPENDENT,
      type: LearningActivityType.RECALL_CODE,
    });
    const activityA = createActivity("activity.a", {
      conceptIds: ["concept.shared"],
      stage: LearningStage.INDEPENDENT,
      type: LearningActivityType.RECALL_CODE,
    });
    const activityB = createActivity("activity.b", {
      conceptIds: ["concept.shared"],
      stage: LearningStage.INDEPENDENT,
      type: LearningActivityType.RECALL_CODE,
    });
    const { activityRegistry } = buildFromActivities([
      activityC,
      activityA,
      activityB,
    ]);

    expect(
      activityRegistry.getActivitiesByConcept(activityC.conceptIds[0]!),
    ).toEqual([activityC, activityA, activityB]);
    expect(
      activityRegistry.getActivitiesByStage(LearningStage.INDEPENDENT),
    ).toEqual([activityC, activityA, activityB]);
    expect(
      activityRegistry.getActivitiesByType(LearningActivityType.RECALL_CODE),
    ).toEqual([activityC, activityA, activityB]);
  });

  it("returns caller-owned arrays from multi-result queries", () => {
    const activityA = createActivity("activity.a", {
      conceptIds: ["concept.shared"],
      stage: LearningStage.REVIEW,
      type: LearningActivityType.EXPLAIN_SHAPE,
    });
    const activityB = createActivity("activity.b", {
      conceptIds: ["concept.shared"],
      stage: LearningStage.REVIEW,
      type: LearningActivityType.EXPLAIN_SHAPE,
    });
    const { activityRegistry } = buildFromActivities([activityA, activityB]);

    const conceptResult = activityRegistry.getActivitiesByConcept(
      activityA.conceptIds[0]!,
    );
    const stageResult = activityRegistry.getActivitiesByStage(
      LearningStage.REVIEW,
    );
    const typeResult = activityRegistry.getActivitiesByType(
      LearningActivityType.EXPLAIN_SHAPE,
    );

    (conceptResult as LearningActivity[]).reverse();
    (stageResult as LearningActivity[]).pop();
    (typeResult as LearningActivity[]).splice(0);

    expect(
      activityRegistry.getActivitiesByConcept(activityA.conceptIds[0]!),
    ).toEqual([activityA, activityB]);
    expect(
      activityRegistry.getActivitiesByStage(LearningStage.REVIEW),
    ).toEqual([activityA, activityB]);
    expect(
      activityRegistry.getActivitiesByType(
        LearningActivityType.EXPLAIN_SHAPE,
      ),
    ).toEqual([activityA, activityB]);
  });

  it("captures snapshot semantics and requires rebuilding after canonical content changes", () => {
    const activityA = createActivity("activity.a", {
      conceptIds: ["concept.shared"],
    });
    const activityB = createActivity("activity.b", {
      conceptIds: ["concept.shared"],
    });
    const activityC = createActivity("activity.c", {
      conceptIds: ["concept.shared"],
    });
    const contentRegistry = new ContentRegistry();
    contentRegistry.registerActivity(activityA);
    contentRegistry.registerActivity(activityB);

    const firstSnapshot = buildActivityRegistry(contentRegistry);
    contentRegistry.registerActivity(activityC);
    const secondSnapshot = buildActivityRegistry(contentRegistry);

    expect(firstSnapshot.getActivity(activityC.id)).toBeUndefined();
    expect(
      firstSnapshot.getActivitiesByConcept(activityA.conceptIds[0]!),
    ).toEqual([activityA, activityB]);
    expect(secondSnapshot.getActivity(activityC.id)).toBe(activityC);
    expect(
      secondSnapshot.getActivitiesByConcept(activityA.conceptIds[0]!),
    ).toEqual([activityA, activityB, activityC]);
  });

  it("provides no independent activity registration mutation path", () => {
    const registry = buildActivityRegistry(new ContentRegistry());

    expect("registerActivity" in registry).toBe(false);
  });

  it("requires only LearningActivities in ContentRegistry and no presentation hierarchy or ConceptGraph", () => {
    const activity = createActivity("activity.standalone", {
      conceptIds: ["concept.unregistered"],
    });
    const contentRegistry = new ContentRegistry();
    contentRegistry.registerActivity(activity);

    const activityRegistry = buildActivityRegistry(contentRegistry);

    expect(activityRegistry.getActivity(activity.id)).toBe(activity);
    expect(
      activityRegistry.getActivitiesByConcept(activity.conceptIds[0]!),
    ).toEqual([activity]);
  });
});
