import { describe, expect, it } from "vitest";

import {
  Difficulty,
  LearningStage,
  MissionTemplateSchema,
  type Difficulty as DifficultyValue,
  type JsonObject,
  type MissionGeneratorId,
} from "../../../../src/core/domain";
import {
  GeneratorRegistry,
  type MissionGenerator,
} from "../../../../src/core/generators";
import {
  createMissionInstance,
  type MissionGeneratorOutput,
} from "../../../../src/core/missions";
import {
  createSeededRng,
  type SeededRng,
} from "../../../../src/core/random";
import {
  columnExtractGenerator,
  csvInspectionGenerator,
  pandasPracticeGenerator,
  dataSciencePracticeGenerator,
  CS116_GENERATOR_ID,
  hostileContactGenerator,
  matrixShapeGenerator,
  registerCs116Generators,
  thresholdFilterGenerator,
} from "../../../../src/content/cs116";

const MATRIX_CONFIG = {
  mode: "CREATE_AND_INSPECT",
  baseRows: 2,
  baseColumns: 3,
  valueMin: -4,
  valueMaxExclusive: 8,
} satisfies JsonObject;

const COLUMN_CONFIG = {
  baseRows: 3,
  baseColumns: 3,
  valueMin: 10,
  valueMaxExclusive: 80,
} satisfies JsonObject;

const FILTER_CONFIG = {
  instructionLevel: "GUIDED",
  baseEntityCount: 4,
  valueMin: 0,
  valueMaxExclusive: 20,
  thresholdMin: 4,
  thresholdMaxExclusive: 16,
  comparison: "GT",
} satisfies JsonObject;

const HOSTILE_CONFIG = {
  instructionLevel: "TRANSFER",
  baseEntityCount: 5,
  distanceMin: 10,
  distanceMaxExclusive: 100,
  threatMin: 1,
  threatMaxExclusive: 11,
  distanceLimitMin: 35,
  distanceLimitMaxExclusive: 75,
  threatThresholdMin: 4,
  threatThresholdMaxExclusive: 9,
} satisfies JsonObject;

function generate(
  generator: MissionGenerator,
  config: JsonObject,
  difficulty: DifficultyValue = Difficulty.EASY,
  seed = "fixture-seed",
): MissionGeneratorOutput {
  return generator.generate({
    templateVersion: 1,
    config,
    difficulty,
    rng: createSeededRng(seed),
  });
}

function matrixFrom(output: MissionGeneratorOutput): number[][] {
  return output.learner.data!.matrix as number[][];
}

function valuesFrom(output: MissionGeneratorOutput): number[] {
  return output.learner.data!.values as number[];
}

class SequenceRng implements SeededRng {
  readonly calls: Array<readonly [number, number]> = [];
  private cursor = 0;

  constructor(private readonly sequence: readonly number[]) {}

  nextFloat(): number {
    throw new Error("SequenceRng.nextFloat is not expected in these tests.");
  }

  nextInt(minInclusive: number, maxExclusive: number): number {
    const value = this.sequence[this.cursor];
    if (value === undefined) {
      throw new Error("SequenceRng exhausted.");
    }
    if (value < minInclusive || value >= maxExclusive) {
      throw new Error(
        `SequenceRng value ${value} is outside [${minInclusive}, ${maxExclusive}).`,
      );
    }

    this.cursor += 1;
    this.calls.push([minInclusive, maxExclusive]);
    return value;
  }

  pick<T>(_items: readonly T[]): T {
    throw new Error("SequenceRng.pick is not expected in these tests.");
  }

  shuffle<T>(_items: readonly T[]): T[] {
    throw new Error("SequenceRng.shuffle is not expected in these tests.");
  }
}

function templateFor(
  id: string,
  generatorId: MissionGeneratorId,
  config: JsonObject,
) {
  return MissionTemplateSchema.parse({
    id,
    version: 1,
    conceptIds: ["numpy.array"],
    allowedStages: [LearningStage.INDEPENDENT],
    generator: { id: generatorId, config },
    grader: { id: "grader.test.cs116" },
    runtime: { id: "runtime.test.cs116" },
  });
}

