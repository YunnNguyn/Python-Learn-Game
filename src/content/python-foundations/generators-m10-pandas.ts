import type { JsonValue } from "../../core/domain";
import type { MissionGenerator } from "../../core/generators";
import type { FunctionCase, PyValue } from "../../core/grading";

import {
  asJson,
  compareText,
  exampleCase,
  frame,
  hiddenCase,
  medianOf,
  randomInts,
  returns,
  seriesOf,
  sumOf,
  TOLERANCE,
  tup,
  range,
} from "./generators-m10-support";

/**
 * Generators of the M10 pandas missions PF-19..PF-22 (PHASE-08): DataFrame fundamentals,
 * filtering and transformation without mutation, missing values and type conversion, and
 * groupby / aggregation with a deterministic order.
 *
 * Datasets are tiny and authored here. Every expected table is a `$dataframe` / `$series`
 * value (see core/grading/function-cases.ts): the grader compares columns, index, dtypes
 * and cell values, not a printed string. Numbers are chosen to be exact in binary
 * (halves, quarters) so the only tolerance needed is for means.
 */

const NAMES = ["An", "Binh", "Chi", "Dung", "Giang", "Hoa", "Khanh", "Lan", "Minh", "Nam", "Oanh", "Phuc"] as const;
const CITIES = ["Ha Noi", "Da Nang", "Hue", "Can Tho", "Hai Phong", "Nha Trang"] as const;

/** Row-major cells of a dict-of-lists. */
const rowsOf = (columns: Readonly<Record<string, readonly PyValue[]>>): PyValue[][] => {
  const names = Object.keys(columns);
  const length = columns[names[0]!]!.length;
  return Array.from({ length }, (_, index) => names.map((name) => columns[name]![index]!));
};

const asRecord = (columns: Readonly<Record<string, readonly PyValue[]>>): { [key: string]: JsonValue } =>
  Object.fromEntries(Object.entries(columns).map(([name, values]) => [name, [...values]]));

/** A float column that is guaranteed to contain a non-integer value, so pandas infers float64. */
function withFraction(values: number[], position: number): number[] {
  const copy = [...values];
  if (copy.every(Number.isInteger)) copy[position] = copy[position]! + 0.5;
  return copy;
}

// ---------------------------------------------------------------------------------------
// PF-19 (M10-04) - DataFrame fundamentals: construct, inspect, loc / iloc
// ---------------------------------------------------------------------------------------

const PF19_COLUMNS = ["id", "name", "city", "age", "score"] as const;
const PF19_DTYPES = { id: "int64", name: "str", city: "str", age: "int64", score: "float64" } as const;

