import type { PyodideInterface } from "pyodide";
import type { PyProxy } from "pyodide/ffi";

import type { JsonObject } from "../../domain";

const SETUP_JSON_GLOBAL = "__runtime_setup_json";
const LOAD_SETUP_JSON_CODE =
  '__import__("json").loads(__runtime_setup_json)';

export function createPythonSetupNamespace(
  pyodide: PyodideInterface,
  setupData: JsonObject,
): PyProxy {
  const serializedSetup = JSON.stringify(setupData);

  if (serializedSetup === undefined) {
    throw new Error("Không thể chuyển setupData sang JSON.");
  }

  pyodide.globals.set(SETUP_JSON_GLOBAL, serializedSetup);

  try {
    const namespace = pyodide.runPython(LOAD_SETUP_JSON_CODE);
    if (!(namespace instanceof pyodide.ffi.PyProxy)) {
      throw new Error("Pyodide không tạo được Python globals dictionary.");
    }

    return namespace;
  } finally {
    try {
      pyodide.globals.delete(SETUP_JSON_GLOBAL);
    } catch {
      // Best-effort cleanup of runtime-private conversion state.
    }
  }
}
