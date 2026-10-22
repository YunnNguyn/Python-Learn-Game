import {
  BossMissionActivitySchema,
  CodeMissionActivitySchema,
  DebugMissionActivitySchema,
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
import { DeclarativeGraderCheckType } from "../../core/grading";
import { PYTHON_FOUNDATIONS_CONCEPT_IDS as C } from "./concepts";
import {
  approx,
  approxListVariable,
  dictVariable,
  exactListVariable,
  exactLiteral,
  exactly,
  exists,
  functionCases,
  functionVariable,
  grader,
  intVariable,
  ndarrayVariable,
  pyodideNumpy,
  pyodideStdlib,
  tupleVariable,
  typeIs,
} from "./content-helpers";
import { PYTHON_FOUNDATIONS_M9_GENERATOR_ID as G } from "./generators-m9";
import { PYTHON_FOUNDATIONS_M9_HINT_SET_ID as H } from "./hints-m9";
import { PYTHON_FOUNDATIONS_IDS as ID } from "./ids";

/**
 * M9 (PHASE-07): the next slice of the native Python course. Two more worlds in the SAME
 * course, three lessons, eight missions (M9-01..M9-08 = PF-08..PF-15). They reuse the
 * existing archetypes - generated MissionInstance, declarative grader, H1-H4 hints, Run /
 * Submit - and add one grader check, FUNCTION_CASES, for the missions that grade behaviour.
 *
 * Independence ramps up on purpose: PF-08/PF-09 are scaffolded, PF-10 starts from a worked
 * loop, PF-11/PF-13 give a bare function stub, PF-12 is a debugging task, PF-14 gives one
 * worked line, and PF-15 asks for three NumPy functions plus their composition.
 */

export const PYTHON_FOUNDATIONS_WORLD_COLLECTIONS: World = WorldSchema.parse({
  id: ID.worldCollections,
  title: "Collections & Intermediate Python",
  description:
    "Sáu nhiệm vụ: cắt lát, dictionary / tuple / set, comprehension, hàm dùng lại được chấm trên nhiều trường hợp, sửa lỗi xử lý dữ liệu nhập và một mini-project đọc bản ghi JSON.",
  lessonIds: [ID.lessonSequencesRecords, ID.lessonFunctionsProjects],
});

export const PYTHON_FOUNDATIONS_WORLD_NUMPY: World = WorldSchema.parse({
  id: ID.worldNumpy,
  title: "Introduction to NumPy",
  description:
    "Hai nhiệm vụ dùng NumPy thật chạy trong trình duyệt: tạo và đọc ndarray, rồi vector hóa, mặt nạ Boolean và phép toán theo axis.",
  lessonIds: [ID.lessonNumpyArrays],
});

export const PYTHON_FOUNDATIONS_LESSON_SEQUENCES_RECORDS: Lesson = LessonSchema.parse({
  id: ID.lessonSequencesRecords,
  title: "Bài 3 — Sequences & Records",
  description:
    "Chỉ số và cắt lát, dictionary / tuple / set cho bản ghi và nhãn, comprehension để lọc và biến đổi dữ liệu gọn hơn.",
  conceptIds: [C.indexing, C.slicing, C.dicts, C.tuplesSets, C.comprehensions],
  activityIds: [ID.activityPf08, ID.activityPf09, ID.activityPf10],
});

export const PYTHON_FOUNDATIONS_LESSON_FUNCTIONS_PROJECTS: Lesson = LessonSchema.parse({
  id: ID.lessonFunctionsProjects,
  title: "Bài 4 — Functions, Errors & Mini-project",
  description:
    "Viết hàm đúng với nhiều đầu vào, xử lý ngoại lệ và kiểm tra dữ liệu nhập, rồi ghép lại thành một mini-project làm sạch bản ghi JSON.",
  conceptIds: [C.reusableFunctions, C.exceptions, C.inputValidation, C.jsonRecords],
  activityIds: [ID.activityPf11, ID.activityPf12, ID.activityPf13],
});

export const PYTHON_FOUNDATIONS_LESSON_NUMPY_ARRAYS: Lesson = LessonSchema.parse({
  id: ID.lessonNumpyArrays,
  title: "Bài 5 — NumPy Arrays",
  description:
    "ndarray, shape, dtype và chỉ số; vector hóa, mặt nạ Boolean và một phép toán theo axis trên dữ liệu cảm biến.",
  conceptIds: [C.numpyArrays, C.numpyIndexing, C.numpyVectorization, C.numpyMasksAxis],
  activityIds: [ID.activityPf14, ID.activityPf15],
});

// ---------------------------------------------------------------------------------------
// Starter code
// ---------------------------------------------------------------------------------------

const PF08_STARTER = `# samples là list các số đo theo thứ tự thời gian (cũ nhất ở đầu, mới nhất ở cuối).
# n, start, stop đã được nạp sẵn (xem tab Dữ liệu).
#
# Nhắc nhanh:
#   - chỉ số bắt đầu từ 0; chỉ số âm đếm từ cuối: samples[-1] là phần tử cuối;
#   - samples[a:b] lấy từ chỉ số a đến b-1 (b KHÔNG được lấy);
#   - samples[a:b:c] thêm bước nhảy c; bước âm đi ngược.

first_sample = samples[0]   # ví dụ đã làm sẵn
last_sample = None          # TODO: số đo cuối cùng
head = None                 # TODO: n số đo đầu tiên
tail = None                 # TODO: n số đo cuối cùng
window = None               # TODO: các số đo từ chỉ số start đến chỉ số stop - 1
every_second = None         # TODO: cách một phần tử, bắt đầu từ phần tử đầu
newest_first = None         # TODO: toàn bộ list theo thứ tự đảo ngược (không sửa samples)

print(first_sample, last_sample, head, tail, window, every_second, newest_first)
`;

const PF09_STARTER = `# labels là nhãn của từng ảnh (có lặp); width, height là kích thước ảnh. Đã nạp sẵn.

# 1) Đếm số lần xuất hiện của mỗi nhãn bằng một dictionary.
label_counts = {}
for label in labels:
    # TODO: tăng bộ đếm của label (lần đầu gặp nhãn này thì bắt đầu từ 0).
    pass

# 2) Một set các nhãn khác nhau, và list của chúng theo thứ tự bảng chữ cái.
unique_labels = None  # TODO
unique_sorted = None  # TODO

# 3) Tuple (nhãn, số lần) của nhãn xuất hiện nhiều nhất.
top_label = None  # TODO

# 4) Dictionary nhãn -> chỉ số 0, 1, 2, ... theo thứ tự bảng chữ cái.
class_index = None  # TODO

# 5) Hai tuple kích thước.
image_size = None    # TODO: (width, height)
swapped_size = None  # TODO: (height, width)

print(label_counts, unique_sorted, top_label, class_index, image_size, swapped_size)
`;

const PF10_STARTER = `# pixels, bright_from, words, scores, pass_mark đã được nạp sẵn (xem tab Dữ liệu).
# Mỗi biến chỉ cần MỘT comprehension.

# 1) Đây là phiên bản dùng vòng lặp. Hãy viết lại thành một list comprehension cho cùng kết quả.
valid_scaled = []
for p in pixels:
    if 0 <= p <= 255:
        valid_scaled.append(p / 255)
# TODO: thay đoạn vòng lặp trên bằng một list comprehension.

# 2) Chỉ số (trong list pixels gốc) của các pixel HỢP LỆ có giá trị từ bright_from trở lên.
bright_indices = []  # TODO

# 3) Dictionary: từ -> độ dài của từ, với mọi từ trong words.
word_lengths = {}  # TODO

# 4) Dictionary chỉ giữ học viên có điểm từ pass_mark trở lên.
passed_scores = {}  # TODO

print(valid_scaled)
print(bright_indices)
print(word_lengths, passed_scores)
`;

const PF11_STARTER = `# Hai hàm dưới đây sẽ được gọi với NHIỀU đầu vào khác nhau khi nộp bài
# (kể cả list rỗng và các giá trị đúng bằng cận). Hãy viết quy tắc, đừng viết cứng kết quả.

def moving_average(values, window):
    """Trung bình của mọi đoạn liên tiếp dài \`window\` phần tử, từ trái sang phải."""
    # TODO
    return None


def clip_values(values, low, high):
    """List MỚI: giá trị < low thành low, giá trị > high thành high. Không sửa \`values\`."""
    # TODO
    return None


# Chạy thử với ví dụ trong đề (example_* đã được nạp sẵn).
print(moving_average(example_values, example_window))
print(clip_values(example_values, example_low, example_high))
`;

const PF12_STARTER = `# Hàm xử lý dữ liệu nhập từ form: mỗi phần tử của raw_values là chuỗi người dùng gõ.
# Hàm dưới đây CÓ LỖI. Hãy chạy thử, đọc thông báo lỗi, rồi sửa từng chỗ — không cần viết lại từ đầu.
# TODO: sửa cho đến khi \`result\` đúng và hàm đúng với mọi đầu vào được mô tả trong phần Mô tả.

def parse_measurements(raw_values, low, high):
    values = []
    rejected = 0
    for text in raw_values:
        try:
            number = int(text)
        except ValueError:
            rejected += 1
            continue
        if low < number < high:
            values.append(number)
        else:
            rejected += 1
    return values, rejected


result = parse_measurements(form_inputs, low, high)
print(result)
`;

const PF13_STARTER = `import json

# raw_json là chuỗi JSON thô (xem tab Dữ liệu). Viết hàm summarize_records theo phần Mô tả.
# Gợi ý: tách một hàm phụ kiểm tra MỘT bản ghi, rồi dùng nó trong vòng lặp chính.


def summarize_records(text):
    # TODO: đọc JSON, lọc bản ghi hợp lệ, tổng hợp và trả về dictionary.
    return {}


summary = summarize_records(raw_json)
print(summary)
`;

const PF14_STARTER = `import numpy as np

# table (list lồng nhau), row_i và col_j đã được nạp sẵn.

# 1) Tạo ndarray số thực 64-bit từ table (đã làm sẵn làm ví dụ).
arr = np.array(table, dtype=np.float64)

# 2) Đọc cấu trúc của arr.
n_dims = None         # TODO: số chiều
shape_of_arr = None   # TODO: shape (một tuple)
element_count = None  # TODO: tổng số phần tử
dtype_name = None     # TODO: TÊN dtype dạng chuỗi

# 3) Lấy phần tử bằng chỉ số.
last_row = None       # TODO: hàng cuối của arr
second_column = None  # TODO: cột thứ hai (chỉ số 1) của arr
picked = None         # TODO: phần tử ở hàng row_i, cột col_j


def describe_array(a):
    """Mô tả một mảng BẤT KỲ (số chiều, dtype nào cũng được)."""
    # TODO: thay mỗi None bằng thuộc tính tương ứng của a.
    return {"ndim": None, "shape": None, "size": None, "dtype": None}


print(describe_array(arr))
print(n_dims, shape_of_arr, element_count, dtype_name, picked)
`;

const PF15_STARTER = `import numpy as np

# grid (list lồng nhau: mỗi hàng là một cảm biến) và max_value đã được nạp sẵn.
data = np.array(grid, dtype=np.float64)


def valid_mask(data, max_value):
    """Mảng Boolean cùng shape: True nếu 0 <= giá trị <= max_value."""
    # TODO
    return None


def scale_valid(data, max_value):
    """Mảng float64 cùng shape: hợp lệ -> giá trị / max_value, không hợp lệ -> 0.0."""
    # TODO
    return None


def sensor_means(data, max_value):
    """Mảng 1 chiều: trung bình các số đo HỢP LỆ của từng hàng (0.0 nếu hàng không có số đo hợp lệ)."""
    # TODO
    return None


# Ghép các hàm lại. Cả hai kết quả phải là số nguyên Python thường (dùng int(...)).
valid_total = None  # TODO: tổng số đo hợp lệ trong data
best_sensor = None  # TODO: chỉ số hàng có trung bình hợp lệ cao nhất

print(valid_total, best_sensor)
`;

export const PYTHON_FOUNDATIONS_M9_STARTER_CODE = {
  pf08: PF08_STARTER,
  pf09: PF09_STARTER,
  pf10: PF10_STARTER,
  pf11: PF11_STARTER,
  pf12: PF12_STARTER,
  pf13: PF13_STARTER,
  pf14: PF14_STARTER,
  pf15: PF15_STARTER,
} as const;

// ---------------------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------------------

export const PYTHON_FOUNDATIONS_TEMPLATE_PF08: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf08,
  version: 1,
  conceptIds: [C.indexing, C.slicing],
  allowedStages: [LearningStage.GUIDED],
  generator: { id: G.PF08 },
  grader: grader(
    intVariable("first_sample", "firstSample"),
    intVariable("last_sample", "lastSample"),
    exactListVariable("head", "head"),
    exactListVariable("tail", "tail"),
    exactListVariable("window", "window"),
    exactListVariable("every_second", "everySecond"),
    exactListVariable("newest_first", "newestFirst"),
    // The source list must still be what it was: reverse() / sort() on it would change it.
    exactListVariable("samples", "originalSamples"),
  ),
  runtime: pyodideStdlib,
  hintSetId: H.PF08,
  starterCode: PF08_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF09: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf09,
  version: 1,
  conceptIds: [C.dicts, C.tuplesSets],
  allowedStages: [LearningStage.GUIDED],
  generator: { id: G.PF09 },
  grader: grader(
    dictVariable("label_counts", "labelCounts"),
    // A set is not observable as a value, so its type is checked here and its content
    // through the sorted list derived from it.
    [exists("unique_labels"), typeIs("unique_labels", "set")],
    exactListVariable("unique_sorted", "uniqueSorted"),
    tupleVariable("top_label", "topLabel"),
    dictVariable("class_index", "classIndex"),
    tupleVariable("image_size", "imageSize"),
    tupleVariable("swapped_size", "swappedSize"),
  ),
  runtime: pyodideStdlib,
  hintSetId: H.PF09,
  starterCode: PF09_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF10: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf10,
  version: 1,
  conceptIds: [C.comprehensions, C.loops, C.dicts],
  allowedStages: [LearningStage.INDEPENDENT],
  generator: { id: G.PF10 },
  grader: grader(
    approxListVariable("valid_scaled", "validScaled"),
    exactListVariable("bright_indices", "brightIndices"),
    dictVariable("word_lengths", "wordLengths"),
    dictVariable("passed_scores", "passedScores"),
  ),
  runtime: pyodideStdlib,
  hintSetId: H.PF10,
  starterCode: PF10_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF11: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf11,
  version: 1,
  conceptIds: [C.reusableFunctions, C.loops],
  allowedStages: [LearningStage.INDEPENDENT],
  generator: { id: G.PF11 },
  grader: grader(
    functionVariable("moving_average"),
    functionVariable("clip_values"),
    [functionCases("moving_average", "movingAverageCases")],
    [functionCases("clip_values", "clipCases")],
  ),
  runtime: pyodideStdlib,
  hintSetId: H.PF11,
  starterCode: PF11_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF12: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf12,
  version: 1,
  conceptIds: [C.exceptions, C.inputValidation, C.typeConversion],
  allowedStages: [LearningStage.INDEPENDENT],
  generator: { id: G.PF12 },
  grader: grader(
    functionVariable("parse_measurements"),
    dictVariable("result", "demoResult"),
    [functionCases("parse_measurements", "cases")],
  ),
  runtime: pyodideStdlib,
  hintSetId: H.PF12,
  starterCode: PF12_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF13: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf13,
  version: 1,
  conceptIds: [C.jsonRecords, C.dicts, C.inputValidation, C.comprehensions, C.reusableFunctions],
  allowedStages: [LearningStage.REVIEW],
  generator: { id: G.PF13 },
  grader: grader(
    functionVariable("summarize_records"),
    [exists("summary"), typeIs("summary", "dict")],
    [functionCases("summarize_records", "cases")],
  ),
  runtime: pyodideStdlib,
  hintSetId: H.PF13,
  starterCode: PF13_STARTER,
});


