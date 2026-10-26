import type { MissionLessonGuide, MissionQuickCheckDefinition } from "./mission-lesson-guides";

/**
 * "Bài học nhanh" cards and quick checks of the M9 missions PF-08..PF-15 (PHASE-07). Same
 * shape and same panel as the M8 guides; the lookup lives in mission-lesson-guides.ts.
 * Examples use neutral names (a, b, items, ...) on purpose: a guide teaches the construct,
 * it never contains a line of a mission's solution.
 */

export const PYTHON_FOUNDATIONS_M9_LESSON_GUIDES: Readonly<Record<string, MissionLessonGuide>> = {
  "python-foundations.pf08": {
    title: "Bài học nhanh cho PF-08",
    summary:
      "Dữ liệu cảm biến là một dãy theo thời gian. Chỉ số cho bạn lấy một phần tử theo vị trí, cắt lát cho bạn lấy cả một đoạn: hai thao tác nền tảng của gần như mọi bước tiền xử lý dữ liệu.",
    library: "Python chuẩn — không cần import",
    methods: ["items[i]", "items[-1]", "items[a:b]", "items[a:b:c]"],
    newTopics: [
      {
        label: "Chỉ số dương và âm",
        explanation:
          "Chỉ số bắt đầu từ 0 ở đầu list. Chỉ số âm đếm từ cuối: -1 là phần tử cuối, -2 là phần tử kề cuối.",
        syntax: "items = [10, 20, 30, 40]\nitems[0]   # 10\nitems[-1]  # 40",
      },
      {
        label: "Cắt lát [start:stop:step]",
        explanation:
          "Lát cắt lấy từ chỉ số start đến stop - 1: phần tử ở chỉ số stop KHÔNG được lấy. Bỏ trống start nghĩa là từ đầu, bỏ trống stop nghĩa là đến hết, step âm đi ngược. Lát cắt luôn tạo list mới và không sửa list gốc.",
        syntax: "items[1:3]   # [20, 30]\nitems[:2]    # [10, 20]\nitems[-2:]   # [30, 40]\nitems[::2]   # [10, 30]\nitems[::-1]  # [40, 30, 20, 10]",
      },
    ],
    workflow: [
      "Đọc tab Dữ liệu để biết samples dài bao nhiêu và n, start, stop bằng bao nhiêu.",
      "Với mỗi biến, tự dự đoán kết quả trên giấy rồi mới viết lát cắt và in ra để đối chiếu.",
      "Kiểm tra lại samples ở cuối: nó phải còn nguyên như lúc đầu.",
    ],
    commonMistakes: [
      "Quên rằng điểm dừng của lát cắt không được lấy, nên lệch một phần tử.",
      "Dùng `samples.reverse()` hay `samples.sort()`: chúng sửa trực tiếp list gốc, còn lát cắt thì không.",
      "Nhầm `-n` (n phần tử cuối) với `n` (n phần tử đầu).",
    ],
  },
  "python-foundations.pf09": {
    title: "Bài học nhanh cho PF-09",
    summary:
      "Mỗi cấu trúc dữ liệu hợp với một việc: dictionary tra cứu và đếm theo khóa, tuple ghép các giá trị cố định thành một bộ, set loại trùng. Chọn đúng cấu trúc làm mã ngắn hơn và ít lỗi hơn.",
    library: "Python chuẩn — không cần import",
    methods: ["d[key]", "d.get(key, 0)", "set(items)", "sorted(items)", "(a, b)", "enumerate(items)"],
    newTopics: [
      {
        label: "Dictionary",
        explanation:
          "Dictionary lưu các cặp khóa → giá trị. `d.get(key, 0)` trả về 0 nếu khóa chưa có, nên rất tiện cho việc đếm. Gán `d[key] = giá_trị` vừa tạo mới vừa cập nhật.",
        syntax: "counts = {}\ncounts['a'] = counts.get('a', 0) + 1",
      },
      {
        label: "Tuple và set",
        explanation:
          "Tuple viết trong ngoặc tròn, không thể sửa sau khi tạo; hợp với một cặp như (rộng, cao). Set giữ mỗi giá trị đúng một lần và không có thứ tự, nên cần `sorted(...)` khi muốn một list có thứ tự.",
        syntax: "pair = (3, 4)\nunique = set(['x', 'y', 'x'])\nordered = sorted(unique)",
      },
    ],
    reviewTopics: [
      { label: "Vòng lặp for", explanation: "Duyệt từng nhãn và cập nhật bộ đếm tương ứng." },
    ],
    workflow: [
      "Làm bảng đếm bằng vòng lặp trước, in ra và đối chiếu với labels.",
      "Từ bảng đếm, suy ra nhãn phổ biến nhất và danh sách nhãn đã sắp xếp.",
      "Cuối cùng đánh chỉ số lớp từ danh sách đã sắp xếp. Kiểm tra kiểu của từng kết quả: bài chấm cả dict, tuple lẫn set.",
    ],
    commonMistakes: [
      "Dùng list thay cho tuple hoặc set nên sai kiểu dữ liệu.",
      "Ghi đè bộ đếm bằng 1 thay vì cộng thêm 1.",
      "Quên sắp xếp trước khi đánh chỉ số, nên chỉ số phụ thuộc thứ tự xuất hiện.",
    ],
  },
  "python-foundations.pf10": {
    title: "Bài học nhanh cho PF-10",
    summary:
      "Comprehension viết một vòng lặp tạo list hoặc dictionary thành một biểu thức: 'với mỗi phần tử, nếu thỏa điều kiện thì lấy kết quả này'. Chúng gọn và đọc được ngay khi phép lọc và biến đổi đơn giản.",
    library: "Python chuẩn — không cần import",
    methods: ["[f(x) for x in items if cond]", "{k: v for k, v in d.items() if cond}", "enumerate(items)"],
    newTopics: [
      {
        label: "List comprehension",
        explanation:
          "Phần đầu là giá trị lấy ra, tiếp theo là vòng for, cuối cùng là điều kiện giữ phần tử (tùy chọn). Thứ tự phần tử kết quả giống thứ tự duyệt.",
        syntax: "[x * 2 for x in items if x > 0]",
      },
      {
        label: "enumerate và dict comprehension",
        explanation:
          "`enumerate(items)` cho cặp (chỉ số, phần tử) khi cần biết vị trí. Dictionary comprehension dùng cú pháp tương tự với `khóa: giá_trị`; duyệt một dictionary bằng `d.items()` để có cả khóa lẫn giá trị.",
        syntax: "[i for i, x in enumerate(items) if x > 0]\n{k: v for k, v in d.items() if v > 0}",
      },
    ],
    reviewTopics: [
      { label: "Vòng lặp và điều kiện", explanation: "Mỗi comprehension tương đương một vòng for có if bên trong." },
    ],
    workflow: [
      "Với mỗi biến, nói thành lời: duyệt qua cái gì, giữ phần tử nào, lấy ra giá trị gì.",
      "Viết vòng lặp thông thường trước nếu chưa chắc, rồi rút gọn thành comprehension và so kết quả.",
      "Chú ý: chỉ số của `bright_indices` là chỉ số trong list gốc, kể cả khi có phần tử bị bỏ.",
    ],
    commonMistakes: [
      "Quên điều kiện hợp lệ nên giữ cả phần tử lỗi.",
      "Lấy chỉ số từ một list đã lọc thay vì từ list gốc.",
      "Dùng ngoặc vuông cho dictionary hoặc ngược lại.",
    ],
  },
  "python-foundations.pf11": {
    title: "Bài học nhanh cho PF-11",
    summary:
      "Một hàm tốt đúng với mọi đầu vào hợp lệ, không chỉ với ví dụ. Bài này được chấm bằng cách gọi hàm của bạn với nhiều bộ đối số: giá trị thường, trường hợp biên và cả đầu vào sai mà hàm phải từ chối.",
    library: "Python chuẩn — không cần import",
    methods: ["def f(a, b):", "return", "raise ValueError(...)", "range(...)", "min(a, b) / max(a, b)"],
    newTopics: [
      {
        label: "Trường hợp biên và đầu vào sai",
        explanation:
          "Tự hỏi: list rỗng thì sao? Tham số bằng đúng giá trị biên thì sao? Tham số vô nghĩa thì sao? Với đầu vào vô nghĩa, hàm nên báo lỗi rõ ràng bằng `raise` thay vì trả về kết quả sai.",
        syntax: "def f(a):\n    if a < 1:\n        raise ValueError('a must be positive')\n    return a",
      },
      {
        label: "Không sửa đối số",
        explanation:
          "List là đối tượng dùng chung: nếu hàm sửa trực tiếp list nhận vào, nơi gọi hàm sẽ thấy dữ liệu của mình bị đổi. Hãy xây list kết quả mới và trả nó về.",
      },
    ],
    reviewTopics: [
      { label: "Vòng lặp và list", explanation: "Gom kết quả vào list mới bằng append hoặc comprehension." },
    ],
    workflow: [
      "Viết hàm cho ví dụ trong đề và in ra để kiểm tra.",
      "Liệt kê trường hợp biên của từng hàm (rỗng, bằng cận, quá lớn, không hợp lệ) và tự thử từng cái bằng lời gọi hàm.",
      "Nộp bài: nếu một trường hợp sai, tên và lời gọi của nó cho biết bạn bỏ sót kiểu đầu vào nào.",
    ],
    commonMistakes: [
      "Viết cứng kết quả của ví dụ: đúng với ví dụ nhưng sai với mọi đầu vào khác.",
      "Sửa list đầu vào trong hàm rồi trả về chính nó.",
      "Bỏ qua kiểm tra đầu vào sai, hoặc để Python tự báo một loại lỗi khác với loại lỗi đề yêu cầu.",
    ],
  },
  "python-foundations.pf12": {
    title: "Bài học nhanh cho PF-12",
    summary:
      "Dữ liệu thật hiếm khi sạch. Mã đọc dữ liệu nhập phải chuyển kiểu, bắt đúng loại lỗi có thể xảy ra, kiểm tra miền giá trị và từ chối đầu vào sai ngay từ đầu — và phải làm vậy mà không nuốt những lỗi không liên quan.",
    library: "Python chuẩn — không cần import",
    methods: ["float(text)", "try / except", "isinstance(x, str)", "raise TypeError(...)"],
    newTopics: [
      {
        label: "try / except cụ thể",
        explanation:
          "Đặt đoạn có thể lỗi trong `try`, và chỉ bắt đúng loại lỗi bạn dự đoán (`except ValueError:`). Có thể bắt nhiều loại bằng bộ, ví dụ `except (A, B):`. Bắt tất cả bằng `except:` che giấu cả lỗi lập trình.",
        syntax: "try:\n    n = float(text)\nexcept ValueError:\n    n = None",
      },
      {
        label: "Kiểm tra kiểu và miền giá trị",
        explanation:
          "`isinstance(x, str)` kiểm tra kiểu. `raise TypeError(...)` / `raise ValueError(...)` từ chối đầu vào sai. Đọc kỹ đề: 'trong đoạn' có bao gồm hai đầu mút không?",
      },
    ],
    reviewTopics: [
      { label: "Chuyển đổi kiểu", explanation: "`int(\"12.5\")` báo lỗi, còn `float(\"12.5\")` đọc được." },
    ],
    workflow: [
      "Chạy thử và đọc thông báo lỗi ở phần Output.",
      "Sửa MỘT lỗi rồi chạy lại: lỗi sau chỉ lộ ra khi lỗi trước đã được sửa.",
      "Sau khi `result` đúng, đối chiếu hàm với từng quy tắc trong đề (kiểu trả về, đầu vào sai, đầu mút) vì khi nộp bài hàm còn được thử với dữ liệu khác.",
    ],
    commonMistakes: [
      "Dùng `int()` cho dữ liệu có phần thập phân.",
      "Bắt thiếu loại lỗi nên chương trình dừng giữa chừng.",
      "Dùng `<` thay `<=` nên mất giá trị ở hai đầu mút, hoặc trả về sai kiểu (tuple thay vì dictionary).",
    ],
  },
  "python-foundations.pf13": {
    title: "Bài học nhanh cho PF-13",
    summary:
      "Dữ liệu JSON thô cần được đọc, kiểm tra và chuẩn hóa trước khi đưa vào mô hình. Đây là một pipeline nhỏ thật sự: văn bản → cấu trúc Python → bản ghi hợp lệ → tóm tắt và bảng số. Chia nhỏ thành các hàm phụ là cách làm cho mã dễ kiểm tra.",
    library: "Python chuẩn — `import json`",
    methods: ["json.loads(text)", "dict.get(key)", "text.strip().lower()", "sorted(set(...))", "list.index(x)"],
    newTopics: [
      {
        label: "JSON thành cấu trúc Python",
        explanation:
          "`json.loads(text)` biến chuỗi JSON thành list, dictionary, chuỗi, số và None. Chuỗi sai cú pháp làm nó báo `json.JSONDecodeError`, một loại `ValueError`. `record.get('key')` trả về None khi khóa vắng mặt thay vì gây lỗi.",
        syntax: "import json\ndata = json.loads('[{\"a\": 1}]')\nvalue = data[0].get('a')",
      },
      {
        label: "Chuẩn hóa và tổng hợp",
        explanation:
          "Chuẩn hóa chuỗi bằng `strip()` và `lower()` trước khi so sánh hoặc đếm. Theo dõi các giá trị đã thấy bằng một set. Tính các số liệu tổng hợp từ danh sách bản ghi đã chấp nhận, không phải từ dữ liệu thô.",
      },
    ],
    reviewTopics: [
      { label: "Dictionary và kiểm tra dữ liệu", explanation: "Mỗi bản ghi lỗi chỉ bị bỏ qua, không làm hỏng cả bộ dữ liệu." },
      { label: "Hàm và ngoại lệ", explanation: "Đầu vào không phải JSON hợp lệ phải báo ValueError." },
    ],
    workflow: [
      "In raw_json, đọc nó bằng json.loads và xem từng bản ghi để thấy các kiểu lỗi.",
      "Viết hàm phụ trả lời 'bản ghi này hợp lệ không?', thử với từng bản ghi trong ví dụ.",
      "Ghép vòng lặp chính, rồi tính từng số liệu của bản tóm tắt. Nộp bài và đọc tên các trường hợp chưa đạt để biết bạn bỏ sót quy tắc nào.",
    ],
    commonMistakes: [
      "Quên chuẩn hóa nhãn nên 'Cat' và 'cat' bị đếm riêng.",
      "Chấp nhận bản ghi trùng id, hoặc giữ bản sau thay vì bản đầu.",
      "Tính trung bình trên mọi bản ghi thay vì chỉ bản ghi hợp lệ, hoặc chia cho 0 khi không có bản ghi nào hợp lệ.",
    ],
  },
  "python-foundations.pf14": {
    title: "Bài học nhanh cho PF-14",
    summary:
      "NumPy là nền của hầu hết mã ML. Mảng ndarray lưu dữ liệu số cùng một kiểu trong bộ nhớ liền mạch, có số chiều (ndim), kích thước từng chiều (shape) và kiểu phần tử (dtype). Hiểu ba thuộc tính này giúp bạn đọc được shape lỗi trước khi nó thành lỗi chương trình.",
    library: "numpy (thường import bằng `import numpy as np`)",
    methods: ["np.array(data, dtype=...)", "a.ndim", "a.shape", "a.size", "a.dtype", "a[i, j]", "a[:, j]"],
    newTopics: [
      {
        label: "ndarray, ndim, shape, dtype",
        explanation:
          "`a.ndim` là số chiều, `a.shape` là tuple kích thước từng chiều, `a.size` là tổng số phần tử, `a.dtype` là kiểu phần tử (`str(a.dtype)` cho tên, ví dụ float64). Nên nêu dtype khi tạo mảng vì dtype mặc định của số nguyên có thể khác nhau giữa các nền tảng.",
        syntax: "a = np.array([[1, 2], [3, 4]], dtype=np.float64)\na.shape  # (2, 2)",
      },
      {
        label: "Chỉ số trên ndarray",
        explanation:
          "Dùng dấu phẩy để chỉ số theo từng chiều: `a[i, j]` là một phần tử. Dấu `:` ở một chiều nghĩa là lấy hết chiều đó, nên `a[:, j]` là cả cột j; `a[-1]` là hàng cuối.",
        syntax: "a[0, 1]\na[:, 0]\na[-1]",
      },
    ],
    reviewTopics: [
      { label: "Cắt lát", explanation: "Quy tắc start:stop giống list, áp dụng cho từng chiều." },
      { label: "Hàm trả về dictionary", explanation: "describe_array chỉ đóng gói các thuộc tính của mảng nhận vào." },
    ],
    workflow: [
      "In arr, arr.shape và arr.dtype để nhìn cấu trúc trước khi viết.",
      "Điền từng biến rồi in ra và đối chiếu với tab Dữ liệu.",
      "Với describe_array, thử gọi nó với một mảng 1 chiều tự tạo để chắc rằng nó không chỉ đúng cho mảng 2 chiều.",
    ],
    commonMistakes: [
      "Trả về `a.dtype` (một đối tượng) thay vì tên chuỗi của dtype.",
      "Trả về shape dưới dạng list thay vì tuple.",
      "Nhầm hàng với cột khi lấy `a[-1]` và `a[:, -1]`.",
    ],
  },
  "python-foundations.pf15": {
    title: "Bài học nhanh cho PF-15",
    summary:
      "Vector hóa là áp một phép toán lên cả mảng cùng lúc thay vì lặp từng phần tử: ngắn hơn và nhanh hơn nhiều. Mặt nạ Boolean chọn hoặc thay phần tử theo điều kiện, và phép toán theo axis gộp dữ liệu dọc một chiều. Bài này ghép cả ba.",
    library: "numpy (thường import bằng `import numpy as np`)",
    methods: ["a >= x", "mask & mask", "np.where(mask, a, b)", "a.sum(axis=...)", "np.maximum(a, b)", "np.argmax(a)"],
    newTopics: [
      {
        label: "Phép toán theo từng phần tử và mặt nạ Boolean",
        explanation:
          "Phép so sánh trên mảng cho mảng Boolean cùng shape (mặt nạ). Kết hợp điều kiện bằng `&` và `|`, mỗi vế đặt trong ngoặc đơn. `np.where(mask, a, b)` lấy phần tử của a nơi mask đúng và của b nơi sai. Các hàm này tạo mảng mới, không sửa mảng gốc.",
        syntax: "mask = (a >= 0) & (a <= 10)\nclean = np.where(mask, a, 0.0)",
      },
      {
        label: "Phép toán theo axis",
        explanation:
          "`a.sum(axis=1)` cộng các giá trị dọc theo axis 1, tức tính một tổng cho mỗi HÀNG của mảng 2 chiều; axis=0 cho một tổng mỗi cột. Chia hai mảng cùng shape là phép chia từng phần tử, và chia cho 0 sinh ra NaN hoặc inf thay vì lỗi.",
        syntax: "a.sum(axis=1)\nmask.sum(axis=0)",
      },
    ],
    reviewTopics: [
      { label: "ndarray và dtype", explanation: "Hàm nhận mảng float64 và phải trả về đúng shape, đúng dtype." },
      { label: "Hàm không sửa đối số", explanation: "Gán lên một phần của mảng đầu vào sẽ sửa luôn mảng của nơi gọi." },
    ],
    workflow: [
      "Xây mặt nạ hợp lệ trước và in ra để kiểm tra các đầu mút.",
      "Viết scale_valid và sensor_means dựa trên cùng mặt nạ đó, thử với một mảng nhỏ tự tạo, kể cả một hàng không có giá trị hợp lệ nào.",
      "Ghép lại để tính tổng số đo hợp lệ và cảm biến tốt nhất. Kết quả cuối phải là số nguyên Python thường.",
    ],
    commonMistakes: [
      "Dùng vòng lặp for thay vì phép toán trên cả mảng.",
      "Sửa trực tiếp mảng đầu vào bằng phép gán qua mặt nạ.",
      "Chia cho số lượng bằng 0 nên sinh NaN ở các hàng không có giá trị hợp lệ.",
    ],
  },
};

