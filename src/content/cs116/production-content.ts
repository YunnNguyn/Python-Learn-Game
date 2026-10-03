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
  lesson: "python-ml.numpy.array-shape",
  activityVs01: "cs116.numpy.vs01",
  templateVs01: "cs116.numpy.vs01",
} as const;

const [numpyArray, numpyShape, numpyNdim] = CS116_VERTICAL_SLICE_CONCEPTS;

export const CS116_PRODUCTION_PACK: ContentPackManifest =
  ContentPackManifestSchema.parse({
    id: CS116_PRODUCTION_IDS.pack,
    version: "0.1.0",
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
    "Làm chủ ndarray, shape, indexing và boolean filtering thông qua các nhiệm vụ ngắn.",
  lessonIds: [CS116_PRODUCTION_IDS.lesson],
});

export const CS116_PRODUCTION_LESSON: Lesson = LessonSchema.parse({
  id: CS116_PRODUCTION_IDS.lesson,
  title: "Bài 1 — Tạo mảng, shape và ndim",
  description:
    "Bắt đầu bằng cách biến dữ liệu Python thành NumPy ndarray và đọc cấu trúc của mảng.",
  conceptIds: [numpyArray!.id, numpyShape!.id, numpyNdim!.id],
  activityIds: [CS116_PRODUCTION_IDS.activityVs01],
});

export const CS116_PRODUCTION_ACTIVITY_VS01: LearningActivity =
  CodeMissionActivitySchema.parse({
    id: CS116_PRODUCTION_IDS.activityVs01,
    type: LearningActivityType.CODE_MISSION,
    title: "VS-01 — Khởi động lưới cảm biến",
    description:
      "Tạo ndarray từ ma trận cảm biến rồi xác định shape và số chiều của nó.",
    conceptIds: [numpyArray!.id, numpyShape!.id, numpyNdim!.id],
    stage: LearningStage.GUIDED,
    missionTemplateId: CS116_PRODUCTION_IDS.templateVs01,
  });

const gradingDataRef = (path: string) => ({ $gradingData: path });

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
    runtime: {
      id: CORE_RUNTIME_ID.PYODIDE,
      config: {
        packages: ["numpy"],
      },
    },
    starterCode: `import numpy as np\n\n# matrix đã được nạp sẵn từ dữ liệu nhiệm vụ.\n# 1) Tạo NumPy ndarray từ matrix.\nresult = \n\n# 2) Lưu shape và số chiều của result.\nshape_result = \nndim_result = \n`,
  });

export const CS116_PRODUCTION_CONTENT = {
  packs: [CS116_PRODUCTION_PACK] as const,
  concepts: CS116_VERTICAL_SLICE_CONCEPTS,
  courses: [CS116_PRODUCTION_COURSE] as const,
  worlds: [CS116_PRODUCTION_WORLD] as const,
  lessons: [CS116_PRODUCTION_LESSON] as const,
  activities: [CS116_PRODUCTION_ACTIVITY_VS01] as const,
  missionTemplates: [CS116_PRODUCTION_TEMPLATE_VS01] as const,
};
