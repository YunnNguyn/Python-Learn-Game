import {
  ConceptSource,
  Difficulty,
  HintLevel,
  KnowledgeClassification,
  LearningActivityType,
  LearningStage,
} from "../../src/core/domain";

export const foundation1Fixtures = {
  concepts: [
    {
      id: "concept.base",
      title: "Base concept",
      description: "Neutral prerequisite concept for Foundation 1 integration.",
      classification: KnowledgeClassification.MUST_UNDERSTAND,
      source: ConceptSource.EXTRA,
      prerequisites: [],
      tags: ["fixture", "base"],
    },
    {
      id: "concept.derived",
      title: "Derived concept",
      classification: KnowledgeClassification.MUST_RECALL,
      source: ConceptSource.EXTRA,
      prerequisites: ["concept.base"],
      tags: ["fixture", "derived"],
    },
  ],
  course: {
    id: "course.test",
    title: "Fixture course",
    worldIds: ["world.test"],
  },
  world: {
    id: "world.test",
    title: "Fixture world",
    lessonIds: ["lesson.test"],
  },
  lesson: {
    id: "lesson.test",
    title: "Fixture lesson",
    conceptIds: ["concept.base", "concept.derived"],
    activityIds: ["activity.guided", "activity.predict"],
  },
  activities: [
    {
      id: "activity.guided",
      title: "Guided fixture mission",
      description: "Mission-backed integration fixture.",
      type: LearningActivityType.CODE_MISSION,
      conceptIds: ["concept.base", "concept.derived"],
      stage: LearningStage.GUIDED,
      missionTemplateId: "mission.template.test",
    },
    {
      id: "activity.predict",
      title: "Predict fixture output",
      description: "Non-mission integration fixture.",
      type: LearningActivityType.PREDICT_OUTPUT,
      conceptIds: ["concept.base"],
      stage: LearningStage.REVIEW,
    },
  ],
  missionTemplate: {
    id: "mission.template.test",
    version: 2,
    conceptIds: ["concept.base", "concept.derived"],
    allowedStages: [LearningStage.GUIDED, LearningStage.INDEPENDENT],
    generator: {
      id: "generator.test",
      config: {
        sampleCount: 4,
        labels: ["alpha", "beta"],
      },
    },
    grader: {
      id: "grader.test",
      config: {
        tolerance: 0.001,
        checks: ["shape", "values"],
      },
    },
    runtime: {
      id: "runtime.test",
      config: {
        packages: ["fixture-package"],
      },
    },
    starterCode: "result = None",
    hintSetId: "hints.test",
    visualization: {
      moduleId: "visualization.test",
      config: {
        layout: "neutral-grid",
      },
    },
    restrictions: {
      maxRows: 10,
      allowMutation: false,
    },
  },
  missionInstance: {
    id: "mission.instance.test",
    templateId: "mission.template.test",
    templateVersion: 2,
    seed: "fixture-seed-001",
    difficulty: Difficulty.NORMAL,
    conceptIds: ["concept.base", "concept.derived"],
    learner: {
      objective: "Produce the requested neutral fixture result.",
      context: "Foundation 1 integrated mission instance.",
      starterCode: "result = None",
      data: {
        values: [1, 2, 3, 4],
        target: 3,
      },
      visibleTests: [
        {
          name: "returns-sequence",
          expectedKind: "array",
        },
      ],
    },
    runtime: {
      setupData: {
        variables: { threshold: 3 },
      },
    },
    grading: {
      data: {
        expected: [3, 4],
        tolerance: 0.001,
      },
    },
    world: {
      initialState: {
        targets: ["r2", "r5"],
        status: "ready",
      },
    },
  },
  contentPackManifest: {
    id: "pack.test",
    version: "fixture-v1",
    schemaVersion: 1,
    title: "Foundation 1 fixture pack",
    description: "Neutral test-only content-pack manifest.",
    courseIds: ["course.test"],
    dependencies: [],
  },
  attemptRecord: {
    id: "attempt.test",
    activityId: "activity.guided",
    missionTemplateId: "mission.template.test",
    missionTemplateVersion: 2,
    seed: "fixture-seed-001",
    difficulty: Difficulty.NORMAL,
    conceptIds: ["concept.base", "concept.derived"],
    learningStage: LearningStage.GUIDED,
    startedAt: "2026-09-30T19:00:00+07:00",
    submittedAt: "2026-09-30T19:08:30+07:00",
    passed: true,
    submissionIndex: 2,
    runCountBeforeSubmit: 3,
    hintsUsed: [HintLevel.H1, HintLevel.H2],
    runtimeErrorCount: 1,
    graderSummary: {
      passedChecks: ["shape", "values"],
      failedChecks: [],
      score: 1,
    },
  },
  worldEvent: {
    type: "TEST_TARGETS_SELECTED",
    payload: {
      ids: ["r2", "r5"],
      count: 2,
    },
  },
} as const;

export const foundation1InvalidFixtures = {
  conceptUnexpectedProperty: {
    ...foundation1Fixtures.concepts[0],
    unexpected: true,
  },
  courseMalformedWorldId: {
    ...foundation1Fixtures.course,
    worldIds: ["   "],
  },
  missionActivityMissingTemplate: {
    id: "activity.invalid.missing-template",
    title: "Invalid mission activity",
    type: LearningActivityType.CODE_MISSION,
    conceptIds: ["concept.base"],
    stage: LearningStage.GUIDED,
  },
  missionTemplateNonJsonConfig: {
    ...foundation1Fixtures.missionTemplate,
    generator: {
      id: "generator.test",
      config: {
        callback: () => true,
      },
    },
  },
  missionInstanceLearnerLeak: {
    ...foundation1Fixtures.missionInstance,
    learner: {
      ...foundation1Fixtures.missionInstance.learner,
      graderAnswer: [3, 4],
    },
  },
  contentPackInvalidSchemaVersion: {
    ...foundation1Fixtures.contentPackManifest,
    schemaVersion: 0,
  },
  attemptRecordSubmitCount: {
    ...foundation1Fixtures.attemptRecord,
    submitCount: 2,
  },
  worldEventTransportState: {
    ...foundation1Fixtures.worldEvent,
    preview: true,
    phaserMethod: "lockTargets",
  },
} as const;
