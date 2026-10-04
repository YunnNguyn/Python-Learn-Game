export interface MissionLessonTopic {
  readonly label: string;
  readonly explanation: string;
  readonly syntax?: string;
}

export interface MissionLessonGuide {
  readonly title: string;
  readonly summary: string;
  readonly library: string;
  readonly methods: readonly string[];
  readonly newTopics: readonly MissionLessonTopic[];
  readonly reviewTopics?: readonly MissionLessonTopic[];
  readonly workflow: readonly string[];
  readonly commonMistakes?: readonly string[];
}

const GUIDES: Readonly<Record<string, MissionLessonGuide>> = {
  "cs116.numpy.vs01": {
    title: "Bài học nhanh cho VS-01",
    summary: "Bài này giới thiệu cách biến list Python thành NumPy ndarray, sau đó đọc shape và số chiều của mảng.",
    library: "numpy (thường import bằng `import numpy as np`)",
    methods: ["np.array(...)", "result.shape", "result.ndim"],
    newTopics: [
      {
        label: "Tạo ndarray bằng np.array(...) ",
        explanation: "Dùng khi bạn có list hoặc ma trận Python và muốn chuyển sang kiểu NumPy để tiếp tục xử lý.",
        syntax: "result = np.array(matrix)",
      },
      {
        label: "Đọc kích thước bằng .shape",
        explanation: "Thuộc tính này trả về tuple mô tả số hàng, số cột hoặc nhiều chiều hơn của mảng.",
        syntax: "shape_result = result.shape",
      },
      {
        label: "Đọc số chiều bằng .ndim",
        explanation: "Thuộc tính này cho biết mảng đang có bao nhiêu chiều dữ liệu.",
        syntax: "ndim_result = result.ndim",
      },
    ],
    workflow: [
      "Xác định biến dữ liệu đầu vào đã được nạp sẵn trong đề.",
      "Tạo ndarray trước, rồi mới đọc shape và ndim từ chính biến ndarray đó.",
      "Khi đề yêu cầu lưu vào biến nào thì gán đúng tên biến đó.",
    ],
    commonMistakes: [
      "Quên dùng np.array(...) nên result vẫn là list Python.",
      "Đọc shape từ matrix thay vì từ result.",
      "Gõ sai tên biến mà grader đang quan sát.",
    ],
  },
  "cs116.numpy.vs02": {
    title: "Bài học nhanh cho VS-02",
    summary: "Bài này chủ yếu ôn lại cách đọc cấu trúc của ndarray. Không có công cụ mới, mục tiêu là tự làm gọn hơn và chính xác hơn.",
    library: "numpy",
    methods: [".shape", ".ndim"],
    newTopics: [],
    reviewTopics: [
      {
        label: "shape",
        explanation: "Dùng để đọc kích thước của mảng theo từng chiều.",
        syntax: "shape_result = result.shape",
      },
      {
        label: "ndim",
        explanation: "Dùng để biết tổng số chiều của mảng.",
        syntax: "ndim_result = result.ndim",
      },
    ],
    workflow: [
      "Nhìn dữ liệu đầu vào, xác định biến nào đã là ndarray và biến nào còn là list.",
      "Nếu đề cần shape và ndim, hãy lấy trực tiếp từ ndarray mục tiêu.",
      "Giữ lời giải ngắn gọn: tạo đủ biến mà đề yêu cầu, không cần làm thêm.",
    ],
  },
  "cs116.numpy.vs03": {
    title: "Bài học nhanh cho VS-03",
    summary: "Bài này giới thiệu cách trích xuất một cột từ ma trận NumPy bằng indexing theo hàng và cột.",
    library: "numpy",
    methods: ["np.array(...)", "result[:, column_index]", ".shape"],
    newTopics: [
      {
        label: "Column indexing",
        explanation: "Dùng cú pháp `:` để lấy tất cả hàng, rồi chỉ định cột cần lấy ở vị trí thứ hai.",
        syntax: "result = matrix[:, target_column_index]",
      },
    ],
    reviewTopics: [
      {
        label: "shape",
        explanation: "Sau khi trích cột, bạn vẫn có thể kiểm tra shape để xác nhận kết quả là vector 1 chiều hay cột 2 chiều.",
        syntax: "shape_result = result.shape",
      },
    ],
    workflow: [
      "Đảm bảo dữ liệu nguồn là ndarray trước khi dùng cú pháp `[:, ...]`.",
      "Xác định chỉ số cột mà đề đã cấp sẵn.",
      "Nếu đề yêu cầu thêm biến phụ như shape_result, hãy lưu tiếp sau khi trích cột xong.",
    ],
    commonMistakes: [
      "Viết `result = matrix[target_column_index]` nên lấy nhầm hàng thay vì cột.",
      "Dùng list Python nên báo lỗi kiểu `list object has no attribute` hoặc indexing không đúng kiểu NumPy.",
    ],
  },
  "cs116.numpy.vs04": {
    title: "Bài học nhanh cho VS-04",
    summary: "Bài này giới thiệu so sánh mảng và boolean mask để lọc các phần tử hoặc hàng thỏa điều kiện.",
    library: "numpy",
    methods: [">, <, >=, <=", "mask = values > threshold", "result = values[mask]"],
    newTopics: [
      {
        label: "So sánh phần tử",
        explanation: "Khi so sánh ndarray với một ngưỡng, NumPy sẽ trả về một mảng bool cùng kích thước.",
        syntax: "mask = values > threshold",
      },
      {
        label: "Boolean mask",
        explanation: "Dùng mảng bool để chọn ra các phần tử hoặc hàng thỏa điều kiện.",
        syntax: "result = values[mask]",
      },
    ],
    workflow: [
      "Tạo mask trước để nhìn rõ logic đang lọc theo điều kiện nào.",
      "Sau đó dùng mask để lấy kết quả cuối cùng.",
      "Nếu bài yêu cầu thêm biến mask thì nhớ lưu lại thay vì viết gộp hết vào một dòng.",
    ],
  },
  "cs116.numpy.vs05": {
    title: "Bài học nhanh cho VS-05",
    summary: "Bài này ôn lại boolean mask trong bối cảnh khác. Không có khái niệm mới, trọng tâm là tự chọn đúng cột/đúng biến rồi áp điều kiện chuẩn.",
    library: "numpy",
    methods: ["comparison -> mask -> indexing"],
    newTopics: [],
    reviewTopics: [
      {
        label: "Boolean mask",
        explanation: "Tạo từ phép so sánh rồi dùng làm chỉ mục để lọc dữ liệu.",
        syntax: "mask = values >= threshold\nresult = values[mask]",
      },
    ],
    workflow: [
      "Đọc kỹ dữ liệu đầu vào để biết điều kiện đang áp lên mảng nào.",
      "Kiểm tra lại chiều của kết quả: lọc phần tử sẽ khác trích cột hoặc trích hàng.",
    ],
  },
  "cs116.numpy.vs06": {
    title: "Bài học nhanh cho VS-06",
    summary: "Bài này kết hợp nhiều kỹ thuật: trích cột, so sánh theo ngưỡng, rồi ghép nhiều điều kiện để lọc ra những hàng nguy hiểm.",
    library: "numpy",
    methods: ["matrix[:, idx]", "mask_left & mask_right", "result = matrix[combined_mask]"],
    newTopics: [
      {
        label: "Ghép điều kiện bằng toán tử &",
        explanation: "Khi có hai mảng bool cùng kích thước, dùng `&` để giữ lại những vị trí cùng đúng. Mỗi điều kiện con nên đặt trong ngoặc đơn.",
        syntax: "combined_mask = (a > limit_a) & (b < limit_b)",
      },
      {
        label: "Lọc hàng của ma trận bằng mask",
        explanation: "Nếu mask có độ dài bằng số hàng, bạn có thể dùng nó để chọn các hàng tương ứng trong ma trận gốc.",
        syntax: "result = contact_matrix[combined_mask]",
      },
    ],
    reviewTopics: [
      {
        label: "Trích cột",
        explanation: "Lấy từng cột cần thiết trước khi tạo điều kiện.",
        syntax: "distance_column = contact_matrix[:, distance_idx]",
      },
      {
        label: "So sánh theo ngưỡng",
        explanation: "Mỗi điều kiện thường được xây riêng để dễ debug.",
        syntax: "distance_mask = distance_column <= threshold",
      },
    ],
    workflow: [
      "Từ ma trận gốc, trích các cột cần kiểm tra.",
      "Tạo từng điều kiện riêng thành các mask nhỏ.",
      "Ghép các mask bằng `&`, rồi dùng mask cuối để lọc ra hàng thỏa tất cả điều kiện.",
    ],
    commonMistakes: [
      "Quên ngoặc quanh từng điều kiện khi dùng `&`.",
      "Áp mask lên sai biến, ví dụ lọc cột thay vì lọc cả ma trận gốc.",
      "So sánh với sai cột do nhầm chỉ số cột hoặc tên biến.",
    ],
  },
  "cs116.numpy.vs07": {
    title: "Bài học nhanh cho VS-07",
    summary: "Đây là bài ôn tập hỗn hợp. Hãy xác định trước bài đang yêu cầu dạng thao tác nào: tạo ndarray, đọc shape, trích cột, hay lọc bằng điều kiện.",
    library: "numpy",
    methods: ["np.array(...)", ".shape", ".ndim", "[:, idx]", "masking"],
    newTopics: [],
    reviewTopics: [
      {
        label: "Tạo ndarray và đọc cấu trúc",
        explanation: "Kiểm tra xem nhiệm vụ đang muốn tạo mảng hay chỉ thao tác trên mảng đã có sẵn.",
      },
      {
        label: "Indexing và filtering",
        explanation: "Phân biệt giữa việc lấy cột cụ thể và việc lọc hàng/phần tử theo điều kiện.",
      },
    ],
    workflow: [
      "Đọc đề để xác định nhóm kỹ năng đang bị kiểm tra.",
      "Chọn đúng mẫu lời giải quen thuộc tương ứng với nhóm đó.",
      "Cuối cùng rà lại tên biến và kiểu dữ liệu đầu ra.",
    ],
  },
  "cs116.local.numpy.lc01": {
    title: "Bài học nhanh cho LC-01",
    summary: "Không có cú pháp NumPy mới. Điểm mới là cùng một main.py giờ được chạy bằng Python cài trên máy của bạn thay vì Pyodide trong trình duyệt.",
    library: "numpy trên Local Python",
    methods: ["import numpy as np", "np.array(...)", "[:, idx]"],
    newTopics: [
      {
        label: "Local Python runtime",
        explanation: "Các bài Data/ML nặng sẽ chạy trong child process bằng Python thật trên máy. Nhờ đó code có thể dùng package native, CPU/RAM và về sau là GPU khi framework hỗ trợ.",
      },
      {
        label: "main.py",
        explanation: "IDE vẫn giữ workflow một file. Run/Submit gửi nội dung editor vào workspace local dưới tên main.py; lỗi Python vì vậy vẫn báo đúng dòng trong file này.",
      },
    ],
    reviewTopics: [
      {
        label: "Trích cột NumPy",
        explanation: "Bài này cố ý dùng lại kỹ năng đã học để bạn chỉ phải chú ý tới runtime mới.",
        syntax: "result = telemetry[:, targetColumnIndex]",
      },
    ],
    workflow: [
      "Đảm bảo Local Python Runtime đang chạy trước khi mở bài.",
      "Dùng dữ liệu matrix và targetColumnIndex đã được nạp sẵn như ở các mission trước.",
      "Chạy thử để kiểm tra, sau đó Submit để grader quan sát result trên môi trường local sạch.",
      "Nếu code chạy lâu hoặc mắc vòng lặp, dùng Dừng tiến trình; ứng dụng và runtime service vẫn tiếp tục sống.",
    ],
    commonMistakes: [
      "Local runtime chưa được khởi động nên bài không thể tạo session.",
      "Python local chưa cài NumPy nên import báo ModuleNotFoundError.",
      "Nhầm lấy một hàng thay vì toàn bộ cột với cú pháp [:, index].",
    ],
  },
};

