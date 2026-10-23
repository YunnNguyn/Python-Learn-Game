import { PYTHON_FOUNDATIONS_M10_STARTER_CODE } from "../../src/content/python-foundations";
import { edit, type M9MissionSolutions, type M9WrongSolution } from "./m9-solutions";

/**
 * Reference and deliberately wrong solutions of the eleven M10 missions (PF-16..PF-26).
 *
 * TEST DATA ONLY: imported by tests, never by `src/`. Same contract as m9-solutions.ts: every
 * wrong solution lists, in `fails`, the variables - and in `failsFunctions` the functions -
 * whose check the grader must report on EVERY tested variant. Several are the "right numbers,
 * wrong shape" mistakes the brief asks for (PF-16, PF-17, PF-18); several are the classic
 * pandas mistakes (mutating the argument, `and` for `&`, `inplace=True`, a lost index).
 */

export type M10WrongSolution = M9WrongSolution;
export type M10MissionSolutions = M9MissionSolutions;

const PF16 = `import numpy as np

x = np.array(xs, dtype=np.float64)
y = np.array(ys, dtype=np.float64)

x_col = x[:, np.newaxis]
y_row = y[np.newaxis, :]
grid_sum = x_col + y_row
grid_product = x_col * y_row


def broadcast_shape(shape_a, shape_b):
    a = tuple(shape_a)[::-1]
    b = tuple(shape_b)[::-1]
    result = []
    for i in range(max(len(a), len(b))):
        da = a[i] if i < len(a) else 1
        db = b[i] if i < len(b) else 1
        if da == db or db == 1:
            result.append(da)
        elif da == 1:
            result.append(db)
        else:
            raise ValueError("hai shape không tương thích ở chiều thứ " + str(i) + " tính từ bên phải")
    return tuple(result[::-1])


print(x.shape, y.shape, grid_sum.shape)
`;

const PF17 = `import numpy as np

arr = np.array(scores, dtype=np.float64)

col_means = arr.mean(axis=0)
row_totals = arr.sum(axis=1, keepdims=True)
centered = arr - arr.mean(axis=0, keepdims=True)
row_share = arr / row_totals
passed = arr >= pass_mark
passed_per_student = passed.sum(axis=1)


def masked_column_means(data, threshold):
    mask = data >= threshold
    counts = mask.sum(axis=0)
    totals = np.where(mask, data, 0.0).sum(axis=0)
    return totals / np.maximum(counts, 1)


def row_shares(data):
    return data / data.sum(axis=1, keepdims=True)


print(col_means)
print(row_totals)
`;

const PF18 = `import numpy as np

data = np.array(raw, dtype=np.float64)


def drop_invalid_rows(data):
    return data[(data >= 0).all(axis=1)]


def standardize(data):
    mean = data.mean(axis=0)
    std = data.std(axis=0)
    safe_std = np.where(std == 0, 1.0, std)
    return (data - mean) / safe_std


def to_batches(data, size):
    if size < 1:
        raise ValueError("size phải >= 1")
    n_batches = data.shape[0] // size
    return data[: n_batches * size].reshape(n_batches, size, data.shape[1])


def prepare(data, cols, size):
    chosen = data[:, cols]
    return to_batches(standardize(drop_invalid_rows(chosen)), size)


prepared = prepare(data, use_cols, batch_size)
rows_kept = int(drop_invalid_rows(data[:, use_cols]).shape[0])
print(prepared.shape, rows_kept)
`;

const PF19 = `import pandas as pd

df = pd.DataFrame(people)

shape_of_df = df.shape
column_names = list(df.columns)
score_dtype = str(df["score"].dtype)
names = df["name"]
subset = df[["name", "score"]]
first_two = df.iloc[:2]
by_id = df.set_index("id")
name_of_target = by_id.loc[target_id, "name"]
cell = df.iloc[row_pos, 3]


def describe_frame(frame):
    return {
        "rows": len(frame),
        "columns": list(frame.columns),
        "dtypes": {column: str(dtype) for column, dtype in frame.dtypes.items()},
    }


print(df)
print(df.dtypes)
`;

const PF20 = `import pandas as pd

df = pd.DataFrame(orders)


def add_total(frame):
    return frame.assign(total=frame["qty"] * frame["unit_price"])


def select_orders(frame, min_total, regions):
    table = add_total(frame)
    mask = (table["total"] >= min_total) & (table["region"].isin(regions))
    return table[mask]


with_total = add_total(df)
selected = select_orders(df, min_total, target_regions)
print(selected)
`;

