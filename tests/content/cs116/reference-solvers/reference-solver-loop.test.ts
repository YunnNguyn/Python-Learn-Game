import { describe, expect, it } from "vitest";

import {
  CS116_GENERATOR_ID,
  registerCs116Generators,
  solveColumnExtractReference,
  solveMatrixShapeReference,
  solveThresholdFilterReference,
  thresholdFilterInstanceValidator,
  type ColumnExtractReferenceResult,
  type MatrixShapeReferenceResult,
  type ThresholdFilterReferenceResult,
} from "../../../../src/content/cs116";
import {
  Difficulty,
  LearningStage,
  MissionTemplateSchema,
  type Difficulty as DifficultyValue,
  type JsonObject,
  type MissionInstance,
  type MissionTemplate,
} from "../../../../src/core/domain";
import {
  GeneratorRegistry,
  type MissionGenerator,
} from "../../../../src/core/generators";
import {
  CORE_GRADER_ID,
  DeclarativeGraderCheckType,
  GraderFailureCategory,
  GraderRegistry,
  registerCoreGraders,
  type Grader,
  type GraderExecutionSnapshot,
  type GraderResult,
} from "../../../../src/core/grading";
import {
  createMissionInstance,
  deriveGenerationAttemptSeed,
} from "../../../../src/core/missions";
import { createSeededRng } from "../../../../src/core/random";

const DIFFICULTIES: readonly DifficultyValue[] = [
  Difficulty.EASY,
  Difficulty.NORMAL,
  Difficulty.HARD,
];
const FIXED_SEEDS = ["f5.6-alpha", "f5.6-beta", "f5.6-gamma"] as const;

function createTemplate(
  id: string,
  generatorId: MissionTemplate["generator"]["id"],
  config: JsonObject,
): MissionTemplate {
  return MissionTemplateSchema.parse({
    id,
    version: 1,
    conceptIds: ["concept.f5-6.reference-solver"],
    allowedStages: [LearningStage.INDEPENDENT],
    generator: {
      id: generatorId,
      config,
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
    },
    runtime: {
      id: "runtime.f5-6.reference-solver",
    },
  });
}

function createMatrixTemplate(): MissionTemplate {
  return createTemplate(
    "mission.f5-6.matrix-shape",
    CS116_GENERATOR_ID.MATRIX_SHAPE,
    {
      mode: "INSPECT_SHAPE",
      baseRows: 2,
      baseColumns: 3,
      valueMin: -10,
      valueMaxExclusive: 20,
    },
  );
}

function createColumnTemplate(): MissionTemplate {
  return createTemplate(
    "mission.f5-6.column-extract",
    CS116_GENERATOR_ID.COLUMN_EXTRACT,
    {
      baseRows: 2,
      baseColumns: 3,
      valueMin: -10,
      valueMaxExclusive: 20,
    },
  );
}

type ThresholdComparison = "GT" | "GTE";

function createThresholdTemplate(
  comparison: ThresholdComparison,
  options: {
    readonly thresholdMin?: number;
    readonly thresholdMaxExclusive?: number;
  } = {},
): MissionTemplate {
  return createTemplate(
    `mission.f5-6.threshold-filter-${comparison.toLowerCase()}`,
    CS116_GENERATOR_ID.THRESHOLD_FILTER,
    {
      instructionLevel: "INDEPENDENT",
      baseEntityCount: 4,
      valueMin: 0,
      valueMaxExclusive: 10,
      thresholdMin: options.thresholdMin ?? 2,
      thresholdMaxExclusive: options.thresholdMaxExclusive ?? 8,
      comparison,
    },
  );
}

function createRegistries(): {
  readonly generatorRegistry: GeneratorRegistry;
  readonly graderRegistry: GraderRegistry;
} {
  const generatorRegistry = new GeneratorRegistry();
  const graderRegistry = new GraderRegistry();
  registerCs116Generators(generatorRegistry);
  registerCoreGraders(graderRegistry);
  return { generatorRegistry, graderRegistry };
}

function requireGenerator(
  registry: GeneratorRegistry,
  template: MissionTemplate,
): MissionGenerator {
  const generator = registry.getGenerator(template.generator.id);
  if (generator === undefined) {
    throw new Error(`Missing generator: ${template.generator.id}`);
  }
  return generator;
}

function requireGrader(registry: GraderRegistry): Grader {
  const grader = registry.getGrader(CORE_GRADER_ID.DECLARATIVE);
  if (grader === undefined) {
    throw new Error("Missing core.declarative grader.");
  }
  return grader;
}

