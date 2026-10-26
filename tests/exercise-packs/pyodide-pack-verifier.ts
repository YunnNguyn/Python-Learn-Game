import type { PyodideInterface } from "pyodide";

import { GraderRegistry, registerCoreGraders } from "../../src/core/grading";
import { adaptExercise, type ExercisePack } from "../../src/core/exercise-packs";
import { MissionEngine } from "../../src/core/missions";
import {
  RUNTIME_EXECUTION_STATUS,
  type RuntimeExecutionRequest,
  type RuntimeExecutionResult,
  type RuntimeManager,
} from "../../src/core/runtime";
import { runFunctionProbes } from "../../src/core/runtime/pyodide/function-probe-helper";
import {
  capturePreviewsAndScan,
  clearStalePreviews,
  configureMatplotlib,
} from "../../src/core/runtime/pyodide/workspace-preview";
import { buildObservationExpression } from "../../src/core/runtime/pyodide/observation-helper";
import { createPythonSetupNamespace } from "../../src/core/runtime/pyodide/setup-conversion";
import type { JsonObject } from "../../src/core/domain";

/**
 * Repeatable reference verification of an Exercise Pack (PHASE-05-M7, section 11).
 *
 * WHAT IS REAL: the Pyodide interpreter (the same WebAssembly build the app ships),
 * the production setup conversion (`createPythonSetupNamespace`), the production
 * observation helper (`buildObservationExpression`), the real `MissionEngine`, the
 * real declarative grader and the real pack adapter (the exact template/instance an
 * imported exercise runs with).
 *
 * WHAT IS NOT: the Web Worker transport and the browser. `NodePyodideRuntime` below
 * stands in for `createPyodideRuntimeManager` and mirrors the Worker's per-request
 * semantics (a clean namespace from the setup data for every Run/Submit, stdout and
 * stderr capture, observation after SUCCESS or PYTHON_EXCEPTION). M10: it also mirrors
 * the Worker's workspace contract - inline datasets are staged into `data/`, `artifacts/`
 * is reset, Matplotlib is configured headless (Agg) and the open figures are captured by
 * the production `workspace-preview` module before the observations/probes run. It does
 * not enforce the Worker's timeouts. It is a verification
 * harness for pack CONTENT, not a replacement for the in-browser acceptance run.
 *
 * Reference solutions are executed here, by a developer-run test, never by the app.
 */

export interface SubmissionOutcome {
  readonly passed: boolean;
  readonly executionStatus: string;
  readonly failedChecks: readonly string[];
  readonly exception?: string;
}

export interface ExerciseVerification {
  readonly exerciseId: string;
  /** null when the exercise has no reference solution. */
  readonly reference: SubmissionOutcome | null;
  readonly starter: SubmissionOutcome;
}

const decoder = new TextDecoder();

export class NodePyodideRuntime implements RuntimeManager {
  private setupData: JsonObject = {};
  private datasets: readonly { filename: string; content: string }[] = [];
  /** M10: the workspace listing of the most recent execution (previews included). */
  lastWorkspace: RuntimeExecutionResult["workspace"];

  constructor(
    private readonly pyodide: PyodideInterface,
    private readonly loadPackages: (names: readonly string[]) => Promise<void>,
  ) {}

  async initialize() {
    return { ok: true as const };
  }

  async prepareMission(request: { runtimeConfig?: JsonObject; setupData?: JsonObject }) {
    const packages = request.runtimeConfig?.packages;
    if (Array.isArray(packages) && packages.length > 0) {
      try {
        if (packages.includes("matplotlib")) configureMatplotlib(this.pyodide);
        await this.loadPackages(packages as string[]);
      } catch (error) {
        return {
          ok: false as const,
          error: { code: "PACKAGE_LOAD_FAILED", message: error instanceof Error ? error.message : String(error) },
        };
      }
    }
    this.setupData = request.setupData ?? {};
    const workspace = request.runtimeConfig?.workspace as JsonObject | undefined;
    const datasets = workspace?.datasets;
    this.datasets = Array.isArray(datasets)
      ? (datasets as unknown as { filename: string; content: string }[])
      : [];
    return { ok: true as const };
  }

  run(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    return this.execute(request);
  }

  submit(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    return this.execute(request);
  }

  dispose(): void {
    // Nothing owned: the Pyodide instance is shared by the caller.
  }

  /** Mirrors the Worker's `stageMissionWorkspace`: data/ rebuilt, artifacts/ cleared. */
  private stageWorkspace(): void {
    const { pyodide } = this;
    pyodide.globals.set("__mission_datasets_json", JSON.stringify(this.datasets));
    try {
      pyodide.runPython(
        "import os, shutil, json, pathlib\n" +
          'shutil.rmtree("data", ignore_errors=True)\n' +
          'os.makedirs("data", exist_ok=True)\n' +
          'shutil.rmtree("artifacts", ignore_errors=True)\n' +
          'os.makedirs("artifacts", exist_ok=True)\n' +
          "__entry = None\n" +
          "for __entry in json.loads(__mission_datasets_json):\n" +
          '    (pathlib.Path("data") / __entry["filename"]).write_text(__entry["content"], encoding="utf-8")\n' +
          "del __entry\n",
      );
    } finally {
      pyodide.globals.delete("__mission_datasets_json");
    }
  }

