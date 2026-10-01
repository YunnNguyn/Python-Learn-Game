import type { MissionGeneratorId } from "../domain";

import type { MissionGenerator } from "./mission-generator";

export class GeneratorRegistry {
  private readonly generators = new Map<MissionGeneratorId, MissionGenerator>();

  registerGenerator(
    id: MissionGeneratorId,
    generator: MissionGenerator,
  ): void {
    if (this.generators.has(id)) {
      throw new Error(`Generator ID already registered: ${id}`);
    }

    this.generators.set(id, generator);
  }

  getGenerator(id: MissionGeneratorId): MissionGenerator | undefined {
    return this.generators.get(id);
  }

  getGeneratorIds(): readonly MissionGeneratorId[] {
    return [...this.generators.keys()];
  }
}
