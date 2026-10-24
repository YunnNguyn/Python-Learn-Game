import { describe, expect, it } from "vitest";

import { getCourseActivityIds, getNextActivityInCourse } from "../../src/app/learning-path";
import { deriveActivityVariantSeed } from "../../src/app/services/application-services";
import {
  CS116_PRODUCTION_CONTENT,
  registerCs116Generators,
  registerCs116Hints,
  registerCs116ProductionContent,
} from "../../src/content/cs116";
import {
  ANNOTATION_FIXTURES,
  ANNOTATION_VARIANT_COUNT,
  PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_CONCEPTS,
  PYTHON_FOUNDATIONS_CONTENT,
  PYTHON_FOUNDATIONS_IDS,
  PYTHON_FOUNDATIONS_M10_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_M11_CONTENT,
  PYTHON_FOUNDATIONS_M11_HINT_SETS,
  PYTHON_FOUNDATIONS_M11_STARTER_CODE,
  PYTHON_FOUNDATIONS_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_M9_ACTIVITY_IDS,
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
  type MissionTemplate,
} from "../../src/core/domain";
import { GeneratorRegistry } from "../../src/core/generators";
import { GraderRegistry, registerCoreGraders } from "../../src/core/grading";
import { HintRegistry } from "../../src/core/hints";
import { generateMissionInstance } from "../../src/core/missions";
import { CORE_RUNTIME_ID } from "../../src/core/runtime";
import { getMissionLessonGuide, getMissionQuickCheck } from "../../src/features/mission-workspace/mission-lesson-guides";
import { M11_SOLUTIONS } from "./m11-solutions";

/**
 * PHASE-09 / M11 - the PF-27 capstone as DATA: it registers next to the earlier 26 activities and
 * CS116, validates, continues the SAME course, keeps every earlier id, and ships H1-H4 hints and a
 * lesson guide without a line of its reference solution. (The real grading runs against real
 * Pyodide in m11-missions.test.ts.)
 */

const PF27 = PYTHON_FOUNDATIONS_IDS.activityPf27;
const ERA_26 = [
  ...PYTHON_FOUNDATIONS_ACTIVITY_IDS,
  ...PYTHON_FOUNDATIONS_M9_ACTIVITY_IDS,
  ...PYTHON_FOUNDATIONS_M10_ACTIVITY_IDS,
] as readonly string[];

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

function pf27Template(content: ContentRegistry): MissionTemplate {
  const activity = content.getActivity(PF27 as LearningActivityId);
  if (activity === undefined || !("missionTemplateId" in activity)) throw new Error("PF-27 is not a mission");
  return content.getMissionTemplate(activity.missionTemplateId)!;
}

function instanceOf(generators: GeneratorRegistry, content: ContentRegistry, variantIndex: number) {
  const template = pf27Template(content);
  return generateMissionInstance({
    template,
    generatorRegistry: generators,
    baseSeed: deriveActivityVariantSeed(PF27 as LearningActivityId, template.version, variantIndex),
    difficulty: Difficulty.EASY,
  }).instance;
}

