import type { MissionLessonGuide, MissionQuickCheckDefinition } from "./mission-lesson-guides";

/**
 * "Bài học nhanh" card and quick check of the M11 capstone PF-27 (PHASE-09). Same shape and same
 * panel as the M8-M10 guides; the lookup lives in mission-lesson-guides.ts. The guide revises the
 * construct-level ideas the capstone combines (validate, normalize, summarize, plot) with neutral
 * names; it never contains a line of the mission's solution.
 */

export const PYTHON_FOUNDATIONS_M11_LESSON_GUIDES: Readonly<Record<string, MissionLessonGuide>> = {
  "python-foundations.pf27": {
    title: "Bài học nhanh cho PF-27",
    summary:
      "Capstone cuối khóa: kiểm tra chất lượng một bộ annotation bounding box. Bạn tự chia bài thành bốn hàm (làm sạch, chuẩn hóa, tóm tắt theo lớp, vẽ biểu đồ), tự kiểm tra từng bước rồi ghép thành pipeline. Không có chủ đề mới: đây là bài ghép các kỹ năng của PF-16..PF-26.",
    library: "pandas, numpy, matplotlib",
    methods: [
      "pd.read_csv",
      "pd.to_numeric(errors='coerce')",
      "s.str.strip() / s.str.lower()",
      "df.drop_duplicates(subset=[...])",
      "df.reset_index(drop=True)",
      "df.groupby(...).agg(...)",
      "df.sort_values([...], ascending=[...])",
      "ax.bar(x, y)",
    ],
    newTopics: [],
    reviewTopics: [
      {
        label: "Kiểm tra hợp lệ bằng mặt nạ (boolean mask)",
        explanation:
          "Mỗi quy tắc là một điều kiện cho cả cột; kết hợp chúng bằng `&` rồi lọc. Dòng có ô thiếu so sánh luôn cho kết quả False nên tự bị loại. Đếm số dòng bị loại ở từng quy tắc để biết quy tắc nào bắt được gì.",
        syntax: "ok = (a > 0) & (b < c) & x.isin(allowed)\ntable = table[ok]",
      },
      {
        label: "Trùng lặp chỉ tính trong các dòng hợp lệ",
        explanation:
          "Đề định nghĩa bỏ trùng SAU khi đã loại dòng hỏng và giữ dòng đầu tiên. Thứ tự các bước quyết định kết quả: một dòng hỏng đứng trước không được phép “che” một dòng hợp lệ giống nó.",
        syntax: "table = table.drop_duplicates(subset=[...], keep='first')",
      },
      {
        label: "Chuẩn hóa tọa độ về [0, 1]",
        explanation:
          "Chia tọa độ x cho chiều rộng ảnh và tọa độ y cho chiều cao ảnh của CHÍNH dòng đó (mỗi ảnh có kích thước riêng). Không sửa bảng đầu vào: tạo bảng mới.",
        syntax: "out['x1'] = table['xmin'] / table['width']",
      },
      {
        label: "Ma trận đặc trưng và dtype",
        explanation:
          "Một ndarray có shape và dtype rõ ràng: `(số_hộp, 4)`, float64. Ghép các cột lại với nhau, đừng dựng từng dòng bằng vòng lặp. Kiểm tra `X.shape` và `X.dtype` trước khi nộp.",
        syntax: "features = np.column_stack([a, b, c, d])",
      },
      {
        label: "Tóm tắt theo lớp và biểu đồ cột",
        explanation:
          "`groupby` gom theo lớp, `agg` tính nhiều thống kê; đặt thứ tự xếp rõ ràng (giảm dần theo số hộp, hòa thì theo tên). Hàm vẽ nhận bảng tóm tắt, vẽ đúng thứ tự của bảng, đặt tiêu đề và nhãn trục rồi TRẢ VỀ Axes.",
        syntax: "fig, ax = plt.subplots()\nax.bar(names, heights)",
      },
    ],
    workflow: [
      "Đọc file và liệt kê các loại dòng hỏng bạn nhìn thấy (thiếu giá trị, kích thước ≤ 0, hộp ngoài ảnh hoặc ngược, nhãn lạ, split lạ, dòng trùng). Mỗi loại là một quy tắc cần kiểm tra.",
      "Viết và thử riêng từng hàm trên bảng nhỏ do bạn tự dựng, rồi mới ghép lại. Hàm làm sạch không được sửa bảng đầu vào; thiếu cột thì báo lỗi rõ ràng.",
      "Đối chiếu `rejected` với số dòng bạn thấy bị loại ở từng quy tắc; bấm Chạy thử để xem biểu đồ, nhưng chỉ Nộp bài mới chấm và lưu tiến độ.",
      "Muốn có bằng chứng tự làm: sau khi đạt, bấm “Tạo đề mới” và làm lại mà không mở gợi ý H3/H4.",
    ],
    commonMistakes: [
      "Bỏ trùng trước khi kiểm tra hợp lệ, hoặc quên rằng dòng hỏng cũng được tính vào `rejected`.",
      "Quên làm sạch chữ (khoảng trắng, hoa/thường) trước khi so với danh sách lớp hợp lệ.",
      "Chuẩn hóa bằng một kích thước ảnh chung thay vì kích thước của từng dòng.",
      "Để `X` là float32, đảo chiều `(4, n)` hoặc dùng tọa độ góc thay vì (tâm x, tâm y, rộng, cao).",
      "Hàm vẽ tự sắp xếp lại các lớp theo bảng chữ cái thay vì theo thứ tự của `summary`.",
      "Hard-code kết quả của dữ liệu mẫu: các lần Nộp bài chấm thêm trên bảng ẩn do chương trình dựng.",
    ],
  },
};

export const PYTHON_FOUNDATIONS_M11_QUICK_CHECKS: Readonly<Record<string, MissionQuickCheckDefinition>> = {
  "python-foundations.pf27": {
    question:
      "Hai dòng giống hệt nhau về ảnh, lớp và tọa độ; dòng đầu có `split` không hợp lệ, dòng sau hợp lệ. Nếu bỏ trùng TRƯỚC khi loại dòng hỏng, điều gì xảy ra?",
    options: [
      "Không có gì khác biệt so với bỏ trùng sau",
      "Dòng hỏng được giữ lại làm đại diện rồi bị loại, nên mất luôn cả hộp hợp lệ",
      "pandas báo lỗi vì có hai dòng trùng",
      "Dòng hợp lệ được giữ và dòng hỏng bị loại tự động",
    ],
    correctOptionIndex: 1,
    explanation:
      "`drop_duplicates` giữ dòng đầu tiên. Nếu dòng đó là dòng hỏng thì sau khi loại nó, hộp hợp lệ giống hệt đã bị bỏ đi mất. Vì vậy phải loại dòng hỏng trước, rồi mới bỏ trùng trong các dòng hợp lệ.",
  },
};
