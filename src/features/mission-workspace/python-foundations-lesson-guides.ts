import type { MissionLessonGuide, MissionQuickCheckDefinition } from "./mission-lesson-guides";

/**
 * The "Bài học nhanh" cards and quick checks of the Python Foundations missions
 * (PHASE-06 / M8). Same shape and same panel as the CS116 guides; the lookup lives in
 * mission-lesson-guides.ts. Examples use neutral names (a, b, items, ...) on purpose: a
 * guide teaches the construct, it never contains a line of a mission's solution.
 */

export const PYTHON_FOUNDATIONS_LESSON_GUIDES: Readonly<Record<string, MissionLessonGuide>> = {
  "python-foundations.pf01": {
    title: "Bài học nhanh cho PF-01",
    summary:
      "Biến là một cái tên gắn với một giá trị. Trong xử lý ảnh, chiều rộng, chiều cao và số kênh màu là những con số nền tảng: từ chúng suy ra số pixel và lượng dữ liệu mà mô hình phải đọc.",
    library: "Python chuẩn — không cần import",
    methods: ["a * b", "a / b", "a // b", "type(x)"],
    newTopics: [
      {
        label: "Biến và phép gán",
        explanation:
          "Dấu `=` gán kết quả của vế phải cho tên biến ở vế trái. Biến có thể dùng lại trong các phép tính sau.",
        syntax: "total = a * b\ndouble = total * 2",
      },
      {
        label: "int, float và hai kiểu chia",
        explanation:
          "`/` luôn cho số thực (float), kể cả khi chia hết. `//` chia lấy phần nguyên, làm tròn xuống, và cho int khi hai vế là int. `type(x)` cho biết kiểu hiện tại.",
        syntax: "7 / 2   # 3.5\n7 // 2  # 3",
      },
    ],
    workflow: [
      "Đọc tab Dữ liệu để biết những biến nào đã có sẵn và kiểu của chúng.",
      "Với mỗi biến cần tính, viết một biểu thức từ các biến có sẵn rồi dùng Chạy thử để in giá trị ra xem.",
      "Kiểm tra cả kiểu của kết quả: bài chấm cả giá trị lẫn việc nó là int hay float.",
    ],
    commonMistakes: [
      "Dùng `/` khi cần số nguyên, hoặc `//` khi cần số thực.",
      "Quên một thừa số (ví dụ số kênh màu) khi đếm tổng số giá trị.",
      "Đảo vế trong phép chia nên được tỉ lệ ngược.",
    ],
  },
  "python-foundations.pf02": {
    title: "Bài học nhanh cho PF-02",
    summary:
      "Mô hình phân loại trả về độ tin cậy; chương trình quyết định hành động bằng cách so sánh nó với ngưỡng. So sánh cho ra giá trị Boolean, và if / elif / else chọn nhánh mã tương ứng.",
    library: "Python chuẩn — không cần import",
    methods: ["a >= b", "if / elif / else", "True / False"],
    newTopics: [
      {
        label: "Biểu thức Boolean",
        explanation:
          "Phép so sánh như `>=`, `>`, `==` cho ra True hoặc False. Kết quả đó là một giá trị bình thường: gán vào biến được.",
        syntax: "passed = score >= limit",
      },
      {
        label: "if / elif / else",
        explanation:
          "Python kiểm tra các điều kiện từ trên xuống và chạy nhánh đầu tiên đúng; `else` là nhánh còn lại. Thứ tự các nhánh vì thế quan trọng. Thân mỗi nhánh thụt vào một cấp.",
        syntax: 'if x >= a:\n    name = "A"\nelif x >= b:\n    name = "B"\nelse:\n    name = "C"',
      },
    ],
    workflow: [
      "Đọc quy tắc và xác định nhánh nào cần kiểm tra trước.",
      "Chú ý các giá trị đúng bằng ngưỡng: quy tắc nói 'đạt' (bao gồm bằng) hay 'vượt' (không bao gồm)?",
      "Khi cùng một quy tắc phải áp dụng cho một giá trị khác, hãy chép lại từng nhánh cẩn thận thay vì viết theo trí nhớ.",
    ],
    commonMistakes: [
      "Dùng `>` thay `>=` nên giá trị đúng bằng ngưỡng bị gắn sai nhãn.",
      "Kiểm tra ngưỡng thấp trước ngưỡng cao nên mọi giá trị đều rơi vào nhánh đầu.",
      "Gán chuỗi \"True\" thay vì giá trị Boolean True.",
    ],
  },
  "python-foundations.pf03": {
    title: "Bài học nhanh cho PF-03",
    summary:
      "Dữ liệu đọc từ file hay từ người dùng thường là chuỗi, dù trông giống số. Python không tự đổi kiểu: phải chuyển rõ ràng. Debug là đọc thông báo lỗi, đoán nguyên nhân, sửa một chỗ rồi chạy lại.",
    library: "Python chuẩn — không cần import",
    methods: ["int(text)", "float(text)", "type(x)", "print(...)"],
    newTopics: [
      {
        label: "Chuyển đổi kiểu",
        explanation:
          "`int(\"42\")` cho số nguyên 42, `float(\"4.5\")` cho số thực 4.5. Phép toán giữa hai chuỗi không phải phép toán giữa hai số: `\"3\" + \"4\"` ghép chuỗi, còn nhân hai chuỗi gây lỗi.",
        syntax: 'n = int("42")\nprint(type(n))',
      },
      {
        label: "Đọc thông báo lỗi",
        explanation:
          "Dòng cuối của lỗi nói rõ loại lỗi (ví dụ TypeError) và điều gì sai. Có thể có nhiều lỗi nối tiếp nhau: sau mỗi lần sửa, chạy lại và đọc kết quả mới.",
      },
    ],
    reviewTopics: [
      {
        label: "if / else và so sánh",
        explanation:
          "Một nhánh sai vẫn chạy được nhưng cho kết quả ngược. Hãy tự hỏi: với dữ liệu này, nhãn đúng phải là gì, và đoạn mã đang in ra gì?",
      },
    ],
    workflow: [
      "Chạy thử đoạn mã gốc và đọc thông báo lỗi.",
      "Sửa đúng chỗ gây lỗi, chạy lại, rồi so kết quả in ra với quy tắc trong đề.",
      "Tránh viết lại từ đầu: sửa ít nhất có thể để hiểu từng lỗi.",
    ],
    commonMistakes: [
      "Dùng `float()` ở chỗ yêu cầu số nguyên.",
      "Chỉ sửa lỗi kiểu mà bỏ qua nhánh so sánh bị ngược.",
    ],
  },
  "python-foundations.pf04": {
    title: "Bài học nhanh cho PF-04",
    summary:
      "Dữ liệu cảm biến thật luôn có giá trị lỗi. Tiền xử lý đầu tiên của hầu hết dự án ML là duyệt từng phần tử, giữ phần hợp lệ và đếm phần bị loại. List và vòng lặp for là công cụ cho việc đó.",
    library: "Python chuẩn — không cần import",
    methods: ["for x in items:", "items.append(x)", "a <= x <= b", "total += x"],
    newTopics: [
      {
        label: "list và vòng lặp for",
        explanation:
          "List giữ nhiều giá trị theo thứ tự. `for x in items:` chạy phần thân một lần cho mỗi phần tử, với x là phần tử hiện tại.",
        syntax: "kept = []\nfor x in items:\n    kept.append(x)",
      },
      {
        label: "Kiểm tra đoạn và cộng dồn",
        explanation:
          "Python cho phép viết `a <= x <= b` để kiểm tra x nằm trong đoạn, tính cả hai đầu mút. `total += x` là cách viết gọn của `total = total + x`.",
        syntax: "count = 0\nfor x in items:\n    if a <= x <= b:\n        count += 1",
      },
    ],
    reviewTopics: [
      {
        label: "if / else",
        explanation: "Mỗi phần tử rơi vào đúng một nhánh: hợp lệ hoặc không hợp lệ.",
      },
    ],
    workflow: [
      "Khai báo kết quả ban đầu (list rỗng, các bộ đếm bằng 0) trước vòng lặp.",
      "Trong vòng lặp, một điều kiện duy nhất quyết định phần tử được giữ hay bị loại.",
      "Sau khi chạy, in kết quả ra và đối chiếu với dữ liệu ở tab Dữ liệu, đặc biệt các giá trị sát hai đầu của đoạn hợp lệ.",
    ],
    commonMistakes: [
      "Dùng `<` thay `<=` nên bỏ mất giá trị nằm đúng ở đầu mút của đoạn.",
      "Cập nhật bộ đếm hay tổng ngoài nhánh điều kiện.",
      "Sắp xếp lại dữ liệu trong khi đề yêu cầu giữ nguyên thứ tự.",
    ],
  },
  "python-foundations.pf05": {
    title: "Bài học nhanh cho PF-05",
    summary:
      "Hàm đóng gói một phép tính để dùng lại cho nhiều dữ liệu. Trung bình là phép tổng hợp phổ biến nhất trong dữ liệu; viết hàm đúng cho cả trường hợp biên (list rỗng) là thói quen quan trọng.",
    library: "Python chuẩn — không cần import (không dùng NumPy)",
    methods: ["def name(args):", "return", "sum(items)", "len(items)"],
    newTopics: [
      {
        label: "def và return",
        explanation:
          "`def` định nghĩa hàm với các tham số. Giá trị mà hàm gửi ra ngoài là giá trị sau `return`. `print` chỉ hiện chữ trên màn hình; nó không đưa giá trị cho nơi gọi hàm.",
        syntax: "def double(x):\n    return x * 2\n\nresult = double(21)",
      },
      {
        label: "Trường hợp biên",
        explanation:
          "Phép chia cho 0 gây lỗi. Với list rỗng, `len(items)` bằng 0, vì vậy cần một nhánh `if` xử lý riêng theo quy ước của đề trước khi chia.",
      },
    ],
    reviewTopics: [
      {
        label: "Kiểu của kết quả",
        explanation: "Bài chấm cả kiểu: kết quả của phép chia thường (`/`) là float, kể cả khi chia hết.",
      },
    ],
    workflow: [
      "Viết thân hàm trước, gọi thử với một list nhỏ do bạn tự đặt để kiểm tra bằng mắt.",
      "Xử lý list rỗng bằng nhánh riêng theo quy ước trong đề.",
      "Chạy lại toàn bộ để ba biến kết quả phía dưới nhận giá trị từ hàm của bạn.",
    ],
    commonMistakes: [
      "Dùng `print` thay `return` nên hàm trả về None.",
      "Chia cho một số cố định thay vì số phần tử của list.",
      "Quên list rỗng nên gặp ZeroDivisionError, hoặc trả về số nguyên 0 thay vì 0.0.",
    ],
  },
  "python-foundations.pf06": {
    title: "Bài học nhanh cho PF-06",
    summary:
      "Chuẩn hóa là bước tiền xử lý quen thuộc: đưa giá trị về cùng một thang đo, ví dụ từ 0–255 về 0–1. Bài này ghép list, vòng lặp, điều kiện và hàm trong một bối cảnh mới.",
    library: "Python chuẩn — không cần import (không dùng NumPy)",
    methods: ["def name(a, b):", "for x in items:", "if lo <= x <= hi:", "items.append(...)"],
    newTopics: [
      {
        label: "Hàm nhận nhiều tham số",
        explanation:
          "Tham số giúp cùng một hàm dùng cho nhiều dữ liệu và nhiều thang đo khác nhau. Đừng viết cứng một con số khi đã có tham số mang đúng ý nghĩa đó.",
        syntax: "def scale(items, factor):\n    out = []\n    for x in items:\n        out.append(x * factor)\n    return out",
      },
    ],
    reviewTopics: [
      { label: "Lọc bằng vòng lặp", explanation: "Chỉ phần tử thỏa điều kiện mới được tính và thêm vào list kết quả." },
      { label: "Đoạn hợp lệ", explanation: "Giá trị đúng ở hai đầu mút vẫn hợp lệ." },
    ],
    workflow: [
      "Phân tách rõ ba việc: duyệt, quyết định giữ hay bỏ, tính giá trị mới.",
      "Dùng tham số của hàm thay cho các hằng số cụ thể trong ví dụ.",
      "Thử hàm với list toàn giá trị lỗi: kết quả phải là list rỗng.",
    ],
    commonMistakes: [
      "Viết cứng một giá trị tối đa nên hàng 10-bit bị chuẩn hóa sai.",
      "Quên `return`, hoặc trả về chưa phải list.",
      "Không kiểm tra giá trị lỗi trước khi chia.",
    ],
  },
  "python-foundations.pf07": {
    title: "Bài học nhanh cho PF-07",
    summary:
      "Pipeline tiền xử lý nhỏ ghép mọi thứ đã học: lọc giá trị lỗi, gắn nhãn bằng một hàm, đếm theo nhãn và tính một thống kê tổng hợp. Chia nhỏ từng bước và kiểm tra bằng cách in ra là cách làm việc thật của kỹ sư dữ liệu.",
    library: "Python chuẩn — không cần import (không dùng NumPy)",
    methods: ["def", "for / if / elif / else", "list.append", "sum, len"],
    newTopics: [],
    reviewTopics: [
      { label: "Hàm trả giá trị", explanation: "Hàm gắn nhãn chỉ nhận đầu vào và `return` một chuỗi; vòng lặp bên ngoài dùng kết quả đó." },
      { label: "Lọc và đếm", explanation: "Mỗi phần tử hợp lệ được thêm vào hai list song song và tăng đúng một bộ đếm." },
      { label: "Trung bình an toàn", explanation: "Tính sau vòng lặp, và chỉ chia khi list không rỗng." },
    ],
    workflow: [
      "Hoàn thiện hàm gắn nhãn trước và thử nó với vài giá trị tự chọn, kể cả đúng bằng các ngưỡng.",
      "Viết vòng lặp: lọc giá trị hợp lệ, gắn nhãn, thêm vào hai list và tăng bộ đếm tương ứng.",
      "Tính giá trị trung bình sau vòng lặp rồi in toàn bộ để kiểm tra từng đầu ra.",
    ],
    commonMistakes: [
      "Đếm hoặc gắn nhãn cả những giá trị không hợp lệ.",
      "Tính trung bình trên danh sách gốc thay vì danh sách đã lọc.",
      "So sánh ngưỡng bằng `>` thay `>=`.",
    ],
  },
};