describe("CS116 generator registration", () => {
  it("exports the locked NumPy generators plus the pandas generators", () => {
    expect(Object.values(CS116_GENERATOR_ID)).toEqual([
      "cs116.numpy.matrix-shape",
      "cs116.numpy.column-extract",
      "cs116.numpy.threshold-filter",
      "cs116.numpy.hostile-contact",
      "cs116.pandas.csv-inspection",
      "cs116.pandas.practice",
      "cs116.data-science.practice",
    ]);
  });

  it("registers all implementations in deterministic order", () => {
    const registry = new GeneratorRegistry();

    registerCs116Generators(registry);

    expect(registry.getGeneratorIds()).toEqual([
      CS116_GENERATOR_ID.MATRIX_SHAPE,
      CS116_GENERATOR_ID.COLUMN_EXTRACT,
      CS116_GENERATOR_ID.THRESHOLD_FILTER,
      CS116_GENERATOR_ID.HOSTILE_CONTACT,
      CS116_GENERATOR_ID.CSV_INSPECTION,
      CS116_GENERATOR_ID.PANDAS_PRACTICE,
      CS116_GENERATOR_ID.DATA_SCIENCE_PRACTICE,
    ]);
    expect(registry.getGenerator(CS116_GENERATOR_ID.MATRIX_SHAPE)).toBe(
      matrixShapeGenerator,
    );
    expect(registry.getGenerator(CS116_GENERATOR_ID.COLUMN_EXTRACT)).toBe(
      columnExtractGenerator,
    );
    expect(registry.getGenerator(CS116_GENERATOR_ID.THRESHOLD_FILTER)).toBe(
      thresholdFilterGenerator,
    );
    expect(registry.getGenerator(CS116_GENERATOR_ID.HOSTILE_CONTACT)).toBe(
      hostileContactGenerator,
    );
    expect(registry.getGenerator(CS116_GENERATOR_ID.CSV_INSPECTION)).toBe(
      csvInspectionGenerator,
    );
    expect(registry.getGenerator(CS116_GENERATOR_ID.PANDAS_PRACTICE)).toBe(
      pandasPracticeGenerator,
    );
    expect(registry.getGenerator(CS116_GENERATOR_ID.DATA_SCIENCE_PRACTICE)).toBe(
      dataSciencePracticeGenerator,
    );
  });

  it("relies on normal registry duplicate failure on second registration", () => {
    const registry = new GeneratorRegistry();
    registerCs116Generators(registry);

    expect(() => registerCs116Generators(registry)).toThrow(
      "Generator ID already registered: cs116.numpy.matrix-shape",
    );
    expect(registry.getGeneratorIds()).toHaveLength(7);
  });
});

describe("CSV Inspection Generator", () => {
  it("is deterministic and keeps expected CSV structure in grading data", () => {
    const first = generate(csvInspectionGenerator, {}, Difficulty.EASY, "csv-a");
    const second = generate(csvInspectionGenerator, {}, Difficulty.HARD, "csv-b");

    expect(second).toEqual(first);
    expect(first.grading?.data).toEqual({
      expectedShape: [3, 3],
      expectedColumns: ["contact_id", "distance", "threat"],
    });
    expect(first.learner.data).toBeUndefined();
  });
});

describe("pandas Practice Generator", () => {
  it("keeps column-selection expectations hidden from learner data", () => {
    const first = generate(
      pandasPracticeGenerator,
      { mode: "SELECT_COLUMN" },
      Difficulty.EASY,
      "pandas-select-a",
    );
    const second = generate(
      pandasPracticeGenerator,
      { mode: "SELECT_COLUMN" },
      Difficulty.HARD,
      "pandas-select-b",
    );

    expect(second).toEqual(first);
    expect(first.learner.data).toBeUndefined();
    expect(first.grading?.data).toEqual({
      expectedSeriesValues: [38, 77, 51, 29, 60],
      expectedSeriesNdim: 1,
      expectedFrameShape: [5, 1],
    });
  });

  it("publishes only the filtering threshold and hides expected answers", () => {
    const output = generate(
      pandasPracticeGenerator,
      { mode: "FILTER_ROWS" },
      Difficulty.NORMAL,
      "pandas-filter",
    );

    expect(output.learner.data).toEqual({ threshold: 5 });
    expect(output.learner.data).not.toHaveProperty("expectedFilteredIds");
    // The starter code relies on `threshold` existing as a Python global, so
    // it must be injected through runtime setup data (learner.data is display-only).
    expect(output.runtime?.setupData).toEqual({ threshold: 5 });
    expect(output.runtime?.setupData).not.toHaveProperty("expectedFilteredIds");
    expect(output.grading?.data).toEqual({
      expectedFilteredIds: ["contact-2", "contact-3", "contact-4"],
      expectedFilteredCount: 3,
    });
  });

  it("rejects unsupported pandas practice modes", () => {
    expect(() =>
      generate(pandasPracticeGenerator, { mode: "UNKNOWN" }),
    ).toThrow();
  });
});

