import {
  CodeMissionActivitySchema,
  LearningActivityType,
  LearningStage,
  LessonSchema,
  MissionTemplateSchema,
  type LearningActivity,
  type Lesson,
  type MissionTemplate,
} from "../../core/domain";
import { CORE_GRADER_ID, DeclarativeGraderCheckType } from "../../core/grading";
import { CORE_RUNTIME_ID } from "../../core/runtime";

import { CS116_DATA_SCIENCE_CONCEPTS } from "./data-science-concepts";
import { CS116_GENERATOR_ID } from "./generators";
import { CS116_PANDAS_CONCEPTS } from "./pandas-concepts";
import { CS116_HINT_SET_ID } from "./production-hints";
import { CS116_PRODUCTION_IDS } from "./production-ids";

const [
  pandasDataFrame,
  ,
  pandasColumnSelect,
] = CS116_PANDAS_CONCEPTS;

const [
  pandasMissingValues,
  pandasGroupbyAggregation,
  pandasPivotTable,
  matplotlibPyplot,
  matplotlibSavefig,
  pandasMerge,
  imageRgbArray,
  pillowImageIo,
  pillowCropResize,
  pandasNewColumn,
] = CS116_DATA_SCIENCE_CONCEPTS;

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

const gradingDataRef = (path: string) => ({ $gradingData: path });

const SENSOR_READINGS_DATASET = {
  filename: "sensor_readings.csv",
  content:
    "sample_id,signal,quality\ns1,10,good\ns2,,ok\ns3,20,good\ns4,,ok\ns5,60,good\n",
  description:
    "Dữ liệu cảm biến có hai missing values trong cột signal. Median (20) khác mean (30) để phân biệt cách điền.",
} as const;

const TEAM_SCORES_DATASET = {
  filename: "team_scores.csv",
  content:
    "team,member,score\nA,m1,60\nB,m4,40\nA,m2,70\nB,m5,50\nA,m3,200\nB,m6,120\n",
  description:
    "Bảng điểm nhỏ để luyện groupby. Mỗi nhóm có mean khác median (A: mean 110 vs median 70; B: mean 70 vs median 50).",
} as const;

const MODEL_METRICS_DATASET = {
  filename: "model_metrics.csv",
  content:
    "team,metric,value\nA,accuracy,0.80\nA,loss,0.40\nB,accuracy,0.90\nB,loss,0.30\nA,accuracy,0.85\nA,loss,0.35\n",
  description: "Metric dạng long-format để luyện pivot_table.",
} as const;

const TRAINING_HISTORY_DATASET = {
  filename: "training_history.csv",
  content: "epoch,loss\n1,0.92\n2,0.68\n3,0.51\n4,0.39\n5,0.31\n",
  description: "Training history nhỏ cho line plot Matplotlib.",
} as const;

const CONTACTS_PLOT_DATASET = {
  filename: "contacts.csv",
  content:
    "contact_id,distance,threat\ncontact-1,38,1\ncontact-2,77,7\ncontact-3,51,3\ncontact-4,29,8\n",
  description: "Telemetry contact dùng cho scatter plot distance–threat.",
} as const;

const USERS_DATASET = {
  filename: "users.csv",
  content: "user_id,region\nu1,north\nu2,south\nu3,north\n",
  description: "Bảng user metadata cho bài merge.",
} as const;

const EVENTS_DATASET = {
  filename: "events.csv",
  content: "user_id,spend\nu1,10\nu1,20\nu2,15\nu4,99\n",
  description: "Bảng event/spend cho bài inner merge.",
} as const;

const STOCKS_DATASET = {
  filename: "stocks.csv",
  content: "symbol,close,volume\nA,10,3\nB,20,2\nC,5,4\n",
  description:
    "Bảng giá nhỏ (số nguyên gọn) để luyện tạo cột value = close * volume.",
} as const;

