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
import { PYTHON_FOUNDATIONS_CONCEPT_IDS as C } from "./concepts";
import {
  exactListVariable,
  functionCases,
  functionVariable,
  grader,
  intVariable,
  pyodideNumpy,
  strVariable,
  tupleVariable,
} from "./content-helpers";
import {
  pyodideMatplotlib,
  pyodideMatplotlibWithData,
  pyodidePandas,
  pyodidePandasWithData,
  typedValue,
} from "./content-helpers-m10";
import { HOUSING_DATASETS, ORDERS_DATASETS } from "./datasets-m10";
import { PYTHON_FOUNDATIONS_M10_GENERATOR_ID as G } from "./generators-m10";
import { PYTHON_FOUNDATIONS_M10_HINT_SET_ID as H } from "./hints-m10";
import { PYTHON_FOUNDATIONS_IDS as ID } from "./ids";

/**
 * M10 (PHASE-08): the "Data Science Toolkit" slice of the native Python course. Four more
 * worlds, five lessons and eleven missions (M10-01..M10-11 = PF-16..PF-26) in the SAME
 * course. They reuse the existing archetypes - generated MissionInstance, declarative grader,
 * H1-H4 hints, Run / Submit - and the M9 FUNCTION_CASES check. The new `TYPED_VALUE` check
 * grades a variable holding an ndarray, DataFrame, Series or Axes with the typed comparison.
 *
 * Independence ramps up on purpose (see each starter): PF-16/PF-19 are scaffolded with one
 * worked line, PF-17 is a guided set of named variables, PF-18/PF-20/PF-21/PF-22/PF-23 give
 * only function stubs and a contract, PF-24 is a debugging task on runnable-but-wrong code,
 * PF-25 asks the learner to read the files and write the cleaning rules, and PF-26 is a
 * substantial project with nothing but the contract.
 */

export const PYTHON_FOUNDATIONS_WORLD_NUMPY_ADVANCED: World = WorldSchema.parse({
  id: ID.worldNumpyAdvanced,
  title: "NumPy Advanced",
  description:
    "Ba nhiệm vụ NumPy thật chạy trong trình duyệt: broadcasting và shape, phép gộp theo axis với keepdims, rồi tiền xử lý ma trận đặc trưng bằng vector hóa.",
  lessonIds: [ID.lessonNumpyShapesAxes],
});

export const PYTHON_FOUNDATIONS_WORLD_PANDAS: World = WorldSchema.parse({
  id: ID.worldPandas,
  title: "pandas",
  description:
    "Bốn nhiệm vụ pandas thật: DataFrame và loc / iloc, lọc và biến đổi không sửa bảng gốc, giá trị thiếu và chuyển đổi kiểu, groupby với thứ tự xác định.",
  lessonIds: [ID.lessonPandasFrames, ID.lessonPandasCleaning],
});

export const PYTHON_FOUNDATIONS_WORLD_VISUALIZATION: World = WorldSchema.parse({
  id: ID.worldVisualization,
  title: "Matplotlib",
  description:
    "Hai nhiệm vụ Matplotlib thật: dựng biểu đồ có ý nghĩa và sửa biểu đồ gây hiểu lầm. Biểu đồ bạn vẽ hiện ra ngay trong trình duyệt.",
  lessonIds: [ID.lessonMatplotlibCharts],
});

export const PYTHON_FOUNDATIONS_WORLD_WORKFLOWS: World = WorldSchema.parse({
  id: ID.worldWorkflows,
  title: "Data Workflows",
  description:
    "Hai nhiệm vụ quy trình dữ liệu: từ file CSV đến bảng sạch có ghép bảng, và một mini-project chuẩn bị dữ liệu từ đầu đến cuối.",
  lessonIds: [ID.lessonDataWorkflows],
});

export const PYTHON_FOUNDATIONS_LESSON_NUMPY_SHAPES_AXES: Lesson = LessonSchema.parse({
  id: ID.lessonNumpyShapesAxes,
  title: "Bài 6 — NumPy: Shapes, Axes & Preprocessing",
  description:
    "Broadcasting và shape; phép gộp theo axis với keepdims; tiền xử lý một ma trận đặc trưng bằng chỉ số, mặt nạ, reshape và broadcasting.",
  conceptIds: [C.numpyBroadcasting, C.numpyReductions, C.numpyPreprocessing],
  activityIds: [ID.activityPf16, ID.activityPf17, ID.activityPf18],
});

