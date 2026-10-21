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
 * stderr capture, observation after SUCCESS or PYTHON_EXCEPTION). It does not enforce
 * the Worker's timeouts and does not stage dataset files. It is a verification
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

class NodePyodideRuntime implements RuntimeManager {
  private setupData: JsonObject = {};

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
        await this.loadPackages(packages as string[]);
      } catch (error) {
        return {
          ok: false as const,
          error: { code: "PACKAGE_LOAD_FAILED", message: error instanceof Error ? error.message : String(error) },
        };
      }
    }
    this.setupData = request.setupData ?? {};
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

  private async execute(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    const { pyodide } = this;
    const namespace = createPythonSetupNamespace(pyodide, this.setupData);
    let stdout = "";
    let stderr = "";
    pyodide.setStdout({ write: (buffer: Uint8Array) => ((stdout += decoder.decode(buffer)), buffer.length) });
    pyodide.setStderr({ write: (buffer: Uint8Array) => ((stderr += decoder.decode(buffer)), buffer.length) });
    try {
      let base: RuntimeExecutionResult;
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
      if (request.observeVariables === undefined) return base;
      const serialized = await pyodide.runPythonAsync(buildObservationExpression(request.observeVariables), {
        globals: namespace,
      });
      return { ...base, serialized: JSON.parse(String(serialized)) as JsonObject } as RuntimeExecutionResult;
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
