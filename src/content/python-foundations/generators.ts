import type { MissionGeneratorId } from "../../core/domain";
import type { MissionGenerator } from "../../core/generators";
import { GeneratorRegistry } from "../../core/generators";
import type { SeededRng } from "../../core/random";
import { registerPythonFoundationsM9Generators } from "./generators-m9";

/**
 * Generators of the Python Foundations missions (PHASE-06 / M8).
 *
 * Each generator is a pure function of the seeded RNG (same seed -> same instance) and
 * produces three separate things, exactly like the CS116 generators:
 *  - `learner.data`  : what the learner sees on the "Dữ liệu" tab;
 *  - `runtime.setupData` : the same values, loaded as Python globals before the learner's code;
 *  - `grading.data`  : the expected results, which never reach the learner or the runtime.
 *
 * The data differs between variants (and, through the derived seed, between "new variant"
 * requests), so a literal copied from one instance fails on the next. Boundary values - a
 * confidence exactly on a threshold, 0 and the maximum of a valid range, a list with no
 * valid element - are always present, because those are where the typical mistakes live.
 */

const generatorId = (value: string): MissionGeneratorId => value as MissionGeneratorId;

export const PYTHON_FOUNDATIONS_GENERATOR_ID = {
  PF01: generatorId("python-foundations.generator.pf01"),
  PF02: generatorId("python-foundations.generator.pf02"),
  PF03: generatorId("python-foundations.generator.pf03"),
  PF04: generatorId("python-foundations.generator.pf04"),
  PF05: generatorId("python-foundations.generator.pf05"),
  PF06: generatorId("python-foundations.generator.pf06"),
  PF07: generatorId("python-foundations.generator.pf07"),
} as const;

type Label = "accept" | "review" | "reject";

/** The labelling rule shared by PF-02 and PF-07. */
export function labelForConfidence(confidence: number, high: number, low: number): Label {
  if (confidence >= high) return "accept";
  if (confidence >= low) return "review";
  return "reject";
}

const THRESHOLD_PAIRS_PCT = [
  [80, 50],
  [75, 40],
  [90, 60],
  [70, 30],
] as const;

const pct = (value: number): number => value / 100;

/** `count` distinct-position inserts keep the generated order reproducible. */
function shuffled<T>(rng: SeededRng, items: readonly T[]): T[] {
  return rng.shuffle(items);
}

/**
 * Shuffles `items` and, if the VALID elements ended up already in ascending order, shuffles
 * again (a bounded number of times, then reverses). A learner who sorts the data instead
 * of keeping its order is therefore always caught, in every variant.
 */
function shuffledNotSorted(
  rng: SeededRng,
  items: readonly number[],
  isValid: (value: number) => boolean,
): number[] {
  const ascending = (values: readonly number[]) =>
    values.every((value, index) => index === 0 || values[index - 1]! <= value);
  let row = shuffled(rng, items);
  for (let attempt = 0; attempt < 8 && ascending(row.filter(isValid)); attempt += 1) {
    row = shuffled(rng, items);
  }
  return ascending(row.filter(isValid)) ? [...row].reverse() : row;
}

// ---------------------------------------------------------------------------------------
// PF-01 — image size arithmetic
// ---------------------------------------------------------------------------------------

const WIDTHS = [640, 853, 1024, 1280, 1366, 1600, 1920] as const;
const HEIGHTS = [360, 480, 600, 720, 768, 900, 1080] as const;
// RGB or RGBA: never 1, so forgetting the channels always changes the result.
const CHANNELS = [3, 4] as const;