function generateInstance(
  registry: GeneratorRegistry,
  template: MissionTemplate,
  baseSeed: string,
  difficulty: DifficultyValue,
  rngSeed = baseSeed,
): MissionInstance {
  const generated = requireGenerator(registry, template).generate({
    templateVersion: template.version,
    config: template.generator.config,
    difficulty,
    rng: createSeededRng(rngSeed),
  });

  return createMissionInstance({
    template,
    seed: baseSeed,
    difficulty,
    generated,
  });
}

function matrixSnapshot(
  reference: MatrixShapeReferenceResult,
): GraderExecutionSnapshot {
  return {
    variables: {
      result: {
        pythonType: "numpy.ndarray",
        isNdarray: true,
        shape: [...reference.shape],
        value: reference.matrix.map((row) => [...row]),
      },
      ndim_result: {
        pythonType: "int",
        isNdarray: false,
        value: reference.ndim,
      },
    },
  };
}

function matrixConfig(reference: MatrixShapeReferenceResult): JsonObject {
  return {
    checks: [
      { type: DeclarativeGraderCheckType.NO_EXCEPTION },
      {
        type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
        variable: "result",
      },
      {
        type: DeclarativeGraderCheckType.NDARRAY_TYPE,
        variable: "result",
      },
      {
        type: DeclarativeGraderCheckType.SHAPE,
        variable: "result",
        expected: [...reference.shape],
      },
      {
        type: DeclarativeGraderCheckType.EXACT_VALUES,
        variable: "result",
        expected: reference.matrix.map((row) => [...row]),
      },
      {
        type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
        variable: "ndim_result",
      },
      {
        type: DeclarativeGraderCheckType.EXACT_VALUES,
        variable: "ndim_result",
        expected: reference.ndim,
      },
    ],
  };
}

function columnSnapshot(
  reference: ColumnExtractReferenceResult,
): GraderExecutionSnapshot {
  return {
    variables: {
      result: {
        pythonType: "numpy.ndarray",
        isNdarray: true,
        shape: [...reference.shape],
        value: [...reference.values],
      },
    },
  };
}

function columnConfig(reference: ColumnExtractReferenceResult): JsonObject {
  return {
    checks: [
      { type: DeclarativeGraderCheckType.NO_EXCEPTION },
      {
        type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
        variable: "result",
      },
      {
        type: DeclarativeGraderCheckType.NDARRAY_TYPE,
        variable: "result",
      },
      {
        type: DeclarativeGraderCheckType.SHAPE,
        variable: "result",
        expected: [...reference.shape],
      },
      {
        type: DeclarativeGraderCheckType.EXACT_VALUES,
        variable: "result",
        expected: [...reference.values],
      },
    ],
  };
}

function thresholdSnapshot(
  reference: ThresholdFilterReferenceResult,
): GraderExecutionSnapshot {
  return {
    variables: {
      result: {
        pythonType: "list",
        isNdarray: false,
        value: [...reference.expectedEntityIds],
      },
    },
  };
}

function thresholdConfig(
  reference: ThresholdFilterReferenceResult,
): JsonObject {
  return {
    checks: [
      { type: DeclarativeGraderCheckType.NO_EXCEPTION },
      {
        type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
        variable: "result",
      },
      {
        type: DeclarativeGraderCheckType.PYTHON_TYPE,
        variable: "result",
        expected: "list",
      },
      {
        type: DeclarativeGraderCheckType.EXACT_VALUES,
        variable: "result",
        expected: [...reference.expectedEntityIds],
      },
    ],
  };
}

interface RejectedThresholdAttempt {
  readonly attemptIndex: number;
  readonly attemptSeed: string;
  readonly issueCodes: readonly string[];
}

interface AcceptedThresholdCandidate {
  readonly rejected: readonly RejectedThresholdAttempt[];
  readonly acceptedAttemptIndex: number;
  readonly acceptedAttemptSeed: string;
  readonly instance: MissionInstance;
}

