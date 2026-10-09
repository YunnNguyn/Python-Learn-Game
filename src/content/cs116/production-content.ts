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
import { CS116_PANDAS_CONCEPTS } from "./pandas-concepts";
import { CS116_DATA_SCIENCE_CONCEPTS } from "./data-science-concepts";
import { CS116_ML_CONCEPTS } from "./ml-concepts";
import {
  CS116_PRODUCTION_ACTIVITY_W301,
  CS116_PRODUCTION_ACTIVITY_W302,
  CS116_PRODUCTION_ACTIVITY_W303,
  CS116_PRODUCTION_LESSON_ML_DIAGNOSTICS,
  CS116_PRODUCTION_LESSON_ML_PIPELINE,
  CS116_PRODUCTION_LESSON_ML_VALIDATION,
  CS116_PRODUCTION_TEMPLATE_W301,
  CS116_PRODUCTION_TEMPLATE_W302,
  CS116_PRODUCTION_TEMPLATE_W303,
  CS116_PRODUCTION_WORLD_ML,
} from "./ml-production-content";
import { CS116_PRODUCTION_IDS } from "./production-ids";
import {
  CS116_PRODUCTION_ACTIVITY_LC05,
  CS116_PRODUCTION_ACTIVITY_LC06,
  CS116_PRODUCTION_ACTIVITY_LC07,
  CS116_PRODUCTION_ACTIVITY_LC08,
  CS116_PRODUCTION_ACTIVITY_LC09,
  CS116_PRODUCTION_ACTIVITY_LC10,
  CS116_PRODUCTION_ACTIVITY_LC11,
  CS116_PRODUCTION_ACTIVITY_LC12,
  CS116_PRODUCTION_ACTIVITY_LC13,
  CS116_PRODUCTION_LESSON_FEATURE_BASICS,
  CS116_PRODUCTION_LESSON_IMAGE_ARRAYS,
  CS116_PRODUCTION_LESSON_MATPLOTLIB_CORE,
  CS116_PRODUCTION_LESSON_PANDAS_COMBINE,
  CS116_PRODUCTION_LESSON_PANDAS_QUALITY,
  CS116_PRODUCTION_TEMPLATE_LC05,
  CS116_PRODUCTION_TEMPLATE_LC06,
  CS116_PRODUCTION_TEMPLATE_LC07,
  CS116_PRODUCTION_TEMPLATE_LC08,
  CS116_PRODUCTION_TEMPLATE_LC09,
  CS116_PRODUCTION_TEMPLATE_LC10,
  CS116_PRODUCTION_TEMPLATE_LC11,
  CS116_PRODUCTION_TEMPLATE_LC12,
  CS116_PRODUCTION_TEMPLATE_LC13,
} from "./data-science-production-content";
import { CS116_VERTICAL_SLICE_CONCEPTS } from "./vertical-slice-concepts";

const [
  numpyArray,
  numpyShape,
  numpyNdim,
  numpyIndexColumn,
  numpyCompare,
  numpyBooleanMask,
  numpyLogicalAnd,
] = CS116_VERTICAL_SLICE_CONCEPTS;

const [
  pandasDataFrame,
  pandasSeries,
  pandasColumnSelect,
  pandasBooleanFilter,
] = CS116_PANDAS_CONCEPTS;

export const CS116_PRODUCTION_PACK: ContentPackManifest =
  ContentPackManifestSchema.parse({
    id: CS116_PRODUCTION_IDS.pack,
    version: "0.7.0",
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
  worldIds: [
    CS116_PRODUCTION_IDS.world,
    CS116_PRODUCTION_IDS.worldDataScience,
    CS116_PRODUCTION_IDS.worldMl,
  ],
});

export const CS116_PRODUCTION_WORLD: World = WorldSchema.parse({
  id: CS116_PRODUCTION_IDS.world,
  title: "NumPy — Mảng và thao tác dữ liệu",
  description:
    "Làm chủ ndarray, shape, indexing, boolean filtering và kết hợp điều kiện qua các nhiệm vụ ngắn, rồi chuyển sang một bài bridge chạy bằng Python local.",
  lessonIds: [
    CS116_PRODUCTION_IDS.lessonArrayCore,
    CS116_PRODUCTION_IDS.lessonIndexFilter,
    CS116_PRODUCTION_IDS.lessonTransferReview,
    CS116_PRODUCTION_IDS.lessonLocalRuntime,
  ],
});

