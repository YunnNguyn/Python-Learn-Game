import {
  CodeMissionActivitySchema,
  ContentPackManifestSchema,
  CourseSchema,
  LearningActivityType,
  LearningStage,
  LessonSchema,
  MissionTemplateSchema,
  WorldSchema,
  type ContentPackManifest,
  type Course,
  type LearningActivity,
  type Lesson,
  type MissionTemplate,
  type World,
} from "../../core/domain";
import { CORE_GRADER_ID, DeclarativeGraderCheckType } from "../../core/grading";
import { CORE_RUNTIME_ID } from "../../core/runtime";
import { CS116_GENERATOR_ID } from "./generators";
import { CS116_HINT_SET_ID } from "./production-hints";
import { CS116_VERTICAL_SLICE_CONCEPTS } from "./vertical-slice-concepts";

export const CS116_PRODUCTION_IDS = {
  pack: "cs116",
  course: "python-ml-practice",
  world: "python-ml.numpy",
  lessonArrayCore: "python-ml.numpy.array-shape",
  lessonIndexFilter: "python-ml.numpy.index-filter",
  lessonTransferReview: "python-ml.numpy.transfer-review",
  activityVs01: "cs116.numpy.vs01",
  activityVs02: "cs116.numpy.vs02",
  activityVs03: "cs116.numpy.vs03",
  activityVs04: "cs116.numpy.vs04",
  activityVs05: "cs116.numpy.vs05",
  activityVs06: "cs116.numpy.vs06",
  activityVs07: "cs116.numpy.vs07",
  templateVs01: "cs116.numpy.vs01",
  templateVs02: "cs116.numpy.vs02",
  templateVs03: "cs116.numpy.vs03",
  templateVs04: "cs116.numpy.vs04",
  templateVs05: "cs116.numpy.vs05",
  templateVs06: "cs116.numpy.vs06",
  templateVs07: "cs116.numpy.vs07",
} as const;

const [
  numpyArray,
  numpyShape,
  numpyNdim,
  numpyIndexColumn,
  numpyCompare,
  numpyBooleanMask,
  numpyLogicalAnd,
] = CS116_VERTICAL_SLICE_CONCEPTS;

export const CS116_PRODUCTION_PACK: ContentPackManifest =
  ContentPackManifestSchema.parse({
    id: CS116_PRODUCTION_IDS.pack,
    version: "0.2.0",
    schemaVersion: 1,
    title: "Nội dung Python cho ML/AI — gói CS116",
    description:
      "Gói nội dung đầu tiên dùng CS116 làm lát cắt triển khai cho lộ trình Python áp dụng trong ML/AI.",
    courseIds: [CS116_PRODUCTION_IDS.course],
    dependencies: [],
  });

export const CS116_PRODUCTION_COURSE: Course = CourseSchema.parse({
  id: CS116_PRODUCTION_IDS.course,
  title: "Python cho ML/AI — Thực hành nền tảng",
  description:
    "Học Python bằng thực hành, bắt đầu với NumPy và tư duy dữ liệu cần cho Machine Learning/AI.",
  worldIds: [CS116_PRODUCTION_IDS.world],
});

export const CS116_PRODUCTION_WORLD: World = WorldSchema.parse({
  id: CS116_PRODUCTION_IDS.world,
  title: "NumPy — Mảng và thao tác dữ liệu",
  description:
    "Làm chủ ndarray, shape, indexing, boolean filtering và kết hợp điều kiện thông qua bảy nhiệm vụ ngắn.",
  lessonIds: [
    CS116_PRODUCTION_IDS.lessonArrayCore,
    CS116_PRODUCTION_IDS.lessonIndexFilter,
    CS116_PRODUCTION_IDS.lessonTransferReview,
  ],
});

export const CS116_PRODUCTION_LESSON_ARRAY_CORE: Lesson = LessonSchema.parse({
  id: CS116_PRODUCTION_IDS.lessonArrayCore,
  title: "Bài 1 — ndarray, shape và ndim",
  description:
    "Biến dữ liệu Python thành NumPy ndarray và đọc đúng cấu trúc của mảng.",
  conceptIds: [numpyArray!.id, numpyShape!.id, numpyNdim!.id],
  activityIds: [
    CS116_PRODUCTION_IDS.activityVs01,
    CS116_PRODUCTION_IDS.activityVs02,
  ],
});

