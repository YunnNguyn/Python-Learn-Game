import { describe, expect, it } from "vitest";

import { CS116_PRODUCTION_CONTENT } from "../../src/content/cs116";
import {
  LearningActivitySchema,
  MissionInstanceSchema,
  MissionTemplateSchema,
} from "../../src/core/domain";
import {
  adaptExercise,
  adaptExercisePack,
  parsePracticeActivityId,
  validateExercisePack,
  type ExercisePack,
} from "../../src/core/exercise-packs";
import { CORE_GRADER_ID, DeclarativeGraderConfigSchema } from "../../src/core/grading";
import { CORE_RUNTIME_ID } from "../../src/core/runtime";
import { SAMPLE_PACK_TEXT, makeMinimalPack, makePack, type Loose } from "./pack-fixtures";

function validated(input: unknown): ExercisePack {
  const result = validateExercisePack(input);
  if (!result.ok) throw new Error(`invalid pack: ${JSON.stringify(result.issues)}`);
  return result.pack;
}

describe("adapting the sample pack", () => {
  const pack = validated(SAMPLE_PACK_TEXT);
  const adapted = adaptExercisePack(pack);

  it("produces one set of domain objects per exercise, in authored order", () => {
    expect(adapted.map((entry) => entry.exerciseId)).toEqual(["mse-basic", "gd-step", "fix-normalization"]);
    expect(adapted.map((entry) => entry.activity.type)).toEqual(["CODE_MISSION", "CODE_MISSION", "DEBUG_MISSION"]);
  });

  it("emits objects the domain schemas accept as they are", () => {
    for (const entry of adapted) {
      expect(LearningActivitySchema.safeParse(entry.activity).success).toBe(true);
      expect(MissionTemplateSchema.safeParse(entry.template).success).toBe(true);
      expect(MissionInstanceSchema.safeParse(entry.instance).success).toBe(true);
      expect(DeclarativeGraderConfigSchema.safeParse(entry.template.grader.config).success).toBe(true);
    }
  });

  it("uses the namespaced, parseable activity id", () => {
    for (const entry of adapted) {
      expect(entry.activity.id).toBe(`practice:${pack.pack.id}:${entry.exerciseId}`);
      expect(parsePracticeActivityId(entry.activity.id)).toEqual({ packId: pack.pack.id, exerciseId: entry.exerciseId });
      expect((entry.activity as { missionTemplateId?: string }).missionTemplateId).toBe(entry.template.id);
      expect(entry.instance.templateId).toBe(entry.template.id);
    }
  });

  it("always selects Pyodide and the declarative grader - never Local Python", () => {
    for (const entry of adapted) {
      expect(entry.template.runtime.id).toBe(CORE_RUNTIME_ID.PYODIDE);
      expect(entry.template.runtime.id === CORE_RUNTIME_ID.LOCAL_PYTHON).toBe(false);
      expect(entry.template.grader.id).toBe(CORE_GRADER_ID.DECLARATIVE);
    }
  });

  it("passes the declared packages to the runtime and nothing else", () => {
    for (const entry of adapted) {
      expect(entry.template.runtime.config).toEqual({ packages: ["numpy"] });
    }
  });

  it("derives the template version from the revision", () => {
    for (const entry of adapted) {
      expect(entry.template.version).toBe(1);
      expect(entry.instance.templateVersion).toBe(1);
    }
  });

  it("delivers setup variables as runtime setup data and as visible input data", () => {
    const mse = adapted[0]!;
    expect(mse.instance.runtime?.setupData).toEqual({ y_true: [3, -0.5, 2, 7], y_pred: [2.5, 0, 2, 8] });
    expect(mse.instance.learner.data).toEqual(mse.instance.runtime?.setupData);
    expect(mse.instance.learner.starterCode).toBe(pack.exercises[0]!.starterCode);
    expect(mse.template.starterCode).toBe(pack.exercises[0]!.starterCode);
  });

  it("observes exactly the graded variables", () => {
    expect(adapted[0]!.observedVariables).toEqual(["mse"]);
    expect(adapted[1]!.observedVariables).toEqual(["w_new", "b_new"]);
    expect(adapted[2]!.observedVariables).toEqual(["X_norm", "mean", "std"]);
  });

  it("builds a hint set that is an ordered H1..Hn prefix", () => {
    expect(adapted[0]!.hintSet?.hints.map((hint) => hint.level)).toEqual(["H1", "H2", "H3", "H4"]);
    expect(adapted[1]!.hintSet?.hints.map((hint) => hint.level)).toEqual(["H1", "H2", "H3"]);
    expect(adapted[0]!.template.hintSetId).toBe(adapted[0]!.hintSet?.id);
  });

  it("is deterministic", () => {
    expect(adaptExercisePack(pack)).toEqual(adapted);
  });
});

