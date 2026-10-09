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
  "cs116.local.pandas.lc02": {
    title: "Bài học nhanh cho LC-02",
    summary: "Bài này giới thiệu bước đầu tiên với pandas: đọc CSV thành DataFrame rồi quan sát cấu trúc bảng.",
    library: "pandas",
    methods: ["import pandas as pd", "pd.read_csv(...)", "df.shape", "list(df.columns)"],
    newTopics: [
      {
        label: "DataFrame",
        explanation: "DataFrame là cấu trúc bảng 2 chiều của pandas, gồm hàng và các cột có tên.",
      },
      {
        label: "Đọc CSV",
        explanation: "pd.read_csv đọc file CSV và tạo DataFrame.",
        syntax: "df = pd.read_csv(\"data/telemetry.csv\")",
      },
    ],
    workflow: [
      "Đọc dataset vào df.",
      "Dùng df.shape để xem số hàng/cột.",
      "Dùng list(df.columns) để lấy tên cột thành list Python.",
    ],
  },
  "cs116.local.pandas.lc03": {
    title: "Bài học nhanh cho LC-03",
    summary: "Bài này phân biệt hai kiểu kết quả rất hay gặp khi chọn cột trong pandas: Series và DataFrame một cột.",
    library: "pandas",
    methods: ["df[\"distance\"]", "df[[\"distance\"]]", ".tolist()", ".ndim", ".shape"],
    newTopics: [
      {
        label: "Series",
        explanation: "Chọn một cột bằng chuỗi tên cột trả về Series 1 chiều.",
        syntax: "distance_series = df[\"distance\"]",
      },
      {
        label: "DataFrame một cột",
        explanation: "Chọn bằng list tên cột giữ kết quả là DataFrame 2 chiều.",
        syntax: "distance_frame = df[[\"distance\"]]",
      },
    ],
    workflow: [
      "Đọc CSV vào df.",
      "Tạo cả distance_series và distance_frame.",
      "So sánh ndim/shape để hiểu khác biệt 1D và 2D.",
    ],
    commonMistakes: [
      "Nhầm df[\"distance\"] và df[[\"distance\"]] là hoàn toàn giống nhau.",
      "Dùng .tolist() trên DataFrame thay vì trên Series.",
    ],
  },
  "cs116.local.pandas.lc04": {
    title: "Bài học nhanh cho LC-04",
    summary: "Bài này chuyển boolean filtering đã học ở NumPy sang pandas: tạo điều kiện từ một cột rồi dùng điều kiện đó để lọc các hàng.",
    library: "pandas",
    methods: ["df[\"threat\"] >= threshold", "df[condition]", ".tolist()", "len(...)"],
    newTopics: [
      {
        label: "Boolean filtering trên DataFrame",
        explanation: "Phép so sánh trên một Series tạo Series boolean; dùng Series đó trong df[...] để giữ các hàng thỏa điều kiện.",
        syntax: "filtered = df[df[\"threat\"] >= threshold]",
      },
    ],
    reviewTopics: [
      {
        label: "Tư duy boolean mask",
        explanation: "Logic giống NumPy: tạo điều kiện trước, sau đó dùng điều kiện để chọn dữ liệu.",
      },
    ],
    workflow: [
      "Tạo điều kiện threat >= threshold.",
      "Lọc df bằng điều kiện đó.",
      "Lấy cột contact_id và chuyển sang list Python.",
      "Đếm số hàng đã lọc bằng len(filtered).",
    ],
  },
  "cs116.local.pandas.lc05": {
    title: "Bài học nhanh cho LC-05",
    summary: "CS116 (Bài 2B): missing values được phát hiện và điền bằng fillna trước khi dữ liệu đi tiếp vào pipeline.",
    library: "pandas",
    methods: ["Series.isna()", "Series.sum()", "Series.median()", "Series.fillna(...)"],
    newTopics: [
      {
        label: "Missing value",
        explanation: "Giá trị thiếu thường được pandas biểu diễn bằng NaN. isna() tạo mask boolean để bạn nhìn thấy vị trí thiếu.",
      },
      {
        label: "Imputation đơn giản",
        explanation: "fillna(value) thay các vị trí thiếu bằng một giá trị. Bài này dùng median của chính cột signal để minh họa.",
        syntax: "clean_signal = df[\"signal\"].fillna(df[\"signal\"].median())",
      },
    ],
    workflow: [
      "Đếm missing trước khi xử lý.",
      "Tính median của cột signal.",
      "Tạo Series clean_signal bằng fillna.",
      "Đếm lại missing và chuyển kết quả thành list để kiểm tra.",
    ],
    commonMistakes: [
      "Điền dữ liệu nhưng không kiểm tra số missing trước/sau.",
      "Gọi fillna nhưng bỏ quên giá trị trả về khi không dùng inplace.",
    ],
  },
  "cs116.local.pandas.lc06": {
    title: "Bài học nhanh cho LC-06",
    summary: "Supplementary / ML Foundation: groupby tách bảng theo khóa, aggregation biến mỗi nhóm thành một thống kê có ý nghĩa.",
    library: "pandas",
    methods: ["df.groupby(...)", "[\"score\"]", ".mean()", ".sort_index()", ".to_dict()"],
    newTopics: [
      {
        label: "Split → Apply → Combine",
        explanation: "Có thể hình dung groupby như ba bước: chia dữ liệu theo khóa, áp dụng phép tính cho từng nhóm, rồi ghép kết quả thành Series/DataFrame.",
      },
      {
        label: "Aggregation",
        explanation: "mean, sum, count... biến nhiều hàng trong một nhóm thành giá trị tổng hợp.",
        syntax: "grouped = df.groupby(\"team\")[\"score\"].mean()",
      },
    ],
    workflow: [
      "Nhóm df theo team.",
      "Chọn score và tính mean.",
      "sort_index để thứ tự nhóm ổn định.",
      "Chuyển Series kết quả sang dict và đếm số nhóm.",
    ],
  },
  "cs116.local.pandas.lc07": {
    title: "Bài học nhanh cho LC-07",
    summary: "CS116 (Bài 2B): pivot_table tổng hợp dữ liệu dạng dài thành ma trận hàng × cột.",
    library: "pandas",
    methods: ["pd.pivot_table(...)", ".sort_index()", ".to_numpy()", ".tolist()"],
    newTopics: [
      {
        label: "Long → wide",
        explanation: "team sẽ tạo hàng, metric tạo cột, value là giá trị trong ô; aggfunc quyết định cách gộp khi một ô có nhiều bản ghi.",
      },
      {
        label: "pivot_table",
        explanation: "Khác pivot thuần, pivot_table hỗ trợ aggregation khi có nhiều dòng cùng cặp index/column.",
        syntax: "pd.pivot_table(df, index=\"team\", columns=\"metric\", values=\"value\", aggfunc=\"mean\")",
      },
    ],
    workflow: [
      "Xác định index, columns, values và aggfunc từ đề.",
      "Tạo pivot table.",
      "Sort cả index và columns để đầu ra ổn định.",
      "Lấy tên cột và matrix giá trị để kiểm tra.",
    ],
  },
  "cs116.local.matplotlib.lc08": {
    title: "Bài học nhanh cho LC-08",
    summary: "CS116 (Bài 2B): Matplotlib vẽ line plot với plot/xlabel/ylabel/title; phần lưu PNG vào artifacts là workflow bổ sung.",
    library: "matplotlib + pandas",
    methods: ["plt.subplots()", "ax.plot(...)", "ax.set_xlabel(...)", "ax.set_ylabel(...)", "ax.set_title(...)", "fig.savefig(...)"],
    newTopics: [
      {
        label: "Figure / Axes",
        explanation: "Figure là toàn bộ hình; Axes là vùng tọa độ nơi bạn gọi plot, scatter và đặt nhãn.",
        syntax: "fig, ax = plt.subplots()",
      },
      {
        label: "Artifact",
        explanation: "Local Python workspace dành thư mục artifacts/ cho file đầu ra. Sau mỗi Run/Submit cũ sẽ được dọn để kết quả mới rõ ràng.",
        syntax: "fig.savefig(\"artifacts/loss_curve.png\")",
      },
    ],
    workflow: [
      "Đọc training_history.csv.",
      "Tạo Figure/Axes.",
      "Vẽ epoch–loss và đặt đúng xlabel, ylabel, title.",
      "Lưu PNG vào artifacts rồi kiểm tra danh sách file đầu ra trong workspace.",
    ],
    commonMistakes: [
      "Vẽ đúng dữ liệu nhưng quên nhãn/title.",
      "Savefig ra ngoài thư mục artifacts nên UI không liệt kê file.",
    ],
  },
  "cs116.local.matplotlib.lc09": {
    title: "Bài học nhanh cho LC-09",
    summary: "CS116 (Bài 2B): tự dựng scatter plot distance–threat. Phần lưu artifact PNG là bổ sung.",
    library: "matplotlib + pandas",
    methods: ["plt.subplots()", "ax.scatter(...)", "fig.savefig(...)"],
    newTopics: [
      {
        label: "Scatter plot",
        explanation: "Scatter phù hợp khi muốn xem quan hệ giữa hai biến số theo từng quan sát thay vì nối chúng thành đường.",
        syntax: "ax.scatter(df[\"distance\"], df[\"threat\"])",
      },
    ],
    reviewTopics: [
      {
        label: "Figure / Axes và savefig",
        explanation: "Bạn dùng lại cùng workflow từ LC-08 nhưng tự chọn primitive scatter và hoàn thiện toàn bộ biểu đồ.",
      },
    ],
    workflow: [
      "Tạo Figure/Axes.",
      "Vẽ distance lên x và threat lên y.",
      "Đặt nhãn/title đúng yêu cầu.",
      "Lưu threat_scatter.png vào artifacts.",
    ],
  },
  "cs116.local.pandas.lc10": {
    title: "Bài học nhanh cho LC-10",
    summary: "Supplementary / ML Foundation: merge kết hợp hai bảng theo khóa chung. Kiểu join quyết định những khóa nào được giữ lại. (CS116 dạy concat.)",
    library: "pandas",
    methods: ["DataFrame.merge(...)", "on=...", "how=\"inner\"", ".tolist()", ".sum()"],
    newTopics: [
      {
        label: "Join key",
        explanation: "Khóa join là cột dùng để ghép các hàng tương ứng giữa hai bảng. Ở đây cả users và events đều có user_id.",
      },
      {
        label: "Inner merge",
        explanation: "Inner merge chỉ giữ các hàng có khóa xuất hiện ở cả hai bảng.",
        syntax: "merged = events.merge(users, on=\"user_id\", how=\"inner\")",
      },
    ],
    workflow: [
      "Đọc users.csv và events.csv.",
      "Xác định user_id là khóa chung.",
      "Inner merge events với users.",
      "Kiểm tra ID/region sau join và tổng spend.",
    ],
    commonMistakes: [
      "Dùng concat khi bài toán cần ghép theo khóa.",
      "Nhầm inner join với left join và giữ cả u4 dù u4 không có trong users.",
    ],
  },
  "cs116.local.pillow.lc11": {
    title: "Bài học nhanh cho LC-11",
    summary: "CS116 (Bài 2A/2B): ảnh RGB biểu diễn bằng NumPy ndarray với shape height × width × channels.",
    library: "Pillow + NumPy",
    methods: ["Image.open(...)", ".convert(\"RGB\")", "np.array(...)", ".shape", ".tolist()"],
    newTopics: [
      {
        label: "PIL size vs ndarray shape",
        explanation: "Pillow image.size trả về (width, height), trong khi ndarray RGB thường có shape (height, width, 3).",
      },
      {
        label: "Pixel access",
        explanation: "Sau khi chuyển ảnh sang ndarray, pixels[row, column] trả về ba kênh RGB của pixel đó.",
        syntax: "top_left = pixels[0, 0].tolist()",
      },
    ],
    workflow: [
      "Mở pixels.ppm và convert sang RGB.",
      "Chuyển Image thành NumPy ndarray.",
      "So sánh image.size với pixels.shape.",
      "Đọc số channels và pixel góc trên-trái.",
    ],
  },
  "cs116.local.pillow.lc12": {
    title: "Bài học nhanh cho LC-12",
    summary: "Supplementary / ML Foundation: crop và resize thay đổi không gian ảnh; kết quả có thể lưu thành artifact rồi tiếp tục dùng như ndarray.",
    library: "Pillow + NumPy",
    methods: ["Image.crop(...)", "Image.resize(...)", "Image.save(...)", "np.array(...)"],
    newTopics: [
      {
        label: "Crop box",
        explanation: "Pillow dùng box (left, upper, right, lower); right và lower là biên không bao gồm.",
        syntax: "cropped = image.crop((0, 0, 2, 2))",
      },
      {
        label: "Resize và artifact",
        explanation: "resize((width, height)) tạo kích thước mới; save vào artifacts/ để UI nhận diện file đầu ra.",
        syntax: "resized.save(\"artifacts/resized.png\")",
      },
    ],
    workflow: [
      "Crop vùng 2×2 ở góc trên-trái.",
      "Resize vùng crop thành 4×4.",
      "Lưu resized.png trong artifacts.",
      "Chuyển ảnh mới sang ndarray và kiểm tra shape.",
    ],
  },
  "cs116.local.pandas.lc13": {
    title: "Bài học nhanh cho LC-13",
    summary:
      "CS116 (Bài 2B): tạo cột mới từ các cột có sẵn (value = close * volume) là bước đầu của feature engineering.",
    library: "pandas",
    methods: [
      'df["col"] = ...',
      "Series.tolist()",
      "Series.idxmax()",
      "Series.sum()",
    ],
    newTopics: [
      {
        label: "Tạo cột mới",
        explanation:
          "Gán vào df[\"tên\"] để thêm cột; giá trị có thể là phép tính element-wise trên các cột có sẵn.",
        syntax: 'df["value"] = df["close"] * df["volume"]',
      },
      {
        label: "Phân tích cột mới",
        explanation:
          "idxmax trả về index của giá trị lớn nhất; df.loc lấy ô tương ứng ở cột khác.",
        syntax: 'df.loc[df["value"].idxmax(), "symbol"]',
      },
    ],
    workflow: [
      "Đọc stocks.csv vào df.",
      "Tạo cột value = close * volume.",
      "Lấy list tên cột và value_list.",
      "Tìm top_symbol (value lớn nhất) và total_value.",
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
  "cs116.local.pandas.lc02": {
    question: "Hàm pandas nào thường dùng để đọc file CSV thành DataFrame?",
    options: ["pd.read_csv(...) ", "pd.load_csv(...)", "pd.DataFrame.csv(...) ", "np.read_csv(...)"],
    correctOptionIndex: 0,
    explanation: "`pd.read_csv(...)` đọc CSV và trả về một DataFrame.",
  },
  "cs116.local.pandas.lc03": {
    question: "Khác biệt chính giữa `df[\"distance\"]` và `df[[\"distance\"]]` là gì?",
    options: [
      "Không khác gì",
      "Cách đầu trả về Series, cách sau giữ DataFrame một cột",
      "Cách đầu luôn lỗi",
      "Cách sau trả về số nguyên",
    ],
    correctOptionIndex: 1,
    explanation: "Một cột chọn bằng chuỗi tên cột thường trở thành Series 1D; truyền list tên cột giữ cấu trúc DataFrame 2D.",
  },
  "cs116.local.pandas.lc04": {
    question: "Biểu thức nào lọc các hàng có threat >= threshold?",
    options: [
      "df[df[\"threat\"] >= threshold]",
      "df[\"threat\"] = threshold",
      "df.filter(threshold)",
      "df[threshold]",
    ],
    correctOptionIndex: 0,
    explanation: "Phép so sánh tạo Series boolean và `df[condition]` giữ lại các hàng tại vị trí True.",
  },
  "cs116.local.pandas.lc05": {
    question: "Sau khi dùng fillna để xử lý missing values, điều gì nên được kiểm tra lại?",
    options: [
      "Số missing còn lại",
      "Màu nền của DataFrame",
      "Tên file Python",
      "Phiên bản trình duyệt",
    ],
    correctOptionIndex: 0,
    explanation: "Một bước xử lý dữ liệu nên được kiểm chứng. isna().sum() giúp xác nhận missing values đã được xử lý như mong muốn.",
  },
  "cs116.local.pandas.lc06": {
    question: "Biểu thức nào tính mean score theo team?",
    options: [
      "df.groupby(\"team\")[\"score\"].mean()",
      "df.mean(\"team\")",
      "df[\"team\"].mean(\"score\")",
      "df.groupby(\"score\")[\"team\"].mean()",
    ],
    correctOptionIndex: 0,
    explanation: "groupby tạo nhóm theo team, sau đó chọn score và áp dụng mean cho từng nhóm.",
  },
  "cs116.local.pandas.lc07": {
    question: "Trong pivot_table của bài này, biến nào tạo các cột?",
    options: ["team", "metric", "value", "aggfunc"],
    correctOptionIndex: 1,
    explanation: "team tạo index hàng, metric tạo columns, value cung cấp giá trị và mean là aggregation.",
  },
  "cs116.local.matplotlib.lc08": {
    question: "Đối tượng nào thường được dùng để gọi plot, set_xlabel và set_title?",
    options: ["Axes", "FigureCanvas", "DataFrameIndex", "Path"],
    correctOptionIndex: 0,
    explanation: "Trong workflow fig, ax = plt.subplots(), ax là Axes và là nơi gọi các primitive vẽ cùng nhãn/title.",
  },
  "cs116.local.matplotlib.lc09": {
    question: "Scatter plot phù hợp nhất khi nào?",
    options: [
      "Muốn xem quan hệ giữa hai biến số theo từng quan sát",
      "Muốn nối mọi điểm theo thứ tự thời gian",
      "Muốn chỉ in một số nguyên",
      "Muốn đổi tên file CSV",
    ],
    correctOptionIndex: 0,
    explanation: "Scatter biểu diễn từng cặp (x, y) độc lập nên rất phù hợp để xem quan hệ/phân bố giữa hai biến số.",
  },
  "cs116.local.pandas.lc10": {
    question: "Inner merge theo user_id giữ lại những hàng nào?",
    options: [
      "Chỉ các user_id xuất hiện ở cả hai bảng",
      "Mọi hàng của bảng bên trái",
      "Mọi hàng của cả hai bảng bất kể khóa",
      "Chỉ các user_id không trùng nhau",
    ],
    correctOptionIndex: 0,
    explanation: "Inner join lấy giao của các khóa join: hàng chỉ tồn tại khi user_id có ở cả hai phía.",
  },
  "cs116.local.pillow.lc11": {
    question: "Nếu ndarray ảnh RGB có shape (3, 4, 3), các số này lần lượt biểu diễn gì?",
    options: [
      "height=3, width=4, channels=3",
      "width=3, height=4, channels=3",
      "channels=3, width=4, height=3",
      "3 ảnh, mỗi ảnh 4×3",
    ],
    correctOptionIndex: 0,
    explanation: "Quy ước ndarray ảnh RGB phổ biến là (height, width, channels). Pillow image.size thì ngược hai kích thước đầu: (width, height).",
  },
  "cs116.local.pillow.lc12": {
    question: "Pillow crop((0, 0, 2, 2)) tạo vùng ảnh có kích thước nào?",
    options: ["2×2", "3×3", "2×3", "4×4"],
    correctOptionIndex: 0,
    explanation: "right và lower là biên không bao gồm, nên khoảng từ 0 đến 2 có đúng 2 pixel trên mỗi chiều.",
  },
  "cs116.local.pandas.lc13": {
    question:
      'Cách đúng để tạo cột mới `value` bằng tích của hai cột `close` và `volume`?',
    options: [
      "df.value = close * volume",
      'df["value"] = df["close"] * df["volume"]',
      'df.append(df["close"] * df["volume"])',
      'value = df["close"] * df["volume"]',
    ],
    correctOptionIndex: 1,
    explanation:
      'Gán vào df["value"] mới thêm cột vào DataFrame; phép nhân hai cột là element-wise theo từng hàng.',
  },
};

export function getMissionQuickCheck(activityId: string): MissionQuickCheckDefinition | null {
  return QUICK_CHECKS[activityId] ?? null;
}
