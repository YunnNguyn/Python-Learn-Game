import type { PyodideInterface } from "pyodide";

import { deriveActivityVariantSeed } from "../../src/app/services/application-services";
import {
  PYTHON_FOUNDATIONS_CONTENT,
  PYTHON_FOUNDATIONS_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_M9_ACTIVITY_IDS,
  registerPythonFoundationsGenerators,
} from "../../src/content/python-foundations";
import { ContentRegistry } from "../../src/core/content";
import {
  Difficulty,
  type LearningActivityId,
  type MissionInstance,
  type MissionTemplate,
} from "../../src/core/domain";
import { GeneratorRegistry } from "../../src/core/generators";
import { GraderRegistry, registerCoreGraders, type GraderResult } from "../../src/core/grading";
import { generateMissionInstance, MissionEngine } from "../../src/core/missions";
import { RUNTIME_EXECUTION_STATUS, type RuntimeExecutionResult } from "../../src/core/runtime";
import { NodePyodideRuntime } from "../exercise-packs/pyodide-pack-verifier";

/**
 * Runs Python Foundations missions the way the app does - the real generator, the real
 * MissionEngine, the real declarative grader, the production setup conversion and
 * observation helper - on a REAL Pyodide (the pure-Python standard library only, so it
 * needs no network). Not real here: the Web Worker transport and the browser (see
 * pyodide-pack-verifier.ts for the exact split).
 */

export interface MissionOutcome {
  readonly passed: boolean;
  readonly status: string;
  /** `type(variable)` of every failed check, e.g. "PYTHON_TYPE(edge_label)". */
  readonly failedChecks: readonly string[];
  /** Variable names that have at least one failed check. */
  readonly failedVariables: readonly string[];
  /** M9: names of the functions whose FUNCTION_CASES check failed. */
  readonly failedFunctions: readonly string[];
  readonly exceptionType?: string;
  readonly stdout: string;
  readonly grading?: GraderResult;
}

const registry = (() => {
  const content = new ContentRegistry();
  for (const concept of PYTHON_FOUNDATIONS_CONTENT.concepts) content.registerConcept(concept);
  for (const template of PYTHON_FOUNDATIONS_CONTENT.missionTemplates) {
    content.registerMissionTemplate(template);
  }
  for (const activity of PYTHON_FOUNDATIONS_CONTENT.activities) content.registerActivity(activity);
  return content;
})();

const generators = new GeneratorRegistry();
registerPythonFoundationsGenerators(generators);
const graders = new GraderRegistry();
registerCoreGraders(graders);

export function templateOf(activityId: LearningActivityId): MissionTemplate {
  const activity = registry.getActivity(activityId);
  if (activity === undefined || !("missionTemplateId" in activity)) {
    throw new Error(`not an executable activity: ${activityId}`);
  }
  const template = registry.getMissionTemplate(activity.missionTemplateId);
  if (template === undefined) throw new Error(`missing template for ${activityId}`);
  return template;
}

/** The exact instance `createMissionSession` builds for (activity, variantIndex). */
export function instanceOf(activityId: LearningActivityId, variantIndex: number): MissionInstance {
  const template = templateOf(activityId);
  return generateMissionInstance({
    template,
    generatorRegistry: generators,
    baseSeed: deriveActivityVariantSeed(activityId, template.version, variantIndex),
    difficulty: Difficulty.EASY,
  }).instance;
}

/** Packages are only fetched for the missions that declare them (the M9 NumPy missions). */
const fetchPackages =
  (pyodide: PyodideInterface) =>
  async (names: readonly string[]): Promise<void> => {
    await pyodide.loadPackage([...names]);
  };

export async function submitOnPyodide(
  pyodide: PyodideInterface,
  activityId: LearningActivityId,
  variantIndex: number,
  code: string,
): Promise<MissionOutcome> {
  const template = templateOf(activityId);
  const instance = instanceOf(activityId, variantIndex);
  const runtime = new NodePyodideRuntime(pyodide, fetchPackages(pyodide));
  const engine = new MissionEngine(runtime, graders);
  const loaded = await engine.loadMission(template, instance);
  if (!loaded.ok) throw new Error(`${activityId}: ${loaded.error.message}`);
  try {
    const { execution, grading } = await engine.submit(code);
    return summarize(execution, grading);
  } finally {
    engine.dispose();
  }
}

export async function runOnPyodide(
  pyodide: PyodideInterface,
  activityId: LearningActivityId,
  variantIndex: number,
  code: string,
): Promise<RuntimeExecutionResult> {
  const engine = new MissionEngine(new NodePyodideRuntime(pyodide, fetchPackages(pyodide)), graders);
  const loaded = await engine.loadMission(templateOf(activityId), instanceOf(activityId, variantIndex));
  if (!loaded.ok) throw new Error(`${activityId}: ${loaded.error.message}`);
  try {
    return (await engine.run(code)).execution;
  } finally {
    engine.dispose();
  }
}

function summarize(execution: RuntimeExecutionResult, grading: GraderResult | undefined): MissionOutcome {
  const failed = (grading?.checks ?? []).filter((check) => !check.passed);
  return {
    passed: grading?.passed === true,
    status: execution.status,
    failedChecks: failed.map(
      (check) => `${check.type}${check.variable !== undefined ? `(${check.variable})` : ""}`,
    ),
    failedVariables: [...new Set(failed.flatMap((check) => (check.variable === undefined ? [] : [check.variable])))],
    failedFunctions: [...new Set(failed.flatMap((check) => (check.function === undefined ? [] : [check.function])))],
    ...(execution.status === RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION
      ? { exceptionType: execution.exception.type ?? "Exception" }
      : {}),
    stdout: "stdout" in execution ? execution.stdout : "",
    ...(grading !== undefined ? { grading } : {}),
  };
}

export const ACTIVITY_IDS: readonly LearningActivityId[] = PYTHON_FOUNDATIONS_ACTIVITY_IDS as unknown as readonly LearningActivityId[];
/** PF-08..PF-15 (M9-01..M9-08). */
export const M9_ACTIVITY_IDS: readonly LearningActivityId[] = PYTHON_FOUNDATIONS_M9_ACTIVITY_IDS as unknown as readonly LearningActivityId[];
