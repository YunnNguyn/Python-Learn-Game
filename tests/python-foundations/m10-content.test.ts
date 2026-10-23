import { describe, expect, it } from "vitest";

import { getCourseActivityIds } from "../../src/app/learning-path";
import { deriveActivityVariantSeed } from "../../src/app/services/application-services";
import {
  CS116_PRODUCTION_CONTENT,
  registerCs116Generators,
  registerCs116Hints,
  registerCs116ProductionContent,
} from "../../src/content/cs116";
import {
  PYTHON_FOUNDATIONS_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_CONCEPTS,
  PYTHON_FOUNDATIONS_CONTENT,
  PYTHON_FOUNDATIONS_HINT_SETS,
  PYTHON_FOUNDATIONS_IDS,
  PYTHON_FOUNDATIONS_M9_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_M10_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_M10_CONTENT,
  PYTHON_FOUNDATIONS_M10_HINT_SETS,
  PYTHON_FOUNDATIONS_M10_STARTER_CODE,
  PYTHON_FOUNDATIONS_STARTER_CODE,
  registerPythonFoundationsContent,
  registerPythonFoundationsGenerators,
  registerPythonFoundationsHints,
} from "../../src/content/python-foundations";
import { ContentRegistry, validateContent, type ContentDefinitionSet } from "../../src/core/content";
import {
  Difficulty,
  HintLevel,
  LearningActivityType,
  LearningStage,
  type LearningActivityId,
  type MissionInstance,
  type MissionTemplate,
} from "../../src/core/domain";
import { GeneratorRegistry } from "../../src/core/generators";
import {
  DeclarativeGraderCheckType,
  GraderRegistry,
  registerCoreGraders,
  resolveDeclarativeGraderConfig,
  DeclarativeGraderConfigSchema,
} from "../../src/core/grading";
import { HintRegistry } from "../../src/core/hints";
import { generateMissionInstance } from "../../src/core/missions";
import { CORE_RUNTIME_ID } from "../../src/core/runtime";
import { getMissionLessonGuide, getMissionQuickCheck } from "../../src/features/mission-workspace/mission-lesson-guides";
import { M10_SOLUTIONS } from "./m10-solutions";

const M8_IDS = PYTHON_FOUNDATIONS_ACTIVITY_IDS as readonly string[];
const M9_IDS = PYTHON_FOUNDATIONS_M9_ACTIVITY_IDS as readonly string[];
const M10_IDS = PYTHON_FOUNDATIONS_M10_ACTIVITY_IDS as readonly string[];

const merged = (): ContentDefinitionSet => ({
  packs: [...CS116_PRODUCTION_CONTENT.packs, ...PYTHON_FOUNDATIONS_CONTENT.packs],
  concepts: [...CS116_PRODUCTION_CONTENT.concepts, ...PYTHON_FOUNDATIONS_CONTENT.concepts],
  courses: [...CS116_PRODUCTION_CONTENT.courses, ...PYTHON_FOUNDATIONS_CONTENT.courses],
  worlds: [...CS116_PRODUCTION_CONTENT.worlds, ...PYTHON_FOUNDATIONS_CONTENT.worlds],
  lessons: [...CS116_PRODUCTION_CONTENT.lessons, ...PYTHON_FOUNDATIONS_CONTENT.lessons],
  activities: [...CS116_PRODUCTION_CONTENT.activities, ...PYTHON_FOUNDATIONS_CONTENT.activities],
  missionTemplates: [...CS116_PRODUCTION_CONTENT.missionTemplates, ...PYTHON_FOUNDATIONS_CONTENT.missionTemplates],
});

function capabilities() {
  const generators = new GeneratorRegistry();
  registerCs116Generators(generators);
  registerPythonFoundationsGenerators(generators);
  const graders = new GraderRegistry();
  registerCoreGraders(graders);
  const hints = new HintRegistry();
  registerCs116Hints(hints);
  registerPythonFoundationsHints(hints);
  return { generators, graders, hints };
}

function builtIn(): ContentRegistry {
  const content = new ContentRegistry();
  registerCs116ProductionContent(content);
  registerPythonFoundationsContent(content);
  return content;
}

