import { HintLevel, type HintSetId } from "../../core/domain";
import { type HintRegistry, type HintSet } from "../../core/hints";

export const CS116_HINT_SET_ID = {
  VS01: "cs116.hints.numpy.vs01" as HintSetId,
  VS02: "cs116.hints.numpy.vs02" as HintSetId,
  VS03: "cs116.hints.numpy.vs03" as HintSetId,
  VS04: "cs116.hints.numpy.vs04" as HintSetId,
  VS05: "cs116.hints.numpy.vs05" as HintSetId,
  VS06: "cs116.hints.numpy.vs06" as HintSetId,
  VS07: "cs116.hints.numpy.vs07" as HintSetId,
  LC02: "cs116.hints.pandas.lc02" as HintSetId,
  LC03: "cs116.hints.pandas.lc03" as HintSetId,
  LC04: "cs116.hints.pandas.lc04" as HintSetId,
  LC05: "cs116.hints.pandas.lc05" as HintSetId,
  LC06: "cs116.hints.pandas.lc06" as HintSetId,
  LC07: "cs116.hints.pandas.lc07" as HintSetId,
  LC08: "cs116.hints.matplotlib.lc08" as HintSetId,
  LC09: "cs116.hints.matplotlib.lc09" as HintSetId,
  LC10: "cs116.hints.pandas.lc10" as HintSetId,
  LC11: "cs116.hints.pillow.lc11" as HintSetId,
  LC12: "cs116.hints.pillow.lc12" as HintSetId,
  LC13: "cs116.hints.pandas.lc13" as HintSetId,
  W301: "cs116.hints.ml.w301" as HintSetId,
  W302: "cs116.hints.ml.w302" as HintSetId,
  W303: "cs116.hints.ml.w303" as HintSetId,
  W401: "cs116.hints.data-validation.w401" as HintSetId,
} as const;

export const CS116_VS01_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.VS01,
  hints: [
    {
      level: HintLevel.H1,
      text: "Một Python list lồng nhau chưa phải là NumPy ndarray. Hãy nghĩ về bước chuyển dữ liệu sang kiểu mảng NumPy trước khi đọc cấu trúc của nó.",
    },
    {
      level: HintLevel.H2,
      text: "Tạo một ndarray từ biến `matrix` trước. Sau đó lấy thông tin shape và số chiều từ chính ndarray đó.",
    },
    {
      level: HintLevel.H3,
      text: "Các thành phần cần dùng trong bài này là `np.array(...)`, thuộc tính `.shape` và thuộc tính `.ndim`.",
    },
    {
      level: HintLevel.H4,
      text: "Pseudocode: tạo `result` từ `matrix` → gán `shape_result` bằng shape của `result` → gán `ndim_result` bằng ndim của `result`.",
    },
  ],
};

export const CS116_VS02_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.VS02,
  hints: [
    {
      level: HintLevel.H1,
      text: "`telemetry` đã là ndarray. Bài này chỉ yêu cầu bạn đọc cấu trúc hiện có, không cần biến đổi dữ liệu.",
    },
    {
      level: HintLevel.H2,
      text: "Một thông tin cho biết kích thước từng trục, thông tin còn lại cho biết có bao nhiêu trục.",
    },
    {
      level: HintLevel.H3,
      text: "Hai thuộc tính cần nhớ là `.shape` và `.ndim`.",
    },
    {
      level: HintLevel.H4,
      text: "Pseudocode: đọc shape của `telemetry` vào `shape_result`, rồi đọc ndim của `telemetry` vào `ndim_result`.",
    },
  ],
};