export const CS116_PRODUCTION_LESSON_INDEX_FILTER: Lesson = LessonSchema.parse({
  id: CS116_PRODUCTION_IDS.lessonIndexFilter,
  title: "Bài 2 — Indexing và boolean filtering",
  description:
    "Lấy cột dữ liệu, tạo điều kiện vector hóa và dùng boolean mask để lọc ndarray.",
  conceptIds: [
    numpyIndexColumn!.id,
    numpyCompare!.id,
    numpyBooleanMask!.id,
  ],
  activityIds: [
    CS116_PRODUCTION_IDS.activityVs03,
    CS116_PRODUCTION_IDS.activityVs04,
    CS116_PRODUCTION_IDS.activityVs05,
  ],
});

export const CS116_PRODUCTION_LESSON_TRANSFER_REVIEW: Lesson = LessonSchema.parse({
  id: CS116_PRODUCTION_IDS.lessonTransferReview,
  title: "Bài 3 — Kết hợp điều kiện và ôn tập",
  description:
    "Kết hợp indexing, comparison và boolean logic trong bài transfer rồi ôn lại toàn bộ lát cắt NumPy.",
  conceptIds: CS116_VERTICAL_SLICE_CONCEPTS.map((concept) => concept.id),
  activityIds: [
    CS116_PRODUCTION_IDS.activityVs06,
    CS116_PRODUCTION_IDS.activityVs07,
  ],
});

function codeActivity(input: {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly conceptIds: readonly string[];
  readonly stage: (typeof LearningStage)[keyof typeof LearningStage];
  readonly missionTemplateId: string;
}): LearningActivity {
  return CodeMissionActivitySchema.parse({
    ...input,
    type: LearningActivityType.CODE_MISSION,
  });
}

export const CS116_PRODUCTION_ACTIVITY_VS01 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityVs01,
  title: "VS-01 — Khởi động lưới cảm biến",
  description:
    "Tạo ndarray từ ma trận cảm biến rồi xác định shape và số chiều của nó.",
  conceptIds: [numpyArray!.id, numpyShape!.id, numpyNdim!.id],
  stage: LearningStage.GUIDED,
  missionTemplateId: CS116_PRODUCTION_IDS.templateVs01,
});

export const CS116_PRODUCTION_ACTIVITY_VS02 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityVs02,
  title: "VS-02 — Chẩn đoán telemetry",
  description:
    "Tự đọc shape và ndim của một ndarray telemetry đã được chuẩn bị sẵn.",
  conceptIds: [numpyShape!.id, numpyNdim!.id],
  stage: LearningStage.INDEPENDENT,
  missionTemplateId: CS116_PRODUCTION_IDS.templateVs02,
});

export const CS116_PRODUCTION_ACTIVITY_VS03 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityVs03,
  title: "VS-03 — Trích xuất kênh nguy cơ",
  description:
    "Dùng NumPy indexing để lấy đúng một cột từ ma trận telemetry.",
  conceptIds: [numpyIndexColumn!.id, numpyShape!.id],
  stage: LearningStage.INDEPENDENT,
  missionTemplateId: CS116_PRODUCTION_IDS.templateVs03,
});

export const CS116_PRODUCTION_ACTIVITY_VS04 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityVs04,
  title: "VS-04 — Lọc radar",
  description:
    "Tạo boolean mask từ phép so sánh và dùng mask để lọc các cảm biến đạt ngưỡng.",
  conceptIds: [numpyCompare!.id, numpyBooleanMask!.id],
  stage: LearningStage.GUIDED,
  missionTemplateId: CS116_PRODUCTION_IDS.templateVs04,
});

export const CS116_PRODUCTION_ACTIVITY_VS05 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityVs05,
  title: "VS-05 — Biến thể lọc radar",
  description:
    "Tự giải một biến thể sinh mới của bài boolean filtering với điều kiện biên khác.",
  conceptIds: [numpyCompare!.id, numpyBooleanMask!.id],
  stage: LearningStage.INDEPENDENT,
  missionTemplateId: CS116_PRODUCTION_IDS.templateVs05,
});

export const CS116_PRODUCTION_ACTIVITY_VS06 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityVs06,
  title: "VS-06 — Phát hiện liên hệ nguy hiểm",
  description:
    "Tách các cột telemetry và kết hợp hai điều kiện NumPy để chọn đúng contact cần chú ý.",
  conceptIds: [
    numpyIndexColumn!.id,
    numpyCompare!.id,
    numpyBooleanMask!.id,
    numpyLogicalAnd!.id,
  ],
  stage: LearningStage.TRANSFER,
  missionTemplateId: CS116_PRODUCTION_IDS.templateVs06,
});

