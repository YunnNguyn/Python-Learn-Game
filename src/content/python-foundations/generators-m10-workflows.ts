import type { MissionGenerator } from "../../core/generators";
import type { FunctionCase, PyValue } from "../../core/grading";

import {
  buildOrderDataset,
  CLEAN_HOUSING_COLUMNS,
  CUSTOMER_COLUMNS,
  DATASET_COLUMNS,
  HOUSING_COLUMNS,
  HOUSING_FIXTURES,
  ORDERS_FIXTURES,
  ORDER_COLUMNS,
  prepareHousing,
  type CustomerRow,
  type HousingRaw,
  type HousingResult,
  type OrderRow,
} from "./datasets-m10";
import {
  asJson,
  exampleCase,
  figure,
  frame,
  hiddenCase,
  nd,
  raises,
  range,
  returns,
  TOLERANCE,
} from "./generators-m10-support";

/**
 * Generators of the M10 workflow missions PF-25 and PF-26 (PHASE-08): read CSV files from the
 * virtual workspace, validate, clean, join, and prepare a feature matrix.
 *
 * The CSV files themselves are authored in datasets-m10.ts (three fixed variants each); the
 * mission variant only selects which file name is put in the learner's Data tab. The hidden
 * function cases build their own small tables (they never touch the staged files), so a
 * solution that hard-codes the visible files' result fails them.
 */

// ---------------------------------------------------------------------------------------
// PF-25 (M10-10) - CSV to a clean dataset
// ---------------------------------------------------------------------------------------

const CUSTOMER_DTYPES = { customer_id: "int64", name: "str", city: "str", age: "float64" } as const;
const ORDER_DTYPES = { order_id: "int64", customer_id: "int64", amount: "float64", status: "str" } as const;
const DATASET_DTYPES = { order_id: "int64", customer_id: "int64", name: "str", city: "str", amount: "float64" } as const;

const customersFrame = (rows: readonly CustomerRow[]): PyValue =>
  frame(CUSTOMER_COLUMNS, rows.map((row) => [row.customerId, row.name, row.city, row.age]), { dtypes: CUSTOMER_DTYPES });

const ordersFrame = (rows: readonly OrderRow[]): PyValue =>
  frame(ORDER_COLUMNS, rows.map((row) => [row.orderId, row.customerId, row.amount, row.status]), { dtypes: ORDER_DTYPES });

const datasetFrame = (customers: readonly CustomerRow[], orders: readonly OrderRow[]): PyValue => {
  const { dataset } = buildOrderDataset(customers, orders);
  return frame(
    DATASET_COLUMNS,
    dataset.map((row) => [row.orderId, row.customerId, row.name, row.city, row.amount]),
    // An empty result only has to keep the column names; dtypes are checked when there are rows.
    { index: range(0, dataset.length), ...(dataset.length > 0 ? { dtypes: DATASET_DTYPES } : {}) },
  );
};