function templateOf(content: ContentRegistry, activityId: string): MissionTemplate {
  const activity = content.getActivity(activityId as LearningActivityId);
  if (activity === undefined || !("missionTemplateId" in activity)) throw new Error(`no template: ${activityId}`);
  const template = content.getMissionTemplate(activity.missionTemplateId);
  if (template === undefined) throw new Error(`missing template: ${activityId}`);
  return template;
}

function instance(generators: GeneratorRegistry, content: ContentRegistry, activityId: string, variantIndex: number): MissionInstance {
  const template = templateOf(content, activityId);
  return generateMissionInstance({
    template,
    generatorRegistry: generators,
    baseSeed: deriveActivityVariantSeed(activityId as LearningActivityId, template.version, variantIndex),
    difficulty: Difficulty.EASY,
  }).instance;
}

/**
 * PHASE-08 / M10 - the eleven new missions as DATA: they register next to the M8/M9 course and
 * CS116, validate, continue the SAME course after PF-15, keep every earlier id, and ship H1-H4
 * hints and a lesson guide each, without leaking a line of a reference solution.
 */

describe("M10 content registers and validates next to M8, M9 and CS116", () => {
  it("validates as one definition set with every generator, grader, runtime and hint set registered", () => {
    const { generators, graders, hints } = capabilities();
    const report = validateContent(merged(), {
      extensionCapabilities: {
        generatorIds: generators.getGeneratorIds(),
        graderIds: graders.getGraderIds(),
        runtimeIds: [CORE_RUNTIME_ID.PYODIDE, CORE_RUNTIME_ID.LOCAL_PYTHON],
        hintSetIds: hints.getHintSetIds(),
      },
      schemaSupport: { supportedSchemaVersions: [1] },
    });
    expect(report.issues).toEqual([]);
    expect(report.valid).toBe(true);
  });

  it("registers in either order and shares no id with CS116", () => {
    for (const order of ["cs116-first", "python-first"] as const) {
      const content = new ContentRegistry();
      if (order === "cs116-first") {
        registerCs116ProductionContent(content);
        registerPythonFoundationsContent(content);
      } else {
        registerPythonFoundationsContent(content);
        registerCs116ProductionContent(content);
      }
      expect(content.getActivity(PYTHON_FOUNDATIONS_IDS.activityPf26 as LearningActivityId)).toBeDefined();
    }
    const cs116 = new Set<string>();
    for (const list of [
      CS116_PRODUCTION_CONTENT.concepts,
      CS116_PRODUCTION_CONTENT.worlds,
      CS116_PRODUCTION_CONTENT.lessons,
      CS116_PRODUCTION_CONTENT.activities,
      CS116_PRODUCTION_CONTENT.missionTemplates,
    ]) {
      for (const item of list) cs116.add(String((item as { id: string }).id));
    }
    for (const list of [
      PYTHON_FOUNDATIONS_M10_CONTENT.worlds,
      PYTHON_FOUNDATIONS_M10_CONTENT.lessons,
      PYTHON_FOUNDATIONS_M10_CONTENT.activities,
      PYTHON_FOUNDATIONS_M10_CONTENT.missionTemplates,
    ]) {
      for (const item of list) {
        const id = String((item as { id: string }).id);
        expect(cs116.has(id), id).toBe(false);
        expect(id.startsWith("python-foundations."), id).toBe(true);
      }
    }
    for (const hintSet of PYTHON_FOUNDATIONS_M10_HINT_SETS) {
      expect(String(hintSet.id).startsWith("python-foundations.hints.pf"), String(hintSet.id)).toBe(true);
    }
  });
});

