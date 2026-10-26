import { createSeededRng, type SeededRng } from "../../core/random";

import { compareText, meanOf, populationStd } from "./generators-m10-support";

/**
 * Authored CSV fixtures of the M10 workflow missions PF-25 and PF-26 (PHASE-08).
 *
 * The runtime stages `runtime.config.workspace.datasets` into `data/` before every run, and a
 * template's runtime config is static - so the "variants" of these missions are THREE fixed
 * files per table, each generated here from a fixed seed (pure, reproducible, no network),
 * and the mission variant only chooses which file the learner is told to read. The expected
 * result of each file is computed by the TypeScript reference rules below from the very same
 * records that were written to the CSV text, so file and expectation cannot drift apart.
 *
 * Everything is small (tens of rows), uses relative paths (`data/...`) only, and contains no
 * personal data: names are first names from a fixed list.
 */

export const WORKFLOW_VARIANT_COUNT = 3;

const FIRST_NAMES = ["An", "Binh", "Chi", "Dung", "Giang", "Hoa", "Khanh", "Lan", "Minh", "Nam", "Oanh", "Phuc", "Quyen", "Son"] as const;
const CITIES = ["Ha Noi", "Da Nang", "Hue", "Can Tho", "Hai Phong"] as const;

const titleCase = (text: string): string =>
  text
    .trim()
    .toLowerCase()
    .replace(/(^|\s)([a-z])/g, (_, space: string, letter: string) => space + letter.toUpperCase());

const csvLine = (cells: readonly (string | number | null)[]): string =>
  cells.map((cell) => (cell === null ? "" : String(cell))).join(",");

const csvText = (header: readonly string[], rows: readonly (readonly (string | number | null)[])[]): string =>
  [header.join(","), ...rows.map(csvLine)].join("\n") + "\n";

// ---------------------------------------------------------------------------------------
// PF-25 - customers.csv + orders.csv
// ---------------------------------------------------------------------------------------

export interface CustomerRow {
  readonly customerId: number;
  readonly name: string;
  readonly city: string;
  readonly age: number | null;
}

export interface OrderRow {
  readonly orderId: number;
  readonly customerId: number;
  readonly amount: number | null;
  readonly status: string;
}

export interface CleanOrder {
  readonly orderId: number;
  readonly customerId: number;
  readonly name: string;
  readonly city: string;
  readonly amount: number;
}

export const CUSTOMER_COLUMNS = ["customer_id", "name", "city", "age"] as const;
export const ORDER_COLUMNS = ["order_id", "customer_id", "amount", "status"] as const;
export const DATASET_COLUMNS = ["order_id", "customer_id", "name", "city", "amount"] as const;

/** The reference rules of PF-25: dedupe + clean customers, keep paid orders, inner join. */
export function buildOrderDataset(
  customers: readonly CustomerRow[],
  orders: readonly OrderRow[],
): { dataset: CleanOrder[]; orphans: number } {
  const known = new Map<number, { name: string; city: string }>();
  for (const customer of customers) {
    if (!known.has(customer.customerId)) {
      known.set(customer.customerId, { name: customer.name.trim(), city: titleCase(customer.city) });
    }
  }
  const paid = orders.filter((order) => order.status.trim().toLowerCase() === "paid" && order.amount !== null);
  const dataset: CleanOrder[] = [];
  let orphans = 0;
  for (const order of paid) {
    const customer = known.get(order.customerId);
    if (customer === undefined) {
      orphans += 1;
    } else {
      dataset.push({ orderId: order.orderId, customerId: order.customerId, ...customer, amount: order.amount as number });
    }
  }
  dataset.sort((a, b) => a.orderId - b.orderId);
  return { dataset, orphans };
}

export interface OrdersFixture {
  readonly customersFile: string;
  readonly ordersFile: string;
  readonly customersCsv: string;
  readonly ordersCsv: string;
  readonly customers: readonly CustomerRow[];
  readonly orders: readonly OrderRow[];
}

const pad = (rng: SeededRng, text: string): string => rng.pick([text, text, ` ${text}`, `${text} `]);
const caseStyle = (rng: SeededRng, text: string): string =>
  rng.pick([text, text.toUpperCase(), text.toLowerCase(), text]);
const statusText = (rng: SeededRng, status: "paid" | "refunded" | "pending"): string =>
  status === "paid" ? rng.pick(["paid", "paid", "PAID", " Paid ", "paid"]) : status;