export const CS116_PRODUCTION_ACTIVITY_VS07 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityVs07,
  title: "VS-07 — Gói ôn tập NumPy",
  description:
    "Dựng lại toàn bộ pipeline ndarray → shape/ndim → indexing → điều kiện → boolean mask từ trí nhớ.",
  conceptIds: CS116_VERTICAL_SLICE_CONCEPTS.map((concept) => concept.id),
  stage: LearningStage.REVIEW,
  missionTemplateId: CS116_PRODUCTION_IDS.templateVs07,
});

const gradingDataRef = (path: string) => ({ $gradingData: path });
const numpyRuntime = {
  id: CORE_RUNTIME_ID.PYODIDE,
  config: { packages: ["numpy"] },
} as const;

function resultNdarrayChecks(variable = "result") {
  return [
    {
      type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
      variable,
    },
    {
      type: DeclarativeGraderCheckType.NDARRAY_TYPE,
      variable,
    },
  ];
}

export const CS116_PRODUCTION_TEMPLATE_VS01: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateVs01,
    version: 1,
    conceptIds: [numpyArray!.id, numpyShape!.id, numpyNdim!.id],
    allowedStages: [LearningStage.GUIDED],
    generator: {
      id: CS116_GENERATOR_ID.MATRIX_SHAPE,
      config: {
        mode: "CREATE_AND_INSPECT",
        baseRows: 2,
        baseColumns: 3,
        valueMin: 1,
        valueMaxExclusive: 10,
      },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          ...resultNdarrayChecks(),
          {
            type: DeclarativeGraderCheckType.SHAPE,
            variable: "result",
            expected: gradingDataRef("expectedShape"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "result",
            expected: gradingDataRef("expectedValues"),
          },
          {
            type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
            variable: "shape_result",
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "shape_result",
            expected: "tuple",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "shape_result",
            expected: gradingDataRef("expectedShape"),
          },
          {
            type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
            variable: "ndim_result",
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "ndim_result",
            expected: "int",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "ndim_result",
            expected: gradingDataRef("expectedNdim"),
          },
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.VS01,
    runtime: numpyRuntime,
    starterCode: `import numpy as np\n\n# matrix đã được nạp sẵn từ dữ liệu nhiệm vụ.\n# 1) Tạo NumPy ndarray từ matrix.\nresult = \n\n# 2) Lưu shape và số chiều của result.\nshape_result = \nndim_result = \n`,
  });

export const CS116_PRODUCTION_TEMPLATE_VS02: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateVs02,
    version: 1,
    conceptIds: [numpyShape!.id, numpyNdim!.id],
    allowedStages: [LearningStage.INDEPENDENT],
    generator: {
      id: CS116_GENERATOR_ID.MATRIX_SHAPE,
      config: {
        mode: "INSPECT_SHAPE",
        baseRows: 3,
        baseColumns: 4,
        valueMin: 0,
        valueMaxExclusive: 20,
      },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          {
            type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
            variable: "shape_result",
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "shape_result",
            expected: "tuple",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "shape_result",
            expected: gradingDataRef("expectedShape"),
          },
          {
            type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
            variable: "ndim_result",
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "ndim_result",
            expected: "int",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "ndim_result",
            expected: gradingDataRef("expectedNdim"),
          },
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.VS02,
    runtime: numpyRuntime,
    starterCode: `import numpy as np\n\n# telemetry đã là ndarray; chỉ đọc cấu trúc của nó.\ntelemetry = np.array(matrix)\n\nshape_result = \nndim_result = \n`,
  });

export const CS116_PRODUCTION_TEMPLATE_VS03: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateVs03,
    version: 1,
    conceptIds: [numpyIndexColumn!.id, numpyShape!.id],
    allowedStages: [LearningStage.INDEPENDENT],
    generator: {
      id: CS116_GENERATOR_ID.COLUMN_EXTRACT,
      config: {
        baseRows: 4,
        baseColumns: 4,
        valueMin: 0,
        valueMaxExclusive: 100,
      },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          ...resultNdarrayChecks(),
          {
            type: DeclarativeGraderCheckType.SHAPE,
            variable: "result",
            expected: gradingDataRef("expectedShape"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "result",
            expected: gradingDataRef("expectedValues"),
          },
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.VS03,
    runtime: numpyRuntime,
    starterCode: `import numpy as np\n\ntelemetry = np.array(matrix)\n\n# Lấy toàn bộ cột targetColumnIndex vào result.\nresult = \n`,
  });

