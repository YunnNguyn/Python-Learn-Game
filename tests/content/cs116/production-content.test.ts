import { describe, expect, it } from "vitest";

import {
  CS116_PRODUCTION_CONTENT,
  CS116_PRODUCTION_HINT_SETS,
  CS116_PRODUCTION_IDS,
  CS116_PRODUCTION_TEMPLATE_LC02,
  CS116_PRODUCTION_TEMPLATE_LC03,
  CS116_PRODUCTION_TEMPLATE_LC04,
  CS116_PRODUCTION_TEMPLATE_LC05,
  CS116_PRODUCTION_TEMPLATE_LC06,
  CS116_PRODUCTION_TEMPLATE_LC07,
  CS116_PRODUCTION_TEMPLATE_LC08,
  CS116_PRODUCTION_TEMPLATE_LC09,
  CS116_PRODUCTION_TEMPLATE_LC10,
  CS116_PRODUCTION_TEMPLATE_LC11,
  CS116_PRODUCTION_TEMPLATE_LC12,
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
  it("validates the complete NumPy + F4 pandas/Matplotlib production graph", () => {
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
    expect(CS116_PRODUCTION_CONTENT.worlds).toHaveLength(3);
    expect(CS116_PRODUCTION_CONTENT.lessons).toHaveLength(13);
    expect(CS116_PRODUCTION_CONTENT.activities).toHaveLength(23);
    expect(CS116_PRODUCTION_CONTENT.missionTemplates).toHaveLength(23);
    expect(CS116_PRODUCTION_CONTENT.worlds[0]!.lessonIds).toEqual([
      CS116_PRODUCTION_IDS.lessonArrayCore,
      CS116_PRODUCTION_IDS.lessonIndexFilter,
      CS116_PRODUCTION_IDS.lessonTransferReview,
      CS116_PRODUCTION_IDS.lessonLocalRuntime,
    ]);
    expect(CS116_PRODUCTION_CONTENT.worlds[1]!.lessonIds).toEqual([
      CS116_PRODUCTION_IDS.lessonPandasCore,
      CS116_PRODUCTION_IDS.lessonPandasQuality,
      CS116_PRODUCTION_IDS.lessonMatplotlibCore,
      CS116_PRODUCTION_IDS.lessonPandasCombine,
      CS116_PRODUCTION_IDS.lessonImageArrays,
      CS116_PRODUCTION_IDS.lessonFeatureBasics,
    ]);
    expect(CS116_PRODUCTION_CONTENT.worlds[2]!.lessonIds).toEqual([
      CS116_PRODUCTION_IDS.lessonMlPipeline,
      CS116_PRODUCTION_IDS.lessonMlValidation,
      CS116_PRODUCTION_IDS.lessonMlDiagnostics,
    ]);
  });

  it("gives every production mission a progressive H1 through H4 hint set", () => {
    expect(CS116_PRODUCTION_HINT_SETS).toHaveLength(22);

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

  it("keeps VS-01..VS-07 on Pyodide and all LC missions on Local Python", () => {
    const verticalSliceTemplates = CS116_PRODUCTION_CONTENT.missionTemplates.slice(0, 7);
    for (const template of verticalSliceTemplates) {
      expect(template.runtime.id).toBe(CORE_RUNTIME_ID.PYODIDE);
      expect(template.runtime.config).toEqual({ packages: ["numpy"] });
    }

    const [lc01, lc02, lc03, lc04, lc05, lc06, lc07, lc08, lc09, lc10, lc11, lc12] =
      CS116_PRODUCTION_CONTENT.missionTemplates.slice(7);
    expect(lc01!.id).toBe(CS116_PRODUCTION_IDS.templateLc01);
    // World 2 (LC-01..12) runs on Pyodide so the whole course is hostable as a
    // static site; packages load in-browser and datasets stage into the FS.
    expect(lc01!.runtime.id).toBe(CORE_RUNTIME_ID.PYODIDE);
    expect(lc01!.runtime.config).toEqual({ packages: ["numpy"] });
    expect(lc02!.id).toBe(CS116_PRODUCTION_IDS.templateLc02);
    // LC-02 pivoted to Pyodide (pandas in-browser) so the app can be hosted as
    // a static site. Datasets stage into the Pyodide FS via workspace.datasets.
    expect(lc02!.runtime.id).toBe(CORE_RUNTIME_ID.PYODIDE);
    expect(lc02!.runtime.config).toMatchObject({
      packages: ["pandas"],
      workspace: {
        datasets: [
          {
            filename: "telemetry.csv",
            description: "Dữ liệu telemetry nhỏ cho bài đọc CSV.",
          },
        ],
      },
    });
    expect(CS116_PRODUCTION_TEMPLATE_LC02.starterCode).toContain(
      'pd.read_csv("data/telemetry.csv")',
    );
    expect(lc03!.id).toBe(CS116_PRODUCTION_IDS.templateLc03);
    expect(lc03!.runtime.id).toBe(CORE_RUNTIME_ID.PYODIDE);
    expect(lc04!.id).toBe(CS116_PRODUCTION_IDS.templateLc04);
    expect(lc04!.runtime.id).toBe(CORE_RUNTIME_ID.PYODIDE);
    expect(CS116_PRODUCTION_TEMPLATE_LC03.starterCode).toContain("distance_series");
    expect(CS116_PRODUCTION_TEMPLATE_LC04.starterCode).toContain("filtered_ids");
    expect(lc05!.id).toBe(CS116_PRODUCTION_IDS.templateLc05);
    expect(lc06!.id).toBe(CS116_PRODUCTION_IDS.templateLc06);
    expect(lc07!.id).toBe(CS116_PRODUCTION_IDS.templateLc07);
    expect(lc08!.id).toBe(CS116_PRODUCTION_IDS.templateLc08);
    expect(lc09!.id).toBe(CS116_PRODUCTION_IDS.templateLc09);
    expect(lc10!.id).toBe(CS116_PRODUCTION_IDS.templateLc10);
    expect(lc11!.id).toBe(CS116_PRODUCTION_IDS.templateLc11);
    expect(lc12!.id).toBe(CS116_PRODUCTION_IDS.templateLc12);
    for (const localTemplate of [lc05, lc06, lc07, lc08, lc09, lc10, lc11, lc12]) {
      expect(localTemplate!.runtime.id).toBe(CORE_RUNTIME_ID.PYODIDE);
      expect(localTemplate!.runtime.config).toMatchObject({
        packages: expect.any(Array),
        workspace: { datasets: expect.any(Array) },
      });
    }
    expect(CS116_PRODUCTION_TEMPLATE_LC05.starterCode).toContain("clean_signal");
    expect(CS116_PRODUCTION_TEMPLATE_LC06.starterCode).toContain("grouped");
    expect(CS116_PRODUCTION_TEMPLATE_LC07.starterCode).toContain("pivot");
    expect(CS116_PRODUCTION_TEMPLATE_LC08.starterCode).toContain("loss_curve.png");
    expect(CS116_PRODUCTION_TEMPLATE_LC09.starterCode).toContain("threat_scatter.png");
    expect(CS116_PRODUCTION_TEMPLATE_LC10.starterCode).toContain("merged");
    expect(CS116_PRODUCTION_TEMPLATE_LC11.starterCode).toContain("pixels.ppm");
    expect(CS116_PRODUCTION_TEMPLATE_LC12.starterCode).toContain("resized.png");

    expect(CS116_PRODUCTION_TEMPLATE_VS01.runtime.config).toEqual({
      packages: ["numpy"],
    });
  });

  it("generates valid deterministic instances and resolves hidden grader data for every production mission", () => {
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
      CS116_PRODUCTION_CONTENT.concepts.slice(0, 7).map((concept) => [
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
      CS116_PRODUCTION_CONTENT.concepts.slice(0, 7).map((concept) => [concept.id, false]),
    );

    const recommendations = selectReviewRecommendations({
      concepts: CS116_PRODUCTION_CONTENT.concepts.slice(0, 7),
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
      "TRANSFER",
      "GUIDED",
      "INDEPENDENT",
      "GUIDED",
      "INDEPENDENT",
      "TRANSFER",
      "GUIDED",
      "INDEPENDENT",
      "TRANSFER",
      "GUIDED",
      "INDEPENDENT",
      "GUIDED",
      "GUIDED",
      "INDEPENDENT",
      "TRANSFER",
    ]);
  });
});
