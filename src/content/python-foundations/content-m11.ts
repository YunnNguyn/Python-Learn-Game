import {
  BossMissionActivitySchema,
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
import { PYTHON_FOUNDATIONS_CONCEPT_IDS as C } from "./concepts";
import { functionCases, functionVariable, grader, intVariable } from "./content-helpers";
import { pyodideMatplotlibWithData, typedValue } from "./content-helpers-m10";
import { ANNOTATION_DATASETS } from "./datasets-m11";
import { PYTHON_FOUNDATIONS_M11_GENERATOR_ID as G } from "./generators-m11";
import { PYTHON_FOUNDATIONS_M11_HINT_SET_ID as H } from "./hints-m11";
import { PYTHON_FOUNDATIONS_IDS as ID } from "./ids";

/**
 * M11 (PHASE-09): the final capstone PF-27 "Kiểm tra và chuẩn bị annotation ảnh", one world
 * and one lesson appended to the SAME course after PF-26. It reuses the existing archetypes
 * only: a generated MissionInstance, the declarative grader with the M9 FUNCTION_CASES and
 * the M10 TYPED_VALUE checks, H1-H4 hints, Run / Submit.
 *
 * Stage choice: TRANSFER. The capstone moves everything learned about tables, arrays and
 * charts to a NEW domain (computer-vision annotations) with no scaffolding - that is the
 * definition of TRANSFER. REVIEW was rejected on purpose: a concept that has only REVIEW
 * successes never rises above "Đã tiếp xúc" in the existing mastery ladder, which would make
 * the review recommender suggest the capstone as "weak" forever after a pass. Retention keeps
 * its existing rule (a REVIEW/RETENTION pass at least 24 hours after the first pass), which
 * the review panel points the learner to; nothing about it is faked here.
 */

export const PYTHON_FOUNDATIONS_WORLD_CAPSTONE: World = WorldSchema.parse({
  id: ID.worldCapstone,
  title: "Capstone",
  description:
    "Nhiệm vụ cuối của khóa: một bài tự lập, không có khung từng bước, đưa mọi thứ bạn đã học sang một lĩnh vực mới — kiểm tra chất lượng annotation ảnh.",
  lessonIds: [ID.lessonCapstoneAnnotations],
});

export const PYTHON_FOUNDATIONS_LESSON_CAPSTONE_ANNOTATIONS: Lesson = LessonSchema.parse({
  id: ID.lessonCapstoneAnnotations,
  title: "Bài 11 — Capstone: Kiểm tra annotation ảnh",
  description:
    "Đọc một bộ bounding box có lỗi, làm sạch và kiểm tra hộp, chuẩn hóa tọa độ về [0, 1], dựng ma trận đặc trưng, tóm tắt theo lớp và vẽ biểu đồ phân bố lớp. Dự kiến 45–75 phút, không có đồng hồ bấm giờ.",
  conceptIds: [C.annotationQa, C.dataPipeline],
  activityIds: [ID.activityPf27],
});

// ---------------------------------------------------------------------------------------
// Starter code: function contracts and minimal scaffolding only. Every placeholder is a
// runnable `None` (never a syntax error), so Run works on the untouched starter.
// ---------------------------------------------------------------------------------------

const PF27_STARTER = `import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

# annotation_file và allowed_labels đã được nạp sẵn (xem tab Dữ liệu). File nằm trong thư mục data/.
# Hợp đồng đầy đủ của từng hàm nằm trong đề bài (tab Đề bài).

REQUIRED_COLUMNS = ["image_id", "width", "height", "label", "xmin", "ymin", "xmax", "ymax", "split"]
SPLITS = ["train", "val", "test"]


def clean_annotations(df, allowed_labels):
    # TODO
    return None


def normalize_boxes(clean):
    # TODO
    return None


def class_summary(clean):
    # TODO
    return None


def plot_class_distribution(summary):
    # TODO
    return None


raw = None      # TODO: đọc file CSV bằng pandas
clean = None    # TODO
norm = None     # TODO
X = None        # TODO: ndarray float64 shape (số_hộp, 4)
summary = None  # TODO
rejected = None # TODO: số nguyên
ax = None       # TODO
`;

export const PYTHON_FOUNDATIONS_M11_STARTER_CODE = {
  pf27: PF27_STARTER,
} as const;

export const PYTHON_FOUNDATIONS_TEMPLATE_PF27: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf27,
  version: 1,
  conceptIds: [C.annotationQa, C.dataPipeline, C.csvLoading, C.numpyPreprocessing, C.matplotlibCharts],
  allowedStages: [LearningStage.TRANSFER],
  generator: { id: G.PF27 },
  grader: grader(
    functionVariable("clean_annotations"),
    functionVariable("normalize_boxes"),
    functionVariable("class_summary"),
    functionVariable("plot_class_distribution"),
    [functionCases("clean_annotations", "cleanCases")],
    [functionCases("normalize_boxes", "normalizeCases")],
    [functionCases("class_summary", "summaryCases")],
    [functionCases("plot_class_distribution", "plotCases")],
    [typedValue("clean", "clean")],
    [typedValue("norm", "norm")],
    [typedValue("X", "X")],
    [typedValue("summary", "summary")],
    intVariable("rejected", "rejected"),
    [typedValue("ax", "ax")],
  ),
  runtime: pyodideMatplotlibWithData(ANNOTATION_DATASETS),
  hintSetId: H.PF27,
  starterCode: PF27_STARTER,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF27: LearningActivity = BossMissionActivitySchema.parse({
  id: ID.activityPf27,
  type: LearningActivityType.BOSS_MISSION,
  title: "PF-27 — Capstone: kiểm tra và chuẩn bị annotation ảnh",
  description:
    "Tự dựng một pipeline kiểm tra chất lượng bộ annotation bounding box: làm sạch và kiểm tra hộp, chuẩn hóa tọa độ về [0, 1], dựng ma trận đặc trưng, tóm tắt theo lớp và vẽ biểu đồ phân bố lớp. Bài tự lập cuối khóa, không huấn luyện mô hình.",
  conceptIds: [C.annotationQa, C.dataPipeline, C.csvLoading, C.numpyPreprocessing, C.matplotlibCharts],
  stage: LearningStage.TRANSFER,
  missionTemplateId: ID.templatePf27,
});

export const PYTHON_FOUNDATIONS_M11_CONTENT = {
  worlds: [PYTHON_FOUNDATIONS_WORLD_CAPSTONE],
  lessons: [PYTHON_FOUNDATIONS_LESSON_CAPSTONE_ANNOTATIONS],
  activities: [PYTHON_FOUNDATIONS_ACTIVITY_PF27],
  missionTemplates: [PYTHON_FOUNDATIONS_TEMPLATE_PF27],
} as const;
