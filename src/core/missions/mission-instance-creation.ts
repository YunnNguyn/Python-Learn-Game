import {
  MissionInstanceSchema,
  type Difficulty,
  type JsonObject,
  type MissionInstance,
  type MissionTemplate,
} from "../domain";

export interface MissionGeneratorOutput {
  readonly learner: {
    readonly objective: string;
    readonly context?: string;
    readonly starterCode?: string;
    readonly data?: JsonObject;
    readonly visibleTests?: readonly JsonObject[];
  };
  readonly runtime?: {
    readonly setupData?: JsonObject;
  };
  readonly grading?: {
    readonly data?: JsonObject;
  };
  readonly world?: {
    readonly initialState?: JsonObject;
  };
}

export interface CreateMissionInstanceInput {
  readonly template: MissionTemplate;
  readonly seed: string;
  readonly difficulty: Difficulty;
  readonly generated: MissionGeneratorOutput;
}

function createMissionInstanceId(
  template: MissionTemplate,
  seed: string,
  difficulty: Difficulty,
): string {
  return [
    "mission-instance",
    encodeURIComponent(template.id),
    `v${template.version}`,
    difficulty,
    encodeURIComponent(seed),
  ].join(":");
}

export function createMissionInstance(
  input: CreateMissionInstanceInput,
): MissionInstance {
  const { template, seed, difficulty, generated } = input;
  const starterCode =
    generated.learner.starterCode ?? template.starterCode;

  const candidate = {
    id: createMissionInstanceId(template, seed, difficulty),
    templateId: template.id,
    templateVersion: template.version,
    seed,
    difficulty,
    conceptIds: [...template.conceptIds],
    learner: {
      objective: generated.learner.objective,
      ...(generated.learner.context !== undefined
        ? { context: generated.learner.context }
        : {}),
      ...(starterCode !== undefined ? { starterCode } : {}),
      ...(generated.learner.data !== undefined
        ? { data: generated.learner.data }
        : {}),
      ...(generated.learner.visibleTests !== undefined
        ? { visibleTests: [...generated.learner.visibleTests] }
        : {}),
    },
    ...(generated.runtime !== undefined
      ? {
          runtime: {
            ...(generated.runtime.setupData !== undefined
              ? { setupData: generated.runtime.setupData }
              : {}),
          },
        }
      : {}),
    ...(generated.grading !== undefined
      ? {
          grading: {
            ...(generated.grading.data !== undefined
              ? { data: generated.grading.data }
              : {}),
          },
        }
      : {}),
    ...(generated.world !== undefined
      ? {
          world: {
            ...(generated.world.initialState !== undefined
              ? { initialState: generated.world.initialState }
              : {}),
          },
        }
      : {}),
  };

  return MissionInstanceSchema.parse(candidate);
}