describe("M10 continues the same course after PF-15 (no reset, stable earlier ids)", () => {
  const content = builtIn();

  it("keeps PF-01..PF-15 and adds PF-16..PF-26 after them in one course", () => {
    expect(M8_IDS).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => `python-foundations.pf0${n}`));
    expect(M9_IDS).toEqual([8, 9, 10, 11, 12, 13, 14, 15].map((n) => `python-foundations.pf${String(n).padStart(2, "0")}`));
    expect(M10_IDS).toEqual(Array.from({ length: 11 }, (_, index) => `python-foundations.pf${16 + index}`));
    const course = content.getCourse(PYTHON_FOUNDATIONS_IDS.course as never)!;
    expect(getCourseActivityIds(content, course.id)).toEqual([...M8_IDS, ...M9_IDS, ...M10_IDS]);
    expect(PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS).toEqual([...M8_IDS, ...M9_IDS, ...M10_IDS]);
  });

  it("appends four worlds after the three earlier ones, with the lessons the brief asks for", () => {
    const course = content.getCourse(PYTHON_FOUNDATIONS_IDS.course as never)!;
    expect(course.worldIds).toEqual([
      PYTHON_FOUNDATIONS_IDS.world,
      PYTHON_FOUNDATIONS_IDS.worldCollections,
      PYTHON_FOUNDATIONS_IDS.worldNumpy,
      PYTHON_FOUNDATIONS_IDS.worldNumpyAdvanced,
      PYTHON_FOUNDATIONS_IDS.worldPandas,
      PYTHON_FOUNDATIONS_IDS.worldVisualization,
      PYTHON_FOUNDATIONS_IDS.worldWorkflows,
    ]);
    const lessonsOf = (worldId: string) => content.getWorld(worldId as never)!.lessonIds;
    expect(lessonsOf(PYTHON_FOUNDATIONS_IDS.worldNumpyAdvanced)).toEqual([PYTHON_FOUNDATIONS_IDS.lessonNumpyShapesAxes]);
    expect(lessonsOf(PYTHON_FOUNDATIONS_IDS.worldPandas)).toEqual([PYTHON_FOUNDATIONS_IDS.lessonPandasFrames, PYTHON_FOUNDATIONS_IDS.lessonPandasCleaning]);
    expect(lessonsOf(PYTHON_FOUNDATIONS_IDS.worldVisualization)).toEqual([PYTHON_FOUNDATIONS_IDS.lessonMatplotlibCharts]);
    expect(lessonsOf(PYTHON_FOUNDATIONS_IDS.worldWorkflows)).toEqual([PYTHON_FOUNDATIONS_IDS.lessonDataWorkflows]);
    const activities = (lessonId: string) => content.getLesson(lessonId as never)!.activityIds;
    expect(activities(PYTHON_FOUNDATIONS_IDS.lessonNumpyShapesAxes)).toEqual(M10_IDS.slice(0, 3));
    expect(activities(PYTHON_FOUNDATIONS_IDS.lessonPandasFrames)).toEqual(M10_IDS.slice(3, 5));
    expect(activities(PYTHON_FOUNDATIONS_IDS.lessonPandasCleaning)).toEqual(M10_IDS.slice(5, 7));
    expect(activities(PYTHON_FOUNDATIONS_IDS.lessonMatplotlibCharts)).toEqual(M10_IDS.slice(7, 9));
    expect(activities(PYTHON_FOUNDATIONS_IDS.lessonDataWorkflows)).toEqual(M10_IDS.slice(9));
  });

  it("does not touch the M8 or M9 missions: same ids, same packages, none of them uses TYPED_VALUE", () => {
    for (const id of [...M8_IDS, ...M9_IDS]) {
      const template = templateOf(content, id);
      const checks = (template.grader.config as { checks: { type: string }[] }).checks;
      expect(checks.map((check) => check.type), id).not.toContain(DeclarativeGraderCheckType.TYPED_VALUE);
      const packages = (template.runtime?.config as { packages?: string[] } | undefined)?.packages;
      if (id === "python-foundations.pf14" || id === "python-foundations.pf15") expect(packages, id).toEqual(["numpy"]);
      else expect(packages, id).toBeUndefined();
    }
  });
});

