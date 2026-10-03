import type { RuntimeId } from "../domain";

export const CORE_RUNTIME_ID = {
  PYODIDE: "core.pyodide" as RuntimeId,
} as const;
