import { z } from "zod";

import type { JsonObject } from "../../../core/domain";
import type { MissionGenerator } from "../../../core/generators";

const configSchema = z
  .object({
    mode: z.enum([
      "MISSING_VALUES",
      "GROUPBY_AGGREGATE",
      "PIVOT_TABLE",
      "MATPLOTLIB_LINE_PLOT",
      "MATPLOTLIB_SCATTER_PLOT",
      "PANDAS_MERGE",
      "PIL_IMAGE_ARRAY",
      "PIL_CROP_RESIZE",
      "NEW_COLUMN",
      "LINREG_PIPELINE",
      "TRAIN_VAL_TEST_SPLIT",
      "OVERFIT_DIAGNOSIS",
      "DATA_CLEANING",
    ]),
  })
  .strict();

function assertTemplateVersion(templateVersion: number): void {
  if (!Number.isSafeInteger(templateVersion) || templateVersion < 1) {
    throw new RangeError(
      "data science practice generator requires templateVersion >= 1.",
    );
  }
}

function parseConfig(config: JsonObject | undefined) {
  if (config === undefined) {
    throw new TypeError("data science practice generator requires config.");
  }
  return configSchema.parse(config);
}

export const dataSciencePracticeGenerator: MissionGenerator = {
  generate({ templateVersion, config }) {
    assertTemplateVersion(templateVersion);
    const parsed = parseConfig(config);

    switch (parsed.mode) {
      case "MISSING_VALUES":
        return {
          learner: {
            objective:
              "Phát hiện missing values trong cột signal và điền chúng bằng median của chính cột đó.",
            context:
              "Đọc data/sensor_readings.csv vào df. Tạo clean_signal bằng fillna với median, rồi lưu missing_before, missing_after và filled_values để kiểm tra.",
          },
          grading: {
            data: {
              expectedMissingBefore: 2,
              expectedMissingAfter: 0,
              expectedFilledValues: [10, 20, 20, 20, 60],
            } as JsonObject,
          },
        };

      case "GROUPBY_AGGREGATE":
        return {
          learner: {
            objective:
              "Tính điểm trung bình theo team bằng groupby và giữ kết quả ở dạng pandas Series.",
            context:
              "Đọc data/team_scores.csv vào df. Nhóm theo team, lấy mean của score, sort theo index và lưu mean_scores bằng to_dict cùng group_count.",
          },
          grading: {
            data: {
              expectedMeanScores: { A: 110, B: 70 },
              expectedGroupCount: 2,
            } as JsonObject,
          },
        };

      case "PIVOT_TABLE":
        return {
          learner: {
            objective:
              "Tạo pivot table team × metric và tính mean value cho từng ô.",
            context:
              "Đọc data/model_metrics.csv vào df. Dùng pd.pivot_table với index=team, columns=metric, values=value, aggfunc=mean; sort cả index lẫn columns trước khi lấy pivot_values và pivot_columns.",
          },
          grading: {
            data: {
              expectedPivotShape: [2, 2],
              expectedPivotColumns: ["accuracy", "loss"],
              expectedPivotValues: [
                [0.825, 0.375],
                [0.9, 0.3],
              ],
            } as JsonObject,
          },
        };

      case "MATPLOTLIB_LINE_PLOT":
        return {
          learner: {
            objective:
              "Vẽ đường training loss theo epoch, đặt nhãn/title và lưu Figure thành artifacts/loss_curve.png.",
            context:
              "Đọc data/training_history.csv. Tạo Figure/Axes bằng plt.subplots, dùng ax.plot, đặt xlabel='epoch', ylabel='loss', title='Training loss', rồi savefig đúng output_path.",
          },
          grading: {
            data: {
              expectedLineCount: 1,
              expectedXLabel: "epoch",
              expectedYLabel: "loss",
              expectedTitle: "Training loss",
              expectedArtifactExists: true,
              expectedPointCount: 5,
              expectedFinalLoss: 0.31,
              // Dữ liệu thật đã vẽ lên trục — chống việc vẽ sai cột nhưng nhãn đúng.
              expectedPlottedX: [1, 2, 3, 4, 5],
              expectedPlottedY: [0.92, 0.68, 0.51, 0.39, 0.31],
            } as JsonObject,
          },
        };

      case "MATPLOTLIB_SCATTER_PLOT":
        return {
          learner: {
            objective:
              "Tạo scatter plot distance–threat và lưu biểu đồ thành artifacts/threat_scatter.png.",
            context:
              "Đọc data/contacts.csv. Dùng ax.scatter(distance, threat), đặt xlabel='distance', ylabel='threat', title='Threat by distance', rồi savefig đúng output_path.",
          },
          grading: {
            data: {
              expectedCollectionCount: 1,
              expectedXLabel: "distance",
              expectedYLabel: "threat",
              expectedTitle: "Threat by distance",
              expectedArtifactExists: true,
              expectedPointCount: 4,
              // Toạ độ thật của từng điểm scatter — chống đảo trục x/y.
              expectedScatterPoints: [
                [38, 1],
                [77, 7],
                [51, 3],
                [29, 8],
              ],
            } as JsonObject,
          },
        };

      case "PANDAS_MERGE":
        return {
          learner: {
            objective:
              "Ghép bảng events với users theo user_id bằng inner merge và kiểm tra dữ liệu sau join.",
            context:
              "Đọc data/users.csv và data/events.csv. Merge events với users on=user_id, how=inner; sau đó lưu merged_ids, merged_regions và total_spend.",
          },
          grading: {
            data: {
              expectedMergedShape: [3, 3],
              expectedMergedIds: ["u1", "u1", "u2"],
              expectedMergedRegions: ["north", "north", "south"],
              expectedTotalSpend: 45,
            } as JsonObject,
          },
        };

      case "PIL_IMAGE_ARRAY":
        return {
          learner: {
            objective:
              "Đọc ảnh RGB bằng Pillow rồi chuyển sang NumPy array để kiểm tra width/height, channels và một pixel.",
            context:
              "Mở data/pixels.ppm, convert sang RGB, chuyển bằng np.array. Lưu image_size, pixel_shape, channels và top_left.",
          },
          grading: {
            data: {
              expectedImageSize: [4, 3],
              expectedPixelShape: [3, 4, 3],
              expectedChannels: 3,
              expectedTopLeft: [255, 0, 0],
            } as JsonObject,
          },
        };

      case "PIL_CROP_RESIZE":
        return {
          learner: {
            objective:
              "Crop vùng 2×2 ở góc trên-trái, resize thành 4×4 và lưu ảnh kết quả vào artifacts/resized.png.",
            context:
              "Mở data/pixels.ppm ở RGB. crop box (0, 0, 2, 2), resize (4, 4), lưu PNG và kiểm tra kích thước ndarray đầu ra.",
          },
          grading: {
            data: {
              expectedCroppedSize: [2, 2],
              expectedResizedSize: [4, 4],
              expectedResultShape: [4, 4, 3],
              expectedArtifactExists: true,
              // Pixel thật của vùng crop — chống crop sai vị trí nhưng đúng kích thước.
              expectedCroppedPixels: [
                [
                  [255, 0, 0],
                  [0, 255, 0],
                ],
                [
                  [255, 255, 0],
                  [0, 255, 255],
                ],
              ],
            } as JsonObject,
          },
        };

      case "NEW_COLUMN":
        return {
          learner: {
            objective:
              "Tạo cột mới value = close * volume rồi tìm mã có value lớn nhất.",
            context:
              "Đọc data/stocks.csv vào df. Tạo cột value bằng df[\"close\"] * df[\"volume\"], sau đó lưu columns_after (list tên cột), value_list, top_symbol (symbol có value lớn nhất) và total_value.",
          },
          grading: {
            data: {
              expectedColumnsAfter: ["symbol", "close", "volume", "value"],
              expectedValueList: [30, 40, 20],
              expectedTopSymbol: "B",
              expectedTotalValue: 90,
            } as JsonObject,
          },
        };

      case "LINREG_PIPELINE":
        return {
          learner: {
            objective:
              "Dựng pipeline hồi quy tuyến tính: tách X/y, chia train/test rồi huấn luyện và đánh giá mô hình.",
            context:
              "Đọc data/houses.csv (area, price). Tách X = df[[\"area\"]], y = df[\"price\"]. Chia train/test với test_size=0.25, random_state=42. Huấn luyện LinearRegression trên tập train rồi lưu coef, intercept, pred_10 (dự đoán cho area=10), r2 (điểm R² trên tập test), n_train, n_test.",
          },
          grading: {
            data: {
              expectedCoef: 50.0,
              expectedIntercept: 100.0,
              expectedPred10: 600.0,
              expectedR2: 1.0,
              expectedNTrain: 6,
              expectedNTest: 2,
            } as JsonObject,
          },
        };

      case "TRAIN_VAL_TEST_SPLIT":
        return {
          learner: {
            objective:
              "Chia dữ liệu theo tỉ lệ 7:2:1 (train / validation / test) đúng chuẩn CS116 Bài 3, rồi huấn luyện và báo cáo cả val R² lẫn test R².",
            context:
              "Đọc data/houses_noisy.csv. Tách test (10%) trước với test_size=0.1, random_state=42. Sau đó tách train/val từ phần còn lại với test_size=2/9, random_state=42 (vì 2/(7+2)=2/9) — ba tập sẽ có đúng tỉ lệ 7:2:1. Huấn luyện LinearRegression trên train, lưu coef, intercept, val_r2, test_r2, n_train, n_val, n_test.",
          },
          grading: {
            data: {
              expectedCoef: 49.73,
              expectedIntercept: 107.81,
              expectedValR2: 0.9993,
              expectedTestR2: 0.9996,
              expectedNTrain: 14,
              expectedNVal: 4,
              expectedNTest: 2,
            } as JsonObject,
          },
        };

      case "DATA_CLEANING":
        return {
          learner: {
            objective:
              "Làm sạch dữ liệu đầu vào: đếm missing values theo cột, loại bỏ hàng thiếu dữ liệu, rồi loại bỏ hàng trùng để sẵn sàng cho mô hình.",
            context:
              "Đọc data/raw_sales.csv vào df. Tính raw_shape = list(df.shape); missing_price và missing_quantity (int) từ df.isna().sum(); đổi df bằng dropna() → after_dropna_shape; rồi drop_duplicates() → final_shape và final_order_ids (list theo thứ tự còn lại).",
          },
          grading: {
            data: {
              expectedRawShape: [12, 4],
              expectedMissingPrice: 2,
              expectedMissingQuantity: 1,
              expectedAfterDropnaShape: [9, 4],
              expectedFinalShape: [7, 4],
              expectedFinalOrderIds: [
                "A001",
                "A003",
                "A005",
                "A006",
                "A007",
                "A009",
                "A010",
              ],
            } as JsonObject,
          },
        };

      case "OVERFIT_DIAGNOSIS":
        return {
          learner: {
            objective:
              "Chẩn đoán mô hình bằng cách so sánh train R² với test R² — nếu khoảng cách lớn, mô hình đã overfit chứ không phải học được quy luật thực.",
            context:
              "Đọc data/apartments_small.csv (12 căn hộ với dữ liệu khá nhiễu). Chia train/test với test_size=0.25, random_state=42. Huấn luyện LinearRegression trên tập train. Lưu train_r2 (model.score trên tập train), test_r2 (model.score trên tập test), gap = round(train_r2 - test_r2, 4), coef, intercept, n_train, n_test.",
          },
          grading: {
            data: {
              expectedTrainR2: 0.9046,
              expectedTestR2: 0.7718,
              expectedGap: 0.1328,
              expectedCoef: 30.32,
              expectedIntercept: 90.38,
              expectedNTrain: 9,
              expectedNTest: 3,
            } as JsonObject,
          },
        };
    }
  },
};
