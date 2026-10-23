import { HintLevel, type HintSetId } from "../../core/domain";
import type { HintRegistry, HintSet } from "../../core/hints";

/**
 * H1-H4 hint sets of the M10 missions PF-16..PF-26 (PHASE-08). Same contract as the M8 / M9
 * sets: H1 concept, H2 strategy (neither names the line that solves the task), H3 the
 * construct / syntax, H4 pseudocode (the learner's explicit choice, recorded in the attempt).
 * The later missions give the learner less structure, so their H1/H2 stay about the way of
 * thinking and leave the choice of functions to the learner.
 */

const hintSetId = (value: string): HintSetId => value as HintSetId;

export const PYTHON_FOUNDATIONS_M10_HINT_SET_ID = {
  PF16: hintSetId("python-foundations.hints.pf16"),
  PF17: hintSetId("python-foundations.hints.pf17"),
  PF18: hintSetId("python-foundations.hints.pf18"),
  PF19: hintSetId("python-foundations.hints.pf19"),
  PF20: hintSetId("python-foundations.hints.pf20"),
  PF21: hintSetId("python-foundations.hints.pf21"),
  PF22: hintSetId("python-foundations.hints.pf22"),
  PF23: hintSetId("python-foundations.hints.pf23"),
  PF24: hintSetId("python-foundations.hints.pf24"),
  PF25: hintSetId("python-foundations.hints.pf25"),
  PF26: hintSetId("python-foundations.hints.pf26"),
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

const ID = PYTHON_FOUNDATIONS_M10_HINT_SET_ID;

export const PYTHON_FOUNDATIONS_M10_HINT_SETS: readonly HintSet[] = [
  hints(
    ID.PF16,
    "Mỗi mảng NumPy có một shape. Khi cộng hay nhân hai mảng có shape khác nhau, NumPy 'kéo giãn' các chiều có độ dài 1 cho khớp với chiều kia — đó là broadcasting. Vector (n,) khác cột (n, 1) khác hàng (1, n): cùng dữ liệu nhưng shape khác, nên kết quả khi ghép cũng khác.",
    "Hãy tự hỏi: muốn ra bảng n × m thì mảng thứ nhất cần có độ dài 1 ở chiều nào, và mảng thứ hai ở chiều nào? Sau đó mới viết phép toán. Với hàm broadcast_shape, đặt hai shape cạnh nhau, căn thẳng hàng về phía PHẢI, và xét từng cặp chiều: khi nào cặp chiều là hợp lệ, và kết quả của cặp đó là bao nhiêu?",
    "`a[:, np.newaxis]` hoặc `a.reshape(-1, 1)` đặt a thành một cột; `a.reshape(1, -1)` hoặc `a[np.newaxis, :]` đặt a thành một hàng. `a.shape` cho tuple shape. Trong hàm, `shape[::-1]` đảo thứ tự, `max(len(a), len(b))` là số chiều của kết quả, `raise ValueError(...)` báo shape không tương thích.",
    "Pseudocode: x_col ← x thêm một chiều ở cuối; y_row ← y thêm một chiều ở đầu; grid_sum ← x_col + y_row; grid_product ← x_col * y_row. broadcast_shape(a, b): đảo cả hai tuple; với mỗi vị trí i từ 0 đến (số chiều lớn hơn − 1): da ← a[i] nếu có, ngược lại 1; db tương tự; nếu da = db hoặc db = 1 thì thêm da vào kết quả; nếu da = 1 thì thêm db; ngược lại raise ValueError. Cuối cùng đảo kết quả lại và đổi sang tuple.",
  ),
  hints(
    ID.PF17,
    "Một phép gộp theo axis (sum, mean, max, ...) làm biến mất chiều mà nó gộp: axis=0 gộp các hàng, cho một kết quả mỗi CỘT; axis=1 gộp các cột, cho một kết quả mỗi HÀNG. Với keepdims=True, chiều đó không biến mất mà còn lại với độ dài 1 — nhờ vậy kết quả vẫn ghép được với mảng gốc bằng broadcasting.",
    "Với từng biến, xác định trước shape bạn mong đợi rồi mới viết. Khi cần 'trừ trung bình cột' hay 'chia cho tổng hàng', hãy nghĩ: kết quả gộp phải có shape (1, cột) hay (hàng, 1) để ghép được với (hàng, cột)? Với hàm masked_column_means, tách việc thành: mặt nạ các giá trị đạt, tổng các giá trị đạt theo cột, số lượng giá trị đạt theo cột — rồi chia, chú ý cột không có giá trị nào.",
    "`a.mean(axis=0)`, `a.sum(axis=1, keepdims=True)`, `mask = a >= t`, `mask.sum(axis=1)` đếm True, `np.where(mask, a, 0.0)` giữ giá trị đạt và thay phần còn lại bằng 0, `np.maximum(counts, 1)` tránh chia cho 0. Không dùng `a[mask]` cho bài theo cột vì nó làm phẳng mảng.",
    "Pseudocode: col_means ← trung bình theo axis 0; row_totals ← tổng theo axis 1 có keepdims; centered ← arr − (trung bình theo axis 0 có keepdims); row_share ← arr chia row_totals; passed ← arr ≥ pass_mark; passed_per_student ← tổng của passed theo axis 1. masked_column_means: mask ← data ≥ threshold; tổng ← tổng theo axis 0 của np.where(mask, data, 0.0); đếm ← tổng theo axis 0 của mask; trả về tổng chia np.maximum(đếm, 1). row_shares: data chia tổng theo axis 1 có keepdims.",
  ),
  hints(
    ID.PF18,
    "Tiền xử lý là một chuỗi bước nhỏ, mỗi bước nhận mảng và trả mảng: chọn cột, loại hàng lỗi, chuẩn hóa, chia lô. Mỗi bước giữ hoặc đổi shape theo một quy luật rõ ràng; hãy ghi ra shape trước và sau mỗi bước.",
    "Hai chỗ dễ sai: thứ tự (chọn cột TRƯỚC khi xét hàng lỗi, nếu không bạn loại nhầm hàng có -1 ở cột không dùng) và chiều của phép gộp (chuẩn hóa là THEO TỪNG CỘT). Với chia lô, nghĩ xem phải cắt bỏ bao nhiêu hàng để số hàng chia hết cho size, rồi reshape sao cho trục đầu là số lô. Hàm nào có thể gặp mảng 0 hàng thì kiểm tra cả trường hợp đó.",
    "`data[:, cols]` chọn cột bằng list chỉ số; `(data >= 0).all(axis=1)` cho mặt nạ theo hàng; `data[mask]` lọc hàng; `data.std(axis=0)` là độ lệch chuẩn tổng thể (ddof=0); `np.where(std == 0, 1.0, std)` tránh chia cho 0; `data.shape[0] // size` là số lô đầy đủ; `data[:k].reshape(số_lô, size, -1)`.",
    "Pseudocode: drop_invalid_rows ← lấy các hàng của data mà mọi giá trị ≥ 0. standardize ← (data − trung bình theo cột) chia (độ lệch chuẩn theo cột, thay 0 bằng 1). to_batches(data, size) ← nếu size < 1 thì raise ValueError; lô ← số hàng chia nguyên size; lấy lô × size hàng đầu và reshape thành (lô, size, số cột). prepare ← to_batches(standardize(drop_invalid_rows(data[:, cols])), size). prepared ← prepare(data, use_cols, batch_size); rows_kept ← số hàng của kết quả drop_invalid_rows trên các cột đã chọn, đổi sang int.",
  ),
  hints(
    ID.PF19,
    "DataFrame là một bảng: mỗi cột là một Series có dtype riêng, và mỗi hàng có một nhãn trong chỉ số hàng (index). Có hai cách chọn ô: theo NHÃN (tên hàng, tên cột) và theo VỊ TRÍ số (hàng thứ mấy, cột thứ mấy). Khi index chỉ là 0, 1, 2, ... hai cách cho cùng kết quả, nhưng sau khi đổi index thì khác hẳn.",
    "Đọc kỹ từng yêu cầu xem nó nói về TÊN hay VỊ TRÍ: 'theo nhãn trong by_id' nghĩa là dùng giá trị id, còn 'vị trí row_pos' nghĩa là số thứ tự hàng. Một cột lấy bằng tên cho Series, lấy bằng list tên (hai cặp ngoặc vuông) cho DataFrame. Cho describe_frame, nghĩ xem frame đã lưu sẵn những thông tin nào dưới dạng thuộc tính.",
    "`pd.DataFrame(dict)` dựng bảng từ dictionary các cột. Thuộc tính: `df.shape`, `df.columns`, `df.dtypes`, `len(df)`. `df['a']` là Series, `df[['a', 'b']]` là DataFrame, `df.set_index('id')` đổi index, `df.loc[nhãn_hàng, 'cột']`, `df.iloc[vị_trí_hàng, vị_trí_cột]`, `df.iloc[:2]` lấy 2 hàng đầu. `str(dtype)` đổi dtype thành tên.",
    "Pseudocode: df ← DataFrame từ people; shape_of_df ← shape của df; column_names ← list các cột; score_dtype ← str của dtype của cột score; names ← cột name; subset ← df với list hai cột name, score; first_two ← hai hàng đầu theo vị trí; by_id ← df với id làm index; name_of_target ← by_id.loc[target_id, 'name']; cell ← df.iloc[row_pos, vị trí của cột age]. describe_frame(f) ← dictionary rows = số hàng, columns = list cột, dtypes = {tên cột: str(dtype)} cho từng cột.",
  ),
  hints(
    ID.PF20,
    "Điều kiện Boolean trên cột (ví dụ: số lượng lớn hơn 3) cho ra một Series True/False — mặt nạ. Dùng mặt nạ để chọn hàng. Muốn kết hợp nhiều điều kiện trên pandas phải dùng toán tử theo từng phần tử (&, |, ~) với mỗi vế đặt trong ngoặc đơn, vì các từ khóa and/or của Python không làm việc với cả cột.",
    "Hàm của bạn nhận một DataFrame của nơi gọi: nếu bạn gán cột mới thẳng vào nó thì bảng của nơi gọi cũng bị đổi theo. Hãy làm việc trên một bản sao hoặc tạo bảng mới. Với select_orders, chia việc: có cột total chưa? điều kiện nào ghép với điều kiện nào? và đừng gọi bất cứ hàm nào đánh lại index nếu đề bảo giữ nguyên chỉ số.",
    "`frame.copy()` tạo bản sao, `frame.assign(total=...)` trả về bảng mới có thêm cột, `frame['qty'] * frame['unit_price']` nhân từng dòng, `mask = (a >= x) & (b.isin(list))`, `frame[mask]` hoặc `frame.loc[mask]` lọc hàng và giữ nguyên index.",
    "Pseudocode: add_total(frame) ← frame.assign(total = qty × unit_price). select_orders(frame, min_total, regions) ← bảng ← add_total(frame); mặt nạ ← (bảng.total ≥ min_total) VÀ (bảng.region nằm trong regions); trả về bảng[mặt nạ]. Cuối cùng with_total ← add_total(df); selected ← select_orders(df, min_total, target_regions).",
  ),
  hints(
    ID.PF21,
    "Dữ liệu thật hiếm khi sạch: số bị viết dưới dạng chuỗi, ô trống mang nhiều dạng ('', 'n/a', None), chữ hoa chữ thường lẫn lộn. Làm sạch là một chuỗi quy tắc được áp dụng theo thứ tự, và thứ tự quyết định kết quả (ví dụ: trung vị của tuổi phụ thuộc vào những hàng nào còn lại).",
    "Đọc kỹ thứ tự các bước (1) đến (5) trong đề và làm đúng thứ tự đó. Nhớ phân biệt: ô thiếu thật sự (None/NaN) khác chuỗi 'n/a'. Bước đổi chuỗi sang số cần một cách để giá trị hỏng trở thành thiếu thay vì làm chương trình dừng. Đừng sửa DataFrame đầu vào: làm việc trên bản sao.",
    "`frame.isna().sum()` đếm ô thiếu theo cột; `pd.to_numeric(series, errors='coerce')` đổi sang số, giá trị hỏng thành NaN; `series.str.replace('$', '', regex=False)` thay ký tự; `series.str.strip().str.title()` chuẩn hóa chữ; `series.fillna(giá_trị)` điền; `frame.dropna(subset=['cột'])` bỏ hàng thiếu; `series.astype('int64')`; `frame.reset_index(drop=True)`.",
    "Pseudocode: count_missing(frame) ← {cột: số ô thiếu của cột đó, đổi sang int} cho mọi cột. clean_records(frame): bản sao; đổi id sang số rồi bỏ hàng thiếu id; income ← bỏ '$' và ',' rồi đổi sang số (lỗi thành thiếu); bỏ hàng thiếu income; age ← đổi sang số (lỗi thành thiếu), điền chỗ thiếu bằng median của chính cột age; city ← strip, title, điền 'Unknown' cho chỗ thiếu; id đổi sang int64; reset_index; trả về bản sao.",
  ),
  hints(
    ID.PF22,
    "groupby chia bảng thành các nhóm theo một cột, áp dụng phép tổng hợp lên từng nhóm rồi ghép kết quả lại thành bảng mới có chỉ số là khóa nhóm. Thứ tự các nhóm mặc định chỉ là chuẩn khi khóa được sắp xếp; muốn thứ tự mà đề yêu cầu thì phải sắp xếp tường minh, kể cả khi hai nhóm bằng nhau.",
    "Chia thành các bước: (1) cột doanh thu của từng dòng, (2) tổng hợp theo nhóm với đúng bốn thống kê và đúng tên cột, (3) sắp xếp theo hai tiêu chí (giảm dần theo doanh thu, tăng dần theo tên nhóm khi hòa), (4) đặt tên chỉ số. Hàm top_category chỉ cần lấy phần tử đầu của kết quả đã sắp xếp; share_by_store là một groupby khác, rồi chia cho tổng.",
    "`frame.assign(revenue=...)`, `grouped = frame.groupby('category')`, `grouped.agg(orders=('revenue', 'size'), units=('units', 'sum'), ...)` (aggregation đặt tên), `report.sort_values(['revenue', 'category'], ascending=[False, True])` cần category là cột nên có thể `reset_index()` rồi `set_index('category')` lại, `report.index[0]`, `series / series.sum()`, `series.sort_index()`, thuộc tính `series.name`.",
    "Pseudocode: category_report(frame): t ← bản sao có thêm cột revenue = units × price; gom ← nhóm t theo category, tính orders = số dòng, units = tổng units, revenue = tổng revenue; thêm avg_revenue = revenue chia orders; sắp xếp theo revenue giảm dần rồi category tăng dần; giữ index tên 'category'. top_category ← nhãn đầu tiên của chỉ số. share_by_store(frame): tổng doanh thu theo store; chia cho tổng chung; sắp xếp theo store tăng dần; đặt tên Series là 'share'.",
  ),
  hints(
    ID.PF23,
    "Một biểu đồ có ý nghĩa gồm dữ liệu đúng và những chữ giúp người xem hiểu nó: tiêu đề nói về cái gì, nhãn trục nói đo gì và đơn vị nào, chú giải nói mỗi đường là gì. Trong Matplotlib, bạn tạo một vùng vẽ (Axes) và mọi thao tác sau đó thực hiện trên đúng vùng vẽ ấy.",
    "Tách mỗi hàm thành ba phần: (1) vẽ dữ liệu, (2) đặt chữ (tiêu đề, nhãn trục), (3) chú giải. Thứ tự vẽ quyết định thứ tự của chú giải. Với biểu đồ cột xếp hạng, xếp dữ liệu TRƯỚC khi vẽ (không vẽ rồi mong biểu đồ tự xếp), và nhớ khi hòa thì xếp theo tên. Hàm phải trả về ax.",
    "`ax.plot(x, y, label='...')` vẽ đường, `ax.bar(tên, giá_trị)` vẽ cột, `ax.set_title(...)`, `ax.set_xlabel(...)`, `ax.set_ylabel(...)`, `ax.legend()` hiện chú giải từ các `label`. `sorted(zip(...), key=lambda p: (-p[1], p[0]))` xếp theo hai tiêu chí; `names, amounts = zip(*cặp)` tách lại.",
    "Pseudocode: plot_trend: fig, ax ← plt.subplots(); ax.plot(months, revenue, label='Doanh thu'); ax.plot(months, cost, label='Chi phí'); đặt title, xlabel, ylabel; ax.legend(); return ax. plot_ranking: cặp ← danh sách (tên, giá trị) xếp theo giá trị giảm dần rồi tên tăng dần; tách thành hai list; fig, ax ← plt.subplots(); ax.bar(list tên, list giá trị); đặt title và ylabel; return ax. Cuối: ax_trend ← plot_trend(...); ax_rank ← plot_ranking(...).",
  ),
  hints(
    ID.PF24,
    "Một biểu đồ gây hiểu lầm vẫn chạy mà không báo lỗi — lỗi nằm ở dữ liệu được vẽ hoặc ở chữ trên biểu đồ. Cách kiểm tra: tự tính trên giấy (hoặc bằng pandas) con số mà mỗi điểm/cột PHẢI có, rồi đối chiếu với thứ đang được vẽ.",
    "Đi từng hàm và hỏi bốn câu: dữ liệu đã được tổng hợp đúng cách chưa (tổng hay trung bình? theo nhóm nào?), phép tính có đúng ý nghĩa không, hai trục có bị đổi chỗ không, và nhãn/chú giải có khớp với thứ được vẽ không. Sửa từng lỗi một và chạy lại để biểu đồ hiện ra, rồi đọc thông báo kiểm tra: nó nói phần nào của biểu đồ chưa đúng.",
    "`df.groupby('month')[cột].sum()` tổng theo nhóm và cho Series có index là nhóm đã sắp xếp; `s.index` và `s.values` là trục x và y; `ax.plot(x, y, label=...)` — x trước, y sau; `ax.set_xlabel` cho trục ngang, `ax.set_ylabel` cho trục dọc; `ax.legend()` hiện chú giải; `ax.bar(tên, giá_trị)`.",
    "Pseudocode: plot_monthly_profit: tổng ← nhóm df theo month, tổng của revenue và của cost; lợi nhuận ← revenue − cost (trừ, không cộng); vẽ đường với x = các tháng, y = lợi nhuận, label 'Lợi nhuận'; xlabel cho trục ngang, ylabel cho trục dọc, title; hiện chú giải; trả về ax. plot_region_revenue: tổng revenue theo từng region (mỗi vùng một giá trị); vẽ cột với x = tên vùng, y = tổng; title từ tham số; ylabel 'Doanh thu'; trả về ax.",
  ),
  hints(
    ID.PF25,
    "Một pipeline đọc dữ liệu có ba lớp: đọc file thành bảng, kiểm tra cấu trúc (có đủ cột không) TRƯỚC khi làm gì khác, rồi mới làm sạch và ghép. Phép join chọn hàng nào được giữ: đề nói rõ phải loại đơn của khách không có trong bảng khách, đó là loại join nào?",
    "Làm sạch từng bảng riêng trước rồi mới ghép: làm sạch khách (khoảng trắng, chữ hoa, trùng id), lọc đơn hàng (trạng thái, số tiền), ghép theo customer_id, cuối cùng chọn cột, sắp xếp và đánh lại index. Với orphans, nghĩ xem bạn có thể tính nó từ số hàng trước và sau khi ghép không, hay cần kiểm tra thành viên trực tiếp. Đường dẫn file luôn là đường dẫn tương đối trong thư mục data.",
    "`pd.read_csv('data/' + tên_file)`, `set(required) - set(frame.columns)` cho các cột thiếu, `frame.drop_duplicates(subset='customer_id', keep='first')`, `series.str.strip()`, `.str.lower()`, `.str.title()`, `frame.dropna(subset=['amount'])`, `orders.merge(customers, on='customer_id', how='inner')`, `.sort_values('order_id')`, `.reset_index(drop=True)`, `series.isin(other_series)`.",
    "Pseudocode: check_columns(frame, required): thiếu ← các cột trong required mà frame không có; nếu thiếu không rỗng thì raise ValueError nêu tên chúng. build_dataset: khách ← bản sao, bỏ trùng customer_id giữ dòng đầu, strip name, strip + title city; đơn ← bản sao với status strip + lower, giữ status = 'paid' và amount có giá trị; kết quả ← ghép trong đơn với khách theo customer_id (giữ đơn có khách); chọn đúng 5 cột, sắp xếp theo order_id, reset_index(drop=True). Script: đọc hai file, gọi check_columns, dataset ← build_dataset(...); orphans ← số đơn đã lọc mà customer_id không thuộc khách.",
  ),
  hints(
    ID.PF26,
    "Đây là một dự án nhỏ, không phải bài điền chỗ trống: bạn quyết định cách chia hàm phụ. Một cách làm tốt là tách theo vòng đời dữ liệu — làm sạch bảng, dựng ma trận, tính thống kê, vẽ — rồi để prepare chỉ ghép chúng. Kiểm tra từng tầng bằng cách in kích thước và vài hàng đầu.",
    "Chia bài thành các bước nhỏ và thử từng bước trên dữ liệu thật: dữ liệu thô khác dữ liệu sạch ở những chỗ nào? Thứ tự các bước quan trọng vì bước sau dựa vào kết quả của bước trước. Ma trận X phải lấy từ bảng SẠCH, không phải bảng thô, và con số rejected phải đối chiếu được với số dòng của đầu vào.",
    "`df.drop_duplicates(subset='id', keep='first')`, `pd.to_numeric(..., errors='coerce')`, `mask = (a > 0) & (b >= 1) & (c <= year) & ...` (NaN so sánh luôn cho False), `df[mask].copy()`, `.astype({'rooms': 'int64'})`, `.str.strip().str.title()`, `clean[['area_m2', 'rooms', 'age']].to_numpy(dtype=float)`, `x.mean(axis=0)`, `x.std(axis=0)`, `np.where(std == 0, 1.0, std)`, `clean.groupby('district')['price_per_m2'].mean().to_dict()`, `ax.scatter(x, y)`, `float(...)` và `int(...)` để đổi giá trị NumPy thành giá trị Python.",
    "Pseudocode: prepare(df): bảng ← df bỏ id lặp (giữ đầu); đổi bốn cột sang số; mặt nạ ← (area > 0) và (rooms ≥ 1) và (year ≤ 2025) và (price > 0) và (district không thiếu); clean ← hàng thỏa mặt nạ, district strip + title, thêm age và price_per_m2, ép kiểu từng cột đúng dtype, chọn đúng thứ tự cột, reset_index. X ← ma trận 3 cột của clean, trừ trung bình rồi chia độ lệch chuẩn (cột hằng số thì chia 1). stats ← rows, rejected = số dòng df − số dòng clean, trung bình price_per_m2 và trung bình theo quận (đổi sang float). Trả về dict {clean, X, stats}. plot_diagnostic(clean): fig, ax ← plt.subplots(); ax.scatter(area_m2, price_per_m2); đặt title, xlabel, ylabel; return ax.",
  ),
];

export function registerPythonFoundationsM10Hints(registry: HintRegistry): void {
  for (const hintSet of PYTHON_FOUNDATIONS_M10_HINT_SETS) registry.registerHintSet(hintSet);
}
