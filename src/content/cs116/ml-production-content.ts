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

import { CS116_GENERATOR_ID } from "./generators";
import { CS116_ML_CONCEPTS } from "./ml-concepts";
import { CS116_HINT_SET_ID } from "./production-hints";
import { CS116_PRODUCTION_IDS } from "./production-ids";

const [
  mlPipeline,
  mlTrainTestSplit,
  mlLinearRegression,
  mlTrainValTestSplit,
  mlOverfitUnderfit,
] = CS116_ML_CONCEPTS;

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

// Perfectly linear data (price = 50 * area + 100) so LinearRegression recovers
// exact coefficients regardless of the split — the graded answer is stable.
const HOUSES_DATASET = {
  filename: "houses.csv",
  content:
    "area,price\n1,150\n2,200\n3,250\n4,300\n5,350\n6,400\n7,450\n8,500\n",
  description:
    "Dữ liệu nhà tuyến tính (price = 50*area + 100) để luyện pipeline hồi quy tuyến tính.",
} as const;

export const CS116_PRODUCTION_WORLD_ML: World = WorldSchema.parse({
  id: CS116_PRODUCTION_IDS.worldMl,
  title: "ML Pipeline — hồi quy tuyến tính đầu tiên",
  description:
    "CS116 (Bài 3 & Bài 8): luồng ML end-to-end — X/y, chia train/test (7:2:1), huấn luyện LinearRegression và đánh giá bằng R². API scikit-learn cụ thể là phần Supplementary / ML Foundation.",
  lessonIds: [
    CS116_PRODUCTION_IDS.lessonMlPipeline,
    CS116_PRODUCTION_IDS.lessonMlValidation,
    CS116_PRODUCTION_IDS.lessonMlDiagnostics,
  ],
});

export const CS116_PRODUCTION_LESSON_ML_PIPELINE: Lesson = LessonSchema.parse({
  id: CS116_PRODUCTION_IDS.lessonMlPipeline,
  title: "Bài 11 — Pipeline hồi quy tuyến tính",
  description:
    "CS116 (Bài 3): dựng pipeline đầy đủ từ dữ liệu tới đánh giá, dùng Linear Regression (Bài 8). Chạy scikit-learn trong trình duyệt qua Pyodide.",
  conceptIds: [mlPipeline!.id, mlTrainTestSplit!.id, mlLinearRegression!.id],
  activityIds: [CS116_PRODUCTION_IDS.activityW301],
});

export const CS116_PRODUCTION_ACTIVITY_W301 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityW301,
  title: "W3-01 — Pipeline hồi quy tuyến tính",
  description:
    "CS116: tách X/y, chia train/test, huấn luyện LinearRegression và đánh giá R² — pipeline ML đầu tiên.",
  conceptIds: [mlPipeline!.id, mlTrainTestSplit!.id, mlLinearRegression!.id],
  stage: LearningStage.GUIDED,
  missionTemplateId: CS116_PRODUCTION_IDS.templateW301,
});

