import {
  CodeMissionActivitySchema,
  LearningActivityType,
  LearningStage,
  LessonSchema,
  MissionTemplateSchema,
  WorldSchema,
  type LearningActivity,
  type Lesson,
  type MissionTemplate,
  type World,
} from "../../core/domain";
import { CORE_GRADER_ID, DeclarativeGraderCheckType } from "../../core/grading";
import { CORE_RUNTIME_ID } from "../../core/runtime";

import { CS116_DATA_VALIDATION_CONCEPTS } from "./data-validation-concepts";
import { CS116_GENERATOR_ID } from "./generators";
import { CS116_HINT_SET_ID } from "./production-hints";
import { CS116_PRODUCTION_IDS } from "./production-ids";

const [pandasIsna, pandasDropna, pandasDropDuplicates] =
  CS116_DATA_VALIDATION_CONCEPTS;

const gradingDataRef = (path: string) => ({ $gradingData: path });

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

// Dataset ô nhiễm có chủ đích: 12 dòng, 3 dòng chứa NaN (2 ở price, 1 ở
// quantity), 2 cặp trùng. Sau dropna còn 9 dòng, sau drop_duplicates còn 7.
const RAW_SALES_DATASET = {
  filename: "raw_sales.csv",
  content:
    "order_id,product,price,quantity\n" +
    "A001,laptop,1200,2\n" +
    "A002,phone,,3\n" +
    "A003,tablet,500,1\n" +
    "A001,laptop,1200,2\n" +
    "A004,phone,800,\n" +
    "A005,laptop,1200,2\n" +
    "A006,tablet,500,1\n" +
    "A007,phone,800,4\n" +
    "A003,tablet,500,1\n" +
    "A008,laptop,,2\n" +
    "A009,phone,800,5\n" +
    "A010,tablet,500,3\n",
  description:
    "Dữ liệu bán hàng thô có missing values ở price/quantity và một vài hàng trùng — dùng để luyện bước làm sạch cơ bản.",
} as const;

export const CS116_PRODUCTION_WORLD_DATA_VALIDATION: World = WorldSchema.parse({
  id: CS116_PRODUCTION_IDS.worldDataValidation,
  title: "Data Validation & EDA — làm sạch và nhìn dữ liệu",
  description:
    "CS116 (Bài 4): kiểm tra shape/dtype, phát hiện và loại bỏ missing values + duplicates, nhận diện outlier và nhìn phân phối trước khi fit mô hình.",
  lessonIds: [CS116_PRODUCTION_IDS.lessonDataCleaning],
});

export const CS116_PRODUCTION_LESSON_DATA_CLEANING: Lesson = LessonSchema.parse({
  id: CS116_PRODUCTION_IDS.lessonDataCleaning,
  title: "Bài 14 — Làm sạch: missing + duplicates",
  description:
    "CS116 Bài 4: pipeline dọn dẹp cơ bản — kiểm tra shape, đếm missing bằng isna, bỏ hàng thiếu bằng dropna, bỏ hàng trùng bằng drop_duplicates.",
  conceptIds: [pandasIsna!.id, pandasDropna!.id, pandasDropDuplicates!.id],
  activityIds: [CS116_PRODUCTION_IDS.activityW401],
});

export const CS116_PRODUCTION_ACTIVITY_W401 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityW401,
  title: "W4-01 — Làm sạch dữ liệu bán hàng",
  description:
    "CS116 Bài 4: kiểm tra shape, đếm missing values theo cột, dropna rồi drop_duplicates và báo cáo kết quả sau mỗi bước.",
  conceptIds: [pandasIsna!.id, pandasDropna!.id, pandasDropDuplicates!.id],
  stage: LearningStage.GUIDED,
  missionTemplateId: CS116_PRODUCTION_IDS.templateW401,
});

export const CS116_PRODUCTION_TEMPLATE_W401: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateW401,
    version: 1,
    conceptIds: [pandasIsna!.id, pandasDropna!.id, pandasDropDuplicates!.id],
    allowedStages: [LearningStage.GUIDED],
    generator: {
      id: CS116_GENERATOR_ID.DATA_SCIENCE_PRACTICE,
      config: { mode: "DATA_CLEANING" },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "raw_shape",
            expected: gradingDataRef("expectedRawShape"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "missing_price",
            expected: "int",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "missing_price",
            expected: gradingDataRef("expectedMissingPrice"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "missing_quantity",
            expected: "int",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "missing_quantity",
            expected: gradingDataRef("expectedMissingQuantity"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "after_dropna_shape",
            expected: gradingDataRef("expectedAfterDropnaShape"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "final_shape",
            expected: gradingDataRef("expectedFinalShape"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "final_order_ids",
            expected: gradingDataRef("expectedFinalOrderIds"),
          },
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.W401,
    runtime: {
      id: CORE_RUNTIME_ID.PYODIDE,
      config: {
        packages: ["pandas"],
        workspace: { datasets: [RAW_SALES_DATASET] },
      },
    },
    starterCode:
      'import pandas as pd\n\ndf = pd.read_csv("data/raw_sales.csv")\n\n# Bước 1: ghi lại kích thước ban đầu.\nraw_shape = \n\n# Bước 2: đếm missing values theo cột (dùng isna().sum()).\nmissing_price = \nmissing_quantity = \n\n# Bước 3: loại bỏ hàng có missing values.\ndf_no_na = \nafter_dropna_shape = \n\n# Bước 4: loại bỏ hàng trùng.\nclean = \nfinal_shape = \nfinal_order_ids = \n',
  });
