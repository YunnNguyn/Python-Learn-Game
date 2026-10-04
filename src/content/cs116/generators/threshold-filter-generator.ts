import {
  Difficulty,
  type JsonObject,
} from "../../../core/domain";
import type {
  MissionGenerator,
  MissionGeneratorContext,
} from "../../../core/generators";

type InstructionLevel = "GUIDED" | "INDEPENDENT";
type ThresholdComparison = "GT" | "GTE";

interface ThresholdFilterConfig {
  readonly instructionLevel: InstructionLevel;
  readonly baseEntityCount: number;
  readonly valueMin: number;
  readonly valueMaxExclusive: number;
  readonly thresholdMin: number;
  readonly thresholdMaxExclusive: number;
  readonly comparison: ThresholdComparison;
}

const CONFIG_KEYS = [
  "instructionLevel",
  "baseEntityCount",
  "valueMin",
  "valueMaxExclusive",
  "thresholdMin",
  "thresholdMaxExclusive",
  "comparison",
] as const;

const UINT32_RANGE = 0x1_0000_0000;

function assertTemplateVersion(templateVersion: number): void {
  if (!Number.isSafeInteger(templateVersion) || templateVersion < 1) {
    throw new RangeError(
      "Threshold Filter generator requires templateVersion >= 1.",
    );
  }
}

function assertExactConfigKeys(config: JsonObject): void {
  const allowed = new Set<string>(CONFIG_KEYS);
  for (const key of Object.keys(config)) {
    if (!allowed.has(key)) {
      throw new TypeError(
        `Threshold Filter config contains unsupported field: ${key}`,
      );
    }
  }
}

function requireSafeInteger(
  config: JsonObject,
  key:
    | "baseEntityCount"
    | "valueMin"
    | "valueMaxExclusive"
    | "thresholdMin"
    | "thresholdMaxExclusive",
): number {
  const value = config[key];
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(
      `Threshold Filter config.${key} must be a safe integer.`,
    );
  }
  return value as number;
}

function assertHalfOpenRange(
  min: number,
  maxExclusive: number,
  label: string,
): void {
  if (maxExclusive <= min) {
    throw new RangeError(
      `Threshold Filter ${label} maxExclusive must be greater than min.`,
    );
  }
  if (maxExclusive - min > UINT32_RANGE) {
    throw new RangeError(
      `Threshold Filter ${label} range must be at most 2^32.`,
    );
  }
}

function parseConfig(config: JsonObject | undefined): ThresholdFilterConfig {
  if (config === undefined) {
    throw new TypeError("Threshold Filter generator requires config.");
  }

  assertExactConfigKeys(config);

  const instructionLevel = config.instructionLevel;
  if (instructionLevel !== "GUIDED" && instructionLevel !== "INDEPENDENT") {
    throw new TypeError(
      "Threshold Filter config.instructionLevel must be GUIDED or INDEPENDENT.",
    );
  }

  const comparison = config.comparison;
  if (comparison !== "GT" && comparison !== "GTE") {
    throw new TypeError(
      "Threshold Filter config.comparison must be GT or GTE.",
    );
  }

  const baseEntityCount = requireSafeInteger(config, "baseEntityCount");
  const valueMin = requireSafeInteger(config, "valueMin");
  const valueMaxExclusive = requireSafeInteger(config, "valueMaxExclusive");
  const thresholdMin = requireSafeInteger(config, "thresholdMin");
  const thresholdMaxExclusive = requireSafeInteger(
    config,
    "thresholdMaxExclusive",
  );

  if (baseEntityCount < 2) {
    throw new RangeError(
      "Threshold Filter config.baseEntityCount must be >= 2.",
    );
  }
  assertHalfOpenRange(valueMin, valueMaxExclusive, "value");
  assertHalfOpenRange(thresholdMin, thresholdMaxExclusive, "threshold");

  return {
    instructionLevel,
    baseEntityCount,
    valueMin,
    valueMaxExclusive,
    thresholdMin,
    thresholdMaxExclusive,
    comparison,
  };
}

function addSafe(base: number, delta: number): number {
  const value = base + delta;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      "Threshold Filter entity count exceeds the safe integer range.",
    );
  }
  return value;
}

function entityCount(
  config: ThresholdFilterConfig,
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
  if (instructionLevel === "GUIDED") {
    return "Use the requested comparison to build a boolean mask, then select the sensor entities that satisfy the threshold rule.";
  }

  return "Select exactly the sensor entities whose values satisfy the requested threshold rule.";
}

export const thresholdFilterGenerator: MissionGenerator = {
  generate({ templateVersion, config, difficulty, rng }) {
    assertTemplateVersion(templateVersion);
    const parsed = parseConfig(config);
    const count = entityCount(parsed, difficulty);

    const entityIds = Array.from(
      { length: count },
      (_, index) => `sensor-${index + 1}`,
    );
    const values = entityIds.map(() =>
      rng.nextInt(parsed.valueMin, parsed.valueMaxExclusive),
    );
    const threshold = rng.nextInt(
      parsed.thresholdMin,
      parsed.thresholdMaxExclusive,
    );

    const expectedMask = values.map((value) =>
      parsed.comparison === "GT" ? value > threshold : value >= threshold,
    );
    const expectedEntityIds = entityIds.filter((_, index) => expectedMask[index]);

    return {
      learner: {
        objective: objectiveFor(parsed.instructionLevel),
        context:
          parsed.comparison === "GT"
            ? "Quy tắc `GT`: giữ cảm biến có `value > threshold`. Hãy tạo boolean mask rồi dùng mask để lọc ID."
            : "Quy tắc `GTE`: giữ cảm biến có `value >= threshold`. Hãy tạo boolean mask rồi dùng mask để lọc ID.",
        data: {
          entityIds,
          values,
          threshold,
          comparison: parsed.comparison,
        },
      },
      runtime: {
        setupData: {
          entityIds,
          values,
          threshold,
        },
      },
      grading: {
        data: {
          expectedMask,
          expectedMaskShape: [count],
          expectedEntityIds,
          expectedResultShape: [expectedEntityIds.length],
        },
      },
      world: {
        initialState: {
          entityIds,
          values,
          threshold,
        },
      },
    };
  },
};
