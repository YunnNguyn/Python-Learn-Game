import type { JsonObject } from "../../../core/domain";
import type { MissionGenerator } from "../../../core/generators";

function assertTemplateVersion(templateVersion: number): void {
  if (!Number.isSafeInteger(templateVersion) || templateVersion < 1) {
    throw new RangeError(
      "CSV Inspection generator requires templateVersion >= 1.",
    );
  }
}

function assertEmptyConfig(config: JsonObject | undefined): void {
  if (config === undefined) {
    throw new TypeError("CSV Inspection generator requires config {}.");
  }
  const keys = Object.keys(config);
  if (keys.length > 0) {
    throw new TypeError(
      `CSV Inspection config contains unsupported field: ${keys[0]}`,
    );
  }
}

export const csvInspectionGenerator: MissionGenerator = {
  generate({ templateVersion, config }) {
    assertTemplateVersion(templateVersion);
    assertEmptyConfig(config);

    return {
      learner: {
        objective:
          "Đọc file data/telemetry.csv bằng pandas, sau đó lưu shape của DataFrame và danh sách tên cột vào đúng biến kết quả.",
        context:
          "Dataset đã được chuẩn bị sẵn trong Local Python workspace tại `data/telemetry.csv`. Dùng `pd.read_csv(...)`, `df.shape` và `list(df.columns)` để kiểm tra cấu trúc dữ liệu.",
      },
      grading: {
        data: {
          expectedShape: [3, 3],
          expectedColumns: ["contact_id", "distance", "threat"],
        },
      },
    };
  },
};