describe("isolation from CS116 identifiers", () => {
  it("never produces an id equal to, or in the namespace of, built-in content", () => {
    const builtIn = new Set<string>();
    for (const activity of CS116_PRODUCTION_CONTENT.activities) builtIn.add(activity.id);
    for (const template of CS116_PRODUCTION_CONTENT.missionTemplates) builtIn.add(template.id);
    for (const concept of CS116_PRODUCTION_CONTENT.concepts) builtIn.add(concept.id);
    expect(builtIn.size > 10).toBe(true);

    const pack = makePack();
    // A pack that tries to impersonate a CS116 id still lands in the practice namespace.
    pack.pack.id = "cs116.numpy";
    pack.exercises[0].id = "vs01";
    for (const entry of adaptExercisePack(validated(pack))) {
      // The instance id is derived from the template id (and so carries the namespace inside).
      expect(entry.instance.id.includes(encodeURIComponent(entry.template.id))).toBe(true);
      expect(builtIn.has(entry.instance.id)).toBe(false);
      const ids = [
        entry.activity.id,
        entry.template.id,
        entry.template.hintSetId ?? "practice.none",
        ...entry.activity.conceptIds,
        ...entry.template.conceptIds,
        ...entry.instance.conceptIds,
      ];
      for (const id of ids) {
        expect(id.startsWith("practice")).toBe(true);
        expect(builtIn.has(id)).toBe(false);
      }
      expect(entry.seed.startsWith("practice:")).toBe(true);
    }
  });
});

describe("revisions", () => {
  it("changes the template version, seed and instance id with the revision", () => {
    const first = validated(makeMinimalPack());
    const revised = makeMinimalPack();
    revised.exercises[0].revision = 2;
    const second = validated(revised);
    const a = adaptExercise(first, first.exercises[0]!);
    const b = adaptExercise(second, second.exercises[0]!);
    expect(a.activity.id).toBe(b.activity.id); // same exercise
    expect(a.template.id).toBe(b.template.id);
    expect(a.template.version).toBe(1);
    expect(b.template.version).toBe(2);
    expect(a.seed === b.seed).toBe(false);
    expect(a.instance.id === b.instance.id).toBe(false);
  });
});

describe("runtime configuration", () => {
  it("stages datasets as workspace files without descriptions", () => {
    const input = makeMinimalPack();
    input.exercises[0].allowedPackages = ["pandas"];
    input.exercises[0].datasets = [{ filename: "scores.csv", content: "a,b\n1,2\n", description: "ghi chú" }];
    const entry = adaptExercise(validated(input), validated(input).exercises[0]!);
    expect(entry.template.runtime.config).toEqual({
      packages: ["pandas"],
      workspace: { datasets: [{ filename: "scores.csv", content: "a,b\n1,2\n" }] },
    });
  });

  it("omits the runtime config when nothing is declared", () => {
    const pack = validated(makeMinimalPack());
    const entry = adaptExercise(pack, pack.exercises[0]!);
    expect(entry.template.runtime.config).toBeUndefined();
    expect(entry.instance.runtime).toBeUndefined();
    expect(entry.instance.learner.data).toBeUndefined();
    expect(entry.hintSet).toBeUndefined();
    expect(entry.template.hintSetId).toBeUndefined();
  });

  it("refuses (does not coerce) input the validator should have rejected", () => {
    const pack = validated(makeMinimalPack());
    const tampered: Loose = structuredClone(pack);
    tampered.exercises[0].allowedPackages = ["torch"];
    expect(() => adaptExercise(tampered, tampered.exercises[0])).toThrow(RangeError);
    const unsafe: Loose = structuredClone(pack);
    unsafe.exercises[0].datasets = [{ filename: "../x", content: "" }];
    expect(() => adaptExercise(unsafe, unsafe.exercises[0])).toThrow(RangeError);
  });
});