export const pf01Generator: MissionGenerator = {
  generate({ rng }) {
    const width = rng.pick(WIDTHS);
    const height = rng.pick(HEIGHTS);
    const channels = rng.pick(CHANNELS);
    const pixelCount = width * height;

    return {
      learner: {
        objective:
          "Tính các đại lượng cơ bản của một ảnh từ chiều rộng, chiều cao và số kênh màu.",
        context:
          "Tính `pixel_count` là số pixel của ảnh. " +
          "Tính `aspect_ratio` là tỉ lệ rộng chia cao, kết quả phải là số thực. " +
          "Tính `total_values` là tổng số giá trị số của ảnh, mỗi pixel có `channels` giá trị. " +
          "Tính `half_width` là một nửa chiều rộng, làm tròn xuống và vẫn là số nguyên.",
        data: { width, height, channels },
      },
      runtime: { setupData: { width, height, channels } },
      grading: {
        data: {
          pixelCount,
          aspectRatio: width / height,
          totalValues: pixelCount * channels,
          halfWidth: Math.floor(width / 2),
        },
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-02 — boolean expression and if / elif / else on a confidence threshold
// ---------------------------------------------------------------------------------------

export const pf02Generator: MissionGenerator = {
  generate({ rng }) {
    const [highPct, lowPct] = rng.pick(THRESHOLD_PAIRS_PCT);
    const high = pct(highPct);
    const low = pct(lowPct);

    // Every variant exercises a different branch; the 'review' branch may sit exactly on the
    // low threshold. `edge_confidence` always sits exactly on the HIGH threshold.
    const branch = rng.nextInt(0, 3);
    const confidencePct =
      branch === 0
        ? rng.nextInt(highPct + 1, 100)
        : branch === 1
          ? rng.nextInt(lowPct, highPct)
          : rng.nextInt(1, lowPct);
    const confidence = pct(confidencePct);

    return {
      learner: {
        objective:
          "Gắn nhãn cho một dự đoán dựa trên độ tin cậy bằng biểu thức Boolean và if / elif / else.",
        context:
          "Gán `is_confident` bằng kết quả so sánh `confidence` với `high_threshold`: True khi đạt hoặc vượt ngưỡng cao. " +
          "Dùng if / elif / else để gán `label`: \"accept\" khi `confidence` đạt ngưỡng cao, \"review\" khi chưa đạt nhưng đạt `low_threshold`, còn lại \"reject\". " +
          "Áp dụng đúng quy tắc đó cho `edge_confidence` để được `edge_label`.",
        data: {
          confidence,
          high_threshold: high,
          low_threshold: low,
          edge_confidence: high,
        },
      },
      runtime: {
        setupData: {
          confidence,
          high_threshold: high,
          low_threshold: low,
          edge_confidence: high,
        },
      },
      grading: {
        data: {
          isConfident: confidence >= high,
          label: labelForConfidence(confidence, high, low),
          edgeLabel: labelForConfidence(high, high, low),
        },
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-03 — debug: type conversion + inverted branch
// ---------------------------------------------------------------------------------------

const DEBUG_WIDTHS = [320, 640, 800, 1024] as const;
const DEBUG_HEIGHTS = [240, 480, 600, 768] as const;

export const pf03Generator: MissionGenerator = {
  generate({ rng }) {
    const width = rng.pick(DEBUG_WIDTHS);
    const height = rng.pick(DEBUG_HEIGHTS);
    const pixelCount = width * height;
    const tooLarge = rng.nextInt(0, 2) === 0;

    // Strictly on one side of pixel_count, never equal: the inverted comparison of the
    // buggy code must produce the wrong label in every variant.
    const roundTo = 1000;
    const maxPixels = tooLarge
      ? Math.max(roundTo, Math.floor((pixelCount * (0.4 + rng.nextFloat() * 0.3)) / roundTo) * roundTo)
      : Math.ceil((pixelCount * (1.2 + rng.nextFloat() * 0.6)) / roundTo) * roundTo;

    const widthText = String(width);
    const heightText = String(height);

    return {
      learner: {
        objective:
          "Đoạn mã đọc metadata ảnh dạng chữ đang gặp lỗi. Tìm và sửa lỗi, không cần viết lại từ đầu.",
        context:
          "Chạy thử đoạn mã có sẵn và đọc kỹ thông báo lỗi. " +
          "Sau khi sửa, `width` và `height` phải là số nguyên và `pixel_count` là số pixel của ảnh. " +
          "`size_label` là \"too_large\" khi `pixel_count` vượt `max_pixels`, ngược lại là \"ok\". " +
          "Có nhiều hơn một lỗi: lỗi sau chỉ lộ ra khi lỗi trước đã được sửa.",
        data: { width_text: widthText, height_text: heightText, max_pixels: maxPixels },
      },
      runtime: {
        setupData: { width_text: widthText, height_text: heightText, max_pixels: maxPixels },
      },
      grading: {
        data: {
          width,
          height,
          pixelCount,
          sizeLabel: pixelCount > maxPixels ? "too_large" : "ok",
        },
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-04 — list + for loop: filter invalid sensor readings
// ---------------------------------------------------------------------------------------

const VALID_RANGES = [
  [0, 100],
  [10, 90],
  [5, 95],
  [20, 80],
] as const;

export const pf04Generator: MissionGenerator = {
  generate({ rng }) {
    const [minValid, maxValid] = rng.pick(VALID_RANGES);
    const length = rng.nextInt(9, 13);
    const invalidCount = rng.nextInt(2, 5);

    // The values right next to the range are always present among the invalid ones
    // (an off-by-one in the comparison is caught), plus a few further away.
    const invalid: number[] = [minValid - 1, maxValid + 1];
    while (invalid.length < invalidCount) {
      invalid.push(
        rng.nextInt(0, 2) === 0
          ? minValid - 1 - rng.nextInt(1, 30)
          : maxValid + 1 + rng.nextInt(1, 100),
      );
    }

    // Both ends of the valid range are always present: 'valid' includes the boundaries.
    const valid: number[] = [minValid, maxValid];
    while (valid.length < length - invalid.length) {
      valid.push(rng.nextInt(minValid + 1, maxValid));
    }

    const isValid = (value: number) => value >= minValid && value <= maxValid;
    const readings = shuffledNotSorted(rng, [...invalid, ...valid], isValid);
    const validReadings = readings.filter(isValid);

    return {
      learner: {
        objective:
          "Duyệt danh sách số đo của cảm biến, giữ lại số đo hợp lệ, đếm số đo lỗi và cộng các số đo hợp lệ.",
        context:
          "Số đo hợp lệ khi nằm trong đoạn từ `min_valid` đến `max_valid`, tính cả hai đầu mút. " +
          "Dùng vòng lặp for để thêm các số đo hợp lệ vào `valid_readings`, giữ nguyên thứ tự ban đầu. " +
          "Đếm các số đo không hợp lệ vào `invalid_count`. " +
          "Cộng các số đo hợp lệ vào `valid_total`.",
        data: { readings, min_valid: minValid, max_valid: maxValid },
      },
      runtime: {
        setupData: { readings, min_valid: minValid, max_valid: maxValid },
      },
      grading: {
        data: {
          validReadings,
          invalidCount: readings.length - validReadings.length,
          validTotal: validReadings.reduce((sum, value) => sum + value, 0),
        },
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-05 — functions: arithmetic mean without NumPy
// ---------------------------------------------------------------------------------------

export const pf05Generator: MissionGenerator = {
  generate({ rng }) {
    // Never 5 elements: a divisor copied from a worked example is always caught.
    const lengthA = rng.nextInt(6, 9);
    const samplesA = Array.from({ length: lengthA }, () => rng.nextInt(10, 100));

    // The second list always has a whole-number mean: the function must still return a
    // float for it (a classic place for `//` or int() to slip in).
    const lengthB = rng.pick([4, 6, 7] as const);
    const samplesB = Array.from({ length: lengthB }, () => rng.nextInt(10, 100));
    const remainder = samplesB.reduce((sum, value) => sum + value, 0) % lengthB;
    if (remainder !== 0) {
      let last = samplesB[lengthB - 1]! - remainder;
      if (last < 1) last += lengthB;
      samplesB[lengthB - 1] = last;
    }

    const mean = (values: readonly number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;

    return {
      learner: {
        objective:
          "Viết hàm `mean_of` trả về trung bình cộng của một list số, không dùng NumPy.",
        context:
          "Hoàn thiện hàm `mean_of(values)`: dùng `return` để trả về trung bình cộng dưới dạng số thực. " +
          "Quy ước: nếu `values` rỗng thì trả về `0.0`. " +
          "Phần gọi hàm bên dưới đã có sẵn: `mean_a`, `mean_b` và `mean_empty` sẽ lấy kết quả từ hàm của bạn.",
        data: { samples_a: samplesA, samples_b: samplesB },
      },
      runtime: { setupData: { samples_a: samplesA, samples_b: samplesB } },
      grading: {
        data: { meanA: mean(samplesA), meanB: mean(samplesB), meanEmpty: 0 },
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-06 — transfer: loop + condition + function + list in a new scenario (pixel rows)
// ---------------------------------------------------------------------------------------

function pixelRow(rng: SeededRng, maxValue: number): number[] {
  const length = rng.nextInt(6, 10);
  const invalid: number[] = [-rng.nextInt(1, 20), rng.nextInt(maxValue + 1, maxValue + 200)];
  if (rng.nextInt(0, 2) === 0) invalid.pop();
  const valid: number[] = [0, maxValue];
  while (valid.length < length - invalid.length) {
    valid.push(rng.nextInt(1, maxValue));
  }
  return shuffledNotSorted(rng, [...invalid, ...valid], (value) => value >= 0 && value <= maxValue);
}

export const pf06Generator: MissionGenerator = {
  generate({ rng }) {
    const row8 = pixelRow(rng, 255);
    const row10 = pixelRow(rng, 1023);
    const normalize = (values: readonly number[], maxValue: number) =>
      values.filter((value) => value >= 0 && value <= maxValue).map((value) => value / maxValue);

    return {
      learner: {
        objective:
          "Chuẩn hóa một hàng pixel: bỏ giá trị không hợp lệ rồi đưa các giá trị còn lại về đoạn từ 0 đến 1.",
        context:
          "Hoàn thiện hàm `normalize_valid(values, max_value)`: giá trị hợp lệ khi nằm trong đoạn từ 0 đến `max_value`, tính cả hai đầu mút. " +
          "Với mỗi giá trị hợp lệ, thêm `value / max_value` vào list kết quả, giữ nguyên thứ tự ban đầu. " +
          "Hàm trả về list kết quả, và list đó rỗng nếu không có giá trị hợp lệ nào. " +
          "Phần gọi hàm đã có sẵn cho `row_8bit`, `row_10bit` và một hàng toàn giá trị lỗi.",
        data: { row_8bit: row8, row_10bit: row10 },
      },
      runtime: { setupData: { row_8bit: row8, row_10bit: row10 } },
      grading: {
        data: {
          normalized8bit: normalize(row8, 255),
          normalized10bit: normalize(row10, 1023),
          normalizedNone: [],
        },
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-07 — capstone: a small preprocessing pipeline over a built-in dataset
// ---------------------------------------------------------------------------------------

export const pf07Generator: MissionGenerator = {
  generate({ rng }) {
    const [highPct, lowPct] = rng.pick(THRESHOLD_PAIRS_PCT);
    const high = pct(highPct);
    const low = pct(lowPct);

    // Always present: both thresholds exactly, 0.0 and 1.0 (valid boundaries), two or three
    // out-of-range values, and a few random valid ones.
    const validPcts: number[] = [highPct, lowPct, 0, 100];
    const extra = rng.nextInt(2, 5);
    for (let index = 0; index < extra; index += 1) validPcts.push(rng.nextInt(1, 100));

    const invalid: number[] = [-pct(rng.nextInt(1, 50)), pct(rng.nextInt(101, 200))];
    if (rng.nextInt(0, 2) === 0) invalid.push(-pct(rng.nextInt(1, 50)));

    const confidences = shuffled(rng, [...validPcts.map(pct), ...invalid]);
    const clean = confidences.filter((value) => value >= 0 && value <= 1);
    const labels = clean.map((value) => labelForConfidence(value, high, low));
    const count = (wanted: Label) => labels.filter((label) => label === wanted).length;

    return {
      learner: {
        objective:
          "Dựng một pipeline tiền xử lý nhỏ cho bộ dự đoán: lọc giá trị lỗi, gắn nhãn, đếm theo nhãn và tính trung bình.",
        context:
          "Hoàn thiện hàm `label_for(confidence, high, low)`: trả về \"accept\" khi `confidence` đạt `high`, \"review\" khi chưa đạt nhưng đạt `low`, còn lại \"reject\". " +
          "Duyệt `confidences`: độ tin cậy hợp lệ khi nằm trong đoạn từ 0 đến 1, tính cả hai đầu mút. " +
          "Thêm giá trị hợp lệ vào `clean_confidences` và nhãn tương ứng vào `labels`, cùng thứ tự với `confidences`. " +
          "Đếm số nhãn vào `accept_count`, `review_count` và `reject_count`. " +
          "Gán `mean_confidence` là trung bình của `clean_confidences`, hoặc `0.0` nếu không có giá trị hợp lệ.",
        data: { confidences, high_threshold: high, low_threshold: low },
      },
      runtime: {
        setupData: { confidences, high_threshold: high, low_threshold: low },
      },
      grading: {
        data: {
          cleanConfidences: clean,
          labels,
          acceptCount: count("accept"),
          reviewCount: count("review"),
          rejectCount: count("reject"),
          meanConfidence:
            clean.length === 0 ? 0 : clean.reduce((sum, value) => sum + value, 0) / clean.length,
        },
      },
    };
  },
};

export function registerPythonFoundationsGenerators(registry: GeneratorRegistry): void {
  registry.registerGenerator(PYTHON_FOUNDATIONS_GENERATOR_ID.PF01, pf01Generator);
  registry.registerGenerator(PYTHON_FOUNDATIONS_GENERATOR_ID.PF02, pf02Generator);
  registry.registerGenerator(PYTHON_FOUNDATIONS_GENERATOR_ID.PF03, pf03Generator);
  registry.registerGenerator(PYTHON_FOUNDATIONS_GENERATOR_ID.PF04, pf04Generator);
  registry.registerGenerator(PYTHON_FOUNDATIONS_GENERATOR_ID.PF05, pf05Generator);
  registry.registerGenerator(PYTHON_FOUNDATIONS_GENERATOR_ID.PF06, pf06Generator);
  registry.registerGenerator(PYTHON_FOUNDATIONS_GENERATOR_ID.PF07, pf07Generator);
  // M9 (PHASE-07): PF-08..PF-15 are part of the same course, registered with it.
  registerPythonFoundationsM9Generators(registry);
}