export const CS116_VS03_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.VS03,
  hints: [
    {
      level: HintLevel.H1,
      text: "Với mảng 2 chiều, trục đầu tiên là hàng và trục thứ hai là cột. Bạn cần giữ mọi hàng nhưng chỉ lấy một cột.",
    },
    {
      level: HintLevel.H2,
      text: "Dùng `targetColumnIndex` ở vị trí chỉ số cột và biểu diễn 'mọi hàng' ở vị trí chỉ số hàng.",
    },
    {
      level: HintLevel.H3,
      text: "Mẫu indexing NumPy cần nhớ là `array[:, column_index]`.",
    },
    {
      level: HintLevel.H4,
      text: "Pseudocode: đổi `matrix` thành ndarray `telemetry` → lấy `telemetry[:, targetColumnIndex]` vào `result`.",
    },
  ],
};

export const CS116_VS04_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.VS04,
  hints: [
    {
      level: HintLevel.H1,
      text: "So sánh một ndarray với một ngưỡng sẽ tạo ra một ndarray boolean có cùng chiều dài.",
    },
    {
      level: HintLevel.H2,
      text: "Tạo mask từ `sensor_values` theo quy tắc GT trong đề, sau đó dùng chính mask đó để lọc `sensor_ids`.",
    },
    {
      level: HintLevel.H3,
      text: "GT dùng toán tử `>`. NumPy cho phép lọc bằng cú pháp dạng `array[mask]`.",
    },
    {
      level: HintLevel.H4,
      text: "Pseudocode: `mask = sensor_values > threshold` → `result = sensor_ids[mask]`.",
    },
  ],
};

export const CS116_VS05_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.VS05,
  hints: [
    {
      level: HintLevel.H1,
      text: "Đọc kỹ `comparison` trong dữ liệu. Biến thể này thay đổi quy tắc biên so với bài trước.",
    },
    {
      level: HintLevel.H2,
      text: "Bạn vẫn cần hai bước: tạo boolean mask từ `sensor_values`, rồi dùng mask để lọc `sensor_ids`.",
    },
    {
      level: HintLevel.H3,
      text: "GTE nghĩa là lớn hơn hoặc bằng, dùng toán tử `>=`. Lọc ndarray bằng `array[mask]`.",
    },
    {
      level: HintLevel.H4,
      text: "Pseudocode: tạo ndarray values/ids → `mask = values >= threshold` → lấy các ID tại vị trí mask là True.",
    },
  ],
};

export const CS116_VS06_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.VS06,
  hints: [
    {
      level: HintLevel.H1,
      text: "Tách bài toán thành ba phần: lấy hai cột cần dùng, tạo hai điều kiện riêng, rồi kết hợp chúng theo từng phần tử.",
    },
    {
      level: HintLevel.H2,
      text: "Cột 0 là distance, cột 1 là threat. Một contact chỉ được chọn khi cả điều kiện khoảng cách và mức nguy cơ đều đúng.",
    },
    {
      level: HintLevel.H3,
      text: "Dùng `telemetry[:, 0]`, `telemetry[:, 1]` và toán tử NumPy `&`. Mỗi điều kiện nên được đặt trong ngoặc.",
    },
    {
      level: HintLevel.H4,
      text: "Pseudocode: lấy distance/threat → `(distance <= distanceLimit) & (threat >= threatThreshold)` → dùng mask lọc `contact_ids`.",
    },
  ],
};

export const CS116_VS07_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.VS07,
  hints: [
    {
      level: HintLevel.H1,
      text: "Đây là bài ôn tổng hợp. Hãy dựng lại pipeline theo thứ tự: ndarray → cấu trúc → cột → điều kiện → mask → kết quả.",
    },
    {
      level: HintLevel.H2,
      text: "Kiểm tra từng biến đầu ra một: `telemetry`, `shape_result`, `ndim_result`, hai cột, `mask`, rồi `result`.",
    },
    {
      level: HintLevel.H3,
      text: "Những mảnh cú pháp có thể cần: `np.array`, `.shape`, `.ndim`, `[:, index]`, so sánh vector hóa, `&`, và `array[mask]`.",
    },
    {
      level: HintLevel.H4,
      text: "Pseudocode: tạo telemetry từ contacts → đọc shape/ndim → tách distance/threat → kết hợp hai điều kiện → lọc IDs bằng mask.",
    },
  ],
};

