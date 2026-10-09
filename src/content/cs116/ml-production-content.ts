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

const [mlPipeline, mlTrainTestSplit, mlLinearRegression] = CS116_ML_CONCEPTS;

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
    "CS116 (Bài 3 & Bài 8): luồng ML end-to-end — X/y, chia train/test, huấn luyện LinearRegression và đánh giá bằng R². API scikit-learn cụ thể là phần Supplementary / ML Foundation.",
  lessonIds: [CS116_PRODUCTION_IDS.lessonMlPipeline],
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