export function getMissionLessonGuide(activityId: string): MissionLessonGuide | null {
  return GUIDES[activityId] ?? null;
}

export interface MissionQuickCheckDefinition {
  readonly question: string;
  readonly options: readonly string[];
  readonly correctOptionIndex: number;
  readonly explanation: string;
}

const QUICK_CHECKS: Readonly<Record<string, MissionQuickCheckDefinition>> = {
  "cs116.numpy.vs01": {
    question: "Nếu `matrix` đang là list Python, cách phù hợp nhất để tạo NumPy ndarray là gì?",
    options: ["result = matrix", "result = np.array(matrix)", "result = matrix.shape", "result = np.shape"],
    correctOptionIndex: 1,
    explanation: "`np.array(matrix)` tạo ndarray mới từ dữ liệu list. Chỉ gán `result = matrix` thì kiểu dữ liệu vẫn là list.",
  },
  "cs116.numpy.vs02": {
    question: "Thuộc tính nào cho biết số chiều của một ndarray?",
    options: [".shape", ".ndim", ".size", ".dtype"],
    correctOptionIndex: 1,
    explanation: "`.ndim` trả về số chiều, còn `.shape` trả về kích thước của từng chiều.",
  },
  "cs116.numpy.vs03": {
    question: "Cú pháp nào lấy toàn bộ hàng của cột thứ 2 (index 1) trong ndarray 2 chiều `matrix`?",
    options: ["matrix[1]", "matrix[:, 1]", "matrix[1, :]", "matrix[:1]"],
    correctOptionIndex: 1,
    explanation: "Dấu `:` ở vị trí hàng nghĩa là lấy tất cả hàng; `1` ở vị trí cột chọn cột index 1.",
  },
  "cs116.numpy.vs04": {
    question: "Biểu thức `values > threshold` với `values` là ndarray sẽ tạo ra gì?",
    options: ["Một số duy nhất", "Một list string", "Một mảng boolean cùng cấu trúc", "Một lỗi Python"],
    correctOptionIndex: 2,
    explanation: "NumPy thực hiện so sánh theo từng phần tử và trả về boolean mask.",
  },
  "cs116.numpy.vs05": {
    question: "Sau khi đã có `mask`, cách thường dùng để lọc `values` là gì?",
    options: ["values(mask)", "values[mask]", "mask[values]", "values.mask"],
    correctOptionIndex: 1,
    explanation: "Boolean mask được dùng trực tiếp trong cú pháp indexing: `values[mask]`.",
  },
  "cs116.numpy.vs06": {
    question: "Khi ghép hai điều kiện boolean NumPy theo kiểu cả hai cùng đúng, nên dùng biểu thức nào?",
    options: ["condition_a and condition_b", "condition_a & condition_b", "condition_a + condition_b", "condition_a == condition_b"],
    correctOptionIndex: 1,
    explanation: "Với ndarray boolean, dùng toán tử phần tử `&`. Mỗi phép so sánh nên đặt trong ngoặc khi viết cùng một biểu thức.",
  },
  "cs116.numpy.vs07": {
    question: "Khi gặp bài tổng hợp, bước đầu tiên nên làm gì?",
    options: ["Viết ngay một dòng code thật dài", "Xác định đề đang kiểm tra thao tác nào", "Mở H4 trước", "Đổi toàn bộ dữ liệu thành list"],
    correctOptionIndex: 1,
    explanation: "Nhận diện nhóm kỹ năng trước giúp bạn chọn đúng mẫu thao tác: tạo ndarray, đọc shape, indexing hay filtering.",
  },
  "cs116.local.numpy.lc01": {
    question: "Điểm khác quan trọng nhất của Local Python so với Pyodide trong app là gì?",
    options: [
      "Local Python chỉ chạy được print",
      "Local Python dùng Python và tài nguyên thật trên máy",
      "Local Python không thể dùng NumPy",
      "Local Python bắt buộc phải viết notebook",
    ],
    correctOptionIndex: 1,
    explanation: "Local Python chạy learner code trong child process của Python cài trên máy, nên có thể dùng package native và tài nguyên local; notebook không phải yêu cầu.",
  },
};

export function getMissionQuickCheck(activityId: string): MissionQuickCheckDefinition | null {
  return QUICK_CHECKS[activityId] ?? null;
}
