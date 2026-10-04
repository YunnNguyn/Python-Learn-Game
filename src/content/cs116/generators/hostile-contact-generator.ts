import { Difficulty, type JsonObject } from "../../../core/domain";
import type {
  MissionGenerator,
  MissionGeneratorContext,
} from "../../../core/generators";

type InstructionLevel = "TRANSFER" | "REVIEW";

interface HostileContactConfig {
  readonly instructionLevel: InstructionLevel;
  readonly baseEntityCount: number;
  readonly distanceMin: number;
  readonly distanceMaxExclusive: number;
  readonly threatMin: number;
  readonly threatMaxExclusive: number;
  readonly distanceLimitMin: number;
  readonly distanceLimitMaxExclusive: number;
  readonly threatThresholdMin: number;
  readonly threatThresholdMaxExclusive: number;
}

const CONFIG_KEYS = [
  "instructionLevel",
  "baseEntityCount",
  "distanceMin",
  "distanceMaxExclusive",
  "threatMin",
  "threatMaxExclusive",
  "distanceLimitMin",
  "distanceLimitMaxExclusive",
  "threatThresholdMin",
  "threatThresholdMaxExclusive",
] as const;

const UINT32_RANGE = 0x1_0000_0000;

function assertTemplateVersion(templateVersion: number): void {
  if (!Number.isSafeInteger(templateVersion) || templateVersion < 1) {
    throw new RangeError("Hostile Contact generator requires templateVersion >= 1.");
  }
}

function assertExactConfigKeys(config: JsonObject): void {
  const allowed = new Set<string>(CONFIG_KEYS);
  for (const key of Object.keys(config)) {
    if (!allowed.has(key)) {
      throw new TypeError(`Hostile Contact config contains unsupported field: ${key}`);
    }
  }
}

function requireSafeInteger(
  config: JsonObject,
  key: Exclude<keyof HostileContactConfig, "instructionLevel">,
): number {
  const value = config[key];
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`Hostile Contact config.${key} must be a safe integer.`);
  }
  return value as number;
}

function assertHalfOpenRange(min: number, maxExclusive: number, label: string): void {
  if (maxExclusive <= min) {
    throw new RangeError(
      `Hostile Contact ${label} maxExclusive must be greater than min.`,
    );
  }
  if (maxExclusive - min > UINT32_RANGE) {
    throw new RangeError(`Hostile Contact ${label} range must be at most 2^32.`);
  }
}

function parseConfig(config: JsonObject | undefined): HostileContactConfig {
  if (config === undefined) {
    throw new TypeError("Hostile Contact generator requires config.");
  }

  assertExactConfigKeys(config);

  const instructionLevel = config.instructionLevel;
  if (instructionLevel !== "TRANSFER" && instructionLevel !== "REVIEW") {
    throw new TypeError(
      "Hostile Contact config.instructionLevel must be TRANSFER or REVIEW.",
    );
  }

  const baseEntityCount = requireSafeInteger(config, "baseEntityCount");
  const distanceMin = requireSafeInteger(config, "distanceMin");
  const distanceMaxExclusive = requireSafeInteger(config, "distanceMaxExclusive");
  const threatMin = requireSafeInteger(config, "threatMin");
  const threatMaxExclusive = requireSafeInteger(config, "threatMaxExclusive");
  const distanceLimitMin = requireSafeInteger(config, "distanceLimitMin");
  const distanceLimitMaxExclusive = requireSafeInteger(
    config,
    "distanceLimitMaxExclusive",
  );
  const threatThresholdMin = requireSafeInteger(config, "threatThresholdMin");
  const threatThresholdMaxExclusive = requireSafeInteger(
    config,
    "threatThresholdMaxExclusive",
  );

  if (baseEntityCount < 3) {
    throw new RangeError("Hostile Contact config.baseEntityCount must be >= 3.");
  }
  assertHalfOpenRange(distanceMin, distanceMaxExclusive, "distance");
  assertHalfOpenRange(threatMin, threatMaxExclusive, "threat");
  assertHalfOpenRange(distanceLimitMin, distanceLimitMaxExclusive, "distance limit");
  assertHalfOpenRange(
    threatThresholdMin,
    threatThresholdMaxExclusive,
    "threat threshold",
  );

  return {
    instructionLevel,
    baseEntityCount,
    distanceMin,
    distanceMaxExclusive,
    threatMin,
    threatMaxExclusive,
    distanceLimitMin,
    distanceLimitMaxExclusive,
    threatThresholdMin,
    threatThresholdMaxExclusive,
  };
}