export const CS116_LC02_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.LC02,
  hints: [
    {
      level: HintLevel.H1,
      text: "Dataset đã có sẵn trong workspace. Hãy bắt đầu từ DataFrame `df` được đọc bằng pandas rồi quan sát cấu trúc của nó.",
    },
    {
      level: HintLevel.H2,
      text: "Bạn cần lưu hai thông tin: kích thước DataFrame dưới dạng tuple và danh sách tên cột dưới dạng list Python.",
    },
    {
      level: HintLevel.H3,
      text: "Dùng `df.shape` cho kích thước và `list(df.columns)` để chuyển Index tên cột thành list.",
    },
    {
      level: HintLevel.H4,
      text: "Pseudocode: đọc `data/telemetry.csv` bằng `pd.read_csv` → `shape_result = df.shape` → `columns_result = list(df.columns)`.",
    },
  ],
};

export const CS116_LC03_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.LC03,
  hints: [
    {
      level: HintLevel.H1,
      text: "Trong pandas, chọn một cột bằng tên cột có thể tạo Series hoặc DataFrame tùy số lớp ngoặc vuông bạn dùng.",
    },
    {
      level: HintLevel.H2,
      text: "Một cặp ngoặc với chuỗi tên cột trả về Series; hai cặp ngoặc với list tên cột giữ kết quả ở dạng DataFrame.",
    },
    {
      level: HintLevel.H3,
      text: "Dùng `df[\"distance\"]` cho Series và `df[[\"distance\"]]` cho DataFrame một cột. Series có `.ndim == 1`.",
    },
    {
      level: HintLevel.H4,
      text: "Pseudocode: đọc CSV → tạo distance_series và distance_frame → `series_values = distance_series.tolist()` → đọc ndim và shape vào các biến kết quả.",
    },
  ],
};

export const CS116_LC04_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.LC04,
  hints: [
    {
      level: HintLevel.H1,
      text: "Boolean filtering của pandas cũng bắt đầu bằng một phép so sánh theo từng hàng, nhưng điều kiện được tạo từ một Series của DataFrame.",
    },
    {
      level: HintLevel.H2,
      text: "Tạo điều kiện từ cột threat với threshold, dùng điều kiện đó để lọc df, rồi lấy cột contact_id của các hàng còn lại.",
    },
    {
      level: HintLevel.H3,
      text: "Mẫu chính là `df[df[\"threat\"] >= threshold]`. Sau đó có thể lấy `filtered[\"contact_id\"].tolist()`.",
    },
    {
      level: HintLevel.H4,
      text: "Pseudocode: filtered = df[df[\"threat\"] >= threshold] → filtered_ids = filtered[\"contact_id\"].tolist() → filtered_count = len(filtered).",
    },
  ],
};

export const CS116_LC05_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.LC05,
  hints: [
    {
      level: HintLevel.H1,
      text: "Trước khi điền dữ liệu, hãy đo xem cột signal đang thiếu bao nhiêu giá trị.",
    },
    {
      level: HintLevel.H2,
      text: "Series có .isna() để tạo mask missing; .sum() đếm số True. Median là một lựa chọn đơn giản và bền hơn mean khi có outlier.",
    },
    {
      level: HintLevel.H3,
      text: "Dùng df[\"signal\"].isna().sum(), df[\"signal\"].median() và df[\"signal\"].fillna(...).",
    },
    {
      level: HintLevel.H4,
      text: "Pseudocode: đếm missing trước → median_signal = median của signal → clean_signal = fillna(median_signal) → đếm missing sau → .tolist().",
    },
  ],
};

export const CS116_LC06_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.LC06,
  hints: [
    {
      level: HintLevel.H1,
      text: "groupby tách DataFrame thành các nhóm theo một khóa; sau đó bạn chọn cột số và áp dụng phép aggregation.",
    },
    {
      level: HintLevel.H2,
      text: "Bạn cần nhóm theo team, chọn score, tính mean, rồi sort theo index để kết quả ổn định.",
    },
    {
      level: HintLevel.H3,
      text: "Mẫu chính: df.groupby(\"team\")[\"score\"].mean().sort_index().",
    },
    {
      level: HintLevel.H4,
      text: "Pseudocode: grouped = groupby(team) → mean(score) → sort_index → mean_scores = grouped.to_dict() → group_count = len(grouped).",
    },
  ],
};