const PF21 = `import pandas as pd

raw_df = pd.DataFrame(raw)


def count_missing(frame):
    return {column: int(frame[column].isna().sum()) for column in frame.columns}


def clean_records(frame):
    table = frame.copy()
    table["id"] = pd.to_numeric(table["id"], errors="coerce")
    table["income"] = pd.to_numeric(
        table["income"].str.replace("$", "", regex=False).str.replace(",", "", regex=False),
        errors="coerce",
    )
    table["age"] = pd.to_numeric(table["age"], errors="coerce")
    table = table.dropna(subset=["id", "income"])
    table["age"] = table["age"].fillna(table["age"].median()).astype("float64")
    table["income"] = table["income"].astype("float64")
    table["city"] = table["city"].str.strip().str.title().fillna("Unknown")
    table["id"] = table["id"].astype("int64")
    return table.reset_index(drop=True)


missing_counts = count_missing(raw_df)
cleaned = clean_records(raw_df)
print(cleaned)
`;

const PF22 = `import pandas as pd

sales_df = pd.DataFrame(sales)


def category_report(frame):
    table = frame.assign(revenue=frame["units"] * frame["price"])
    report = table.groupby("category").agg(
        orders=("revenue", "size"),
        units=("units", "sum"),
        revenue=("revenue", "sum"),
    )
    report["avg_revenue"] = report["revenue"] / report["orders"]
    report = report.reset_index().sort_values(["revenue", "category"], ascending=[False, True])
    return report.set_index("category")


def top_category(frame):
    return str(category_report(frame).index[0])


def share_by_store(frame):
    revenue = (frame["units"] * frame["price"]).groupby(frame["store"]).sum()
    return (revenue / revenue.sum()).sort_index().rename("share")


report = category_report(sales_df)
best = top_category(sales_df)
shares = share_by_store(sales_df)
print(report)
`;

const PF23 = `import matplotlib.pyplot as plt


def plot_trend(months, revenue, cost, title, xlabel, ylabel):
    fig, ax = plt.subplots()
    ax.plot(months, revenue, label="Doanh thu")
    ax.plot(months, cost, label="Chi phí")
    ax.set_title(title)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.legend()
    return ax


def plot_ranking(categories, values, title, ylabel):
    pairs = sorted(zip(categories, values), key=lambda pair: (-pair[1], pair[0]))
    names = [name for name, _ in pairs]
    amounts = [amount for _, amount in pairs]
    fig, ax = plt.subplots()
    ax.bar(names, amounts)
    ax.set_title(title)
    ax.set_ylabel(ylabel)
    return ax


ax_trend = plot_trend(months, revenue, cost, trend_title, x_label, y_label)
ax_rank = plot_ranking(categories, values, rank_title, rank_ylabel)
`;

const PF24 = `import matplotlib.pyplot as plt
import pandas as pd

df = pd.DataFrame(finance)


def plot_monthly_profit(df, title, xlabel, ylabel):
    totals = df.groupby("month")[["revenue", "cost"]].sum()
    profit = totals["revenue"] - totals["cost"]
    fig, ax = plt.subplots()
    ax.plot(profit.index, profit.values, label="Lợi nhuận")
    ax.set_title(title)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.legend()
    return ax


def plot_region_revenue(df, title):
    totals = df.groupby("region")["revenue"].sum()
    fig, ax = plt.subplots()
    ax.bar(totals.index, totals.values)
    ax.set_title(title)
    ax.set_ylabel("Doanh thu")
    return ax


ax_profit = plot_monthly_profit(df, profit_title, x_label, y_label)
ax_region = plot_region_revenue(df, region_title)
`;

const PF25 = `import pandas as pd

CUSTOMER_REQUIRED = ["customer_id", "name", "city"]
ORDER_REQUIRED = ["order_id", "customer_id", "amount", "status"]

customers = pd.read_csv("data/" + customers_file)
orders = pd.read_csv("data/" + orders_file)


def check_columns(frame, required):
    missing = [column for column in required if column not in frame.columns]
    if missing:
        raise ValueError("Thiếu cột: " + ", ".join(missing))


def build_dataset(customers, orders):
    people = customers.drop_duplicates(subset="customer_id", keep="first").copy()
    people["name"] = people["name"].str.strip()
    people["city"] = people["city"].str.strip().str.title()
    paid = orders.copy()
    paid["status"] = paid["status"].str.strip().str.lower()
    paid = paid[(paid["status"] == "paid") & paid["amount"].notna()]
    merged = paid.merge(people[["customer_id", "name", "city"]], on="customer_id", how="inner")
    merged = merged[["order_id", "customer_id", "name", "city", "amount"]]
    return merged.sort_values("order_id").reset_index(drop=True)


check_columns(customers, CUSTOMER_REQUIRED)
check_columns(orders, ORDER_REQUIRED)
dataset = build_dataset(customers, orders)
paid_orders = orders[(orders["status"].str.strip().str.lower() == "paid") & orders["amount"].notna()]
orphans = int((~paid_orders["customer_id"].isin(customers["customer_id"])).sum())
print(dataset)
`;

