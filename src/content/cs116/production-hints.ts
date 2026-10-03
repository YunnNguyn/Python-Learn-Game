import { HintLevel, type HintSetId } from "../../core/domain";
import { type HintRegistry, type HintSet } from "../../core/hints";

export const CS116_HINT_SET_ID = {
  VS01: "cs116.hints.numpy.vs01" as HintSetId,
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

export const CS116_PRODUCTION_HINT_SETS = [CS116_VS01_HINT_SET] as const;

export function registerCs116Hints(registry: HintRegistry): void {
  for (const hintSet of CS116_PRODUCTION_HINT_SETS) {
    registry.registerHintSet(hintSet);
  }
}
