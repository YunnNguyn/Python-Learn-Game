import {
  BossMissionActivitySchema,
  CodeMissionActivitySchema,
  ContentPackManifestSchema,
  CourseSchema,
  DebugMissionActivitySchema,
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
import type { ContentDefinitionSet } from "../../core/content";
import { PYTHON_FOUNDATIONS_CONCEPT_IDS as C, PYTHON_FOUNDATIONS_CONCEPTS } from "./concepts";
import { PYTHON_FOUNDATIONS_GENERATOR_ID as G } from "./generators";
import { PYTHON_FOUNDATIONS_HINT_SET_ID as H } from "./hints";
import {
  approxListVariable,
  boolVariable,
  exactListVariable,
  floatVariable,
  functionVariable,
  grader,
  intVariable,
  pyodideStdlib,
  strVariable,
} from "./content-helpers";
import { PYTHON_FOUNDATIONS_M9_CONTENT as M9 } from "./content-m9";
import { PYTHON_FOUNDATIONS_IDS as ID } from "./ids";

/**
 * Native "Python Foundations" course (PHASE-06 / M8): one world, two lessons, seven
 * missions that run as real Python in the browser (Pyodide, standard library only - no
 * package download, no Local Python).
 *
 * It is registered next to CS116 as a separate course with its own ids, concepts and
 * generators. It reuses the existing archetypes unchanged: generated MissionInstance,
 * the declarative grader (variable observations only), hint sets H1-H4, Run / Submit.
 */

export const PYTHON_FOUNDATIONS_PACK: ContentPackManifest = ContentPackManifestSchema.parse({
  id: ID.pack,
  version: "0.2.0",
  schemaVersion: 1,
  title: "Python Foundations",
  description:
    "Khóa Python nền tảng cho ML: biến và kiểu số, rẽ nhánh, list và vòng lặp, hàm, collections, xử lý lỗi và dữ liệu JSON, rồi NumPy cơ bản — luyện bằng mã Python thật chạy trong trình duyệt.",
  courseIds: [ID.course],
  dependencies: [],
});

export const PYTHON_FOUNDATIONS_COURSE: Course = CourseSchema.parse({
  id: ID.course,
  title: "Python Foundations — Lập trình Python cho ML",
  description:
    "Khóa độc lập, không cần học NumPy trước. Bắt đầu từ biến, số và rẽ nhánh, rồi đến list, vòng lặp và hàm; tiếp theo là cắt lát, dictionary, comprehension, hàm chấm nhiều trường hợp, sửa lỗi và một mini-project JSON; cuối cùng là NumPy thật chạy trong trình duyệt.",
  worldIds: [ID.world, ID.worldCollections, ID.worldNumpy],
});

export const PYTHON_FOUNDATIONS_WORLD: World = WorldSchema.parse({
  id: ID.world,
  title: "Python Foundations",
  description:
    "Hai bài học, bảy nhiệm vụ lập trình. Mỗi nhiệm vụ chạy Python thật trong trình duyệt và được chấm trên kết quả chương trình của bạn.",
  lessonIds: [ID.lessonValuesDecisions, ID.lessonCollectionsFunctions],
});

export const PYTHON_FOUNDATIONS_LESSON_VALUES_DECISIONS: Lesson = LessonSchema.parse({
  id: ID.lessonValuesDecisions,
  title: "Bài 1 — Values & Decisions",
  description:
    "Giá trị, kiểu số và phép tính; biểu thức Boolean và if / elif / else; sửa lỗi kiểu dữ liệu.",
  conceptIds: [C.variables, C.numericTypes, C.booleans, C.ifElse, C.typeConversion],
  activityIds: [ID.activityPf01, ID.activityPf02, ID.activityPf03],
});

export const PYTHON_FOUNDATIONS_LESSON_COLLECTIONS_FUNCTIONS: Lesson = LessonSchema.parse({
  id: ID.lessonCollectionsFunctions,
  title: "Bài 2 — Collections & Functions",
  description:
    "List và vòng lặp for để lọc dữ liệu; viết hàm trả về giá trị tổng hợp; ghép tất cả thành một pipeline tiền xử lý nhỏ.",
  conceptIds: [C.lists, C.loops, C.functions, C.aggregation, C.ifElse],
  activityIds: [
    ID.activityPf04,
    ID.activityPf05,
    ID.activityPf06,
    ID.activityPf07,
  ],
});

// ---------------------------------------------------------------------------------------
// Starter code. Every placeholder is a runnable `None` (never a syntax error), so Run works
// on the untouched starter and the grader reports precisely what is still missing.
// ---------------------------------------------------------------------------------------

const PF01_STARTER = `# width, height, channels là các số nguyên đã được nạp sẵn (xem tab Dữ liệu).
# TODO: thay mỗi \`None\` bằng biểu thức tính đúng.

# 1) Số pixel của ảnh.
pixel_count = None  # TODO

# 2) Tỉ lệ khung hình = rộng / cao. Kết quả là số thực.
aspect_ratio = None  # TODO

# 3) Tổng số giá trị số của ảnh: mỗi pixel có \`channels\` giá trị.
total_values = None  # TODO

# 4) Một nửa chiều rộng, làm tròn xuống, vẫn là số nguyên.
half_width = None  # TODO

print(pixel_count, aspect_ratio, total_values, half_width)
`;

const PF02_STARTER = `# confidence, high_threshold, low_threshold, edge_confidence đã được nạp sẵn.
# Quy tắc gắn nhãn:
#   confidence >= high_threshold                -> "accept"
#   chưa đạt, nhưng confidence >= low_threshold -> "review"
#   còn lại                                     -> "reject"

# 1) Biểu thức Boolean: độ tin cậy có đạt ngưỡng cao không?
is_confident = None

# 2) Gắn nhãn cho \`confidence\` bằng if / elif / else.
label = None
# TODO: viết if / elif / else ở đây và gán label trong từng nhánh.

# 3) Áp dụng đúng quy tắc đó cho \`edge_confidence\` (giá trị đúng bằng ngưỡng cao).
edge_label = None
# TODO: lặp lại quy tắc cho edge_confidence.

print(is_confident, label, edge_label)
`;

const PF03_STARTER = `# Metadata của ảnh được đọc từ file, nên width_text và height_text là chuỗi (str).
# max_pixels là số nguyên: số pixel tối đa mà mô hình nhận.
# Đoạn mã dưới đây có lỗi. Hãy chạy thử, đọc thông báo, rồi sửa — không cần viết lại từ đầu.
# TODO: tìm và sửa lỗi (có hơn một lỗi) cho đến khi kết quả in ra đúng.

width = width_text
height = height_text
pixel_count = width * height

if pixel_count < max_pixels:
    size_label = "too_large"
else:
    size_label = "ok"

print(pixel_count, size_label)
`;

const PF04_STARTER = `# readings là list các số đo; số đo hợp lệ nằm trong đoạn [min_valid, max_valid].
# Duyệt từng số đo bằng vòng lặp for.

valid_readings = []   # các số đo hợp lệ, giữ nguyên thứ tự
invalid_count = 0     # số số đo không hợp lệ
valid_total = 0       # tổng các số đo hợp lệ

for value in readings:
    # TODO: nếu value hợp lệ thì thêm vào valid_readings và cộng vào valid_total,
    # ngược lại tăng invalid_count.
    pass

print(valid_readings, invalid_count, valid_total)
`;

const PF05_STARTER = `# Viết hàm mean_of(values): trả về trung bình cộng của list values (một số thực).
# Quy ước: nếu values rỗng thì trả về 0.0. Không dùng NumPy.

def mean_of(values):
    # TODO: tính trung bình cộng rồi return.
    return None


mean_a = mean_of(samples_a)
mean_b = mean_of(samples_b)
mean_empty = mean_of([])

print(mean_a, mean_b, mean_empty)
`;

const PF06_STARTER = `# Viết hàm normalize_valid(values, max_value):
#   - bỏ qua giá trị không hợp lệ (ngoài đoạn từ 0 đến max_value, tính cả hai đầu mút);
#   - với giá trị hợp lệ, tính value / max_value;
#   - trả về list kết quả, giữ nguyên thứ tự.
# Không dùng NumPy.

def normalize_valid(values, max_value):
    # TODO: dùng vòng lặp, điều kiện và một list kết quả.
    return None


normalized_8bit = normalize_valid(row_8bit, 255)
normalized_10bit = normalize_valid(row_10bit, 1023)
normalized_none = normalize_valid([-3, 999], 255)

print(normalized_8bit)
print(normalized_10bit)
print(normalized_none)
`;

const PF07_STARTER = `# Pipeline tiền xử lý cho một bộ dự đoán.
# Dữ liệu đã nạp sẵn: confidences (có thể chứa giá trị lỗi ngoài đoạn [0, 1]),
# high_threshold và low_threshold.


def label_for(confidence, high, low):
    # TODO: trả về "accept", "review" hoặc "reject" theo quy tắc ngưỡng.
    return None


clean_confidences = []   # độ tin cậy hợp lệ (0 <= c <= 1), giữ nguyên thứ tự
labels = []              # nhãn tương ứng từng phần tử của clean_confidences
accept_count = 0
review_count = 0
reject_count = 0
mean_confidence = 0.0    # trung bình của clean_confidences; 0.0 nếu rỗng

# TODO: duyệt confidences, lọc giá trị hợp lệ, gắn nhãn bằng label_for và đếm.
# TODO: tính mean_confidence sau vòng lặp.

print(clean_confidences)
print(labels)
print(accept_count, review_count, reject_count, mean_confidence)
`;

export const PYTHON_FOUNDATIONS_STARTER_CODE = {
  pf01: PF01_STARTER,
  pf02: PF02_STARTER,
  pf03: PF03_STARTER,
  pf04: PF04_STARTER,
  pf05: PF05_STARTER,
  pf06: PF06_STARTER,
  pf07: PF07_STARTER,
} as const;

// ---------------------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------------------

export const PYTHON_FOUNDATIONS_TEMPLATE_PF01: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf01,
  version: 1,
  conceptIds: [C.variables, C.numericTypes],
  allowedStages: [LearningStage.GUIDED],
  generator: { id: G.PF01 },
  grader: grader(
    intVariable("pixel_count", "pixelCount"),
    floatVariable("aspect_ratio", "aspectRatio"),
    intVariable("total_values", "totalValues"),
    intVariable("half_width", "halfWidth"),
  ),
  runtime: pyodideStdlib,
  hintSetId: H.PF01,
  starterCode: PF01_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF02: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf02,
  version: 1,
  conceptIds: [C.booleans, C.ifElse],
  allowedStages: [LearningStage.GUIDED],
  generator: { id: G.PF02 },
  grader: grader(
    boolVariable("is_confident", "isConfident"),
    strVariable("label", "label"),
    strVariable("edge_label", "edgeLabel"),
  ),
  runtime: pyodideStdlib,
  hintSetId: H.PF02,
  starterCode: PF02_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF03: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf03,
  version: 1,
  conceptIds: [C.typeConversion, C.ifElse],
  allowedStages: [LearningStage.INDEPENDENT],
  generator: { id: G.PF03 },
  grader: grader(
    intVariable("width", "width"),
    intVariable("height", "height"),
    intVariable("pixel_count", "pixelCount"),
    strVariable("size_label", "sizeLabel"),
  ),
  runtime: pyodideStdlib,
  hintSetId: H.PF03,
  starterCode: PF03_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF04: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf04,
  version: 1,
  conceptIds: [C.lists, C.loops],
  allowedStages: [LearningStage.GUIDED],
  generator: { id: G.PF04 },
  grader: grader(
    exactListVariable("valid_readings", "validReadings"),
    intVariable("invalid_count", "invalidCount"),
    intVariable("valid_total", "validTotal"),
  ),
  runtime: pyodideStdlib,
  hintSetId: H.PF04,
  starterCode: PF04_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF05: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf05,
  version: 1,
  conceptIds: [C.functions, C.aggregation],
  allowedStages: [LearningStage.INDEPENDENT],
  generator: { id: G.PF05 },
  grader: grader(
    functionVariable("mean_of"),
    floatVariable("mean_a", "meanA"),
    floatVariable("mean_b", "meanB"),
    floatVariable("mean_empty", "meanEmpty"),
  ),
  runtime: pyodideStdlib,
  hintSetId: H.PF05,
  starterCode: PF05_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF06: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf06,
  version: 1,
  conceptIds: [C.lists, C.loops, C.functions],
  allowedStages: [LearningStage.TRANSFER],
  generator: { id: G.PF06 },
  grader: grader(
    functionVariable("normalize_valid"),
    approxListVariable("normalized_8bit", "normalized8bit"),
    approxListVariable("normalized_10bit", "normalized10bit"),
    approxListVariable("normalized_none", "normalizedNone"),
  ),
  runtime: pyodideStdlib,
  hintSetId: H.PF06,
  starterCode: PF06_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF07: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf07,
  version: 1,
  conceptIds: [C.lists, C.loops, C.ifElse, C.functions, C.aggregation],
  allowedStages: [LearningStage.REVIEW],
  generator: { id: G.PF07 },
  grader: grader(
    functionVariable("label_for"),
    approxListVariable("clean_confidences", "cleanConfidences"),
    exactListVariable("labels", "labels"),
    intVariable("accept_count", "acceptCount"),
    intVariable("review_count", "reviewCount"),
    intVariable("reject_count", "rejectCount"),
    floatVariable("mean_confidence", "meanConfidence"),
  ),
  runtime: pyodideStdlib,
  hintSetId: H.PF07,
  starterCode: PF07_STARTER,
});