function generateAcceptedThreshold(
  registry: GeneratorRegistry,
  template: MissionTemplate,
  baseSeed: string,
  difficulty: DifficultyValue,
): AcceptedThresholdCandidate {
  const rejected: RejectedThresholdAttempt[] = [];

  // Test-only bound. F5.6 deliberately does not add a production retry service
  // or a global max-attempt policy.
  for (let attemptIndex = 0; attemptIndex < 12; attemptIndex += 1) {
    const attemptSeed = deriveGenerationAttemptSeed(baseSeed, attemptIndex);
    const instance = generateInstance(
      registry,
      template,
      baseSeed,
      difficulty,
      attemptSeed,
    );
    const validation = thresholdFilterInstanceValidator.validate(instance);

    if (validation.valid) {
      return {
        rejected,
        acceptedAttemptIndex: attemptIndex,
        acceptedAttemptSeed: attemptSeed,
        instance,
      };
    }

    // Rejected candidates are intentionally not reference-solved here.
    rejected.push({
      attemptIndex,
      attemptSeed,
      issueCodes: validation.issues.map((issue) => issue.code),
    });
  }

  throw new Error(
    `Threshold Filter did not produce an accepted candidate for base seed: ${baseSeed}`,
  );
}

function runThresholdPipeline(
  generatorRegistry: GeneratorRegistry,
  graderRegistry: GraderRegistry,
  template: MissionTemplate,
  baseSeed: string,
  difficulty: DifficultyValue,
) {
  const generated = generateAcceptedThreshold(
    generatorRegistry,
    template,
    baseSeed,
    difficulty,
  );
  const reference = solveThresholdFilterReference(generated.instance);
  const graderResult = requireGrader(graderRegistry).grade({
    config: thresholdConfig(reference),
    execution: thresholdSnapshot(reference),
  });

  return {
    ...generated,
    reference,
    graderResult,
  };
}

describe("F5.6 Matrix Shape reference loop", () => {
  it("passes every selected fixed seed and difficulty through both registries", () => {
    const { generatorRegistry, graderRegistry } = createRegistries();
    const template = createMatrixTemplate();
    const grader = requireGrader(graderRegistry);

    for (const difficulty of DIFFICULTIES) {
      for (const seed of FIXED_SEEDS) {
        const instance = generateInstance(
          generatorRegistry,
          template,
          seed,
          difficulty,
        );
        const reference = solveMatrixShapeReference(instance);

        expect(instance.grading?.data?.expectedShape).toEqual([
          ...reference.shape,
        ]);
        expect(instance.grading?.data?.expectedNdim).toBe(reference.ndim);
        expect(
          grader.grade({
            config: matrixConfig(reference),
            execution: matrixSnapshot(reference),
          }).passed,
        ).toBe(true);
      }
    }
  });

  it("is deterministic, non-mutating, caller-safe, and rejects ragged matrices", () => {
    const { generatorRegistry } = createRegistries();
    const template = createMatrixTemplate();
    const instance = generateInstance(
      generatorRegistry,
      template,
      "matrix-purity",
      Difficulty.NORMAL,
    );
    const before = structuredClone(instance);
    const first = solveMatrixShapeReference(instance);
    const second = solveMatrixShapeReference(instance);

    expect(second).toEqual(first);
    expect(instance).toEqual(before);

    (first.matrix[0] as number[])[0] = 999;
    (first.shape as unknown as number[])[0] = 999;
    expect(instance).toEqual(before);
    expect(solveMatrixShapeReference(instance)).toEqual(second);

    const malformed = createMissionInstance({
      template,
      seed: "matrix-ragged",
      difficulty: Difficulty.EASY,
      generated: {
        learner: {
          objective: "Malformed matrix reference fixture.",
          data: { matrix: [[1, 2], [3]] },
        },
      },
    });

    expect(() => solveMatrixShapeReference(malformed)).toThrow(
      "non-empty rectangular 2D numeric matrix",
    );
  });

  it("fails a wrong trusted snapshot with SHAPE_ERROR", () => {
    const { generatorRegistry, graderRegistry } = createRegistries();
    const template = createMatrixTemplate();
    const reference = solveMatrixShapeReference(
      generateInstance(
        generatorRegistry,
        template,
        "matrix-negative",
        Difficulty.HARD,
      ),
    );
    const execution = matrixSnapshot(reference);
    const result = requireGrader(graderRegistry).grade({
      config: matrixConfig(reference),
      execution: {
        ...execution,
        variables: {
          ...execution.variables,
          result: {
            ...execution.variables.result!,
            shape: [reference.shape[0], reference.shape[1] + 1],
          },
        },
      },
    });

    expect(result.passed).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        passed: false,
        category: GraderFailureCategory.SHAPE_ERROR,
      }),
    );
  });
});