const PIXELS_PPM_DATASET = {
  filename: "pixels.ppm",
  content:
    "P3\n4 3\n255\n255 0 0  0 255 0  0 0 255  255 255 255\n255 255 0  0 255 255  255 0 255  128 128 128\n0 0 0  64 64 64  128 0 0  0 128 0\n",
  description: "Ảnh RGB 4×3 dạng PPM text để luyện Pillow và NumPy array.",
} as const;

export const CS116_PRODUCTION_LESSON_PANDAS_QUALITY: Lesson =
  LessonSchema.parse({
    id: CS116_PRODUCTION_IDS.lessonPandasQuality,
    title: "Bài 6 — Missing values và tổng hợp dữ liệu",
    description:
      "CS116 (Bài 2B): missing values với fillna và pivot_table. Supplementary / ML Foundation: groupby/aggregation.",
    conceptIds: [
      pandasMissingValues!.id,
      pandasGroupbyAggregation!.id,
      pandasPivotTable!.id,
    ],
    activityIds: [
      CS116_PRODUCTION_IDS.activityLc05,
      CS116_PRODUCTION_IDS.activityLc06,
      CS116_PRODUCTION_IDS.activityLc07,
    ],
  });

export const CS116_PRODUCTION_LESSON_MATPLOTLIB_CORE: Lesson =
  LessonSchema.parse({
    id: CS116_PRODUCTION_IDS.lessonMatplotlibCore,
    title: "Bài 7 — Matplotlib và artifact trực quan",
    description:
      "CS116 (Bài 2B): vẽ line/scatter plot bằng Matplotlib. Phần lưu PNG vào artifacts workspace là workflow bổ sung (Supplementary).",
    conceptIds: [matplotlibPyplot!.id, matplotlibSavefig!.id],
    activityIds: [
      CS116_PRODUCTION_IDS.activityLc08,
      CS116_PRODUCTION_IDS.activityLc09,
    ],
  });

export const CS116_PRODUCTION_LESSON_PANDAS_COMBINE: Lesson = LessonSchema.parse({
  id: CS116_PRODUCTION_IDS.lessonPandasCombine,
  title: "Bài 8 — Ghép nhiều bảng dữ liệu",
  description:
    "Supplementary / ML Foundation: kết hợp hai DataFrame theo khóa chung bằng merge và kiểm tra ảnh hưởng của kiểu join lên kết quả. (CS116 Bài 2B dạy concat; merge là phần bổ sung.)",
  conceptIds: [pandasMerge!.id],
  activityIds: [CS116_PRODUCTION_IDS.activityLc10],
});

export const CS116_PRODUCTION_LESSON_FEATURE_BASICS: Lesson =
  LessonSchema.parse({
    id: CS116_PRODUCTION_IDS.lessonFeatureBasics,
    title: "Bài 10 — Tạo cột & feature cơ bản",
    description:
      "CS116 (Bài 2B): tạo cột mới từ các cột có sẵn (value = close * volume) — bước đầu của feature engineering.",
    conceptIds: [pandasNewColumn!.id],
    activityIds: [CS116_PRODUCTION_IDS.activityLc13],
  });

export const CS116_PRODUCTION_LESSON_IMAGE_ARRAYS: Lesson = LessonSchema.parse({
  id: CS116_PRODUCTION_IDS.lessonImageArrays,
  title: "Bài 9 — Ảnh như NumPy array",
  description:
    "CS116 (Bài 2A/2B): đọc ảnh RGB bằng Pillow, hiểu shape height × width × channels. Crop/resize là phần bổ sung (Supplementary).",
  conceptIds: [imageRgbArray!.id, pillowImageIo!.id, pillowCropResize!.id],
  activityIds: [
    CS116_PRODUCTION_IDS.activityLc11,
    CS116_PRODUCTION_IDS.activityLc12,
  ],
});

