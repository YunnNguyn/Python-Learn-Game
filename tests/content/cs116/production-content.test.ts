import { describe, expect, it } from "vitest";

import {
  CS116_PRODUCTION_CONTENT,
  CS116_PRODUCTION_HINT_SETS,
  CS116_PRODUCTION_IDS,
  CS116_PRODUCTION_TEMPLATE_VS01,
  getCs116MissionInstanceValidator,
  registerCs116Generators,
} from "../../../src/content/cs116";
import { validateContent } from "../../../src/core/content";
import { Difficulty, MasteryState } from "../../../src/core/domain";
import { GeneratorRegistry } from "../../../src/core/generators";
import { selectReviewRecommendations } from "../../../src/core/learning";
import {
  GraderRegistry,
  registerCoreGraders,
  resolveDeclarativeGraderConfig,
} from "../../../src/core/grading";
import { generateMissionInstance } from "../../../src/core/missions";
import { CORE_RUNTIME_ID } from "../../../src/core/runtime";

describe("Phase D production CS116 vertical slice", () => {
  it("validates the complete course/world/three-lesson/seven-activity graph", () => {
    const generators = new GeneratorRegistry();
    const graders = new GraderRegistry();
    registerCs116Generators(generators);
    registerCoreGraders(graders);

    const result = validateContent(CS116_PRODUCTION_CONTENT, {
      extensionCapabilities: {
        generatorIds: generators.getGeneratorIds(),
        graderIds: graders.getGraderIds(),
        runtimeIds: [CORE_RUNTIME_ID.PYODIDE, CORE_RUNTIME_ID.LOCAL_PYTHON],
        hintSetIds: CS116_PRODUCTION_HINT_SETS.map((hintSet) => hintSet.id),
      },
      schemaSupport: { supportedSchemaVersions: [1] },
    });

    expect(result).toEqual({ valid: true, issues: [] });
    expect(CS116_PRODUCTION_CONTENT.lessons).toHaveLength(4);
    expect(CS116_PRODUCTION_CONTENT.activities).toHaveLength(8);
    expect(CS116_PRODUCTION_CONTENT.missionTemplates).toHaveLength(8);
    expect(CS116_PRODUCTION_CONTENT.worlds[0]!.lessonIds).toEqual([
      CS116_PRODUCTION_IDS.lessonArrayCore,
      CS116_PRODUCTION_IDS.lessonIndexFilter,
      CS116_PRODUCTION_IDS.lessonTransferReview,
      CS116_PRODUCTION_IDS.lessonLocalRuntime,
    ]);
  });

  it("gives every production mission a progressive H1 through H4 hint set", () => {
    expect(CS116_PRODUCTION_HINT_SETS).toHaveLength(7);

    for (const template of CS116_PRODUCTION_CONTENT.missionTemplates) {
      const hintSet = CS116_PRODUCTION_HINT_SETS.find(
        (candidate) => candidate.id === template.hintSetId,
      );
      expect(hintSet?.hints.map((hint) => hint.level)).toEqual([
        "H1",
        "H2",
        "H3",
        "H4",
      ]);
    }
  });

  it("keeps the seven vertical-slice missions on Pyodide and the bridge mission on Local Python", () => {
    const verticalSliceTemplates = CS116_PRODUCTION_CONTENT.missionTemplates.slice(0, 7);
    for (const template of verticalSliceTemplates) {
      expect(template.runtime.id).toBe(CORE_RUNTIME_ID.PYODIDE);
      expect(template.runtime.config).toEqual({ packages: ["numpy"] });
    }

    const localTemplate = CS116_PRODUCTION_CONTENT.missionTemplates[7]!;
    expect(localTemplate.id).toBe(CS116_PRODUCTION_IDS.templateLc01);
    expect(localTemplate.runtime.id).toBe(CORE_RUNTIME_ID.LOCAL_PYTHON);
    expect(localTemplate.runtime.config).toEqual({ executionTimeoutSeconds: 60 });

    expect(CS116_PRODUCTION_TEMPLATE_VS01.runtime.config).toEqual({
      packages: ["numpy"],
    });
  });

  it("generates a valid deterministic instance and resolves hidden grader data for VS-01 through VS-07", () => {
    const generators = new GeneratorRegistry();
    registerCs116Generators(generators);

    for (const template of CS116_PRODUCTION_CONTENT.missionTemplates) {
      const input = {
        template,
        generatorRegistry: generators,
        baseSeed: `phase-d:${template.id}`,
        difficulty: Difficulty.EASY,
        validator: getCs116MissionInstanceValidator(template.generator.id),
      } as const;
      const first = generateMissionInstance(input);
      const second = generateMissionInstance(input);

      expect(second).toEqual(first);
      expect(first.instance.templateId).toBe(template.id);
      expect(first.instance.conceptIds).toEqual(template.conceptIds);
      expect(() =>
        resolveDeclarativeGraderConfig(
          template.grader.config ?? { checks: [] },
          first.instance.grading?.data,
        ),
      ).not.toThrow();
    }
  });


  it("lets the review selector route any practiced slice concept to VS-07", () => {
    const progressByConcept = new Map(
      CS116_PRODUCTION_CONTENT.concepts.map((concept) => [
        concept.id,
        {
          conceptId: concept.id,
          mastery: MasteryState.PRACTICING,
          attemptCount: 1,
          successfulAttemptCount: 0,
          lastAttemptAt: "2026-10-03T12:00:00+00:00",
        },
      ]),
    );
    const latestAttemptPassedByConcept = new Map(
      CS116_PRODUCTION_CONTENT.concepts.map((concept) => [concept.id, false]),
    );

    const recommendations = selectReviewRecommendations({
      concepts: CS116_PRODUCTION_CONTENT.concepts,
      activities: CS116_PRODUCTION_CONTENT.activities,
      progressByConcept,
      latestAttemptPassedByConcept,
      now: new Date("2026-10-03T13:00:00+00:00"),
    });

    expect(recommendations).toHaveLength(7);
    expect(
      recommendations.every(
        (recommendation) =>
          recommendation.activityId === CS116_PRODUCTION_IDS.activityVs07,
      ),
    ).toBe(true);
  });

  it("keeps the canonical stage progression guided → independent → transfer → review", () => {
    expect(CS116_PRODUCTION_CONTENT.activities.map((activity) => activity.stage)).toEqual([
      "GUIDED",
      "INDEPENDENT",
      "INDEPENDENT",
      "GUIDED",
      "INDEPENDENT",
      "TRANSFER",
      "REVIEW",
      "TRANSFER",
    ]);
  });
});
