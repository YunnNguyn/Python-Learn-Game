import type { JsonObject } from "../../domain";
import type { RuntimeSystemError } from "../runtime-contracts";

export interface SetupValidationRuntime {
  setGlobal(name: string, value: unknown): void;
  deleteGlobal(name: string): void;
  runPython(code: string): unknown;
}

const SETUP_KEY_VALIDATION_CODE = `(
    __runtime_setup_key.isidentifier()
    and not __import__("keyword").iskeyword(__runtime_setup_key)
    and __runtime_setup_key != "__builtins__"
    and not __runtime_setup_key.startswith("__runtime_")
)`;

export function validateSetupKeys(
  pyodide: SetupValidationRuntime,
  setupData: JsonObject,
): RuntimeSystemError | null {
  for (const key of Object.keys(setupData)) {
    try {
      pyodide.setGlobal("__runtime_setup_key", key);
      const isValid = pyodide.runPython(SETUP_KEY_VALIDATION_CODE);

      if (isValid !== true) {
        return {
          code: "INVALID_SETUP_DATA",
          message: `Tên biến \`${key}\` không hợp lệ hoặc được dành riêng.`,
        };
      }
    } catch (error) {
      return {
        code: "INVALID_SETUP_DATA",
        message: getErrorMessage(
          error,
          "Không thể xác thực tên biến trong setupData.",
        ),
      };
    } finally {
      try {
        pyodide.deleteGlobal("__runtime_setup_key");
      } catch {
        // Best-effort cleanup of runtime-private validation state.
      }
    }
  }

  return null;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim().length > 0
  ) {
    return error.message;
  }

  return fallback;
}