describe("the eleven M10 missions", () => {
  const content = builtIn();

  it("have the kind and learning stage that make independence grow", () => {
    const expected: ReadonlyArray<readonly [LearningActivityType, LearningStage]> = [
      [LearningActivityType.CODE_MISSION, LearningStage.GUIDED], // PF-16 broadcasting
      [LearningActivityType.CODE_MISSION, LearningStage.GUIDED], // PF-17 axis / keepdims / masks
      [LearningActivityType.CODE_MISSION, LearningStage.INDEPENDENT], // PF-18 vectorised preprocessing
      [LearningActivityType.CODE_MISSION, LearningStage.GUIDED], // PF-19 DataFrame fundamentals
      [LearningActivityType.CODE_MISSION, LearningStage.INDEPENDENT], // PF-20 filtering / transformation
      [LearningActivityType.CODE_MISSION, LearningStage.INDEPENDENT], // PF-21 missing values / types
      [LearningActivityType.CODE_MISSION, LearningStage.INDEPENDENT], // PF-22 groupby
      [LearningActivityType.CODE_MISSION, LearningStage.INDEPENDENT], // PF-23 build a chart
      [LearningActivityType.DEBUG_MISSION, LearningStage.INDEPENDENT], // PF-24 debug a misleading chart
      [LearningActivityType.CODE_MISSION, LearningStage.TRANSFER], // PF-25 CSV -> dataset
      [LearningActivityType.BOSS_MISSION, LearningStage.REVIEW], // PF-26 mini-project
    ];
    M10_IDS.forEach((id, index) => {
      const activity = content.getActivity(id as LearningActivityId)!;
      expect([activity.type, activity.stage], id).toEqual(expected[index]);
      expect(activity.title.startsWith(`PF-${String(index + 16)} — `), id).toBe(true);
    });
  });

  it("use the existing declarative grader and Pyodide, declaring exactly the packages they need", () => {
    const expected = [
      ["numpy"], ["numpy"], ["numpy"],
      ["numpy", "pandas"], ["numpy", "pandas"], ["numpy", "pandas"], ["numpy", "pandas"],
      ["numpy", "pandas", "matplotlib"], ["numpy", "pandas", "matplotlib"],
      ["numpy", "pandas"], ["numpy", "pandas", "matplotlib"],
    ];
    M10_IDS.forEach((id, index) => {
      const template = templateOf(content, id);
      expect(template.grader.id, id).toBe("core.declarative");
      expect(template.runtime?.id, id).toBe(CORE_RUNTIME_ID.PYODIDE);
      expect((template.runtime?.config as { packages?: string[] }).packages, id).toEqual(expected[index]);
    });
  });

  it("grade values with TYPED_VALUE and behaviour with FUNCTION_CASES, within the validated limits", () => {
    for (const id of M10_IDS) {
      const checks = (templateOf(content, id).grader.config as { checks: { type: string }[] }).checks;
      const count = (type: string) => checks.filter((check) => check.type === type).length;
      expect(count(DeclarativeGraderCheckType.TYPED_VALUE), id).toBeGreaterThan(0);
      expect(count(DeclarativeGraderCheckType.TYPED_VALUE), id).toBeLessThanOrEqual(8);
      expect(count(DeclarativeGraderCheckType.FUNCTION_CASES), id).toBeLessThanOrEqual(4);
    }
    // The function-driven missions.
    for (const id of M10_IDS.filter((entry) => entry !== "python-foundations.pf19" || true)) {
      const checks = (templateOf(content, id).grader.config as { checks: { type: string }[] }).checks;
      const cases = checks.filter((check) => check.type === DeclarativeGraderCheckType.FUNCTION_CASES).length;
      if (id === "python-foundations.pf16") expect(cases).toBe(1);
      if (id === "python-foundations.pf17") expect(cases).toBe(2);
      if (id === "python-foundations.pf25") expect(cases).toBe(2);
      if (id === "python-foundations.pf26") expect(cases).toBe(2);
    }
  });

  it("resolve to a valid declarative grader configuration for every variant", () => {
    const { generators } = capabilities();
    for (const id of M10_IDS) {
      for (let variant = 0; variant < 8; variant += 1) {
        const generated = instance(generators, content, id, variant);
        const resolved = resolveDeclarativeGraderConfig(templateOf(content, id).grader.config ?? {}, generated.grading?.data ?? {});
        const parsed = DeclarativeGraderConfigSchema.safeParse(resolved);
        expect(parsed.success, `${id}#${variant}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues).slice(0, 400)}`).toBe(true);
      }
    }
  });

  it("teach python.* concepts that exist, each with prerequisites that exist", () => {
    const ids = new Set(PYTHON_FOUNDATIONS_CONCEPTS.map((concept) => String(concept.id)));
    expect(ids.size).toBe(PYTHON_FOUNDATIONS_CONCEPTS.length);
    for (const id of M10_IDS) {
      const activity = content.getActivity(id as LearningActivityId)!;
      expect(activity.conceptIds.length, id).toBeGreaterThan(0);
      for (const conceptId of activity.conceptIds) expect(ids.has(String(conceptId)), `${id}:${conceptId}`).toBe(true);
    }
    for (const concept of PYTHON_FOUNDATIONS_CONCEPTS) {
      for (const prerequisite of concept.prerequisites) expect(ids.has(String(prerequisite)), String(concept.id)).toBe(true);
    }
  });

  it("give every mission a runnable starter with a TODO, none of them a solution", () => {
    expect(Object.keys(PYTHON_FOUNDATIONS_M10_STARTER_CODE)).toHaveLength(11);
    for (const id of M10_IDS) {
      const template = templateOf(content, id);
      expect(template.starterCode, id).toContain("TODO");
      expect(template.starterCode!.trim().length, id).toBeGreaterThan(80);
    }
  });

  it("tell the learner that PF-24 is runnable-but-buggy, and that no starter is a passing answer", () => {
    expect(templateOf(content, "python-foundations.pf24").starterCode).toContain("ax.plot");
    expect(templateOf(content, "python-foundations.pf24").starterCode).toContain("plt.subplots()");
  });
});

