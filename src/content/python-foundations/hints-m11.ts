import { HintLevel, type HintSetId } from "../../core/domain";
import type { HintRegistry, HintSet } from "../../core/hints";

/**
 * H1-H4 hint set of the M11 capstone PF-27 (PHASE-09). Same contract as the earlier sets: H1
 * concept, H2 strategy (neither names the line that solves the task), H3 the construct /
 * syntax, H4 pseudocode. H3 and H4 are the "high-level" hints: using either one is recorded
 * in the attempt, and a pass that used one is shown as "completed with support", not as
 * independent evidence for the capstone.
 */

const hintSetId = (value: string): HintSetId => value as HintSetId;

export const PYTHON_FOUNDATIONS_M11_HINT_SET_ID = {
  PF27: hintSetId("python-foundations.hints.pf27"),
} as const;

const hints = (id: HintSetId, h1: string, h2: string, h3: string, h4: string): HintSet => ({
  id,
  hints: [
    { level: HintLevel.H1, text: h1 },
    { level: HintLevel.H2, text: h2 },
    { level: HintLevel.H3, text: h3 },
    { level: HintLevel.H4, text: h4 },
  ],
});

export const PYTHON_FOUNDATIONS_M11_HINT_SETS: readonly HintSet[] = [
  hints(
    PYTHON_FOUNDATIONS_M11_HINT_SET_ID.PF27,
    "Kiểm tra annotation là một chuỗi cổng lọc: mỗi dòng phải đi qua từng cổng (có đủ thông tin không? số có đọc được không? hộp có nằm trong ảnh không? lớp và split có hợp lệ không?) rồi mới được chuẩn hóa và đếm. Chuẩn hóa về [0, 1] chỉ có nghĩa khi hộp đã nằm trong ảnh, và thống kê theo lớp chỉ đáng tin khi dữ liệu đã sạch.",
    "Tách bài thành bốn hàm độc lập rồi thử từng hàm trên một bảng nhỏ do chính bạn dựng. Với bước làm sạch, viết ra từng điều kiện hợp lệ thành một dòng riêng, gộp chúng thành MỘT mặt nạ, và đếm xem mỗi điều kiện loại bao nhiêu dòng. Hỏi: nên loại bản ghi trùng trước hay sau khi loại bản ghi không hợp lệ? Thử hình dung một dòng không hợp lệ có cùng khóa với một dòng hợp lệ đến sau. Với phần tóm tắt theo lớp, hãy nghĩ cách xử lý trường hợp bằng nhau về số hộp.",
    "`missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]` và `raise ValueError(...)`; `df.copy()`; `pd.to_numeric(col, errors='coerce')`; `col.str.strip().str.lower()`; `col.isin(danh_sách)`; so sánh với NaN luôn cho False nên dòng thiếu số tự bị loại; kết hợp bằng `&` (mỗi vế trong ngoặc); `table[mask]`; `table.drop_duplicates(subset=[...], keep='first')`; `astype({'width': 'int64', 'xmin': 'float64', ...})` (đề quy định dtype từng cột; một cột toàn số nguyên vẫn phải là float64 ở bốn cột tọa độ); `reset_index(drop=True)`. Chuẩn hóa: `clean['xmin'] / clean['width']` chia từng dòng cho kích thước ảnh của chính nó. Tóm tắt: `groupby('label')`, `.size()`, `['image_id'].nunique()`, `sort_values(['boxes', 'label'], ascending=[False, True])`. Biểu đồ: `fig, ax = plt.subplots()`, `ax.bar(nhãn, giá_trị)`, `ax.set_title/ set_xlabel/ set_ylabel`. Ma trận: `np.column_stack([...])`.",
    "Pseudocode: clean_annotations: thiếu ← các cột bắt buộc mà df không có; nếu có thì raise ValueError; t ← bản sao của 9 cột; đổi 6 cột số bằng to_numeric (lỗi → thiếu); strip ba cột chữ, hạ chữ thường label và split; hợp_lệ ← image_id không trống VÀ width>0 VÀ height>0 VÀ xmin≥0 VÀ ymin≥0 VÀ xmin<xmax VÀ ymin<ymax VÀ xmax≤width VÀ ymax≤height VÀ label ∈ allowed_labels VÀ split ∈ {train, val, test}; t ← t[hợp_lệ]; bỏ trùng theo (image_id, label, xmin, ymin, xmax, ymax) giữ dòng đầu; ép dtype từng cột; reset_index. normalize_boxes: bảng mới gồm image_id, label, split của clean cùng bốn cột x1=xmin/width, y1=ymin/height, x2=xmax/width, y2=ymax/height. class_summary: gom clean theo label; boxes = số dòng, images = số image_id khác nhau, share = boxes chia tổng số hộp, mean_area = trung bình của (xmax−xmin)·(ymax−ymin)/(width·height); sắp xếp boxes giảm dần rồi label tăng dần; index tên label. plot_class_distribution: fig, ax ← plt.subplots(); ax.bar(summary.index, summary['boxes']); đặt ba chữ đúng như đề; return ax. Cuối script: raw ← đọc CSV; clean, norm, X ← column_stack của (x1+x2)/2, (y1+y2)/2, x2−x1, y2−y1; summary; rejected ← len(raw) − len(clean); ax.",
  ),
];

export function registerPythonFoundationsM11Hints(registry: HintRegistry): void {
  for (const hintSet of PYTHON_FOUNDATIONS_M11_HINT_SETS) registry.registerHintSet(hintSet);
}