export const PYTHON_FOUNDATIONS_LESSON_PANDAS_FRAMES: Lesson = LessonSchema.parse({
  id: ID.lessonPandasFrames,
  title: "Bài 7 — pandas: DataFrame & Filtering",
  description:
    "Dựng DataFrame, đọc cột và dtype, chọn dữ liệu bằng loc và iloc; lọc hàng bằng nhiều điều kiện và thêm cột tính toán mà không sửa bảng gốc.",
  conceptIds: [C.pandasFrames, C.pandasFiltering],
  activityIds: [ID.activityPf19, ID.activityPf20],
});

export const PYTHON_FOUNDATIONS_LESSON_PANDAS_CLEANING: Lesson = LessonSchema.parse({
  id: ID.lessonPandasCleaning,
  title: "Bài 8 — pandas: Cleaning & Aggregation",
  description:
    "Phát hiện giá trị thiếu, chuyển đổi kiểu và làm sạch bản ghi; groupby và tổng hợp theo nhóm với thứ tự xác định.",
  conceptIds: [C.pandasMissing, C.pandasGroupby],
  activityIds: [ID.activityPf21, ID.activityPf22],
});

export const PYTHON_FOUNDATIONS_LESSON_MATPLOTLIB_CHARTS: Lesson = LessonSchema.parse({
  id: ID.lessonMatplotlibCharts,
  title: "Bài 9 — Matplotlib: Charts",
  description:
    "Dựng biểu đồ đường và biểu đồ cột có tiêu đề, nhãn trục và chú giải; tìm và sửa các lỗi tổng hợp, trục và nhãn làm biểu đồ gây hiểu lầm.",
  conceptIds: [C.matplotlibCharts, C.chartDebugging],
  activityIds: [ID.activityPf23, ID.activityPf24],
});

export const PYTHON_FOUNDATIONS_LESSON_DATA_WORKFLOWS: Lesson = LessonSchema.parse({
  id: ID.lessonDataWorkflows,
  title: "Bài 10 — Data Workflows",
  description:
    "Đọc CSV từ workspace, kiểm tra cột, làm sạch và ghép bảng; rồi tự dựng một pipeline chuẩn bị dữ liệu hoàn chỉnh với ma trận đặc trưng, thống kê và biểu đồ chẩn đoán.",
  conceptIds: [C.csvLoading, C.dataPipeline],
  activityIds: [ID.activityPf25, ID.activityPf26],
});

// ---------------------------------------------------------------------------------------
// Starter code. Every placeholder is a runnable `None` (never a syntax error), so Run works
// on the untouched starter and the grader reports precisely what is still missing.
// ---------------------------------------------------------------------------------------

const PF16_STARTER = `import numpy as np

# xs và ys là hai list số nguyên đã được nạp sẵn (xem tab Dữ liệu).
x = np.array(xs, dtype=np.float64)   # vector, shape (n,)  - ví dụ đã làm sẵn
y = np.array(ys, dtype=np.float64)   # vector, shape (m,)

# Nhắc nhanh về shape:
#   - a.shape cho tuple shape của mảng a; (n,) là vector, (n, 1) là một CỘT, (1, m) là một HÀNG.
#   - a[:, np.newaxis] thêm một chiều ở cuối; a[np.newaxis, :] thêm một chiều ở đầu.
#   - Khi cộng hay nhân hai mảng, NumPy so sánh shape từ PHẢI sang TRÁI. Hai chiều tương thích
#     khi bằng nhau hoặc một trong hai bằng 1 (chiều bằng 1 được "kéo giãn" cho khớp chiều kia).

x_col = None         # TODO: x đặt thành một cột, shape (n, 1)
y_row = None         # TODO: y đặt thành một hàng, shape (1, m)
grid_sum = None      # TODO: bảng tổng, shape (n, m)
grid_product = None  # TODO: bảng tích, shape (n, m)


def broadcast_shape(shape_a, shape_b):
    """Trả về shape (tuple) khi NumPy broadcast hai shape, hoặc báo ValueError nếu không tương thích."""
    # TODO
    return None


print(x.shape, y.shape)
print(grid_sum)
`;