describe("Data Science Practice Generator", () => {
  it("keeps deterministic hidden expectations for all F4 modes", () => {
    const modes = [
      "MISSING_VALUES",
      "GROUPBY_AGGREGATE",
      "PIVOT_TABLE",
      "MATPLOTLIB_LINE_PLOT",
      "MATPLOTLIB_SCATTER_PLOT",
      "PANDAS_MERGE",
      "PIL_IMAGE_ARRAY",
      "PIL_CROP_RESIZE",
    ] as const;

    for (const mode of modes) {
      const first = generate(
        dataSciencePracticeGenerator,
        { mode },
        Difficulty.EASY,
        "data-science-a",
      );
      const second = generate(
        dataSciencePracticeGenerator,
        { mode },
        Difficulty.HARD,
        "data-science-b",
      );

      expect(second).toEqual(first);
      expect(first.grading?.data).toBeDefined();
      expect(first.learner.data).toBeUndefined();
    }
  });

  it("publishes the intended hidden targets for representative pandas and plot tasks", () => {
    expect(
      generate(dataSciencePracticeGenerator, {
        mode: "MISSING_VALUES",
      }).grading?.data,
    ).toEqual({
      expectedMissingBefore: 2,
      expectedMissingAfter: 0,
      expectedFilledValues: [10, 20, 20, 20, 60],
    });

    expect(
      generate(dataSciencePracticeGenerator, {
        mode: "GROUPBY_AGGREGATE",
      }).grading?.data,
    ).toEqual({
      expectedMeanScores: { A: 110, B: 70 },
      expectedGroupCount: 2,
    });

    expect(
      generate(dataSciencePracticeGenerator, {
        mode: "MATPLOTLIB_LINE_PLOT",
      }).grading?.data,
    ).toMatchObject({
      expectedLineCount: 1,
      expectedArtifactExists: true,
      expectedPointCount: 5,
      expectedFinalLoss: 0.31,
    });
  });

  it("rejects unsupported data science modes", () => {
    expect(() =>
      generate(dataSciencePracticeGenerator, { mode: "UNKNOWN" }),
    ).toThrow();
  });
});