export const pf25Generator: MissionGenerator = {
  generate({ rng }) {
    const fixture = rng.pick(ORDERS_FIXTURES);
    const data = { customers_file: fixture.customersFile, orders_file: fixture.ordersFile };
    const { orphans } = buildOrderDataset(fixture.customers, fixture.orders);

    // ---- build_dataset cases built from small tables of their own
    const customers: CustomerRow[] = [
      { customerId: 1, name: " Ann ", city: "ha NOI", age: 30 },
      { customerId: 2, name: "Bao", city: "  DA NANG", age: null },
      { customerId: 1, name: "Ann Duplicate", city: "Elsewhere", age: 40 },
      { customerId: 3, name: "Cuong", city: "hue", age: 22 },
    ];
    const orders: OrderRow[] = [
      { orderId: 30, customerId: 3, amount: 12.5, status: "paid" },
      { orderId: 10, customerId: 1, amount: 100, status: " PAID " },
      { orderId: 20, customerId: 2, amount: 50, status: "refunded" },
      { orderId: 40, customerId: 9, amount: 70, status: "paid" },
      { orderId: 25, customerId: 2, amount: null, status: "paid" },
      { orderId: 15, customerId: 2, amount: 8.5, status: "Paid" },
    ];
    const unpaid: OrderRow[] = [
      { orderId: 1, customerId: 1, amount: 5, status: "pending" },
      { orderId: 2, customerId: 3, amount: 6, status: "refunded" },
    ];
    const strangers: OrderRow[] = [
      { orderId: 1, customerId: 77, amount: 5, status: "paid" },
      { orderId: 2, customerId: 78, amount: 6, status: "paid" },
    ];

    const buildCase = (id: string, label: string, c: CustomerRow[], o: OrderRow[]): FunctionCase =>
      hiddenCase(id, label, [customersFrame(c), ordersFrame(o)], returns(datasetFrame(c, o), "DataFrame", TOLERANCE));
    const buildCases: FunctionCase[] = [
      exampleCase("build-example", "Ví dụ trong đề", [customersFrame(fixture.customers), ordersFrame(fixture.orders)], returns(datasetFrame(fixture.customers, fixture.orders), "DataFrame", TOLERANCE)),
      buildCase("build-mixed", "Khách trùng id, trạng thái viết khác nhau, đơn mồ côi và thiếu số tiền", customers, orders),
      buildCase("build-none-paid", "Không có đơn nào đã thanh toán: bảng rỗng nhưng vẫn đủ cột", customers, unpaid),
      buildCase("build-all-orphans", "Mọi đơn đều thuộc khách không có trong bảng khách", customers, strangers),
    ];

    const checkCase = (id: string, label: string, columns: readonly string[], required: readonly string[], ok: boolean): FunctionCase =>
      hiddenCase(
        id,
        label,
        [frame(columns, [], { dtypes: Object.fromEntries(columns.map((column) => [column, "int64"])) as Record<string, "int64"> }), [...required]],
        ok ? returns(null, "NoneType") : raises("ValueError"),
      );
    const checkCases: FunctionCase[] = [
      exampleCase("check-example", "Ví dụ trong đề", [customersFrame([]), [...CUSTOMER_COLUMNS]], returns(null, "NoneType")),
      checkCase("check-missing-one", "Thiếu một cột bắt buộc", ["a", "b"], ["a", "b", "c"], false),
      checkCase("check-missing-all", "Thiếu mọi cột bắt buộc", ["x"], ["a", "b"], false),
      checkCase("check-extra-ok", "Có thêm cột ngoài danh sách bắt buộc vẫn hợp lệ", ["a", "b", "c"], ["b"], true),
      checkCase("check-nothing-required", "Không yêu cầu cột nào", ["a"], [], true),
    ];

    return {
      learner: {
        objective:
          "Đọc hai file CSV từ workspace, kiểm tra cột, làm sạch từng bảng rồi ghép chúng bằng một phép join phù hợp.",
        context:
          "Trong thư mục `data/` có sẵn nhiều file CSV; hãy dùng đúng hai file có tên ở `customers_file` và `orders_file` (xem tab Dữ liệu và danh sách file bên dưới sau khi chạy). " +
          "Đoạn mã đã đọc chúng thành `customers` và `orders`. Viết hai hàm, KHÔNG sửa DataFrame đầu vào: " +
          "`check_columns(frame, required)` báo `ValueError` (nêu tên các cột thiếu) nếu `frame` thiếu bất kỳ cột nào trong list `required`, ngược lại không trả về gì (None); " +
          "`build_dataset(customers, orders)` trả về DataFrame mới theo quy tắc: (1) bảng khách: bỏ khoảng trắng hai đầu của `name`, viết hoa chữ cái đầu mỗi từ của `city` (kiểu `Ha Noi`), và nếu một `customer_id` xuất hiện nhiều lần thì chỉ giữ dòng ĐẦU TIÊN; " +
          "(2) bảng đơn hàng: chỉ giữ các đơn có `status` (sau khi bỏ khoảng trắng hai đầu và đổi thành chữ thường) bằng `paid` và có `amount`; " +
          "(3) ghép đơn hàng với khách theo `customer_id` sao cho đơn của khách không có trong bảng khách bị loại; " +
          "(4) kết quả có đúng các cột `order_id, customer_id, name, city, amount`, xếp theo `order_id` tăng dần, chỉ số hàng đánh lại 0, 1, 2, .... " +
          "Cuối cùng gọi `check_columns` cho cả hai bảng với các cột bắt buộc ghi trong đoạn mã, gán `dataset` là `build_dataset(customers, orders)` và `orphans` là số đơn đã thanh toán (đã có `amount`) thuộc về khách KHÔNG có trong bảng khách (một số nguyên Python).",
        data,
      },
      runtime: { setupData: data },
      grading: {
        data: {
          dataset: datasetFrame(fixture.customers, fixture.orders),
          orphans,
          buildCases: asJson(buildCases),
          checkCases: asJson(checkCases),
        },
      },
    };
  },
};

// ---------------------------------------------------------------------------------------
// PF-26 (M10-11) - data preparation mini-project
// ---------------------------------------------------------------------------------------