describe("F5.6 Column Extract reference loop", () => {
  it("passes every selected fixed seed and difficulty with 1D [rowCount] results", () => {
    const { generatorRegistry, graderRegistry } = createRegistries();
    const template = createColumnTemplate();
    const grader = requireGrader(graderRegistry);

    for (const difficulty of DIFFICULTIES) {
      for (const seed of FIXED_SEEDS) {
        const instance = generateInstance(
          generatorRegistry,
          template,
          seed,
          difficulty,
        );
        const reference = solveColumnExtractReference(instance);
        const data = instance.learner.data!;
        const matrix = data.matrix as number[][];
        const targetColumnIndex = data.targetColumnIndex as number;

        expect(targetColumnIndex).toBeGreaterThanOrEqual(0);
        expect(targetColumnIndex).toBeLessThan(matrix[0]!.length);
        expect(reference.values).toEqual(
          matrix.map((row) => row[targetColumnIndex]),
        );
        expect(reference.shape).toEqual([matrix.length]);
        expect(
          grader.grade({
            config: columnConfig(reference),
            execution: columnSnapshot(reference),
          }).passed,
        ).toBe(true);
      }
    }
  });

  it("is deterministic, non-mutating, caller-safe, and rejects out-of-bounds columns", () => {
    const { generatorRegistry } = createRegistries();
    const template = createColumnTemplate();
    const instance = generateInstance(
      generatorRegistry,
      template,
      "column-purity",
      Difficulty.NORMAL,
    );
    const before = structuredClone(instance);
    const first = solveColumnExtractReference(instance);
    const second = solveColumnExtractReference(instance);

    expect(second).toEqual(first);
    expect(instance).toEqual(before);

    (first.values as number[])[0] = 999;
    (first.shape as unknown as number[])[0] = 999;
    expect(instance).toEqual(before);
    expect(solveColumnExtractReference(instance)).toEqual(second);

    const malformed = createMissionInstance({
      template,
      seed: "column-oob",
      difficulty: Difficulty.EASY,
      generated: {
        learner: {
          objective: "Malformed column reference fixture.",
          data: {
            matrix: [[1, 2], [3, 4]],
            targetColumnIndex: 2,
          },
        },
      },
    });

    expect(() => solveColumnExtractReference(malformed)).toThrow(
      "targetColumnIndex must be within matrix column bounds",
    );
  });

  it("fails a wrong trusted snapshot with VALUE_ERROR", () => {
    const { generatorRegistry, graderRegistry } = createRegistries();
    const template = createColumnTemplate();
    const reference = solveColumnExtractReference(
      generateInstance(
        generatorRegistry,
        template,
        "column-negative",
        Difficulty.HARD,
      ),
    );
    const wrongValues = [...reference.values];
    wrongValues[0] = wrongValues[0]! + 1;

    const result = requireGrader(graderRegistry).grade({
      config: columnConfig(reference),
      execution: {
        variables: {
          result: {
            pythonType: "numpy.ndarray",
            isNdarray: true,
            shape: [...reference.shape],
            value: wrongValues,
          },
        },
      },
    });

    expect(result.passed).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        passed: false,
        category: GraderFailureCategory.VALUE_ERROR,
      }),
    );
  });
});

