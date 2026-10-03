import { describe, expect, it } from "vitest";

import {
  CS116_PRODUCTION_CONTENT,
  CS116_PRODUCTION_HINT_SETS,
  CS116_PRODUCTION_TEMPLATE_VS01,
} from "../../../src/content/cs116";
import { validateContent } from "../../../src/core/content";
import { GeneratorRegistry } from "../../../src/core/generators";
import { GraderRegistry, registerCoreGraders } from "../../../src/core/grading";
import { CORE_RUNTIME_ID } from "../../../src/core/runtime";
import { registerCs116Generators } from "../../../src/content/cs116";

describe("Phase A production CS116 slice", () => {
  it("validates the real course/world/lesson/activity/template graph", () => {
    const generators = new GeneratorRegistry();
    const graders = new GraderRegistry();
    registerCs116Generators(generators);
    registerCoreGraders(graders);

    const result = validateContent(CS116_PRODUCTION_CONTENT, {
      extensionCapabilities: {
        generatorIds: generators.getGeneratorIds(),
        graderIds: graders.getGraderIds(),
        runtimeIds: [CORE_RUNTIME_ID.PYODIDE],
        hintSetIds: CS116_PRODUCTION_HINT_SETS.map((hintSet) => hintSet.id),
      },
      schemaSupport: { supportedSchemaVersions: [1] },
    });

    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("exposes a progressive H1 through H4 hint set", () => {
    expect(CS116_PRODUCTION_TEMPLATE_VS01.hintSetId).toBe(CS116_PRODUCTION_HINT_SETS[0]!.id);
    expect(CS116_PRODUCTION_HINT_SETS[0]!.hints.map((hint) => hint.level)).toEqual([
      "H1",
      "H2",
      "H3",
      "H4",
    ]);
  });

  it("requires NumPy for the first playable mission", () => {
    expect(CS116_PRODUCTION_TEMPLATE_VS01.runtime.config).toEqual({
      packages: ["numpy"],
    });
  });
});
