import {
  Difficulty,
  type JsonObject,
} from "../../../core/domain";
import type {
  MissionGenerator,
  MissionGeneratorContext,
} from "../../../core/generators";

interface ColumnExtractConfig {
  readonly baseRows: number;
  readonly baseColumns: number;
  readonly valueMin: number;
  readonly valueMaxExclusive: number;
}

const CONFIG_KEYS = [
  "baseRows",
  "baseColumns",
  "valueMin",
  "valueMaxExclusive",
] as const;

const UINT32_RANGE = 0x1_0000_0000;

function assertTemplateVersion(templateVersion: number): void {
  if (!Number.isSafeInteger(templateVersion) || templateVersion < 1) {
    throw new RangeError(
      "Column Extract generator requires templateVersion >= 1.",
    );
  }
}

function assertExactConfigKeys(config: JsonObject): void {
  const allowed = new Set<string>(CONFIG_KEYS);
  for (const key of Object.keys(config)) {
    if (!allowed.has(key)) {
      throw new TypeError(
        `Column Extract config contains unsupported field: ${key}`,
      );
    }
  }
}

function requireSafeInteger(
  config: JsonObject,
  key: keyof ColumnExtractConfig,
): number {
  const value = config[key];
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`Column Extract config.${key} must be a safe integer.`);
  }
  return value as number;
}

function parseConfig(config: JsonObject | undefined): ColumnExtractConfig {
  if (config === undefined) {
    throw new TypeError("Column Extract generator requires config.");
  }

  assertExactConfigKeys(config);

  const baseRows = requireSafeInteger(config, "baseRows");
  const baseColumns = requireSafeInteger(config, "baseColumns");
  const valueMin = requireSafeInteger(config, "valueMin");
  const valueMaxExclusive = requireSafeInteger(config, "valueMaxExclusive");

  if (baseRows < 2) {
    throw new RangeError("Column Extract config.baseRows must be >= 2.");
  }
  if (baseColumns < 2) {
    throw new RangeError("Column Extract config.baseColumns must be >= 2.");
  }
  if (valueMaxExclusive <= valueMin) {
    throw new RangeError(
      "Column Extract valueMaxExclusive must be greater than valueMin.",
    );
  }
  if (valueMaxExclusive - valueMin > UINT32_RANGE) {
    throw new RangeError("Column Extract value range must be at most 2^32.");
  }

  return {
    baseRows,
    baseColumns,
    valueMin,
    valueMaxExclusive,
  };
}

function addSafe(base: number, delta: number, label: string): number {
  const value = base + delta;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `Column Extract ${label} exceeds the safe integer range.`,
    );
  }
  return value;
}

function dimensions(
  config: ColumnExtractConfig,
  difficulty: MissionGeneratorContext["difficulty"],
): readonly [number, number] {
  switch (difficulty) {
    case Difficulty.EASY:
      return [config.baseRows, config.baseColumns];
    case Difficulty.NORMAL:
      return [
        addSafe(config.baseRows, 1, "row count"),
        config.baseColumns,
      ];
    case Difficulty.HARD:
      return [
        addSafe(config.baseRows, 2, "row count"),
        addSafe(config.baseColumns, 1, "column count"),
      ];
  }
}

export const columnExtractGenerator: MissionGenerator = {
  generate({ templateVersion, config, difficulty, rng }) {
    assertTemplateVersion(templateVersion);
    const parsed = parseConfig(config);
    const [rows, columns] = dimensions(parsed, difficulty);

    const matrix: number[][] = [];
    for (let row = 0; row < rows; row += 1) {
      const values: number[] = [];
      for (let column = 0; column < columns; column += 1) {
        values.push(rng.nextInt(parsed.valueMin, parsed.valueMaxExclusive));
      }
      matrix.push(values);
    }

    const targetColumnIndex = rng.nextInt(0, columns);

    return {
      learner: {
        objective:
          "Extract the requested threat-channel column from the telemetry matrix and inspect the extracted data.",
        data: {
          matrix,
          targetColumnIndex,
        },
      },
      runtime: {
        setupData: {
          matrix,
          targetColumnIndex,
        },
      },
      grading: {
        data: { targetColumnIndex },
      },
      world: {
        initialState: {
          rowCount: rows,
          columnCount: columns,
          targetColumnIndex,
        },
      },
    };
  },
};
