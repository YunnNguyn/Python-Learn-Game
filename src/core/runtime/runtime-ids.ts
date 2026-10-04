import type { RuntimeId } from "../domain";

export const CORE_RUNTIME_ID = {
  PYODIDE: "core.pyodide" as RuntimeId,
  LOCAL_PYTHON: "core.local_python" as RuntimeId,
} as const;
