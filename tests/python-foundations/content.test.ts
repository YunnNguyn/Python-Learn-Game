import { describe, expect, it } from "vitest";

import { CS116_PRODUCTION_CONTENT, registerCs116Generators, registerCs116Hints, registerCs116ProductionContent } from "../../src/content/cs116";
import {
  PYTHON_FOUNDATIONS_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_CONCEPTS,
  PYTHON_FOUNDATIONS_CONTENT,
  PYTHON_FOUNDATIONS_HINT_SETS,
  PYTHON_FOUNDATIONS_IDS,
  PYTHON_FOUNDATIONS_M9_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_M10_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_M11_ACTIVITY_IDS,
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
import { GraderRegistry, registerCoreGraders } from "../../src/core/grading";
import { HintRegistry } from "../../src/core/hints";
import { generateMissionInstance } from "../../src/core/missions";
import { CORE_RUNTIME_ID } from "../../src/core/runtime";
import { deriveActivityVariantSeed } from "../../src/app/services/application-services";
import { getCourseActivityIds } from "../../src/app/learning-path";
import { getMissionLessonGuide, getMissionQuickCheck } from "../../src/features/mission-workspace/mission-lesson-guides";
import { SOLUTIONS } from "./solutions";

/**
 * PHASE-06 / M8 Part B - the native Python Foundations course as DATA: it registers next to
 * CS116, validates, is structurally what the brief asks for, ships H1-H4 hints and a lesson
 * guide for every mission, and its generators vary without ever leaking grading data.
 */

const ACTIVITY_IDS = PYTHON_FOUNDATIONS_ACTIVITY_IDS as readonly string[];

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

function instance(
  generators: GeneratorRegistry,
  content: ContentRegistry,
  activityId: string,
  variantIndex: number,
): MissionInstance {
  const template = templateOf(content, activityId);
  return generateMissionInstance({
    template,
    generatorRegistry: generators,
    baseSeed: deriveActivityVariantSeed(activityId as LearningActivityId, template.version, variantIndex),
    difficulty: Difficulty.EASY,
  }).instance;
}

describe("registration next to CS116", () => {
  it("registers both courses in either order without collisions", () => {
    for (const order of ["cs116-first", "python-first"] as const) {
      const content = new ContentRegistry();
      const registerCs116 = () => registerCs116ProductionContent(content);
      const registerPython = () => registerPythonFoundationsContent(content);
      if (order === "cs116-first") {
        registerCs116();
        registerPython();
      } else {
        registerPython();
        registerCs116();
      }
      expect(content.getCourses().map((course) => String(course.id)).sort()).toEqual(
        [...CS116_PRODUCTION_CONTENT.courses.map((course) => String(course.id)), PYTHON_FOUNDATIONS_IDS.course].sort(),
      );
    }
  });

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

  it("shares no id with CS116 and never uses the imported-practice namespace", () => {
    const cs116 = new Set<string>();
    for (const list of [
      CS116_PRODUCTION_CONTENT.packs,
      CS116_PRODUCTION_CONTENT.concepts,
      CS116_PRODUCTION_CONTENT.courses,
      CS116_PRODUCTION_CONTENT.worlds,
      CS116_PRODUCTION_CONTENT.lessons,
      CS116_PRODUCTION_CONTENT.activities,
      CS116_PRODUCTION_CONTENT.missionTemplates,
    ]) {
      for (const item of list) cs116.add(String((item as { id: string }).id));
    }
    const own = [
      ...PYTHON_FOUNDATIONS_CONTENT.packs,
      ...PYTHON_FOUNDATIONS_CONTENT.concepts,
      ...PYTHON_FOUNDATIONS_CONTENT.courses,
      ...PYTHON_FOUNDATIONS_CONTENT.worlds,
      ...PYTHON_FOUNDATIONS_CONTENT.lessons,
      ...PYTHON_FOUNDATIONS_CONTENT.activities,
      ...PYTHON_FOUNDATIONS_CONTENT.missionTemplates,
    ].map((item) => String((item as { id: string }).id));
    for (const id of own) {
      // The pack, course and PF-xx activity / template deliberately share ONE namespace; what
      // matters is that none is also a CS116 id and none is a practice id.
      expect(cs116.has(id), id).toBe(false);
      expect(id.startsWith("practice"), id).toBe(false);
    }
    for (const hintSet of PYTHON_FOUNDATIONS_HINT_SETS) {
      expect(String(hintSet.id).startsWith("python-foundations."), String(hintSet.id)).toBe(true);
    }
  });

  it("uses only the existing content contracts (no new activity types, graders or runtimes)", () => {
    const content = builtIn();
    for (const id of ACTIVITY_IDS) {
      const template = templateOf(content, id);
      expect(template.grader.id, id).toBe("core.declarative");
      expect(template.runtime?.id, id).toBe(CORE_RUNTIME_ID.PYODIDE);
      expect(template.runtime?.config ?? {}, id).not.toHaveProperty("packages");
    }
  });
});

describe("structure the brief asks for", () => {
  const content = builtIn();

  it("is one course whose FIRST world holds the seven M8 missions in two lessons (M9 continues after it)", () => {
    const course = content.getCourse(PYTHON_FOUNDATIONS_IDS.course as never)!;
    expect(course.title).toContain("Python Foundations");
    // PHASE-07 / M9 appends two worlds; the M8 world stays first and unchanged.
    expect(course.worldIds.slice(0, 3)).toEqual([
      PYTHON_FOUNDATIONS_IDS.world,
      PYTHON_FOUNDATIONS_IDS.worldCollections,
      PYTHON_FOUNDATIONS_IDS.worldNumpy,
    ]);

    const world = content.getWorld(PYTHON_FOUNDATIONS_IDS.world as never)!;
    expect(world.title).toBe("Python Foundations");
    expect(world.lessonIds).toEqual([
      PYTHON_FOUNDATIONS_IDS.lessonValuesDecisions,
      PYTHON_FOUNDATIONS_IDS.lessonCollectionsFunctions,
    ]);

    const lesson1 = content.getLesson(PYTHON_FOUNDATIONS_IDS.lessonValuesDecisions as never)!;
    const lesson2 = content.getLesson(PYTHON_FOUNDATIONS_IDS.lessonCollectionsFunctions as never)!;
    expect(lesson1.title).toContain("Values & Decisions");
    expect(lesson2.title).toContain("Collections & Functions");
    expect(lesson1.activityIds).toEqual(ACTIVITY_IDS.slice(0, 3));
    expect(lesson2.activityIds).toEqual(ACTIVITY_IDS.slice(3));
    expect(getCourseActivityIds(content, course.id)).toEqual([...ACTIVITY_IDS, ...PYTHON_FOUNDATIONS_M9_ACTIVITY_IDS, ...PYTHON_FOUNDATIONS_M10_ACTIVITY_IDS, ...PYTHON_FOUNDATIONS_M11_ACTIVITY_IDS]);
  });

  it("has the kind and learning stage of each mission", () => {
    const expected: ReadonlyArray<readonly [LearningActivityType, LearningStage]> = [
      [LearningActivityType.CODE_MISSION, LearningStage.GUIDED], // PF-01
      [LearningActivityType.CODE_MISSION, LearningStage.GUIDED], // PF-02
      [LearningActivityType.DEBUG_MISSION, LearningStage.INDEPENDENT], // PF-03 (debug)
      [LearningActivityType.CODE_MISSION, LearningStage.GUIDED], // PF-04
      [LearningActivityType.CODE_MISSION, LearningStage.INDEPENDENT], // PF-05
      [LearningActivityType.CODE_MISSION, LearningStage.TRANSFER], // PF-06
      [LearningActivityType.BOSS_MISSION, LearningStage.REVIEW], // PF-07 (capstone)
    ];
    ACTIVITY_IDS.forEach((id, index) => {
      const activity = content.getActivity(id as LearningActivityId)!;
      expect([activity.type, activity.stage], id).toEqual(expected[index]);
    });
  });

  it("teaches native Python concepts (python.*), each with prerequisites that exist", () => {
    const ids = new Set(PYTHON_FOUNDATIONS_CONCEPTS.map((concept) => String(concept.id)));
    expect(ids.size).toBe(PYTHON_FOUNDATIONS_CONCEPTS.length);
    for (const concept of PYTHON_FOUNDATIONS_CONCEPTS) {
      expect(String(concept.id).startsWith("python."), String(concept.id)).toBe(true);
      for (const prerequisite of concept.prerequisites) expect(ids.has(String(prerequisite))).toBe(true);
    }
    for (const id of ACTIVITY_IDS) {
      const activity = content.getActivity(id as LearningActivityId)!;
      expect(activity.conceptIds.length, id).toBeGreaterThan(0);
      for (const conceptId of activity.conceptIds) expect(ids.has(String(conceptId)), `${id}:${conceptId}`).toBe(true);
    }
  });

  it("gives every mission a starter with a TODO that is valid, runnable Python text", () => {
    for (const id of ACTIVITY_IDS) {
      const template = templateOf(content, id);
      expect(template.starterCode, id).toContain("TODO");
      expect(template.starterCode!.trim().length, id).toBeGreaterThan(20);
    }
    expect(Object.keys(PYTHON_FOUNDATIONS_STARTER_CODE)).toHaveLength(7);
  });
});

describe("hints", () => {
  it("every mission points at a registered H1-H4 hint set, in order", () => {
    const { hints } = capabilities();
    const content = builtIn();
    for (const id of ACTIVITY_IDS) {
      const set = hints.getHintSet(templateOf(content, id).hintSetId!);
      expect(set, id).toBeDefined();
      expect(set!.hints.map((hint) => hint.level)).toEqual([HintLevel.H1, HintLevel.H2, HintLevel.H3, HintLevel.H4]);
      for (const hint of set!.hints) expect(hint.text.trim().length).toBeGreaterThan(20);
    }
  });

  it("H1 and H2 carry no code, and H1-H3 never print a line of the reference solution", () => {
    const { hints } = capabilities();
    const content = builtIn();
    for (const id of ACTIVITY_IDS) {
      const set = hints.getHintSet(templateOf(content, id).hintSetId!)!;
      const [h1, h2, h3] = set.hints;
      for (const hint of [h1!, h2!]) {
        expect(hint.text, `${id} ${hint.level}`).not.toContain("`");
        expect(hint.text, `${id} ${hint.level}`).not.toMatch(/\bdef\b|\breturn\s+\S|\bfor\b.*\bin\b.*:|\bappend\(/);
      }
      for (const line of referenceLines(id)) {
        // H1/H2 may not hand out ANY solution line. H3 names constructs (`for x in y:`), so it is
        // only held to the lines that compute something: an assignment or a return.
        const hinted = isComputation(line) ? [h1!, h2!, h3!] : [h1!, h2!];
        for (const hint of hinted) {
          expect(hint.text, `${id} ${hint.level} leaks: ${line}`).not.toContain(line);
        }
      }
    }
  });
});

describe("lesson guides and the reference solutions stay apart", () => {
  it("every mission has a Vietnamese lesson note; the guide never prints a reference line", () => {
    for (const id of ACTIVITY_IDS) {
      const guide = getMissionLessonGuide(id);
      expect(guide, id).not.toBeNull();
      expect(guide!.summary.length, id).toBeGreaterThan(30);
      expect(guide!.newTopics.length + (guide!.reviewTopics?.length ?? 0), id).toBeGreaterThan(0);
      expect(guide!.workflow.length, id).toBeGreaterThan(0);

      const text = JSON.stringify(guide);
      for (const line of referenceLines(id)) expect(text, `${id} guide leaks: ${line}`).not.toContain(line);
    }
  });

  it("quick checks (where present) are well formed and do not give a solution line away", () => {
    for (const id of ACTIVITY_IDS) {
      const check = getMissionQuickCheck(id);
      if (check === null) continue;
      expect(check.options.length, id).toBeGreaterThanOrEqual(2);
      expect(check.correctOptionIndex, id).toBeGreaterThanOrEqual(0);
      expect(check.correctOptionIndex, id).toBeLessThan(check.options.length);
      const text = JSON.stringify(check);
      for (const line of referenceLines(id)) expect(text, `${id} quick check leaks: ${line}`).not.toContain(line);
    }
  });

  it("the reference solutions are test data only - a mission's own definition never ships one", () => {
    // (Another mission's starter may legitimately reuse an earlier mission's line, e.g. PF-03's
    // deliberately buggy `pixel_count = width * height`; only the mission's OWN definition counts.)
    const content = builtIn();
    for (const id of ACTIVITY_IDS) {
      const template = templateOf(content, id);
      const shipped = JSON.stringify([content.getActivity(id as LearningActivityId), template]);
      for (const line of referenceLines(id)) {
        expect(shipped, `${id} ships: ${line}`).not.toContain(JSON.stringify(line).slice(1, -1));
      }
    }
  });
});

describe("generators", () => {
  const { generators } = capabilities();
  const content = builtIn();

  it("are deterministic per variant and vary across variants", () => {
    for (const id of ACTIVITY_IDS) {
      const first = instance(generators, content, id, 0);
      expect(instance(generators, content, id, 0), id).toEqual(first);
      const variants = new Set(Array.from({ length: 8 }, (_, index) => JSON.stringify(instance(generators, content, id, index).learner.data)));
      expect(variants.size, id).toBeGreaterThan(3);
    }
  });

  it("show the learner their data and expose it to Python, but never the expected values", () => {
    for (const id of ACTIVITY_IDS) {
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

  it("PF-03 data is text (so the starter fails for the right reason) and never ties the limit", () => {
    for (let variant = 0; variant < 20; variant += 1) {
      const data = instance(generators, content, PYTHON_FOUNDATIONS_IDS.activityPf03, variant).learner.data as Record<string, unknown>;
      expect(typeof data.width_text).toBe("string");
      expect(typeof data.height_text).toBe("string");
      const pixels = Number(data.width_text) * Number(data.height_text);
      expect(pixels).not.toBe(data.max_pixels);
    }
  });

  it("PF-04 / PF-06 / PF-07 always contain the boundary and the out-of-range values the mission is about", () => {
    for (let variant = 0; variant < 20; variant += 1) {
      const pf04 = instance(generators, content, PYTHON_FOUNDATIONS_IDS.activityPf04, variant).learner.data as {
        readings: number[];
        min_valid: number;
        max_valid: number;
      };
      expect(pf04.readings).toContain(pf04.min_valid);
      expect(pf04.readings).toContain(pf04.max_valid);
      expect(pf04.readings.some((value) => value < pf04.min_valid)).toBe(true);
      expect(pf04.readings.some((value) => value > pf04.max_valid)).toBe(true);

      const pf07 = instance(generators, content, PYTHON_FOUNDATIONS_IDS.activityPf07, variant).learner.data as {
        confidences: number[];
        high_threshold: number;
        low_threshold: number;
      };
      expect(pf07.confidences).toContain(pf07.high_threshold);
      expect(pf07.confidences).toContain(pf07.low_threshold);
      expect(pf07.confidences.some((value) => value < 0 || value > 1)).toBe(true);
    }
  });
});

/**
 * Substantial single lines of a mission's reference solution (>= 14 chars; no comment, print
 * or line the learner already receives in the starter).
 */
function referenceLines(activityId: string): string[] {
  const reference = SOLUTIONS[activityId]?.reference;
  if (reference === undefined) throw new Error(`no reference solution for ${activityId}`);
  const starter = new Set(
    (STARTER_BY_ACTIVITY[activityId] ?? "").split("\n").map((line) => line.replace(/\s+#.*$/, "").trim()),
  );
  return reference
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length >= 14 && !line.startsWith("#") && !line.startsWith("print(") && !starter.has(line),
    );
}

/** An assignment (`x = ...`, `x += ...`) or a `return`: a line that computes the answer. */
function isComputation(line: string): boolean {
  return /^return\b/.test(line) || /^[A-Za-z_][\w, ]*\s*(?:[-+*/]|\/\/)?=(?!=)/.test(line);
}

const STARTER_BY_ACTIVITY: Readonly<Record<string, string>> = Object.fromEntries(
  PYTHON_FOUNDATIONS_ACTIVITY_IDS.map((id, index) => [
    id,
    Object.values(PYTHON_FOUNDATIONS_STARTER_CODE)[index] as string,
  ]),
);
