import type { PyodideInterface } from "pyodide";

/**
 * Shared NumPy availability handling for the tests that need REAL NumPy in Pyodide
 * (PHASE-07 / M9). NumPy is a Pyodide package fetched from the package index, so it can
 * be unreachable on an offline machine.
 *
 *  - Default: the NumPy tests call `ctx.skip()`: they are reported as SKIPPED (NOT RUN),
 *    never as passed.
 *  - STRICT (acceptance): PACK_VERIFY_STRICT=1 (the same switch the M7 pack verification
 *    uses) makes an unavailable NumPy a FAILURE, so a validation run cannot be green
 *    without the NumPy missions having really executed.
 *
 *   PowerShell:  $env:PACK_VERIFY_STRICT = "1"; npx vitest run tests/m9
 */

export interface NumpyState {
  available: boolean;
  error: string;
}

export function strictNumpy(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const value = env?.PACK_VERIFY_STRICT?.trim().toLowerCase();
  return value === "1" || value === "true";
}

export async function tryLoadNumpy(pyodide: PyodideInterface): Promise<NumpyState> {
  try {
    await pyodide.loadPackage(["numpy"]);
    pyodide.runPython("import numpy");
    return { available: true, error: "" };
  } catch (error) {
    const lines = (error instanceof Error ? error.message : String(error))
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("See https://"));
    const error0 =
      lines.find((line) => /ModuleNotFoundError|fetch failed|Error/i.test(line)) ?? lines[lines.length - 1] ?? "unknown error";
    return { available: false, error: error0 };
  }
}

/** Call at the top of every NumPy-dependent test. */
export function requireNumpy(ctx: { skip: (reason?: string) => void }, state: NumpyState): void {
  if (state.available) return;
  if (strictNumpy()) {
    throw new Error(`NumPy is required (PACK_VERIFY_STRICT=1) but could not be loaded: ${state.error}`);
  }
  ctx.skip(`NOT RUN: numpy unavailable (${state.error})`);
}