export const CS116_PRODUCTION_WORLD_DATA_SCIENCE: World = WorldSchema.parse({
  id: CS116_PRODUCTION_IDS.worldDataScience,
  title: "Python for Data Science — pandas, biểu đồ & ảnh",
  description:
    "CS116 Bài 2B, chạy trong trình duyệt (Pyodide): DataFrame/Series, filtering, missing values (fillna), pivot_table, tạo cột, biểu đồ Matplotlib và ảnh RGB bằng Pillow. Kèm vài chủ đề Supplementary/ML Foundation: groupby, merge, crop/resize.",
  lessonIds: [
    CS116_PRODUCTION_IDS.lessonPandasCore,
    CS116_PRODUCTION_IDS.lessonPandasQuality,
    CS116_PRODUCTION_IDS.lessonMatplotlibCore,
    CS116_PRODUCTION_IDS.lessonPandasCombine,
    CS116_PRODUCTION_IDS.lessonImageArrays,
    CS116_PRODUCTION_IDS.lessonFeatureBasics,
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

export const CS116_PRODUCTION_LESSON_LOCAL_RUNTIME: Lesson = LessonSchema.parse({
  id: CS116_PRODUCTION_IDS.lessonLocalRuntime,
  title: "Bài 4 — NumPy và pandas trên Python local",
  description:
    "Dùng main.py chạy bằng Python thật trên máy, từ NumPy chuyển sang đọc dataset CSV bằng pandas và quan sát file đầu ra của workspace.",
  conceptIds: [numpyIndexColumn!.id, numpyShape!.id],
  activityIds: [
    CS116_PRODUCTION_IDS.activityLc01,
    CS116_PRODUCTION_IDS.activityLc02,
  ],
});

export const CS116_PRODUCTION_LESSON_PANDAS_CORE: Lesson = LessonSchema.parse({
  id: CS116_PRODUCTION_IDS.lessonPandasCore,
  title: "Bài 5 — DataFrame, Series và lọc dữ liệu",
  description:
    "Bắt đầu World 2 bằng mental model DataFrame/Series, chọn cột đúng dạng và lọc các hàng thỏa điều kiện.",
  conceptIds: CS116_PANDAS_CONCEPTS.map((concept) => concept.id),
  activityIds: [
    CS116_PRODUCTION_IDS.activityLc03,
    CS116_PRODUCTION_IDS.activityLc04,
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

export const CS116_PRODUCTION_ACTIVITY_LC01 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityLc01,
  title: "LC-01 — NumPy trên máy thật",
  description:
    "Chạy một bài indexing quen thuộc bằng Local Python để xác nhận main.py, NumPy native và grader đều hoạt động trên tài nguyên máy thật.",
  conceptIds: [numpyIndexColumn!.id, numpyShape!.id],
  stage: LearningStage.TRANSFER,
  missionTemplateId: CS116_PRODUCTION_IDS.templateLc01,
});

export const CS116_PRODUCTION_ACTIVITY_LC02 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityLc02,
  title: "LC-02 — Đọc dữ liệu CSV với pandas",
  description:
    "Đọc telemetry.csv từ Local Python workspace bằng pandas và kiểm tra shape cùng tên các cột của DataFrame.",
  conceptIds: [numpyShape!.id],
  stage: LearningStage.TRANSFER,
  missionTemplateId: CS116_PRODUCTION_IDS.templateLc02,
});

export const CS116_PRODUCTION_ACTIVITY_LC03 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityLc03,
  title: "LC-03 — Chọn cột trong DataFrame",
  description:
    "Phân biệt Series và DataFrame một cột bằng hai cách chọn cột pandas phổ biến.",
  conceptIds: [pandasDataFrame!.id, pandasSeries!.id, pandasColumnSelect!.id],
  stage: LearningStage.GUIDED,
  missionTemplateId: CS116_PRODUCTION_IDS.templateLc03,
});

export const CS116_PRODUCTION_ACTIVITY_LC04 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityLc04,
  title: "LC-04 — Lọc contact theo điều kiện",
  description:
    "Dùng boolean filtering của pandas để chọn các hàng có threat đạt ngưỡng và lấy contact_id kết quả.",
  conceptIds: [pandasDataFrame!.id, pandasColumnSelect!.id, pandasBooleanFilter!.id],
  stage: LearningStage.INDEPENDENT,
  missionTemplateId: CS116_PRODUCTION_IDS.templateLc04,
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

export const CS116_PRODUCTION_TEMPLATE_LC01: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateLc01,
    version: 1,
    conceptIds: [numpyIndexColumn!.id, numpyShape!.id],
    allowedStages: [LearningStage.TRANSFER],
    generator: {
      id: CS116_GENERATOR_ID.COLUMN_EXTRACT,
      config: {
        baseRows: 5,
        baseColumns: 4,
        valueMin: 10,
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
    runtime: {
      id: CORE_RUNTIME_ID.PYODIDE,
      config: { packages: ["numpy"] },
    },
    starterCode: `import numpy as np\n\n# matrix và targetColumnIndex đã được nạp sẵn.\ntelemetry = np.array(matrix)\n\n# Dùng NumPy indexing để lấy toàn bộ cột được yêu cầu.\nresult = \n`,
  });

