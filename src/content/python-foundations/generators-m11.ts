import type { MissionGeneratorId } from "../../core/domain";
import type { MissionGenerator } from "../../core/generators";
import type { GeneratorRegistry } from "../../core/generators";
import type { FunctionCase, PyValue } from "../../core/grading";

import {
  ANNOTATION_COLUMNS,
  ANNOTATION_FIXTURES,
  NORMALIZED_COLUMNS,
  PLOT_TITLE,
  PLOT_XLABEL,
  PLOT_YLABEL,
  SUMMARY_COLUMNS,
  classSummary,
  cleanAnnotations,
  normalizeBoxes,
  yoloMatrix,
  type AnnotationRaw,
  type Cell,
  type ClassSummaryRow,
  type CleanBox,
} from "./datasets-m11";
import {
  asJson,
  exampleCase,
  figure,
  frame,
  generatorId,
  hiddenCase,
  nd,
  raises,
  range,
  returns,
  TOLERANCE,
} from "./generators-m10-support";

/**
 * Generator of the M11 capstone PF-27 (PHASE-09): quality check of image annotations.
 *
 * Same contract as the M10 generators: pure functions of the seeded RNG, expected values
 * computed here in TypeScript (the Python reference solution lives in tests/ and is checked
 * against these values on a real Pyodide). The hidden function cases build their own small
 * tables (they never touch the staged CSV files), so a solution that hard-codes the visible
 * file's result, or the visible file's class list, fails them.
 */

export const PYTHON_FOUNDATIONS_M11_GENERATOR_ID = {
  PF27: generatorId("python-foundations.generator.pf27"),
} as const satisfies Record<string, MissionGeneratorId>;

// ---------------------------------------------------------------- typed frames

const RAW_TEXT_DTYPES = {
  image_id: "str",
  width: "str",
  height: "str",
  label: "str",
  xmin: "str",
  ymin: "str",
  xmax: "str",
  ymax: "str",
  split: "str",
} as const;
const RAW_NUMBER_DTYPES = {
  image_id: "str",
  width: "int64",
  height: "int64",
  label: "str",
  xmin: "float64",
  ymin: "float64",
  xmax: "float64",
  ymax: "float64",
  split: "str",
} as const;
const CLEAN_DTYPES = RAW_NUMBER_DTYPES;
const NORMALIZED_DTYPES = {
  image_id: "str",
  label: "str",
  split: "str",
  x1: "float64",
  y1: "float64",
  x2: "float64",
  y2: "float64",
} as const;
const SUMMARY_DTYPES = { boxes: "int64", images: "int64", share: "float64", mean_area: "float64" } as const;

const rawCells = (row: AnnotationRaw): Cell[] => [
  row.imageId,
  row.width,
  row.height,
  row.label,
  row.xmin,
  row.ymin,
  row.xmax,
  row.ymax,
  row.split,
];

/** Every cell is text (a blank cell is `null`) - what `pd.read_csv(..., dtype=str)` would give. */
const rawTextFrame = (rows: readonly AnnotationRaw[]): PyValue =>
  frame(ANNOTATION_COLUMNS, rows.map(rawCells), { dtypes: RAW_TEXT_DTYPES });

/** Numbers are real numbers: the shape of a CSV whose numeric columns were all readable. */
const rawNumberFrame = (rows: readonly AnnotationRaw[]): PyValue =>
  frame(
    ANNOTATION_COLUMNS,
    rows.map((row) => [
      row.imageId,
      Number(row.width),
      Number(row.height),
      row.label,
      Number(row.xmin),
      Number(row.ymin),
      Number(row.xmax),
      Number(row.ymax),
      row.split,
    ]),
    { dtypes: RAW_NUMBER_DTYPES },
  );

const cleanFrame = (boxes: readonly CleanBox[]): PyValue =>
  frame(
    ANNOTATION_COLUMNS,
    boxes.map((box) => [box.imageId, box.width, box.height, box.label, box.xmin, box.ymin, box.xmax, box.ymax, box.split]),
    // An empty result only has to keep the column names; dtypes are checked when there are rows.
    { index: range(0, boxes.length), ...(boxes.length > 0 ? { dtypes: CLEAN_DTYPES } : {}) },
  );