function buildOrdersFixture(variant: number): OrdersFixture {
  const rng = createSeededRng(`python-foundations.m10.pf25.v${variant}`);
  const count = rng.nextInt(7, 10);
  const names = rng.shuffle(FIRST_NAMES).slice(0, count);
  const base: CustomerRow[] = names.map((name, index) => ({
    customerId: 10 + index,
    name: pad(rng, name),
    city: pad(rng, caseStyle(rng, rng.pick(CITIES))),
    age: rng.nextInt(0, 5) === 0 ? null : rng.nextInt(19, 60),
  }));
  // Two repeated customer ids: the FIRST row of an id is the one to keep.
  const duplicates: CustomerRow[] = [base[1]!, base[count - 2]!].map((customer, index) => ({
    ...customer,
    name: `${names[index === 0 ? 1 : count - 2]!}x`,
    city: "Unknown City",
  }));
  const customers = [...base.slice(0, 3), duplicates[0]!, ...base.slice(3), duplicates[1]!];

  const orderCount = rng.nextInt(12, 16);
  const knownIds = base.map((customer) => customer.customerId);
  const orders: OrderRow[] = Array.from({ length: orderCount }, (_, index) => {
    const roll = rng.nextInt(0, 10);
    const status = roll < 6 ? "paid" : roll < 8 ? "refunded" : "pending";
    return {
      orderId: 5001 + index * 3,
      // 1 order in 5 belongs to a customer that is not in customers.csv.
      customerId: rng.nextInt(0, 5) === 0 ? 90 + rng.nextInt(0, 5) : rng.pick(knownIds),
      amount: rng.nextInt(0, 9) === 0 ? null : rng.nextInt(10, 400) * 5 + (rng.nextInt(0, 2) === 0 ? 0 : 0.5),
      status: statusText(rng, status),
    };
  });
  // Guarantees that make the mission meaningful for every variant.
  const withStatus = (position: number, patch: Partial<OrderRow>) => {
    orders[position] = { ...orders[position]!, ...patch };
  };
  withStatus(0, { status: "paid", customerId: knownIds[0]!, amount: 120 });
  withStatus(1, { status: " PAID ", customerId: 97, amount: 75.5 });
  withStatus(2, { status: "paid", customerId: knownIds[2]!, amount: null });
  withStatus(3, { status: "refunded", customerId: knownIds[1]! });
  withStatus(4, { status: "Paid", customerId: base[1]!.customerId, amount: 210.5 });
  withStatus(5, { status: "PAID", customerId: knownIds[3]!, amount: 64 });
  withStatus(6, { status: "paid", customerId: knownIds[4]!, amount: 310.5 });

  // The file lists orders in a scrambled order: sorting by order_id is part of the task, so a
  // file whose kept orders happen to be sorted already would hide a missing sort.
  const keptIds = (list: readonly OrderRow[]): number[] => buildOrderDataset(base, list).dataset.map((row) => row.orderId);
  const fileOrderOf = (list: readonly OrderRow[]): OrderRow[] => {
    const wanted = new Set(keptIds(list));
    return list.filter((order) => wanted.has(order.orderId));
  };
  let fileOrders = rng.shuffle(orders);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const inFile = fileOrderOf(fileOrders).map((order) => order.orderId);
    const sortedIds = [...inFile].sort((a, b) => a - b);
    if (inFile.some((id, index) => id !== sortedIds[index])) break;
    fileOrders = rng.shuffle(orders);
  }
  return {
    customersFile: `customers_v${variant}.csv`,
    ordersFile: `orders_v${variant}.csv`,
    customersCsv: csvText(CUSTOMER_COLUMNS, customers.map((c) => [c.customerId, c.name, c.city, c.age])),
    ordersCsv: csvText(ORDER_COLUMNS, fileOrders.map((o) => [o.orderId, o.customerId, o.amount, o.status])),
    customers,
    orders: fileOrders,
  };
}

export const ORDERS_FIXTURES: readonly OrdersFixture[] = Array.from({ length: WORKFLOW_VARIANT_COUNT }, (_, index) =>
  buildOrdersFixture(index + 1),
);

// ---------------------------------------------------------------------------------------
// PF-26 - housing.csv
// ---------------------------------------------------------------------------------------

export const HOUSING_COLUMNS = ["id", "area_m2", "rooms", "year_built", "price_million", "district"] as const;
export const HOUSING_REFERENCE_YEAR = 2025;
export const CLEAN_HOUSING_COLUMNS = ["id", "district", "area_m2", "rooms", "age", "price_per_m2"] as const;

/** A raw cell: the text as it appears in the CSV (blank = ""). */
export interface HousingRaw {
  readonly id: number;
  readonly area: string;
  readonly rooms: string;
  readonly year: string;
  readonly price: string;
  readonly district: string | null;
}

export interface CleanHouse {
  readonly id: number;
  readonly district: string;
  readonly area: number;
  readonly rooms: number;
  readonly age: number;
  readonly pricePerM2: number;
}

const toNumber = (text: string): number => (text.trim() === "" ? Number.NaN : Number(text));

export interface HousingResult {
  readonly clean: CleanHouse[];
  readonly matrix: number[][];
  readonly rows: number;
  readonly rejected: number;
  readonly meanPricePerM2: number;
  readonly byDistrict: Record<string, number>;
}