const HOUSING_TEXT_DTYPES = {
  id: "int64",
  area_m2: "str",
  rooms: "str",
  year_built: "str",
  price_million: "str",
  district: "str",
} as const;
const HOUSING_NUMBER_DTYPES = {
  id: "int64",
  area_m2: "float64",
  rooms: "int64",
  year_built: "int64",
  price_million: "float64",
  district: "str",
} as const;
const CLEAN_DTYPES = {
  id: "int64",
  district: "str",
  area_m2: "float64",
  rooms: "int64",
  age: "int64",
  price_per_m2: "float64",
} as const;

const floatOf = (value: number): PyValue => ({ $float: value });

const housingTextFrame = (rows: readonly HousingRaw[]): PyValue =>
  frame(HOUSING_COLUMNS, rows.map((row) => [row.id, row.area, row.rooms, row.year, row.price, row.district]), {
    dtypes: HOUSING_TEXT_DTYPES,
  });
const housingNumberFrame = (rows: readonly HousingRaw[]): PyValue =>
  frame(HOUSING_COLUMNS, rows.map((row) => [row.id, Number(row.area), Number(row.rooms), Number(row.year), Number(row.price), row.district]), {
    dtypes: HOUSING_NUMBER_DTYPES,
  });

const cleanFrame = (result: HousingResult): PyValue =>
  frame(
    CLEAN_HOUSING_COLUMNS,
    result.clean.map((house) => [house.id, house.district, house.area, house.rooms, house.age, house.pricePerM2]),
    { index: range(0, result.clean.length), dtypes: CLEAN_DTYPES },
  );

const resultValue = (result: HousingResult): PyValue => ({
  clean: cleanFrame(result),
  X: nd(result.matrix, "float64", [result.rows, 3]),
  stats: {
    rows: result.rows,
    rejected: result.rejected,
    mean_price_per_m2: floatOf(result.meanPricePerM2),
    by_district: Object.fromEntries(Object.entries(result.byDistrict).map(([district, mean]) => [district, floatOf(mean)])),
  },
});

const diagnosticFigure = (result: HousingResult): PyValue =>
  figure({
    title: true,
    xlabel: true,
    ylabel: true,
    series: [
      {
        kind: "scatter",
        x: result.clean.map((house) => house.area),
        y: result.clean.map((house) => house.pricePerM2),
      },
    ],
  });

