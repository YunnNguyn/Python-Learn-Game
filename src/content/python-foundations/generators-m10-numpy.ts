import type { MissionGenerator } from "../../core/generators";
import type { FunctionCase, PyValue } from "../../core/grading";

import {
  asJson,
  columnsOf,
  exampleCase,
  hiddenCase,
  meanOf,
  nd,
  populationStd,
  raises,
  randomInts,
  returns,
  sumOf,
  tup,
  TOLERANCE,
} from "./generators-m10-support";

/**
 * Generators of the M10 NumPy missions PF-16..PF-18 (PHASE-08): broadcasting and shapes,
 * axis reductions with keepdims and masks, and a vectorized preprocessing pipeline.
 *
 * Several tasks are built so that a plausible-looking answer gives the RIGHT numbers with
 * the WRONG shape (`x.reshape(1, n)` instead of a column, `sum(axis=1)` without keepdims,
 * `reshape(size, -1, f)` instead of `reshape(-1, size, f)`): the grader reports the shape
 * as the problem, not the values.
 */

const f64 = (value: PyValue, shape?: readonly number[]): PyValue => nd(value, "float64", shape);
const bool = (value: PyValue): PyValue => nd(value, "bool");

// ---------------------------------------------------------------------------------------
// PF-16 (M10-01) - broadcasting and array shapes
// ---------------------------------------------------------------------------------------