export const CS116_PRODUCTION_TEMPLATE_LC02: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateLc02,
    version: 1,
    conceptIds: [numpyShape!.id],
    allowedStages: [LearningStage.TRANSFER],
    generator: {
      id: CS116_GENERATOR_ID.CSV_INSPECTION,
      config: {},
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
            variable: "columns_result",
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "columns_result",
            expected: "list",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "columns_result",
            expected: gradingDataRef("expectedColumns"),
          },
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.LC02,
    // Pivot sang Pyodide: bài chạy pandas ngay trong browser (không cần Local
    // Python service), nên app online được. Dataset được stage vào FS ảo của
    // Pyodide qua workspace.datasets, giống hợp đồng workspace của Local Python.
    runtime: {
      id: CORE_RUNTIME_ID.PYODIDE,
      config: {
        packages: ["pandas"],
        workspace: {
          datasets: [
            {
              filename: "telemetry.csv",
              content:
                "contact_id,distance,threat\ncontact-1,38,1\ncontact-2,77,4\ncontact-3,51,3\n",
              description: "Dữ liệu telemetry nhỏ cho bài đọc CSV.",
            },
          ],
        },
      },
    },
    starterCode: `import pandas as pd\n\ndf = pd.read_csv("data/telemetry.csv")\n\nshape_result = \ncolumns_result = \n`,
  });

const PANDAS_TELEMETRY_DATASET = {
  filename: "telemetry.csv",
  content:
    "contact_id,distance,threat\ncontact-1,38,1\ncontact-2,77,7\ncontact-3,51,5\ncontact-4,29,8\ncontact-5,60,3\n",
  description:
    "Dataset telemetry cho bài chọn cột và lọc hàng. Có contact-3 với threat=5 đúng bằng ngưỡng để phân biệt >= với >.",
} as const;

export const CS116_PRODUCTION_TEMPLATE_LC03: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateLc03,
    version: 1,
    conceptIds: [pandasDataFrame!.id, pandasSeries!.id, pandasColumnSelect!.id],
    allowedStages: [LearningStage.GUIDED],
    generator: {
      id: CS116_GENERATOR_ID.PANDAS_PRACTICE,
      config: { mode: "SELECT_COLUMN" },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "distance_series",
            expected: "Series",
          },
          {
            type: DeclarativeGraderCheckType.SHAPE,
            variable: "distance_series",
            expected: [5],
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "distance_frame",
            expected: "DataFrame",
          },
          {
            type: DeclarativeGraderCheckType.SHAPE,
            variable: "distance_frame",
            expected: [5, 1],
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "series_values",
            expected: "list",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "series_values",
            expected: gradingDataRef("expectedSeriesValues"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "series_ndim",
            expected: "int",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "series_ndim",
            expected: gradingDataRef("expectedSeriesNdim"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "frame_shape",
            expected: "tuple",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "frame_shape",
            expected: gradingDataRef("expectedFrameShape"),
          },
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.LC03,
    runtime: {
      id: CORE_RUNTIME_ID.PYODIDE,
      config: {
        packages: ["pandas"],
        workspace: { datasets: [PANDAS_TELEMETRY_DATASET] },
      },
    },
    starterCode: `import pandas as pd\n\ndf = pd.read_csv("data/telemetry.csv")\n\n# Một cặp ngoặc vuông -> Series; hai cặp -> DataFrame một cột.\ndistance_series = \ndistance_frame = \n\nseries_values = \nseries_ndim = \nframe_shape = \n`,
  });

