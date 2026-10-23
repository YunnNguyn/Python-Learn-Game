import type { MissionLessonGuide, MissionQuickCheckDefinition } from "./mission-lesson-guides";

/**
 * "Bài học nhanh" cards and quick checks of the M10 Data Science Toolkit missions
 * PF-16..PF-26 (PHASE-08). Same shape and same panel as the M8/M9 guides; the lookup lives in
 * mission-lesson-guides.ts. Examples use neutral names (a, b, table, ...) on purpose: a guide
 * teaches the construct, it never contains a line of a mission's solution.
 */

export const PYTHON_FOUNDATIONS_M10_LESSON_GUIDES: Readonly<Record<string, MissionLessonGuide>> = {
  "python-foundations.pf16": {
    title: "Bài học nhanh cho PF-16",
    summary:
      "Broadcasting cho phép NumPy kết hợp hai mảng khác shape mà không cần vòng lặp. Mọi thứ xoay quanh một câu hỏi: hai shape có “khớp” nhau khi so từng chiều từ bên phải sang không?",
    library: "numpy (`import numpy as np`)",
    methods: ["a.shape", "a[:, np.newaxis]", "a[np.newaxis, :]", "a.reshape(r, c)", "a + b"],
    newTopics: [
      {
        label: "Vector (n,), cột (n, 1) và hàng (1, n)",
        explanation:
          "Ba mảng này có cùng n số nhưng khác shape nên cư xử khác nhau khi kết hợp. Thêm một trục có kích thước 1 bằng `np.newaxis` biến vector thành cột hoặc hàng.",
        syntax: "v = np.array([1.0, 2.0, 3.0])   # (3,)\ncol = v[:, np.newaxis]            # (3, 1)\nrow = v[np.newaxis, :]            # (1, 3)",
      },
      {
        label: "Quy tắc broadcasting",
        explanation:
          "So hai shape từng chiều, bắt đầu từ chiều cuối. Hai chiều tương thích nếu bằng nhau hoặc một trong hai bằng 1; chiều bằng 1 được “kéo giãn”. Thiếu chiều ở bên trái được coi là 1. Nếu có một cặp không tương thích, NumPy báo ValueError.",
        syntax: "(3, 1) + (1, 4) -> (3, 4)\n(5, 3) + (3,)   -> (5, 3)\n(3,)   + (4,)   -> ValueError",
      },
    ],
    workflow: [
      "Đọc shape của x và y trong phần Dữ liệu trước khi viết bất kỳ phép toán nào.",
      "Với mỗi biến cần tạo, viết ra shape bạn mong đợi, rồi mới viết biểu thức và in `.shape` để đối chiếu.",
      "Chỉ chấp nhận kết quả khi shape khớp: giá trị đúng nhưng shape sai vẫn bị tính là sai.",
    ],
    commonMistakes: [
      "Cộng hai vector khác độ dài và nhận ValueError, thay vì biến một vector thành cột trước.",
      "Dùng `reshape(1, -1)` khi cần cột: giá trị giống hệt nhưng shape là hàng.",
      "So shape từ bên trái thay vì từ bên phải.",
    ],
  },
  "python-foundations.pf17": {
    title: "Bài học nhanh cho PF-17",
    summary:
      "Một phép gộp như sum hay mean có thể chạy theo từng cột hoặc từng hàng, tùy axis. Giữ lại trục đã gộp bằng keepdims giúp kết quả broadcast đúng trở lại mảng gốc. Mask boolean chọn phần tử theo điều kiện.",
    library: "numpy (`import numpy as np`)",
    methods: ["a.sum(axis=0)", "a.mean(axis=1, keepdims=True)", "a >= t", "np.where(mask, a, b)", "mask.sum(axis=0)"],
    newTopics: [
      {
        label: "axis và keepdims",
        explanation:
          "axis=0 gộp các hàng lại (một kết quả cho mỗi cột); axis=1 gộp các cột lại (một kết quả cho mỗi hàng). Mặc định trục được gộp biến mất; `keepdims=True` giữ nó lại với kích thước 1, nên kết quả có thể chia/trừ ngược vào mảng gốc.",
        syntax: "a.sum(axis=0).shape                 # (c,)\na.sum(axis=1, keepdims=True).shape  # (r, 1)",
      },
      {
        label: "Mask boolean",
        explanation:
          "Phép so sánh trên mảng cho mảng boolean cùng shape. Có thể đếm bằng `sum` (True = 1) hoặc chọn phần tử bằng chỉ số boolean. Lưu ý chỉ số boolean làm phẳng mảng; nếu cần giữ cấu trúc theo cột, dùng `np.where` rồi gộp theo axis.",
        syntax: "mask = a >= t\nmask.sum(axis=0)\nnp.where(mask, a, 0.0)",
      },
    ],
    workflow: [
      "Với mỗi biến, xác định rõ cần một kết quả cho mỗi cột hay mỗi hàng, rồi chọn axis.",
      "Kiểm tra `.shape` của kết quả với shape bạn cần (vd (r, 1) cho phép chia từng hàng).",
      "Với hàm nhận mảng bất kỳ, thử nghĩ tới mảng chỉ có một cột, một hàng hoặc một cột không có phần tử nào thỏa điều kiện.",
    ],
    commonMistakes: [
      "Nhầm axis=0 và axis=1.",
      "Quên `keepdims=True` rồi chia mảng (r, c) cho vector (r,): lệch trục hoặc lỗi shape.",
      "Chia cho số phần tử thỏa điều kiện khi số đó có thể bằng 0.",
      "Sửa trực tiếp mảng đầu vào (`a /= ...`) khi đề yêu cầu trả về mảng mới.",
    ],
  },
  "python-foundations.pf18": {
    title: "Bài học nhanh cho PF-18",
    summary:
      "Tiền xử lý dữ liệu cho mô hình thường gồm: bỏ dòng hỏng, chọn đặc trưng, chuẩn hóa từng cột và cắt thành các batch có kích thước cố định. Tất cả đều làm được bằng các phép vector hóa, không cần vòng for.",
    library: "numpy (`import numpy as np`)",
    methods: ["a[:, cols]", "(a >= 0).all(axis=1)", "a.mean(axis=0)", "a.std(axis=0)", "a.reshape(b, s, f)", "np.where(...)"],
    newTopics: [
      {
        label: "Chọn dòng và cột",
        explanation:
          "Chỉ số boolean theo hàng giữ lại các dòng thỏa điều kiện; chỉ số list theo cột chọn các đặc trưng. Thứ tự các bước quan trọng: kiểm tra giá trị hỏng trên những cột bạn thật sự dùng.",
        syntax: "ok = (a >= 0).all(axis=1)\nsub = a[ok][:, [0, 2]]",
      },
      {
        label: "Chuẩn hóa và chia batch",
        explanation:
          "Chuẩn hóa theo cột: trừ mean, chia std (axis=0). Cột hằng số có std = 0 nên cần tránh chia cho 0. `reshape` đổi cách nhìn dữ liệu nhưng cần tổng số phần tử khớp, nên phải bỏ phần dư trước khi chia batch.",
        syntax: "z = (a - a.mean(axis=0)) / safe_std\nbatches = a[: n * s].reshape(n, s, f)",
      },
    ],
    workflow: [
      "Viết từng bước thành một hàm nhỏ và thử từng hàm trên mảng ví dụ trước khi ghép lại.",
      "Sau mỗi bước, in shape: số dòng sau khi lọc? số cột sau khi chọn? số batch?",
      "Kiểm tra các trường hợp biên: mọi dòng đều hỏng, cột hằng số, kích thước batch không hợp lệ.",
    ],
    commonMistakes: [
      "reshape sai thứ tự chiều: dữ liệu vẫn “đúng” nhưng shape (size, n, f) thay vì (n, size, f).",
      "Dùng std với ddof khác yêu cầu của đề.",
      "Chia cho std = 0 ở cột hằng số.",
      "Lọc dòng hỏng trên cả những cột không dùng.",
    ],
  },
  "python-foundations.pf19": {
    title: "Bài học nhanh cho PF-19",
    summary:
      "pandas DataFrame là bảng có tên cột và chỉ số hàng. Việc đầu tiên khi gặp một bảng là hỏi: bao nhiêu hàng, những cột nào, mỗi cột kiểu gì. Sau đó chọn dữ liệu bằng tên (loc) hoặc vị trí (iloc).",
    library: "pandas (`import pandas as pd`)",
    methods: ["pd.DataFrame(dict)", "df.shape", "df.columns", "df.dtypes", "df['a']", "df[['a','b']]", "df.loc[label, col]", "df.iloc[row, col]", "df.set_index('a')"],
    newTopics: [
      {
        label: "Series, DataFrame và dtype",
        explanation:
          "`df['a']` trả về một Series (một cột), còn `df[['a']]` với list trả về DataFrame một cột. Mỗi cột có một dtype riêng (int64, float64, bool, str...); xem bằng `df.dtypes` hoặc `df['a'].dtype`.",
        syntax: "type(df['a'])    # Series\ntype(df[['a']])  # DataFrame\nstr(df['a'].dtype)",
      },
      {
        label: "loc theo nhãn, iloc theo vị trí",
        explanation:
          "`loc` dùng nhãn của chỉ số hàng và tên cột; `iloc` dùng vị trí số nguyên bắt đầu từ 0. Sau `set_index`, nhãn hàng là giá trị của cột đó nên hai cách cho kết quả khác nhau. `set_index` trả về bảng mới, không sửa bảng gốc.",
        syntax: "t = df.set_index('a')\nt.loc[key, 'b']   # theo nhãn\ndf.iloc[2, 1]     # theo vị trí",
      },
    ],
    workflow: [
      "In `df`, `df.shape` và `df.dtypes` trước tiên để biết bảng trông thế nào.",
      "Với mỗi biến, tự hỏi: kết quả là Series, DataFrame hay một giá trị đơn?",
      "Kiểm tra bảng gốc `df` còn nguyên sau khi bạn tạo các bảng con.",
    ],
    commonMistakes: [
      "Nhầm `df['a']` (Series) với `df[['a']]` (DataFrame).",
      "Dùng `iloc` khi cần tra theo nhãn, hoặc ngược lại.",
      "Dùng `inplace=True`: nó sửa bảng gốc và trả về None.",
      "Trả về đối tượng dtype thay vì tên dtype dạng chuỗi.",
    ],
  },
  "python-foundations.pf20": {
    title: "Bài học nhanh cho PF-20",
    summary:
      "Lọc và biến đổi bảng mà không sửa bảng gốc là kỹ năng cốt lõi: tạo cột mới bằng assign, lọc bằng mask boolean, kết hợp điều kiện bằng toán tử bit-wise.",
    library: "pandas (`import pandas as pd`)",
    methods: ["df.assign(new=...)", "df[mask]", "(a) & (b)", "(a) | (b)", "~mask", "col.isin(values)", "df.copy()"],
    newTopics: [
      {
        label: "Cột mới mà không sửa bảng gốc",
        explanation:
          "`df.assign(...)` trả về một bảng mới có thêm cột; `df['new'] = ...` thì sửa chính `df`. Khi viết hàm nhận DataFrame, hãy giữ bảng đầu vào nguyên vẹn: người gọi không mong đợi nó bị đổi.",
        syntax: "new = df.assign(total=df['a'] * df['b'])\n# df vẫn như cũ",
      },
      {
        label: "Mask và kết hợp điều kiện",
        explanation:
          "Một so sánh trên cột cho Series boolean; `df[mask]` giữ các hàng True và GIỮ NGUYÊN chỉ số hàng. Kết hợp nhiều điều kiện bằng `&`, `|`, `~` (không dùng `and`, `or`, `not`) và bọc mỗi điều kiện trong ngoặc tròn.",
        syntax: "mask = (df['a'] >= 10) & (df['c'].isin(['x', 'y']))\ndf[mask]",
      },
    ],
    workflow: [
      "Viết hàm tạo cột trước, kiểm tra bảng đầu vào không đổi bằng cách in lại nó.",
      "Viết từng điều kiện thành một mask riêng, in số hàng thỏa, rồi mới kết hợp.",
      "Nhớ ranh giới: `>=` và `>` cho kết quả khác nhau đúng ở giá trị biên.",
    ],
    commonMistakes: [
      "Dùng `and`/`or` giữa hai Series: pandas báo ValueError về “truth value of a Series”.",
      "Quên ngoặc quanh từng điều kiện khi dùng `&`.",
      "Gán cột trực tiếp vào bảng đầu vào của hàm.",
      "`reset_index` khi đề cần giữ chỉ số hàng gốc.",
    ],
  },
  "python-foundations.pf21": {
    title: "Bài học nhanh cho PF-21",
    summary:
      "Dữ liệu thật hiếm khi sạch: ô thiếu, số viết dưới dạng chuỗi có ký tự lạ, khoảng trắng và chữ hoa/thường lộn xộn. Làm sạch có thứ tự quan trọng: mỗi quy tắc ảnh hưởng tới kết quả của quy tắc sau.",
    library: "pandas (`import pandas as pd`)",
    methods: ["s.isna()", "s.isna().sum()", "pd.to_numeric(s, errors='coerce')", "s.str.replace(...)", "s.str.strip()", "s.str.title()", "df.dropna(subset=[...])", "s.fillna(v)", "s.astype('float64')", "s.median()"],
    newTopics: [
      {
        label: "Ô thiếu và đổi kiểu",
        explanation:
          "`isna()` nhận ra None/NaN nhưng KHÔNG coi chuỗi như 'n/a' hay rỗng là thiếu. `pd.to_numeric(..., errors='coerce')` biến chuỗi không đọc được thành NaN thay vì báo lỗi. Sau khi chuyển, kiểm tra dtype: cột toàn số nguyên có thể ra int64 dù đề muốn float64.",
        syntax: "n = pd.to_numeric(s, errors='coerce')\nmissing = n.isna()\nn.astype('float64')",
      },
      {
        label: "Xử lý chuỗi và điền giá trị thiếu",
        explanation:
          "Thuộc tính `.str` áp dụng hàm chuỗi cho cả cột (strip, lower, title, replace). `fillna` thay ô thiếu bằng một giá trị; trung vị được tính trên những giá trị còn lại tại thời điểm bạn gọi nó, nên thứ tự bước có ảnh hưởng.",
        syntax: "s.str.strip().str.title()\ns.fillna(s.median())",
      },
    ],
    workflow: [
      "Đọc kỹ năm quy tắc trong đề và đánh số thứ tự; làm đúng thứ tự đó.",
      "Sau mỗi quy tắc, in số hàng và `dtypes` để thấy tác động.",
      "Thử với bảng đã sạch sẵn và bảng chỉ có một giá trị hợp lệ: hàm vẫn phải chạy đúng.",
    ],
    commonMistakes: [
      "Điền tuổi thiếu trước khi bỏ các hàng không dùng được: trung vị bị tính trên tập sai.",
      "Quên `strip` nên giá trị thành phố vẫn còn khoảng trắng.",
      "Quên chỉ số đã bị khuyết sau khi bỏ hàng; cần `reset_index(drop=True)`.",
      "Sửa trực tiếp bảng đầu vào thay vì làm việc trên bản sao.",
    ],
  },
  "python-foundations.pf22": {
    title: "Bài học nhanh cho PF-22",
    summary:
      "groupby chia bảng thành các nhóm, áp dụng phép gộp cho từng nhóm rồi ghép kết quả lại. Kết quả mặc định được xếp theo khóa nhóm; muốn thứ tự khác thì phải sắp xếp rõ ràng, kể cả khi hai nhóm có giá trị bằng nhau.",
    library: "pandas (`import pandas as pd`)",
    methods: ["df.groupby('a')", "g['b'].sum()", "g.agg(name=('col', 'func'))", "s.sort_values(ascending=...)", "df.sort_values(['a', 'b'], ascending=[False, True])", "s.sort_index()", "s.rename('name')"],
    newTopics: [
      {
        label: "groupby và agg",
        explanation:
          "`groupby('a')` gom các hàng có cùng giá trị cột a. `agg` cho phép đặt tên cột kết quả bằng cú pháp `ten=('cột', 'phép_gộp')`. Khóa nhóm trở thành chỉ số hàng của kết quả.",
        syntax: "t.groupby('a').agg(n=('b', 'size'), total=('b', 'sum'))",
      },
      {
        label: "Sắp xếp có thứ tự xác định",
        explanation:
          "Khi sắp theo một giá trị, các hàng bằng nhau có thể xếp theo thứ tự không mong muốn. Thêm một khóa phụ (vd tên nhóm) để kết quả luôn giống nhau. `ascending` nhận list để mỗi khóa có chiều riêng.",
        syntax: "t.sort_values(['total', 'name'], ascending=[False, True])",
      },
    ],
    workflow: [
      "Tính cột phụ cần thiết (vd doanh thu = số lượng × giá) trên bản sao trước khi nhóm.",
      "Nhóm, gộp, rồi mới tính các cột dẫn xuất như trung bình.",
      "Sắp xếp rõ ràng và đặt chỉ số/tên đúng như đề; kiểm tra bằng bảng có hai nhóm bằng nhau.",
    ],
    commonMistakes: [
      "Không có khóa phụ nên nhóm bằng nhau xếp lộn xộn.",
      "Để khóa nhóm thành cột thường trong khi đề cần nó là chỉ số.",
      "Tính trung bình của các số đã làm tròn hoặc của cột sai.",
      "Quên đặt tên cho Series kết quả.",
    ],
  },
  "python-foundations.pf23": {
    title: "Bài học nhanh cho PF-23",
    summary:
      "Matplotlib vẽ lên một đối tượng Axes. Một biểu đồ đọc được cần tiêu đề, nhãn trục và chú giải; bài này chấm các thuộc tính đó của Axes, chứ không so từng điểm ảnh.",
    library: "matplotlib (`import matplotlib.pyplot as plt`)",
    methods: ["fig, ax = plt.subplots()", "ax.plot(x, y, label=...)", "ax.bar(names, heights)", "ax.set_title(...)", "ax.set_xlabel(...)", "ax.set_ylabel(...)", "ax.legend()"],
    newTopics: [
      {
        label: "Figure, Axes và các lệnh vẽ",
        explanation:
          "`plt.subplots()` trả về (figure, axes). Gọi lệnh vẽ trên `ax`: `plot` cho đường, `bar` cho cột, `scatter` cho điểm. Hàm của bạn nên trả về `ax` để người khác kiểm tra hoặc vẽ thêm.",
        syntax: "fig, ax = plt.subplots()\nax.plot(x, y, label='A')\nreturn ax",
      },
      {
        label: "Tiêu đề, nhãn và chú giải",
        explanation:
          "`label=` đặt tên cho một đường/nhóm cột nhưng chú giải chỉ hiện khi gọi `ax.legend()`. Thứ tự vẽ quyết định thứ tự trong chú giải. Với biểu đồ cột, thứ tự cột là thứ tự bạn truyền vào.",
        syntax: "ax.set_title('Tiêu đề')\nax.set_xlabel('Tháng')\nax.legend()",
      },
    ],
    workflow: [
      "Bấm Run để xem ảnh biểu đồ thật của bạn rồi so với yêu cầu trong đề.",
      "Kiểm tra từng thuộc tính: tiêu đề, nhãn hai trục, chú giải, thứ tự các đường/cột.",
      "Với biểu đồ xếp hạng, sắp dữ liệu trước khi vẽ, không sắp sau.",
    ],
    commonMistakes: [
      "Có `label=` nhưng quên `ax.legend()`.",
      "Vẽ các đường sai thứ tự so với đề.",
      "Truyền x và y có độ dài khác nhau: Matplotlib báo ValueError.",
      "Quên trả về `ax`.",
    ],
  },
  "python-foundations.pf24": {
    title: "Bài học nhanh cho PF-24",
    summary:
      "Một biểu đồ chạy được chưa chắc đúng: nó có thể vẽ sai đại lượng, sai trục hoặc thiếu nhãn khiến người xem hiểu nhầm. Bài này luyện đọc kỹ ảnh và mã, rồi sửa từng lỗi một.",
    library: "matplotlib + pandas",
    methods: ["df.groupby('a')[['b','c']].sum()", "profit = revenue - cost", "ax.plot(x, y)", "ax.bar(names, heights)", "ax.set_xlabel / set_ylabel", "ax.legend()"],
    newTopics: [
      {
        label: "Vẽ đúng đại lượng",
        explanation:
          "Trước khi vẽ, hãy chắc dữ liệu là đại lượng người xem cần: tổng hay trung bình, hiệu hay tổng, đã gộp theo nhóm chưa. Với mỗi điểm trên biểu đồ nên có đúng một giá trị cho mỗi nhóm trên trục x.",
        syntax: "totals = df.groupby('g')[['a', 'b']].sum()\nvalue = totals['a'] - totals['b']",
      },
      {
        label: "Trục, nhãn và chú giải phải khớp nội dung",
        explanation:
          "x là đại lượng độc lập (tháng, vùng), y là đại lượng đo. Nhãn của trục phải nói đúng nội dung của trục đó, và mỗi đường cần một nhãn đúng với dữ liệu nó vẽ.",
        syntax: "ax.plot(x_values, y_values, label='Tên đúng')\nax.set_xlabel('...')\nax.set_ylabel('...')",
      },
    ],
    workflow: [
      "Bấm Run và nhìn biểu đồ: điều gì khó hiểu hoặc phi lý?",
      "Liệt kê các nghi vấn (đại lượng, phép gộp, trục, nhãn, chú giải) rồi sửa lần lượt, mỗi lần một lỗi.",
      "Bấm Run lại sau mỗi lần sửa để thấy biểu đồ thay đổi.",
    ],
    commonMistakes: [
      "Sửa một lỗi rồi dừng, trong khi biểu đồ còn các lỗi khác.",
      "Đổi nhãn nhưng không đổi dữ liệu (hoặc ngược lại).",
      "Quên rằng mỗi hàm biểu đồ có thể có lỗi riêng.",
    ],
  },
  "python-foundations.pf25": {
    title: "Bài học nhanh cho PF-25",
    summary:
      "Một quy trình dữ liệu thật: đọc hai file CSV, kiểm tra chúng có đủ cột không, làm sạch từng bảng, rồi nối bảng bằng khóa chung. Khóa không khớp và dòng trùng là nơi lỗi thường ẩn nấp.",
    library: "pandas (`import pandas as pd`)",
    methods: ["pd.read_csv('data/tên.csv')", "df.columns", "df.drop_duplicates(subset=..., keep='first')", "a.merge(b, on='key', how='inner')", "df.sort_values('a')", "s.str.lower()"],
    newTopics: [
      {
        label: "Đọc CSV và kiểm tra cột",
        explanation:
          "File dữ liệu nằm trong thư mục `data/` của workspace; dùng đường dẫn tương đối. Kiểm tra cột bắt buộc trước khi xử lý và báo lỗi rõ ràng (ValueError nêu tên các cột thiếu) thay vì để pandas báo KeyError khó hiểu.",
        syntax: "t = pd.read_csv('data/ten_file.csv')\nmissing = [c for c in need if c not in t.columns]",
      },
      {
        label: "Nối bảng bằng merge",
        explanation:
          "`inner` giữ các dòng có khóa ở cả hai bảng; `left` giữ mọi dòng của bảng trái và điền NaN khi không khớp. Khóa bị trùng ở một bảng sẽ nhân đôi dòng sau khi nối, nên bỏ trùng trước khi nối.",
        syntax: "a.merge(b, on='key', how='inner')",
      },
    ],
    workflow: [
      "Mở dữ liệu bằng Run: in `head()`, `shape` và `dtypes` của từng bảng.",
      "Liệt kê các vấn đề (trùng khóa, viết hoa/thường, khoảng trắng, thiếu giá trị) rồi làm sạch trước khi nối.",
      "Đếm số dòng trước và sau mỗi bước để biết bạn đã bỏ bao nhiêu và vì sao.",
    ],
    commonMistakes: [
      "Nối trước khi bỏ khóa trùng nên số dòng bị nhân lên.",
      "So sánh trạng thái mà không chuẩn hóa chữ hoa/thường và khoảng trắng.",
      "Dùng đường dẫn tuyệt đối thay vì `data/...`.",
      "Quên sắp xếp và đặt lại chỉ số ở kết quả.",
    ],
  },
  "python-foundations.pf26": {
    title: "Bài học nhanh cho PF-26",
    summary:
      "Mini-project cuối: đi từ file CSV thô tới một bảng sạch, ma trận đặc trưng đã chuẩn hóa, vài số thống kê và một biểu đồ chẩn đoán. Bạn tự thiết kế các bước; đề chỉ nêu hợp đồng đầu ra.",
    library: "pandas, numpy, matplotlib",
    methods: ["pd.read_csv", "pd.to_numeric(errors='coerce')", "df.drop_duplicates", "df.to_numpy(dtype=float)", "mean/std(axis=0)", "df.groupby(...).mean()", "ax.scatter(x, y)"],
    newTopics: [
      {
        label: "Từ bảng sạch tới ma trận đặc trưng",
        explanation:
          "Sau khi làm sạch, chọn các cột số và đổi sang mảng NumPy bằng `to_numpy`. Chuẩn hóa từng cột như ở PF-18. Chú ý số dòng của ma trận phải bằng số dòng của bảng sạch.",
        syntax: "X = table[['a', 'b']].to_numpy(dtype=float)",
      },
      {
        label: "Biểu đồ chẩn đoán",
        explanation:
          "Một biểu đồ nhanh giúp phát hiện dữ liệu bất thường: scatter của hai biến quan trọng, có tiêu đề và nhãn trục. Hàm vẽ nên nhận bảng sạch và trả về Axes.",
        syntax: "fig, ax = plt.subplots()\nax.scatter(table['a'], table['b'])",
      },
    ],
    workflow: [
      "Đọc dữ liệu và liệt kê mọi loại bản ghi hỏng bạn thấy (thiếu, sai miền giá trị, trùng, chữ lộn xộn).",
      "Viết và thử từng bước nhỏ; đếm số dòng bị loại ở mỗi bước để khớp với con số `rejected` bạn báo cáo.",
      "Cuối cùng ghép lại trong `prepare(df)` và `plot_diagnostic(clean)`; Run để xem biểu đồ.",
    ],
    commonMistakes: [
      "Chuẩn hóa trước khi loại các bản ghi hỏng nên trung bình/độ lệch bị méo.",
      "Quên cột có độ lệch chuẩn bằng 0.",
      "Báo `rejected` sai vì không tính các dòng trùng.",
      "Hàm vẽ sửa hoặc phụ thuộc vào biến toàn cục thay vì tham số `clean`.",
    ],
  },
};