export const pf26Generator: MissionGenerator = {
  generate({ rng }) {
    const fixture = rng.pick(HOUSING_FIXTURES);
    const data = { housing_file: fixture.file, reference_year: 2025 };
    const result = prepareHousing(fixture.records);

    // ---- hidden tables of their own
    const junk: HousingRaw[] = [
      { id: 1, area: "50", rooms: "2", year: "2000", price: "5", district: "  quan 1 " },
      { id: 2, area: "n/a", rooms: "2", year: "2000", price: "5", district: "Quan 3" },
      { id: 3, area: "40", rooms: "3", year: "2031", price: "4", district: "quan 3" },
      { id: 4, area: "60", rooms: "1", year: "1990", price: "9", district: "QUAN 1" },
      { id: 1, area: "70", rooms: "1", year: "2010", price: "7", district: "Quan 1" },
      { id: 5, area: "80", rooms: "", year: "2015", price: "8", district: "Quan 3" },
    ];
    const numeric: HousingRaw[] = [
      { id: 10, area: "45", rooms: "2", year: "2010", price: "4.5", district: "Go Vap" },
      { id: 11, area: "0", rooms: "2", year: "2010", price: "4.5", district: "Go Vap" },
      { id: 12, area: "30", rooms: "1", year: "2020", price: "-2", district: "Thu Duc" },
      { id: 13, area: "90", rooms: "4", year: "1985", price: "18", district: "thu duc" },
      { id: 14, area: "65", rooms: "3", year: "2026", price: "6", district: "Go Vap" },
      { id: 15, area: "100", rooms: "5", year: "2005", price: "30", district: "Go Vap" },
    ];
    const single: HousingRaw[] = [
      { id: 20, area: "x", rooms: "2", year: "2000", price: "5", district: "Quan 1" },
      { id: 21, area: "55", rooms: "2", year: "2000", price: "5.5", district: " quan 1" },
    ];

    const prepareCase = (id: string, label: string, rows: HousingRaw[], numericKind: boolean): FunctionCase =>
      hiddenCase(
        id,
        label,
        [numericKind ? housingNumberFrame(rows) : housingTextFrame(rows)],
        returns(resultValue(prepareHousing(rows)), "dict", TOLERANCE),
      );
    const prepareCases: FunctionCase[] = [
      exampleCase("prepare-example", "Ví dụ trong đề", [housingTextFrame(fixture.records)], returns(resultValue(result), "dict", TOLERANCE)),
      prepareCase("prepare-junk", "Chuỗi bẩn, id lặp, thiếu số, năm trong tương lai", junk, false),
      prepareCase("prepare-numeric", "Các cột đã là số: loại giá âm, diện tích 0 và năm tương lai", numeric, true),
      prepareCase("prepare-single", "Chỉ còn đúng một hàng hợp lệ: cột hằng số thành 0.0", single, false),
    ];

    const diagnosticCase = (id: string, label: string, rows: HousingRaw[]): FunctionCase => {
      const outcome = prepareHousing(rows);
      return hiddenCase(id, label, [cleanFrame(outcome)], returns(diagnosticFigure(outcome), "Axes"));
    };
    const diagnosticCases: FunctionCase[] = [
      exampleCase("diag-example", "Ví dụ trong đề", [cleanFrame(result)], returns(diagnosticFigure(result), "Axes")),
      diagnosticCase("diag-numeric", "Bảng sạch khác", numeric),
      diagnosticCase("diag-junk", "Bảng sạch khác (từ dữ liệu bẩn)", junk),
    ];

    return {
      learner: {
        objective:
          "Mini-project: viết một pipeline chuẩn bị dữ liệu hoàn chỉnh, từ file CSV thô đến bảng sạch, ma trận đặc trưng, thống kê tóm tắt và một biểu đồ chẩn đoán.",
        context:
          "File CSV ở `housing_file` (trong thư mục `data/`) là danh sách nhà bán thô, KHÔNG sạch: có id lặp, ô thiếu, chuỗi không phải số, giá trị vô lý và tên quận viết lộn xộn. " +
          "Hoàn thiện hai hàm, KHÔNG sửa DataFrame đầu vào. `prepare(df)` trả về một dictionary với ba khóa: " +
          "`\"clean\"` — DataFrame sạch có các cột `id, district, area_m2, rooms, age, price_per_m2` (theo thứ tự đó, dtype lần lượt int64, str, float64, int64, int64, float64, chỉ số hàng 0, 1, 2, ...) theo quy tắc: " +
          "chỉ giữ dòng ĐẦU TIÊN của mỗi `id`; đổi `area_m2`, `rooms`, `year_built`, `price_million` sang số (giá trị không đọc được coi là thiếu); " +
          "một dòng chỉ HỢP LỆ khi `area_m2 > 0`, `rooms >= 1`, `year_built` đọc được và không lớn hơn `reference_year`, `price_million > 0` và `district` không thiếu; dòng không hợp lệ bị loại; " +
          "`district` được bỏ khoảng trắng hai đầu và viết hoa chữ cái đầu mỗi từ; `age = reference_year - year_built`; `price_per_m2 = price_million / area_m2`; giữ thứ tự dòng ban đầu. " +
          "`\"X\"` — ndarray float64 shape (số_dòng_sạch, 3) gồm ba cột `area_m2, rooms, age` của bảng sạch, mỗi cột được chuẩn hóa: trừ trung bình rồi chia độ lệch chuẩn tổng thể (ddof=0), cột có độ lệch chuẩn 0 thì cả cột bằng 0.0. " +
          "`\"stats\"` — dictionary gồm `rows` (số dòng sạch), `rejected` (số dòng của `df` KHÔNG vào bảng sạch, kể cả dòng lặp id), `mean_price_per_m2` (trung bình của `price_per_m2`) và `by_district` (dictionary tên quận → trung bình `price_per_m2` của quận đó). " +
          "`plot_diagnostic(clean)` nhận bảng sạch và trả về Axes của biểu đồ phân tán (scatter) `area_m2` (trục x) với `price_per_m2` (trục y), có tiêu đề và nhãn cho cả hai trục. " +
          "Cuối cùng gán `result` là `prepare(raw)` và `ax` là `plot_diagnostic(result[\"clean\"])`, với `raw` đọc từ file CSV bằng pandas. Biểu đồ sẽ hiện ra sau khi chạy. Đây là bài tự lập: không có các bước gợi ý, hãy tự chia nhỏ và kiểm tra từng bước.",
        data,
      },
      runtime: { setupData: data },
      grading: {
        data: {
          result: resultValue(result),
          ax: diagnosticFigure(result),
          prepareCases: asJson(prepareCases),
          diagnosticCases: asJson(diagnosticCases),
        },
      },
    };
  },
};