export const CS116_PRODUCTION_ACTIVITY_LC05 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityLc05,
  title: "LC-05 — Xử lý missing values",
  description:
    "CS116: phát hiện giá trị thiếu và điền bằng fillna (ở đây chọn median làm giá trị điền).",
  conceptIds: [
    pandasDataFrame!.id,
    pandasColumnSelect!.id,
    pandasMissingValues!.id,
  ],
  stage: LearningStage.GUIDED,
  missionTemplateId: CS116_PRODUCTION_IDS.templateLc05,
});

export const CS116_PRODUCTION_ACTIVITY_LC06 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityLc06,
  title: "LC-06 — groupby và aggregation",
  description:
    "Supplementary / ML Foundation: nhóm dữ liệu theo team và tính mean score cho từng nhóm.",
  conceptIds: [pandasDataFrame!.id, pandasGroupbyAggregation!.id],
  stage: LearningStage.INDEPENDENT,
  missionTemplateId: CS116_PRODUCTION_IDS.templateLc06,
});

export const CS116_PRODUCTION_ACTIVITY_LC07 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityLc07,
  title: "LC-07 — Pivot bảng metric",
  description:
    "CS116: chuyển dữ liệu metric dạng dài thành pivot table hai chiều có aggregation.",
  conceptIds: [
    pandasDataFrame!.id,
    pandasGroupbyAggregation!.id,
    pandasPivotTable!.id,
  ],
  stage: LearningStage.TRANSFER,
  missionTemplateId: CS116_PRODUCTION_IDS.templateLc07,
});

export const CS116_PRODUCTION_ACTIVITY_LC08 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityLc08,
  title: "LC-08 — Vẽ training loss",
  description:
    "CS116: tạo line plot bằng Matplotlib, đặt nhãn và title. Lưu PNG vào workspace artifacts là phần bổ sung.",
  conceptIds: [matplotlibPyplot!.id, matplotlibSavefig!.id],
  stage: LearningStage.GUIDED,
  missionTemplateId: CS116_PRODUCTION_IDS.templateLc08,
});

export const CS116_PRODUCTION_ACTIVITY_LC09 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityLc09,
  title: "LC-09 — Scatter distance–threat",
  description:
    "CS116: tự tạo scatter plot từ DataFrame. Lưu artifact PNG là phần bổ sung.",
  conceptIds: [matplotlibPyplot!.id, matplotlibSavefig!.id],
  stage: LearningStage.INDEPENDENT,
  missionTemplateId: CS116_PRODUCTION_IDS.templateLc09,
});

export const CS116_PRODUCTION_ACTIVITY_LC10 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityLc10,
  title: "LC-10 — Ghép hai bảng theo khóa",
  description:
    "Supplementary / ML Foundation: dùng inner merge theo user_id để kết hợp event với metadata và kiểm tra số hàng sau join.",
  conceptIds: [pandasDataFrame!.id, pandasMerge!.id],
  stage: LearningStage.TRANSFER,
  missionTemplateId: CS116_PRODUCTION_IDS.templateLc10,
});

export const CS116_PRODUCTION_ACTIVITY_LC11 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityLc11,
  title: "LC-11 — Ảnh RGB thành ndarray",
  description:
    "CS116: đọc ảnh bằng Pillow, chuyển sang NumPy array và đọc shape/channel/pixel.",
  conceptIds: [imageRgbArray!.id, pillowImageIo!.id],
  stage: LearningStage.GUIDED,
  missionTemplateId: CS116_PRODUCTION_IDS.templateLc11,
});

export const CS116_PRODUCTION_ACTIVITY_LC12 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityLc12,
  title: "LC-12 — Crop, resize và lưu ảnh",
  description:
    "Supplementary / ML Foundation: crop/resize ảnh bằng Pillow, kiểm tra ndarray đầu ra và lưu PNG vào artifacts.",
  conceptIds: [imageRgbArray!.id, pillowImageIo!.id, pillowCropResize!.id],
  stage: LearningStage.INDEPENDENT,
  missionTemplateId: CS116_PRODUCTION_IDS.templateLc12,
});