const PF26 = `import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

COLUMNS = ["id", "district", "area_m2", "rooms", "age", "price_per_m2"]


def clean_housing(df):
    table = df.drop_duplicates(subset="id", keep="first").copy()
    for column in ["area_m2", "rooms", "year_built", "price_million"]:
        table[column] = pd.to_numeric(table[column], errors="coerce")
    table["district"] = table["district"].str.strip().str.title()
    valid = (
        (table["area_m2"] > 0)
        & (table["rooms"] >= 1)
        & (table["year_built"] <= reference_year)
        & (table["price_million"] > 0)
        & table["district"].notna()
    )
    clean = table[valid].copy()
    clean["area_m2"] = clean["area_m2"].astype("float64")
    clean["rooms"] = clean["rooms"].astype("int64")
    clean["age"] = (reference_year - clean["year_built"]).astype("int64")
    clean["price_per_m2"] = clean["price_million"] / clean["area_m2"]
    return clean[COLUMNS].reset_index(drop=True)


def standardize_columns(matrix):
    mean = matrix.mean(axis=0)
    std = matrix.std(axis=0)
    return (matrix - mean) / np.where(std == 0, 1.0, std)


def prepare(df):
    clean = clean_housing(df)
    features = clean[["area_m2", "rooms", "age"]].to_numpy(dtype=float)
    by_district = clean.groupby("district")["price_per_m2"].mean()
    stats = {
        "rows": int(len(clean)),
        "rejected": int(len(df) - len(clean)),
        "mean_price_per_m2": float(clean["price_per_m2"].mean()),
        "by_district": {str(name): float(value) for name, value in by_district.items()},
    }
    return {"clean": clean, "X": standardize_columns(features), "stats": stats}


def plot_diagnostic(clean):
    fig, ax = plt.subplots()
    ax.scatter(clean["area_m2"], clean["price_per_m2"])
    ax.set_title("Giá mỗi m2 theo diện tích")
    ax.set_xlabel("Diện tích (m2)")
    ax.set_ylabel("Giá mỗi m2 (triệu đồng)")
    return ax


raw = pd.read_csv("data/" + housing_file)
result = prepare(raw)
ax = plot_diagnostic(result["clean"])
print(result["stats"])
`;