/** Reference lines that compute something (not imports, comments, or lines the starter already gives). */
function referenceLines(): string[] {
  const reference = M11_SOLUTIONS[PF27]!.reference;
  const starter = new Set(PYTHON_FOUNDATIONS_M11_STARTER_CODE.pf27.split("\n").map((line) => line.replace(/\s+#.*$/, "").trim()));
  return reference
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 14 && !line.startsWith("#") && !line.startsWith("print(") && !line.startsWith("import ") && line !== "fig, ax = plt.subplots()" && !starter.has(line));
}

describe("M11 content registers and validates next to the 26 earlier activities and CS116", () => {
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

  it("keeps the 26 earlier activity ids, in order, and puts PF-27 last in the same course, one new world and lesson", () => {
    const content = builtIn();
    const course = content.getCourse(PYTHON_FOUNDATIONS_IDS.course as never)!;
    const ids = getCourseActivityIds(content, course.id);
    expect(ids).toHaveLength(27);
    expect(ids.slice(0, 26)).toEqual([...ERA_26]);
    expect(ids[26]).toBe(PF27);
    expect([...PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS]).toEqual(ids);
    expect(PF27).toBe("python-foundations.pf27");
    expect(getNextActivityInCourse(content, PYTHON_FOUNDATIONS_IDS.activityPf26 as LearningActivityId)).toBe(PF27);
    expect(getNextActivityInCourse(content, PF27 as LearningActivityId)).toBeUndefined();

    expect(course.worldIds.at(-1)).toBe(PYTHON_FOUNDATIONS_IDS.worldCapstone);
    expect(content.getWorld(PYTHON_FOUNDATIONS_IDS.worldCapstone as never)!.lessonIds).toEqual([
      PYTHON_FOUNDATIONS_IDS.lessonCapstoneAnnotations,
    ]);
    expect(content.getLesson(PYTHON_FOUNDATIONS_IDS.lessonCapstoneAnnotations as never)!.activityIds).toEqual([PF27]);
    expect(PYTHON_FOUNDATIONS_M11_CONTENT.activities).toHaveLength(1);
    expect(PYTHON_FOUNDATIONS_CONTENT.packs[0]!.version).toBe("0.4.0");
  });

  it("is a TRANSFER-stage boss mission on its own concept, which depends on the data-pipeline concept", () => {
    const content = builtIn();
    const activity = content.getActivity(PF27 as LearningActivityId)!;
    expect(activity.type).toBe(LearningActivityType.BOSS_MISSION);
    expect(activity.stage).toBe(LearningStage.TRANSFER);
    expect(activity.title).toMatch(/^PF-27/);
    const annotation = PYTHON_FOUNDATIONS_CONCEPTS.find((concept) => concept.id === "python.annotation-qa")!;
    expect(annotation).toBeDefined();
    expect(activity.conceptIds).toContain(annotation.id);
    expect(annotation.prerequisites.map(String)).toContain("python.data-pipeline");
    expect(pf27Template(content).allowedStages).toEqual([LearningStage.TRANSFER]);
  });

  it("registers in either order and shares no id with CS116", () => {
    const cs116 = new Set<string>();
    for (const list of [
      CS116_PRODUCTION_CONTENT.activities,
      CS116_PRODUCTION_CONTENT.missionTemplates,
      CS116_PRODUCTION_CONTENT.concepts,
      CS116_PRODUCTION_CONTENT.lessons,
      CS116_PRODUCTION_CONTENT.worlds,
    ]) {
      for (const item of list) cs116.add(String(item.id));
    }
    for (const list of [
      PYTHON_FOUNDATIONS_M11_CONTENT.activities,
      PYTHON_FOUNDATIONS_M11_CONTENT.missionTemplates,
      PYTHON_FOUNDATIONS_M11_CONTENT.lessons,
      PYTHON_FOUNDATIONS_M11_CONTENT.worlds,
    ]) {
      for (const item of list) expect(cs116.has(String(item.id)), String(item.id)).toBe(false);
    }
    const reversed = new ContentRegistry();
    registerPythonFoundationsContent(reversed);
    registerCs116ProductionContent(reversed);
    expect(reversed.getActivity(PF27 as LearningActivityId)).toBeDefined();
  });
});

describe("M11 starter, hints and lesson guide keep the reference solution apart", () => {
  it("the starter holds the contracts only: four stubs returning None, no pandas/numpy logic", () => {
    const starter = PYTHON_FOUNDATIONS_M11_STARTER_CODE.pf27;
    for (const name of ["clean_annotations", "normalize_boxes", "class_summary", "plot_class_distribution"]) {
      expect(starter).toContain(`def ${name}(`);
    }
    expect((starter.match(/# TODO/g) ?? []).length).toBeGreaterThanOrEqual(8);
    expect(starter).not.toMatch(/drop_duplicates|to_numeric|groupby|read_csv|\.bar\(|\.agg\(|to_numpy|column_stack|astype/);
    const content = builtIn();
    expect(pf27Template(content).starterCode).toBe(starter);
  });

  it("has four Vietnamese hint levels; H1/H2 carry no code and H1-H3 never print a line of the reference", () => {
    const { hints } = capabilities();
    const content = builtIn();
    expect(PYTHON_FOUNDATIONS_M11_HINT_SETS).toHaveLength(1);
    const set = hints.getHintSet(pf27Template(content).hintSetId!)!;
    expect(set.hints.map((hint) => hint.level)).toEqual([HintLevel.H1, HintLevel.H2, HintLevel.H3, HintLevel.H4]);
    const [h1, h2, h3] = set.hints;
    for (const hint of [h1!, h2!]) {
      expect(hint.text).not.toContain("`");
      expect(hint.text).not.toMatch(/\bdef\b|\breturn\s+\S|\bfor\b.*\bin\b.*:|\bappend\(/);
    }
    for (const hint of set.hints) expect(hint.text).toMatch(/[ăâđêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i);
    for (const line of referenceLines()) {
      const computing = /^return\b/.test(line) || /^[A-Za-z_][\w, ]*\s*(?:[-+*/]|\/\/)?=(?!=)/.test(line);
      for (const hint of computing ? [h1!, h2!, h3!] : [h1!, h2!]) {
        expect(hint.text, `${hint.level} leaks: ${line}`).not.toContain(line);
      }
    }
  });

  it("has a lesson guide and a well-formed quick check, neither printing a reference line", () => {
    const guide = getMissionLessonGuide(PF27)!;
    expect(guide).not.toBeNull();
    expect(guide.summary.length).toBeGreaterThan(60);
    const check = getMissionQuickCheck(PF27)!;
    expect(check.options.length).toBeGreaterThanOrEqual(3);
    expect(new Set(check.options).size).toBe(check.options.length);
    expect(check.correctOptionIndex).toBeLessThan(check.options.length);
    const text = JSON.stringify([guide, check]);
    for (const line of referenceLines()) expect(text, `guide leaks: ${line}`).not.toContain(JSON.stringify(line).slice(1, -1));
  });

  it("the shipped activity + template never contain the reference solution", () => {
    const content = builtIn();
    const shipped = JSON.stringify([content.getActivity(PF27 as LearningActivityId), pf27Template(content)]);
    for (const line of referenceLines()) expect(shipped, `ships: ${line}`).not.toContain(JSON.stringify(line).slice(1, -1));
  });
});

describe("M11 generator", () => {
  const { generators } = capabilities();
  const content = builtIn();

  it("is deterministic per variant and offers at least four different datasets", () => {
    expect(ANNOTATION_VARIANT_COUNT).toBeGreaterThanOrEqual(4);
    expect(ANNOTATION_FIXTURES.length).toBeGreaterThanOrEqual(4);
    const first = instanceOf(generators, content, 0);
    expect(instanceOf(generators, content, 0)).toEqual(first);
    const seen = new Set(Array.from({ length: 12 }, (_, index) => String(instanceOf(generators, content, index).learner.data?.annotation_file)));
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it("shows the learner the data and exposes it to Python, but never the grading data", () => {
    for (let variant = 0; variant < 8; variant += 1) {
      const generated = instanceOf(generators, content, variant);
      expect(generated.runtime?.setupData, `#${variant}`).toEqual(generated.learner.data);
      const grading = generated.grading?.data ?? {};
      expect(Object.keys(grading).length).toBeGreaterThan(0);
      const visible = JSON.stringify({ learner: generated.learner, runtime: generated.runtime });
      for (const key of Object.keys(grading)) expect(visible, `#${variant} exposes grading key ${key}`).not.toContain(`"${key}"`);
    }
  });

  it("every dataset contains each kind of defect the mission asks to catch, and never the reference text", () => {
    for (const fixture of ANNOTATION_FIXTURES) {
      const csv = fixture.csv;
      const rows = csv.trim().split("\n");
      expect(rows[0]).toBe("image_id,width,height,label,xmin,ymin,xmax,ymax,split");
      expect(rows.length, fixture.file).toBeGreaterThan(30);
      expect(csv, fixture.file).toMatch(/,,|,\s*,/); // a missing cell
      expect(csv, fixture.file).toMatch(/\bdev\b/); // an unknown split
      expect(csv, fixture.file).toMatch(/,n\/a,|n\/a/); // an unreadable number
      expect(csv, fixture.file).toMatch(/,-\d/); // a negative number
    }
  });

  it("the displayed example of every function case is visible but the hidden cases never reveal their expectation", () => {
    const generated = instanceOf(generators, content, 2);
    const visible = JSON.stringify(generated.learner);
    const cases = (generated.grading?.data ?? {}) as Record<string, unknown>;
    for (const key of ["cleanCases", "normalizeCases", "summaryCases", "plotCases"]) {
      expect(cases[key], key).toBeDefined();
      expect(visible).not.toContain(`"${key}"`);
    }
  });
});