function addSafe(base: number, delta: number): number {
  const value = base + delta;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("Hostile Contact entity count exceeds the safe integer range.");
  }
  return value;
}

function entityCount(
  config: HostileContactConfig,
  difficulty: MissionGeneratorContext["difficulty"],
): number {
  switch (difficulty) {
    case Difficulty.EASY:
      return config.baseEntityCount;
    case Difficulty.NORMAL:
      return addSafe(config.baseEntityCount, 2);
    case Difficulty.HARD:
      return addSafe(config.baseEntityCount, 4);
  }
}

function objectiveFor(instructionLevel: InstructionLevel): string {
  return instructionLevel === "REVIEW"
    ? "Rebuild the NumPy telemetry workflow from memory, inspect its structure, extract columns, combine conditions, and select matching contacts."
    : "Extract telemetry columns, combine two NumPy conditions, and select exactly the contacts that satisfy both rules.";
}

export const hostileContactGenerator: MissionGenerator = {
  generate({ templateVersion, config, difficulty, rng }) {
    assertTemplateVersion(templateVersion);
    const parsed = parseConfig(config);
    const count = entityCount(parsed, difficulty);

    const entityIds = Array.from(
      { length: count },
      (_, index) => `contact-${index + 1}`,
    );
    const contacts = entityIds.map(() => [
      rng.nextInt(parsed.distanceMin, parsed.distanceMaxExclusive),
      rng.nextInt(parsed.threatMin, parsed.threatMaxExclusive),
    ]);
    const distanceLimit = rng.nextInt(
      parsed.distanceLimitMin,
      parsed.distanceLimitMaxExclusive,
    );
    const threatThreshold = rng.nextInt(
      parsed.threatThresholdMin,
      parsed.threatThresholdMaxExclusive,
    );

    const distanceColumn = contacts.map((row) => row[0]!);
    const threatColumn = contacts.map((row) => row[1]!);
    const expectedMask = contacts.map(
      (row) => row[0]! <= distanceLimit && row[1]! >= threatThreshold,
    );
    const expectedEntityIds = entityIds.filter((_, index) => expectedMask[index]);

    return {
      learner: {
        objective: objectiveFor(parsed.instructionLevel),
        context:
          "Mỗi hàng của `contacts` có dạng `[distance, threat]`. Chọn contact thỏa đồng thời `distance <= distanceLimit` và `threat >= threatThreshold`.",
        data: {
          entityIds,
          columns: ["distance", "threat"],
          contacts,
          distanceLimit,
          threatThreshold,
        },
      },
      runtime: {
        setupData: {
          entityIds,
          contacts,
          distanceLimit,
          threatThreshold,
        },
      },
      grading: {
        data: {
          expectedTelemetryShape: [count, 2],
          expectedNdim: 2,
          expectedContacts: contacts.map((row) => [...row]),
          expectedDistanceColumn: distanceColumn,
          expectedThreatColumn: threatColumn,
          expectedColumnShape: [count],
          expectedMask,
          expectedMaskShape: [count],
          expectedEntityIds,
          expectedResultShape: [expectedEntityIds.length],
        },
      },
      world: {
        initialState: {
          entityIds,
          distanceLimit,
          threatThreshold,
        },
      },
    };
  },
};