export const CS116_PRODUCTION_TEMPLATE_LC05: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateLc05,
    version: 1,
    conceptIds: [
      pandasDataFrame!.id,
      pandasColumnSelect!.id,
      pandasMissingValues!.id,
    ],
    allowedStages: [LearningStage.GUIDED],
    generator: {
      id: CS116_GENERATOR_ID.DATA_SCIENCE_PRACTICE,
      config: { mode: "MISSING_VALUES" },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "clean_signal",
            expected: "Series",
          },
          {
            type: DeclarativeGraderCheckType.SHAPE,
            variable: "clean_signal",
            expected: [5],
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "missing_before",
            expected: gradingDataRef("expectedMissingBefore"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "missing_after",
            expected: gradingDataRef("expectedMissingAfter"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "filled_values",
            expected: "list",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "filled_values",
            expected: gradingDataRef("expectedFilledValues"),
          },
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.LC05,
    runtime: {
      id: CORE_RUNTIME_ID.PYODIDE,
      config: {
        packages: ["pandas"],
        workspace: { datasets: [SENSOR_READINGS_DATASET] },
      },
    },
    starterCode:
      'import pandas as pd\n\ndf = pd.read_csv("data/sensor_readings.csv")\n\nmissing_before = \nmedian_signal = \nclean_signal = \nmissing_after = \nfilled_values = \n',
  });

export const CS116_PRODUCTION_TEMPLATE_LC06: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateLc06,
    version: 1,
    conceptIds: [pandasDataFrame!.id, pandasGroupbyAggregation!.id],
    allowedStages: [LearningStage.INDEPENDENT],
    generator: {
      id: CS116_GENERATOR_ID.DATA_SCIENCE_PRACTICE,
      config: { mode: "GROUPBY_AGGREGATE" },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "grouped",
            expected: "Series",
          },
          {
            type: DeclarativeGraderCheckType.SHAPE,
            variable: "grouped",
            expected: [2],
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "mean_scores",
            expected: "dict",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "mean_scores",
            expected: gradingDataRef("expectedMeanScores"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "group_count",
            expected: "int",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "group_count",
            expected: gradingDataRef("expectedGroupCount"),
          },
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.LC06,
    runtime: {
      id: CORE_RUNTIME_ID.PYODIDE,
      config: {
        packages: ["pandas"],
        workspace: { datasets: [TEAM_SCORES_DATASET] },
      },
    },
    starterCode:
      'import pandas as pd\n\ndf = pd.read_csv("data/team_scores.csv")\n\ngrouped = \nmean_scores = \ngroup_count = \n',
  });

export const CS116_PRODUCTION_TEMPLATE_LC07: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateLc07,
    version: 1,
    conceptIds: [
      pandasDataFrame!.id,
      pandasGroupbyAggregation!.id,
      pandasPivotTable!.id,
    ],
    allowedStages: [LearningStage.TRANSFER],
    generator: {
      id: CS116_GENERATOR_ID.DATA_SCIENCE_PRACTICE,
      config: { mode: "PIVOT_TABLE" },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "pivot",
            expected: "DataFrame",
          },
          {
            type: DeclarativeGraderCheckType.SHAPE,
            variable: "pivot",
            expected: gradingDataRef("expectedPivotShape"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "pivot_columns",
            expected: "list",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "pivot_columns",
            expected: gradingDataRef("expectedPivotColumns"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "pivot_values",
            expected: "list",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "pivot_values",
            expected: gradingDataRef("expectedPivotValues"),
          },
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.LC07,
    runtime: {
      id: CORE_RUNTIME_ID.PYODIDE,
      config: {
        packages: ["pandas"],
        workspace: { datasets: [MODEL_METRICS_DATASET] },
      },
    },
    starterCode:
      'import pandas as pd\n\ndf = pd.read_csv("data/model_metrics.csv")\n\npivot = \npivot = pivot.sort_index().sort_index(axis=1)\npivot_columns = \npivot_values = \n',
  });

