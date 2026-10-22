import type { JsonValue, MissionGeneratorId } from "../../core/domain";
import type { MissionGenerator } from "../../core/generators";
import type { GeneratorRegistry } from "../../core/generators";
import type { FunctionCase, PyValue } from "../../core/grading";
import type { SeededRng } from "../../core/random";

/**
 * Generators of the M9 missions PF-08..PF-15 (PHASE-07).
 *
 * Same contract as the M8 generators: pure functions of the seeded RNG, three separate
 * outputs (`learner.data`, `runtime.setupData`, `grading.data`), boundary values always
 * present. What is new is that the function missions (PF-11, PF-12, PF-13, PF-14, PF-15)
 * put a list of declarative FUNCTION_CASES in `grading.data`: one displayed example (its
 * expected value is shown to the learner) plus hidden cases with other arguments, edge
 * cases, exceptions and a no-mutation check. The cases are derived from the seed, so the
 * same seed always yields the same cases and a new variant yields different ones.
 *
 * Reference behaviour is implemented here in TypeScript only to compute expected values;
 * the Python reference solutions live in tests/ (never in the shipped UI).
 */

const generatorId = (value: string): MissionGeneratorId => value as MissionGeneratorId;

export const PYTHON_FOUNDATIONS_M9_GENERATOR_ID = {
  PF08: generatorId("python-foundations.generator.pf08"),
  PF09: generatorId("python-foundations.generator.pf09"),
  PF10: generatorId("python-foundations.generator.pf10"),
  PF11: generatorId("python-foundations.generator.pf11"),
  PF12: generatorId("python-foundations.generator.pf12"),
  PF13: generatorId("python-foundations.generator.pf13"),
  PF14: generatorId("python-foundations.generator.pf14"),
  PF15: generatorId("python-foundations.generator.pf15"),
} as const;

// ----------------------------------------------------------------------------- helpers

const tup = (...items: PyValue[]): PyValue => ({ $tuple: items });
const nd = (data: PyValue, dtype: "float64" | "int64" | "float32" | "uint8" | "bool"): PyValue => ({
  $ndarray: data,
  dtype,
});

function range(start: number, stop: number): number[] {
  const out: number[] = [];
  for (let value = start; value < stop; value += 1) out.push(value);
  return out;
}

