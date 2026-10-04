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

export const CS116_PRODUCTION_HINT_SETS = [
  CS116_VS01_HINT_SET,
  CS116_VS02_HINT_SET,
  CS116_VS03_HINT_SET,
  CS116_VS04_HINT_SET,
  CS116_VS05_HINT_SET,
  CS116_VS06_HINT_SET,
  CS116_VS07_HINT_SET,
] as const;

export function registerCs116Hints(registry: HintRegistry): void {
  for (const hintSet of CS116_PRODUCTION_HINT_SETS) {
    registry.registerHintSet(hintSet);
  }
}