export const CS116_PRODUCTION_TEMPLATE_W301: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateW301,
    version: 1,
    conceptIds: [mlPipeline!.id, mlTrainTestSplit!.id, mlLinearRegression!.id],
    allowedStages: [LearningStage.GUIDED],
    generator: {
      id: CS116_GENERATOR_ID.DATA_SCIENCE_PRACTICE,
      config: { mode: "LINREG_PIPELINE" },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "coef",
            expected: gradingDataRef("expectedCoef"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "intercept",
            expected: gradingDataRef("expectedIntercept"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "pred_10",
            expected: gradingDataRef("expectedPred10"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "r2",
            expected: gradingDataRef("expectedR2"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "n_train",
            expected: "int",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "n_train",
            expected: gradingDataRef("expectedNTrain"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "n_test",
            expected: "int",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "n_test",
            expected: gradingDataRef("expectedNTest"),
          },
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.W301,
    runtime: {
      id: CORE_RUNTIME_ID.PYODIDE,
      config: {
        packages: ["pandas", "scikit-learn"],
        workspace: { datasets: [HOUSES_DATASET] },
      },
    },
    starterCode:
      'import pandas as pd\nfrom sklearn.model_selection import train_test_split\nfrom sklearn.linear_model import LinearRegression\n\ndf = pd.read_csv("data/houses.csv")\nX = df[["area"]]\ny = df["price"]\n\n# Chia train/test với test_size=0.25, random_state=42.\nX_train, X_test, y_train, y_test = \n\nmodel = LinearRegression()\n# Huấn luyện model trên tập train.\n\ncoef = round(float(model.coef_[0]), 2)\nintercept = round(float(model.intercept_), 2)\npred_10 = round(float(model.predict(pd.DataFrame({"area": [10]}))[0]), 2)\nr2 = round(float(model.score(X_test, y_test)), 4)\nn_train = len(X_train)\nn_test = len(X_test)\n',
  });

// 20 điểm sinh từ price = 50*area + 100 + noise cố định (RandomState(0)).
// Dữ liệu đủ nhiễu để val R² và test R² khác nhau một chút → có ý nghĩa khi
// phân biệt vai trò của validation vs test.
const HOUSES_NOISY_DATASET = {
  filename: "houses_noisy.csv",
  content:
    "area,price\n1,167.6\n2,204.0\n3,259.8\n4,322.4\n5,368.7\n6,390.2\n7,459.5\n8,498.5\n9,549.0\n10,604.1\n11,651.4\n12,714.5\n13,757.6\n14,801.2\n15,854.4\n16,903.3\n17,964.9\n18,997.9\n19,1053.1\n20,1091.5\n",
  description:
    "Dữ liệu nhà có nhiễu nhỏ (~std 10) quanh price = 50*area + 100, dùng để luyện chia train/validation/test 7:2:1.",
} as const;

export const CS116_PRODUCTION_LESSON_ML_VALIDATION: Lesson = LessonSchema.parse({
  id: CS116_PRODUCTION_IDS.lessonMlValidation,
  title: "Bài 12 — Train / Validation / Test 7:2:1",
  description:
    "CS116 (Bài 3): chia dữ liệu theo đúng tỉ lệ 7:2:1 của CS116 — train để học, validation để chọn mô hình, test chỉ dùng để báo cáo cuối cùng.",
  conceptIds: [mlPipeline!.id, mlTrainValTestSplit!.id, mlLinearRegression!.id],
  activityIds: [CS116_PRODUCTION_IDS.activityW302],
});

export const CS116_PRODUCTION_ACTIVITY_W302 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityW302,
  title: "W3-02 — Chia train/validation/test 7:2:1",
  description:
    "CS116 Bài 3: chia dữ liệu 7:2:1 bằng hai lần train_test_split, huấn luyện LinearRegression và báo cáo cả val R² lẫn test R².",
  conceptIds: [mlPipeline!.id, mlTrainValTestSplit!.id, mlLinearRegression!.id],
  stage: LearningStage.INDEPENDENT,
  missionTemplateId: CS116_PRODUCTION_IDS.templateW302,
});

export const CS116_PRODUCTION_TEMPLATE_W302: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateW302,
    version: 1,
    conceptIds: [mlPipeline!.id, mlTrainValTestSplit!.id, mlLinearRegression!.id],
    allowedStages: [LearningStage.INDEPENDENT],
    generator: {
      id: CS116_GENERATOR_ID.DATA_SCIENCE_PRACTICE,
      config: { mode: "TRAIN_VAL_TEST_SPLIT" },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "coef",
            expected: gradingDataRef("expectedCoef"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "intercept",
            expected: gradingDataRef("expectedIntercept"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "val_r2",
            expected: gradingDataRef("expectedValR2"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "test_r2",
            expected: gradingDataRef("expectedTestR2"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "n_train",
            expected: "int",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "n_train",
            expected: gradingDataRef("expectedNTrain"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "n_val",
            expected: "int",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "n_val",
            expected: gradingDataRef("expectedNVal"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "n_test",
            expected: "int",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "n_test",
            expected: gradingDataRef("expectedNTest"),
          },
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.W302,
    runtime: {
      id: CORE_RUNTIME_ID.PYODIDE,
      config: {
        packages: ["pandas", "scikit-learn"],
        workspace: { datasets: [HOUSES_NOISY_DATASET] },
      },
    },
    starterCode:
      'import pandas as pd\nfrom sklearn.model_selection import train_test_split\nfrom sklearn.linear_model import LinearRegression\n\ndf = pd.read_csv("data/houses_noisy.csv")\nX = df[["area"]]\ny = df["price"]\n\n# Bước 1: tách test (10%) ra khỏi toàn bộ dữ liệu.\nX_tmp, X_test, y_tmp, y_test = \n\n# Bước 2: tách val (2/9 của phần còn lại) khỏi train.\nX_train, X_val, y_train, y_val = \n\nmodel = LinearRegression()\n# Huấn luyện model trên tập train.\n\ncoef = round(float(model.coef_[0]), 2)\nintercept = round(float(model.intercept_), 2)\nval_r2 = round(float(model.score(X_val, y_val)), 4)\ntest_r2 = round(float(model.score(X_test, y_test)), 4)\nn_train = len(X_train)\nn_val = len(X_val)\nn_test = len(X_test)\n',
  });

// 12 căn hộ với noise ~ std 40 quanh price = 30*area + 100 (RandomState(7)).
// Dataset nhỏ + noise cao → với split test_size=0.25 random_state=42, train R²
// đạt ~0.90 nhưng test R² chỉ ~0.77. Gap ~0.13 đủ rõ để minh hoạ overfit mà
// không fake (cả hai điểm vẫn có nghĩa, không bị âm).
const APARTMENTS_SMALL_DATASET = {
  filename: "apartments_small.csv",
  content:
    "area,price\n1,197.6\n2,141.4\n3,191.3\n4,236.3\n5,218.4\n6,280.1\n7,310.0\n8,269.8\n9,410.7\n10,424.0\n11,405.0\n12,453.1\n",
  description:
    "Dữ liệu 12 căn hộ với noise lớn — dùng để quan sát khoảng cách train R² vs test R².",
} as const;

export const CS116_PRODUCTION_LESSON_ML_DIAGNOSTICS: Lesson = LessonSchema.parse({
  id: CS116_PRODUCTION_IDS.lessonMlDiagnostics,
  title: "Bài 13 — Chẩn đoán overfit / underfit",
  description:
    "CS116 Bài 3: luôn so sánh train R² với test R² để biết mô hình thực sự tổng quát hóa hay chỉ học thuộc dữ liệu train.",
  conceptIds: [
    mlPipeline!.id,
    mlLinearRegression!.id,
    mlOverfitUnderfit!.id,
  ],
  activityIds: [CS116_PRODUCTION_IDS.activityW303],
});

export const CS116_PRODUCTION_ACTIVITY_W303 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityW303,
  title: "W3-03 — Train R² vs Test R²: chẩn đoán overfit",
  description:
    "CS116 Bài 3: so sánh train R² với test R² trên dataset nhỏ nhiễu để nhận ra overfit.",
  conceptIds: [
    mlPipeline!.id,
    mlLinearRegression!.id,
    mlOverfitUnderfit!.id,
  ],
  stage: LearningStage.TRANSFER,
  missionTemplateId: CS116_PRODUCTION_IDS.templateW303,
});

export const CS116_PRODUCTION_TEMPLATE_W303: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateW303,
    version: 1,
    conceptIds: [
      mlPipeline!.id,
      mlLinearRegression!.id,
      mlOverfitUnderfit!.id,
    ],
    allowedStages: [LearningStage.TRANSFER],
    generator: {
      id: CS116_GENERATOR_ID.DATA_SCIENCE_PRACTICE,
      config: { mode: "OVERFIT_DIAGNOSIS" },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "train_r2",
            expected: gradingDataRef("expectedTrainR2"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "test_r2",
            expected: gradingDataRef("expectedTestR2"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "gap",
            expected: gradingDataRef("expectedGap"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "coef",
            expected: gradingDataRef("expectedCoef"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "intercept",
            expected: gradingDataRef("expectedIntercept"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "n_train",
            expected: "int",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "n_train",
            expected: gradingDataRef("expectedNTrain"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "n_test",
            expected: "int",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "n_test",
            expected: gradingDataRef("expectedNTest"),
          },
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.W303,
    runtime: {
      id: CORE_RUNTIME_ID.PYODIDE,
      config: {
        packages: ["pandas", "scikit-learn"],
        workspace: { datasets: [APARTMENTS_SMALL_DATASET] },
      },
    },
    starterCode:
      'import pandas as pd\nfrom sklearn.model_selection import train_test_split\nfrom sklearn.linear_model import LinearRegression\n\ndf = pd.read_csv("data/apartments_small.csv")\nX = df[["area"]]\ny = df["price"]\n\n# Chia train/test với test_size=0.25, random_state=42.\nX_train, X_test, y_train, y_test = \n\nmodel = LinearRegression()\n# Huấn luyện model trên tập train.\n\n# Chẩn đoán: cả train R² lẫn test R².\ntrain_r2 = \ntest_r2 = \ngap = round(train_r2 - test_r2, 4)\n\ncoef = round(float(model.coef_[0]), 2)\nintercept = round(float(model.intercept_), 2)\nn_train = len(X_train)\nn_test = len(X_test)\n',
  });
