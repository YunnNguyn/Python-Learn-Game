import { describe, expect, it } from "vitest";

import {
  AttemptRecordSchema,
  Difficulty,
  HintLevel,
  LearningStage,
  type AttemptRecord,
  type AttemptRecordId,
  type ConceptId,
  type Difficulty as DifficultyType,
  type HintLevel as HintLevelType,
  type LearningActivityId,
  type MissionTemplateId,
} from "../../src/core/domain";

describe("AttemptRecordSchema", () => {
  const minimalRecord = {
    id: "attempt.neutral.001",
    activityId: "activity.neutral",
    missionTemplateId: "mission-template.neutral",
    missionTemplateVersion: 1,
    seed: "seed-001",
    difficulty: Difficulty.NORMAL,
    conceptIds: [],
    learningStage: LearningStage.GUIDED,
    submittedAt: "2026-09-30T12:30:00.000Z",
    passed: false,
    submissionIndex: 1,
    runCountBeforeSubmit: 0,
    hintsUsed: [],
    runtimeErrorCount: 0,
  };

  it("parses one minimal submission evidence snapshot", () => {
    expect(AttemptRecordSchema.parse(minimalRecord)).toEqual(minimalRecord);
  });

  it("parses a full record with offset timestamps and nested JSON grading evidence", () => {
    const parsed = AttemptRecordSchema.parse({
      ...minimalRecord,
      id: "attempt.neutral.full",
      missionTemplateVersion: 3,
      seed: "template:test:42",
      difficulty: Difficulty.HARD,
      conceptIds: ["concept.alpha", "concept.beta"],
      learningStage: LearningStage.INDEPENDENT,
      startedAt: "2026-09-30T18:20:00+07:00",
      submittedAt: "2026-09-30T18:32:15+07:00",
      passed: true,
      submissionIndex: 3,
      runCountBeforeSubmit: 5,
      hintsUsed: [HintLevel.H1, HintLevel.H3, HintLevel.H3],
      runtimeErrorCount: 2,
      graderSummary: {
        failedChecks: [],
        metrics: { shapeMatched: true, score: 0.95 },
        observed: [1, 2, 3],
      },
    });

    expect(parsed.hintsUsed).toEqual(["H1", "H3", "H3"]);
    expect(parsed.graderSummary).toMatchObject({
      metrics: { shapeMatched: true, score: 0.95 },
    });
  });

  it("preserves branded IDs and canonical value types", () => {
    const record = AttemptRecordSchema.parse({
      ...minimalRecord,
      conceptIds: ["concept.does.not.exist"],
      hintsUsed: [HintLevel.H2],
      difficulty: Difficulty.EASY,
    });

    const id: AttemptRecordId = record.id;
    const activityId: LearningActivityId = record.activityId;
    const missionTemplateId: MissionTemplateId = record.missionTemplateId;
    const conceptId: ConceptId = record.conceptIds[0]!;
    const difficulty: DifficultyType = record.difficulty;
    const hint: HintLevelType = record.hintsUsed[0]!;

    expect([
      id,
      activityId,
      missionTemplateId,
      conceptId,
      difficulty,
      hint,
    ]).toEqual([
      "attempt.neutral.001",
      "activity.neutral",
      "mission-template.neutral",
      "concept.does.not.exist",
      "EASY",
      "H2",
    ]);
  });

  it("keeps branded ID domains incompatible at compile time", () => {
    const record = AttemptRecordSchema.parse(minimalRecord);

    // @ts-expect-error AttemptRecordId cannot substitute for LearningActivityId.
    const invalidActivityId: LearningActivityId = record.id;
    // @ts-expect-error LearningActivityId cannot substitute for MissionTemplateId.
    const invalidTemplateId: MissionTemplateId = record.activityId;
    // @ts-expect-error MissionTemplateId cannot substitute for ConceptId.
    const invalidConceptId: ConceptId = record.missionTemplateId;

    expect([invalidActivityId, invalidTemplateId, invalidConceptId]).toEqual([
      record.id,
      record.activityId,
      record.missionTemplateId,
    ]);
  });

  it("defines exactly the canonical HintLevel runtime values", () => {
    expect(HintLevel).toEqual({
      H1: "H1",
      H2: "H2",
      H3: "H3",
      H4: "H4",
    });
  });

  it("allows structurally valid unresolved references, duplicate concepts/hints, and chronology without cross-field comparison", () => {
    const result = AttemptRecordSchema.safeParse({
      ...minimalRecord,
      activityId: "activity.does.not.exist",
      missionTemplateId: "mission-template.does.not.exist",
      conceptIds: ["concept.missing", "concept.missing"],
      startedAt: "2026-09-30T13:00:00.000Z",
      submittedAt: "2026-09-30T12:30:00.000Z",
      hintsUsed: [HintLevel.H2, HintLevel.H2, HintLevel.H1],
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ["blank AttemptRecordId", { ...minimalRecord, id: "   " }],
    ["blank activityId", { ...minimalRecord, activityId: "" }],
    ["blank missionTemplateId", { ...minimalRecord, missionTemplateId: " " }],
    ["missionTemplateVersion zero", { ...minimalRecord, missionTemplateVersion: 0 }],
    [
      "fractional missionTemplateVersion",
      { ...minimalRecord, missionTemplateVersion: 1.5 },
    ],
    ["blank seed", { ...minimalRecord, seed: "   " }],
    ["invalid difficulty", { ...minimalRecord, difficulty: "EXTREME" }],
    ["conceptIds not an array", { ...minimalRecord, conceptIds: "concept.one" }],
    ["blank ConceptId", { ...minimalRecord, conceptIds: [" "] }],
    ["invalid learningStage", { ...minimalRecord, learningStage: "PRACTICE" }],
    ["invalid submittedAt", { ...minimalRecord, submittedAt: "yesterday" }],
    [
      "submittedAt without timezone",
      { ...minimalRecord, submittedAt: "2026-09-30T12:30:00" },
    ],
    ["invalid startedAt", { ...minimalRecord, startedAt: "not-a-date" }],
    ["submissionIndex zero", { ...minimalRecord, submissionIndex: 0 }],
    ["fractional submissionIndex", { ...minimalRecord, submissionIndex: 1.5 }],
    ["negative runCountBeforeSubmit", { ...minimalRecord, runCountBeforeSubmit: -1 }],
    [
      "fractional runCountBeforeSubmit",
      { ...minimalRecord, runCountBeforeSubmit: 1.5 },
    ],
    ["invalid HintLevel", { ...minimalRecord, hintsUsed: ["H5"] }],
    ["negative runtimeErrorCount", { ...minimalRecord, runtimeErrorCount: -1 }],
    ["fractional runtimeErrorCount", { ...minimalRecord, runtimeErrorCount: 0.5 }],
    ["graderSummary root array", { ...minimalRecord, graderSummary: [] }],
    [
      "non-JSON graderSummary value",
      { ...minimalRecord, graderSummary: { createdAt: new Date() } },
    ],
    ["legacy submitCount", { ...minimalRecord, submitCount: 2 }],
  ])("rejects %s", (_caseName, input) => {
    expect(AttemptRecordSchema.safeParse(input).success).toBe(false);
  });

  it("keeps the inferred contract focused on one submission snapshot", () => {
    const inspect = (record: AttemptRecord) => {
      // @ts-expect-error submitCount is intentionally absent.
      const submitCount = record.submitCount;
      // @ts-expect-error raw submitted source is intentionally absent.
      const submittedCode = record.submittedCode;
      // @ts-expect-error session identity is intentionally absent.
      const sessionId = record.sessionId;
      // @ts-expect-error MissionInstance identity is intentionally absent.
      const missionInstanceId = record.missionInstanceId;
      return [submitCount, submittedCode, sessionId, missionInstanceId];
    };

    expect(inspect(AttemptRecordSchema.parse(minimalRecord))).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });
});