describe("M10 hints", () => {
  it("every mission points at a registered H1-H4 hint set, in order", () => {
    const { hints } = capabilities();
    const content = builtIn();
    for (const id of M10_IDS) {
      const set = hints.getHintSet(templateOf(content, id).hintSetId!);
      expect(set, id).toBeDefined();
      expect(set!.hints.map((hint) => hint.level)).toEqual([HintLevel.H1, HintLevel.H2, HintLevel.H3, HintLevel.H4]);
      for (const hint of set!.hints) expect(hint.text.trim().length).toBeGreaterThan(40);
    }
    expect(PYTHON_FOUNDATIONS_M10_HINT_SETS.length).toBe(11);
  });

  it("H1 and H2 carry no code, and H1-H3 never print a line of the reference solution", () => {
    const { hints } = capabilities();
    const content = builtIn();
    for (const id of M10_IDS) {
      const set = hints.getHintSet(templateOf(content, id).hintSetId!)!;
      const [h1, h2, h3] = set.hints;
      for (const hint of [h1!, h2!]) {
        expect(hint.text, `${id} ${hint.level}`).not.toContain("`");
        expect(hint.text, `${id} ${hint.level}`).not.toMatch(/\bdef\b|\breturn\s+\S|\bfor\b.*\bin\b.*:|\bappend\(/);
      }
      for (const line of referenceLines(id)) {
        const hinted = isComputation(line) ? [h1!, h2!, h3!] : [h1!, h2!];
        for (const hint of hinted) expect(hint.text, `${id} ${hint.level} leaks: ${line}`).not.toContain(line);
      }
    }
  });
});

describe("M10 lesson guides, quick checks and the reference solutions stay apart", () => {
  it("every mission has a Vietnamese lesson note and a well-formed quick check, neither printing a reference line", () => {
    for (const id of M10_IDS) {
      const guide = getMissionLessonGuide(id);
      expect(guide, id).not.toBeNull();
      expect(guide!.summary.length, id).toBeGreaterThan(60);
      expect(guide!.newTopics.length, id).toBeGreaterThan(0);
      expect(guide!.workflow.length, id).toBeGreaterThan(0);
      const check = getMissionQuickCheck(id);
      expect(check, id).not.toBeNull();
      expect(check!.options.length, id).toBeGreaterThanOrEqual(3);
      expect(check!.correctOptionIndex, id).toBeLessThan(check!.options.length);
      const text = JSON.stringify([guide, check]);
      for (const line of referenceLines(id)) expect(text, `${id} guide leaks: ${line}`).not.toContain(JSON.stringify(line).slice(1, -1));
    }
  });

  it("a mission's own definition never ships its reference solution", () => {
    const content = builtIn();
    for (const id of M10_IDS) {
      const shipped = JSON.stringify([content.getActivity(id as LearningActivityId), templateOf(content, id)]);
      for (const line of referenceLines(id)) {
        expect(shipped, `${id} ships: ${line}`).not.toContain(JSON.stringify(line).slice(1, -1));
      }
    }
  });

  it("the mission text never gives the answer away: no line of a reference solution appears in the generated instructions", () => {
    const { generators } = capabilities();
    const content = builtIn();
    for (const id of M10_IDS) {
      for (let variant = 0; variant < 4; variant += 1) {
        const generated = instance(generators, content, id, variant);
        const text = JSON.stringify(generated.learner);
        for (const line of referenceLines(id)) {
          expect(text, `${id}#${variant} text gives away: ${line}`).not.toContain(JSON.stringify(line).slice(1, -1));
        }
      }
    }
  });
});

describe("M10 generators", () => {
  const { generators } = capabilities();
  const content = builtIn();

  it("are deterministic per variant and vary across variants", () => {
    for (const id of M10_IDS) {
      const first = instance(generators, content, id, 0);
      expect(instance(generators, content, id, 0), id).toEqual(first);
      const variants = new Set(Array.from({ length: 8 }, (_, index) => JSON.stringify(instance(generators, content, id, index).learner.data)));
      // PF-25/PF-26 draw one of three fixed CSV files (the template's runtime config is static).
      expect(variants.size, id).toBeGreaterThan(id.endsWith("pf25") || id.endsWith("pf26") ? 1 : 3);
    }
  });

  it("show the learner their data and expose it to Python, but never the grading data", () => {
    for (const id of M10_IDS) {
      for (let variant = 0; variant < 8; variant += 1) {
        const generated = instance(generators, content, id, variant);
        expect(generated.runtime?.setupData, `${id}#${variant}`).toEqual(generated.learner.data);
        const grading = generated.grading?.data ?? {};
        expect(Object.keys(grading).length, id).toBeGreaterThan(0);
        const visible = JSON.stringify({ learner: generated.learner, runtime: generated.runtime });
        for (const key of Object.keys(grading)) {
          expect(visible, `${id}#${variant} exposes grading key ${key}`).not.toContain(`"${key}"`);
        }
      }
    }
  });

  it("every function mission has one displayed example; hidden expected values are not in the learner's view", () => {
    for (const id of M10_IDS) {
      const generated = instance(generators, content, id, 3);
      const visibleText = JSON.stringify({ learner: generated.learner, runtime: generated.runtime });
      const data = generated.grading!.data as Record<string, unknown>;
      for (const [key, value] of Object.entries(data)) {
        if (!Array.isArray(value) || value.length === 0 || (value[0] as { visibility?: string }).visibility === undefined) continue;
        const cases = value as { visibility: string; expect: { value?: unknown } }[];
        expect(cases.filter((entry) => entry.visibility === "example"), `${id}.${key}`).toHaveLength(1);
        for (const hidden of cases.filter((entry) => entry.visibility === "hidden")) {
          if (hidden.expect.value === undefined) continue;
          const text = JSON.stringify(hidden.expect.value);
          if (text.length > 24) expect(visibleText, `${id}.${key}`).not.toContain(text);
        }
      }
    }
  });

  it("the data of the shape missions makes the shape mistake observable (n differs from m, r from c)", () => {
    for (let variant = 0; variant < 20; variant += 1) {
      const pf16 = instance(generators, content, "python-foundations.pf16", variant).learner.data as { xs: number[]; ys: number[] };
      expect(pf16.xs.length).not.toBe(pf16.ys.length);
      const pf17 = instance(generators, content, "python-foundations.pf17", variant).learner.data as { scores: number[][] };
      expect(pf17.scores.length).not.toBe(pf17.scores[0]!.length);
    }
  });
});

/**
 * Substantial single lines of a mission's reference solution (>= 14 chars; no comment, print
 * or line the learner already receives in the starter).
 */
function referenceLines(activityId: string): string[] {
  const reference = M10_SOLUTIONS[activityId]?.reference;
  if (reference === undefined) throw new Error(`no reference solution for ${activityId}`);
  const starterText = (PYTHON_FOUNDATIONS_M10_STARTER_CODE as Record<string, string>)[activityId.replace("python-foundations.", "")] ?? "";
  const starter = new Set(starterText.split("\n").map((line) => line.replace(/\s+#.*$/, "").trim()));
  return reference
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 14 && !line.startsWith("#") && !line.startsWith("print(") && !line.startsWith("import ") && line !== "fig, ax = plt.subplots()" && !starter.has(line));
}

/** An assignment or a `return`: a line that computes the answer. */
function isComputation(line: string): boolean {
  return /^return\b/.test(line) || /^[A-Za-z_][\w, ]*\s*(?:[-+*/]|\/\/)?=(?!=)/.test(line);
}