function thresholdTemplate(input: {
  readonly id: string;
  readonly stage: typeof LearningStage.GUIDED | typeof LearningStage.INDEPENDENT;
  readonly hintSetId: string;
  readonly instructionLevel: "GUIDED" | "INDEPENDENT";
  readonly comparison: "GT" | "GTE";
  readonly baseEntityCount: number;
}): MissionTemplate {
  return MissionTemplateSchema.parse({
    id: input.id,
    version: 1,
    conceptIds: [numpyCompare!.id, numpyBooleanMask!.id],
    allowedStages: [input.stage],
    generator: {
      id: CS116_GENERATOR_ID.THRESHOLD_FILTER,
      config: {
        instructionLevel: input.instructionLevel,
        baseEntityCount: input.baseEntityCount,
        valueMin: 0,
        valueMaxExclusive: 100,
        thresholdMin: 25,
        thresholdMaxExclusive: 75,
        comparison: input.comparison,
      },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          ...resultNdarrayChecks("mask"),
          {
            type: DeclarativeGraderCheckType.SHAPE,
            variable: "mask",
            expected: gradingDataRef("expectedMaskShape"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "mask",
            expected: gradingDataRef("expectedMask"),
          },
          ...resultNdarrayChecks("result"),
          {
            type: DeclarativeGraderCheckType.SHAPE,
            variable: "result",
            expected: gradingDataRef("expectedResultShape"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "result",
            expected: gradingDataRef("expectedEntityIds"),
          },
        ],
      },
    },
    hintSetId: input.hintSetId,
    runtime: numpyRuntime,
    starterCode: `import numpy as np\n\nsensor_values = np.array(values)\nsensor_ids = np.array(entityIds)\n\nmask = \nresult = \n`,
  });
}

export const CS116_PRODUCTION_TEMPLATE_VS04 = thresholdTemplate({
  id: CS116_PRODUCTION_IDS.templateVs04,
  stage: LearningStage.GUIDED,
  hintSetId: CS116_HINT_SET_ID.VS04,
  instructionLevel: "GUIDED",
  comparison: "GT",
  baseEntityCount: 5,
});

export const CS116_PRODUCTION_TEMPLATE_VS05 = thresholdTemplate({
  id: CS116_PRODUCTION_IDS.templateVs05,
  stage: LearningStage.INDEPENDENT,
  hintSetId: CS116_HINT_SET_ID.VS05,
  instructionLevel: "INDEPENDENT",
  comparison: "GTE",
  baseEntityCount: 7,
});

const hostileGeneratorConfig = {
  baseEntityCount: 6,
  distanceMin: 10,
  distanceMaxExclusive: 100,
  threatMin: 1,
  threatMaxExclusive: 11,
  distanceLimitMin: 35,
  distanceLimitMaxExclusive: 75,
  threatThresholdMin: 4,
  threatThresholdMaxExclusive: 9,
} as const;

function hostileCoreChecks() {
  return [
    ...resultNdarrayChecks("distance_column"),
    {
      type: DeclarativeGraderCheckType.SHAPE,
      variable: "distance_column",
      expected: gradingDataRef("expectedColumnShape"),
    },
    {
      type: DeclarativeGraderCheckType.EXACT_VALUES,
      variable: "distance_column",
      expected: gradingDataRef("expectedDistanceColumn"),
    },
    ...resultNdarrayChecks("threat_column"),
    {
      type: DeclarativeGraderCheckType.SHAPE,
      variable: "threat_column",
      expected: gradingDataRef("expectedColumnShape"),
    },
    {
      type: DeclarativeGraderCheckType.EXACT_VALUES,
      variable: "threat_column",
      expected: gradingDataRef("expectedThreatColumn"),
    },
    ...resultNdarrayChecks("mask"),
    {
      type: DeclarativeGraderCheckType.SHAPE,
      variable: "mask",
      expected: gradingDataRef("expectedMaskShape"),
    },
    {
      type: DeclarativeGraderCheckType.EXACT_VALUES,
      variable: "mask",
      expected: gradingDataRef("expectedMask"),
    },
    ...resultNdarrayChecks("result"),
    {
      type: DeclarativeGraderCheckType.SHAPE,
      variable: "result",
      expected: gradingDataRef("expectedResultShape"),
    },
    {
      type: DeclarativeGraderCheckType.EXACT_VALUES,
      variable: "result",
      expected: gradingDataRef("expectedEntityIds"),
    },
  ];
}

