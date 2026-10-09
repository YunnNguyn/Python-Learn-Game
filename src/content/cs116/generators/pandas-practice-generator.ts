import { z } from "zod";

import type { JsonObject } from "../../../core/domain";
import type { MissionGenerator } from "../../../core/generators";

const configSchema = z
  .object({
    mode: z.enum(["SELECT_COLUMN", "FILTER_ROWS"]),
  })
  .strict();

function assertTemplateVersion(templateVersion: number): void {
  if (!Number.isSafeInteger(templateVersion) || templateVersion < 1) {
    throw new RangeError(
      "pandas practice generator requires templateVersion >= 1.",
    );
  }
}

function parseConfig(config: JsonObject | undefined) {
  if (config === undefined) {
    throw new TypeError("pandas practice generator requires config.");
  }
  return configSchema.parse(config);
}

export const pandasPracticeGenerator: MissionGenerator = {
  generate({ templateVersion, config }) {
    assertTemplateVersion(templateVersion);
    const parsed = parseConfig(config);

    if (parsed.mode === "SELECT_COLUMN") {
      return {
        learner: {
          objective:
            "Chọn cột distance từ DataFrame theo hai cách để phân biệt Series và DataFrame một cột.",
          context:
            `Dataset nằm tại data/telemetry.csv. Đọc file vào df, sau đó tạo distance_series bằng df["distance"] và distance_frame bằng df[["distance"]]. Lưu series_values, series_ndim và frame_shape để kiểm tra kết quả.`,
        },
        grading: {
          data: {
            expectedSeriesValues: [38, 77, 51, 29, 60],
            expectedSeriesNdim: 1,
            expectedFrameShape: [5, 1],
          } as JsonObject,
        },
      };
    }

    return {
      learner: {
        objective:
          "Lọc các contact có threat đạt ngưỡng rồi trả về danh sách contact_id theo đúng thứ tự dữ liệu.",
        context:
          "Dataset nằm tại data/telemetry.csv và biến threshold đã được nạp sẵn. Dùng phép so sánh trên cột threat để tạo điều kiện, lọc các hàng của df, rồi chuyển cột contact_id của kết quả thành list Python trong filtered_ids.",
        data: {
          threshold: 5,
        },
      },
      runtime: {
        setupData: {
          threshold: 5,
        },
      },
      grading: {
        data: {
          expectedFilteredIds: ["contact-2", "contact-3", "contact-4"],
          expectedFilteredCount: 3,
        } as JsonObject,
      },
    };
  },
};
