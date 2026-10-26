import { edit, type M9MissionSolutions, type M9WrongSolution } from "./m9-solutions";

/**
 * Reference and deliberately wrong solutions of the M11 capstone PF-27.
 *
 * TEST DATA ONLY: imported by tests, never by `src/` (a test asserts it is absent from the
 * production bundle). Same contract as m9-solutions.ts / m10-solutions.ts: every wrong
 * solution lists, in `fails`, the variables - and in `failsFunctions` the functions - whose
 * check the grader must report on EVERY tested variant.
 */

export type M11WrongSolution = M9WrongSolution;
export type M11MissionSolutions = M9MissionSolutions;

const PF27 = `import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

REQUIRED_COLUMNS = ["image_id", "width", "height", "label", "xmin", "ymin", "xmax", "ymax", "split"]
SPLITS = ["train", "val", "test"]
NUMERIC = ["width", "height", "xmin", "ymin", "xmax", "ymax"]
KEY = ["image_id", "label", "xmin", "ymin", "xmax", "ymax"]


def clean_annotations(df, allowed_labels):
    missing = [column for column in REQUIRED_COLUMNS if column not in df.columns]
    if missing:
        raise ValueError("Thiếu cột: " + ", ".join(missing))
    table = df[REQUIRED_COLUMNS].copy()
    for column in NUMERIC:
        table[column] = pd.to_numeric(table[column], errors="coerce")
    for column in ["image_id", "label", "split"]:
        table[column] = table[column].str.strip()
    table["label"] = table["label"].str.lower()
    table["split"] = table["split"].str.lower()
    valid = (
        table["image_id"].notna()
        & (table["image_id"] != "")
        & (table["width"] > 0)
        & (table["height"] > 0)
        & (table["xmin"] >= 0)
        & (table["ymin"] >= 0)
        & (table["xmin"] < table["xmax"])
        & (table["ymin"] < table["ymax"])
        & (table["xmax"] <= table["width"])
        & (table["ymax"] <= table["height"])
        & table["label"].isin(allowed_labels)
        & table["split"].isin(SPLITS)
    )
    table = table[valid].drop_duplicates(subset=KEY, keep="first")
    table = table.astype(
        {"width": "int64", "height": "int64", "xmin": "float64", "ymin": "float64", "xmax": "float64", "ymax": "float64"}
    )
    return table.reset_index(drop=True)


def normalize_boxes(clean):
    out = clean[["image_id", "label", "split"]].copy()
    out["x1"] = clean["xmin"] / clean["width"]
    out["y1"] = clean["ymin"] / clean["height"]
    out["x2"] = clean["xmax"] / clean["width"]
    out["y2"] = clean["ymax"] / clean["height"]
    return out


def class_summary(clean):
    area = (clean["xmax"] - clean["xmin"]) * (clean["ymax"] - clean["ymin"]) / (clean["width"] * clean["height"])
    grouped = clean.assign(area=area).groupby("label")
    summary = pd.DataFrame(
        {
            "boxes": grouped.size(),
            "images": grouped["image_id"].nunique(),
            "mean_area": grouped["area"].mean(),
        }
    )
    summary["share"] = summary["boxes"] / len(clean)
    summary = summary[["boxes", "images", "share", "mean_area"]]
    summary = summary.reset_index().sort_values(["boxes", "label"], ascending=[False, True])
    return summary.set_index("label")


def plot_class_distribution(summary):
    fig, ax = plt.subplots()
    ax.bar(list(summary.index), list(summary["boxes"]))
    ax.set_title("Phân bố lớp annotation")
    ax.set_xlabel("Lớp")
    ax.set_ylabel("Số bounding box")
    return ax


raw = pd.read_csv("data/" + annotation_file)
clean = clean_annotations(raw, allowed_labels)
norm = normalize_boxes(clean)
X = np.column_stack(
    [
        (norm["x1"] + norm["x2"]) / 2,
        (norm["y1"] + norm["y2"]) / 2,
        norm["x2"] - norm["x1"],
        norm["y2"] - norm["y1"],
    ]
)
summary = class_summary(clean)
rejected = int(len(raw) - len(clean))
ax = plot_class_distribution(summary)
print(summary)
`;