/** The reference rules of PF-26. */
export function prepareHousing(raw: readonly HousingRaw[]): HousingResult {
  const seen = new Set<number>();
  const clean: CleanHouse[] = [];
  for (const record of raw) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    const area = toNumber(record.area);
    const rooms = toNumber(record.rooms);
    const year = toNumber(record.year);
    const price = toNumber(record.price);
    const district = record.district === null ? "" : record.district.trim();
    const valid =
      area > 0 && rooms >= 1 && year <= HOUSING_REFERENCE_YEAR && price > 0 && district !== "" && !Number.isNaN(year);
    if (!valid) continue;
    clean.push({
      id: record.id,
      district: titleCase(district),
      area,
      rooms: Math.trunc(rooms),
      age: HOUSING_REFERENCE_YEAR - Math.trunc(year),
      pricePerM2: price / area,
    });
  }
  const columns = [clean.map((house) => house.area), clean.map((house) => house.rooms), clean.map((house) => house.age)];
  const stats = columns.map((column) => {
    const std = populationStd(column);
    return { mean: meanOf(column), std: std === 0 ? 1 : std };
  });
  const matrix = clean.map((house) =>
    [house.area, house.rooms, house.age].map((value, index) => (value - stats[index]!.mean) / stats[index]!.std),
  );
  const byDistrict: Record<string, number> = {};
  for (const district of [...new Set(clean.map((house) => house.district))].sort(compareText)) {
    byDistrict[district] = meanOf(clean.filter((house) => house.district === district).map((house) => house.pricePerM2));
  }
  return {
    clean,
    matrix,
    rows: clean.length,
    rejected: raw.length - clean.length,
    meanPricePerM2: meanOf(clean.map((house) => house.pricePerM2)),
    byDistrict,
  };
}

export interface HousingFixture {
  readonly file: string;
  readonly csv: string;
  readonly records: readonly HousingRaw[];
}

const HOUSING_DISTRICTS = ["Quan 1", "Quan 3", "Binh Thanh", "Thu Duc", "Go Vap"] as const;

function buildHousingFixture(variant: number): HousingFixture {
  const rng = createSeededRng(`python-foundations.m10.pf26.v${variant}`);
  const count = rng.nextInt(20, 25);
  const records: HousingRaw[] = Array.from({ length: count }, (_, index) => {
    const area = rng.nextInt(25, 141) + (rng.nextInt(0, 3) === 0 ? 0.5 : 0);
    const district = rng.pick(HOUSING_DISTRICTS);
    const style = rng.nextInt(0, 4);
    return {
      id: index + 1,
      area: String(area),
      rooms: String(rng.nextInt(1, 6)),
      year: String(rng.nextInt(1990, 2024)),
      price: String(Math.round(area * (0.05 + rng.nextInt(0, 8) * 0.01) * 10) / 10),
      district: style === 0 ? ` ${district} ` : style === 1 ? district.toLowerCase() : style === 2 ? district.toUpperCase() : district,
    };
  });
  // Seven bad records at positions that depend on the variant.
  const spots = rng.shuffle(Array.from({ length: count }, (_, index) => index)).slice(0, 7);
  const patch = (position: number, change: Partial<HousingRaw>) => {
    records[position] = { ...records[position]!, ...change };
  };
  patch(spots[0]!, { area: "" });
  patch(spots[1]!, { area: "0" });
  patch(spots[2]!, { rooms: "" });
  patch(spots[3]!, { year: "2031" });
  patch(spots[4]!, { price: "n/a" });
  patch(spots[5]!, { price: "-3.5" });
  patch(spots[6]!, { district: null });
  // Two repeated ids: only the first row of an id counts.
  const withDuplicates = [
    ...records,
    { ...records[2]!, area: "999", price: "999", district: "Quan 1" },
    { ...records[count - 1]!, rooms: "9" },
  ];
  return {
    file: `housing_v${variant}.csv`,
    csv: csvText(HOUSING_COLUMNS, withDuplicates.map((record) => [record.id, record.area, record.rooms, record.year, record.price, record.district])),
    records: withDuplicates,
  };
}

export const HOUSING_FIXTURES: readonly HousingFixture[] = Array.from({ length: WORKFLOW_VARIANT_COUNT }, (_, index) =>
  buildHousingFixture(index + 1),
);

/** Every staged file, for the templates' `runtime.config.workspace.datasets`. */
export const ORDERS_DATASETS = ORDERS_FIXTURES.flatMap((fixture) => [
  { filename: fixture.customersFile, content: fixture.customersCsv },
  { filename: fixture.ordersFile, content: fixture.ordersCsv },
]);
export const HOUSING_DATASETS = HOUSING_FIXTURES.map((fixture) => ({ filename: fixture.file, content: fixture.csv }));
