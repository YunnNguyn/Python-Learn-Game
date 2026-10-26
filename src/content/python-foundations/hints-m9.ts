import { HintLevel, type HintSetId } from "../../core/domain";
import type { HintRegistry, HintSet } from "../../core/hints";

/**
 * H1-H4 hint sets of the M9 missions PF-08..PF-15 (PHASE-07). Same contract as the M8
 * sets: H1 concept, H2 strategy (neither names the line that solves the task), H3 the
 * construct / syntax, H4 pseudocode (the learner's explicit choice, recorded in the attempt).
 */

const hintSetId = (value: string): HintSetId => value as HintSetId;

export const PYTHON_FOUNDATIONS_M9_HINT_SET_ID = {
  PF08: hintSetId("python-foundations.hints.pf08"),
  PF09: hintSetId("python-foundations.hints.pf09"),
  PF10: hintSetId("python-foundations.hints.pf10"),
  PF11: hintSetId("python-foundations.hints.pf11"),
  PF12: hintSetId("python-foundations.hints.pf12"),
  PF13: hintSetId("python-foundations.hints.pf13"),
  PF14: hintSetId("python-foundations.hints.pf14"),
  PF15: hintSetId("python-foundations.hints.pf15"),
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

const ID = PYTHON_FOUNDATIONS_M9_HINT_SET_ID;

export const PYTHON_FOUNDATIONS_M9_HINT_SETS: readonly HintSet[] = [
  hints(
    ID.PF08,
    "Mỗi phần tử của list có một vị trí. Python đếm vị trí từ 0 ở đầu list, và cũng cho phép đếm ngược từ cuối list. Cắt lát là cách lấy một đoạn liên tiếp mà không phải duyệt từng phần tử.",
    "Với mỗi biến, hãy tự hỏi: đoạn cần lấy bắt đầu ở đâu, kết thúc ở đâu, và có đi theo chiều ngược hoặc nhảy bước không? Nhớ rằng điểm kết thúc của một lát cắt KHÔNG được lấy. Thử in từng kết quả và đối chiếu với tab Dữ liệu.",
    "`items[i]` lấy một phần tử, `items[-1]` là phần tử cuối. Lát cắt có dạng `items[start:stop:step]`; bỏ trống `start` nghĩa là từ đầu, bỏ trống `stop` nghĩa là đến hết, `step` âm đi ngược lại.",
    "Pseudocode: last_sample ← phần tử có chỉ số −1; head ← lát từ đầu đến chỉ số n (không lấy n); tail ← lát bắt đầu ở chỉ số −n đến hết; window ← lát từ start đến stop; every_second ← lát toàn bộ với bước 2; newest_first ← lát toàn bộ với bước −1.",
  ),
  hints(
    ID.PF09,
    "Dictionary lưu cặp khóa → giá trị và tra cứu theo khóa rất nhanh; tuple là dãy giá trị cố định không sửa được; set chỉ giữ mỗi giá trị đúng một lần. Mỗi loại hợp với một việc: đếm, ghép cặp bất biến, loại trùng.",
    "Đếm nhãn nghĩa là duyệt từng nhãn và cập nhật bộ đếm của nhãn đó, nên hãy nghĩ cách xử lý lần đầu gặp một nhãn (chưa có khóa). Nhãn phổ biến nhất lấy từ chính bảng đếm. Chỉ số lớp lấy từ thứ tự đã sắp xếp của các nhãn khác nhau.",
    "`set(items)` loại trùng, `sorted(...)` trả về list đã sắp xếp, `d.get(key, 0)` trả về 0 khi chưa có khóa, `max(d, key=d.get)` cho khóa có giá trị lớn nhất, `enumerate(items)` cho cặp (chỉ số, phần tử), `(a, b)` tạo tuple.",
    "Pseudocode: label_counts ← dict rỗng; với mỗi label trong labels: label_counts[label] ← (giá trị hiện có hoặc 0) + 1. unique_labels ← set(labels); unique_sorted ← sorted(unique_labels). best ← khóa có số đếm lớn nhất; top_label ← (best, label_counts[best]). class_index ← dict gồm (nhãn: vị trí) với mọi nhãn trong unique_sorted. image_size ← (width, height); swapped_size ← (height, width).",
  ),
  hints(
    ID.PF10,
    "Comprehension là cách viết một vòng lặp tạo list hoặc dictionary trong một biểu thức: 'với mỗi phần tử, nếu thỏa điều kiện thì lấy kết quả này'. Phần lọc và phần biến đổi là hai việc riêng.",
    "Với mỗi biến, xác định ba thứ: duyệt qua cái gì, điều kiện để giữ phần tử, và giá trị lấy ra. Với bài tìm chỉ số pixel sáng, bạn cần cả chỉ số lẫn giá trị của mỗi pixel khi duyệt. Với dictionary, duyệt các cặp khóa-giá trị của dữ liệu gốc.",
    "List: `[biểu_thức for x in items if điều_kiện]`. Dictionary: `{khóa: giá_trị for ... in ... if ...}`. `enumerate(items)` cho cặp (chỉ số, phần tử) và `d.items()` cho cặp (khóa, giá trị).",
    "Pseudocode: valid_scaled ← [p chia 255 với mỗi p trong pixels nếu 0 ≤ p ≤ 255]; bright_indices ← [i với mỗi (i, p) trong enumerate(pixels) nếu 0 ≤ p ≤ 255 và p ≥ bright_from]; word_lengths ← {w: độ dài w với mỗi w trong words}; passed_scores ← {name: score với mỗi (name, score) trong scores.items() nếu score ≥ pass_mark}.",
  ),
  hints(
    ID.PF11,
    "Khi nộp bài, hàm của bạn được gọi với nhiều bộ đầu vào khác ví dụ trong đề, kể cả các trường hợp biên. Một hàm đúng phải đúng cho MỌI đầu vào hợp lệ, chứ không chỉ cho ví dụ — nên hãy suy nghĩ về quy tắc, đừng chép kết quả.",
    "Liệt kê các trường hợp biên của từng hàm: cửa sổ dài hơn list, list rỗng, giá trị đúng bằng cận, cận không hợp lệ. Kiểm tra đầu vào không hợp lệ ở đầu hàm rồi mới tính. Hàm không được thay đổi list mà nó nhận; hãy tạo list mới cho kết quả.",
    "`raise ValueError(\"...\")` báo lỗi đầu vào. `values[i:i + window]` lấy đoạn dài `window` từ vị trí i, `range(len(values) - window + 1)` cho các vị trí bắt đầu hợp lệ, `min(a, b)` và `max(a, b)` giúp kẹp một giá trị vào một đoạn.",
    "Pseudocode: moving_average(values, window) — nếu window < 1 thì raise ValueError; result ← list rỗng; với mỗi vị trí bắt đầu i từ 0 đến len(values) − window: thêm (tổng values[i : i + window]) chia thường cho window vào result; return result. clip_values(values, low, high) — nếu low > high thì raise ValueError; return list mới gồm max(low, min(v, high)) cho mỗi v trong values.",
  ),
  hints(
    ID.PF12,
    "Bạn đang debug một hàm chạy được trên dữ liệu đẹp nhưng sai hoặc gãy trên dữ liệu thật. Đọc kỹ thông báo lỗi ở phần Output: nó nói rõ kiểu lỗi và giá trị nào gây ra. Mỗi lần chỉ sửa một lỗi rồi chạy lại.",
    "So sánh từng dòng của hàm với quy tắc trong đề: dữ liệu nhập là CHUỖI nên cần đổi sang kiểu số nào? Những kiểu lỗi nào có thể xảy ra khi đổi? 'Trong đoạn' có bao gồm hai đầu mút không? Hàm trả về đúng kiểu dữ liệu mà đề yêu cầu chưa? Và hàm có từ chối đầu vào sai ngay từ đầu không?",
    "`float(text)` đọc chuỗi thành số thực và báo `ValueError` nếu không đọc được (kể cả khi có khoảng trắng hai đầu thì vẫn đọc được); `float(None)` báo `TypeError`. Dùng `except (LoiA, LoiB):` để bắt cụ thể từng loại lỗi. `isinstance(x, str)` kiểm tra kiểu. `raise TypeError(...)` / `raise ValueError(...)` báo đầu vào sai.",
    "Pseudocode: nếu raw_values không phải list thì raise TypeError; nếu low > high thì raise ValueError; với mỗi item: nếu item không phải chuỗi thì tăng rejected và bỏ qua; thử number ← float(item), nếu ValueError thì tăng rejected và bỏ qua; nếu low ≤ number ≤ high thì thêm number vào values, ngược lại tăng rejected; cuối cùng return dict {\"values\": values, \"rejected\": rejected}.",
  ),
  hints(
    ID.PF13,
    "Đây là một pipeline dữ liệu thật: văn bản thô → cấu trúc Python → bản ghi hợp lệ → bảng sạch. Hãy tách thành các bước nhỏ, mỗi bước kiểm tra riêng được: đọc JSON, kiểm tra một bản ghi, tổng hợp.",
    "Viết trước một hàm phụ trả lời 'bản ghi này hợp lệ không, và nếu có thì các giá trị đã chuẩn hóa là gì?'. Sau đó vòng lặp chính chỉ gom các kết quả hợp lệ, theo dõi các id đã thấy. Các số liệu (đếm theo nhãn, trung bình, chỉ số nhãn) tính từ danh sách bản ghi đã gom, không phải từ dữ liệu thô.",
    "`json.loads(text)` đọc chuỗi JSON (báo `json.JSONDecodeError`, một loại `ValueError`, khi sai cú pháp). `isinstance(x, dict)`, `x.get(\"key\")`, `text.strip().lower()`, `float(...)` và `int(...)` trong `try/except`, `set()` cho id đã thấy, `sorted(set(...))` và `labels.index(name)`.",
    "Pseudocode: data ← json.loads(text); nếu data không phải list thì raise ValueError. Với mỗi record trong data: bỏ qua nếu không phải dict; id ← record id đã strip, bỏ qua nếu không phải chuỗi, rỗng hoặc đã thấy; label ← label đã strip và lower, bỏ qua nếu không hợp lệ; confidence ← float(...) và phải nằm trong [0, 1]; width, height ← số nguyên dương; nếu tất cả ổn thì đánh dấu id đã thấy và lưu (width × height, confidence, label). Sau vòng lặp: labels ← sorted(các nhãn khác nhau); đếm theo nhãn; mean_confidence (0.0 nếu không có); rows ← [pixels, confidence, labels.index(label)] cho từng bản ghi.",
  ),
  hints(
    ID.PF14,
    "ndarray là mảng nhiều chiều mà MỌI phần tử cùng một dtype. Shape cho biết kích thước theo từng chiều, ndim là số chiều (độ dài của shape) và size là tổng số phần tử. Chỉ số của ndarray dùng dấu phẩy để phân tách các chiều.",
    "Hãy xem mỗi thuộc tính của ndarray như một câu hỏi về cấu trúc và tìm xem thuộc tính nào trả lời nó. Với việc lấy hàng hoặc cột, nghĩ xem chỉ số của chiều nào cần 'lấy hết' và chiều nào cần một vị trí cụ thể. Hàm describe_array chỉ là cách đóng gói các thuộc tính đó, phải đúng với mảng bất kỳ.",
    "`np.array(table, dtype=np.float64)` tạo mảng, `a.ndim`, `a.shape`, `a.size`, `a.dtype` đọc cấu trúc (`str(a.dtype)` cho tên). `a[i, j]` là một phần tử, `a[-1]` là hàng cuối, `a[:, 1]` là cột chỉ số 1 (dấu `:` nghĩa là lấy hết chiều đó).",
    "Pseudocode: arr ← np.array(table, dtype=np.float64); n_dims ← arr.ndim; shape_of_arr ← arr.shape; element_count ← arr.size; dtype_name ← str(arr.dtype); last_row ← arr[-1]; second_column ← arr[:, 1]; picked ← arr[row_i, col_j]. describe_array(a) trả về dict với ndim ← a.ndim, shape ← a.shape, size ← a.size, dtype ← str(a.dtype).",
  ),
  hints(
    ID.PF15,
    "Vector hóa nghĩa là áp một phép toán lên cả mảng cùng lúc thay vì từng phần tử bằng vòng lặp. Phép so sánh trên mảng cho ra mảng Boolean (mặt nạ) và mặt nạ có thể chọn hoặc thay thế phần tử. Phép toán theo axis gộp các giá trị dọc theo một chiều.",
    "Cả ba hàm đều bắt đầu từ cùng một mặt nạ 'hợp lệ', nên hãy xây nó đúng một lần (cả hai đầu mút đều hợp lệ). Hàm scale cần giữ giá trị hợp lệ và thay phần còn lại. Hàm trung bình cần tổng và SỐ LƯỢNG giá trị hợp lệ theo từng hàng, và phải an toàn khi hàng không có giá trị hợp lệ nào (đừng để phép chia cho 0 sinh ra NaN). Không sửa mảng đầu vào.",
    "Kết hợp điều kiện bằng `&` (kèm ngoặc đơn). `np.where(mask, a, b)` chọn `a` nơi mask đúng và `b` nơi sai. `mask.sum(axis=1)` đếm True theo từng hàng, `np.where(mask, data, 0.0).sum(axis=1)` tính tổng các giá trị hợp lệ theo hàng, `np.maximum(counts, 1)` tránh chia cho 0, `np.argmax(...)` cho chỉ số lớn nhất, `int(...)` đổi sang số nguyên Python thường.",
    "Pseudocode: valid_mask(data, max_value) ← (data ≥ 0) và (data ≤ max_value). scale_valid ← np.where(mask, data chia max_value, 0.0). sensor_means: tổng ← tổng theo axis 1 của np.where(mask, data, 0.0); đếm ← tổng theo axis 1 của mask; trả về tổng chia max(đếm, 1) từng phần tử (hàng không có giá trị hợp lệ cho 0.0). Cuối: valid_total ← int(tổng toàn bộ mask); best_sensor ← int(np.argmax(sensor_means(data, max_value))).",
  ),
];

export function registerPythonFoundationsM9Hints(registry: HintRegistry): void {
  for (const hintSet of PYTHON_FOUNDATIONS_M9_HINT_SETS) registry.registerHintSet(hintSet);
}