const PF17_STARTER = `import numpy as np

# scores (list lồng nhau) và pass_mark đã được nạp sẵn.
arr = np.array(scores, dtype=np.float64)   # mỗi hàng là một học sinh, mỗi cột là một bài kiểm tra

# axis=0 gộp các HÀNG lại (cho một kết quả mỗi CỘT); axis=1 gộp các CỘT lại (một kết quả mỗi HÀNG).
# keepdims=True giữ chiều vừa gộp lại với độ dài 1, để kết quả còn "ghép" được với arr khi broadcast.

col_means = None           # TODO: điểm trung bình của từng bài kiểm tra
row_totals = None          # TODO: tổng điểm của từng học sinh, shape (số_hàng, 1)
centered = None            # TODO: arr trừ điểm trung bình của từng cột
row_share = None           # TODO: điểm mỗi bài chia cho tổng điểm của học sinh đó
passed = None              # TODO: mảng Boolean, True khi điểm >= pass_mark
passed_per_student = None  # TODO: số bài đạt của từng học sinh


def masked_column_means(data, threshold):
    """Với mỗi cột: trung bình của các giá trị >= threshold (0.0 nếu cột không có giá trị nào)."""
    # TODO
    return None


def row_shares(data):
    """Mỗi phần tử chia cho tổng của hàng chứa nó. Không sửa data."""
    # TODO
    return None


print(col_means)
print(row_totals)
`;

const PF18_STARTER = `import numpy as np

# raw (list lồng nhau), use_cols (list chỉ số cột) và batch_size đã được nạp sẵn.
# Giá trị -1 trong raw đánh dấu một ô bị thiếu.
data = np.array(raw, dtype=np.float64)


def drop_invalid_rows(data):
    """Giữ các hàng mà MỌI giá trị đều >= 0."""
    # TODO
    return None


def standardize(data):
    """Chuẩn hóa từng CỘT: (giá trị - trung bình) / độ lệch chuẩn. Cột hằng số thành toàn 0.0."""
    # TODO
    return None


def to_batches(data, size):
    """Chia các hàng thành lô liên tiếp có size hàng; bỏ phần dư. Shape (số_lô, size, số_cột)."""
    # TODO
    return None


def prepare(data, cols, size):
    """Chọn cột trong cols, loại hàng lỗi, chuẩn hóa rồi chia lô."""
    # TODO
    return None


prepared = None   # TODO: prepare(data, use_cols, batch_size)
rows_kept = None  # TODO: số hàng còn lại sau khi chọn cột và loại hàng lỗi (số nguyên Python)

print(prepared)
`;

const PF19_STARTER = `import pandas as pd

# people (dict các cột), target_id và row_pos đã được nạp sẵn.
df = pd.DataFrame(people)   # ví dụ đã làm sẵn

shape_of_df = None      # TODO: shape của df (tuple)
column_names = None     # TODO: list tên cột
score_dtype = None      # TODO: tên dtype của cột score, dạng chuỗi
names = None            # TODO: cột name (một Series)
subset = None           # TODO: DataFrame chỉ gồm hai cột name và score
first_two = None        # TODO: hai hàng đầu theo VỊ TRÍ
by_id = None            # TODO: df với cột id làm chỉ số hàng
name_of_target = None   # TODO: name của người có id == target_id, tra theo NHÃN trong by_id
cell = None             # TODO: giá trị cột age ở hàng có VỊ TRÍ row_pos của df


def describe_frame(frame):
    """Trả về {"rows": số_hàng, "columns": list_tên_cột, "dtypes": {tên_cột: tên_dtype_dạng_chuỗi}}."""
    # TODO
    return None


print(df)
print(df.dtypes)
`;

const PF20_STARTER = `import pandas as pd

# orders (dict các cột), min_total và target_regions đã được nạp sẵn.
df = pd.DataFrame(orders)


def add_total(frame):
    """Trả về DataFrame MỚI = frame + cột total (qty * unit_price). Không sửa frame."""
    # TODO
    return None


def select_orders(frame, min_total, regions):
    """Các hàng có total >= min_total VÀ region nằm trong regions.

    Kết quả có cột total, giữ thứ tự hàng và giữ nguyên chỉ số hàng ban đầu.
    """
    # TODO
    return None


with_total = None  # TODO: add_total(df)
selected = None    # TODO: select_orders(df, min_total, target_regions)

print(df)
`;

const PF21_STARTER = `import pandas as pd

# raw (dict các cột) đã được nạp sẵn. Các cột: id, city, age, income.
raw_df = pd.DataFrame(raw)


def count_missing(frame):
    """{tên_cột: số ô thiếu (None / NaN)} cho mọi cột của frame."""
    # TODO
    return None


def clean_records(frame):
    """Trả về DataFrame mới theo năm quy tắc trong đề. Không sửa frame."""
    # TODO
    return None


missing_counts = None  # TODO: count_missing(raw_df)
cleaned = None         # TODO: clean_records(raw_df)

print(raw_df)
print(raw_df.dtypes)
`;