export const CS116_LC07_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.LC07,
  hints: [
    {
      level: HintLevel.H1,
      text: "Pivot table biến dữ liệu dạng dài thành bảng hai chiều. Bạn cần xác định biến nào làm hàng, cột và giá trị trong mỗi ô.",
    },
    {
      level: HintLevel.H2,
      text: "Ở bài này team là index, metric là columns, value là values và mỗi ô dùng mean.",
    },
    {
      level: HintLevel.H3,
      text: "Dùng pd.pivot_table(df, index=\"team\", columns=\"metric\", values=\"value\", aggfunc=\"mean\").",
    },
    {
      level: HintLevel.H4,
      text: "Sau pivot, sort index và columns; lấy list(pivot.columns) và pivot.round(3).to_numpy().tolist().",
    },
  ],
};

export const CS116_LC08_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.LC08,
  hints: [
    {
      level: HintLevel.H1,
      text: "Matplotlib tách Figure (toàn bộ hình) và Axes (vùng vẽ). Bài này dùng Axes để vẽ và đặt nhãn.",
    },
    {
      level: HintLevel.H2,
      text: "Vẽ epoch trên trục x và loss trên trục y bằng ax.plot, sau đó đặt xlabel, ylabel và title đúng chuỗi đề yêu cầu.",
    },
    {
      level: HintLevel.H3,
      text: "Các lời gọi cần dùng: ax.plot(df[\"epoch\"], df[\"loss\"]), ax.set_xlabel(...), ax.set_ylabel(...), ax.set_title(...).",
    },
    {
      level: HintLevel.H4,
      text: "Hoàn thành bốn lời gọi trên rồi giữ nguyên fig.savefig(output_path, ...). File PNG phải xuất hiện trong danh sách artifacts.",
    },
  ],
};

export const CS116_LC09_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.LC09,
  hints: [
    {
      level: HintLevel.H1,
      text: "Bài này giống LC-08 về Figure/Axes nhưng primitive vẽ đổi từ line sang scatter.",
    },
    {
      level: HintLevel.H2,
      text: "Tạo Figure/Axes bằng plt.subplots(), rồi đưa distance lên x và threat lên y.",
    },
    {
      level: HintLevel.H3,
      text: "Mẫu chính: fig, ax = plt.subplots() và ax.scatter(df[\"distance\"], df[\"threat\"]).",
    },
    {
      level: HintLevel.H4,
      text: "Đặt xlabel='distance', ylabel='threat', title='Threat by distance', rồi giữ savefig đúng output_path để artifact được tạo.",
    },
  ],
};

export const CS116_LC10_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.LC10,
  hints: [
    {
      level: HintLevel.H1,
      text: "Hai bảng có chung khóa user_id. Với inner join, chỉ các khóa xuất hiện ở cả hai phía mới còn trong kết quả.",
    },
    {
      level: HintLevel.H2,
      text: "Hãy dùng bảng events làm phía trái, ghép users theo user_id, rồi kiểm tra số hàng và các cột region/spend sau merge.",
    },
    {
      level: HintLevel.H3,
      text: "Mẫu chính: events.merge(users, on=\"user_id\", how=\"inner\").",
    },
    {
      level: HintLevel.H4,
      text: "Pseudocode: merged = inner merge → merged_ids = merged[\"user_id\"].tolist() → merged_regions = merged[\"region\"].tolist() → total_spend = int(merged[\"spend\"].sum()).",
    },
  ],
};

