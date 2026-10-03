import {
  Difficulty,
  type JsonObject,
} from "../../../core/domain";
import type {
  MissionGenerator,
  MissionGeneratorContext,
} from "../../../core/generators";

type MatrixShapeMode = "CREATE_AND_INSPECT" | "INSPECT_SHAPE";

interface MatrixShapeConfig {
  readonly mode: MatrixShapeMode;
  readonly baseRows: number;
  readonly baseColumns: number;
  readonly valueMin: number;
  readonly valueMaxExclusive: number;
}

const CONFIG_KEYS = [
  "mode",
  "baseRows",
  "baseColumns",
  "valueMin",
  "valueMaxExclusive",
] as const;

const UINT32_RANGE = 0x1_0000_0000;

function assertTemplateVersion(templateVersion: number): void {
  if (!Number.isSafeInteger(templateVersion) || templateVersion < 1) {
    throw new RangeError("Matrix Shape generator requires templateVersion >= 1.");
  }
}

function assertExactConfigKeys(config: JsonObject): void {
  const allowed = new Set<string>(CONFIG_KEYS);
  for (const key of Object.keys(config)) {
    if (!allowed.has(key)) {
      throw new TypeError(`Matrix Shape config contains unsupported field: ${key}`);
    }
  }
}

function requireSafeInteger(
  config: JsonObject,
  key: keyof Pick<
    MatrixShapeConfig,
    "baseRows" | "baseColumns" | "valueMin" | "valueMaxExclusive"
  >,
): number {
  const value = config[key];
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`Matrix Shape config.${key} must be a safe integer.`);
  }

  return value as number;
}

function parseConfig(config: JsonObject | undefined): MatrixShapeConfig {
  if (config === undefined) {
    throw new TypeError("Matrix Shape generator requires config.");
  }

  assertExactConfigKeys(config);

  const mode = config.mode;
  if (mode !== "CREATE_AND_INSPECT" && mode !== "INSPECT_SHAPE") {
    throw new TypeError(
      "Matrix Shape config.mode must be CREATE_AND_INSPECT or INSPECT_SHAPE.",
    );
  }

  const baseRows = requireSafeInteger(config, "baseRows");
  const baseColumns = requireSafeInteger(config, "baseColumns");
  const valueMin = requireSafeInteger(config, "valueMin");
  const valueMaxExclusive = requireSafeInteger(config, "valueMaxExclusive");

  if (baseRows < 1) {
    throw new RangeError("Matrix Shape config.baseRows must be >= 1.");
  }
  if (baseColumns < 1) {
    throw new RangeError("Matrix Shape config.baseColumns must be >= 1.");
  }
  if (valueMaxExclusive <= valueMin) {
    throw new RangeError(
      "Matrix Shape valueMaxExclusive must be greater than valueMin.",
    );
  }
  if (valueMaxExclusive - valueMin > UINT32_RANGE) {
    throw new RangeError("Matrix Shape value range must be at most 2^32.");
  }

  return {
    mode,
    baseRows,
    baseColumns,
    valueMin,
    valueMaxExclusive,
  };
}

function addSafe(base: number, delta: number, label: string): number {
  const value = base + delta;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Matrix Shape ${label} exceeds the safe integer range.`);
  }
  return value;
}

function dimensions(
  config: MatrixShapeConfig,
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
        addSafe(config.baseRows, 1, "row count"),
        addSafe(config.baseColumns, 1, "column count"),
      ];
  }
}

function objectiveFor(mode: MatrixShapeMode): string {
  if (mode === "CREATE_AND_INSPECT") {
    return "Construct a NumPy array from the sensor readings, then inspect its shape and number of dimensions (ndim).";
  }

  return "Inspect the telemetry matrix and report its shape and number of dimensions (ndim).";
}

export const matrixShapeGenerator: MissionGenerator = {
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

    return {
      learner: {
        objective: objectiveFor(parsed.mode),
        context:
          parsed.mode === "CREATE_AND_INSPECT"
            ? "Dữ liệu `matrix` đã có sẵn. Tạo ndarray vào `result`, sau đó lưu `result.shape` vào `shape_result` và `result.ndim` vào `ndim_result`."
            : "Dùng dữ liệu matrix đã cho để xác định shape và ndim của mảng.",
        data: { matrix },
      },
      runtime: {
        setupData: { matrix },
      },
      grading: {
        data: {
          expectedShape: [rows, columns],
          expectedNdim: 2,
          expectedValues: matrix.map((row) => [...row]),
        },
      },
      world: {
        initialState: { rows, columns },
      },
    };
  },
};
