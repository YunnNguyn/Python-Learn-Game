import { describe, expect, it } from "vitest";

import {
  PYODIDE_HEAVY_TIMEOUT_MS,
  PYODIDE_LIGHT_TIMEOUT_MS,
  pyodideExecutionTimeoutMs,
} from "../../src/app/services/pyodide-execution-timeout";
import { PYTHON_FOUNDATIONS_CONTENT, PYTHON_FOUNDATIONS_M10_ACTIVITY_IDS } from "../../src/content/python-foundations";

/**
 * PHASE-08 / M10: the execution deadline each M10 mission gets. NumPy-only missions keep the
 * snappy light deadline (so an infinite loop recovers quickly); anything that imports pandas
 * or Matplotlib - or stages a dataset workspace - gets the heavy one, because the first
 * import in a fresh worker is slow. The deadline itself, the worker replacement after a
 * timeout and cancellation are covered by pyodide-runtime-manager.test.ts.
 */
describe("M10 execution deadlines", () => {
  const templateOf = (activityId: string) => {
    const activity = PYTHON_FOUNDATIONS_CONTENT.activities.find((entry) => String(entry.id) === activityId) as unknown as { missionTemplateId: string };
    return PYTHON_FOUNDATIONS_CONTENT.missionTemplates.find((entry) => String(entry.id) === activity.missionTemplateId)!;
  };

  it("keeps the NumPy-only missions on the light deadline and gives pandas / Matplotlib / dataset missions the heavy one", () => {
    const ids = PYTHON_FOUNDATIONS_M10_ACTIVITY_IDS as readonly string[];
    ids.forEach((id, index) => {
      const timeout = pyodideExecutionTimeoutMs(templateOf(id));
      expect(timeout, id).toBe(index < 3 ? PYODIDE_LIGHT_TIMEOUT_MS : PYODIDE_HEAVY_TIMEOUT_MS);
    });
    expect(PYODIDE_LIGHT_TIMEOUT_MS).toBeLessThan(PYODIDE_HEAVY_TIMEOUT_MS);
  });

  it("leaves the earlier missions as they were: PF-14 and PF-15 (NumPy) stay light", () => {
    for (const id of ["python-foundations.pf14", "python-foundations.pf15"]) {
      expect(pyodideExecutionTimeoutMs(templateOf(id))).toBe(PYODIDE_LIGHT_TIMEOUT_MS);
    }
  });
});