export const PYTHON_FOUNDATIONS_M10_QUICK_CHECKS: Readonly<Record<string, MissionQuickCheckDefinition>> = {
  "python-foundations.pf16": {
    question: "Hai mảng có shape (4, 1) và (1, 3). Cộng chúng bằng broadcasting cho shape nào?",
    options: ["(4, 1)", "(1, 3)", "(4, 3)", "ValueError"],
    correctOptionIndex: 2,
    explanation:
      "Chiều đầu: 4 và 1 -> 4; chiều cuối: 1 và 3 -> 3. Chiều có kích thước 1 được kéo giãn nên kết quả là (4, 3).",
  },
  "python-foundations.pf17": {
    question: "Với mảng shape (5, 3), `a.sum(axis=1, keepdims=True)` có shape nào?",
    options: ["(3,)", "(5,)", "(5, 1)", "(1, 3)"],
    correctOptionIndex: 2,
    explanation:
      "axis=1 gộp các cột nên mỗi hàng còn một giá trị; keepdims=True giữ trục đã gộp lại với kích thước 1, ra (5, 1).",
  },
  "python-foundations.pf18": {
    question: "Mảng có 10 dòng, 2 đặc trưng. Cắt 8 dòng đầu thành các batch kích thước 4, shape đúng là gì?",
    options: ["(4, 2, 2)", "(2, 4, 2)", "(2, 2, 4)", "(8, 2)"],
    correctOptionIndex: 1,
    explanation:
      "8 dòng chia thành 2 batch, mỗi batch có 4 dòng và 2 đặc trưng: (số batch, kích thước batch, số đặc trưng) = (2, 4, 2).",
  },
  "python-foundations.pf19": {
    question: "Biểu thức nào trả về một DataFrame (không phải Series)?",
    options: ["df['name']", "df[['name']]", "df.loc[0, 'name']", "df['name'].dtype"],
    correctOptionIndex: 1,
    explanation:
      "Chọn cột bằng một list (dù chỉ có một tên) cho DataFrame. Chọn bằng một tên cho Series; `loc[0, 'name']` cho một giá trị đơn.",
  },
  "python-foundations.pf20": {
    question: "Cách nào kết hợp đúng hai điều kiện trên cột của DataFrame?",
    options: [
      "df[(df['a'] > 1) and (df['b'] < 5)]",
      "df[(df['a'] > 1) & (df['b'] < 5)]",
      "df[df['a'] > 1 & df['b'] < 5]",
      "df[(df['a'] > 1), (df['b'] < 5)]",
    ],
    correctOptionIndex: 1,
    explanation:
      "Cần toán tử `&` giữa hai Series boolean và ngoặc quanh mỗi điều kiện. `and` báo ValueError, còn bỏ ngoặc làm `&` được tính trước phép so sánh.",
  },
  "python-foundations.pf21": {
    question: "Series `s` có các chuỗi '12', 'n/a', '7'. `pd.to_numeric(s, errors='coerce')` cho kết quả nào?",
    options: ["Báo lỗi ValueError", "[12, 'n/a', 7]", "[12.0, NaN, 7.0]", "[12, 0, 7]"],
    correctOptionIndex: 2,
    explanation:
      "errors='coerce' biến chuỗi không đọc được thành NaN; vì có NaN nên cả cột là số thực (float64).",
  },
  "python-foundations.pf22": {
    question: "Hai nhóm có tổng doanh thu bằng nhau khi sắp giảm dần. Làm sao để kết quả luôn có thứ tự xác định?",
    options: [
      "Chạy lại cho đến khi thứ tự đúng",
      "Thêm khóa sắp xếp phụ, ví dụ tên nhóm",
      "Dùng `inplace=True`",
      "Không cần: pandas luôn xếp theo thứ tự xuất hiện",
    ],
    correctOptionIndex: 1,
    explanation:
      "Một khóa phụ như tên nhóm phân định các giá trị bằng nhau, nên kết quả không phụ thuộc vào thứ tự dữ liệu đầu vào.",
  },
  "python-foundations.pf23": {
    question: "Bạn gọi `ax.plot(x, y, label='A')` nhưng chú giải không hiện. Thiếu gì?",
    options: ["`plt.show()`", "`ax.legend()`", "`ax.set_title(...)`", "`fig.clear()`"],
    correctOptionIndex: 1,
    explanation:
      "`label=` chỉ đặt tên cho đường. Chú giải chỉ được vẽ khi gọi `ax.legend()`.",
  },
  "python-foundations.pf24": {
    question: "Biểu đồ đường “lợi nhuận theo tháng” có mỗi tháng nhiều điểm lộn xộn. Nguyên nhân hợp lý nhất?",
    options: [
      "Chưa gộp dữ liệu theo tháng trước khi vẽ",
      "Quên đặt tiêu đề",
      "Dùng màu mặc định",
      "Chú giải nằm sai góc",
    ],
    correctOptionIndex: 0,
    explanation:
      "Nếu mỗi tháng còn nhiều hàng, mỗi hàng thành một điểm. Cần gộp (groupby) để mỗi tháng có đúng một giá trị.",
  },
  "python-foundations.pf25": {
    question: "Bảng khách có hai dòng cùng `customer_id`. Nếu nối đơn hàng với bảng khách ngay, điều gì xảy ra?",
    options: [
      "Không có gì: merge tự bỏ dòng trùng",
      "Mỗi đơn của khách đó xuất hiện hai lần",
      "pandas báo lỗi",
      "Các đơn của khách đó bị xóa",
    ],
    correctOptionIndex: 1,
    explanation:
      "Mỗi dòng đơn khớp với cả hai dòng khách trùng khóa nên bị nhân đôi. Cần bỏ khóa trùng trước khi nối.",
  },
  "python-foundations.pf26": {
    question: "Vì sao nên loại bản ghi hỏng TRƯỚC khi chuẩn hóa các cột đặc trưng?",
    options: [
      "Để code ngắn hơn",
      "Vì mean và std tính trên dữ liệu hỏng sẽ bị méo",
      "Vì NumPy không chạy với giá trị hỏng",
      "Không có khác biệt",
    ],
    correctOptionIndex: 1,
    explanation:
      "Trung bình và độ lệch chuẩn dùng để chuẩn hóa phải tính trên tập dữ liệu sạch, nếu không giá trị sau chuẩn hóa sai cho mọi dòng.",
  },
};
