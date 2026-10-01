import type { Difficulty, JsonObject } from "../domain";
import type { MissionGeneratorOutput } from "../missions";
import type { SeededRng } from "../random";

export interface MissionGeneratorContext {
  readonly templateVersion: number;
  readonly config?: JsonObject;
  readonly difficulty: Difficulty;
  readonly rng: SeededRng;
}

export interface MissionGenerator {
  generate(context: MissionGeneratorContext): MissionGeneratorOutput;
}