export const pf19Generator: MissionGenerator = {
  generate({ rng }) {
    const n = rng.nextInt(5, 7);
    const ids = range(0, n).map((index) => 101 + index * 2 + rng.nextInt(0, 2));
    const names = rng.shuffle(NAMES).slice(0, n);
    const cities = Array.from({ length: n }, () => rng.pick(CITIES));
    const ages = randomInts(rng, n, 18, 41);
    const scores = withFraction(
      Array.from({ length: n }, () => rng.nextInt(10, 21) / 2),
      rng.nextInt(0, n),
    );
    const columns = { id: ids, name: names, city: cities, age: ages, score: scores };
    const targetPosition = rng.nextInt(2, n);
    const targetId = ids[targetPosition]!;
    const cellRow = rng.nextInt(1, n);
    const data = { people: asRecord(columns), target_id: targetId, row_pos: cellRow };

    const rows = rowsOf(columns);
    const index = range(0, n);
    const byIdRows = rows.map((row) => row.slice(1));

    // ---- describe_frame cases: frames of different shapes and dtypes
    const describe = (cols: readonly string[], dtypes: Record<string, string>, nRows: number) => ({
      rows: nRows,
      columns: [...cols],
      dtypes: { ...dtypes },
    });
    const cases: FunctionCase[] = [
      exampleCase(
        "describe-example",
        "Ví dụ trong đề",
        [frame(PF19_COLUMNS, rows, { dtypes: PF19_DTYPES })],
        returns(describe(PF19_COLUMNS, PF19_DTYPES, n), "dict"),
      ),
      hiddenCase(
        "describe-one-column",
        "Bảng một cột số nguyên",
        [frame(["x"], [[1], [2], [3]], { dtypes: { x: "int64" } })],
        returns(describe(["x"], { x: "int64" }, 3), "dict"),
      ),
      hiddenCase(
        "describe-mixed",
        "Bảng có cột Boolean, số thực và chuỗi",
        [frame(["flag", "ratio", "label"], [[true, 0.5, "a"], [false, 1.5, "b"]], { dtypes: { flag: "bool", ratio: "float64", label: "str" } })],
        returns(describe(["flag", "ratio", "label"], { flag: "bool", ratio: "float64", label: "str" }, 2), "dict"),
      ),
      hiddenCase(
        "describe-no-rows",
        "Bảng không có hàng nào vẫn có cột và dtype",
        [frame(["a", "b"], [], { dtypes: { a: "int64", b: "str" } })],
        returns(describe(["a", "b"], { a: "int64", b: "str" }, 0), "dict"),
      ),
      hiddenCase(
        "describe-wide",
        "Bảng nhiều cột hơn nhiều hàng",
        [frame(["p", "q", "r", "s"], [[1.5, 2, "u", true]], { dtypes: { p: "float64", q: "int64", r: "str", s: "bool" } })],
        returns(describe(["p", "q", "r", "s"], { p: "float64", q: "int64", r: "str", s: "bool" }, 1), "dict"),
      ),
    ];

    return {
      learner: {
        objective: "Dựng một DataFrame, đọc cấu trúc của nó và chọn dữ liệu bằng tên cột, loc và iloc.",
        context:
          "`people` là dictionary các cột (mỗi cột là một list cùng độ dài). Đoạn mã đã `import pandas as pd`. Gán: " +
          "`df` là DataFrame dựng từ `people`; `shape_of_df` là shape của `df` (một tuple); `column_names` là list tên cột; " +
          "`score_dtype` là TÊN dtype của cột `score` dưới dạng chuỗi; `names` là cột `name` (một Series); " +
          "`subset` là DataFrame chỉ gồm hai cột `name` và `score` (theo thứ tự đó); `first_two` là DataFrame gồm hai hàng đầu theo VỊ TRÍ; " +
          "`by_id` là `df` với cột `id` làm chỉ số hàng (index); `name_of_target` là `name` của người có `id` bằng `target_id`, tra theo NHÃN trong `by_id`; " +
          "`cell` là giá trị cột `age` ở hàng có VỊ TRÍ `row_pos` của `df`. " +
          "Sau đó hoàn thiện hàm `describe_frame(frame)` trả về dictionary `{\"rows\": số_hàng, \"columns\": list_tên_cột, \"dtypes\": {tên_cột: tên_dtype_dạng_chuỗi}}` của một DataFrame bất kỳ.",
        data,
      },
      runtime: { setupData: data },
      grading: {
        data: {
          df: frame(PF19_COLUMNS, rows, { index, indexName: null, dtypes: PF19_DTYPES }),
          shapeOfDf: [n, 5],
          columnNames: [...PF19_COLUMNS],
          scoreDtype: "float64",
          names: seriesOf(names, { index, name: "name", dtype: "str" }),
          subset: frame(["name", "score"], rows.map((row) => [row[1]!, row[4]!]), {
            index,
            dtypes: { name: "str", score: "float64" },
          }),
          firstTwo: frame(PF19_COLUMNS, rows.slice(0, 2), { index: [0, 1], dtypes: PF19_DTYPES }),
          byId: frame(["name", "city", "age", "score"], byIdRows, {
            index: ids,
            indexName: "id",
            dtypes: { name: "str", city: "str", age: "int64", score: "float64" },
          }),
          nameOfTarget: names[targetPosition]!,
          cell: ages[cellRow]!,
          cases: asJson(cases),
        },
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-20 (M10-05) - filtering and transformation without mutation
// ---------------------------------------------------------------------------------------

const PRODUCTS = ["pen", "book", "lamp", "bag", "mug", "desk", "chair", "fan"] as const;
const REGIONS = ["Bac", "Trung", "Nam", "Tay"] as const;
const PRICES = [2.5, 4, 7.5, 12, 15.25, 20, 3.75] as const;

const PF20_COLUMNS = ["order_id", "product", "region", "qty", "unit_price"] as const;
const PF20_DTYPES = { order_id: "int64", product: "str", region: "str", qty: "int64", unit_price: "float64" } as const;
const PF20_TOTAL_DTYPES = { ...PF20_DTYPES, total: "float64" } as const;

interface Order {
  readonly orderId: number;
  readonly product: string;
  readonly region: string;
  readonly qty: number;
  readonly price: number;
}

const orderRow = (order: Order): PyValue[] => [order.orderId, order.product, order.region, order.qty, order.price];
const orderRowWithTotal = (order: Order): PyValue[] => [...orderRow(order), order.qty * order.price];

const selectOrders = (orders: readonly Order[], minTotal: number, regions: readonly string[]): number[] =>
  orders.flatMap((order, position) =>
    order.qty * order.price >= minTotal && regions.includes(order.region) ? [position] : [],
  );


const ordersFrame = (orders: readonly Order[], index?: readonly number[]): PyValue =>
  frame(PF20_COLUMNS, orders.map(orderRow), { dtypes: PF20_DTYPES, ...(index !== undefined ? { index } : {}) });

const totalFrame = (orders: readonly Order[], positions: readonly number[], index: readonly number[]): PyValue =>
  frame(
    [...PF20_COLUMNS, "total"],
    positions.map((position) => orderRowWithTotal(orders[position]!)),
    { index: positions.map((position) => index[position]!), dtypes: PF20_TOTAL_DTYPES },
  );

const FRACTIONAL_PRICES = [2.5, 7.5, 15.25, 3.75] as const;

export const pf20Generator: MissionGenerator = {
  generate({ rng }) {
    let orders: Order[] = [];
    let minTotal = 0;
    let targetRegions: string[] = [];
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const n = rng.nextInt(8, 11);
      orders = Array.from({ length: n }, (_, index) => ({
        orderId: 1001 + index,
        product: rng.pick(PRODUCTS),
        region: rng.pick(REGIONS),
        qty: rng.nextInt(1, 10),
        price: rng.pick(PRICES),
      }));
      orders[0] = { ...orders[0]!, price: rng.pick(FRACTIONAL_PRICES) };
      targetRegions = rng.shuffle(REGIONS).slice(0, 2);
      const inRegion = orders.filter((order) => targetRegions.includes(order.region));
      if (inRegion.length < 3) continue;
      const boundary = rng.pick(inRegion);
      minTotal = boundary.qty * boundary.price;
      const picked = selectOrders(orders, minTotal, targetRegions);
      const regionMatches = inRegion.length;
      // At least one row removed by the total and at least one by the region.
      if (picked.length >= 2 && picked.length < regionMatches && regionMatches < n) break;
    }

    const n = orders.length;
    const index = range(0, n);
    const picked = selectOrders(orders, minTotal, targetRegions);
    const columns = {
      order_id: orders.map((order) => order.orderId),
      product: orders.map((order) => order.product),
      region: orders.map((order) => order.region),
      qty: orders.map((order) => order.qty),
      unit_price: orders.map((order) => order.price),
    };
    const data = { orders: asRecord(columns), min_total: minTotal, target_regions: targetRegions };

    // ---- function cases
    const small: Order[] = [
      { orderId: 1, product: "pen", region: "Bac", qty: 2, price: 2.5 },
      { orderId: 2, product: "mug", region: "Nam", qty: 4, price: 12 },
      { orderId: 3, product: "fan", region: "Bac", qty: 1, price: 20 },
      { orderId: 4, product: "bag", region: "Tay", qty: 3, price: 7.5 },
    ];
    const labelled = [10, 20, 30, 40];
    const addTotalCases: FunctionCase[] = [
      exampleCase("total-example", "Ví dụ trong đề", [ordersFrame(orders)], returns(totalFrame(orders, index, index), "DataFrame", TOLERANCE)),
      hiddenCase("total-custom-index", "Giữ nguyên chỉ số hàng không phải 0, 1, 2, ...", [ordersFrame(small, labelled)], returns(totalFrame(small, [0, 1, 2, 3], labelled), "DataFrame", TOLERANCE)),
      hiddenCase("total-no-rows", "Bảng không có hàng nào", [ordersFrame([])], returns(totalFrame([], [], []), "DataFrame", TOLERANCE)),
    ];
    const selectCase = (id: string, label: string, source: readonly Order[], sourceIndex: readonly number[], threshold: number, regions: readonly string[]) =>
      hiddenCase(
        id,
        label,
        [ordersFrame(source, sourceIndex), threshold, [...regions]],
        returns(totalFrame(source, selectOrders(source, threshold, regions), sourceIndex), "DataFrame", TOLERANCE),
      );
    const selectCases: FunctionCase[] = [
      exampleCase("select-example", "Ví dụ trong đề", [ordersFrame(orders), minTotal, targetRegions], returns(totalFrame(orders, picked, index), "DataFrame", TOLERANCE)),
      selectCase("select-boundary", "Tổng đúng bằng ngưỡng vẫn được giữ", small, labelled, 10, ["Bac", "Nam"]),
      selectCase("select-one-region", "Chỉ một vùng", small, labelled, 0, ["Bac"]),
      selectCase("select-none", "Không hàng nào thỏa: bảng rỗng nhưng vẫn đủ cột", small, labelled, 1000, ["Bac", "Nam"]),
      selectCase("select-all", "Mọi hàng đều thỏa", small, labelled, 0, ["Bac", "Nam", "Tay"]),
      selectCase("select-region-only", "Vùng không có trong bảng", small, labelled, 0, ["Trung"]),
    ];

    return {
      learner: {
        objective:
          "Lọc hàng bằng nhiều điều kiện Boolean và thêm cột tính toán mà không làm thay đổi bảng gốc.",
        context:
          "`orders` là dictionary các cột (`order_id`, `product`, `region`, `qty`, `unit_price`). Đoạn mã đã dựng `df` từ nó. " +
          "Viết hai hàm, KHÔNG được sửa DataFrame đầu vào: " +
          "`add_total(frame)` trả về một DataFrame MỚI gồm mọi cột của `frame` và thêm cột `total` (= `qty` × `unit_price`) ở cuối; " +
          "`select_orders(frame, min_total, regions)` trả về các hàng có `total` lớn hơn hoặc bằng `min_total` VÀ có `region` nằm trong list `regions`; " +
          "kết quả có cả cột `total`, giữ nguyên thứ tự hàng và giữ NGUYÊN chỉ số hàng ban đầu (không đánh số lại). `frame` đưa vào chưa có cột `total`. " +
          "Cuối cùng gán `with_total` là `add_total(df)` và `selected` là `select_orders(df, min_total, target_regions)`. Sau khi chạy, `df` phải vẫn như lúc đầu (không có cột `total`).",
        data,
      },
      runtime: { setupData: data },
      grading: {
        data: {
          df: ordersFrame(orders, index),
          withTotal: totalFrame(orders, index, index),
          selected: totalFrame(orders, picked, index),
          addTotalCases: asJson(addTotalCases),
          selectCases: asJson(selectCases),
        },
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-21 (M10-06) - missing values and type conversion
// ---------------------------------------------------------------------------------------

interface RawRecord {
  readonly id: number | null;
  readonly city: string | null;
  readonly age: string | null;
  readonly income: string | null;
}

interface CleanRecord {
  readonly id: number;
  readonly city: string;
  readonly age: number;
  readonly income: number;
}

const PF21_COLUMNS = ["id", "city", "age", "income"] as const;
const PF21_RAW_DTYPES = { id: "float64", city: "str", age: "str", income: "str" } as const;
const PF21_CLEAN_DTYPES = { id: "int64", city: "str", age: "float64", income: "float64" } as const;

const parseAge = (text: string | null): number => (text !== null && /^\d+$/.test(text) ? Number(text) : Number.NaN);
const parseIncome = (text: string | null): number => {
  if (text === null) return Number.NaN;
  const digits = text.replace(/[$,]/g, "");
  return /^\d+(\.\d+)?$/.test(digits) ? Number(digits) : Number.NaN;
};
const titleCase = (text: string): string =>
  text
    .trim()
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, (_, space: string, letter: string) => space + letter.toUpperCase());

function cleanRecords(raw: readonly RawRecord[]): CleanRecord[] {
  const kept = raw.filter((record) => record.id !== null && !Number.isNaN(parseIncome(record.income)));
  const ages = kept.map((record) => parseAge(record.age)).filter((age) => !Number.isNaN(age));
  const fill = ages.length === 0 ? Number.NaN : medianOf(ages);
  return kept.map((record) => {
    const age = parseAge(record.age);
    return {
      id: record.id as number,
      city: record.city === null ? "Unknown" : titleCase(record.city),
      age: Number.isNaN(age) ? fill : age,
      income: parseIncome(record.income),
    };
  });
}

const rawFrame = (raw: readonly RawRecord[]): PyValue =>
  frame(PF21_COLUMNS, raw.map((record) => [record.id, record.city, record.age, record.income]), {
    dtypes: PF21_RAW_DTYPES,
  });

const cleanFrame = (clean: readonly CleanRecord[]): PyValue =>
  frame(PF21_COLUMNS, clean.map((record) => [record.id, record.city, record.age, record.income]), {
    index: range(0, clean.length),
    dtypes: PF21_CLEAN_DTYPES,
  });

const missingCounts = (raw: readonly RawRecord[]): Record<string, number> => ({
  id: raw.filter((record) => record.id === null).length,
  city: raw.filter((record) => record.city === null).length,
  age: raw.filter((record) => record.age === null).length,
  income: raw.filter((record) => record.income === null).length,
});

const CITY_STYLES: readonly ((city: string) => string)[] = [
  (city) => city,
  (city) => city.toUpperCase(),
  (city) => city.toLowerCase(),
  (city) => `  ${city} `,
];

export const pf21Generator: MissionGenerator = {
  generate({ rng }) {
    let raw: RawRecord[] = [];
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const n = rng.nextInt(9, 12);
      raw = Array.from({ length: n }, (_, index) => {
        const income = rng.nextInt(5, 40) * 100 + (rng.nextInt(0, 2) === 0 ? 0 : 50);
        const incomeText =
          rng.nextInt(0, 3) === 0 ? String(income) : `$${income.toLocaleString("en-US")}`;
        return {
          id: 201 + index,
          city: rng.pick(CITY_STYLES)(rng.pick(CITIES)),
          age: String(rng.nextInt(19, 60)),
          income: incomeText,
        };
      });
      const spots = rng.shuffle(range(0, n));
      raw[spots[0]!] = { ...raw[spots[0]!]!, id: null };
      raw[spots[1]!] = { ...raw[spots[1]!]!, income: rng.pick(["N/A", "", null]) };
      raw[spots[2]!] = { ...raw[spots[2]!]!, income: "N/A" };
      raw[spots[3]!] = { ...raw[spots[3]!]!, age: rng.pick(["n/a", "", null]) };
      raw[spots[4]!] = { ...raw[spots[4]!]!, age: "n/a" };
      raw[spots[5]!] = { ...raw[spots[5]!]!, city: null };
      raw[spots[6]!] = { ...raw[spots[6]!]!, city: null };
      const clean = cleanRecords(raw);
      // A kept row with padded spaces makes "strip" matter on the visible data, not only in hidden cases.
      const keptPadded = raw.some(
        (record) =>
          record.id !== null && !Number.isNaN(parseIncome(record.income)) && record.city !== null && record.city !== record.city.trim(),
      );
      if (clean.length >= 5 && clean.length <= n - 2 && keptPadded) break;
    }

    const columns = {
      id: raw.map((record) => record.id),
      city: raw.map((record) => record.city),
      age: raw.map((record) => record.age),
      income: raw.map((record) => record.income),
    };
    const data = { raw: asRecord(columns) };
    const clean = cleanRecords(raw);

    const tidy: RawRecord[] = [
      { id: 1, city: "Hue", age: "30", income: "$1,000" },
      { id: 2, city: "Ha Noi", age: "41", income: "250" },
    ];
    const lonelyAge: RawRecord[] = [
      { id: 7, city: " da nang ", age: "n/a", income: "$2,500" },
      { id: 8, city: "HUE", age: "", income: "900" },
      { id: 9, city: null, age: "52", income: "$1,200" },
      { id: 10, city: "can tho", age: null, income: "N/A" },
      { id: null, city: "Hue", age: "33", income: "$100" },
    ];
    const evenAges: RawRecord[] = [
      { id: 3, city: "x y", age: "20", income: "$10" },
      { id: 4, city: "z", age: "31", income: "$20" },
      { id: 5, city: "w", age: "n/a", income: "$30" },
    ];

    const cleanCase = (id: string, label: string, source: RawRecord[]): FunctionCase =>
      hiddenCase(id, label, [rawFrame(source)], returns(cleanFrame(cleanRecords(source)), "DataFrame", TOLERANCE));
    const cleanCases: FunctionCase[] = [
      exampleCase("clean-example", "Ví dụ trong đề", [rawFrame(raw)], returns(cleanFrame(clean), "DataFrame", TOLERANCE)),
      cleanCase("clean-tidy", "Dữ liệu đã sạch: chỉ đổi kiểu", tidy),
      cleanCase("clean-lonely-age", "Chỉ có một tuổi hợp lệ, thiếu id, thiếu thu nhập", lonelyAge),
      cleanCase("clean-median-even", "Trung vị của số lượng chẵn các tuổi hợp lệ", evenAges),
    ];
    const countCase = (id: string, label: string, source: RawRecord[]): FunctionCase =>
      hiddenCase(id, label, [rawFrame(source)], returns(missingCounts(source), "dict"));
    const countCases: FunctionCase[] = [
      exampleCase("count-example", "Ví dụ trong đề", [rawFrame(raw)], returns(missingCounts(raw), "dict")),
      countCase("count-none", "Bảng không thiếu gì", tidy),
      countCase("count-strings-not-missing", "Chuỗi 'n/a' hay rỗng chưa phải giá trị thiếu", lonelyAge),
    ];

    return {
      learner: {
        objective:
          "Phát hiện giá trị thiếu, chuyển chuỗi bẩn thành số và dựng lại một bảng sạch có dtype đúng.",
        context:
          "`raw` là dictionary các cột của một bảng khảo sát bẩn: `id`, `city`, `age` (chuỗi), `income` (chuỗi như `\"$1,250\"` hoặc `\"950\"`). Đoạn mã đã dựng `raw_df` từ nó. " +
          "Viết hai hàm, KHÔNG được sửa DataFrame đầu vào: " +
          "`count_missing(frame)` trả về dictionary `{tên_cột: số ô thiếu}` cho MỌI cột của `frame` (ô thiếu là `None`/`NaN`; chuỗi như `\"n/a\"` hay `\"\"` chưa phải ô thiếu); " +
          "`clean_records(frame)` trả về DataFrame mới, cùng thứ tự cột `id, city, age, income`, theo đúng các quy tắc sau: " +
          "(1) bỏ các hàng thiếu `id`, rồi đổi `id` sang `int64`; " +
          "(2) `income`: bỏ ký tự `$` và dấu `,` rồi đổi sang số thực (`float64`); hàng nào không đọc được `income` thì bị BỎ; " +
          "(3) `age`: đổi sang số thực, giá trị không đọc được (kể cả thiếu) được điền bằng TRUNG VỊ (median) của các tuổi đọc được trong các hàng còn lại sau bước (1) và (2); " +
          "(4) `city`: bỏ khoảng trắng hai đầu, viết hoa chữ cái đầu mỗi từ (kiểu `Ha Noi`); ô thiếu thành `\"Unknown\"`; " +
          "(5) đánh lại chỉ số hàng thành 0, 1, 2, ... Cuối cùng gán `missing_counts` là `count_missing(raw_df)` và `cleaned` là `clean_records(raw_df)`. Sau khi chạy, `raw_df` phải vẫn như lúc đầu.",
        data,
      },
      runtime: { setupData: data },
      grading: {
        data: {
          rawDf: frame(PF21_COLUMNS, raw.map((record) => [record.id, record.city, record.age, record.income]), {
            index: range(0, raw.length),
            dtypes: PF21_RAW_DTYPES,
          }),
          missingCounts: missingCounts(raw),
          cleaned: cleanFrame(clean),
          countCases: asJson(countCases),
          cleanCases: asJson(cleanCases),
        },
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-22 (M10-07) - groupby, aggregation, deterministic ordering
// ---------------------------------------------------------------------------------------

const STORES = ["Store A", "Store B", "Store C", "Store D"] as const;
const CATEGORIES = ["food", "home", "tech", "toys"] as const;
const SALE_PRICES = [2.5, 4, 7.5, 12, 15.25, 20] as const;

interface Sale {
  readonly store: string;
  readonly category: string;
  readonly units: number;
  readonly price: number;
}

const PF22_SALES_DTYPES = { store: "str", category: "str", units: "int64", price: "float64" } as const;
const PF22_REPORT_DTYPES = { orders: "int64", units: "int64", revenue: "float64", avg_revenue: "float64" } as const;

const salesFrame = (sales: readonly Sale[]): PyValue =>
  frame(["store", "category", "units", "price"], sales.map((sale) => [sale.store, sale.category, sale.units, sale.price]), {
    dtypes: PF22_SALES_DTYPES,
  });

interface CategoryRow {
  readonly category: string;
  readonly orders: number;
  readonly units: number;
  readonly revenue: number;
}

function categoryRows(sales: readonly Sale[]): CategoryRow[] {
  const groups = new Map<string, Sale[]>();
  for (const sale of sales) groups.set(sale.category, [...(groups.get(sale.category) ?? []), sale]);
  return [...groups.entries()]
    .map(([category, group]) => ({
      category,
      orders: group.length,
      units: sumOf(group.map((sale) => sale.units)),
      revenue: sumOf(group.map((sale) => sale.units * sale.price)),
    }))
    .sort((a, b) => b.revenue - a.revenue || compareText(a.category, b.category));
}

const reportFrame = (sales: readonly Sale[]): PyValue => {
  const rows = categoryRows(sales);
  return frame(
    ["orders", "units", "revenue", "avg_revenue"],
    rows.map((row) => [row.orders, row.units, row.revenue, row.revenue / row.orders]),
    { index: rows.map((row) => row.category), indexName: "category", dtypes: PF22_REPORT_DTYPES },
  );
};

const storeShares = (sales: readonly Sale[]): PyValue => {
  const totals = new Map<string, number>();
  for (const sale of sales) totals.set(sale.store, (totals.get(sale.store) ?? 0) + sale.units * sale.price);
  const stores = [...totals.keys()].sort(compareText);
  const grand = sumOf([...totals.values()]);
  return seriesOf(stores.map((store) => totals.get(store)! / grand), { index: stores, name: "share", dtype: "float64" });
};

export const pf22Generator: MissionGenerator = {
  generate({ rng }) {
    let sales: Sale[] = [];
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const stores = rng.shuffle(STORES).slice(0, 3);
      const categories = rng.shuffle(CATEGORIES).slice(0, rng.nextInt(3, 5));
      const n = rng.nextInt(12, 17);
      sales = Array.from({ length: n }, (_, index) => ({
        store: index < 3 ? stores[index]! : rng.pick(stores),
        category: index < categories.length ? categories[index]! : rng.pick(categories),
        units: rng.nextInt(1, 10),
        price: rng.pick(SALE_PRICES),
      }));
      sales[0] = { ...sales[0]!, price: rng.pick([2.5, 7.5, 15.25]) };
      const revenues = categoryRows(sales).map((row) => row.revenue);
      if (new Set(revenues).size === revenues.length) break;
    }

    const columns = {
      store: sales.map((sale) => sale.store),
      category: sales.map((sale) => sale.category),
      units: sales.map((sale) => sale.units),
      price: sales.map((sale) => sale.price),
    };
    const data = { sales: asRecord(columns) };

    // ---- function cases
    const tie: Sale[] = [
      { store: "Store B", category: "toys", units: 2, price: 10 },
      { store: "Store A", category: "home", units: 4, price: 5 },
      { store: "Store A", category: "food", units: 1, price: 18.5 },
      { store: "Store B", category: "food", units: 1, price: 1.5 },
    ];
    const single: Sale[] = [
      { store: "Store C", category: "tech", units: 3, price: 7.5 },
      { store: "Store C", category: "tech", units: 1, price: 2.5 },
    ];
    const lopsided: Sale[] = [
      { store: "Store D", category: "home", units: 9, price: 20 },
      { store: "Store A", category: "tech", units: 1, price: 4 },
      { store: "Store D", category: "tech", units: 2, price: 4 },
    ];

    const reportCases: FunctionCase[] = [
      exampleCase("report-example", "Ví dụ trong đề", [salesFrame(sales)], returns(reportFrame(sales), "DataFrame", TOLERANCE)),
      hiddenCase("report-tie", "Hai nhóm bằng doanh thu: xếp theo tên nhóm", [salesFrame(tie)], returns(reportFrame(tie), "DataFrame", TOLERANCE)),
      hiddenCase("report-single", "Chỉ có một nhóm", [salesFrame(single)], returns(reportFrame(single), "DataFrame", TOLERANCE)),
      hiddenCase("report-other", "Dữ liệu khác", [salesFrame(lopsided)], returns(reportFrame(lopsided), "DataFrame", TOLERANCE)),
    ];
    const topOf = (source: readonly Sale[]): string => categoryRows(source)[0]!.category;
    const topCases: FunctionCase[] = [
      exampleCase("top-example", "Ví dụ trong đề", [salesFrame(sales)], returns(topOf(sales), "str")),
      hiddenCase("top-tie", "Hòa doanh thu: lấy tên đứng trước theo bảng chữ cái", [salesFrame(tie)], returns(topOf(tie), "str")),
      hiddenCase("top-single", "Chỉ có một nhóm", [salesFrame(single)], returns(topOf(single), "str")),
      hiddenCase("top-other", "Dữ liệu khác", [salesFrame(lopsided)], returns(topOf(lopsided), "str")),
    ];
    const shareCases: FunctionCase[] = [
      exampleCase("share-example", "Ví dụ trong đề", [salesFrame(sales)], returns(storeShares(sales), "Series", TOLERANCE)),
      hiddenCase("share-tie", "Dữ liệu khác", [salesFrame(tie)], returns(storeShares(tie), "Series", TOLERANCE)),
      hiddenCase("share-single", "Chỉ có một cửa hàng: phần chia bằng 1.0", [salesFrame(single)], returns(storeShares(single), "Series", TOLERANCE)),
      hiddenCase("share-other", "Cửa hàng xuất hiện không theo thứ tự chữ cái", [salesFrame(lopsided)], returns(storeShares(lopsided), "Series", TOLERANCE)),
    ];

    return {
      learner: {
        objective: "Tổng hợp doanh thu theo nhóm bằng groupby và trả về kết quả có thứ tự xác định.",
        context:
          "`sales` là dictionary các cột (`store`, `category`, `units`, `price`). Đoạn mã đã dựng `sales_df` từ nó. Doanh thu của một dòng là `units` × `price`. " +
          "Viết ba hàm, KHÔNG sửa DataFrame đầu vào: " +
          "`category_report(frame)` trả về DataFrame có chỉ số hàng là `category` (tên chỉ số là `category`) và bốn cột, theo thứ tự: `orders` (số dòng của nhóm), `units` (tổng `units`), `revenue` (tổng doanh thu) và `avg_revenue` (doanh thu trung bình mỗi dòng); " +
          "các nhóm xếp theo `revenue` GIẢM DẦN, hai nhóm bằng nhau thì xếp theo tên nhóm tăng dần; " +
          "`top_category(frame)` trả về tên nhóm đứng đầu của bảng đó (một chuỗi); " +
          "`share_by_store(frame)` trả về Series tên `share`, chỉ số là tên cửa hàng xếp tăng dần theo bảng chữ cái, giá trị là tỉ lệ doanh thu của cửa hàng trên tổng doanh thu. " +
          "Cuối cùng gán `report`, `best` và `shares` là kết quả của ba hàm trên `sales_df`.",
        data,
      },
      runtime: { setupData: data },
      grading: {
        data: {
          salesDf: salesFrame(sales),
          report: reportFrame(sales),
          best: topOf(sales),
          shares: storeShares(sales),
          reportCases: asJson(reportCases),
          topCases: asJson(topCases),
          shareCases: asJson(shareCases),
        },
      },
    };
  },
};
