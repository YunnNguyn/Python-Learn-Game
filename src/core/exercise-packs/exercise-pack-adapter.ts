import {
  CodeMissionActivitySchema,
  DebugMissionActivitySchema,
  Difficulty,
  LearningActivityType,
  LearningStage,
  MissionTemplateSchema,
  type JsonObject,
  type LearningActivity,
  type MissionInstance,
  type MissionTemplate,
} from "../domain";
import {
  CORE_GRADER_ID,
  DeclarativeGraderConfigSchema,
  getDeclarativeObservationVariables,
} from "../grading";
import type { HintSet } from "../hints";
import { createMissionInstance } from "../missions";
import { CORE_RUNTIME_ID } from "../runtime/runtime-ids";
import {
  isAllowedRuntimeConfigKey,
  isAllowedRuntimePackage,
  isSimpleDatasetFilename,
} from "../runtime/pyodide/runtime-config-rules";
import type { ExercisePack, PackExercise } from "./exercise-pack-schema";
import {
  PRACTICE_STATIC_GENERATOR_ID,
  practiceActivityId,
  practiceConceptId,
  practiceHintSetId,
  practiceSeed,
  practiceTemplateId,
} from "./practice-ids";

/*
 * Adapter: one validated pack exercise -> the existing domain objects
 * (LearningActivity + MissionTemplate + MissionInstance + HintSet + runtime config).
 *
 * Nothing here is new machinery. The exercise is expressed in the same schemas the
 * CS116 content uses, so MissionEngine, the declarative grader and the Pyodide
 * runtime need no change. Every produced object is parsed by its domain schema,
 * which is the authority: if the adapter and the domain disagree, the adapter
 * throws and the validator reports it as ADAPTER_REJECTED (the importer never
 * installs what the domain would later refuse to run).
 *
 * The runtime is ALWAYS `core.pyodide`. There is no input that selects another one.
 */

const DIFFICULTY = {
  easy: Difficulty.EASY,
  normal: Difficulty.NORMAL,
  hard: Difficulty.HARD,
} as const;

/** Practice attempts are independent work; the stage only labels the record. */
const PRACTICE_STAGE = LearningStage.INDEPENDENT;

export interface AdaptedExercise {
  readonly packId: string;
  readonly exerciseId: string;
  readonly revision: number;
  readonly kind: PackExercise["kind"];
  readonly activity: LearningActivity;
  readonly template: MissionTemplate;
  readonly instance: MissionInstance;
  /** The variant seed: fixed per revision (a practice exercise has exactly one variant). */
  readonly seed: string;
  readonly hintSet: HintSet | undefined;
  /** Variables the grader observes, in check order (what the runtime must report). */
  readonly observedVariables: readonly string[];
}

export function adaptExercise(pack: ExercisePack, exercise: PackExercise): AdaptedExercise {
  const packId = pack.pack.id;
  const exerciseId = exercise.id;
  const templateId = practiceTemplateId(packId, exerciseId);
  const conceptId = practiceConceptId(packId);
  const activityId = practiceActivityId(packId, exerciseId);
  const seed = practiceSeed(packId, exerciseId, exercise.revision);

  const graderConfig = DeclarativeGraderConfigSchema.parse({ checks: exercise.grading.checks });
  const observedVariables = getDeclarativeObservationVariables(graderConfig as unknown as JsonObject);

  const runtimeConfig = buildRuntimeConfig(exercise);
  const hintSet = buildHintSet(packId, exercise);

  const template = MissionTemplateSchema.parse({
    id: templateId,
    version: exercise.revision,
    conceptIds: [conceptId],
    allowedStages: [PRACTICE_STAGE],
    generator: { id: PRACTICE_STATIC_GENERATOR_ID },
    grader: { id: CORE_GRADER_ID.DECLARATIVE, config: graderConfig },
    runtime: {
      id: CORE_RUNTIME_ID.PYODIDE,
      ...(runtimeConfig !== undefined ? { config: runtimeConfig } : {}),
    },
    starterCode: exercise.starterCode,
    ...(hintSet !== undefined ? { hintSetId: hintSet.id } : {}),
  });

  const instance = createMissionInstance({
    template,
    seed,
    difficulty: DIFFICULTY[exercise.difficulty],
    generated: {
      learner: {
        objective: exercise.title,
        context: exercise.instructions,
        starterCode: exercise.starterCode,
        ...(exercise.setupVariables !== undefined && Object.keys(exercise.setupVariables).length > 0
          ? { data: exercise.setupVariables as JsonObject }
          : {}),
      },
      ...(exercise.setupVariables !== undefined && Object.keys(exercise.setupVariables).length > 0
        ? { runtime: { setupData: exercise.setupVariables as JsonObject } }
        : {}),
    },
  });

  const activityBase = {
    id: activityId,
    title: exercise.title,
    description: exercise.instructions.slice(0, 200),
    conceptIds: [conceptId],
    stage: PRACTICE_STAGE,
    missionTemplateId: templateId,
  };
  const activity =
    exercise.kind === "debug"
      ? DebugMissionActivitySchema.parse({ ...activityBase, type: LearningActivityType.DEBUG_MISSION })
      : CodeMissionActivitySchema.parse({ ...activityBase, type: LearningActivityType.CODE_MISSION });

  return {
    packId,
    exerciseId,
    revision: exercise.revision,
    kind: exercise.kind,
    activity,
    template,
    instance,
    seed,
    hintSet,
    observedVariables,
  };
}

/** Adapts every exercise of a validated pack; throws on the first exercise the domain rejects. */
export function adaptExercisePack(pack: ExercisePack): readonly AdaptedExercise[] {
  return pack.exercises.map((exercise) => adaptExercise(pack, exercise));
}

function buildHintSet(packId: string, exercise: PackExercise): HintSet | undefined {
  const hints = exercise.hints;
  if (hints === undefined || hints.length === 0) return undefined;
  return {
    id: practiceHintSetId(packId, exercise.id),
    hints: hints.map((hint) => ({ level: hint.level, text: hint.text })),
  };
}

/**
 * The runtime configuration object of the Pyodide Worker: only the keys and
 * packages the Worker's shared rules accept (runtime-config-rules.ts), so the
 * importer can never hand the Worker something it would refuse.
 */
function buildRuntimeConfig(exercise: PackExercise): JsonObject | undefined {
  const config: Record<string, unknown> = {};
  const packages = exercise.allowedPackages ?? [];
  if (packages.length > 0) {
    for (const name of packages) {
      if (!isAllowedRuntimePackage(name)) throw new RangeError(`Package not enabled in the runtime: ${name}`);
    }
    config.packages = [...packages];
  }
  const datasets = exercise.datasets ?? [];
  if (datasets.length > 0) {
    for (const dataset of datasets) {
      if (!isSimpleDatasetFilename(dataset.filename)) {
        throw new RangeError(`Dataset file name rejected by the runtime rules: ${dataset.filename}`);
      }
    }
    config.workspace = {
      datasets: datasets.map((dataset) => ({ filename: dataset.filename, content: dataset.content })),
    };
  }
  for (const key of Object.keys(config)) {
    if (!isAllowedRuntimeConfigKey(key)) throw new RangeError(`Runtime config key not accepted: ${key}`);
  }
  return Object.keys(config).length > 0 ? (config as JsonObject) : undefined;
}