const normalizedFrame = (boxes: readonly CleanBox[]): PyValue =>
  frame(
    NORMALIZED_COLUMNS,
    normalizeBoxes(boxes).map((box) => [box.imageId, box.label, box.split, box.x1, box.y1, box.x2, box.y2]),
    { index: range(0, boxes.length), ...(boxes.length > 0 ? { dtypes: NORMALIZED_DTYPES } : {}) },
  );

const summaryFrame = (rows: readonly ClassSummaryRow[]): PyValue =>
  frame(SUMMARY_COLUMNS, rows.map((row) => [row.boxes, row.images, row.share, row.meanArea]), {
    index: rows.map((row) => row.label),
    indexName: "label",
    ...(rows.length > 0 ? { dtypes: SUMMARY_DTYPES } : {}),
  });

const distributionFigure = (rows: readonly ClassSummaryRow[]): PyValue =>
  figure({
    title: PLOT_TITLE,
    xlabel: PLOT_XLABEL,
    ylabel: PLOT_YLABEL,
    series: [{ kind: "bar", x: rows.map((row) => row.label), y: rows.map((row) => row.boxes) }],
  });

// ---------------------------------------------------------------- hidden tables

const row = (
  imageId: Cell,
  width: Cell,
  height: Cell,
  label: Cell,
  xmin: Cell,
  ymin: Cell,
  xmax: Cell,
  ymax: Cell,
  split: Cell,
): AnnotationRaw => ({ imageId, width, height, label, xmin, ymin, xmax, ymax, split });

const NOISY: readonly AnnotationRaw[] = [
  row(" img_01 ", "640", "480", "Cat", "10", "20", "110", "220", "TRAIN"),
  row("img_01", "640", "480", "dog", "100", "100", "300", "300", "train"),
  row("img_02", "640", "480", "CAT", "10", "20", "110", "220", "val"),
  row("img_01", "640", "480", " cat ", "10", "20", "110", "220", "train"),
  row("img_03", "800", "600", "dog", "0", "0", "800", "600", "dev"),
  row("img_03", "800", "600", "dog", "0", "0", "800", "600", "val"),
  row("img_04", "800", "600", "bird", "10", "10", "50", "50", "train"),
  row("img_05", "800", "600", "cat", "50", "50", "50", "90", "test"),
  row("img_05", "800", "600", "cat", "700", "50", "850", "90", "test"),
  row(null, "800", "600", "cat", "1", "1", "5", "5", "test"),
  row("img_06", "0", "600", "cat", "1", "1", "2", "2", "train"),
  row("img_07", "640", "480", "dog", "n/a", "10", "20", "30", "train"),
  row("img_08", "640", "480", "cat", "5.5", "10", "100.5", "200", "Val"),
  row("img_09", "640", "480", null, "5", "10", "100", "200", "train"),
  row("img_10", "640", "480", "dog", null, "10", "100", "200", "train"),
  row("img_11", "640", "480", "dog", "30", "10", "20", "200", "train"),
];

const NUMERIC: readonly AnnotationRaw[] = [
  row("a1", "100", "50", "x", "0", "0", "100", "50", "train"),
  row("a2", "100", "-50", "x", "0", "0", "10", "5", "train"),
  row("a3", "-100", "50", "x", "0", "0", "10", "5", "train"),
  row("a4", "100", "50", "x", "-0.5", "0", "10", "5", "val"),
  row("a5", "100", "50", "y", "10", "10", "10", "20", "val"),
  row("a6", "100", "50", "y", "10", "20", "60", "10", "test"),
  row("a7", "100", "50", "y", "10", "10", "100.5", "40", "test"),
  row("a8", "100", "50", "y", "10", "10", "60", "40.5", "test"),
  row("a9", "100", "50", "y", "99.5", "49.5", "100", "50", "train"),
  row("a1", "100", "50", "x", "0", "0", "100", "50", "train"),
  row("a9", "100", "50", "Y", "99.5", "49.5", "100", "50", "train"),
];

const OTHER_LABELS: readonly AnnotationRaw[] = [
  row("p1", "300", "200", "Apple", "10", "10", "60", "70", "train"),
  row("p1", "300", "200", "PEAR", "100", "80", "180", "190", "train"),
  row("p2", "300", "200", "kiwi", "10", "10", "60", "70", "train"),
  row("p2", "300", "200", "pear", "20", "20", "80", "90", "val"),
  row("p3", "300", "200", "apple", "0", "0", "300", "200", "test"),
];

