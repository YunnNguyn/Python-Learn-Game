import type { MissionTemplate } from "../../core/domain";

// Heavy Pyodide packages (pandas, Matplotlib, scikit-learn, OpenCV) can take
// several seconds to import the first time in a fresh namespace, especially on
// modest machines, so Data/ML missions need a much longer execution deadline
// than the light NumPy exercises. We widen the timeout only for missions that
// actually request those packages (or stage a dataset workspace); plain NumPy
// missions keep a snappy deadline so infinite loops recover quickly.
//
// Moved out of application-services.ts unchanged (PHASE-05-M7) so the practice
// service set applies the same deadlines without importing the CS116 service set.
export const PYODIDE_LIGHT_TIMEOUT_MS = 15_000;
export const PYODIDE_HEAVY_TIMEOUT_MS = 60_000;

export function pyodideExecutionTimeoutMs(template: MissionTemplate): number {
  const config = template.runtime.config;
  if (config === undefined) {
    return PYODIDE_LIGHT_TIMEOUT_MS;
  }
  const packages = Array.isArray(config.packages)
    ? (config.packages as unknown[])
    : [];
  const hasHeavyPackage = packages.some(
    (name) => typeof name === "string" && name.toLowerCase() !== "numpy",
  );
  const hasWorkspace = config.workspace !== undefined;
  return hasHeavyPackage || hasWorkspace
    ? PYODIDE_HEAVY_TIMEOUT_MS
    : PYODIDE_LIGHT_TIMEOUT_MS;
}