export const CS116_LC11_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.LC11,
  hints: [
    {
      level: HintLevel.H1,
      text: "Ảnh RGB có thể nhìn như một NumPy array 3 chiều: height × width × channels.",
    },
    {
      level: HintLevel.H2,
      text: "Pillow đọc ảnh; np.array chuyển pixel sang ndarray. Lưu ý image.size của Pillow là (width, height), còn ndarray.shape là (height, width, channels).",
    },
    {
      level: HintLevel.H3,
      text: "Dùng pixels = np.array(image), rồi đọc image.size, pixels.shape, pixels.shape[2] và pixel tại [0, 0].",
    },
    {
      level: HintLevel.H4,
      text: "Pseudocode: pixels=np.array(image) → image_size=image.size → pixel_shape=pixels.shape → channels=pixels.shape[2] → top_left=pixels[0,0].tolist().",
    },
  ],
};

export const CS116_LC12_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.LC12,
  hints: [
    {
      level: HintLevel.H1,
      text: "Pillow crop dùng box (left, upper, right, lower); cạnh right/lower không thuộc vùng lấy.",
    },
    {
      level: HintLevel.H2,
      text: "Crop góc trên-trái bằng (0, 0, 2, 2), sau đó resize kết quả thành (4, 4).",
    },
    {
      level: HintLevel.H3,
      text: "Mẫu chính: cropped = image.crop((0, 0, 2, 2)); resized = cropped.resize((4, 4)); sau đó resized.save(output_path).",
    },
    {
      level: HintLevel.H4,
      text: "Sau khi lưu, chuyển resized sang np.array, rồi ghi cropped.size, resized.size, resized_pixels.shape và kiểm tra Path(output_path).is_file().",
    },
  ],
};

export const CS116_LC13_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.LC13,
  hints: [
    {
      level: HintLevel.H1,
      text: "Một cột mới trong DataFrame được tạo bằng cách gán vào df[\"tên_cột\"]. Giá trị có thể là phép tính trên các cột có sẵn.",
    },
    {
      level: HintLevel.H2,
      text: "Phép nhân hai cột là element-wise theo từng hàng: df[\"a\"] * df[\"b\"]. Sau khi có cột value, dùng nó để tìm hàng lớn nhất và tổng.",
    },
    {
      level: HintLevel.H3,
      text: "Mẫu chính: df[\"value\"] = df[\"close\"] * df[\"volume\"]; columns_after = list(df.columns); value_list = df[\"value\"].tolist().",
    },
    {
      level: HintLevel.H4,
      text: "top_symbol = df.loc[df[\"value\"].idxmax(), \"symbol\"]; total_value = int(df[\"value\"].sum()).",
    },
  ],
};

export const CS116_W301_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.W301,
  hints: [
    {
      level: HintLevel.H1,
      text: "Một pipeline hồi quy gồm: tách X (đặc trưng) và y (mục tiêu), chia train/test, huấn luyện rồi đánh giá trên tập test.",
    },
    {
      level: HintLevel.H2,
      text: "Dùng train_test_split với test_size=0.25 và random_state=42 để kết quả lặp lại được. Huấn luyện bằng .fit(X_train, y_train).",
    },
    {
      level: HintLevel.H3,
      text: "from sklearn.model_selection import train_test_split; from sklearn.linear_model import LinearRegression. model.coef_[0] là hệ số, model.intercept_ là hệ số chặn.",
    },
    {
      level: HintLevel.H4,
      text: "pred_10 = model.predict(pd.DataFrame({\"area\": [10]}))[0]; r2 = model.score(X_test, y_test); n_train = len(X_train); n_test = len(X_test).",
    },
  ],
};