const ALL_BAD: readonly AnnotationRaw[] = [
  row("z1", "100", "100", "cat", "10", "10", "5", "50", "train"),
  row("z2", "100", "100", "cat", "10", "10", "50", "50", "unknown"),
  row("z3", "100", "100", "ghost", "10", "10", "50", "50", "train"),
];

const clean = (rows: readonly AnnotationRaw[], allowed: readonly string[]): CleanBox[] => cleanAnnotations(rows, allowed);

const box = (
  imageId: string,
  width: number,
  height: number,
  label: string,
  xmin: number,
  ymin: number,
  xmax: number,
  ymax: number,
  split = "train",
): CleanBox => ({ imageId, width, height, label, xmin, ymin, xmax, ymax, split });

const TWO_SIZES: readonly CleanBox[] = [
  box("s1", 200, 100, "cat", 0, 0, 200, 100),
  box("s2", 400, 300, "dog", 100, 75, 300, 225, "val"),
  box("s3", 400, 300, "cat", 40, 30, 140, 90, "test"),
  box("s1", 200, 100, "dog", 50, 20, 100, 60),
];
const TIES: readonly CleanBox[] = [
  box("t1", 100, 100, "zebra", 0, 0, 50, 50),
  box("t1", 100, 100, "ant", 10, 10, 30, 30),
  box("t2", 100, 100, "zebra", 0, 0, 100, 100),
  box("t2", 100, 100, "ant", 20, 20, 60, 60),
  box("t3", 200, 100, "mole", 0, 0, 100, 50),
  box("t3", 200, 100, "mole", 100, 50, 200, 100),
];
const SINGLE_CLASS: readonly CleanBox[] = [
  box("u1", 640, 480, "car", 10, 10, 330, 250),
  box("u1", 640, 480, "car", 320, 240, 640, 480),
  box("u2", 640, 480, "car", 0, 0, 64, 48),
];
const SHUFFLED: readonly CleanBox[] = [
  box("v1", 100, 80, "bus", 10, 10, 50, 50),
  box("v2", 100, 80, "car", 0, 0, 100, 80),
  box("v1", 100, 80, "car", 20, 20, 40, 40),
  box("v3", 100, 80, "bike", 5, 5, 25, 25),
  box("v3", 100, 80, "car", 50, 40, 90, 70),
  box("v3", 100, 80, "bus", 1, 1, 91, 71),
  box("v2", 100, 80, "bus", 0, 0, 50, 40),
];

const MISSING_COLUMN_FRAME = frame(
  ["image_id", "width", "height", "label", "xmin", "ymin", "xmax"],
  [["m1", "100", "100", "cat", "1", "1", "50"]],
  { dtypes: { image_id: "str", width: "str", height: "str", label: "str", xmin: "str", ymin: "str", xmax: "str" } },
);