describe("Matrix Shape Generator", () => {
  it("reproduces identical output across multiple fixed seeds", () => {
    for (const seed of ["matrix-alpha", "matrix-beta", "matrix-gamma"]) {
      const first = generate(
        matrixShapeGenerator,
        MATRIX_CONFIG,
        Difficulty.HARD,
        seed,
      );
      const second = generate(
        matrixShapeGenerator,
        MATRIX_CONFIG,
        Difficulty.HARD,
        seed,
      );

      expect(second).toEqual(first);
    }
  });

  it("uses the locked EASY/NORMAL/HARD dimensions and exact rectangular size", () => {
    const cases = [
      [Difficulty.EASY, 2, 3],
      [Difficulty.NORMAL, 3, 3],
      [Difficulty.HARD, 3, 4],
    ] as const;

    for (const [difficulty, rows, columns] of cases) {
      const output = generate(
        matrixShapeGenerator,
        MATRIX_CONFIG,
        difficulty,
        `matrix-${difficulty}`,
      );
      const matrix = matrixFrom(output);

      expect(matrix).toHaveLength(rows);
      expect(matrix.every((row) => row.length === columns)).toBe(true);
      expect(output.grading!.data!.expectedShape).toEqual([rows, columns]);
      expect(output.grading!.data!.expectedNdim).toBe(2);
      expect(output.world!.initialState).toEqual({ rows, columns });
    }
  });

  it("keeps every generated value inside the configured half-open range", () => {
    const output = generate(
      matrixShapeGenerator,
      MATRIX_CONFIG,
      Difficulty.HARD,
      "matrix-range",
    );

    for (const value of matrixFrom(output).flat()) {
      expect(value).toBeGreaterThanOrEqual(-4);
      expect(value).toBeLessThan(8);
    }
  });

  it("consumes matrix values in row-major order", () => {
    const rng = new SequenceRng([1, 2, 3, 4]);
    const output = matrixShapeGenerator.generate({
      templateVersion: 1,
      config: {
        mode: "INSPECT_SHAPE",
        baseRows: 2,
        baseColumns: 2,
        valueMin: 0,
        valueMaxExclusive: 10,
      },
      difficulty: Difficulty.EASY,
      rng,
    });

    expect(matrixFrom(output)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    expect(rng.calls).toEqual([
      [0, 10],
      [0, 10],
      [0, 10],
      [0, 10],
    ]);
  });

  it("distinguishes CREATE_AND_INSPECT from INSPECT_SHAPE without exposing answers", () => {
    const create = generate(matrixShapeGenerator, MATRIX_CONFIG);
    const inspect = generate(matrixShapeGenerator, {
      ...MATRIX_CONFIG,
      mode: "INSPECT_SHAPE",
    });

    expect(create.learner.objective).not.toBe(inspect.learner.objective);
    expect(create.learner.objective).toContain("Construct");
    expect(inspect.learner.objective).toContain("Inspect");
    expect(create.learner.data).not.toHaveProperty("expectedShape");
    expect(create.learner.data).not.toHaveProperty("expectedNdim");
    expect(inspect.learner.data).not.toHaveProperty("expectedShape");
    expect(inspect.learner.data).not.toHaveProperty("expectedNdim");
  });

  it("uses changed seeds to change generated matrix data", () => {
    const first = generate(
      matrixShapeGenerator,
      MATRIX_CONFIG,
      Difficulty.HARD,
      "matrix-variant-a",
    );
    const second = generate(
      matrixShapeGenerator,
      MATRIX_CONFIG,
      Difficulty.HARD,
      "matrix-variant-b",
    );

    expect(matrixFrom(second)).not.toEqual(matrixFrom(first));
  });
});

describe("Column Extract Generator", () => {
  it("is deterministic for a fixed seed and varies generated data with a changed seed", () => {
    const first = generate(
      columnExtractGenerator,
      COLUMN_CONFIG,
      Difficulty.HARD,
      "column-a",
    );
    const reproduced = generate(
      columnExtractGenerator,
      COLUMN_CONFIG,
      Difficulty.HARD,
      "column-a",
    );
    const variant = generate(
      columnExtractGenerator,
      COLUMN_CONFIG,
      Difficulty.HARD,
      "column-b",
    );

    expect(reproduced).toEqual(first);
    expect(variant.learner.data).not.toEqual(first.learner.data);
  });

  it("uses the locked difficulty dimensions and keeps targetColumnIndex in bounds", () => {
    const cases = [
      [Difficulty.EASY, 3, 3],
      [Difficulty.NORMAL, 4, 3],
      [Difficulty.HARD, 5, 4],
    ] as const;

    for (const [difficulty, rows, columns] of cases) {
      const output = generate(
        columnExtractGenerator,
        COLUMN_CONFIG,
        difficulty,
        `column-${difficulty}`,
      );
      const matrix = matrixFrom(output);
      const targetColumnIndex = output.learner.data!.targetColumnIndex as number;

      expect(matrix).toHaveLength(rows);
      expect(matrix.every((row) => row.length === columns)).toBe(true);
      expect(targetColumnIndex).toBeGreaterThanOrEqual(0);
      expect(targetColumnIndex).toBeLessThan(columns);
      expect(output.runtime!.setupData!.targetColumnIndex).toBe(
        targetColumnIndex,
      );
      expect(output.grading!.data).toEqual({
        targetColumnIndex,
        expectedValues: matrix.map((row) => row[targetColumnIndex]!),
        expectedShape: [rows],
      });
      expect(output.world!.initialState).toEqual({
        rowCount: rows,
        columnCount: columns,
        targetColumnIndex,
      });
    }
  });

  it("keeps values in range, hides expected results from the learner, and leaves solution code unlocked", () => {
    const output = generate(
      columnExtractGenerator,
      COLUMN_CONFIG,
      Difficulty.HARD,
      "column-boundary",
    );
    const matrix = matrixFrom(output);
    const targetColumnIndex = output.learner.data!.targetColumnIndex as number;

    for (const value of matrix.flat()) {
      expect(value).toBeGreaterThanOrEqual(10);
      expect(value).toBeLessThan(80);
    }
    expect(output.learner.starterCode).toBeUndefined();
    expect(output.learner.objective).not.toContain("[:,");
    expect(output.learner.data).not.toHaveProperty("expectedShape");
    expect(output.learner.data).not.toHaveProperty("expectedValues");
    expect(output.grading!.data).toMatchObject({
      targetColumnIndex,
      expectedShape: [matrix.length],
      expectedValues: matrix.map((row) => row[targetColumnIndex]!),
    });
    expect(output.grading!.data).not.toHaveProperty("resultShape");
  });

  it("samples the target column only after all row-major matrix values", () => {
    const rng = new SequenceRng([10, 20, 30, 40, 1]);
    const output = columnExtractGenerator.generate({
      templateVersion: 1,
      config: {
        baseRows: 2,
        baseColumns: 2,
        valueMin: 0,
        valueMaxExclusive: 50,
      },
      difficulty: Difficulty.EASY,
      rng,
    });

    expect(matrixFrom(output)).toEqual([
      [10, 20],
      [30, 40],
    ]);
    expect(output.learner.data!.targetColumnIndex).toBe(1);
    expect(rng.calls).toEqual([
      [0, 50],
      [0, 50],
      [0, 50],
      [0, 50],
      [0, 2],
    ]);
  });
});

describe("Threshold Filter Generator", () => {
  it("is deterministic and uses the locked entity counts by difficulty", () => {
    const cases = [
      [Difficulty.EASY, 4],
      [Difficulty.NORMAL, 6],
      [Difficulty.HARD, 8],
    ] as const;

    for (const [difficulty, count] of cases) {
      const first = generate(
        thresholdFilterGenerator,
        FILTER_CONFIG,
        difficulty,
        `filter-${difficulty}`,
      );
      const second = generate(
        thresholdFilterGenerator,
        FILTER_CONFIG,
        difficulty,
        `filter-${difficulty}`,
      );

      expect(second).toEqual(first);
      expect(first.learner.data!.entityIds).toHaveLength(count);
      expect(first.learner.data!.values).toHaveLength(count);
    }
  });

  it("keeps generated values and threshold in their configured ranges", () => {
    const output = generate(
      thresholdFilterGenerator,
      FILTER_CONFIG,
      Difficulty.HARD,
      "filter-ranges",
    );

    for (const value of valuesFrom(output)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(20);
    }
    const threshold = output.learner.data!.threshold as number;
    expect(threshold).toBeGreaterThanOrEqual(4);
    expect(threshold).toBeLessThan(16);
  });

  it("computes exact expectedEntityIds for GT and GTE in entity order", () => {
    const base = {
      instructionLevel: "GUIDED",
      baseEntityCount: 3,
      valueMin: 0,
      valueMaxExclusive: 10,
      thresholdMin: 5,
      thresholdMaxExclusive: 6,
    } satisfies JsonObject;

    const gtRng = new SequenceRng([4, 5, 6, 5]);
    const gt = thresholdFilterGenerator.generate({
      templateVersion: 1,
      config: { ...base, comparison: "GT" },
      difficulty: Difficulty.EASY,
      rng: gtRng,
    });
    expect(gt.grading!.data!.expectedEntityIds).toEqual(["sensor-3"]);

    const gteRng = new SequenceRng([4, 5, 6, 5]);
    const gte = thresholdFilterGenerator.generate({
      templateVersion: 1,
      config: { ...base, comparison: "GTE" },
      difficulty: Difficulty.EASY,
      rng: gteRng,
    });
    expect(gte.grading!.data!.expectedEntityIds).toEqual([
      "sensor-2",
      "sensor-3",
    ]);
  });

  it("keeps expectedEntityIds hidden from the learner payload", () => {
    const output = generate(thresholdFilterGenerator, FILTER_CONFIG);

    expect(output.learner.data).not.toHaveProperty("expectedEntityIds");
    expect(output.grading!.data).toHaveProperty("expectedEntityIds");
  });

  it("distinguishes GUIDED scaffolding from INDEPENDENT objectives", () => {
    const guided = generate(thresholdFilterGenerator, FILTER_CONFIG);
    const independent = generate(thresholdFilterGenerator, {
      ...FILTER_CONFIG,
      instructionLevel: "INDEPENDENT",
    });

    expect(guided.learner.objective).toContain("boolean mask");
    expect(independent.learner.objective).not.toContain("boolean mask");
    expect(independent.learner.objective).toContain("threshold rule");
  });

  it("returns empty and universal candidates directly without internal retry", () => {
    const emptyRng = new SequenceRng([1, 2, 10]);
    const empty = thresholdFilterGenerator.generate({
      templateVersion: 1,
      config: {
        instructionLevel: "INDEPENDENT",
        baseEntityCount: 2,
        valueMin: 0,
        valueMaxExclusive: 3,
        thresholdMin: 10,
        thresholdMaxExclusive: 11,
        comparison: "GT",
      },
      difficulty: Difficulty.EASY,
      rng: emptyRng,
    });

    expect(empty.grading!.data!.expectedEntityIds).toEqual([]);
    expect(emptyRng.calls).toHaveLength(3);

    const universalRng = new SequenceRng([8, 9, 1]);
    const universal = thresholdFilterGenerator.generate({
      templateVersion: 1,
      config: {
        instructionLevel: "INDEPENDENT",
        baseEntityCount: 2,
        valueMin: 8,
        valueMaxExclusive: 10,
        thresholdMin: 1,
        thresholdMaxExclusive: 2,
        comparison: "GT",
      },
      difficulty: Difficulty.EASY,
      rng: universalRng,
    });

    expect(universal.grading!.data!.expectedEntityIds).toEqual([
      "sensor-1",
      "sensor-2",
    ]);
    expect(universalRng.calls).toHaveLength(3);
  });

  it("uses changed seeds to vary candidate data rather than only labels", () => {
    const first = generate(
      thresholdFilterGenerator,
      FILTER_CONFIG,
      Difficulty.HARD,
      "filter-variant-a",
    );
    const second = generate(
      thresholdFilterGenerator,
      FILTER_CONFIG,
      Difficulty.HARD,
      "filter-variant-b",
    );

    expect(second.learner.data).not.toEqual(first.learner.data);
  });
});

describe("Hostile Contact Generator", () => {
  it("is deterministic and produces hidden combined-condition grading data", () => {
    const first = generate(
      hostileContactGenerator,
      HOSTILE_CONFIG,
      Difficulty.HARD,
      "hostile-fixed",
    );
    const second = generate(
      hostileContactGenerator,
      HOSTILE_CONFIG,
      Difficulty.HARD,
      "hostile-fixed",
    );

    expect(second).toEqual(first);
    expect(first.learner.data!.entityIds).toHaveLength(9);
    expect(first.learner.data!.contacts).toHaveLength(9);
    expect(first.grading!.data!.expectedMask).toHaveLength(9);
    expect(first.grading!.data!.expectedEntityIds).toBeDefined();
    expect(first.learner.data).not.toHaveProperty("expectedMask");
    expect(first.learner.data).not.toHaveProperty("expectedEntityIds");
  });

  it("computes AND selection from distance and threat columns in entity order", () => {
    const rng = new SequenceRng([
      20, 8,
      60, 9,
      30, 3,
      50, 7,
      70, 2,
      55,
      6,
    ]);
    const output = hostileContactGenerator.generate({
      templateVersion: 1,
      config: {
        ...HOSTILE_CONFIG,
        baseEntityCount: 5,
        distanceLimitMin: 55,
        distanceLimitMaxExclusive: 56,
        threatThresholdMin: 6,
        threatThresholdMaxExclusive: 7,
      },
      difficulty: Difficulty.EASY,
      rng,
    });

    expect(output.grading!.data!.expectedMask).toEqual([
      true,
      false,
      false,
      true,
      false,
    ]);
    expect(output.grading!.data!.expectedEntityIds).toEqual([
      "contact-1",
      "contact-4",
    ]);
    expect(output.grading!.data!.expectedDistanceColumn).toEqual([20, 60, 30, 50, 70]);
    expect(output.grading!.data!.expectedThreatColumn).toEqual([8, 9, 3, 7, 2]);
  });
});

describe("CS116 generator config validation", () => {
  it("rejects representative invalid configs for every production generator", () => {
    expect(() =>
      generate(matrixShapeGenerator, {
        ...MATRIX_CONFIG,
        baseRows: 0,
      }),
    ).toThrow();
    expect(() =>
      generate(columnExtractGenerator, {
        ...COLUMN_CONFIG,
        baseColumns: 1,
      }),
    ).toThrow();
    expect(() =>
      generate(thresholdFilterGenerator, {
        ...FILTER_CONFIG,
        comparison: "LT",
      }),
    ).toThrow();
    expect(() =>
      generate(hostileContactGenerator, {
        ...HOSTILE_CONFIG,
        baseEntityCount: 2,
      }),
    ).toThrow();
    expect(() =>
      generate(csvInspectionGenerator, { unsupported: true }),
    ).toThrow();
    expect(() =>
      generate(pandasPracticeGenerator, { mode: "UNKNOWN" }),
    ).toThrow();
    expect(() =>
      generate(dataSciencePracticeGenerator, { mode: "UNKNOWN" }),
    ).toThrow();
  });

  it("requires templateVersion >= 1 for every production generator", () => {
    const cases = [
      [matrixShapeGenerator, MATRIX_CONFIG],
      [columnExtractGenerator, COLUMN_CONFIG],
      [thresholdFilterGenerator, FILTER_CONFIG],
      [hostileContactGenerator, HOSTILE_CONFIG],
      [csvInspectionGenerator, {}],
      [pandasPracticeGenerator, { mode: "SELECT_COLUMN" }],
      [dataSciencePracticeGenerator, { mode: "MISSING_VALUES" }],
    ] as const;

    for (const [generator, config] of cases) {
      expect(() =>
        generator.generate({
          templateVersion: 0,
          config,
          difficulty: Difficulty.EASY,
          rng: createSeededRng("invalid-version"),
        }),
      ).toThrow();
    }
  });

  it("validates config before consuming RNG", () => {
    const rng = new SequenceRng([1, 2, 3, 4, 5, 6, 7]);

    expect(() =>
      matrixShapeGenerator.generate({
        templateVersion: 1,
        config: {
          ...MATRIX_CONFIG,
          mode: "UNKNOWN",
        },
        difficulty: Difficulty.HARD,
        rng,
      }),
    ).toThrow();
    expect(rng.calls).toHaveLength(0);
  });
});

describe("Foundation 4 composition", () => {
  it("composes each generator output with createMissionInstance", () => {
    const cases = [
      [
        "mission.cs116.matrix-shape.fixture",
        CS116_GENERATOR_ID.MATRIX_SHAPE,
        matrixShapeGenerator,
        MATRIX_CONFIG,
      ],
      [
        "mission.cs116.column-extract.fixture",
        CS116_GENERATOR_ID.COLUMN_EXTRACT,
        columnExtractGenerator,
        COLUMN_CONFIG,
      ],
      [
        "mission.cs116.threshold-filter.fixture",
        CS116_GENERATOR_ID.THRESHOLD_FILTER,
        thresholdFilterGenerator,
        FILTER_CONFIG,
      ],
      [
        "mission.cs116.hostile-contact.fixture",
        CS116_GENERATOR_ID.HOSTILE_CONTACT,
        hostileContactGenerator,
        HOSTILE_CONFIG,
      ],
    ] as const;

    for (const [templateId, generatorId, generator, config] of cases) {
      const template = templateFor(templateId, generatorId, config);
      const generated = generator.generate({
        templateVersion: template.version,
        config: template.generator.config,
        difficulty: Difficulty.NORMAL,
        rng: createSeededRng("composition-seed"),
      });

      const instance = createMissionInstance({
        template,
        seed: "composition-seed",
        difficulty: Difficulty.NORMAL,
        generated,
      });

      expect(instance.templateId).toBe(template.id);
      expect(instance.templateVersion).toBe(template.version);
      expect(instance.seed).toBe("composition-seed");
      expect(instance.learner).toEqual(generated.learner);
    }
  });

  it("reproduces a full MissionInstance from equal template/config/difficulty/base seed and fresh RNG", () => {
    const template = templateFor(
      "mission.cs116.reproduction.fixture",
      CS116_GENERATOR_ID.MATRIX_SHAPE,
      MATRIX_CONFIG,
    );

    const create = () => {
      const generated = matrixShapeGenerator.generate({
        templateVersion: template.version,
        config: template.generator.config,
        difficulty: Difficulty.HARD,
        rng: createSeededRng("full-instance-seed"),
      });
      return createMissionInstance({
        template,
        seed: "full-instance-seed",
        difficulty: Difficulty.HARD,
        generated,
      });
    };

    expect(create()).toEqual(create());
  });
});