export const CS116_PRODUCTION_TEMPLATE_LC08: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateLc08,
    version: 1,
    conceptIds: [matplotlibPyplot!.id, matplotlibSavefig!.id],
    allowedStages: [LearningStage.GUIDED],
    generator: {
      id: CS116_GENERATOR_ID.DATA_SCIENCE_PRACTICE,
      config: { mode: "MATPLOTLIB_LINE_PLOT" },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "fig",
            expected: "Figure",
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "ax",
            expected: "Axes",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "line_count",
            expected: gradingDataRef("expectedLineCount"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "x_label",
            expected: gradingDataRef("expectedXLabel"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "y_label",
            expected: gradingDataRef("expectedYLabel"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "plot_title",
            expected: gradingDataRef("expectedTitle"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "artifact_exists",
            expected: gradingDataRef("expectedArtifactExists"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "point_count",
            expected: gradingDataRef("expectedPointCount"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "final_loss",
            expected: gradingDataRef("expectedFinalLoss"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "plotted_x",
            expected: gradingDataRef("expectedPlottedX"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "plotted_y",
            expected: gradingDataRef("expectedPlottedY"),
          },
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.LC08,
    runtime: {
      id: CORE_RUNTIME_ID.PYODIDE,
      config: {
        packages: ["pandas", "matplotlib"],
        workspace: { datasets: [TRAINING_HISTORY_DATASET] },
      },
    },
    starterCode:
      'from pathlib import Path\nimport pandas as pd\nimport matplotlib.pyplot as plt\n\ndf = pd.read_csv("data/training_history.csv")\n\nfig, ax = plt.subplots()\n# Vẽ loss theo epoch và đặt đúng nhãn/title theo đề.\nax.plot(\nax.set_xlabel(\nax.set_ylabel(\nax.set_title(\n\noutput_path = "artifacts/loss_curve.png"\nfig.savefig(output_path, bbox_inches="tight")\n\nline_count = len(ax.lines)\nx_label = ax.get_xlabel()\ny_label = ax.get_ylabel()\nplot_title = ax.get_title()\nartifact_exists = Path(output_path).is_file()\npoint_count = len(df)\nfinal_loss = round(float(df["loss"].iloc[-1]), 2)\nplotted_x = [int(round(float(v))) for v in ax.lines[0].get_xdata()]\nplotted_y = [round(float(v), 2) for v in ax.lines[0].get_ydata()]\nplt.close(fig)\n',
  });

export const CS116_PRODUCTION_TEMPLATE_LC09: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateLc09,
    version: 1,
    conceptIds: [matplotlibPyplot!.id, matplotlibSavefig!.id],
    allowedStages: [LearningStage.INDEPENDENT],
    generator: {
      id: CS116_GENERATOR_ID.DATA_SCIENCE_PRACTICE,
      config: { mode: "MATPLOTLIB_SCATTER_PLOT" },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "fig",
            expected: "Figure",
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "ax",
            expected: "Axes",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "collection_count",
            expected: gradingDataRef("expectedCollectionCount"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "x_label",
            expected: gradingDataRef("expectedXLabel"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "y_label",
            expected: gradingDataRef("expectedYLabel"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "plot_title",
            expected: gradingDataRef("expectedTitle"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "artifact_exists",
            expected: gradingDataRef("expectedArtifactExists"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "point_count",
            expected: gradingDataRef("expectedPointCount"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "scatter_points",
            expected: gradingDataRef("expectedScatterPoints"),
          },
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.LC09,
    runtime: {
      id: CORE_RUNTIME_ID.PYODIDE,
      config: {
        packages: ["pandas", "matplotlib"],
        workspace: { datasets: [CONTACTS_PLOT_DATASET] },
      },
    },
    starterCode:
      'from pathlib import Path\nimport pandas as pd\nimport matplotlib.pyplot as plt\n\ndf = pd.read_csv("data/contacts.csv")\n\nfig, ax = \nax.scatter(\nax.set_xlabel(\nax.set_ylabel(\nax.set_title(\n\noutput_path = "artifacts/threat_scatter.png"\nfig.savefig(output_path, bbox_inches="tight")\n\ncollection_count = len(ax.collections)\nx_label = ax.get_xlabel()\ny_label = ax.get_ylabel()\nplot_title = ax.get_title()\nartifact_exists = Path(output_path).is_file()\npoint_count = len(df)\nscatter_points = [[int(round(float(x))), int(round(float(y)))] for x, y in ax.collections[0].get_offsets()]\nplt.close(fig)\n',
  });

export const CS116_PRODUCTION_TEMPLATE_LC10: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateLc10,
    version: 1,
    conceptIds: [pandasDataFrame!.id, pandasMerge!.id],
    allowedStages: [LearningStage.TRANSFER],
    generator: {
      id: CS116_GENERATOR_ID.DATA_SCIENCE_PRACTICE,
      config: { mode: "PANDAS_MERGE" },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "merged",
            expected: "DataFrame",
          },
          {
            type: DeclarativeGraderCheckType.SHAPE,
            variable: "merged",
            expected: gradingDataRef("expectedMergedShape"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "merged_ids",
            expected: "list",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "merged_ids",
            expected: gradingDataRef("expectedMergedIds"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "merged_regions",
            expected: "list",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "merged_regions",
            expected: gradingDataRef("expectedMergedRegions"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "total_spend",
            expected: gradingDataRef("expectedTotalSpend"),
          },
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.LC10,
    runtime: {
      id: CORE_RUNTIME_ID.PYODIDE,
      config: {
        packages: ["pandas"],
        workspace: { datasets: [USERS_DATASET, EVENTS_DATASET] },
      },
    },
    starterCode:
      'import pandas as pd\n\nusers = pd.read_csv("data/users.csv")\nevents = pd.read_csv("data/events.csv")\n\nmerged = \nmerged_ids = \nmerged_regions = \ntotal_spend = \n',
  });

export const CS116_PRODUCTION_TEMPLATE_LC11: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateLc11,
    version: 1,
    conceptIds: [imageRgbArray!.id, pillowImageIo!.id],
    allowedStages: [LearningStage.GUIDED],
    generator: {
      id: CS116_GENERATOR_ID.DATA_SCIENCE_PRACTICE,
      config: { mode: "PIL_IMAGE_ARRAY" },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          {
            type: DeclarativeGraderCheckType.NDARRAY_TYPE,
            variable: "pixels",
          },
          {
            type: DeclarativeGraderCheckType.SHAPE,
            variable: "pixels",
            expected: gradingDataRef("expectedPixelShape"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "image_size",
            expected: "tuple",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "image_size",
            expected: gradingDataRef("expectedImageSize"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "pixel_shape",
            expected: "tuple",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "pixel_shape",
            expected: gradingDataRef("expectedPixelShape"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "channels",
            expected: "int",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "channels",
            expected: gradingDataRef("expectedChannels"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "top_left",
            expected: "list",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "top_left",
            expected: gradingDataRef("expectedTopLeft"),
          },
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.LC11,
    runtime: {
      id: CORE_RUNTIME_ID.PYODIDE,
      config: {
        packages: ["numpy", "Pillow"],
        workspace: { datasets: [PIXELS_PPM_DATASET] },
      },
    },
    starterCode:
      'import numpy as np\nfrom PIL import Image\n\nimage = Image.open("data/pixels.ppm").convert("RGB")\npixels = \n\nimage_size = \npixel_shape = \nchannels = \ntop_left = \n',
  });

export const CS116_PRODUCTION_TEMPLATE_LC12: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateLc12,
    version: 1,
    conceptIds: [imageRgbArray!.id, pillowImageIo!.id, pillowCropResize!.id],
    allowedStages: [LearningStage.INDEPENDENT],
    generator: {
      id: CS116_GENERATOR_ID.DATA_SCIENCE_PRACTICE,
      config: { mode: "PIL_CROP_RESIZE" },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          {
            type: DeclarativeGraderCheckType.NDARRAY_TYPE,
            variable: "resized_pixels",
          },
          {
            type: DeclarativeGraderCheckType.SHAPE,
            variable: "resized_pixels",
            expected: gradingDataRef("expectedResultShape"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "cropped_size",
            expected: "tuple",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "cropped_size",
            expected: gradingDataRef("expectedCroppedSize"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "resized_size",
            expected: "tuple",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "resized_size",
            expected: gradingDataRef("expectedResizedSize"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "result_shape",
            expected: "tuple",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "result_shape",
            expected: gradingDataRef("expectedResultShape"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "artifact_exists",
            expected: "bool",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "artifact_exists",
            expected: gradingDataRef("expectedArtifactExists"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "cropped_pixels",
            expected: gradingDataRef("expectedCroppedPixels"),
          },
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.LC12,
    runtime: {
      id: CORE_RUNTIME_ID.PYODIDE,
      config: {
        packages: ["numpy", "Pillow"],
        workspace: { datasets: [PIXELS_PPM_DATASET] },
      },
    },
    starterCode:
      'from pathlib import Path\nimport numpy as np\nfrom PIL import Image\n\nimage = Image.open("data/pixels.ppm").convert("RGB")\n\ncropped = \nresized = \noutput_path = "artifacts/resized.png"\nresized.save(output_path)\n\nresized_pixels = np.array(resized)\ncropped_pixels = np.array(cropped).tolist()\ncropped_size = \nresized_size = \nresult_shape = \nartifact_exists = Path(output_path).is_file()\n',
  });

export const CS116_PRODUCTION_ACTIVITY_LC13 = codeActivity({
  id: CS116_PRODUCTION_IDS.activityLc13,
  title: "LC-13 — Tạo cột value",
  description:
    "CS116: tạo cột mới value = close * volume rồi tìm mã có value lớn nhất.",
  conceptIds: [pandasDataFrame!.id, pandasColumnSelect!.id, pandasNewColumn!.id],
  stage: LearningStage.GUIDED,
  missionTemplateId: CS116_PRODUCTION_IDS.templateLc13,
});

export const CS116_PRODUCTION_TEMPLATE_LC13: MissionTemplate =
  MissionTemplateSchema.parse({
    id: CS116_PRODUCTION_IDS.templateLc13,
    version: 1,
    conceptIds: [
      pandasDataFrame!.id,
      pandasColumnSelect!.id,
      pandasNewColumn!.id,
    ],
    allowedStages: [LearningStage.GUIDED],
    generator: {
      id: CS116_GENERATOR_ID.DATA_SCIENCE_PRACTICE,
      config: { mode: "NEW_COLUMN" },
    },
    grader: {
      id: CORE_GRADER_ID.DECLARATIVE,
      config: {
        checks: [
          { type: DeclarativeGraderCheckType.NO_EXCEPTION },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "columns_after",
            expected: "list",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "columns_after",
            expected: gradingDataRef("expectedColumnsAfter"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "value_list",
            expected: "list",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "value_list",
            expected: gradingDataRef("expectedValueList"),
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "top_symbol",
            expected: gradingDataRef("expectedTopSymbol"),
          },
          {
            type: DeclarativeGraderCheckType.PYTHON_TYPE,
            variable: "total_value",
            expected: "int",
          },
          {
            type: DeclarativeGraderCheckType.EXACT_VALUES,
            variable: "total_value",
            expected: gradingDataRef("expectedTotalValue"),
          },
        ],
      },
    },
    hintSetId: CS116_HINT_SET_ID.LC13,
    runtime: {
      id: CORE_RUNTIME_ID.PYODIDE,
      config: {
        packages: ["pandas"],
        workspace: { datasets: [STOCKS_DATASET] },
      },
    },
    starterCode:
      'import pandas as pd\n\ndf = pd.read_csv("data/stocks.csv")\n\n# Tạo cột mới value = close * volume\ndf["value"] = \ncolumns_after = \nvalue_list = \ntop_symbol = \ntotal_value = \n',
  });