  private async execute(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    const { pyodide } = this;
    this.stageWorkspace();
    const namespace = createPythonSetupNamespace(pyodide, this.setupData);
    let stdout = "";
    let stderr = "";
    pyodide.setStdout({ write: (buffer: Uint8Array) => ((stdout += decoder.decode(buffer)), buffer.length) });
    pyodide.setStderr({ write: (buffer: Uint8Array) => ((stderr += decoder.decode(buffer)), buffer.length) });
    try {
      let base: RuntimeExecutionResult;
      clearStalePreviews(pyodide);
      try {
        const value = await pyodide.runPythonAsync(request.code, { globals: namespace });
        (value as { destroy?: () => void } | undefined)?.destroy?.();
        base = { status: RUNTIME_EXECUTION_STATUS.SUCCESS, stdout, stderr };
      } catch (error) {
        if (error instanceof pyodide.ffi.PythonError) {
          base = {
            status: RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION,
            stdout,
            stderr,
            exception: { type: (error as { type?: string }).type, message: error.message },
          };
        } else {
          return {
            status: RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR,
            stdout,
            stderr,
            error: { code: "PYODIDE_EXECUTION_FAILED", message: String((error as Error)?.message ?? error) },
          };
        }
      }
      // M10: like the Worker, open figures are rendered/closed and the workspace listed
      // right after the learner program, BEFORE the observations and probes.
      this.lastWorkspace =
        base.status === RUNTIME_EXECUTION_STATUS.SUCCESS ||
        base.status === RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION
          ? capturePreviewsAndScan(pyodide)
          : undefined;
      if (this.lastWorkspace !== undefined) base = { ...base, workspace: this.lastWorkspace } as RuntimeExecutionResult;
      // M9: like the Worker, functions are exercised only after a SUCCESSFUL run.
      const probes =
        request.functionProbes !== undefined &&
        request.functionProbes.length > 0 &&
        base.status === RUNTIME_EXECUTION_STATUS.SUCCESS
          ? request.functionProbes
          : undefined;
      if (request.observeVariables === undefined && probes === undefined) return base;
      const observed =
        request.observeVariables === undefined
          ? { variables: {} }
          : (JSON.parse(
              String(
                await pyodide.runPythonAsync(buildObservationExpression(request.observeVariables), {
                  globals: namespace,
                }),
              ),
            ) as JsonObject);
      const functionResults =
        probes === undefined ? undefined : await runFunctionProbes(pyodide, namespace, probes);
      return {
        ...base,
        serialized: functionResults === undefined ? observed : { ...observed, functionResults },
      } as RuntimeExecutionResult;
    } finally {
      pyodide.setStdout();
      pyodide.setStderr();
      namespace.destroy();
    }
  }
}

async function submitOnce(engine: MissionEngine, code: string): Promise<SubmissionOutcome> {
  const { execution, grading } = await engine.submit(code);
  const exception =
    execution.status === RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION
      ? `${execution.exception.type ?? "Exception"}: ${execution.exception.message.trim().split("\n").slice(-1)[0]}`
      : execution.status === RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR
        ? `${execution.error.code ?? "RUNTIME_ERROR"}: ${execution.error.message}`
        : undefined;
  return {
    passed: grading?.passed === true,
    executionStatus: execution.status,
    failedChecks: (grading?.checks ?? [])
      .filter((check) => !check.passed)
      .map((check) => `${check.type}${check.variable !== undefined ? `(${check.variable})` : ""}`),
    ...(exception !== undefined ? { exception } : {}),
  };
}

/** Runs every exercise's reference solution and starter code through the real engine and grader. */
export async function verifyPackExercises(
  pyodide: PyodideInterface,
  pack: ExercisePack,
  loadPackages: (names: readonly string[]) => Promise<void> = async (names) => {
    await pyodide.loadPackage([...names]);
  },
): Promise<ExerciseVerification[]> {
  const graders = new GraderRegistry();
  registerCoreGraders(graders);
  const results: ExerciseVerification[] = [];
  for (const exercise of pack.exercises) {
    const adapted = adaptExercise(pack, exercise);
    const engine = new MissionEngine(new NodePyodideRuntime(pyodide, loadPackages), graders);
    const loaded = await engine.loadMission(adapted.template, adapted.instance);
    if (!loaded.ok) throw new Error(`${exercise.id}: mission failed to load: ${loaded.error.message}`);
    try {
      const reference =
        exercise.referenceSolution === undefined ? null : await submitOnce(engine, exercise.referenceSolution);
      const starter = await submitOnce(engine, exercise.starterCode);
      results.push({ exerciseId: exercise.id, reference, starter });
    } finally {
      engine.dispose();
    }
  }
  return results;
}