const PF22_STARTER = `import pandas as pd

# sales (dict các cột) đã được nạp sẵn. Doanh thu của một dòng = units * price.
sales_df = pd.DataFrame(sales)


def category_report(frame):
    """DataFrame chỉ số là category; cột orders, units, revenue, avg_revenue; sắp xếp xác định."""
    # TODO
    return None


def top_category(frame):
    """Tên nhóm đứng đầu của bảng category_report(frame) (một chuỗi)."""
    # TODO
    return None


def share_by_store(frame):
    """Series tên "share": tỉ lệ doanh thu của từng cửa hàng, xếp theo tên cửa hàng tăng dần."""
    # TODO
    return None


report = None  # TODO: category_report(sales_df)
best = None    # TODO: top_category(sales_df)
shares = None  # TODO: share_by_store(sales_df)

print(sales_df)
`;

const PF23_STARTER = `import matplotlib.pyplot as plt

# months, revenue, cost, categories, values và các chuỗi chữ (trend_title, x_label, y_label,
# rank_title, rank_ylabel) đã được nạp sẵn. Biểu đồ bạn vẽ sẽ hiện ra sau khi chạy.
#
# Nhắc cú pháp bằng một ví dụ KHÁC (không phải đáp án):
#   fig, ax = plt.subplots()
#   ax.plot(days, temps, label="Nhiệt độ")   # một đường; label dùng cho chú giải
#   ax.set_title("Nhiệt độ trong tuần"); ax.set_xlabel("Ngày"); ax.set_ylabel("Độ C")
#   ax.legend()
#   return ax


def plot_trend(months, revenue, cost, title, xlabel, ylabel):
    """Biểu đồ đường: doanh thu (nhãn "Doanh thu") rồi chi phí (nhãn "Chi phí"). Trả về Axes."""
    # TODO
    return None


def plot_ranking(categories, values, title, ylabel):
    """Biểu đồ cột, các mục xếp theo giá trị giảm dần (hòa thì theo tên tăng dần). Trả về Axes."""
    # TODO
    return None


ax_trend = None  # TODO
ax_rank = None   # TODO
`;

const PF24_STARTER = `import matplotlib.pyplot as plt
import pandas as pd

# finance (dict các cột), profit_title, x_label, y_label, region_title đã được nạp sẵn.
# TODO: hai biểu đồ dưới đây chạy được nhưng gây hiểu nhầm. Bấm Run, nhìn kỹ, rồi sửa từng lỗi.
df = pd.DataFrame(finance)


def plot_monthly_profit(df, title, xlabel, ylabel):
    # MỤC TIÊU: một đường lợi nhuận theo tháng (tháng tăng dần), nhãn "Lợi nhuận", có chú giải.
    totals = df.groupby("month")[["revenue", "cost"]].mean()
    profit = totals["revenue"] + totals["cost"]
    fig, ax = plt.subplots()
    ax.plot(profit.values, totals.index, label="Doanh thu")
    ax.set_title(title)
    ax.set_xlabel(ylabel)
    ax.set_ylabel(xlabel)
    return ax


def plot_region_revenue(df, title):
    # MỤC TIÊU: mỗi vùng một cột (vùng xếp tên tăng dần), chiều cao = tổng doanh thu của vùng.
    fig, ax = plt.subplots()
    ax.bar(df["region"], df["revenue"])
    ax.set_title(title)
    ax.set_ylabel("Chi phí")
    return ax


ax_profit = plot_monthly_profit(df, profit_title, x_label, y_label)
ax_region = plot_region_revenue(df, region_title)
`;

const PF25_STARTER = `import pandas as pd

# customers_file và orders_file là tên hai file CSV trong thư mục data/ (xem tab Dữ liệu).
# Đường dẫn đọc file luôn là "data/" + tên_file.

CUSTOMER_REQUIRED = ["customer_id", "name", "city"]
ORDER_REQUIRED = ["order_id", "customer_id", "amount", "status"]

customers = None  # TODO: đọc file khách hàng
orders = None     # TODO: đọc file đơn hàng


def check_columns(frame, required):
    """Báo ValueError (nêu tên cột thiếu) nếu frame thiếu cột nào trong required; không thì trả None."""
    # TODO


def build_dataset(customers, orders):
    """Làm sạch hai bảng, chỉ giữ đơn đã thanh toán, ghép theo customer_id (xem đề). Không sửa đầu vào."""
    # TODO
    return None


dataset = None  # TODO
orphans = None  # TODO: số đơn đã thanh toán (có amount) của khách không có trong bảng khách
`;

