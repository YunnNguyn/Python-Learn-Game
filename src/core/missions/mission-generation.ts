import type { Difficulty, MissionInstance, MissionTemplate } from "../domain";
import type { GeneratorRegistry } from "../generators";
import { createSeededRng } from "../random";
import { deriveGenerationAttemptSeed } from "./generation-attempt-seed";
import { createMissionInstance } from "./mission-instance-creation";
import type { MissionInstanceValidator } from "./mission-instance-validator";

export interface GenerateMissionInstanceInput {
  readonly template: MissionTemplate;
  readonly generatorRegistry: GeneratorRegistry;
  readonly baseSeed: string;
  readonly difficulty: Difficulty;
  readonly validator?: MissionInstanceValidator;
  readonly maxAttempts?: number;
}

export interface GeneratedMissionInstance {
  readonly instance: MissionInstance;
  readonly attemptIndex: number;
}

/** Production composition helper: generator -> candidate -> optional validator -> accepted instance. */
export function generateMissionInstance(
  input: GenerateMissionInstanceInput,
): GeneratedMissionInstance {
  const maxAttempts = input.maxAttempts ?? 12;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive safe integer.");
  }

  const generator = input.generatorRegistry.getGenerator(input.template.generator.id);
  if (generator === undefined) {
    throw new Error(`Generator not registered: ${input.template.generator.id}`);
  }

  const rejectionMessages: string[] = [];
  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    const generationSeed = deriveGenerationAttemptSeed(input.baseSeed, attemptIndex);
    const generated = generator.generate({
      templateVersion: input.template.version,
      config: input.template.generator.config,
      difficulty: input.difficulty,
      rng: createSeededRng(generationSeed),
    });

    const instance = createMissionInstance({
      template: input.template,
      seed: input.baseSeed,
      difficulty: input.difficulty,
      generated,
    });

    if (input.validator === undefined) {
      return { instance, attemptIndex };
    }

    const validation = input.validator.validate(instance);
    if (validation.valid) {
      return { instance, attemptIndex };
    }

    rejectionMessages.push(
      validation.issues.map((issue) => issue.code).join(", ") || "invalid candidate",
    );
  }

  throw new Error(
    `Mission generation exhausted ${maxAttempts} attempts for ${input.template.id}: ${rejectionMessages.join(" | ")}`,
  );
}
