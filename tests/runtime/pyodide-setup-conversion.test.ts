import { beforeAll, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";

import type { JsonObject } from "../../src/core/domain";
import { createPythonSetupNamespace } from "../../src/core/runtime/pyodide/setup-conversion";

describe("Pyodide setup JSON conversion", () => {
  let pyodide: PyodideInterface;

  beforeAll(async () => {
    pyodide = await loadPyodide();
  }, 30_000);

  function evaluate(setupData: JsonObject, code: string): unknown {
    const namespace = createPythonSetupNamespace(pyodide, setupData);

    try {
      return pyodide.runPython(code, { globals: namespace });
    } finally {
      namespace.destroy();
    }
  }

  it("maps a top-level JSON null to Python None", () => {
    expect(evaluate({ value: null }, "value is None")).toBe(true);
  });

  it("maps a nested object null to Python None", () => {
    expect(
      evaluate({ config: { value: null } }, 'config["value"] is None'),
    ).toBe(true);
  });

  it("maps an array null to Python None", () => {
    expect(evaluate({ items: [null] }, "items[0] is None")).toBe(true);
  });

  it("maps a deeply nested null to Python None", () => {
    expect(
      evaluate(
        { items: [{ value: null }] },
        'items[0]["value"] is None',
      ),
    ).toBe(true);
  });

  it("preserves normal Python semantics for a mixed JSON fixture", () => {
    expect(
      evaluate(
        {
          flag: true,
          nothing: null,
          items: [1, "two", false],
          config: { name: "demo" },
        },
        `(
          flag is True
          and nothing is None
          and items == [1, "two", False]
          and config["name"] == "demo"
          and type(flag).__name__ == "bool"
          and type(nothing).__name__ == "NoneType"
          and type(items).__name__ == "list"
          and type(config).__name__ == "dict"
        )`,
      ),
    ).toBe(true);
  });
});
