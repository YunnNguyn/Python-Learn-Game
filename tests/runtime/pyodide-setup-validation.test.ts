import { describe, expect, it } from "vitest";

import type { JsonObject } from "../../src/core/domain";
import {
  validateSetupKeys,
  type SetupValidationRuntime,
} from "../../src/core/runtime/pyodide/setup-validation";

class FakeSetupValidationRuntime implements SetupValidationRuntime {
  private currentKey: unknown;
  readonly assignedKeys: unknown[] = [];
  readonly validationSources: string[] = [];

  setGlobal(name: string, value: unknown): void {
    expect(name).toBe("__runtime_setup_key");
    this.currentKey = value;
    this.assignedKeys.push(value);
  }

  deleteGlobal(name: string): void {
    expect(name).toBe("__runtime_setup_key");
    this.currentKey = undefined;
  }

  runPython(code: string): unknown {
    this.validationSources.push(code);

    if (typeof this.currentKey !== "string") {
      return false;
    }

    return this.currentKey !== "bad-key" && this.currentKey !== "class";
  }
}

describe("Pyodide setup-key validation", () => {
  it("accepts the exact browser fixture and validates only its top-level keys", () => {
    const runtime = new FakeSetupValidationRuntime();
    const setupData: JsonObject = {
      values: [2, 5, 8],
      threshold: 5,
      metadata: {
        label: "demo",
      },
    };

    expect(validateSetupKeys(runtime, setupData)).toBeNull();
    expect(runtime.assignedKeys).toEqual(["values", "threshold", "metadata"]);
    expect(runtime.assignedKeys).not.toContain("setupData");
    expect(runtime.assignedKeys).not.toContain("label");
    expect(runtime.assignedKeys).not.toContain(undefined);
    expect(runtime.validationSources).toHaveLength(3);
    for (const source of runtime.validationSources) {
      expect(source).toContain("__runtime_setup_key.isidentifier()");
      expect(source).toContain('iskeyword(__runtime_setup_key)');
      expect(source).not.toContain("next(");
      expect(source).not.toContain("None");
    }
  });

  it("reports the concrete invalid key bad-key", () => {
    const runtime = new FakeSetupValidationRuntime();

    expect(validateSetupKeys(runtime, { "bad-key": 1 })).toEqual({
      code: "INVALID_SETUP_DATA",
      message: "Tên biến `bad-key` không hợp lệ hoặc được dành riêng.",
    });
  });

  it("reports the concrete Python keyword class", () => {
    const runtime = new FakeSetupValidationRuntime();

    expect(validateSetupKeys(runtime, { class: 1 })).toEqual({
      code: "INVALID_SETUP_DATA",
      message: "Tên biến `class` không hợp lệ hoặc được dành riêng.",
    });
  });
});
