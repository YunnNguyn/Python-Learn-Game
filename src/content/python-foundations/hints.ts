import { HintLevel, type HintSetId } from "../../core/domain";
import type { HintRegistry, HintSet } from "../../core/hints";
import { registerPythonFoundationsM9Hints } from "./hints-m9";
import { registerPythonFoundationsM10Hints } from "./hints-m10";
import { registerPythonFoundationsM11Hints } from "./hints-m11";

/**
 * H1-H4 hint sets of the Python Foundations missions.
 *
 * Levels follow the existing contract (see MissionHintPanel): H1 concept, H2 strategy,
 * H3 API / syntax, H4 pseudocode. H1 and H2 never contain code or the expression that
 * solves the task; they point at the idea. H3 names the construct to use; H4 is the
 * pseudocode and is the learner's explicit choice (using it is recorded in the attempt).
 */

const hintSetId = (value: string): HintSetId => value as HintSetId;

export const PYTHON_FOUNDATIONS_HINT_SET_ID = {
  PF01: hintSetId("python-foundations.hints.pf01"),
  PF02: hintSetId("python-foundations.hints.pf02"),
  PF03: hintSetId("python-foundations.hints.pf03"),
  PF04: hintSetId("python-foundations.hints.pf04"),
  PF05: hintSetId("python-foundations.hints.pf05"),
  PF06: hintSetId("python-foundations.hints.pf06"),
  PF07: hintSetId("python-foundations.hints.pf07"),
} as const;

const hints = (
  id: HintSetId,
  h1: string,
  h2: string,
  h3: string,
  h4: string,
): HintSet => ({
  id,
  hints: [
    { level: HintLevel.H1, text: h1 },
    { level: HintLevel.H2, text: h2 },
    { level: HintLevel.H3, text: h3 },
    { level: HintLevel.H4, text: h4 },
  ],
});