export const PYTHON_FOUNDATIONS_M9_QUICK_CHECKS: Readonly<Record<string, MissionQuickCheckDefinition>> = {
  "python-foundations.pf08": {
    question: "Với `items = [5, 6, 7, 8, 9]`, biểu thức `items[1:3]` cho kết quả nào?",
    options: ["[5, 6, 7]", "[6, 7]", "[6, 7, 8]", "[7, 8]"],
    correctOptionIndex: 1,
    explanation:
      "Lát cắt lấy từ chỉ số 1 đến chỉ số 2 vì chỉ số dừng 3 KHÔNG được lấy, nên kết quả là [6, 7].",
  },
  "python-foundations.pf09": {
    question: "Cấu trúc nào hợp nhất để loại các nhãn trùng nhau trong một list nhãn?",
    options: ["tuple", "set", "dictionary với giá trị None", "một vòng for không có điều kiện"],
    correctOptionIndex: 1,
    explanation:
      "Set chỉ giữ mỗi giá trị một lần. (Dictionary cũng loại trùng khóa, nhưng set diễn đạt đúng ý định hơn.) Tuple thì giữ nguyên mọi phần tử.",
  },
  "python-foundations.pf10": {
    question: "Biểu thức nào cho list các bình phương của những số dương trong `items`?",
    options: [
      "[x * x if x > 0 for x in items]",
      "[x * x for x in items if x > 0]",
      "{x * x for x in items if x > 0}",
      "[x * x in items if x > 0]",
    ],
    correctOptionIndex: 1,
    explanation:
      "Điều kiện lọc đặt SAU phần `for`: `[giá trị for x in items if điều_kiện]`. Dấu ngoặc nhọn tạo set hoặc dictionary, không phải list.",
  },
  "python-foundations.pf11": {
    question: "Hàm `def f(values)` đã đúng với ví dụ trong đề. Vì sao khi nộp bài nó vẫn có thể bị chấm sai?",
    options: [
      "Vì bài nộp luôn bị chấm khó hơn ví dụ",
      "Vì hàm được gọi thêm với các đầu vào khác ví dụ, kể cả trường hợp biên",
      "Vì Python chạy hàm hai lần",
      "Vì ví dụ trong đề luôn chứa lỗi",
    ],
    correctOptionIndex: 1,
    explanation:
      "Bài chấm hành vi của hàm: nó được gọi với nhiều bộ đối số. Một hàm chỉ đúng cho ví dụ (đặc biệt nếu viết cứng kết quả) sẽ sai ở các trường hợp khác.",
  },
  "python-foundations.pf12": {
    question: "Vì sao `except:` (không nêu loại lỗi) thường là lựa chọn tồi?",
    options: [
      "Vì nó chạy chậm hơn",
      "Vì nó cũng nuốt cả những lỗi lập trình không liên quan, làm lỗi khó tìm",
      "Vì Python không cho phép",
      "Vì nó chỉ bắt được ValueError",
    ],
    correctOptionIndex: 1,
    explanation:
      "Bắt cụ thể loại lỗi bạn đang chờ (ví dụ ValueError khi đổi kiểu) để các lỗi khác vẫn hiện ra và được sửa.",
  },
  "python-foundations.pf13": {
    question: "`json.loads(text)` được gọi với một chuỗi sai cú pháp JSON. Chuyện gì xảy ra?",
    options: [
      "Trả về None",
      "Trả về một list rỗng",
      "Báo `json.JSONDecodeError`, một loại ValueError",
      "Trả về chuỗi gốc",
    ],
    correctOptionIndex: 2,
    explanation:
      "Văn bản JSON sai cú pháp làm json.loads báo JSONDecodeError (lớp con của ValueError). Hàm của bạn nên để lỗi ValueError này lan ra, như đề yêu cầu.",
  },
  "python-foundations.pf14": {
    question: "Mảng `a` có shape (3, 4). `a[:, 1]` là gì?",
    options: ["Hàng thứ hai, 4 phần tử", "Cột thứ hai, 3 phần tử", "Phần tử ở hàng 1, cột 1", "Mảng 3×4 không đổi"],
    correctOptionIndex: 1,
    explanation:
      "Dấu `:` ở chiều đầu nghĩa là lấy hết các hàng, và `1` chọn cột có chỉ số 1 (cột thứ hai). Kết quả có 3 phần tử.",
  },
  "python-foundations.pf15": {
    question: "Mảng 2 chiều `a` có shape (4, 6). `a.sum(axis=1)` có shape nào?",
    options: ["(6,)", "(4,)", "(4, 6)", "một số duy nhất"],
    correctOptionIndex: 1,
    explanation:
      "axis=1 gộp các cột lại, để lại một giá trị cho mỗi hàng, nên có 4 phần tử: shape (4,). axis=0 mới cho shape (6,).",
  },
};