export const PYTHON_FOUNDATIONS_TEMPLATE_PF14: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf14,
  version: 1,
  conceptIds: [C.numpyArrays, C.numpyIndexing],
  allowedStages: [LearningStage.GUIDED],
  generator: { id: G.PF14 },
  grader: grader(
    ndarrayVariable("arr", "arrShape", "expectedArr"),
    // dtype=np.float64 is part of the task, so these two are the same in every variant.
    [exists("n_dims"), typeIs("n_dims", "int"), exactLiteral("n_dims", 2)],
    tupleVariable("shape_of_arr", "arrShape"),
    intVariable("element_count", "elementCount"),
    [exists("dtype_name"), typeIs("dtype_name", "str"), exactLiteral("dtype_name", "float64")],
    ndarrayVariable("last_row", null, "lastRow"),
    ndarrayVariable("second_column", null, "secondColumn"),
    [exists("picked"), approx("picked", "picked")],
    functionVariable("describe_array"),
    [functionCases("describe_array", "cases")],
  ),
  runtime: pyodideNumpy,
  hintSetId: H.PF14,
  starterCode: PF14_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF15: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf15,
  version: 1,
  conceptIds: [C.numpyVectorization, C.numpyMasksAxis, C.numpyIndexing, C.reusableFunctions],
  allowedStages: [LearningStage.TRANSFER],
  generator: { id: G.PF15 },
  grader: grader(
    ndarrayVariable("data", "gridShape", "gridValues"),
    functionVariable("valid_mask"),
    functionVariable("scale_valid"),
    functionVariable("sensor_means"),
    [functionCases("valid_mask", "maskCases")],
    [functionCases("scale_valid", "scaleCases")],
    [functionCases("sensor_means", "meanCases")],
    intVariable("valid_total", "validTotal"),
    intVariable("best_sensor", "bestSensor"),
  ),
  runtime: pyodideNumpy,
  hintSetId: H.PF15,
  starterCode: PF15_STARTER,
});

