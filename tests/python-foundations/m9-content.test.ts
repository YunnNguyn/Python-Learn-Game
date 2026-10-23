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
  PYTHON_FOUNDATIONS_M9_CONTENT,
  PYTHON_FOUNDATIONS_M9_HINT_SETS,
  PYTHON_FOUNDATIONS_M9_STARTER_CODE,
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
import { M9_SOLUTIONS } from "./m9-solutions";

/**
 * PHASE-07 / M9 - the eight new missions as DATA: they register next to the M8 course and
 * CS116, validate, continue the SAME course after PF-07, keep every M8 id, and ship
 * H1-H4 hints and a lesson guide each, without leaking a reference solution line.
 */

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

describe("M9 content registers and validates next to M8 and CS116", () => {
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
      expect(content.getActivity(PYTHON_FOUNDATIONS_IDS.activityPf15 as LearningActivityId)).toBeDefined();
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
      PYTHON_FOUNDATIONS_M9_CONTENT.worlds,
      PYTHON_FOUNDATIONS_M9_CONTENT.lessons,
      PYTHON_FOUNDATIONS_M9_CONTENT.activities,
      PYTHON_FOUNDATIONS_M9_CONTENT.missionTemplates,
    ]) {
      for (const item of list) {
        const id = String((item as { id: string }).id);
        expect(cs116.has(id), id).toBe(false);
        expect(id.startsWith("python-foundations."), id).toBe(true);
      }
    }
    for (const hintSet of PYTHON_FOUNDATIONS_M9_HINT_SETS) {
      expect(String(hintSet.id).startsWith("python-foundations.hints.pf"), String(hintSet.id)).toBe(true);
    }
  });
});

describe("M9 continues the same course after PF-07 (no reset, stable M8 ids)", () => {
  const content = builtIn();

  it("keeps the seven M8 activity ids, and adds PF-08..PF-15 after them in one course", () => {
    expect(M8_IDS).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => `python-foundations.pf0${n}`));
    expect(M9_IDS).toEqual([8, 9, 10, 11, 12, 13, 14, 15].map((n) => `python-foundations.pf${String(n).padStart(2, "0")}`));
    // PHASE-08 / M10 appends PF-16..PF-26 after M9 without touching either earlier id list.
    expect(PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS).toEqual([...M8_IDS, ...M9_IDS, ...M10_IDS]);
    const course = content.getCourse(PYTHON_FOUNDATIONS_IDS.course as never)!;
    expect(course.id).toBe(PYTHON_FOUNDATIONS_IDS.course);
    expect(getCourseActivityIds(content, course.id)).toEqual([...M8_IDS, ...M9_IDS, ...M10_IDS]);
  });

  it("has the M8 world first and two new worlds after it, with the lessons the brief asks for", () => {
    const course = content.getCourse(PYTHON_FOUNDATIONS_IDS.course as never)!;
    // M10 appends four more worlds; the first three (M8 + M9) stay in place and in order.
    expect(course.worldIds.slice(0, 3)).toEqual([
      PYTHON_FOUNDATIONS_IDS.world,
      PYTHON_FOUNDATIONS_IDS.worldCollections,
      PYTHON_FOUNDATIONS_IDS.worldNumpy,
    ]);
    expect(content.getWorld(PYTHON_FOUNDATIONS_IDS.world as never)!.lessonIds).toEqual([
      PYTHON_FOUNDATIONS_IDS.lessonValuesDecisions,
      PYTHON_FOUNDATIONS_IDS.lessonCollectionsFunctions,
    ]);
    const collections = content.getWorld(PYTHON_FOUNDATIONS_IDS.worldCollections as never)!;
    const numpy = content.getWorld(PYTHON_FOUNDATIONS_IDS.worldNumpy as never)!;
    expect(collections.title).toBe("Collections & Intermediate Python");
    expect(numpy.title).toBe("Introduction to NumPy");
    expect(collections.lessonIds).toEqual([PYTHON_FOUNDATIONS_IDS.lessonSequencesRecords, PYTHON_FOUNDATIONS_IDS.lessonFunctionsProjects]);
    expect(numpy.lessonIds).toEqual([PYTHON_FOUNDATIONS_IDS.lessonNumpyArrays]);
    expect(content.getLesson(PYTHON_FOUNDATIONS_IDS.lessonSequencesRecords as never)!.activityIds).toEqual(M9_IDS.slice(0, 3));
    expect(content.getLesson(PYTHON_FOUNDATIONS_IDS.lessonFunctionsProjects as never)!.activityIds).toEqual(M9_IDS.slice(3, 6));
    expect(content.getLesson(PYTHON_FOUNDATIONS_IDS.lessonNumpyArrays as never)!.activityIds).toEqual(M9_IDS.slice(6));
  });

  it("does not touch the M8 missions: same stage and kind, and none of them uses FUNCTION_CASES or packages", () => {
    const expected: ReadonlyArray<readonly [LearningActivityType, LearningStage]> = [
      [LearningActivityType.CODE_MISSION, LearningStage.GUIDED],
      [LearningActivityType.CODE_MISSION, LearningStage.GUIDED],
      [LearningActivityType.DEBUG_MISSION, LearningStage.INDEPENDENT],
      [LearningActivityType.CODE_MISSION, LearningStage.GUIDED],
      [LearningActivityType.CODE_MISSION, LearningStage.INDEPENDENT],
      [LearningActivityType.CODE_MISSION, LearningStage.TRANSFER],
      [LearningActivityType.BOSS_MISSION, LearningStage.REVIEW],
    ];
    M8_IDS.forEach((id, index) => {
      const activity = content.getActivity(id as LearningActivityId)!;
      expect([activity.type, activity.stage], id).toEqual(expected[index]);
      const template = templateOf(content, id);
      const checks = (template.grader.config as { checks: { type: string }[] }).checks;
      expect(checks.map((check) => check.type), id).not.toContain(DeclarativeGraderCheckType.FUNCTION_CASES);
      expect(template.runtime?.config ?? {}, id).not.toHaveProperty("packages");
    });
  });
});