export const CS116_PRODUCTION_TEMPLATE_VS06: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateVs06,
    version: 1,
    conceptIds: [
      numpyIndexColumn!.id,
      numpyCompare!.id,
      numpyBooleanMask!.id,
      numpyLogicalAnd!.id,
    ],
    allowedStages: [LearningStage.TRANSFER],
    generator: {
      id: CS116_GENERATOR_ID.HOSTILE_CONTACT,
      config: {
        instructionLevel: "TRANSFER",
        ...hostileGeneratorConfig,
      },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          ...hostileCoreChecks(),
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.VS06,
    runtime: numpyRuntime,
    starterCode: `import numpy as np\n\ntelemetry = np.array(contacts)\ncontact_ids = np.array(entityIds)\n\ndistance_column = \nthreat_column = \nmask = \nresult = \n`,
  });

export const CS116_PRODUCTION_TEMPLATE_VS07: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateVs07,
    version: 1,
    conceptIds: CS116_VERTICAL_SLICE_CONCEPTS.map((concept) => concept.id),
    allowedStages: [LearningStage.REVIEW],
    generator: {
      id: CS116_GENERATOR_ID.HOSTILE_CONTACT,
      config: {
        instructionLevel: "REVIEW",
        ...hostileGeneratorConfig,
        baseEntityCount: 7,
      },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          ...resultNdarrayChecks("telemetry"),
          {
            type: DeclarativeGraderCheckType.SHAPE,
            variable: "telemetry",
            expected: gradingDataRef("expectedTelemetryShape"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "telemetry",
            expected: gradingDataRef("expectedContacts"),
          },
          {
            type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
            variable: "shape_result",
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "shape_result",
            expected: "tuple",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "shape_result",
            expected: gradingDataRef("expectedTelemetryShape"),
          },
          {
            type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
            variable: "ndim_result",
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "ndim_result",
            expected: "int",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "ndim_result",
            expected: gradingDataRef("expectedNdim"),
          },
          ...hostileCoreChecks(),
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.VS07,
    runtime: numpyRuntime,
    starterCode: `import numpy as np\n\n# Ôn tổng hợp: tự dựng lại pipeline NumPy.\ntelemetry = \nshape_result = \nndim_result = \n\ncontact_ids = np.array(entityIds)\ndistance_column = \nthreat_column = \nmask = \nresult = \n`,
  });

export const CS116_PRODUCTION_CONTENT = {
  packs: [CS116_PRODUCTION_PACK] as const,
  concepts: CS116_VERTICAL_SLICE_CONCEPTS,
  courses: [CS116_PRODUCTION_COURSE] as const,
  worlds: [CS116_PRODUCTION_WORLD] as const,
  lessons: [
    CS116_PRODUCTION_LESSON_ARRAY_CORE,
    CS116_PRODUCTION_LESSON_INDEX_FILTER,
    CS116_PRODUCTION_LESSON_TRANSFER_REVIEW,
  ] as const,
  activities: [
    CS116_PRODUCTION_ACTIVITY_VS01,
    CS116_PRODUCTION_ACTIVITY_VS02,
    CS116_PRODUCTION_ACTIVITY_VS03,
    CS116_PRODUCTION_ACTIVITY_VS04,
    CS116_PRODUCTION_ACTIVITY_VS05,
    CS116_PRODUCTION_ACTIVITY_VS06,
    CS116_PRODUCTION_ACTIVITY_VS07,
  ] as const,
  missionTemplates: [
    CS116_PRODUCTION_TEMPLATE_VS01,
    CS116_PRODUCTION_TEMPLATE_VS02,
    CS116_PRODUCTION_TEMPLATE_VS03,
    CS116_PRODUCTION_TEMPLATE_VS04,
    CS116_PRODUCTION_TEMPLATE_VS05,
    CS116_PRODUCTION_TEMPLATE_VS06,
    CS116_PRODUCTION_TEMPLATE_VS07,
  ] as const,
};