export const PYTHON_FOUNDATIONS_HINT_SETS: readonly HintSet[] = [
  hints(
    PYTHON_FOUNDATIONS_HINT_SET_ID.PF01,
    "Mỗi bước là một phép tính trên các biến đã có sẵn. Hãy nghĩ xem phép tính nào cho ra số nguyên và phép tính nào cho ra số thực.",
    "Số pixel là diện tích của ảnh tính theo pixel; số giá trị số là số pixel nhân với số kênh màu. Với một nửa chiều rộng, hãy chọn loại phép chia luôn cho kết quả nguyên.",
    "Python có `*` để nhân, `/` luôn trả về số thực và `//` là chia lấy phần nguyên (làm tròn xuống).",
    "Pseudocode: pixel_count ← width × height; aspect_ratio ← width chia thường cho height; total_values ← pixel_count × channels; half_width ← width chia lấy phần nguyên cho 2.",
  ),
  hints(
    PYTHON_FOUNDATIONS_HINT_SET_ID.PF02,
    "Quy tắc là một chuỗi kiểm tra đi từ ngưỡng cao xuống ngưỡng thấp: nhánh đầu tiên đúng sẽ quyết định nhãn. Hãy nghĩ xem thứ tự kiểm tra có quan trọng không.",
    "Một phép so sánh cho ra giá trị Boolean (True hoặc False) nên có thể gán thẳng vào biến. Chú ý mốc đúng bằng ngưỡng: quy tắc nói 'đạt ngưỡng' chứ không phải 'vượt ngưỡng'.",
    "`>=` là 'lớn hơn hoặc bằng'. Cấu trúc nhiều nhánh gồm `if điều_kiện:`, `elif điều_kiện:` và `else:`, phần thân của mỗi nhánh thụt vào một cấp.",
    "Pseudocode: is_confident ← (confidence ≥ high_threshold). Nếu confidence ≥ high_threshold thì label ← \"accept\"; ngược lại nếu confidence ≥ low_threshold thì label ← \"review\"; còn lại label ← \"reject\". Làm tương tự với edge_confidence để được edge_label.",
  ),
  hints(
    PYTHON_FOUNDATIONS_HINT_SET_ID.PF03,
    "Hãy đọc thông báo lỗi ở phần Output: nó nói rõ kiểu của hai giá trị đang bị đem ra tính với nhau. Dữ liệu đọc từ file thường là chữ, dù trông giống số.",
    "Có hai lỗi và lỗi thứ hai chỉ lộ ra sau khi sửa lỗi đầu. Sau mỗi lần sửa hãy chạy lại, rồi so nhãn đang in ra với quy tắc 'ảnh quá lớn khi vượt giới hạn'.",
    "`int(...)` chuyển một chuỗi chữ số thành số nguyên. `>` nghĩa là 'lớn hơn', `<` nghĩa là 'nhỏ hơn'.",
    "Pseudocode: width ← int(width_text); height ← int(height_text); pixel_count ← width × height; nếu pixel_count > max_pixels thì size_label ← \"too_large\", ngược lại size_label ← \"ok\".",
  ),
  hints(
    PYTHON_FOUNDATIONS_HINT_SET_ID.PF04,
    "Vòng lặp đưa lần lượt từng số đo vào biến lặp. Bên trong vòng lặp, một điều kiện quyết định số đo đó thuộc nhóm hợp lệ hay không hợp lệ; hai nhóm này loại trừ nhau.",
    "Khai báo kết quả ở trạng thái ban đầu (list rỗng, số 0) trước vòng lặp rồi cập nhật chúng bên trong. Chú ý 'hợp lệ' gồm cả hai đầu mút của đoạn.",
    "`danh_sách.append(x)` thêm x vào cuối list, `a <= x <= b` kiểm tra x nằm trong đoạn từ a đến b, và `tổng += x` cộng dồn x vào tổng.",
    "Pseudocode: với mỗi value trong readings — nếu min_valid ≤ value ≤ max_valid thì thêm value vào valid_readings và cộng value vào valid_total; ngược lại tăng invalid_count thêm 1.",
  ),
  hints(
    PYTHON_FOUNDATIONS_HINT_SET_ID.PF05,
    "Một hàm đóng gói một phép tính để dùng lại với nhiều dữ liệu khác nhau. Kết quả của hàm phải đi ra ngoài bằng lệnh trả về (return), không phải bằng lệnh in ra màn hình (print).",
    "Trung bình cộng là tổng chia cho số phần tử. Hãy nghĩ trước xem một list rỗng làm phép chia ra sao, và quy ước trong đề xử lý nó thế nào.",
    "`sum(values)` cộng các phần tử, `len(values)` đếm phần tử, `/` luôn cho số thực. Dùng `if` để xử lý trường hợp đặc biệt trước khi chia.",
    "Pseudocode: hàm mean_of(values) — nếu values rỗng thì return 0.0; ngược lại return (tổng các phần tử) chia thường cho (số phần tử).",
  ),
  hints(
    PYTHON_FOUNDATIONS_HINT_SET_ID.PF06,
    "Bài này ghép ba thứ đã học: duyệt từng phần tử, kiểm tra điều kiện và gom kết quả vào list, rồi đóng gói tất cả trong một hàm dùng lại được cho nhiều hàng pixel.",
    "Bắt đầu từ list kết quả rỗng bên trong hàm. Với mỗi giá trị, quyết định trước 'giữ hay bỏ'; chỉ khi giữ mới tính và thêm vào list. Đừng quên hàm cần trả list ra ngoài.",
    "`for value in values:` để duyệt, `0 <= value <= max_value` để kiểm tra đoạn hợp lệ, `ketqua.append(...)` để thêm vào list và `return ketqua` để trả về.",
    "Pseudocode: hàm normalize_valid(values, max_value) — result ← list rỗng; với mỗi value trong values: nếu 0 ≤ value ≤ max_value thì thêm value chia thường cho max_value vào result; cuối cùng return result.",
  ),
  hints(
    PYTHON_FOUNDATIONS_HINT_SET_ID.PF07,
    "Hãy chia pipeline thành các bước nhỏ đã làm ở các bài trước: gắn nhãn (hàm), lọc giá trị hợp lệ (vòng lặp và điều kiện), đếm và tính trung bình (tổng hợp). Mỗi bước có thể kiểm tra riêng bằng cách in ra.",
    "Hoàn thiện hàm gắn nhãn trước vì vòng lặp sẽ gọi nó. Trong vòng lặp, chỉ giá trị hợp lệ mới được thêm vào hai list và mới được tính vào bộ đếm. Trung bình tính sau vòng lặp, và phải an toàn khi không có giá trị hợp lệ nào.",
    "Dùng `append` cho hai list, `+= 1` cho bộ đếm theo từng nhãn, `sum(...)` và `len(...)` cho trung bình, và nhớ so sánh nhãn bằng `==` với chuỗi đúng chính tả.",
    "Pseudocode: với mỗi c trong confidences — nếu 0 ≤ c ≤ 1 thì name ← label_for(c, high_threshold, low_threshold), thêm c vào clean_confidences, thêm name vào labels, tăng bộ đếm tương ứng với name; sau vòng lặp, nếu clean_confidences không rỗng thì mean_confidence ← tổng chia số phần tử.",
  ),
];

export function registerPythonFoundationsHints(registry: HintRegistry): void {
  for (const hintSet of PYTHON_FOUNDATIONS_HINT_SETS) {
    registry.registerHintSet(hintSet);
  }
  // M9 (PHASE-07): PF-08..PF-15.
  registerPythonFoundationsM9Hints(registry);
  // M10 (PHASE-08): PF-16..PF-26.
  registerPythonFoundationsM10Hints(registry);
  // M11 (PHASE-09): PF-27.
  registerPythonFoundationsM11Hints(registry);
}
