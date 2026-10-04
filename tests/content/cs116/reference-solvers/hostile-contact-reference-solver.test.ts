import { describe, expect, it } from "vitest";

import {
  CS116_PRODUCTION_TEMPLATE_VS06,
  getCs116MissionInstanceValidator,
  registerCs116Generators,
  solveHostileContactReference,
} from "../../../../src/content/cs116";
import { Difficulty } from "../../../../src/core/domain";
import { GeneratorRegistry } from "../../../../src/core/generators";
import { generateMissionInstance } from "../../../../src/core/missions";

describe("Hostile Contact reference solver", () => {
  it("matches hidden production grading data across deterministic variants", () => {
    const generators = new GeneratorRegistry();
    registerCs116Generators(generators);

    for (const seed of ["hostile-ref-a", "hostile-ref-b", "hostile-ref-c"]) {
      const { instance } = generateMissionInstance({
        template: CS116_PRODUCTION_TEMPLATE_VS06,
        generatorRegistry: generators,
        baseSeed: seed,
        difficulty: Difficulty.EASY,
        validator: getCs116MissionInstanceValidator(
          CS116_PRODUCTION_TEMPLATE_VS06.generator.id,
        ),
      });
      const reference = solveHostileContactReference(instance);
      const grading = instance.grading?.data;

      expect(grading?.expectedContacts).toEqual(reference.contacts);
      expect(grading?.expectedTelemetryShape).toEqual(reference.shape);
      expect(grading?.expectedNdim).toBe(reference.ndim);
      expect(grading?.expectedDistanceColumn).toEqual(reference.distanceColumn);
      expect(grading?.expectedThreatColumn).toEqual(reference.threatColumn);
      expect(grading?.expectedMask).toEqual(reference.mask);
      expect(grading?.expectedEntityIds).toEqual(reference.expectedEntityIds);
    }
  });
});