/** `count` distinct integers from [low, high). */
function distinctInts(rng: SeededRng, low: number, high: number, count: number): number[] {
  return rng.shuffle(range(low, high)).slice(0, count);
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

const hiddenCase = (
  id: string,
  label: string,
  args: readonly PyValue[],
  expect: FunctionCase["expect"],
  argsUnchanged = true,
): FunctionCase => ({ id, label, visibility: "hidden", args, expect, argsUnchanged });

const exampleCase = (
  id: string,
  label: string,
  args: readonly PyValue[],
  expect: FunctionCase["expect"],
): FunctionCase => ({ id, label, visibility: "example", args, expect, argsUnchanged: true });

const returns = (value: PyValue, returnType: string, tolerance?: number): FunctionCase["expect"] => ({
  kind: "RETURNS",
  value,
  returnType,
  ...(tolerance !== undefined ? { tolerance } : {}),
});

const raises = (exception: string): FunctionCase["expect"] => ({ kind: "RAISES", exception });

const TOLERANCE = 1e-9;

/** Declarative cases are plain serializable data; `grading.data` just needs them typed as JSON. */
const asJson = (cases: readonly FunctionCase[]): JsonValue[] => cases as unknown as JsonValue[];

// ---------------------------------------------------------------------------------------
// PF-08 (M9-01) - indexing and slicing an ordered list
// ---------------------------------------------------------------------------------------

export const pf08Generator: MissionGenerator = {
  generate({ rng }) {
    const length = rng.nextInt(10, 14);
    const samples = distinctInts(rng, 10, 100, length);
    const n = rng.nextInt(2, 5);
    const start = rng.nextInt(2, 5);
    const stop = start + rng.nextInt(3, 5);
    const data = { samples, n, start, stop };

    return {
      learner: {
        objective:
          "Lấy phần tử và đoạn con từ một list số đo có thứ tự bằng chỉ số và cắt lát (slicing).",
        context:
          "`samples` là list các số đo theo thứ tự thời gian (cũ nhất ở đầu, mới nhất ở cuối). " +
          "Gán `last_sample` là số đo cuối cùng, `head` là `n` số đo đầu tiên, `tail` là `n` số đo cuối cùng, " +
          "`window` là các số đo từ chỉ số `start` đến chỉ số `stop - 1`, " +
          "`every_second` là các số đo cách một phần tử bắt đầu từ phần tử đầu, " +
          "và `newest_first` là toàn bộ list theo thứ tự đảo ngược. " +
          "Không được sửa `samples`.",
        data,
      },
      runtime: { setupData: data },
      grading: {
        data: {
          firstSample: samples[0]!,
          lastSample: samples[length - 1]!,
          head: samples.slice(0, n),
          tail: samples.slice(length - n),
          window: samples.slice(start, stop),
          everySecond: samples.filter((_, index) => index % 2 === 0),
          newestFirst: [...samples].reverse(),
          originalSamples: samples,
        },
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-09 (M9-02) - dict, tuple, set
// ---------------------------------------------------------------------------------------

const LABEL_POOL = ["cat", "dog", "bird", "fish", "frog", "horse", "sheep", "duck"] as const;


export const pf09Generator: MissionGenerator = {
  generate({ rng }) {
    const kinds = rng.nextInt(3, 6);
    const categories = rng.shuffle(LABEL_POOL).slice(0, kinds);
    // Strictly decreasing counts: there is always exactly one most common label.
    const counts = categories.map((_, index) => kinds - index + 1);
    const labels = rng.shuffle(
      categories.flatMap((label, index) => Array.from({ length: counts[index]! }, () => label)),
    );
    const width = rng.pick([320, 480, 640, 800, 1024] as const);
    const height = rng.pick([240, 360, 480, 600, 768] as const);
    const data = { labels, width, height };

    const sortedLabels = [...categories].sort();
    const labelCounts: Record<string, number> = {};
    const classIndex: Record<string, number> = {};
    categories.forEach((label, index) => {
      labelCounts[label] = counts[index]!;
    });
    sortedLabels.forEach((label, index) => {
      classIndex[label] = index;
    });

    return {
      learner: {
        objective:
          "Dùng dictionary, tuple và set để thống kê nhãn của một bộ ảnh và đánh chỉ số cho các lớp.",
        context:
          "`labels` là nhãn của từng ảnh (có lặp). " +
          "`unique_labels` là một set gồm các nhãn khác nhau, và `unique_sorted` là list các nhãn đó theo thứ tự bảng chữ cái. " +
          "`label_counts` là dictionary từ nhãn sang số lần xuất hiện. " +
          "`top_label` là tuple `(nhãn, số lần)` của nhãn xuất hiện nhiều nhất (luôn chỉ có một nhãn như vậy). " +
          "`class_index` là dictionary gán cho mỗi nhãn một số nguyên 0, 1, 2, ... theo thứ tự bảng chữ cái. " +
          "`image_size` là tuple `(width, height)` và `swapped_size` là tuple `(height, width)`.",
        data,
      },
      runtime: { setupData: data },
      grading: {
        data: {
          uniqueSorted: sortedLabels,
          labelCounts,
          topLabel: [categories[0]!, counts[0]!],
          classIndex,
          imageSize: [width, height],
          swappedSize: [height, width],
        },
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-10 (M9-03) - list and dict comprehensions with filtering and transformation
// ---------------------------------------------------------------------------------------

const WORD_POOL = [
  "pixel", "tensor", "epoch", "batch", "label", "kernel", "loss", "gradient", "feature", "weights",
] as const;
const NAME_POOL = ["An", "Binh", "Chi", "Dung", "Giang", "Hoa", "Khoa", "Linh", "Minh", "Nam"] as const;

/** Shuffles `items`; if the valid ones came out ascending, shuffles again, then reverses. */
function shuffledNotSorted(rng: SeededRng, items: readonly number[], isValid: (value: number) => boolean): number[] {
  const ascending = (values: readonly number[]) =>
    values.every((value, index) => index === 0 || values[index - 1]! <= value);
  let row = rng.shuffle(items);
  for (let attempt = 0; attempt < 8 && ascending(row.filter(isValid)); attempt += 1) {
    row = rng.shuffle(items);
  }
  return ascending(row.filter(isValid)) ? [...row].reverse() : row;
}

export const pf10Generator: MissionGenerator = {
  generate({ rng }) {
    const brightFrom = rng.pick([200, 210, 220, 230] as const);
    const validCount = rng.nextInt(8, 11);
    const valid: number[] = [0, 255, rng.nextInt(brightFrom, 255), rng.nextInt(brightFrom, 255)];
    while (valid.length < validCount) valid.push(rng.nextInt(1, brightFrom));
    // An out-of-range value is also placed ABOVE the brightness threshold, so a learner
    // who forgets the validity test collects the wrong indices.
    const invalid: number[] = [-rng.nextInt(1, 30), rng.nextInt(256, 400)];
    if (rng.nextInt(0, 2) === 0) invalid.push(rng.nextInt(400, 600));
    const isValid = (value: number) => value >= 0 && value <= 255;
    const pixels = shuffledNotSorted(rng, [...valid, ...invalid], isValid);

    const wordCount = rng.nextInt(4, 6);
    const words = rng.shuffle(WORD_POOL).slice(0, wordCount);

    const passMark = rng.pick([60, 65, 70, 75] as const);
    const scoreValues = [
      passMark,
      passMark - rng.nextInt(1, 16),
      passMark + rng.nextInt(1, 21),
      rng.nextInt(30, 96),
      rng.nextInt(30, 96),
    ];
    const names = rng.shuffle(NAME_POOL).slice(0, scoreValues.length);
    const scores: Record<string, number> = {};
    rng.shuffle(scoreValues).forEach((score, index) => {
      scores[names[index]!] = score;
    });

    const data = { pixels, bright_from: brightFrom, words, scores, pass_mark: passMark };

    const wordLengths: Record<string, number> = {};
    for (const word of words) wordLengths[word] = word.length;
    const passedScores: Record<string, number> = {};
    for (const [name, score] of Object.entries(scores)) {
      if (score >= passMark) passedScores[name] = score;
    }

    return {
      learner: {
        objective:
          "Viết gọn các phép lọc và biến đổi dữ liệu bằng list comprehension và dict comprehension.",
        context:
          "`valid_scaled` là list `pixel / 255` của các pixel hợp lệ (từ 0 đến 255, gồm cả hai đầu mút), giữ nguyên thứ tự. " +
          "`bright_indices` là list các CHỈ SỐ (trong list `pixels` gốc) của những pixel hợp lệ có giá trị từ `bright_from` trở lên. " +
          "`word_lengths` là dictionary từ mỗi từ trong `words` sang độ dài của nó. " +
          "`passed_scores` là dictionary chỉ giữ học viên trong `scores` có điểm từ `pass_mark` trở lên. " +
          "Mỗi biến chỉ cần một comprehension.",
        data,
      },
      runtime: { setupData: data },
      grading: {
        data: {
          validScaled: pixels.filter(isValid).map((value) => value / 255),
          brightIndices: pixels.flatMap((value, index) => (isValid(value) && value >= brightFrom ? [index] : [])),
          wordLengths,
          passedScores,
        },
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-11 (M9-04) - reusable functions, graded on many argument sets
// ---------------------------------------------------------------------------------------

function movingAverage(values: readonly number[], window: number): number[] {
  const out: number[] = [];
  for (let start = 0; start + window <= values.length; start += 1) {
    out.push(sum(values.slice(start, start + window)) / window);
  }
  return out;
}

const clipValues = (values: readonly number[], low: number, high: number): number[] =>
  values.map((value) => Math.max(low, Math.min(value, high)));

const randomInts = (rng: SeededRng, count: number, low: number, high: number): number[] =>
  Array.from({ length: count }, () => rng.nextInt(low, high));

export const pf11Generator: MissionGenerator = {
  generate({ rng }) {
    // The example shown to the learner. It always contains a value below and a value above
    // the clipping range.
    const exampleValues = randomInts(rng, 6, 20, 51);
    exampleValues[0] = rng.nextInt(8, 19);
    exampleValues[1] = rng.nextInt(52, 61);
    const exampleWindow = 3;
    const exampleLow = rng.nextInt(20, 29);
    const exampleHigh = rng.nextInt(42, 51);
    const data = {
      example_values: exampleValues,
      example_window: exampleWindow,
      example_low: exampleLow,
      example_high: exampleHigh,
    };
    const exampleAverage = movingAverage(exampleValues, exampleWindow);
    const exampleClipped = clipValues(exampleValues, exampleLow, exampleHigh);

    const maSeries = randomInts(rng, rng.nextInt(7, 10), 0, 100);
    const maWindow = rng.nextInt(2, 5);
    const maSingle = randomInts(rng, 5, 0, 100);

    const movingAverageCases: FunctionCase[] = [
      exampleCase("ma-example", "Ví dụ trong đề", [exampleValues, exampleWindow], returns(exampleAverage, "list", TOLERANCE)),
      hiddenCase("ma-window-1", "Cửa sổ có độ dài 1", [maSingle, 1], returns(movingAverage(maSingle, 1), "list", TOLERANCE)),
      hiddenCase("ma-other", "Dữ liệu khác, cửa sổ khác", [maSeries, maWindow], returns(movingAverage(maSeries, maWindow), "list", TOLERANCE)),
      hiddenCase(
        "ma-window-equals-length",
        "Cửa sổ bằng độ dài list",
        [maSingle, maSingle.length],
        returns(movingAverage(maSingle, maSingle.length), "list", TOLERANCE),
      ),
      hiddenCase("ma-window-too-long", "Cửa sổ dài hơn list", [maSingle, maSingle.length + 2], returns([], "list")),
      hiddenCase("ma-empty", "List rỗng", [[], 2], returns([], "list")),
      hiddenCase("ma-window-zero", "Cửa sổ bằng 0 phải báo ValueError", [maSingle, 0], raises("ValueError")),
      hiddenCase("ma-window-negative", "Cửa sổ âm phải báo ValueError", [maSingle, -2], raises("ValueError")),
    ];

    const inside = randomInts(rng, 4, 31, 40);
    const outsideLow = randomInts(rng, 3, -20, 5);
    const outsideHigh = randomInts(rng, 3, 95, 130);
    const mixed = randomInts(rng, rng.nextInt(7, 10), -30, 140);
    const boundaries = [10, 20, 90, 100];
    const clipCases: FunctionCase[] = [
      exampleCase("clip-example", "Ví dụ trong đề", [exampleValues, exampleLow, exampleHigh], returns(exampleClipped, "list")),
      hiddenCase("clip-inside", "Mọi giá trị đã nằm trong đoạn", [inside, 20, 50], returns(inside, "list")),
      hiddenCase("clip-below", "Mọi giá trị nhỏ hơn cận dưới", [outsideLow, 10, 60], returns([10, 10, 10], "list")),
      hiddenCase("clip-above", "Mọi giá trị lớn hơn cận trên", [outsideHigh, 10, 90], returns([90, 90, 90], "list")),
      hiddenCase("clip-boundaries", "Giá trị đúng bằng hai cận", [boundaries, 20, 90], returns([20, 20, 90, 90], "list")),
      hiddenCase("clip-mixed", "Dữ liệu khác, cận khác", [mixed, 0, 100], returns(clipValues(mixed, 0, 100), "list")),
      hiddenCase("clip-empty", "List rỗng", [[], 0, 10], returns([], "list")),
      hiddenCase("clip-equal-bounds", "Hai cận bằng nhau", [[3, 9, 6], 6, 6], returns([6, 6, 6], "list")),
      hiddenCase("clip-bad-range", "Cận dưới lớn hơn cận trên phải báo ValueError", [[1, 2, 3], 5, 2], raises("ValueError")),
    ];

    return {
      learner: {
        objective:
          "Viết hai hàm dùng lại được cho nhiều đầu vào khác nhau: trung bình trượt và cắt giá trị về một đoạn.",
        context:
          "Hoàn thiện `moving_average(values, window)`: trả về list mới gồm trung bình của mọi đoạn liên tiếp dài `window` phần tử, theo thứ tự từ trái sang phải. " +
          "Nếu `window` lớn hơn số phần tử thì trả về list rỗng; nếu `window` nhỏ hơn 1 thì báo `ValueError`. " +
          "Hoàn thiện `clip_values(values, low, high)`: trả về list MỚI trong đó mỗi giá trị nhỏ hơn `low` được thay bằng `low`, lớn hơn `high` được thay bằng `high`; " +
          "nếu `low > high` thì báo `ValueError`. Không được sửa list đầu vào. " +
          `Ví dụ trong đề: moving_average(${JSON.stringify(exampleValues)}, ${exampleWindow}) trả về ${JSON.stringify(exampleAverage)}; ` +
          `clip_values(${JSON.stringify(exampleValues)}, ${exampleLow}, ${exampleHigh}) trả về ${JSON.stringify(exampleClipped)}. ` +
          "Khi nộp bài, hàm của bạn sẽ được gọi thêm với nhiều đầu vào khác ví dụ này, nên đừng viết cứng kết quả.",
        data,
      },
      runtime: { setupData: data },
      grading: { data: { movingAverageCases: asJson(movingAverageCases), clipCases: asJson(clipCases) } },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-12 (M9-05) - debug an input-processing routine
// ---------------------------------------------------------------------------------------

/**
 * Plain decimal numbers, with an optional sign, fraction and exponent. Deliberately
 * narrower than Python's `float()` (no underscores, no "nan" / "inf" words): the generated
 * data never contains a text the two would read differently.
 */
const DECIMAL_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

interface MeasurementsResult {
  values: number[];
  rejected: number;
}

/** Reference behaviour of `parse_measurements` for list input (TypeError / ValueError are cases of their own). */
function parseMeasurements(raw: readonly unknown[], low: number, high: number): MeasurementsResult {
  const values: number[] = [];
  let rejected = 0;
  for (const item of raw) {
    if (typeof item !== "string") {
      rejected += 1;
      continue;
    }
    const text = item.trim();
    if (!DECIMAL_TEXT.test(text)) {
      rejected += 1;
      continue;
    }
    const number = Number(text);
    if (number >= low && number <= high) values.push(number);
    else rejected += 1;
  }
  return { values, rejected };
}

const MEASUREMENT_RANGES = [
  [0, 100],
  [10, 90],
  [5, 50],
  [-20, 40],
] as const;

export const pf12Generator: MissionGenerator = {
  generate({ rng }) {
    const [low, high] = rng.pick(MEASUREMENT_RANGES);
    const decimalIn = () => `${rng.nextInt(low + 1, high)}.${rng.pick([25, 5, 75] as const)}`;

    // The demo list is the one the learner runs: it holds a non-integer text, spaced texts,
    // both range ends, an out-of-range value, a word, an empty string and two non-strings.
    const demo: unknown[] = rng.shuffle<unknown>([
      decimalIn(),
      ` ${rng.nextInt(low + 1, high)} `,
      String(low),
      String(high),
      `${high + rng.nextInt(2, 30)}.5`,
      rng.pick(["abc", "n/a", "12,5"] as const),
      "",
      null,
      rng.nextInt(1, 9),
    ]);
    const data = { form_inputs: demo as JsonValue[], low, high };

    const edge = [String(low), ` ${high}`, `${low - 1}.5`, `${high}.01`, `+${low + 1}`];
    const spaced = ["  5 ", "+3", "2.50", " -1.5", "7. "].map((text) => text);
    const noisy = ["", "abc", "1.2.3", "--4", "5 5", "0x10"];
    const sci = ["1e1", "2.5E0", "1E+1", "5e-1"];
    const words = ["nan", "inf", "-inf", "infinity"];
    const mixedTypes = [null, 5, "4", true as unknown as string, [1], "8"];

    const same = (raw: readonly unknown[], lo: number, hi: number): FunctionCase["expect"] =>
      returns({ values: parseMeasurements(raw, lo, hi).values, rejected: parseMeasurements(raw, lo, hi).rejected }, "dict");

    const cases: FunctionCase[] = [
      exampleCase("pm-example", "Ví dụ trong đề", [demo as PyValue[], low, high], same(demo, low, high)),
      hiddenCase("pm-spaces-and-signs", "Khoảng trắng, dấu + và số thực", [spaced, -100, 100], same(spaced, -100, 100)),
      hiddenCase("pm-edges", "Giá trị sát và đúng hai đầu mút", [edge, low, high], same(edge, low, high)),
      hiddenCase("pm-garbage", "Chuỗi rỗng và chuỗi không phải số", [noisy, -100, 100], same(noisy, -100, 100)),
      hiddenCase("pm-scientific", "Ký hiệu khoa học", [sci, 0, 20], same(sci, 0, 20)),
      hiddenCase("pm-nan-inf", "nan và inf không phải số hợp lệ", [words, -1e6, 1e6], same(words, -1e6, 1e6)),
      hiddenCase("pm-non-strings", "Phần tử không phải chuỗi bị loại", [mixedTypes as PyValue[], 0, 10], same(mixedTypes, 0, 10)),
      hiddenCase("pm-empty", "List rỗng", [[], 0, 10], same([], 0, 10)),
      hiddenCase("pm-order", "Giữ nguyên thứ tự", [["9", "1", "5"], 0, 10], same(["9", "1", "5"], 0, 10)),
      hiddenCase("pm-not-a-list", "Đầu vào là một chuỗi, không phải list: TypeError", ["12.5", 0, 100], raises("TypeError")),
      hiddenCase("pm-not-a-list-number", "Đầu vào là một số, không phải list: TypeError", [42, 0, 100], raises("TypeError")),
      hiddenCase("pm-bad-range", "low lớn hơn high phải báo ValueError", [["1", "2"], 10, 5], raises("ValueError")),
    ];

    const demoResult = parseMeasurements(demo, low, high);

    return {
      learner: {
        objective:
          "Một hàm xử lý dữ liệu nhập từ form đang hoạt động sai. Chạy thử, đọc lỗi, tìm và sửa từng lỗi.",
        context:
          "Hàm `parse_measurements(raw_values, low, high)` nhận list chuỗi mà người dùng gõ vào form và trả về dictionary " +
          "`{\"values\": [...], \"rejected\": số_phần_tử_bị_loại}`. " +
          "`values` gồm các số thực hợp lệ, giữ nguyên thứ tự; một phần tử hợp lệ khi nó là chuỗi đọc được thành số (cho phép khoảng trắng hai đầu, dấu +/-, phần thập phân) " +
          "và nằm trong đoạn từ `low` đến `high`, tính cả hai đầu mút. Mọi phần tử khác (chuỗi không đọc được, ngoài đoạn, hoặc không phải chuỗi) làm `rejected` tăng thêm 1. " +
          "Nếu `raw_values` không phải list thì báo `TypeError`; nếu `low > high` thì báo `ValueError`. " +
          "Biến `result` ở cuối đoạn mã phải bằng kết quả đúng cho `form_inputs`. " +
          "Có nhiều lỗi: lỗi sau chỉ lộ ra khi lỗi trước đã được sửa.",
        data,
      },
      runtime: { setupData: data },
      grading: { data: { cases: asJson(cases), demoResult: { values: demoResult.values, rejected: demoResult.rejected } } },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-13 (M9-06) - mini project: JSON-like records -> clean summary for ML
// ---------------------------------------------------------------------------------------

const RECORD_LABELS = ["cat", "dog", "bird", "fish"] as const;
const DIMENSIONS = [32, 64, 128, 224, 256, 640] as const;

type BadKind =
  | "missing-confidence"
  | "confidence-range"
  | "confidence-text"
  | "blank-label"
  | "null-label"
  | "bad-width"
  | "zero-height"
  | "duplicate-id"
  | "not-object"
  | "missing-id";

const ALL_BAD_KINDS: readonly BadKind[] = [
  "missing-confidence",
  "confidence-range",
  "confidence-text",
  "blank-label",
  "null-label",
  "bad-width",
  "zero-height",
  "duplicate-id",
  "not-object",
  "missing-id",
];

type RawRecord = Record<string, unknown>;

interface RecordSummary {
  valid_count: number;
  invalid_count: number;
  labels: string[];
  label_counts: Record<string, number>;
  mean_confidence: number;
  rows: number[][];
}

function numericOf(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && /^\s*[+-]?(\d+\.?\d*|\.\d+)\s*$/.test(value)) return Number(value);
  return null;
}

function positiveIntOf(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value > 0 ? value : null;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const number = Number(value);
    return number > 0 ? number : null;
  }
  return null;
}

/** Reference behaviour of the cleaning rules (see the mission text). */
export function summarizeRecordList(records: readonly unknown[]): RecordSummary {
  const seen = new Set<string>();
  const accepted: { pixels: number; confidence: number; label: string }[] = [];
  for (const record of records) {
    if (typeof record !== "object" || record === null || Array.isArray(record)) continue;
    const fields = record as RawRecord;
    if (typeof fields.id !== "string" || fields.id.trim() === "" || seen.has(fields.id.trim())) continue;
    if (typeof fields.label !== "string" || fields.label.trim() === "") continue;
    const confidence = numericOf(fields.confidence);
    if (confidence === null || confidence < 0 || confidence > 1) continue;
    const width = positiveIntOf(fields.width);
    const height = positiveIntOf(fields.height);
    if (width === null || height === null) continue;
    seen.add(fields.id.trim());
    accepted.push({ pixels: width * height, confidence, label: fields.label.trim().toLowerCase() });
  }
  const labels = [...new Set(accepted.map((entry) => entry.label))].sort();
  const labelCounts: Record<string, number> = {};
  for (const entry of accepted) labelCounts[entry.label] = (labelCounts[entry.label] ?? 0) + 1;
  return {
    valid_count: accepted.length,
    invalid_count: records.length - accepted.length,
    labels,
    label_counts: labelCounts,
    mean_confidence: accepted.length === 0 ? 0 : sum(accepted.map((entry) => entry.confidence)) / accepted.length,
    rows: accepted.map((entry) => [entry.pixels, entry.confidence, labels.indexOf(entry.label)]),
  };
}

function formatLabel(rng: SeededRng, label: string): string {
  switch (rng.nextInt(0, 4)) {
    case 0:
      return label;
    case 1:
      return label.toUpperCase();
    case 2:
      return ` ${label} `;
    default:
      return label.charAt(0).toUpperCase() + label.slice(1);
  }
}

function validRecord(rng: SeededRng, id: string): RawRecord {
  const confidence = rng.nextInt(1, 100) / 100;
  const width = rng.pick(DIMENSIONS);
  const height = rng.pick(DIMENSIONS);
  return {
    id,
    label: formatLabel(rng, rng.pick(RECORD_LABELS)),
    confidence: rng.nextInt(0, 3) === 0 ? String(confidence) : confidence,
    width: rng.nextInt(0, 4) === 0 ? String(width) : width,
    height: rng.nextInt(0, 4) === 0 ? String(height) : height,
  };
}

function brokenRecord(rng: SeededRng, kind: BadKind, id: string): unknown {
  const record = validRecord(rng, id);
  switch (kind) {
    case "missing-confidence":
      delete record.confidence;
      return record;
    case "confidence-range":
      record.confidence = rng.pick([1.2, -0.2, 7] as const);
      return record;
    case "confidence-text":
      record.confidence = rng.pick(["high", "N/A", ""] as const);
      return record;
    case "blank-label":
      record.label = "   ";
      return record;
    case "null-label":
      record.label = null;
      return record;
    case "bad-width":
      record.width = rng.pick(["abc", "12.5", -64] as const);
      return record;
    case "zero-height":
      record.height = 0;
      return record;
    case "missing-id":
      delete record.id;
      return record;
    case "not-object":
      return rng.pick([5, "oops", [1, 2], null] as const);
    case "duplicate-id":
      return record;
  }
}

interface RecordSet {
  readonly text: string;
  readonly summary: RecordSummary;
}

/** A shuffled record list: `validCount` clean records plus one broken record per `bad` kind. */
function buildRecordSet(rng: SeededRng, validCount: number, bad: readonly BadKind[], pinned?: readonly RawRecord[]): RecordSet {
  const ids = rng.shuffle(range(1, 60));
  let nextId = 0;
  const freshId = () => `img-${String(ids[nextId++]).padStart(2, "0")}`;

  const records: unknown[] = [...(pinned ?? [])];
  for (let count = 0; count < validCount; count += 1) records.push(validRecord(rng, freshId()));
  const nonDuplicates = bad.filter((kind) => kind !== "duplicate-id");
  for (const kind of nonDuplicates) records.splice(rng.nextInt(0, records.length + 1), 0, brokenRecord(rng, kind, freshId()));

  // Duplicates are placed AFTER the valid record they copy, with the id padded by spaces
  // half of the time, and a different label: the FIRST occurrence must be the one kept.
  const duplicateCount = bad.filter((entry) => entry === "duplicate-id").length;
  for (let copyIndex = 0; copyIndex < duplicateCount; copyIndex += 1) {
    const originals = records
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => summarizeRecordList([record]).valid_count === 1);
    if (originals.length === 0) continue;
    const original = rng.pick(originals);
    const copy = { ...(original.record as RawRecord) };
    copy.id = rng.nextInt(0, 2) === 0 ? copy.id : ` ${String(copy.id)} `;
    copy.label = rng.pick(RECORD_LABELS);
    records.splice(rng.nextInt(original.index + 1, records.length + 1), 0, copy);
  }

  return { text: JSON.stringify(records), summary: summarizeRecordList(records) };
}

export const pf13Generator: MissionGenerator = {
  generate({ rng }) {
    const example = buildRecordSet(
      rng,
      rng.nextInt(5, 8),
      ["duplicate-id", "confidence-range", ...rng.shuffle(ALL_BAD_KINDS.filter((kind) => kind !== "duplicate-id" && kind !== "confidence-range")).slice(0, 3)],
    );
    const data = { raw_json: example.text };

    const allBad = buildRecordSet(rng, 0, rng.shuffle(ALL_BAD_KINDS.filter((kind) => kind !== "duplicate-id")).slice(0, 4));
    const duplicates = buildRecordSet(rng, 3, ["duplicate-id", "duplicate-id"]);
    const boundaries = buildRecordSet(rng, 0, [], [
      { id: "b-0", label: "cat", confidence: 0, width: 32, height: 32 },
      { id: "b-1", label: "Dog", confidence: 1, width: "64", height: 64 },
      { id: "b-2", label: "dog", confidence: "0", width: 64, height: "64" },
      { id: "b-3", label: "cat", confidence: "1.0", width: 128, height: 32 },
      { id: "b-4", label: "bird", confidence: 1.0000001, width: 32, height: 32 },
    ]);
    const casing = buildRecordSet(rng, 0, [], [
      { id: "c-1", label: "Cat", confidence: 0.5, width: 32, height: 32 },
      { id: "c-2", label: " CAT ", confidence: 0.25, width: 64, height: 32 },
      { id: "c-3", label: "cat", confidence: "0.75", width: "32", height: 64 },
      { id: "c-4", label: "Fish", confidence: 0.9, width: 32, height: 32 },
    ]);
    const another = buildRecordSet(rng, rng.nextInt(8, 12), rng.shuffle(ALL_BAD_KINDS).slice(0, 5));
    const empty = { text: "[]", summary: summarizeRecordList([]) };

    const hidden = (id: string, label: string, set: RecordSet): FunctionCase =>
      hiddenCase(id, label, [set.text], returns(set.summary as unknown as PyValue, "dict", TOLERANCE));

    const cases: FunctionCase[] = [
      exampleCase("rec-example", "Ví dụ trong đề", [example.text], returns(example.summary as unknown as PyValue, "dict", TOLERANCE)),
      hidden("rec-all-invalid", "Không có bản ghi hợp lệ nào", allBad),
      hidden("rec-empty-list", "List rỗng", empty),
      hidden("rec-duplicates", "Id trùng: giữ bản ghi đầu tiên", duplicates),
      hidden("rec-boundaries", "Độ tin cậy sát 0 và 1", boundaries),
      hidden("rec-label-casing", "Nhãn khác chữ hoa và khoảng trắng gộp làm một", casing),
      hidden("rec-another", "Bộ dữ liệu khác", another),
      hiddenCase("rec-bad-json", "JSON sai cú pháp phải báo ValueError", ['[{"id": "a1", "label": "cat"'], raises("ValueError")),
      hiddenCase("rec-empty-text", "Chuỗi rỗng phải báo ValueError", [""], raises("ValueError")),
      hiddenCase("rec-not-a-list", "JSON không phải list phải báo ValueError", ['{"records": []}'], raises("ValueError")),
    ];

    return {
      learner: {
        objective:
          "Mini-project: đọc các bản ghi JSON thô, loại bản ghi lỗi và trả về bản tóm tắt sạch để dùng cho bước ML sau.",
        context:
          "`raw_json` là chuỗi JSON của một list các bản ghi ảnh: mỗi bản ghi nên có `id`, `label`, `confidence`, `width`, `height`. " +
          "Viết hàm `summarize_records(text)`. Một bản ghi HỢP LỆ khi: là một đối tượng JSON; `id` là chuỗi không rỗng (sau khi bỏ khoảng trắng hai đầu) và chưa xuất hiện ở bản ghi hợp lệ nào đứng trước; " +
          "`label` là chuỗi không rỗng sau khi bỏ khoảng trắng; `confidence` là số hoặc chuỗi số và nằm trong đoạn từ 0 đến 1 (cả hai đầu mút); " +
          "`width` và `height` là số nguyên dương (số hoặc chuỗi chỉ gồm chữ số). Nhãn được chuẩn hóa bằng cách bỏ khoảng trắng hai đầu và đổi sang chữ thường. " +
          "Hàm trả về dictionary gồm: `valid_count`, `invalid_count` (số bản ghi bị loại, tính cả phần tử không phải đối tượng), " +
          "`labels` (list các nhãn khác nhau, đã sắp xếp theo bảng chữ cái), `label_counts` (nhãn → số bản ghi hợp lệ), " +
          "`mean_confidence` (trung bình độ tin cậy của bản ghi hợp lệ, 0.0 nếu không có) và `rows` (list `[width * height, confidence, chỉ_số_nhãn]` của từng bản ghi hợp lệ theo thứ tự ban đầu, " +
          "trong đó `chỉ_số_nhãn` là vị trí của nhãn trong `labels`). Văn bản không phải JSON hợp lệ hoặc không phải một list thì báo `ValueError`. " +
          "Cuối đoạn mã, `summary` phải là kết quả của hàm cho `raw_json`.",
        data,
      },
      runtime: { setupData: data },
      grading: { data: { cases: asJson(cases), summary: example.summary as unknown as PyValue } },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-14 (M9-07) - ndarray, ndim, shape, dtype, indexing (real NumPy in Pyodide)
// ---------------------------------------------------------------------------------------

type NdDtype = "float64" | "int64" | "float32" | "uint8" | "bool";

function shapeSize(shape: readonly number[]): number {
  return shape.reduce((product, dimension) => product * dimension, 1);
}

/** Nested list of the given shape; `leaf` produces the element for a flat index. */
function nested(shape: readonly number[], leaf: (flatIndex: number) => PyValue): PyValue {
  let counter = 0;
  const build = (depth: number): PyValue =>
    depth === shape.length
      ? leaf(counter++)
      : Array.from({ length: shape[depth]! }, () => build(depth + 1));
  return build(0);
}

export const pf14Generator: MissionGenerator = {
  generate({ rng }) {
    const rows = rng.nextInt(2, 4);
    const columns = rng.nextInt(3, 5);
    const table = Array.from({ length: rows }, () => randomInts(rng, columns, 1, 100));
    const rowIndex = rng.nextInt(0, rows);
    const columnIndex = rng.nextInt(1, columns);
    const data = { table, row_i: rowIndex, col_j: columnIndex };

    const describe = (shape: readonly number[], dtype: NdDtype): PyValue => ({
      ndim: shape.length,
      shape: tup(...shape),
      size: shapeSize(shape),
      dtype,
    });

    const oneDimension = rng.nextInt(3, 8);
    const threeShape = [2, rng.nextInt(2, 4), rng.nextInt(2, 4)];
    const twoShape = [rng.nextInt(2, 5), rng.nextInt(2, 5)];
    const caseOf = (id: string, label: string, shape: readonly number[], dtype: NdDtype, leaf: (flat: number) => PyValue): FunctionCase =>
      hiddenCase(id, label, [nd(nested(shape, leaf), dtype)], returns(describe(shape, dtype), "dict"));

    const cases: FunctionCase[] = [
      exampleCase(
        "desc-example",
        "Ví dụ trong đề",
        [nd(table, "float64")],
        returns(describe([rows, columns], "float64"), "dict"),
      ),
      caseOf("desc-1d-int", "Mảng 1 chiều kiểu int64", [oneDimension], "int64", (flat) => flat * 3),
      caseOf("desc-3d-float32", "Mảng 3 chiều kiểu float32", threeShape, "float32", (flat) => flat + 0.5),
      caseOf("desc-bool", "Mảng 1 chiều kiểu bool", [oneDimension + 1], "bool", (flat) => flat % 2 === 0),
      caseOf("desc-2d-uint8", "Mảng 2 chiều kiểu uint8", twoShape, "uint8", (flat) => (flat * 7) % 256),
    ];

    const arrayValues = table.map((row) => row.map((value) => value));
    return {
      learner: {
        objective:
          "Tạo một ndarray từ dữ liệu Python, đọc số chiều, shape và dtype của nó và lấy phần tử bằng chỉ số.",
        context:
          "`table` là list lồng nhau các số đo. Gán `arr` là ndarray tạo từ `table` với `dtype=np.float64`. " +
          "Gán `n_dims` là số chiều của `arr`, `shape_of_arr` là shape (một tuple), `element_count` là tổng số phần tử, " +
          "`dtype_name` là TÊN dtype dưới dạng chuỗi (ví dụ \"int32\"), `last_row` là hàng cuối của `arr`, " +
          "`second_column` là cột thứ hai (chỉ số 1) của `arr`, và `picked` là phần tử ở hàng `row_i`, cột `col_j`. " +
          "Sau đó hoàn thiện hàm `describe_array(a)` trả về dictionary với bốn khóa `ndim`, `shape` (tuple), `size` và `dtype` (chuỗi) của mảng `a` bất kỳ. " +
          "Khi nộp bài, hàm được gọi với nhiều mảng khác nhau về số chiều và dtype.",
        data,
      },
      runtime: { setupData: data },
      grading: {
        data: {
          expectedArr: arrayValues,
          arrShape: [rows, columns],
          elementCount: rows * columns,
          lastRow: table[rows - 1]!,
          secondColumn: table.map((row) => row[1]!),
          picked: table[rowIndex]![columnIndex]!,
          cases: asJson(cases),
        },
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-15 (M9-08) - vectorization, boolean masks, an axis operation (real NumPy in Pyodide)
// ---------------------------------------------------------------------------------------

/** Mean of the valid (0 <= v <= max) readings of one row; 0 when the row has none. */
function validMean(row: readonly number[], maxValue: number): number {
  const kept = row.filter((value) => value >= 0 && value <= maxValue);
  return kept.length === 0 ? 0 : sum(kept) / kept.length;
}

const maskOf = (grid: readonly (readonly number[])[], maxValue: number): boolean[][] =>
  grid.map((row) => row.map((value) => value >= 0 && value <= maxValue));

const scaledOf = (grid: readonly (readonly number[])[], maxValue: number): number[][] =>
  grid.map((row) => row.map((value) => (value >= 0 && value <= maxValue ? value / maxValue : 0)));

const meansOf = (grid: readonly (readonly number[])[], maxValue: number): number[] =>
  grid.map((row) => validMean(row, maxValue));

export const pf15Generator: MissionGenerator = {
  generate({ rng }) {
    const maxValue = rng.pick([100, 255] as const);
    const sensors = rng.nextInt(3, 5);
    const steps = rng.nextInt(5, 8);

    let grid: number[][] = [];
    for (let attempt = 0; attempt < 200; attempt += 1) {
      grid = Array.from({ length: sensors }, () => randomInts(rng, steps, 1, maxValue));
      // Boundary readings are always present, and every row keeps at least one valid value.
      grid[0]![0] = 0;
      grid[sensors - 1]![steps - 1] = maxValue;
      // Invalid readings: a negative sentinel and values above the maximum.
      grid[1]![rng.nextInt(0, steps)] = -1;
      grid[0]![rng.nextInt(1, steps)] = maxValue + rng.nextInt(1, 40);
      grid[sensors - 1]![rng.nextInt(0, steps - 1)] = -rng.nextInt(1, 9);
      const means = meansOf(grid, maxValue);
      const best = Math.max(...means);
      if (means.filter((value) => value === best).length === 1) break;
    }

    const data = { grid, max_value: maxValue };
    const maskGrid = maskOf(grid, maxValue);
    const means = meansOf(grid, maxValue);

    const flat = grid.flat();
    const smallBoundaries = [[0, maxValue, -0.5, maxValue + 0.5, 5]];
    const allInvalid = [[-1, -3, maxValue + 7], [maxValue + 1, -2, -9]];
    const allValid = [[1, 2, 3], [maxValue, 0, 6]];
    const column = [[7], [-1], [maxValue + 3], [maxValue]];
    const oneDimensional = [3, -1, maxValue + 2, 7, 0];
    const emptyRow = [[-1, -1, maxValue + 5], [10, 20, 30]];
    const otherGrid = Array.from({ length: 3 }, () => randomInts(rng, 4, -5, maxValue + 10));

    const f64 = (value: PyValue): PyValue => nd(value, "float64");
    const bool = (value: PyValue): PyValue => nd(value, "bool");
    const mask = (id: string, label: string, input: PyValue, expected: PyValue): FunctionCase =>
      hiddenCase(id, label, [f64(input), maxValue], returns(bool(expected), "ndarray"));
    const scale = (id: string, label: string, input: PyValue, expected: PyValue): FunctionCase =>
      hiddenCase(id, label, [f64(input), maxValue], returns(f64(expected), "ndarray", TOLERANCE));
    const mean = (id: string, label: string, input: PyValue, expected: PyValue): FunctionCase =>
      hiddenCase(id, label, [f64(input), maxValue], returns(f64(expected), "ndarray", TOLERANCE));

    const maskCases: FunctionCase[] = [
      exampleCase("mask-example", "Ví dụ trong đề", [f64(grid), maxValue], returns(bool(maskGrid), "ndarray")),
      mask("mask-boundaries", "Giá trị đúng bằng 0 và max_value vẫn hợp lệ", smallBoundaries, maskOf(smallBoundaries, maxValue)),
      mask("mask-all-invalid", "Không có giá trị hợp lệ nào", allInvalid, maskOf(allInvalid, maxValue)),
      mask("mask-all-valid", "Mọi giá trị đều hợp lệ", allValid, maskOf(allValid, maxValue)),
      mask("mask-column", "Mảng một cột", column, maskOf(column, maxValue)),
      hiddenCase(
        "mask-1d",
        "Mảng 1 chiều",
        [f64(oneDimensional), maxValue],
        returns(bool(oneDimensional.map((value) => value >= 0 && value <= maxValue)), "ndarray"),
      ),
      mask("mask-other", "Dữ liệu khác", otherGrid, maskOf(otherGrid, maxValue)),
    ];

    const scaleCases: FunctionCase[] = [
      exampleCase("scale-example", "Ví dụ trong đề", [f64(grid), maxValue], returns(f64(scaledOf(grid, maxValue)), "ndarray", TOLERANCE)),
      scale("scale-boundaries", "Giá trị sát hai đầu mút", smallBoundaries, scaledOf(smallBoundaries, maxValue)),
      scale("scale-all-invalid", "Không có giá trị hợp lệ: toàn 0.0", allInvalid, scaledOf(allInvalid, maxValue)),
      scale("scale-all-valid", "Mọi giá trị đều hợp lệ", allValid, scaledOf(allValid, maxValue)),
      scale("scale-column", "Mảng một cột", column, scaledOf(column, maxValue)),
      scale("scale-other", "Dữ liệu khác", otherGrid, scaledOf(otherGrid, maxValue)),
    ];

    const meanCases: FunctionCase[] = [
      exampleCase("mean-example", "Ví dụ trong đề", [f64(grid), maxValue], returns(f64(means), "ndarray", TOLERANCE)),
      mean("mean-empty-row", "Một cảm biến không có giá trị hợp lệ: trung bình 0.0", emptyRow, meansOf(emptyRow, maxValue)),
      mean("mean-all-invalid", "Mọi cảm biến đều không có giá trị hợp lệ", allInvalid, meansOf(allInvalid, maxValue)),
      mean("mean-all-valid", "Mọi giá trị đều hợp lệ", allValid, meansOf(allValid, maxValue)),
      mean("mean-column", "Mảng một cột", column, meansOf(column, maxValue)),
      mean("mean-other", "Dữ liệu khác", otherGrid, meansOf(otherGrid, maxValue)),
    ];

    return {
      learner: {
        objective:
          "Làm sạch và tóm tắt một lưới số đo cảm biến bằng vector hóa, mặt nạ Boolean và phép toán theo axis của NumPy.",
        context:
          "`grid` là lưới số đo (mỗi hàng là một cảm biến, mỗi cột là một thời điểm). Một số đo HỢP LỆ khi nằm trong đoạn từ 0 đến `max_value`, tính cả hai đầu mút. " +
          "Gán `data` là ndarray tạo từ `grid` với `dtype=np.float64`. Hoàn thiện ba hàm, mỗi hàm nhận ndarray `data` và `max_value` và KHÔNG được sửa `data`: " +
          "`valid_mask` trả về mảng Boolean cùng shape (True ở số đo hợp lệ); " +
          "`scale_valid` trả về mảng float64 cùng shape: số đo hợp lệ chia cho `max_value`, số đo không hợp lệ thành 0.0; " +
          "`sensor_means` trả về mảng float64 một chiều, mỗi phần tử là trung bình CÁC SỐ ĐO HỢP LỆ của một hàng (0.0 nếu hàng đó không có số đo hợp lệ). " +
          "Cuối cùng gán `valid_total` là tổng số đo hợp lệ của `data` và `best_sensor` là chỉ số hàng có trung bình cao nhất (luôn chỉ có một hàng như vậy); cả hai phải là số nguyên Python thường. " +
          "Không dùng vòng lặp for để duyệt từng phần tử.",
        data,
      },
      runtime: { setupData: data },
      grading: {
        data: {
          gridValues: grid,
          gridShape: [sensors, steps],
          validTotal: maskGrid.flat().filter(Boolean).length,
          bestSensor: means.indexOf(Math.max(...means)),
          maskCases: asJson(maskCases),
          scaleCases: asJson(scaleCases),
          meanCases: asJson(meanCases),
          flatCount: flat.length,
        },
      },
    };
  },
};

export function registerPythonFoundationsM9Generators(registry: GeneratorRegistry): void {
  registry.registerGenerator(PYTHON_FOUNDATIONS_M9_GENERATOR_ID.PF08, pf08Generator);
  registry.registerGenerator(PYTHON_FOUNDATIONS_M9_GENERATOR_ID.PF09, pf09Generator);
  registry.registerGenerator(PYTHON_FOUNDATIONS_M9_GENERATOR_ID.PF10, pf10Generator);
  registry.registerGenerator(PYTHON_FOUNDATIONS_M9_GENERATOR_ID.PF11, pf11Generator);
  registry.registerGenerator(PYTHON_FOUNDATIONS_M9_GENERATOR_ID.PF12, pf12Generator);
  registry.registerGenerator(PYTHON_FOUNDATIONS_M9_GENERATOR_ID.PF13, pf13Generator);
  registry.registerGenerator(PYTHON_FOUNDATIONS_M9_GENERATOR_ID.PF14, pf14Generator);
  registry.registerGenerator(PYTHON_FOUNDATIONS_M9_GENERATOR_ID.PF15, pf15Generator);
}