export const CS116_PRODUCTION_TEMPLATE_LC04: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateLc04,
    version: 1,
    conceptIds: [pandasDataFrame!.id, pandasColumnSelect!.id, pandasBooleanFilter!.id],
    allowedStages: [LearningStage.INDEPENDENT],
    generator: {
      id: CS116_GENERATOR_ID.PANDAS_PRACTICE,
      config: { mode: "FILTER_ROWS" },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "filtered",
            expected: "DataFrame",
          },
          {
            type: DeclarativeGraderCheckType.SHAPE,
            variable: "filtered",
            expected: [3, 3],
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "filtered_ids",
            expected: "list",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "filtered_ids",
            expected: gradingDataRef("expectedFilteredIds"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "filtered_count",
            expected: "int",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "filtered_count",
            expected: gradingDataRef("expectedFilteredCount"),
          },
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.LC04,
    runtime: {
      id: CORE_RUNTIME_ID.PYODIDE,
      config: {
        packages: ["pandas"],
        workspace: { datasets: [PANDAS_TELEMETRY_DATASET] },
      },
    },
    starterCode: `import pandas as pd\n\ndf = pd.read_csv("data/telemetry.csv")\n\n# threshold đã được nạp sẵn từ đề.\nfiltered = \nfiltered_ids = \nfiltered_count = \n`,
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
  concepts: [
    ...CS116_VERTICAL_SLICE_CONCEPTS,
    ...CS116_PANDAS_CONCEPTS,
    ...CS116_DATA_SCIENCE_CONCEPTS,
    ...CS116_ML_CONCEPTS,
  ] as const,
  courses: [CS116_PRODUCTION_COURSE] as const,
  worlds: [
    CS116_PRODUCTION_WORLD,
    CS116_PRODUCTION_WORLD_DATA_SCIENCE,
    CS116_PRODUCTION_WORLD_ML,
  ] as const,
  lessons: [
    CS116_PRODUCTION_LESSON_ARRAY_CORE,
    CS116_PRODUCTION_LESSON_INDEX_FILTER,
    CS116_PRODUCTION_LESSON_TRANSFER_REVIEW,
    CS116_PRODUCTION_LESSON_LOCAL_RUNTIME,
    CS116_PRODUCTION_LESSON_PANDAS_CORE,
    CS116_PRODUCTION_LESSON_PANDAS_QUALITY,
    CS116_PRODUCTION_LESSON_MATPLOTLIB_CORE,
    CS116_PRODUCTION_LESSON_PANDAS_COMBINE,
    CS116_PRODUCTION_LESSON_IMAGE_ARRAYS,
    CS116_PRODUCTION_LESSON_FEATURE_BASICS,
    CS116_PRODUCTION_LESSON_ML_PIPELINE,
    CS116_PRODUCTION_LESSON_ML_VALIDATION,
    CS116_PRODUCTION_LESSON_ML_DIAGNOSTICS,
  ] as const,
  activities: [
    CS116_PRODUCTION_ACTIVITY_VS01,
    CS116_PRODUCTION_ACTIVITY_VS02,
    CS116_PRODUCTION_ACTIVITY_VS03,
    CS116_PRODUCTION_ACTIVITY_VS04,
    CS116_PRODUCTION_ACTIVITY_VS05,
    CS116_PRODUCTION_ACTIVITY_VS06,
    CS116_PRODUCTION_ACTIVITY_VS07,
    CS116_PRODUCTION_ACTIVITY_LC01,
    CS116_PRODUCTION_ACTIVITY_LC02,
    CS116_PRODUCTION_ACTIVITY_LC03,
    CS116_PRODUCTION_ACTIVITY_LC04,
    CS116_PRODUCTION_ACTIVITY_LC05,
    CS116_PRODUCTION_ACTIVITY_LC06,
    CS116_PRODUCTION_ACTIVITY_LC07,
    CS116_PRODUCTION_ACTIVITY_LC08,
    CS116_PRODUCTION_ACTIVITY_LC09,
    CS116_PRODUCTION_ACTIVITY_LC10,
    CS116_PRODUCTION_ACTIVITY_LC11,
    CS116_PRODUCTION_ACTIVITY_LC12,
    CS116_PRODUCTION_ACTIVITY_LC13,
    CS116_PRODUCTION_ACTIVITY_W301,
    CS116_PRODUCTION_ACTIVITY_W302,
    CS116_PRODUCTION_ACTIVITY_W303,
  ] as const,
  missionTemplates: [
    CS116_PRODUCTION_TEMPLATE_VS01,
    CS116_PRODUCTION_TEMPLATE_VS02,
    CS116_PRODUCTION_TEMPLATE_VS03,
    CS116_PRODUCTION_TEMPLATE_VS04,
    CS116_PRODUCTION_TEMPLATE_VS05,
    CS116_PRODUCTION_TEMPLATE_VS06,
    CS116_PRODUCTION_TEMPLATE_VS07,
    CS116_PRODUCTION_TEMPLATE_LC01,
    CS116_PRODUCTION_TEMPLATE_LC02,
    CS116_PRODUCTION_TEMPLATE_LC03,
    CS116_PRODUCTION_TEMPLATE_LC04,
    CS116_PRODUCTION_TEMPLATE_LC05,
    CS116_PRODUCTION_TEMPLATE_LC06,
    CS116_PRODUCTION_TEMPLATE_LC07,
    CS116_PRODUCTION_TEMPLATE_LC08,
    CS116_PRODUCTION_TEMPLATE_LC09,
    CS116_PRODUCTION_TEMPLATE_LC10,
    CS116_PRODUCTION_TEMPLATE_LC11,
    CS116_PRODUCTION_TEMPLATE_LC12,
    CS116_PRODUCTION_TEMPLATE_LC13,
    CS116_PRODUCTION_TEMPLATE_W301,
    CS116_PRODUCTION_TEMPLATE_W302,
    CS116_PRODUCTION_TEMPLATE_W303,
  ] as const,
};