export const PYTHON_FOUNDATIONS_QUICK_CHECKS: Readonly<Record<string, MissionQuickCheckDefinition>> = {
  "python-foundations.pf01": {
    question: "Biểu thức `9 // 2` cho kết quả nào?",
    options: ["4.5", "4", "5", "4.0"],
    correctOptionIndex: 1,
    explanation:
      "`//` chia lấy phần nguyên và làm tròn xuống, nên 9 // 2 là số nguyên 4. Còn 9 / 2 cho số thực 4.5.",
  },
  "python-foundations.pf02": {
    question: "Quy tắc: 'đạt khi điểm đạt ngưỡng 80'. Điểm đúng bằng 80 thì sao?",
    options: [
      "Chưa đạt, vì chưa vượt 80",
      "Đạt, vì 'đạt ngưỡng' bao gồm cả giá trị bằng ngưỡng",
      "Tùy lúc, Python chọn ngẫu nhiên",
      "Gây lỗi chương trình",
    ],
    correctOptionIndex: 1,
    explanation:
      "'Đạt ngưỡng' nghĩa là lớn hơn hoặc bằng, tức `score >= 80`. Dùng `>` sẽ bỏ sót đúng giá trị nằm ở ngưỡng.",
  },
  "python-foundations.pf04": {
    question: "Để thêm giá trị x vào cuối một list tên `kept`, bạn viết gì?",
    options: ["kept = x", "kept.append(x)", "kept + x", "append(kept)"],
    correctOptionIndex: 1,
    explanation:
      "`kept.append(x)` sửa trực tiếp list `kept` bằng cách thêm x vào cuối. `kept = x` sẽ thay cả list bằng x.",
  },
  "python-foundations.pf05": {
    question: "Hàm `def f(x): print(x * 2)` được gọi bằng `y = f(5)`. Giá trị của y là gì?",
    options: ["10", "None", "5", "Gây lỗi"],
    correctOptionIndex: 1,
    explanation:
      "Hàm chỉ in 10 ra màn hình và không có `return`, nên Python trả về None. Muốn y bằng 10 phải dùng `return x * 2`.",
  },
};