export const pf27Generator: MissionGenerator = {
  generate({ rng }) {
    const fixture = rng.pick(ANNOTATION_FIXTURES);
    const allowed = [...fixture.allowedLabels];
    const data = { annotation_file: fixture.file, allowed_labels: allowed };

    const cleaned = clean(fixture.records, allowed);
    const normalized = normalizeBoxes(cleaned);
    const summary = classSummary(cleaned);

    // ---- clean_annotations(df, allowed_labels)
    const catDog = ["cat", "dog"];
    const cleanCase = (id: string, label: string, args: PyValue[], rows: readonly AnnotationRaw[], allowedLabels: readonly string[]): FunctionCase =>
      hiddenCase(id, label, args, returns(cleanFrame(clean(rows, allowedLabels)), "DataFrame"));
    const cleanCases: FunctionCase[] = [
      exampleCase(
        "clean-example",
        "Ví dụ trong đề",
        [rawTextFrame(fixture.records), allowed],
        returns(cleanFrame(cleaned), "DataFrame"),
      ),
      cleanCase("clean-noisy", "Chữ hoa/thường và khoảng trắng, bản ghi trùng, hộp lỗi", [rawTextFrame(NOISY), catDog], NOISY, catDog),
      cleanCase("clean-numeric", "Cột đã là số: kích thước âm, hộp ngược, hộp suy biến, hộp ra ngoài ảnh", [rawNumberFrame(NUMERIC), ["x", "y"]], NUMERIC, ["x", "y"]),
      cleanCase("clean-labels", "Danh sách lớp khác và lớp lạ", [rawTextFrame(OTHER_LABELS), ["apple", "pear"]], OTHER_LABELS, ["apple", "pear"]),
      cleanCase("clean-none-valid", "Không còn bản ghi hợp lệ nào", [rawTextFrame(ALL_BAD), ["cat"]], ALL_BAD, ["cat"]),
      hiddenCase("clean-schema", "Thiếu cột bắt buộc", [MISSING_COLUMN_FRAME, ["cat"]], raises("ValueError")),
    ];

    // ---- normalize_boxes(clean)
    const normalizeCase = (id: string, label: string, boxes: readonly CleanBox[]): FunctionCase =>
      hiddenCase(id, label, [cleanFrame(boxes)], returns(normalizedFrame(boxes), "DataFrame", TOLERANCE));
    const normalizeCases: FunctionCase[] = [
      exampleCase("norm-example", "Ví dụ trong đề", [cleanFrame(cleaned)], returns(normalizedFrame(cleaned), "DataFrame", TOLERANCE)),
      normalizeCase("norm-sizes", "Các ảnh có kích thước khác nhau trong cùng một bảng", TWO_SIZES),
      normalizeCase("norm-single", "Một lớp, hộp phủ nửa ảnh", SINGLE_CLASS),
      normalizeCase("norm-empty", "Bảng rỗng", []),
    ];

    // ---- class_summary(clean)
    const summaryCase = (id: string, label: string, boxes: readonly CleanBox[]): FunctionCase =>
      hiddenCase(id, label, [cleanFrame(boxes)], returns(summaryFrame(classSummary(boxes)), "DataFrame", TOLERANCE));
    const summaryCases: FunctionCase[] = [
      exampleCase("summary-example", "Ví dụ trong đề", [cleanFrame(cleaned)], returns(summaryFrame(summary), "DataFrame", TOLERANCE)),
      summaryCase("summary-ties", "Các lớp bằng số hộp: xếp theo tên lớp", TIES),
      summaryCase("summary-single", "Chỉ có một lớp", SINGLE_CLASS),
      summaryCase("summary-shuffled", "Nhiều ảnh, thứ tự dòng lộn xộn", SHUFFLED),
      summaryCase("summary-empty", "Bảng rỗng", []),
    ];

    // ---- plot_class_distribution(summary)
    const plotCase = (id: string, label: string, boxes: readonly CleanBox[]): FunctionCase =>
      hiddenCase(id, label, [summaryFrame(classSummary(boxes))], returns(distributionFigure(classSummary(boxes)), "Axes"));
    const plotCases: FunctionCase[] = [
      exampleCase("plot-example", "Ví dụ trong đề", [summaryFrame(summary)], returns(distributionFigure(summary), "Axes")),
      plotCase("plot-ties", "Các lớp bằng nhau: giữ đúng thứ tự của bảng", TIES),
      plotCase("plot-single", "Chỉ có một lớp", SINGLE_CLASS),
      plotCase("plot-shuffled", "Bảng tóm tắt khác", SHUFFLED),
    ];

    return {
      learner: {
        objective:
          "Capstone: kiểm tra chất lượng bộ annotation ảnh (bounding box) rồi chuẩn bị dữ liệu: làm sạch, chuẩn hóa tọa độ về [0, 1], dựng ma trận đặc trưng, tóm tắt theo lớp và vẽ biểu đồ phân bố lớp.",
        context:
          "File CSV ở `annotation_file` (trong thư mục `data/`) là danh sách bounding box do nhiều người gán nhãn, KHÔNG sạch. Mỗi dòng là một hộp trên một ảnh: `image_id, width, height, label, xmin, ymin, xmax, ymax, split` (toạ độ tính theo pixel, gốc ở góc trên bên trái). `allowed_labels` là danh sách lớp hợp lệ (viết thường). Bài tự lập: bạn tự chia nhỏ, tự kiểm tra từng bước. Đây là bài chuẩn bị dữ liệu, không huấn luyện mô hình.\n\n" +
          "1) `clean_annotations(df, allowed_labels)` — KHÔNG sửa `df`. Nếu `df` thiếu cột nào trong 9 cột trên thì `raise ValueError` (nêu tên cột thiếu). Ngược lại trả về DataFrame sạch theo quy tắc: " +
          "bỏ khoảng trắng hai đầu của `image_id`, `label`, `split`; `label` và `split` viết thường; `width, height, xmin, ymin, xmax, ymax` đổi sang số (giá trị không đọc được coi là thiếu). Một dòng HỢP LỆ khi: `image_id` không trống; `width > 0` và `height > 0`; mọi số đều đọc được; `0 <= xmin < xmax <= width` và `0 <= ymin < ymax <= height`; `label` nằm trong `allowed_labels`; `split` là `train`, `val` hoặc `test`. Dòng không hợp lệ bị loại. " +
          "Sau đó, trong các dòng HỢP LỆ, chỉ giữ dòng ĐẦU TIÊN của mỗi bộ (`image_id, label, xmin, ymin, xmax, ymax`). Giữ thứ tự dòng ban đầu. Kết quả có đúng 9 cột theo thứ tự trên, dtype lần lượt str, int64, int64, str, float64, float64, float64, float64, str, và chỉ số hàng 0, 1, 2, ...\n\n" +
          "2) `normalize_boxes(clean)` — nhận bảng sạch, KHÔNG sửa nó, trả về DataFrame có các cột `image_id, label, split, x1, y1, x2, y2` (dtype str, str, str, float64 ×4) cùng chỉ số hàng với `clean`, trong đó `x1 = xmin / width`, `y1 = ymin / height`, `x2 = xmax / width`, `y2 = ymax / height` của chính dòng đó.\n\n" +
          "3) `class_summary(clean)` — trả về DataFrame có chỉ số tên `label` (mỗi lớp xuất hiện trong `clean` đúng một dòng) và các cột `boxes` (số hộp, int64), `images` (số ảnh khác nhau có lớp đó, int64), `share` (boxes / tổng số hộp, float64), `mean_area` (trung bình diện tích hộp theo tỉ lệ ảnh `(xmax-xmin)*(ymax-ymin)/(width*height)`, float64). Xếp theo `boxes` giảm dần; bằng nhau thì theo tên lớp tăng dần.\n\n" +
          "4) `plot_class_distribution(summary)` — nhận bảng ở bước 3 và trả về Axes của MỘT biểu đồ cột (bar): trục x là các lớp, đúng thứ tự của `summary`, chiều cao là `boxes`. Tiêu đề `Phân bố lớp annotation`, nhãn trục x `Lớp`, nhãn trục y `Số bounding box`.\n\n" +
          "5) Cuối script, với `raw` đọc từ file CSV bằng pandas: `clean = clean_annotations(raw, allowed_labels)`, `norm = normalize_boxes(clean)`, `X` là ndarray float64 shape `(số_hộp, 4)` gồm bốn cột `(tâm x, tâm y, rộng, cao)` của từng hộp đã chuẩn hóa — tâm x = (x1+x2)/2, tâm y = (y1+y2)/2, rộng = x2−x1, cao = y2−y1 — theo thứ tự dòng của `norm`; `summary = class_summary(clean)`; `rejected` là số nguyên: số dòng của `raw` KHÔNG vào bảng sạch (kể cả dòng trùng); `ax = plot_class_distribution(summary)`. Biểu đồ sẽ hiện ra sau khi chạy.",
        data,
      },
      runtime: { setupData: data },
      grading: {
        data: {
          clean: cleanFrame(cleaned),
          norm: normalizedFrame(cleaned),
          X: nd(yoloMatrix(normalized), "float64", [cleaned.length, 4]),
          summary: summaryFrame(summary),
          rejected: fixture.records.length - cleaned.length,
          ax: distributionFigure(summary),
          cleanCases: asJson(cleanCases),
          normalizeCases: asJson(normalizeCases),
          summaryCases: asJson(summaryCases),
          plotCases: asJson(plotCases),
        },
      },
    };
  },
};

export function registerPythonFoundationsM11Generators(registry: GeneratorRegistry): void {
  registry.registerGenerator(PYTHON_FOUNDATIONS_M11_GENERATOR_ID.PF27, pf27Generator);
}