// ---------------------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------------------

export const PYTHON_FOUNDATIONS_ACTIVITY_PF08: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf08,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-08 — Chỉ số và cắt lát",
  description:
    "Lấy phần tử và đoạn con từ một list số đo có thứ tự bằng chỉ số dương, chỉ số âm và cắt lát có bước nhảy.",
  conceptIds: [C.indexing, C.slicing],
  stage: LearningStage.GUIDED,
  missionTemplateId: ID.templatePf08,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF09: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf09,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-09 — Dictionary, tuple và set",
  description:
    "Đếm nhãn bằng dictionary, loại trùng bằng set, ghép cặp bằng tuple và đánh chỉ số lớp cho một bộ ảnh.",
  conceptIds: [C.dicts, C.tuplesSets],
  stage: LearningStage.GUIDED,
  missionTemplateId: ID.templatePf09,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF10: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf10,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-10 — List và dict comprehension",
  description:
    "Viết gọn các phép lọc và biến đổi bằng comprehension: chuẩn hóa pixel hợp lệ, tìm chỉ số pixel sáng, dựng và lọc dictionary.",
  conceptIds: [C.comprehensions, C.loops, C.dicts],
  stage: LearningStage.INDEPENDENT,
  missionTemplateId: ID.templatePf10,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF11: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf11,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-11 — Hàm dùng lại, chấm nhiều trường hợp",
  description:
    "Viết moving_average và clip_values từ một khung hàm trống. Khi nộp bài, hàm được gọi với nhiều đầu vào, trường hợp biên và đầu vào sai.",
  conceptIds: [C.reusableFunctions, C.loops],
  stage: LearningStage.INDEPENDENT,
  missionTemplateId: ID.templatePf11,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF12: LearningActivity = DebugMissionActivitySchema.parse({
  id: ID.activityPf12,
  type: LearningActivityType.DEBUG_MISSION,
  title: "PF-12 — Sửa lỗi xử lý dữ liệu nhập",
  description:
    "Một hàm đọc dữ liệu nhập từ form chạy sai và gãy trên dữ liệu thật. Sửa kiểu chuyển đổi, bắt đúng ngoại lệ, kiểm tra đoạn hợp lệ và đầu vào sai.",
  conceptIds: [C.exceptions, C.inputValidation, C.typeConversion],
  stage: LearningStage.INDEPENDENT,
  missionTemplateId: ID.templatePf12,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF13: LearningActivity = BossMissionActivitySchema.parse({
  id: ID.activityPf13,
  type: LearningActivityType.BOSS_MISSION,
  title: "PF-13 — Mini-project: tóm tắt bản ghi JSON",
  description:
    "Đọc một chuỗi JSON các bản ghi ảnh, loại bản ghi lỗi và trùng, chuẩn hóa nhãn và trả về một bản tóm tắt sạch cùng bảng số sẵn sàng cho bước ML sau.",
  conceptIds: [C.jsonRecords, C.dicts, C.inputValidation, C.comprehensions, C.reusableFunctions],
  stage: LearningStage.REVIEW,
  missionTemplateId: ID.templatePf13,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF14: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf14,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-14 — NumPy: ndarray, shape và dtype",
  description:
    "Tạo ndarray từ dữ liệu Python, đọc số chiều, shape, dtype, lấy hàng, cột và phần tử bằng chỉ số, rồi viết hàm mô tả mảng bất kỳ.",
  conceptIds: [C.numpyArrays, C.numpyIndexing],
  stage: LearningStage.GUIDED,
  missionTemplateId: ID.templatePf14,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF15: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf15,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-15 — NumPy: vector hóa, mặt nạ và axis",
  description:
    "Làm sạch và tóm tắt lưới số đo cảm biến bằng mặt nạ Boolean, np.where và phép toán theo axis; ghép ba hàm để tìm cảm biến tốt nhất.",
  conceptIds: [C.numpyVectorization, C.numpyMasksAxis, C.numpyIndexing, C.reusableFunctions],
  stage: LearningStage.TRANSFER,
  missionTemplateId: ID.templatePf15,
});

export const PYTHON_FOUNDATIONS_M9_CONTENT = {
  worlds: [PYTHON_FOUNDATIONS_WORLD_COLLECTIONS, PYTHON_FOUNDATIONS_WORLD_NUMPY],
  lessons: [
    PYTHON_FOUNDATIONS_LESSON_SEQUENCES_RECORDS,
    PYTHON_FOUNDATIONS_LESSON_FUNCTIONS_PROJECTS,
    PYTHON_FOUNDATIONS_LESSON_NUMPY_ARRAYS,
  ],
  activities: [
    PYTHON_FOUNDATIONS_ACTIVITY_PF08,
    PYTHON_FOUNDATIONS_ACTIVITY_PF09,
    PYTHON_FOUNDATIONS_ACTIVITY_PF10,
    PYTHON_FOUNDATIONS_ACTIVITY_PF11,
    PYTHON_FOUNDATIONS_ACTIVITY_PF12,
    PYTHON_FOUNDATIONS_ACTIVITY_PF13,
    PYTHON_FOUNDATIONS_ACTIVITY_PF14,
    PYTHON_FOUNDATIONS_ACTIVITY_PF15,
  ],
  missionTemplates: [
    PYTHON_FOUNDATIONS_TEMPLATE_PF08,
    PYTHON_FOUNDATIONS_TEMPLATE_PF09,
    PYTHON_FOUNDATIONS_TEMPLATE_PF10,
    PYTHON_FOUNDATIONS_TEMPLATE_PF11,
    PYTHON_FOUNDATIONS_TEMPLATE_PF12,
    PYTHON_FOUNDATIONS_TEMPLATE_PF13,
    PYTHON_FOUNDATIONS_TEMPLATE_PF14,
    PYTHON_FOUNDATIONS_TEMPLATE_PF15,
  ],
} as const;

// `DeclarativeGraderCheckType` is re-exported for tests that build custom checks next to these templates.
export { DeclarativeGraderCheckType };