// ---------------------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------------------

export const PYTHON_FOUNDATIONS_ACTIVITY_PF01: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf01,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-01 — Kích thước ảnh và số pixel",
  description:
    "Dùng biến và phép tính số học để tính số pixel, tỉ lệ khung hình và số giá trị của một ảnh.",
  conceptIds: [C.variables, C.numericTypes],
  stage: LearningStage.GUIDED,
  missionTemplateId: ID.templatePf01,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF02: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf02,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-02 — Gắn nhãn theo độ tin cậy",
  description:
    "Dùng biểu thức Boolean và if / elif / else để gắn nhãn accept, review hoặc reject cho một dự đoán theo ngưỡng tin cậy.",
  conceptIds: [C.booleans, C.ifElse],
  stage: LearningStage.GUIDED,
  missionTemplateId: ID.templatePf02,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF03: LearningActivity = DebugMissionActivitySchema.parse({
  id: ID.activityPf03,
  type: LearningActivityType.DEBUG_MISSION,
  title: "PF-03 — Sửa lỗi kiểu dữ liệu và rẽ nhánh",
  description:
    "Đoạn mã xử lý metadata ảnh dạng chữ đang gặp lỗi. Hãy tìm và sửa các lỗi về kiểu dữ liệu và rẽ nhánh mà không viết lại từ đầu.",
  conceptIds: [C.typeConversion, C.ifElse],
  stage: LearningStage.INDEPENDENT,
  missionTemplateId: ID.templatePf03,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF04: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf04,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-04 — Lọc số đo cảm biến",
  description:
    "Dùng list và vòng lặp for để giữ lại số đo hợp lệ, đếm số đo lỗi và cộng các số đo hợp lệ.",
  conceptIds: [C.lists, C.loops],
  stage: LearningStage.GUIDED,
  missionTemplateId: ID.templatePf04,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF05: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf05,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-05 — Hàm tính trung bình",
  description:
    "Viết hàm mean_of trả về trung bình cộng của một list số, không dùng NumPy, và xử lý được list rỗng.",
  conceptIds: [C.functions, C.aggregation],
  stage: LearningStage.INDEPENDENT,
  missionTemplateId: ID.templatePf05,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF06: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf06,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-06 — Chuẩn hóa pixel hợp lệ",
  description:
    "Vận dụng list, vòng lặp, điều kiện và hàm trong một bối cảnh mới: lọc các pixel hợp lệ rồi chuẩn hóa chúng về đoạn từ 0 đến 1.",
  conceptIds: [C.lists, C.loops, C.functions],
  stage: LearningStage.TRANSFER,
  missionTemplateId: ID.templatePf06,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF07: LearningActivity = BossMissionActivitySchema.parse({
  id: ID.activityPf07,
  type: LearningActivityType.BOSS_MISSION,
  title: "PF-07 — Tiền xử lý một bộ dự đoán",
  description:
    "Dựng một pipeline tiền xử lý nhỏ: lọc độ tin cậy lỗi, gắn nhãn, đếm theo nhãn và tính trung bình trên bộ dữ liệu có sẵn.",
  conceptIds: [C.lists, C.loops, C.ifElse, C.functions, C.aggregation],
  stage: LearningStage.REVIEW,
  missionTemplateId: ID.templatePf07,
});

export const PYTHON_FOUNDATIONS_CONTENT = {
  packs: [PYTHON_FOUNDATIONS_PACK],
  concepts: PYTHON_FOUNDATIONS_CONCEPTS,
  courses: [PYTHON_FOUNDATIONS_COURSE],
  worlds: [PYTHON_FOUNDATIONS_WORLD, ...M9.worlds],
  lessons: [
    PYTHON_FOUNDATIONS_LESSON_VALUES_DECISIONS,
    PYTHON_FOUNDATIONS_LESSON_COLLECTIONS_FUNCTIONS,
    ...M9.lessons,
  ],
  activities: [
    PYTHON_FOUNDATIONS_ACTIVITY_PF01,
    PYTHON_FOUNDATIONS_ACTIVITY_PF02,
    PYTHON_FOUNDATIONS_ACTIVITY_PF03,
    PYTHON_FOUNDATIONS_ACTIVITY_PF04,
    PYTHON_FOUNDATIONS_ACTIVITY_PF05,
    PYTHON_FOUNDATIONS_ACTIVITY_PF06,
    PYTHON_FOUNDATIONS_ACTIVITY_PF07,
    ...M9.activities,
  ],
  missionTemplates: [
    PYTHON_FOUNDATIONS_TEMPLATE_PF01,
    PYTHON_FOUNDATIONS_TEMPLATE_PF02,
    PYTHON_FOUNDATIONS_TEMPLATE_PF03,
    PYTHON_FOUNDATIONS_TEMPLATE_PF04,
    PYTHON_FOUNDATIONS_TEMPLATE_PF05,
    PYTHON_FOUNDATIONS_TEMPLATE_PF06,
    PYTHON_FOUNDATIONS_TEMPLATE_PF07,
    ...M9.missionTemplates,
  ],
} satisfies ContentDefinitionSet;