const PF26_STARTER = `import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

# housing_file và reference_year đã được nạp sẵn. Hợp đồng của prepare(df) và plot_diagnostic(clean)
# nằm trong đề bài (tab Nhiệm vụ). Hãy tự chia nhỏ thành các hàm phụ và kiểm tra từng bước.


def prepare(df):
    # TODO
    return None


def plot_diagnostic(clean):
    # TODO
    return None


raw = None     # TODO: đọc file CSV bằng pandas
result = None  # TODO
ax = None      # TODO
`;

export const PYTHON_FOUNDATIONS_M10_STARTER_CODE = {
  pf16: PF16_STARTER,
  pf17: PF17_STARTER,
  pf18: PF18_STARTER,
  pf19: PF19_STARTER,
  pf20: PF20_STARTER,
  pf21: PF21_STARTER,
  pf22: PF22_STARTER,
  pf23: PF23_STARTER,
  pf24: PF24_STARTER,
  pf25: PF25_STARTER,
  pf26: PF26_STARTER,
} as const;

// ---------------------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------------------

export const PYTHON_FOUNDATIONS_TEMPLATE_PF16: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf16,
  version: 1,
  conceptIds: [C.numpyBroadcasting, C.numpyArrays],
  allowedStages: [LearningStage.GUIDED],
  generator: { id: G.PF16 },
  grader: grader(
    [typedValue("x", "x"), typedValue("y", "y")],
    [typedValue("x_col", "xCol")],
    [typedValue("y_row", "yRow")],
    [typedValue("grid_sum", "gridSum")],
    [typedValue("grid_product", "gridProduct")],
    functionVariable("broadcast_shape"),
    [functionCases("broadcast_shape", "cases")],
  ),
  runtime: pyodideNumpy,
  hintSetId: H.PF16,
  starterCode: PF16_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF17: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf17,
  version: 1,
  conceptIds: [C.numpyReductions, C.numpyMasksAxis, C.numpyBroadcasting],
  allowedStages: [LearningStage.GUIDED],
  generator: { id: G.PF17 },
  grader: grader(
    [typedValue("arr", "arrValues")],
    [typedValue("col_means", "colMeans")],
    [typedValue("row_totals", "rowTotals")],
    [typedValue("centered", "centered")],
    [typedValue("row_share", "rowShare")],
    [typedValue("passed", "passed")],
    [typedValue("passed_per_student", "passedPerStudent")],
    functionVariable("masked_column_means"),
    functionVariable("row_shares"),
    [functionCases("masked_column_means", "maskedCases")],
    [functionCases("row_shares", "shareCases")],
  ),
  runtime: pyodideNumpy,
  hintSetId: H.PF17,
  starterCode: PF17_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF18: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf18,
  version: 1,
  conceptIds: [C.numpyPreprocessing, C.numpyReductions, C.numpyIndexing],
  allowedStages: [LearningStage.INDEPENDENT],
  generator: { id: G.PF18 },
  grader: grader(
    [typedValue("data", "dataValues")],
    functionVariable("drop_invalid_rows"),
    functionVariable("standardize"),
    functionVariable("to_batches"),
    functionVariable("prepare"),
    [functionCases("drop_invalid_rows", "dropCases")],
    [functionCases("standardize", "stdCases")],
    [functionCases("to_batches", "batchCases")],
    [functionCases("prepare", "prepareCases")],
    [typedValue("prepared", "prepared")],
    intVariable("rows_kept", "rowsKept"),
  ),
  runtime: pyodideNumpy,
  hintSetId: H.PF18,
  starterCode: PF18_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF19: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf19,
  version: 1,
  conceptIds: [C.pandasFrames],
  allowedStages: [LearningStage.GUIDED],
  generator: { id: G.PF19 },
  grader: grader(
    [typedValue("df", "df")],
    tupleVariable("shape_of_df", "shapeOfDf"),
    exactListVariable("column_names", "columnNames"),
    strVariable("score_dtype", "scoreDtype"),
    [typedValue("names", "names")],
    [typedValue("subset", "subset")],
    [typedValue("first_two", "firstTwo")],
    [typedValue("by_id", "byId")],
    strVariable("name_of_target", "nameOfTarget"),
    [typedValue("cell", "cell")],
    functionVariable("describe_frame"),
    [functionCases("describe_frame", "cases")],
  ),
  runtime: pyodidePandas,
  hintSetId: H.PF19,
  starterCode: PF19_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF20: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf20,
  version: 1,
  conceptIds: [C.pandasFiltering, C.pandasFrames, C.booleans],
  allowedStages: [LearningStage.INDEPENDENT],
  generator: { id: G.PF20 },
  grader: grader(
    // df first: a function that adds the column to ITS ARGUMENT leaves `total` in `df`.
    [typedValue("df", "df")],
    functionVariable("add_total"),
    functionVariable("select_orders"),
    [functionCases("add_total", "addTotalCases")],
    [functionCases("select_orders", "selectCases")],
    [typedValue("with_total", "withTotal")],
    [typedValue("selected", "selected")],
  ),
  runtime: pyodidePandas,
  hintSetId: H.PF20,
  starterCode: PF20_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF21: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf21,
  version: 1,
  conceptIds: [C.pandasMissing, C.typeConversion, C.inputValidation],
  allowedStages: [LearningStage.INDEPENDENT],
  generator: { id: G.PF21 },
  grader: grader(
    [typedValue("raw_df", "rawDf")],
    functionVariable("count_missing"),
    functionVariable("clean_records"),
    [functionCases("count_missing", "countCases")],
    [functionCases("clean_records", "cleanCases")],
    [typedValue("missing_counts", "missingCounts")],
    [typedValue("cleaned", "cleaned")],
  ),
  runtime: pyodidePandas,
  hintSetId: H.PF21,
  starterCode: PF21_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF22: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf22,
  version: 1,
  conceptIds: [C.pandasGroupby, C.aggregation],
  allowedStages: [LearningStage.INDEPENDENT],
  generator: { id: G.PF22 },
  grader: grader(
    [typedValue("sales_df", "salesDf")],
    functionVariable("category_report"),
    functionVariable("top_category"),
    functionVariable("share_by_store"),
    [functionCases("category_report", "reportCases")],
    [functionCases("top_category", "topCases")],
    [functionCases("share_by_store", "shareCases")],
    [typedValue("report", "report")],
    strVariable("best", "best"),
    [typedValue("shares", "shares")],
  ),
  runtime: pyodidePandas,
  hintSetId: H.PF22,
  starterCode: PF22_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF23: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf23,
  version: 1,
  conceptIds: [C.matplotlibCharts],
  allowedStages: [LearningStage.INDEPENDENT],
  generator: { id: G.PF23 },
  grader: grader(
    functionVariable("plot_trend"),
    functionVariable("plot_ranking"),
    [functionCases("plot_trend", "trendCases")],
    [functionCases("plot_ranking", "rankCases")],
    [typedValue("ax_trend", "axTrend")],
    [typedValue("ax_rank", "axRank")],
  ),
  runtime: pyodideMatplotlib,
  hintSetId: H.PF23,
  starterCode: PF23_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF24: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf24,
  version: 1,
  conceptIds: [C.chartDebugging, C.matplotlibCharts, C.pandasGroupby],
  allowedStages: [LearningStage.INDEPENDENT],
  generator: { id: G.PF24 },
  grader: grader(
    functionVariable("plot_monthly_profit"),
    functionVariable("plot_region_revenue"),
    [functionCases("plot_monthly_profit", "profitCases")],
    [functionCases("plot_region_revenue", "regionCases")],
    [typedValue("ax_profit", "axProfit")],
    [typedValue("ax_region", "axRegion")],
  ),
  runtime: pyodideMatplotlib,
  hintSetId: H.PF24,
  starterCode: PF24_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF25: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf25,
  version: 1,
  conceptIds: [C.csvLoading, C.pandasMissing, C.pandasFiltering],
  allowedStages: [LearningStage.TRANSFER],
  generator: { id: G.PF25 },
  grader: grader(
    functionVariable("check_columns"),
    functionVariable("build_dataset"),
    [functionCases("check_columns", "checkCases")],
    [functionCases("build_dataset", "buildCases")],
    [typedValue("dataset", "dataset")],
    [typedValue("orphans", "orphans")],
  ),
  runtime: pyodidePandasWithData(ORDERS_DATASETS),
  hintSetId: H.PF25,
  starterCode: PF25_STARTER,
});