export const M10_SOLUTIONS: Readonly<Record<string, M10MissionSolutions>> = {
  "python-foundations.pf16": {
    reference: PF16,
    wrong: [
      {
        name: "x_col is a row (1, n): right values, wrong shape",
        code: edit(PF16, [`x_col = x[:, np.newaxis]`, `x_col = x.reshape(1, -1)`], [`grid_sum = x_col + y_row`, `grid_sum = x[:, np.newaxis] + y_row`], [`grid_product = x_col * y_row`, `grid_product = x[:, np.newaxis] * y_row`]),
        fails: ["x_col"],
      },
      {
        name: "x_col stays a flat vector (n,)",
        code: edit(PF16, [`x_col = x[:, np.newaxis]`, `x_col = x.copy()`], [`grid_sum = x_col + y_row`, `grid_sum = x[:, np.newaxis] + y_row`], [`grid_product = x_col * y_row`, `grid_product = x[:, np.newaxis] * y_row`]),
        fails: ["x_col"],
      },
      {
        name: "y_row is a column (m, 1) instead of a row",
        code: edit(PF16, [`y_row = y[np.newaxis, :]`, `y_row = y.reshape(-1, 1)`], [`grid_sum = x_col + y_row`, `grid_sum = x_col + y[np.newaxis, :]`], [`grid_product = x_col * y_row`, `grid_product = x_col * y[np.newaxis, :]`]),
        fails: ["y_row"],
      },
      {
        name: "adds two vectors of different length",
        code: edit(PF16, [`grid_sum = x_col + y_row`, `grid_sum = x + y`]),
        fails: [],
        raises: "ValueError",
      },
      {
        name: "broadcast_shape only accepts equal shapes",
        code: edit(PF16, [`        if da == db or db == 1:
            result.append(da)
        elif da == 1:
            result.append(db)
        else:`, `        if da == db:
            result.append(da)
        else:`]),
        fails: [],
        failsFunctions: ["broadcast_shape"],
      },
      {
        name: "broadcast_shape aligns from the left",
        code: edit(PF16, [`a = tuple(shape_a)[::-1]`, `a = tuple(shape_a)`], [`b = tuple(shape_b)[::-1]`, `b = tuple(shape_b)`], [`return tuple(result[::-1])`, `return tuple(result)`]),
        fails: [],
        failsFunctions: ["broadcast_shape"],
      },
    ],
  },
  "python-foundations.pf17": {
    reference: PF17,
    wrong: [
      {
        name: "row_totals loses a dimension: right values, wrong shape",
        code: edit(PF17, [`row_totals = arr.sum(axis=1, keepdims=True)`, `row_totals = arr.sum(axis=1)`], [`row_share = arr / row_totals`, `row_share = arr / arr.sum(axis=1, keepdims=True)`]),
        fails: ["row_totals"],
      },
      {
        name: "row_share divides without keepdims",
        code: edit(PF17, [`row_share = arr / row_totals`, `row_share = arr / arr.sum(axis=1)`]),
        fails: [],
        raises: "ValueError",
      },
      {
        name: "col_means uses the wrong axis",
        code: edit(PF17, [`col_means = arr.mean(axis=0)`, `col_means = arr.mean(axis=1)`]),
        fails: ["col_means"],
      },
      {
        name: "passed uses > and drops the boundary",
        code: edit(PF17, [`passed = arr >= pass_mark`, `passed = arr > pass_mark`]),
        fails: ["passed", "passed_per_student"],
      },
      {
        name: "arr is centred in place",
        code: edit(PF17, [`centered = arr - arr.mean(axis=0, keepdims=True)`, `arr -= arr.mean(axis=0, keepdims=True)
centered = arr`]),
        fails: ["arr"],
      },
      {
        name: "masked_column_means flattens the array with a boolean index",
        code: edit(PF17, [`    mask = data >= threshold
    counts = mask.sum(axis=0)
    totals = np.where(mask, data, 0.0).sum(axis=0)
    return totals / np.maximum(counts, 1)`, `    return data[data >= threshold].mean(axis=0)`]),
        fails: [],
        failsFunctions: ["masked_column_means"],
      },
      {
        name: "masked_column_means divides by zero for an empty column",
        code: edit(PF17, [`np.maximum(counts, 1)`, `counts`]),
        fails: [],
        failsFunctions: ["masked_column_means"],
      },
      {
        name: "row_shares forgets keepdims",
        code: edit(PF17, [`    return data / data.sum(axis=1, keepdims=True)`, `    return data / data.sum(axis=1)`]),
        fails: [],
        failsFunctions: ["row_shares"],
      },
      {
        name: "row_shares changes its argument in place",
        code: edit(PF17, [`    return data / data.sum(axis=1, keepdims=True)`, `    data /= data.sum(axis=1, keepdims=True)
    return data`]),
        fails: [],
        failsFunctions: ["row_shares"],
      },
    ],
  },
  "python-foundations.pf18": {
    reference: PF18,
    wrong: [
      {
        name: "to_batches reshapes to (size, -1, f): right numbers, wrong shape",
        code: edit(PF18, [`.reshape(n_batches, size, data.shape[1])`, `.reshape(size, -1, data.shape[1])`]),
        fails: ["prepared"],
        failsFunctions: ["to_batches", "prepare"],
      },
      {
        name: "standardize uses the sample standard deviation (ddof=1)",
        code: edit(PF18, [`std = data.std(axis=0)`, `std = data.std(axis=0, ddof=1)`]),
        fails: ["prepared"],
        failsFunctions: ["standardize"],
      },
      {
        name: "standardize does not guard a constant column",
        code: edit(PF18, [`    safe_std = np.where(std == 0, 1.0, std)
    return (data - mean) / safe_std`, `    return (data - mean) / std`]),
        fails: [],
        failsFunctions: ["standardize"],
      },
      {
        name: "drops invalid rows before selecting the columns",
        code: edit(PF18, [`    chosen = data[:, cols]
    return to_batches(standardize(drop_invalid_rows(chosen)), size)`, `    return to_batches(standardize(drop_invalid_rows(data)[:, cols]), size)`]),
        fails: [],
        failsFunctions: ["prepare"],
      },
      {
        name: "drop_invalid_rows keeps rows with any valid value",
        code: edit(PF18, [`(data >= 0).all(axis=1)`, `(data >= 0).any(axis=1)`]),
        fails: [],
        failsFunctions: ["drop_invalid_rows"],
      },
      {
        name: "to_batches does not validate size",
        code: edit(PF18, [`    if size < 1:
        raise ValueError("size phải >= 1")
`, ``]),
        fails: [],
        failsFunctions: ["to_batches"],
      },
      {
        name: "standardize changes its argument in place",
        code: edit(PF18, [`    return (data - mean) / safe_std`, `    data -= mean
    data /= safe_std
    return data`]),
        fails: [],
        failsFunctions: ["standardize"],
      },
    ],
  },
  "python-foundations.pf19": {
    reference: PF19,
    wrong: [
      {
        name: "set_index(inplace=True) returns None and changes df",
        code: edit(PF19, [`by_id = df.set_index("id")`, `by_id = df.set_index("id", inplace=True)`], [`name_of_target = by_id.loc[target_id, "name"]`, `name_of_target = None`]),
        fails: ["by_id", "df"],
      },
      {
        name: "name_of_target looked up by position instead of label",
        code: edit(PF19, [`name_of_target = by_id.loc[target_id, "name"]`, `name_of_target = by_id.iloc[target_id]["name"]`]),
        fails: [],
        raises: "IndexError",
      },
      {
        name: "subset lists the columns in the wrong order",
        code: edit(PF19, [`subset = df[["name", "score"]]`, `subset = df[["score", "name"]]`]),
        fails: ["subset"],
      },
      {
        name: "first_two takes three rows",
        code: edit(PF19, [`first_two = df.iloc[:2]`, `first_two = df.iloc[:3]`]),
        fails: ["first_two"],
      },
      {
        name: "names is a one-column DataFrame, not a Series",
        code: edit(PF19, [`names = df["name"]`, `names = df[["name"]]`]),
        fails: ["names"],
      },
      {
        name: "score_dtype is the dtype object, not its name",
        code: edit(PF19, [`score_dtype = str(df["score"].dtype)`, `score_dtype = df["score"].dtype`]),
        fails: ["score_dtype"],
      },
      {
        name: "describe_frame returns dtype objects instead of names",
        code: edit(PF19, [`str(dtype)`, `dtype`]),
        fails: [],
        failsFunctions: ["describe_frame"],
      },
      {
        name: "describe_frame reports the number of columns as rows",
        code: edit(PF19, [`"rows": len(frame),`, `"rows": frame.shape[1],`]),
        fails: [],
        failsFunctions: ["describe_frame"],
      },
    ],
  },
  "python-foundations.pf20": {
    reference: PF20,
    wrong: [
      {
        name: "add_total writes the column into its argument",
        code: edit(PF20, [`    return frame.assign(total=frame["qty"] * frame["unit_price"])`, `    frame["total"] = frame["qty"] * frame["unit_price"]
    return frame`]),
        fails: ["df"],
        failsFunctions: ["add_total"],
      },
      {
        name: "select_orders uses \`and\` between two Series",
        code: edit(PF20, [`mask = (table["total"] >= min_total) & (table["region"].isin(regions))`, `mask = (table["total"] >= min_total) and (table["region"].isin(regions))`]),
        fails: [],
        failsFunctions: ["select_orders"],
        raises: "ValueError",
      },
      {
        name: "select_orders combines the conditions with | instead of &",
        code: edit(PF20, [`(table["total"] >= min_total) & (table["region"].isin(regions))`, `(table["total"] >= min_total) | (table["region"].isin(regions))`]),
        fails: ["selected"],
        failsFunctions: ["select_orders"],
      },
      {
        name: "select_orders renumbers the index",
        code: edit(PF20, [`    return table[mask]`, `    return table[mask].reset_index(drop=True)`]),
        fails: ["selected"],
        failsFunctions: ["select_orders"],
      },
      {
        name: "select_orders is strict at the boundary (>)",
        code: edit(PF20, [`table["total"] >= min_total`, `table["total"] > min_total`]),
        fails: ["selected"],
        failsFunctions: ["select_orders"],
      },
      {
        name: "select_orders drops the total column",
        code: edit(PF20, [`    return table[mask]`, `    return frame[mask]`]),
        fails: ["selected"],
        failsFunctions: ["select_orders"],
      },
      {
        name: "select_orders writes total into its argument",
        code: edit(PF20, [`    table = add_total(frame)`, `    frame["total"] = frame["qty"] * frame["unit_price"]
    table = frame`]),
        fails: ["df"],
        failsFunctions: ["select_orders"],
      },
    ],
  },
  "python-foundations.pf21": {
    reference: PF21,
    wrong: [
      {
        name: "fills the missing ages before dropping the unusable rows",
        code: edit(PF21, [`    table = table.dropna(subset=["id", "income"])
    table["age"] = table["age"].fillna(table["age"].median()).astype("float64")`, `    table["age"] = table["age"].fillna(table["age"].median()).astype("float64")
    table = table.dropna(subset=["id", "income"])`]),
        fails: [],
        failsFunctions: ["clean_records"],
      },
      {
        name: "age becomes int64 instead of float64",
        code: edit(PF21, [`.fillna(table["age"].median()).astype("float64")`, `.fillna(table["age"].median()).astype("int64")`]),
        fails: ["cleaned"],
        failsFunctions: ["clean_records"],
      },
      {
        name: "forgets reset_index",
        code: edit(PF21, [`    return table.reset_index(drop=True)`, `    return table`]),
        fails: ["cleaned"],
        failsFunctions: ["clean_records"],
      },
      {
        name: "city is title-cased without stripping the spaces",
        code: edit(PF21, [`table["city"].str.strip().str.title()`, `table["city"].str.title()`]),
        fails: ["cleaned"],
        failsFunctions: ["clean_records"],
      },
      {
        name: "keeps rows without an income (fills 0)",
        code: edit(PF21, [`    table = table.dropna(subset=["id", "income"])`, `    table["income"] = table["income"].fillna(0)
    table = table.dropna(subset=["id"])`]),
        fails: ["cleaned"],
        failsFunctions: ["clean_records"],
      },
      {
        name: "count_missing also counts the strings n/a and empty text",
        code: edit(PF21, [`int(frame[column].isna().sum())`, `int((frame[column].isna() | frame[column].isin(["n/a", "N/A", ""])).sum())`]),
        fails: ["missing_counts"],
        failsFunctions: ["count_missing"],
      },
      {
        name: "count_missing returns a Series instead of a dict",
        code: edit(PF21, [`    return {column: int(frame[column].isna().sum()) for column in frame.columns}`, `    return frame.isna().sum()`]),
        fails: [],
        failsFunctions: ["count_missing"],
      },
      {
        name: "clean_records converts the columns of its argument in place",
        code: edit(PF21, [`    table = frame.copy()`, `    table = frame`]),
        fails: ["raw_df"],
        failsFunctions: ["clean_records"],
      },
    ],
  },
  "python-foundations.pf22": {
    reference: PF22,
    wrong: [
      {
        name: "ties are sorted in reverse by name",
        code: edit(PF22, [`ascending=[False, True]`, `ascending=False`]),
        fails: [],
        failsFunctions: ["category_report", "top_category"],
      },
      {
        name: "no explicit sort: the groups stay alphabetical",
        code: edit(PF22, [`.sort_values(["revenue", "category"], ascending=[False, True])`, ``]),
        fails: ["report"],
        failsFunctions: ["category_report"],
      },
      {
        name: "category stays a column instead of the index",
        code: edit(PF22, [`    return report.set_index("category")`, `    return report`]),
        fails: ["report"],
        failsFunctions: ["category_report"],
      },
      {
        name: "avg_revenue is the mean of units",
        code: edit(PF22, [`report["avg_revenue"] = report["revenue"] / report["orders"]`, `report["avg_revenue"] = report["units"] / report["orders"]`]),
        fails: ["report"],
        failsFunctions: ["category_report"],
      },
      {
        name: "top_category takes the last group",
        code: edit(PF22, [`.index[0])`, `.index[-1])`]),
        fails: ["best"],
        failsFunctions: ["top_category"],
      },
      {
        name: "share_by_store keeps the order of first appearance",
        code: edit(PF22, [`.groupby(frame["store"]).sum()`, `.groupby(frame["store"], sort=False).sum()`], [`.sort_index()`, ``]),
        fails: [],
        failsFunctions: ["share_by_store"],
      },
      {
        name: "share_by_store forgets to name the Series",
        code: edit(PF22, [`.rename("share")`, ``]),
        fails: ["shares"],
        failsFunctions: ["share_by_store"],
      },
      {
        name: "category_report writes revenue into its argument",
        code: edit(PF22, [`    table = frame.assign(revenue=frame["units"] * frame["price"])`, `    frame["revenue"] = frame["units"] * frame["price"]
    table = frame`]),
        fails: ["sales_df"],
        failsFunctions: ["category_report"],
      },
    ],
  },
  "python-foundations.pf23": {
    reference: PF23,
    wrong: [
      {
        name: "plot_trend forgets the legend",
        code: edit(PF23, [`    ax.set_ylabel(ylabel)
    ax.legend()
    return ax


def plot_ranking`, `    ax.set_ylabel(ylabel)
    return ax


def plot_ranking`]),
        fails: ["ax_trend"],
        failsFunctions: ["plot_trend"],
      },
      {
        name: "plot_trend draws cost before revenue",
        code: edit(PF23, [`    ax.plot(months, revenue, label="Doanh thu")
    ax.plot(months, cost, label="Chi phí")`, `    ax.plot(months, cost, label="Chi phí")
    ax.plot(months, revenue, label="Doanh thu")`]),
        fails: ["ax_trend"],
        failsFunctions: ["plot_trend"],
      },
      {
        name: "plot_trend mislabels the revenue line",
        code: edit(PF23, [`label="Doanh thu"`, `label="Chi phí"`]),
        fails: ["ax_trend"],
        failsFunctions: ["plot_trend"],
      },
      {
        name: "plot_trend never sets the title",
        code: edit(PF23, [`    ax.set_title(title)
    ax.set_xlabel(xlabel)`, `    ax.set_xlabel(xlabel)`]),
        fails: ["ax_trend"],
        failsFunctions: ["plot_trend"],
      },
      {
        name: "plot_ranking does not sort the bars",
        code: edit(PF23, [`    pairs = sorted(zip(categories, values), key=lambda pair: (-pair[1], pair[0]))`, `    pairs = list(zip(categories, values))`]),
        fails: ["ax_rank"],
        failsFunctions: ["plot_ranking"],
      },
      {
        name: "plot_ranking sorts ascending",
        code: edit(PF23, [`key=lambda pair: (-pair[1], pair[0])`, `key=lambda pair: (pair[1], pair[0])`]),
        fails: ["ax_rank"],
        failsFunctions: ["plot_ranking"],
      },
      {
        name: "plot_ranking draws horizontal bars (not a vertical bar chart of the data)",
        code: edit(PF23, [`    ax.bar(names, amounts)`, `    ax.plot(names, amounts)`]),
        fails: ["ax_rank"],
        failsFunctions: ["plot_ranking"],
      },
      {
        name: "Matplotlib refuses x and y of different lengths (a learner error, not a package failure)",
        code: edit(PF23, [`ax_trend = plot_trend(months, revenue, cost,`, `ax_trend = plot_trend(months, revenue[:-1], cost,`]),
        fails: [],
        raises: "ValueError",
      },
    ],
  },
  "python-foundations.pf24": {
    reference: PF24,
    wrong: [
      {
        name: "fixes the aggregation only (sum) and nothing else",
        code: edit(
          PYTHON_FOUNDATIONS_M10_STARTER_CODE.pf24,
          [`.mean()`, `.sum()`],
        ),
        fails: ["ax_profit", "ax_region"],
        failsFunctions: ["plot_monthly_profit", "plot_region_revenue"],
      },
      {
        name: "profit chart fixed except the legend",
        code: edit(PF24, [`    ax.set_ylabel(ylabel)
    ax.legend()
    return ax`, `    ax.set_ylabel(ylabel)
    return ax`]),
        fails: ["ax_profit"],
        failsFunctions: ["plot_monthly_profit"],
      },
      {
        name: "profit chart still has its axis labels swapped",
        code: edit(PF24, [`    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.legend()`, `    ax.set_xlabel(ylabel)
    ax.set_ylabel(xlabel)
    ax.legend()`]),
        fails: ["ax_profit"],
        failsFunctions: ["plot_monthly_profit"],
      },
      {
        name: "profit chart plots revenue + cost",
        code: edit(PF24, [`totals["revenue"] - totals["cost"]`, `totals["revenue"] + totals["cost"]`]),
        fails: ["ax_profit"],
        failsFunctions: ["plot_monthly_profit"],
      },
      {
        name: "profit chart plots y against x",
        code: edit(PF24, [`ax.plot(profit.index, profit.values, label="Lợi nhuận")`, `ax.plot(profit.values, profit.index, label="Lợi nhuận")`]),
        fails: ["ax_profit"],
        failsFunctions: ["plot_monthly_profit"],
      },
      {
        name: "profit chart is fixed, region chart is not",
        code: edit(PF24, [`    totals = df.groupby("region")["revenue"].sum()
    fig, ax = plt.subplots()
    ax.bar(totals.index, totals.values)`, `    fig, ax = plt.subplots()
    ax.bar(df["region"], df["revenue"])`]),
        fails: ["ax_region"],
        failsFunctions: ["plot_region_revenue"],
      },
      {
        name: "region chart averages instead of summing",
        code: edit(PF24, [`df.groupby("region")["revenue"].sum()`, `df.groupby("region")["revenue"].mean()`]),
        fails: ["ax_region"],
        failsFunctions: ["plot_region_revenue"],
      },
      {
        name: "region chart keeps the wrong y label",
        code: edit(PF24, [`ax.set_ylabel("Doanh thu")`, `ax.set_ylabel("Chi phí")`]),
        fails: ["ax_region"],
        failsFunctions: ["plot_region_revenue"],
      },
    ],
  },
  "python-foundations.pf25": {
    reference: PF25,
    wrong: [
      {
        name: "left join keeps the orders of unknown customers",
        code: edit(PF25, [`how="inner"`, `how="left"`]),
        fails: ["dataset"],
        failsFunctions: ["build_dataset"],
      },
      {
        name: "does not drop duplicated customer ids",
        code: edit(PF25, [`    people = customers.drop_duplicates(subset="customer_id", keep="first").copy()`, `    people = customers.copy()`]),
        fails: ["dataset"],
        failsFunctions: ["build_dataset"],
      },
      {
        name: "compares the status without normalising it",
        code: edit(PF25, [`    paid["status"] = paid["status"].str.strip().str.lower()
`, ``]),
        fails: ["dataset"],
        failsFunctions: ["build_dataset"],
      },
      {
        name: "does not sort by order_id",
        code: edit(PF25, [`merged.sort_values("order_id").reset_index(drop=True)`, `merged.reset_index(drop=True)`]),
        fails: ["dataset"],
        failsFunctions: ["build_dataset"],
      },
      {
        name: "keeps the orders without an amount",
        code: edit(PF25, [`(paid["status"] == "paid") & paid["amount"].notna()`, `(paid["status"] == "paid")`]),
        fails: ["dataset"],
        failsFunctions: ["build_dataset"],
      },
      {
        name: "check_columns returns a bool instead of raising",
        code: edit(PF25, [`    missing = [column for column in required if column not in frame.columns]
    if missing:
        raise ValueError("Thiếu cột: " + ", ".join(missing))`, `    return all(column in frame.columns for column in required)`]),
        fails: [],
        failsFunctions: ["check_columns"],
      },
      {
        name: "orphans counts every order that was not kept, not only paid ones",
        code: edit(PF25, [`orphans = int((~paid_orders["customer_id"].isin(customers["customer_id"])).sum())`, `orphans = len(orders) - len(dataset)`]),
        fails: ["orphans"],
      },
      {
        name: "build_dataset changes the status column of its argument",
        code: edit(PF25, [`    paid = orders.copy()`, `    paid = orders`]),
        fails: [],
        failsFunctions: ["build_dataset"],
      },
    ],
  },
  "python-foundations.pf26": {
    reference: PF26,
    wrong: [
      {
        name: "the matrix X is not standardised",
        code: edit(PF26, [`"X": standardize_columns(features)`, `"X": features`]),
        fails: ["result"],
        failsFunctions: ["prepare"],
      },
      {
        name: "standardises with the sample standard deviation",
        code: edit(PF26, [`std = matrix.std(axis=0)`, `std = matrix.std(axis=0, ddof=1)`]),
        fails: ["result"],
        failsFunctions: ["prepare"],
      },
      {
        name: "does not drop repeated ids",
        code: edit(PF26, [`    table = df.drop_duplicates(subset="id", keep="first").copy()`, `    table = df.copy()`]),
        fails: ["result"],
        failsFunctions: ["prepare"],
      },
      {
        name: "accepts a build year in the future",
        code: edit(PF26, [`        & (table["year_built"] <= reference_year)
`, `        & table["year_built"].notna()
`]),
        fails: ["result"],
        failsFunctions: ["prepare"],
      },
      {
        name: "does not normalise the district names",
        code: edit(PF26, [`    table["district"] = table["district"].str.strip().str.title()
`, ``]),
        fails: ["result"],
        failsFunctions: ["prepare"],
      },
      {
        name: "rejected counts only the invalid rows, not the repeated ids",
        code: edit(PF26, [`"rejected": int(len(df) - len(clean))`, `"rejected": int(len(df.drop_duplicates(subset="id")) - len(clean))`]),
        fails: ["result"],
        failsFunctions: ["prepare"],
      },
      {
        name: "the clean table keeps a gappy index",
        code: edit(PF26, [`return clean[COLUMNS].reset_index(drop=True)`, `return clean[COLUMNS]`]),
        fails: ["result"],
        failsFunctions: ["prepare"],
      },
      {
        name: "the diagnostic plot has no axis labels",
        code: edit(PF26, [`    ax.set_xlabel("Diện tích (m2)")
    ax.set_ylabel("Giá mỗi m2 (triệu đồng)")
`, ``]),
        fails: ["ax"],
        failsFunctions: ["plot_diagnostic"],
      },
      {
        name: "the diagnostic plot swaps the axes",
        code: edit(PF26, [`ax.scatter(clean["area_m2"], clean["price_per_m2"])`, `ax.scatter(clean["price_per_m2"], clean["area_m2"])`]),
        fails: ["ax"],
        failsFunctions: ["plot_diagnostic"],
      },
      {
        name: "prepare converts the columns of its argument in place",
        code: edit(PF26, [`    table = df.drop_duplicates(subset="id", keep="first").copy()`, `    table = df.drop_duplicates(subset="id", keep="first")
    df["area_m2"] = pd.to_numeric(df["area_m2"], errors="coerce")`]),
        fails: [],
        failsFunctions: ["prepare"],
      },
    ],
  },
};