export const pf16Generator: MissionGenerator = {
  generate({ rng }) {
    const n = rng.nextInt(3, 6);
    const m = rng.pick([3, 4, 5].filter((value) => value !== n));
    const xs = randomInts(rng, n, 1, 10);
    const ys = randomInts(rng, m, 1, 10);
    const data = { xs, ys };

    const column = xs.map((value) => [value]);
    const grid = (combine: (a: number, b: number) => number): number[][] =>
      xs.map((a) => ys.map((b) => combine(a, b)));

    const shapeCase = (id: string, label: string, a: readonly number[], b: readonly number[], result: readonly number[] | null) =>
      hiddenCase(id, label, [tup(...a), tup(...b)], result === null ? raises("ValueError") : returns(tup(...result), "tuple"));

    const cases: FunctionCase[] = [
      exampleCase("shape-example", "Ví dụ trong đề", [tup(n, 1), tup(1, m)], returns(tup(n, m), "tuple")),
      shapeCase("shape-same", "Hai shape giống nhau", [n], [n], [n]),
      shapeCase("shape-mismatch", "Hai vector khác độ dài", [n], [m], null),
      shapeCase("shape-col-vs-vec", "Cột (n, 1) với vector (m,)", [n, 1], [m], [n, m]),
      shapeCase("shape-matrix-vec", "Ma trận (2, 3) với vector (3,)", [2, 3], [3], [2, 3]),
      shapeCase("shape-matrix-bad", "Ma trận (2, 3) với vector (2,)", [2, 3], [2], null),
      shapeCase("shape-one", "Shape (1,) kéo giãn thành (4, 2)", [1], [4, 2], [4, 2]),
      shapeCase("shape-3d", "Ba chiều: (5, 1, 3) với (4, 1)", [5, 1, 3], [4, 1], [5, 4, 3]),
      shapeCase("shape-scalar", "Shape rỗng () là một số vô hướng", [], [n], [n]),
      shapeCase("shape-both-stretch", "Cả hai cùng kéo giãn: (n, 1) với (1, n)", [n, 1], [1, n], [n, n]),
    ];

    return {
      learner: {
        objective:
          "Hiểu broadcasting: ghép mảng có shape khác nhau, và điều khiển shape bằng cách thêm một chiều.",
        context:
          "`xs` có độ dài n và `ys` có độ dài m (khác nhau). Đoạn mã đã tạo sẵn hai vector `x` (shape (n,)) và `y` (shape (m,)). " +
          "Hãy gán `x_col` là `x` đặt thành một CỘT (shape (n, 1)), `y_row` là `y` đặt thành một HÀNG (shape (1, m)), " +
          "`grid_sum` là bảng tổng `x_col + y_row` và `grid_product` là bảng tích `x_col * y_row` (cả hai có shape (n, m)). " +
          "Sau đó hoàn thiện hàm `broadcast_shape(shape_a, shape_b)`: nhận hai tuple shape và trả về tuple shape của kết quả khi NumPy broadcasting hai mảng đó, " +
          "hoặc báo `ValueError` nếu hai shape không tương thích. Hãy tự cài quy tắc (so sánh các chiều từ phải sang trái), đừng gọi `np.broadcast_shapes`.",
        data,
      },
      runtime: { setupData: data },
      grading: {
        data: {
          xCol: f64(column, [n, 1]),
          yRow: f64([ys], [1, m]),
          gridSum: f64(grid((a, b) => a + b), [n, m]),
          gridProduct: f64(grid((a, b) => a * b), [n, m]),
          x: f64(xs, [n]),
          y: f64(ys, [m]),
          cases: asJson(cases),
        },
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-17 (M10-02) - axis operations, keepdims, masks
// ---------------------------------------------------------------------------------------

const columnMeansAbove = (rows: readonly (readonly number[])[], threshold: number): number[] =>
  columnsOf(rows).map((column) => {
    const kept = column.filter((value) => value >= threshold);
    return kept.length === 0 ? 0 : meanOf(kept);
  });

const rowSharesOf = (rows: readonly (readonly number[])[]): number[][] =>
  rows.map((row) => {
    const total = sumOf(row);
    return row.map((value) => value / total);
  });

export const pf17Generator: MissionGenerator = {
  generate({ rng }) {
    const c = rng.nextInt(3, 5);
    const r = rng.pick([4, 5, 6].filter((value) => value !== c));
    const passMark = rng.nextInt(50, 71);
    let scores: number[][] = [];
    for (let attempt = 0; attempt < 100; attempt += 1) {
      scores = Array.from({ length: r }, () => randomInts(rng, c, 30, 101));
      // Some, but not all, of every kind of cell passes; a value equals the pass mark exactly.
      scores[rng.nextInt(0, r)]![rng.nextInt(0, c)] = passMark;
      const flat = scores.flat();
      const passing = flat.filter((value) => value >= passMark).length;
      if (passing > flat.length / 4 && passing < (flat.length * 3) / 4) break;
    }
    const data = { scores, pass_mark: passMark };

    const colMeans = columnsOf(scores).map(meanOf);
    const rowTotals = scores.map((row) => sumOf(row));
    const passed = scores.map((row) => row.map((value) => value >= passMark));

    // ---- function cases
    const nonSquare = [[40, 60, 80], [10, 20, 30], [90, 50, 70], [65, 65, 65]];
    const square = [[10, 30, 60], [20, 20, 60], [50, 25, 25]];
    const oneColumn = [[7], [3], [9]];
    const oneRow = [[2, 3, 5]];
    const edge = [[50, 70, 10], [50, 20, 90], [50, 30, 40]];

    const masked = (id: string, label: string, input: number[][], threshold: number): FunctionCase =>
      hiddenCase(id, label, [f64(input), threshold], returns(f64(columnMeansAbove(input, threshold)), "ndarray", TOLERANCE));
    const shares = (id: string, label: string, input: number[][]): FunctionCase =>
      hiddenCase(id, label, [f64(input)], returns(f64(rowSharesOf(input)), "ndarray", TOLERANCE));

    const maskedCases: FunctionCase[] = [
      exampleCase("masked-example", "Ví dụ trong đề", [f64(scores), passMark], returns(f64(columnMeansAbove(scores, passMark)), "ndarray", TOLERANCE)),
      masked("masked-boundary", "Giá trị đúng bằng ngưỡng vẫn được tính", edge, 50),
      masked("masked-none-in-column", "Một cột không có giá trị nào đạt ngưỡng: trung bình 0.0", nonSquare, 85),
      masked("masked-all-below", "Không cột nào có giá trị đạt ngưỡng", nonSquare, 1000),
      masked("masked-all-pass", "Mọi giá trị đều đạt ngưỡng", nonSquare, 0),
      masked("masked-single-column", "Mảng một cột", oneColumn, 5),
      masked("masked-other", "Dữ liệu khác", square, 25),
    ];
    const shareCases: FunctionCase[] = [
      exampleCase("shares-example", "Ví dụ trong đề", [f64(scores)], returns(f64(rowSharesOf(scores)), "ndarray", TOLERANCE)),
      shares("shares-square", "Ma trận vuông (3, 3)", square),
      shares("shares-nonsquare", "Ma trận không vuông", nonSquare),
      shares("shares-one-row", "Chỉ có một hàng", oneRow),
      shares("shares-one-column", "Chỉ có một cột: mỗi phần bằng 1.0", oneColumn),
    ];

    return {
      learner: {
        objective:
          "Tóm tắt một bảng điểm bằng phép toán theo axis; dùng keepdims để kết quả có shape dùng được cho broadcasting.",
        context:
          "`scores` là bảng điểm (mỗi hàng là một học sinh, mỗi cột là một bài kiểm tra) và `pass_mark` là điểm đạt. Đoạn mã đã tạo `arr` (float64) từ `scores`. " +
          "Gán: `col_means` là điểm trung bình của từng bài kiểm tra (shape (số_cột,)); " +
          "`row_totals` là tổng điểm của từng học sinh GIỮ NGUYÊN số chiều, shape (số_hàng, 1); " +
          "`centered` là `arr` trừ đi điểm trung bình của từng cột; `row_share` là điểm của mỗi bài chia cho tổng điểm của học sinh đó (mỗi hàng cộng lại bằng 1); " +
          "`passed` là mảng Boolean (cùng shape với `arr`) cho biết điểm có đạt hay không (đạt khi điểm lớn hơn hoặc bằng `pass_mark`); " +
          "`passed_per_student` là số bài đạt của từng học sinh (shape (số_hàng,)). " +
          "Sau đó hoàn thiện hai hàm nhận mảng 2 chiều `data` và không được sửa nó: " +
          "`masked_column_means(data, threshold)` trả về, cho từng cột, trung bình của CÁC GIÁ TRỊ ĐẠT NGƯỠNG (lớn hơn hoặc bằng `threshold`) trong cột đó, hoặc 0.0 nếu cột đó không có giá trị nào đạt (kết quả shape (số_cột,)); " +
          "`row_shares(data)` trả về mảng cùng shape, mỗi phần tử chia cho tổng của hàng của nó (mọi tổng hàng đều lớn hơn 0).",
        data,
      },
      runtime: { setupData: data },
      grading: {
        data: {
          arrValues: f64(scores),
          colMeans: f64(colMeans, [c]),
          rowTotals: f64(rowTotals.map((total) => [total]), [r, 1]),
          centered: f64(scores.map((row) => row.map((value, index) => value - colMeans[index]!)), [r, c]),
          rowShare: f64(rowSharesOf(scores), [r, c]),
          passed: bool(passed),
          // No dtype: NumPy's default integer is platform dependent (int32 in Pyodide).
          passedPerStudent: { $ndarray: passed.map((row) => row.filter(Boolean).length), shape: [r] },
          maskedCases: asJson(maskedCases),
          shareCases: asJson(shareCases),
        },
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-18 (M10-03) - advanced vectorized preprocessing
// ---------------------------------------------------------------------------------------

type Matrix = readonly (readonly number[])[];

const dropInvalid = (rows: Matrix): number[][] =>
  rows.filter((row) => row.every((value) => value >= 0)).map((row) => [...row]);

function standardizeRows(rows: Matrix): number[][] {
  if (rows.length === 0) return [];
  const columns = columnsOf(rows);
  const means = columns.map(meanOf);
  const stds = columns.map((column) => {
    const std = populationStd(column);
    return std === 0 ? 1 : std;
  });
  return rows.map((row) => row.map((value, index) => (value - means[index]!) / stds[index]!));
}

function toBatches(rows: Matrix, size: number): number[][][] {
  const batches = Math.floor(rows.length / size);
  return Array.from({ length: batches }, (_, batch) => rows.slice(batch * size, (batch + 1) * size).map((row) => [...row]));
}

const selectColumns = (rows: Matrix, cols: readonly number[]): number[][] =>
  rows.map((row) => cols.map((column) => row[column]!));

export const pf18Generator: MissionGenerator = {
  generate({ rng }) {
    const features = 4;
    let raw: number[][] = [];
    let cols: number[] = [0, 1, 2];
    let size = 2;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const rowCount = rng.nextInt(9, 13);
      raw = Array.from({ length: rowCount }, () => [
        rng.nextInt(30, 121),
        rng.nextInt(1, 6),
        rng.nextInt(0, 41),
        rng.nextInt(50, 400),
      ]);
      // The unused column is always the one the missing-value markers can hide in.
      const unused = rng.nextInt(0, features);
      cols = [0, 1, 2, 3].filter((column) => column !== unused);
      // Two invalid cells inside the used columns, one more in the unused column.
      const rowsShuffled = rng.shuffle(Array.from({ length: rowCount }, (_, index) => index));
      raw[rowsShuffled[0]!]![cols[rng.nextInt(0, cols.length)]!] = -1;
      raw[rowsShuffled[1]!]![cols[rng.nextInt(0, cols.length)]!] = -1;
      raw[rowsShuffled[2]!]![unused] = -1;
      size = rng.pick([2, 3, 4]);
      const kept = dropInvalid(selectColumns(raw, cols)).length;
      if (Math.floor(kept / size) >= 2 && kept % size !== 0) break;
    }

    const data = { raw, use_cols: cols, batch_size: size };
    const selected = selectColumns(raw, cols);
    const kept = dropInvalid(selected);
    const standardized = standardizeRows(kept);
    const batches = toBatches(standardized, size);
    const featureCount = cols.length;

    // ---- function cases
    const constantColumn = [[5, 1, 9], [5, 2, 3], [5, 3, 6], [5, 4, 0]];
    const mixed = [[1, 2, 3], [-1, 5, 6], [7, -2, 9], [4, 5, 6]];
    const allBad = [[-1, 1, 2], [3, -4, 5]];
    const spread = [[10, 20], [30, 60], [50, 40], [20, 80], [40, 20]];

    const dropCase = (id: string, label: string, input: number[][]): FunctionCase => {
      const out = dropInvalid(input);
      return hiddenCase(id, label, [f64(input)], returns(f64(out, [out.length, input[0]!.length]), "ndarray", TOLERANCE));
    };
    const stdCase = (id: string, label: string, input: number[][]): FunctionCase =>
      hiddenCase(id, label, [f64(input)], returns(f64(standardizeRows(input), [input.length, input[0]!.length]), "ndarray", TOLERANCE));
    const batchCase = (id: string, label: string, input: number[][], batchSize: number): FunctionCase => {
      const out = toBatches(input, batchSize);
      return hiddenCase(id, label, [f64(input), batchSize], returns(f64(out, [out.length, batchSize, input[0]!.length]), "ndarray", TOLERANCE));
    };
    const prepareCase = (id: string, label: string, input: number[][], useCols: number[], batchSize: number): FunctionCase => {
      const out = toBatches(standardizeRows(dropInvalid(selectColumns(input, useCols))), batchSize);
      return hiddenCase(id, label, [f64(input), useCols, batchSize], returns(f64(out, [out.length, batchSize, useCols.length]), "ndarray", TOLERANCE));
    };

    const dropCases: FunctionCase[] = [
      exampleCase("drop-example", "Ví dụ trong đề", [f64(selected)], returns(f64(kept, [kept.length, featureCount]), "ndarray", TOLERANCE)),
      dropCase("drop-mixed", "Có hàng chứa giá trị -1", mixed),
      dropCase("drop-all-bad", "Mọi hàng đều chứa giá trị không hợp lệ: 0 hàng nhưng vẫn đủ cột", allBad),
      dropCase("drop-all-good", "Không hàng nào bị loại", spread),
    ];
    const stdCases: FunctionCase[] = [
      exampleCase("std-example", "Ví dụ trong đề", [f64(kept)], returns(f64(standardized, [kept.length, featureCount]), "ndarray", TOLERANCE)),
      stdCase("std-constant", "Một cột hằng số: cột đó thành toàn 0.0", constantColumn),
      stdCase("std-spread", "Dữ liệu khác", spread),
    ];
    const batchCases: FunctionCase[] = [
      exampleCase("batch-example", "Ví dụ trong đề", [f64(standardized), size], returns(f64(batches, [batches.length, size, featureCount]), "ndarray", TOLERANCE)),
      batchCase("batch-remainder", "Số hàng không chia hết cho cỡ lô: bỏ phần dư", spread, 2),
      batchCase("batch-exact", "Chia hết", spread.slice(0, 4), 2),
      batchCase("batch-too-big", "Cỡ lô lớn hơn số hàng: 0 lô", spread, 8),
      hiddenCase("batch-zero", "Cỡ lô 0 là không hợp lệ", [f64(spread), 0], raises("ValueError")),
    ];
    const prepareCases: FunctionCase[] = [
      exampleCase("prepare-example", "Ví dụ trong đề", [f64(raw), cols, size], returns(f64(batches, [batches.length, size, featureCount]), "ndarray", TOLERANCE)),
      prepareCase("prepare-select-first", "Chọn cột trước rồi mới loại hàng (-1 ở cột không dùng thì giữ)", [[1, -1, 3], [2, 5, 6], [3, 6, 7], [4, 7, 8], [5, 8, 9]], [0, 2], 2),
      prepareCase("prepare-all-bad", "Mọi hàng bị loại", [[-1, 1, 1], [1, -1, 1]], [0, 1, 2], 2),
    ];

    const keptRows = kept.length;
    return {
      learner: {
        objective:
          "Tiền xử lý một ma trận đặc trưng bằng vector hóa: chọn cột, loại hàng lỗi, chuẩn hóa theo cột và chia thành các lô.",
        context:
          "`raw` là ma trận thô, mỗi hàng là một mẫu và mỗi cột là một đặc trưng; giá trị `-1` đánh dấu một ô bị thiếu. Đoạn mã đã tạo `data` (float64) từ `raw`. " +
          "Viết bốn hàm, KHÔNG dùng vòng lặp for trên từng phần tử và KHÔNG sửa mảng đầu vào: " +
          "`drop_invalid_rows(data)` giữ lại các hàng mà MỌI giá trị đều không âm (giữ nguyên thứ tự hàng, shape (số_hàng_giữ, số_cột)); " +
          "`standardize(data)` trừ trung bình rồi chia độ lệch chuẩn của TỪNG CỘT (độ lệch chuẩn tổng thể, ddof=0); cột có độ lệch chuẩn 0 thì cả cột thành 0.0; " +
          "`to_batches(data, size)` lấy các hàng đầu theo từng lô liên tiếp `size` hàng, bỏ phần dư không đủ một lô, và trả về mảng 3 chiều shape (số_lô, size, số_cột); `size` nhỏ hơn 1 thì báo `ValueError`; " +
          "`prepare(data, cols, size)` chọn các cột trong danh sách `cols` TRƯỚC, rồi loại hàng lỗi, chuẩn hóa và chia lô. " +
          "Cuối cùng gán `prepared` là `prepare(data, use_cols, batch_size)` và `rows_kept` là số hàng còn lại sau khi loại hàng lỗi (một số nguyên Python).",
        data,
      },
      runtime: { setupData: data },
      grading: {
        data: {
          dataValues: f64(raw),
          prepared: f64(batches, [batches.length, size, featureCount]),
          rowsKept: keptRows,
          dropCases: asJson(dropCases),
          stdCases: asJson(stdCases),
          batchCases: asJson(batchCases),
          prepareCases: asJson(prepareCases),
        },
      },
    };
  },
};