describe("the eight M9 missions", () => {
  const content = builtIn();

  it("have the kind and learning stage that make independence grow", () => {
    const expected: ReadonlyArray<readonly [LearningActivityType, LearningStage]> = [
      [LearningActivityType.CODE_MISSION, LearningStage.GUIDED], // PF-08 indexing / slicing
      [LearningActivityType.CODE_MISSION, LearningStage.GUIDED], // PF-09 dict / tuple / set
      [LearningActivityType.CODE_MISSION, LearningStage.INDEPENDENT], // PF-10 comprehensions
      [LearningActivityType.CODE_MISSION, LearningStage.INDEPENDENT], // PF-11 reusable functions
      [LearningActivityType.DEBUG_MISSION, LearningStage.INDEPENDENT], // PF-12 debug
      [LearningActivityType.BOSS_MISSION, LearningStage.REVIEW], // PF-13 mini-project
      [LearningActivityType.CODE_MISSION, LearningStage.GUIDED], // PF-14 NumPy basics
      [LearningActivityType.CODE_MISSION, LearningStage.TRANSFER], // PF-15 NumPy composition
    ];
    M9_IDS.forEach((id, index) => {
      const activity = content.getActivity(id as LearningActivityId)!;
      expect([activity.type, activity.stage], id).toEqual(expected[index]);
      expect(activity.title.startsWith(`PF-${String(index + 8).padStart(2, "0")} — `), id).toBe(true);
    });
  });

  it("use the existing declarative grader and Pyodide; only the two NumPy missions declare a package", () => {
    for (const id of M9_IDS) {
      const template = templateOf(content, id);
      expect(template.grader.id, id).toBe("core.declarative");
      expect(template.runtime?.id, id).toBe(CORE_RUNTIME_ID.PYODIDE);
    }
    M9_IDS.forEach((id, index) => {
      const packages = (templateOf(content, id).runtime?.config as { packages?: string[] } | undefined)?.packages;
      if (index >= 6) expect(packages, id).toEqual(["numpy"]);
      else expect(packages, id).toBeUndefined();
    });
  });

  it("grade behaviour with FUNCTION_CASES exactly where the brief says so, within the validated limits", () => {
    const withCases = new Map<string, number>();
    for (const id of M9_IDS) {
      const checks = (templateOf(content, id).grader.config as { checks: { type: string }[] }).checks;
      const count = checks.filter((check) => check.type === DeclarativeGraderCheckType.FUNCTION_CASES).length;
      if (count > 0) withCases.set(id, count);
    }
    expect([...withCases.keys()]).toEqual([
      "python-foundations.pf11",
      "python-foundations.pf12",
      "python-foundations.pf13",
      "python-foundations.pf14",
      "python-foundations.pf15",
    ]);
    expect(withCases.get("python-foundations.pf11")).toBe(2);
    expect(withCases.get("python-foundations.pf15")).toBe(3);
    for (const count of withCases.values()) expect(count).toBeLessThanOrEqual(4);
  });

  it("resolve to a valid declarative grader configuration for every variant", () => {
    const { generators } = capabilities();
    for (const id of M9_IDS) {
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
    for (const id of M9_IDS) {
      const activity = content.getActivity(id as LearningActivityId)!;
      expect(activity.conceptIds.length, id).toBeGreaterThan(0);
      for (const conceptId of activity.conceptIds) expect(ids.has(String(conceptId)), `${id}:${conceptId}`).toBe(true);
    }
    for (const concept of PYTHON_FOUNDATIONS_CONCEPTS) {
      for (const prerequisite of concept.prerequisites) expect(ids.has(String(prerequisite)), String(concept.id)).toBe(true);
    }
  });

  it("give every mission a runnable starter with a TODO, none of them a solution", () => {
    expect(Object.keys(PYTHON_FOUNDATIONS_M9_STARTER_CODE)).toHaveLength(8);
    expect(Object.keys(PYTHON_FOUNDATIONS_STARTER_CODE)).toHaveLength(7);
    for (const id of M9_IDS) {
      const template = templateOf(content, id);
      expect(template.starterCode, id).toContain("TODO");
      expect(template.starterCode!.trim().length, id).toBeGreaterThan(40);
    }
  });

  it("are not eight variations of 'fill in None': the starters differ in shape", () => {
    const shapes = new Set<string>();
    for (const id of M9_IDS) {
      const starter = templateOf(content, id).starterCode!;
      const nones = (starter.match(/=\s*None\b/g) ?? []).length;
      const defs = (starter.match(/^def /gm) ?? []).length;
      shapes.add(`${defs > 0 ? "functions" : "script"}:${nones === 0 ? "no-none" : nones > 3 ? "many-none" : "few-none"}`);
    }
    // PF-11/PF-13 are bare function stubs, PF-12 is buggy code, PF-14/PF-15 mix functions and values.
    expect(shapes.size).toBeGreaterThanOrEqual(3);
    expect(templateOf(content, "python-foundations.pf12").starterCode).not.toContain("= None");
    expect(templateOf(content, "python-foundations.pf13").starterCode).not.toContain("= None");
  });
});

describe("M9 hints", () => {
  it("every mission points at a registered H1-H4 hint set, in order", () => {
    const { hints } = capabilities();
    const content = builtIn();
    for (const id of M9_IDS) {
      const set = hints.getHintSet(templateOf(content, id).hintSetId!);
      expect(set, id).toBeDefined();
      expect(set!.hints.map((hint) => hint.level)).toEqual([HintLevel.H1, HintLevel.H2, HintLevel.H3, HintLevel.H4]);
      for (const hint of set!.hints) expect(hint.text.trim().length).toBeGreaterThan(40);
    }
    expect(PYTHON_FOUNDATIONS_HINT_SETS.length).toBe(7);
  });

  it("H1 and H2 carry no code, and H1-H3 never print a line of the reference solution", () => {
    const { hints } = capabilities();
    const content = builtIn();
    for (const id of M9_IDS) {
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

describe("M9 lesson guides, quick checks and the reference solutions stay apart", () => {
  it("every mission has a Vietnamese lesson note and a well-formed quick check, neither printing a reference line", () => {
    for (const id of M9_IDS) {
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
      for (const line of referenceLines(id)) expect(text, `${id} guide leaks: ${line}`).not.toContain(line);
    }
  });

  it("a mission's own definition never ships its reference solution", () => {
    const content = builtIn();
    for (const id of M9_IDS) {
      const shipped = JSON.stringify([content.getActivity(id as LearningActivityId), templateOf(content, id)]);
      for (const line of referenceLines(id)) {
        expect(shipped, `${id} ships: ${line}`).not.toContain(JSON.stringify(line).slice(1, -1));
      }
    }
  });
});

describe("M9 generators", () => {
  const { generators } = capabilities();
  const content = builtIn();

  it("are deterministic per variant and vary across variants", () => {
    for (const id of M9_IDS) {
      const first = instance(generators, content, id, 0);
      expect(instance(generators, content, id, 0), id).toEqual(first);
      const variants = new Set(Array.from({ length: 8 }, (_, index) => JSON.stringify(instance(generators, content, id, index).learner.data)));
      expect(variants.size, id).toBeGreaterThan(3);
    }
  });

  it("show the learner their data and expose it to Python, but never the grading data", () => {
    for (const id of M9_IDS) {
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

  it("only the displayed example of a function mission carries its expected value; hidden cases are labelled hidden", () => {
    for (const [id, keys] of [
      ["python-foundations.pf11", ["movingAverageCases", "clipCases"]],
      ["python-foundations.pf12", ["cases"]],
      ["python-foundations.pf13", ["cases"]],
      ["python-foundations.pf14", ["cases"]],
      ["python-foundations.pf15", ["maskCases", "scaleCases", "meanCases"]],
    ] as const) {
      const generated = instance(generators, content, id, 3);
      const visibleText = JSON.stringify({ learner: generated.learner, runtime: generated.runtime });
      for (const key of keys) {
        const cases = (generated.grading!.data as Record<string, { visibility: string; expect: { value?: unknown } }[]>)[key]!;
        expect(cases.filter((entry) => entry.visibility === "example")).toHaveLength(1);
        for (const hidden of cases.filter((entry) => entry.visibility === "hidden")) {
          if (hidden.expect.value === undefined) continue;
          const text = JSON.stringify(hidden.expect.value);
          // A hidden case's expected value (long enough to be meaningful) is not in the learner's view.
          if (text.length > 24) expect(visibleText, `${id}.${key}`).not.toContain(text);
        }
      }
    }
  });

  it("PF-11 shows the example call and its result in the mission text, and the example case matches it", () => {
    for (let variant = 0; variant < 8; variant += 1) {
      const generated = instance(generators, content, "python-foundations.pf11", variant);
      const data = generated.learner.data as { example_values: number[]; example_window: number };
      const cases = (generated.grading!.data as Record<string, { visibility: string; args: unknown[]; expect: { value: unknown } }[]>).movingAverageCases!;
      const example = cases.find((entry) => entry.visibility === "example")!;
      expect(example.args).toEqual([data.example_values, data.example_window]);
      expect(generated.learner.context).toContain(JSON.stringify(example.expect.value));
    }
  });

  it("the data of every mission contains the boundary values the mission is about", () => {
    for (let variant = 0; variant < 20; variant += 1) {
      const pf08 = instance(generators, content, "python-foundations.pf08", variant).learner.data as { samples: number[]; n: number; start: number; stop: number };
      expect(new Set(pf08.samples).size).toBe(pf08.samples.length);
      expect(pf08.stop - pf08.start).toBeGreaterThanOrEqual(3);
      expect(pf08.stop).toBeLessThanOrEqual(pf08.samples.length - 2);

      const pf10 = instance(generators, content, "python-foundations.pf10", variant).learner.data as { pixels: number[]; bright_from: number };
      expect(pf10.pixels).toContain(0);
      expect(pf10.pixels).toContain(255);
      expect(pf10.pixels.some((value) => value < 0)).toBe(true);
      expect(pf10.pixels.some((value) => value > 255)).toBe(true);

      const pf12 = instance(generators, content, "python-foundations.pf12", variant).learner.data as { form_inputs: unknown[]; low: number; high: number };
      expect(pf12.form_inputs).toContain(null);
      expect(pf12.form_inputs).toContain(String(pf12.low));
      expect(pf12.form_inputs).toContain(String(pf12.high));
      expect(pf12.form_inputs.some((item) => typeof item === "string" && /^\d+\.\d+$/.test(item))).toBe(true);

      const pf15 = instance(generators, content, "python-foundations.pf15", variant);
      const grid = (pf15.learner.data as { grid: number[][]; max_value: number }).grid;
      const max = (pf15.learner.data as { max_value: number }).max_value;
      expect(grid.flat()).toContain(0);
      expect(grid.flat()).toContain(max);
      expect(grid.flat().some((value) => value < 0)).toBe(true);
      expect(grid.flat().some((value) => value > max)).toBe(true);
      expect(grid.every((row) => row.some((value) => value >= 0 && value <= max))).toBe(true);
    }
  });
});

/**
 * Substantial single lines of a mission's reference solution (>= 14 chars; no comment, print
 * or line the learner already receives in the starter).
 */
function referenceLines(activityId: string): string[] {
  const reference = M9_SOLUTIONS[activityId]?.reference;
  if (reference === undefined) throw new Error(`no reference solution for ${activityId}`);
  const starterText = (PYTHON_FOUNDATIONS_M9_STARTER_CODE as Record<string, string>)[activityId.replace("python-foundations.", "")] ?? "";
  const starter = new Set(starterText.split("\n").map((line) => line.replace(/\s+#.*$/, "").trim()));
  return reference
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 14 && !line.startsWith("#") && !line.startsWith("print(") && !starter.has(line));
}

/** An assignment or a `return`: a line that computes the answer. */
function isComputation(line: string): boolean {
  return /^return\b/.test(line) || /^[A-Za-z_][\w, ]*\s*(?:[-+*/]|\/\/)?=(?!=)/.test(line);
}