describe("F5.6 Threshold Filter reference loop", () => {
  it("supports GT and GTE across fixed seeds/difficulties after production validation", () => {
    const { generatorRegistry, graderRegistry } = createRegistries();

    for (const comparison of ["GT", "GTE"] as const) {
      const template = createThresholdTemplate(comparison);

      for (const difficulty of DIFFICULTIES) {
        for (const seed of FIXED_SEEDS) {
          const pipeline = runThresholdPipeline(
            generatorRegistry,
            graderRegistry,
            template,
            `threshold-${comparison.toLowerCase()}-${seed}`,
            difficulty,
          );

          expect(
            thresholdFilterInstanceValidator.validate(pipeline.instance).valid,
          ).toBe(true);
          expect(pipeline.instance.grading?.data?.expectedEntityIds).toEqual([
            ...pipeline.reference.expectedEntityIds,
          ]);
          expect(pipeline.graderResult.passed).toBe(true);
          expect(pipeline.instance.seed).toBe(
            `threshold-${comparison.toLowerCase()}-${seed}`,
          );
        }
      }
    }
  });

  it("reproduces rejected attempts, accepted attempt, instance, reference, and grading", () => {
    const { generatorRegistry, graderRegistry } = createRegistries();
    const template = createThresholdTemplate("GTE", {
      thresholdMin: 9,
      thresholdMaxExclusive: 10,
    });
    const baseSeed = "threshold-retry-proof";

    const first = runThresholdPipeline(
      generatorRegistry,
      graderRegistry,
      template,
      baseSeed,
      Difficulty.EASY,
    );
    const second = runThresholdPipeline(
      generatorRegistry,
      graderRegistry,
      template,
      baseSeed,
      Difficulty.EASY,
    );

    expect(first.rejected.length).toBeGreaterThan(0);
    expect(first.rejected[0]?.attemptIndex).toBe(0);
    expect(first.acceptedAttemptIndex).toBeGreaterThan(0);
    expect(second.rejected).toEqual(first.rejected);
    expect(second.acceptedAttemptIndex).toBe(first.acceptedAttemptIndex);
    expect(second.acceptedAttemptSeed).toBe(first.acceptedAttemptSeed);
    expect(second.instance).toEqual(first.instance);
    expect(second.reference).toEqual(first.reference);
    expect(second.graderResult).toEqual(first.graderResult);
    expect(first.graderResult.passed).toBe(true);
    expect(first.instance.seed).toBe(baseSeed);
    expect(first.instance.id).toContain(encodeURIComponent(baseSeed));
    expect(first.instance.id).not.toContain(
      encodeURIComponent(first.acceptedAttemptSeed),
    );
  });

  it("is deterministic, non-mutating, caller-safe, and rejects inconsistent family data", () => {
    const { generatorRegistry } = createRegistries();
    const template = createThresholdTemplate("GT");
    const accepted = generateAcceptedThreshold(
      generatorRegistry,
      template,
      "threshold-purity",
      Difficulty.NORMAL,
    );
    const instance = accepted.instance;
    const before = structuredClone(instance);
    const first = solveThresholdFilterReference(instance);
    const second = solveThresholdFilterReference(instance);

    expect(second).toEqual(first);
    expect(instance).toEqual(before);

    (first.expectedEntityIds as string[]).push("caller-mutation");
    expect(instance).toEqual(before);
    expect(solveThresholdFilterReference(instance)).toEqual(second);

    const malformed = createMissionInstance({
      template,
      seed: "threshold-mismatched",
      difficulty: Difficulty.EASY,
      generated: {
        learner: {
          objective: "Malformed threshold reference fixture.",
          data: {
            entityIds: ["sensor-1", "sensor-2"],
            values: [5],
            threshold: 3,
            comparison: "GT",
          },
        },
      },
    });

    expect(() => solveThresholdFilterReference(malformed)).toThrow(
      "entityIds and values with equal lengths",
    );
  });

  it("fails a wrong trusted snapshot with VALUE_ERROR", () => {
    const { generatorRegistry, graderRegistry } = createRegistries();
    const template = createThresholdTemplate("GT");
    const accepted = generateAcceptedThreshold(
      generatorRegistry,
      template,
      "threshold-negative",
      Difficulty.HARD,
    );
    const reference = solveThresholdFilterReference(accepted.instance);
    const wrongIds = [...reference.expectedEntityIds];
    wrongIds[0] = "sensor-wrong";

    const result = requireGrader(graderRegistry).grade({
      config: thresholdConfig(reference),
      execution: {
        variables: {
          result: {
            pythonType: "list",
            isNdarray: false,
            value: wrongIds,
          },
        },
      },
    });

    expect(result.passed).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        passed: false,
        category: GraderFailureCategory.VALUE_ERROR,
      }),
    );
  });
});

describe("F5.6 registry composition", () => {
  it("resolves all production generator IDs and core.declarative", () => {
    const { generatorRegistry, graderRegistry } = createRegistries();

    expect(generatorRegistry.getGeneratorIds()).toEqual([
      CS116_GENERATOR_ID.MATRIX_SHAPE,
      CS116_GENERATOR_ID.COLUMN_EXTRACT,
      CS116_GENERATOR_ID.THRESHOLD_FILTER,
    ]);
    expect(graderRegistry.getGraderIds()).toEqual([
      CORE_GRADER_ID.DECLARATIVE,
    ]);
  });
});

// Compile-time/use-site proof that the end-to-end result stays on the common
// GraderResult contract rather than a reference-solver-specific grading type.
const _graderResultContract: GraderResult = {
  passed: true,
  checks: [],
};
void _graderResultContract;