export const CS116_W302_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.W302,
  hints: [
    {
      level: HintLevel.H1,
      text: "CS116 Bài 3 chia 7:2:1 — train để học, validation để chọn mô hình/hyperparameter, test chỉ dùng ở bước cuối cùng để báo cáo. Tuyệt đối không tune trên test.",
    },
    {
      level: HintLevel.H2,
      text: "Chia 7:2:1 bằng 2 lần train_test_split: lần 1 tách test 10% khỏi toàn bộ, lần 2 tách val 2/9 khỏi phần còn lại (vì 2/(7+2)=2/9).",
    },
    {
      level: HintLevel.H3,
      text: "X_tmp, X_test, y_tmp, y_test = train_test_split(X, y, test_size=0.1, random_state=42); X_train, X_val, y_train, y_val = train_test_split(X_tmp, y_tmp, test_size=2/9, random_state=42).",
    },
    {
      level: HintLevel.H4,
      text: "val_r2 = round(float(model.score(X_val, y_val)), 4); test_r2 = round(float(model.score(X_test, y_test)), 4); n_train/n_val/n_test = len(X_train)/len(X_val)/len(X_test).",
    },
  ],
};

export const CS116_W303_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.W303,
  hints: [
    {
      level: HintLevel.H1,
      text: "Luôn tính CẢ train R² lẫn test R². Nếu train cao mà test thấp hơn hẳn — mô hình đã học thuộc nhiễu của dữ liệu train thay vì quy luật thực.",
    },
    {
      level: HintLevel.H2,
      text: "Dùng chính model.score: train_r2 trên (X_train, y_train) và test_r2 trên (X_test, y_test). Gap = train_r2 - test_r2 là chỉ báo overfit.",
    },
    {
      level: HintLevel.H3,
      text: "train_r2 = round(float(model.score(X_train, y_train)), 4); test_r2 = round(float(model.score(X_test, y_test)), 4); gap = round(train_r2 - test_r2, 4).",
    },
    {
      level: HintLevel.H4,
      text: "coef = round(float(model.coef_[0]), 2); intercept = round(float(model.intercept_), 2); n_train = len(X_train); n_test = len(X_test).",
    },
  ],
};

export const CS116_W401_HINT_SET: HintSet = {
  id: CS116_HINT_SET_ID.W401,
  hints: [
    {
      level: HintLevel.H1,
      text: "Luôn làm sạch dữ liệu trước khi fit mô hình. Thứ tự chuẩn CS116: kiểm tra shape → đếm missing → bỏ hàng thiếu (dropna) → bỏ hàng trùng (drop_duplicates).",
    },
    {
      level: HintLevel.H2,
      text: "df.isna().sum() trả về Series số missing cho mỗi cột; truy cập theo tên cột để lấy ra int. df.dropna() và df.drop_duplicates() đều trả về DataFrame mới (không sửa gốc).",
    },
    {
      level: HintLevel.H3,
      text: 'missing_price = int(df["price"].isna().sum()); df_no_na = df.dropna(); after_dropna_shape = list(df_no_na.shape).',
    },
    {
      level: HintLevel.H4,
      text: 'clean = df_no_na.drop_duplicates(); final_shape = list(clean.shape); final_order_ids = clean["order_id"].tolist().',
    },
  ],
};

export const CS116_PRODUCTION_HINT_SETS = [
  CS116_VS01_HINT_SET,
  CS116_VS02_HINT_SET,
  CS116_VS03_HINT_SET,
  CS116_VS04_HINT_SET,
  CS116_VS05_HINT_SET,
  CS116_VS06_HINT_SET,
  CS116_VS07_HINT_SET,
  CS116_LC02_HINT_SET,
  CS116_LC03_HINT_SET,
  CS116_LC04_HINT_SET,
  CS116_LC05_HINT_SET,
  CS116_LC06_HINT_SET,
  CS116_LC07_HINT_SET,
  CS116_LC08_HINT_SET,
  CS116_LC09_HINT_SET,
  CS116_LC10_HINT_SET,
  CS116_LC11_HINT_SET,
  CS116_LC12_HINT_SET,
  CS116_LC13_HINT_SET,
  CS116_W301_HINT_SET,
  CS116_W302_HINT_SET,
  CS116_W303_HINT_SET,
  CS116_W401_HINT_SET,
] as const;

export function registerCs116Hints(registry: HintRegistry): void {
  for (const hintSet of CS116_PRODUCTION_HINT_SETS) {
    registry.registerHintSet(hintSet);
  }
}