export const M11_SOLUTIONS: Readonly<Record<string, M11MissionSolutions>> = {
  "python-foundations.pf27": {
    reference: PF27,
    wrong: [
      {
        name: "clean_annotations ignores its arguments and returns the visible file's result (hard-coded)",
        code: edit(
          PF27,
          [
            `def clean_annotations(df, allowed_labels):
    missing`,
            `_VISIBLE = None


def clean_annotations(df, allowed_labels):
    global _VISIBLE
    if _VISIBLE is not None:
        return _VISIBLE
    missing`,
          ],
          [
            `    return table.reset_index(drop=True)`,
            `    _VISIBLE = table.reset_index(drop=True)
    return _VISIBLE`,
          ],
        ),
        fails: [],
        failsFunctions: ["clean_annotations"],
      },
      {
        name: "removes repeats BEFORE validating, so a valid row after an invalid twin is lost",
        code: edit(PF27, [
          `    table = table[valid].drop_duplicates(subset=KEY, keep="first")`,
          `    table = table.drop_duplicates(subset=KEY, keep="first")
    table = table[valid.reindex(table.index)]`,
        ]),
        fails: ["clean"],
        failsFunctions: ["clean_annotations"],
      },
      {
        name: "forgets that a box must stay inside the image",
        code: edit(PF27, [
          `        & (table["xmax"] <= table["width"])
        & (table["ymax"] <= table["height"])
`,
          ``,
        ]),
        fails: ["clean"],
        failsFunctions: ["clean_annotations"],
      },
      {
        name: "accepts a box that starts at a negative coordinate",
        code: edit(PF27, [
          `        & (table["xmin"] >= 0)
        & (table["ymin"] >= 0)
`,
          ``,
        ]),
        fails: ["clean"],
        failsFunctions: ["clean_annotations"],
      },
      {
        name: "accepts an inverted or empty box (<= instead of <)",
        code: edit(PF27, [
          `        & (table["xmin"] < table["xmax"])
        & (table["ymin"] < table["ymax"])
`,
          `        & (table["xmin"] <= table["xmax"])
        & (table["ymin"] <= table["ymax"])
`,
        ]),
        fails: ["clean"],
        failsFunctions: ["clean_annotations"],
      },
      {
        name: "uses a fixed class list instead of allowed_labels",
        code: edit(PF27, [`        & table["label"].isin(allowed_labels)`, `        & table["label"].isin(["cat", "dog", "car", "person"])`]),
        fails: ["clean"],
        failsFunctions: ["clean_annotations"],
      },
      {
        name: "does not lower-case the labels",
        code: edit(PF27, [`    table["label"] = table["label"].str.lower()
`, ``]),
        fails: ["clean"],
        failsFunctions: ["clean_annotations"],
      },
      {
        name: "keeps a gappy index",
        code: edit(PF27, [`    return table.reset_index(drop=True)`, `    return table`]),
        fails: ["clean"],
        failsFunctions: ["clean_annotations"],
      },
      {
        name: "never checks the schema (KeyError instead of ValueError)",
        code: edit(PF27, [
          `    missing = [column for column in REQUIRED_COLUMNS if column not in df.columns]
    if missing:
        raise ValueError("Thiếu cột: " + ", ".join(missing))
`,
          ``,
        ]),
        fails: [],
        failsFunctions: ["clean_annotations"],
      },
      {
        name: "clean_annotations converts the columns of its argument in place",
        code: edit(PF27, [
          `    table = df[REQUIRED_COLUMNS].copy()
`,
          `    table = df[REQUIRED_COLUMNS].copy()
    df["width"] = pd.to_numeric(df["width"], errors="coerce")
`,
        ]),
        fails: [],
        failsFunctions: ["clean_annotations"],
      },
      {
        name: "normalizes every box by the largest image of the table",
        code: edit(PF27, [
          `    out["x1"] = clean["xmin"] / clean["width"]
    out["y1"] = clean["ymin"] / clean["height"]
    out["x2"] = clean["xmax"] / clean["width"]
    out["y2"] = clean["ymax"] / clean["height"]`,
          `    out["x1"] = clean["xmin"] / clean["width"].max()
    out["y1"] = clean["ymin"] / clean["height"].max()
    out["x2"] = clean["xmax"] / clean["width"].max()
    out["y2"] = clean["ymax"] / clean["height"].max()`,
        ]),
        fails: ["norm"],
        failsFunctions: ["normalize_boxes"],
      },
      {
        name: "divides the y coordinates by the width (axes mixed up)",
        code: edit(
          PF27,
          [`out["y1"] = clean["ymin"] / clean["height"]`, `out["y1"] = clean["ymin"] / clean["width"]`],
          [`out["y2"] = clean["ymax"] / clean["height"]`, `out["y2"] = clean["ymax"] / clean["width"]`],
        ),
        fails: ["norm"],
        failsFunctions: ["normalize_boxes"],
      },
      {
        name: "normalize_boxes adds columns to the table it receives",
        code: edit(PF27, [`    out = clean[["image_id", "label", "split"]].copy()`, `    out = clean
    clean["x1"] = clean["xmin"] / clean["width"]`]),
        fails: ["norm"],
        failsFunctions: ["normalize_boxes"],
      },
      {
        name: "the matrix X keeps the corner format (x1, y1, x2, y2) instead of centre / size",
        code: edit(PF27, [
          `X = np.column_stack(
    [
        (norm["x1"] + norm["x2"]) / 2,
        (norm["y1"] + norm["y2"]) / 2,
        norm["x2"] - norm["x1"],
        norm["y2"] - norm["y1"],
    ]
)`,
          `X = norm[["x1", "y1", "x2", "y2"]].to_numpy(dtype=float)`,
        ]),
        fails: ["X"],
      },
      {
        name: "the matrix X has the right numbers but is transposed (4, n)",
        code: edit(PF27, [`X = np.column_stack(`, `X = np.vstack(`]),
        fails: ["X"],
      },
      {
        name: "the matrix X is float32",
        code: edit(PF27, [`ax = plot_class_distribution(summary)`, `X = X.astype(np.float32)
ax = plot_class_distribution(summary)`]),
        fails: ["X"],
      },
      {
        name: "the class summary is sorted by class name instead of by box count",
        code: edit(PF27, [`    summary = summary.reset_index().sort_values(["boxes", "label"], ascending=[False, True])
    return summary.set_index("label")`, `    return summary.sort_index()`]),
        fails: ["summary"],
        failsFunctions: ["class_summary"],
      },
      {
        name: "ties are broken in the wrong direction (both keys descending)",
        code: edit(PF27, [`ascending=[False, True]`, `ascending=False`]),
        fails: [],
        failsFunctions: ["class_summary"],
      },
      {
        name: "share is relative to the biggest class instead of all boxes",
        code: edit(PF27, [`    summary["share"] = summary["boxes"] / len(clean)`, `    summary["share"] = summary["boxes"] / summary["boxes"].max()`]),
        fails: ["summary"],
        failsFunctions: ["class_summary"],
      },
      {
        name: "images counts boxes instead of distinct images",
        code: edit(PF27, [`grouped["image_id"].nunique()`, `grouped["image_id"].count()`]),
        fails: ["summary"],
        failsFunctions: ["class_summary"],
      },
      {
        name: "the chart is a line plot, not a bar chart",
        code: edit(PF27, [`    ax.bar(list(summary.index), list(summary["boxes"]))`, `    ax.plot(list(summary.index), list(summary["boxes"]))`]),
        fails: ["ax"],
        failsFunctions: ["plot_class_distribution"],
      },
      {
        name: "the chart shows shares, not box counts",
        code: edit(PF27, [`list(summary["boxes"]))`, `list(summary["share"]))`]),
        fails: ["ax"],
        failsFunctions: ["plot_class_distribution"],
      },
      {
        name: "the chart reorders the classes alphabetically",
        code: edit(PF27, [`    ax.bar(list(summary.index), list(summary["boxes"]))`, `    ordered = summary.sort_index()
    ax.bar(list(ordered.index), list(ordered["boxes"]))`]),
        fails: ["ax"],
        failsFunctions: ["plot_class_distribution"],
      },
      {
        name: "the chart has no axis labels",
        code: edit(PF27, [`    ax.set_xlabel("Lớp")
    ax.set_ylabel("Số bounding box")
`, ``]),
        fails: ["ax"],
        failsFunctions: ["plot_class_distribution"],
      },
      {
        name: "the chart's labels are on the wrong axes",
        code: edit(PF27, [`    ax.set_xlabel("Lớp")
    ax.set_ylabel("Số bounding box")`, `    ax.set_xlabel("Số bounding box")
    ax.set_ylabel("Lớp")`]),
        fails: ["ax"],
        failsFunctions: ["plot_class_distribution"],
      },
      {
        name: "rejected counts the kept rows instead of the removed ones",
        code: edit(PF27, [`rejected = int(len(raw) - len(clean))`, `rejected = int(len(clean))`]),
        fails: ["rejected"],
      },
      {
        name: "rejected counts only the rows with a blank cell",
        code: edit(PF27, [`rejected = int(len(raw) - len(clean))`, `rejected = int(len(raw.dropna()) - len(clean))`]),
        fails: ["rejected"],
      },
      {
        name: "rejected is a float",
        code: edit(PF27, [`rejected = int(len(raw) - len(clean))`, `rejected = float(len(raw) - len(clean))`]),
        fails: ["rejected"],
      },
    ],
  },
};
