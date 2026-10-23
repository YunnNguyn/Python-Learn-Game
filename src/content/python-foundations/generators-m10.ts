import type { GeneratorRegistry } from "../../core/generators";

import { pf23Generator, pf24Generator } from "./generators-m10-charts";
import { pf16Generator, pf17Generator, pf18Generator } from "./generators-m10-numpy";
import { pf19Generator, pf20Generator, pf21Generator, pf22Generator } from "./generators-m10-pandas";
import { generatorId } from "./generators-m10-support";
import { pf25Generator, pf26Generator } from "./generators-m10-workflows";

/**
 * Generators of the M10 missions PF-16..PF-26 (PHASE-08), registered with the rest of the
 * course. Each lives next to the data it needs: NumPy (generators-m10-numpy.ts), pandas
 * (generators-m10-pandas.ts), Matplotlib (generators-m10-charts.ts) and the CSV workflows
 * (generators-m10-workflows.ts + datasets-m10.ts).
 */

export const PYTHON_FOUNDATIONS_M10_GENERATOR_ID = {
  PF16: generatorId("python-foundations.generator.pf16"),
  PF17: generatorId("python-foundations.generator.pf17"),
  PF18: generatorId("python-foundations.generator.pf18"),
  PF19: generatorId("python-foundations.generator.pf19"),
  PF20: generatorId("python-foundations.generator.pf20"),
  PF21: generatorId("python-foundations.generator.pf21"),
  PF22: generatorId("python-foundations.generator.pf22"),
  PF23: generatorId("python-foundations.generator.pf23"),
  PF24: generatorId("python-foundations.generator.pf24"),
  PF25: generatorId("python-foundations.generator.pf25"),
  PF26: generatorId("python-foundations.generator.pf26"),
} as const;

export {
  pf16Generator,
  pf17Generator,
  pf18Generator,
  pf19Generator,
  pf20Generator,
  pf21Generator,
  pf22Generator,
  pf23Generator,
  pf24Generator,
  pf25Generator,
  pf26Generator,
};

export function registerPythonFoundationsM10Generators(registry: GeneratorRegistry): void {
  const G = PYTHON_FOUNDATIONS_M10_GENERATOR_ID;
  registry.registerGenerator(G.PF16, pf16Generator);
  registry.registerGenerator(G.PF17, pf17Generator);
  registry.registerGenerator(G.PF18, pf18Generator);
  registry.registerGenerator(G.PF19, pf19Generator);
  registry.registerGenerator(G.PF20, pf20Generator);
  registry.registerGenerator(G.PF21, pf21Generator);
  registry.registerGenerator(G.PF22, pf22Generator);
  registry.registerGenerator(G.PF23, pf23Generator);
  registry.registerGenerator(G.PF24, pf24Generator);
  registry.registerGenerator(G.PF25, pf25Generator);
  registry.registerGenerator(G.PF26, pf26Generator);
}