export const PYTHON_FOUNDATIONS_TEMPLATE_PF26: MissionTemplate = MissionTemplateSchema.parse({
  id: ID.templatePf26,
  version: 1,
  conceptIds: [C.dataPipeline, C.csvLoading, C.numpyPreprocessing, C.matplotlibCharts, C.pandasGroupby],
  allowedStages: [LearningStage.REVIEW],
  generator: { id: G.PF26 },
  grader: grader(
    functionVariable("prepare"),
    functionVariable("plot_diagnostic"),
    [functionCases("prepare", "prepareCases")],
    [functionCases("plot_diagnostic", "diagnosticCases")],
    [typedValue("result", "result")],
    [typedValue("ax", "ax")],
  ),
  runtime: pyodideMatplotlibWithData(HOUSING_DATASETS),
  hintSetId: H.PF26,
  starterCode: PF26_STARTER,
});

// ---------------------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------------------

export const PYTHON_FOUNDATIONS_ACTIVITY_PF16: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf16,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-16 — Broadcasting và shape của mảng",
  description:
    "Phân biệt vector (n,), cột (n, 1) và hàng (1, n); ghép chúng thành bảng bằng broadcasting và tự viết quy tắc tính shape kết quả.",
  conceptIds: [C.numpyBroadcasting, C.numpyArrays],
  stage: LearningStage.GUIDED,
  missionTemplateId: ID.templatePf16,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF17: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf17,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-17 — Phép toán theo axis và keepdims",
  description:
    "Tóm tắt một bảng điểm bằng sum, mean và mặt nạ Boolean theo axis; dùng keepdims để kết quả có đúng shape khi chuẩn hóa theo hàng và theo cột.",
  conceptIds: [C.numpyReductions, C.numpyMasksAxis, C.numpyBroadcasting],
  stage: LearningStage.GUIDED,
  missionTemplateId: ID.templatePf17,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF18: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf18,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-18 — Tiền xử lý ma trận đặc trưng",
  description:
    "Chọn cột, loại hàng lỗi bằng mặt nạ, chuẩn hóa theo cột và chia thành các lô bằng reshape: một pipeline NumPy thuần vector hóa.",
  conceptIds: [C.numpyPreprocessing, C.numpyReductions, C.numpyIndexing],
  stage: LearningStage.INDEPENDENT,
  missionTemplateId: ID.templatePf18,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF19: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf19,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-19 — DataFrame: cột, dtype, loc và iloc",
  description:
    "Dựng DataFrame từ dictionary, đọc shape, cột và dtype, chọn dữ liệu theo tên, theo nhãn (loc) và theo vị trí (iloc).",
  conceptIds: [C.pandasFrames],
  stage: LearningStage.GUIDED,
  missionTemplateId: ID.templatePf19,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF20: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf20,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-20 — Lọc hàng và thêm cột, không đổi bảng gốc",
  description:
    "Kết hợp nhiều điều kiện Boolean, thêm cột tính toán và giữ nguyên chỉ số hàng — mà không làm thay đổi DataFrame mà hàm nhận vào.",
  conceptIds: [C.pandasFiltering, C.pandasFrames, C.booleans],
  stage: LearningStage.INDEPENDENT,
  missionTemplateId: ID.templatePf20,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF21: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf21,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-21 — Giá trị thiếu và chuyển đổi kiểu",
  description:
    "Đếm ô thiếu, đổi chuỗi bẩn thành số, điền hoặc bỏ giá trị thiếu và chuẩn hóa chữ để dựng một bảng sạch có dtype đúng.",
  conceptIds: [C.pandasMissing, C.typeConversion, C.inputValidation],
  stage: LearningStage.INDEPENDENT,
  missionTemplateId: ID.templatePf21,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF22: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf22,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-22 — groupby và tổng hợp có thứ tự",
  description:
    "Tổng hợp doanh thu theo nhóm bằng groupby, đặt tên cột kết quả, và sắp xếp để kết quả luôn có cùng một thứ tự kể cả khi hai nhóm bằng nhau.",
  conceptIds: [C.pandasGroupby, C.aggregation],
  stage: LearningStage.INDEPENDENT,
  missionTemplateId: ID.templatePf22,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF23: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf23,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-23 — Xây biểu đồ có ý nghĩa",
  description:
    "Vẽ biểu đồ đường so sánh hai chuỗi và biểu đồ cột xếp hạng với đúng dữ liệu, tiêu đề, nhãn trục và chú giải. Biểu đồ hiện ra ngay trong trình duyệt.",
  conceptIds: [C.matplotlibCharts],
  stage: LearningStage.INDEPENDENT,
  missionTemplateId: ID.templatePf23,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF24: LearningActivity = DebugMissionActivitySchema.parse({
  id: ID.activityPf24,
  type: LearningActivityType.DEBUG_MISSION,
  title: "PF-24 — Sửa biểu đồ gây hiểu lầm",
  description:
    "Hai biểu đồ chạy được nhưng sai: phép tổng hợp, phép tính, trục, nhãn và chú giải. Tìm từng lỗi và sửa mà không viết lại từ đầu.",
  conceptIds: [C.chartDebugging, C.matplotlibCharts, C.pandasGroupby],
  stage: LearningStage.INDEPENDENT,
  missionTemplateId: ID.templatePf24,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF25: LearningActivity = CodeMissionActivitySchema.parse({
  id: ID.activityPf25,
  type: LearningActivityType.CODE_MISSION,
  title: "PF-25 — Từ CSV đến bảng dữ liệu sạch",
  description:
    "Đọc hai file CSV từ workspace, kiểm tra cột, làm sạch từng bảng và ghép chúng bằng một phép join phù hợp thành một bảng dữ liệu sạch.",
  conceptIds: [C.csvLoading, C.pandasMissing, C.pandasFiltering],
  stage: LearningStage.TRANSFER,
  missionTemplateId: ID.templatePf25,
});

export const PYTHON_FOUNDATIONS_ACTIVITY_PF26: LearningActivity = BossMissionActivitySchema.parse({
  id: ID.activityPf26,
  type: LearningActivityType.BOSS_MISSION,
  title: "PF-26 — Mini-project: chuẩn bị dữ liệu",
  description:
    "Tự dựng một pipeline hoàn chỉnh từ file CSV thô: kiểm tra và làm sạch, tạo đặc trưng số, dựng ma trận chuẩn hóa, tính thống kê tóm tắt và vẽ biểu đồ chẩn đoán.",
  conceptIds: [C.dataPipeline, C.csvLoading, C.numpyPreprocessing, C.matplotlibCharts, C.pandasGroupby],
  stage: LearningStage.REVIEW,
  missionTemplateId: ID.templatePf26,
});

export const PYTHON_FOUNDATIONS_M10_CONTENT = {
  worlds: [
    PYTHON_FOUNDATIONS_WORLD_NUMPY_ADVANCED,
    PYTHON_FOUNDATIONS_WORLD_PANDAS,
    PYTHON_FOUNDATIONS_WORLD_VISUALIZATION,
    PYTHON_FOUNDATIONS_WORLD_WORKFLOWS,
  ],
  lessons: [
    PYTHON_FOUNDATIONS_LESSON_NUMPY_SHAPES_AXES,
    PYTHON_FOUNDATIONS_LESSON_PANDAS_FRAMES,
    PYTHON_FOUNDATIONS_LESSON_PANDAS_CLEANING,
    PYTHON_FOUNDATIONS_LESSON_MATPLOTLIB_CHARTS,
    PYTHON_FOUNDATIONS_LESSON_DATA_WORKFLOWS,
  ],
  activities: [
    PYTHON_FOUNDATIONS_ACTIVITY_PF16,
    PYTHON_FOUNDATIONS_ACTIVITY_PF17,
    PYTHON_FOUNDATIONS_ACTIVITY_PF18,
    PYTHON_FOUNDATIONS_ACTIVITY_PF19,
    PYTHON_FOUNDATIONS_ACTIVITY_PF20,
    PYTHON_FOUNDATIONS_ACTIVITY_PF21,
    PYTHON_FOUNDATIONS_ACTIVITY_PF22,
    PYTHON_FOUNDATIONS_ACTIVITY_PF23,
    PYTHON_FOUNDATIONS_ACTIVITY_PF24,
    PYTHON_FOUNDATIONS_ACTIVITY_PF25,
    PYTHON_FOUNDATIONS_ACTIVITY_PF26,
  ],
  missionTemplates: [
    PYTHON_FOUNDATIONS_TEMPLATE_PF16,
    PYTHON_FOUNDATIONS_TEMPLATE_PF17,
    PYTHON_FOUNDATIONS_TEMPLATE_PF18,
    PYTHON_FOUNDATIONS_TEMPLATE_PF19,
    PYTHON_FOUNDATIONS_TEMPLATE_PF20,
    PYTHON_FOUNDATIONS_TEMPLATE_PF21,
    PYTHON_FOUNDATIONS_TEMPLATE_PF22,
    PYTHON_FOUNDATIONS_TEMPLATE_PF23,
    PYTHON_FOUNDATIONS_TEMPLATE_PF24,
    PYTHON_FOUNDATIONS_TEMPLATE_PF25,
    PYTHON_FOUNDATIONS_TEMPLATE_PF26,
  ],
} as const;
