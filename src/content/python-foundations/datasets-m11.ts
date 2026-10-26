import { createSeededRng, type SeededRng } from "../../core/random";

import { compareText, meanOf } from "./generators-m10-support";

/**
 * Authored CSV fixtures of the M11 capstone PF-27 (PHASE-09): bounding-box annotations of
 * images, with realistic mistakes.
 *
 * Same constraint as the M10 workflow missions: a template's runtime config is static, so the
 * four "variants" of PF-27 are FOUR FIXED FILES, each generated here from a fixed seed (pure,
 * reproducible, no network), and the mission variant only chooses which file the learner is
 * told to read. The expected result of each file is computed by the TypeScript reference rules
 * below from the very same records that were written to the CSV text, so file and expectation
 * cannot drift apart.
 *
 * The variants differ in the allowed classes (and so in the class counts), in the image sizes,
 * in how many boxes each image has, and in WHERE and HOW OFTEN the bad rows occur.
 * Everything is small (tens of rows), uses relative paths (`data/...`) only and contains no
 * personal data.
 */

export const ANNOTATION_VARIANT_COUNT = 4;

export const ANNOTATION_COLUMNS = [
  "image_id",
  "width",
  "height",
  "label",
  "xmin",
  "ymin",
  "xmax",
  "ymax",
  "split",
] as const;
export const ALLOWED_SPLITS = ["train", "val", "test"] as const;
export const NORMALIZED_COLUMNS = ["image_id", "label", "split", "x1", "y1", "x2", "y2"] as const;
export const SUMMARY_COLUMNS = ["boxes", "images", "share", "mean_area"] as const;

export const PLOT_TITLE = "Phân bố lớp annotation";
export const PLOT_XLABEL = "Lớp";
export const PLOT_YLABEL = "Số bounding box";

/** One raw cell as it appears in the CSV: the text, or `null` for a blank cell. */
export type Cell = string | null;

export interface AnnotationRaw {
  readonly imageId: Cell;
  readonly width: Cell;
  readonly height: Cell;
  readonly label: Cell;
  readonly xmin: Cell;
  readonly ymin: Cell;
  readonly xmax: Cell;
  readonly ymax: Cell;
  readonly split: Cell;
}

export interface CleanBox {
  readonly imageId: string;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly xmin: number;
  readonly ymin: number;
  readonly xmax: number;
  readonly ymax: number;
  readonly split: string;
}

const toNumber = (cell: Cell): number => (cell === null || cell.trim() === "" ? Number.NaN : Number(cell));

/**
 * The reference rules of PF-27 (the contract the mission text states):
 *  1. text columns are stripped; label and split are lower-cased;
 *  2. a row is valid when image_id is not blank, width and height are > 0, every number is
 *     readable, 0 <= xmin < xmax <= width, 0 <= ymin < ymax <= height, the label is one of
 *     `allowed` and the split is train / val / test;
 *  3. of the VALID rows, only the first row of each (image_id, label, xmin, ymin, xmax, ymax)
 *     is kept; file order is preserved.
 */
export function cleanAnnotations(raw: readonly AnnotationRaw[], allowed: readonly string[]): CleanBox[] {
  const seen = new Set<string>();
  const clean: CleanBox[] = [];
  for (const row of raw) {
    const imageId = row.imageId === null ? "" : row.imageId.trim();
    const label = row.label === null ? "" : row.label.trim().toLowerCase();
    const split = row.split === null ? "" : row.split.trim().toLowerCase();
    const width = toNumber(row.width);
    const height = toNumber(row.height);
    const xmin = toNumber(row.xmin);
    const ymin = toNumber(row.ymin);
    const xmax = toNumber(row.xmax);
    const ymax = toNumber(row.ymax);
    const valid =
      imageId !== "" &&
      width > 0 &&
      height > 0 &&
      xmin >= 0 &&
      ymin >= 0 &&
      xmin < xmax &&
      ymin < ymax &&
      xmax <= width &&
      ymax <= height &&
      allowed.includes(label) &&
      (ALLOWED_SPLITS as readonly string[]).includes(split);
    if (!valid) continue;
    const key = [imageId, label, xmin, ymin, xmax, ymax].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({ imageId, width: Math.trunc(width), height: Math.trunc(height), label, xmin, ymin, xmax, ymax, split });
  }
  return clean;
}

export interface NormalizedBox {
  readonly imageId: string;
  readonly label: string;
  readonly split: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export const normalizeBoxes = (clean: readonly CleanBox[]): NormalizedBox[] =>
  clean.map((box) => ({
    imageId: box.imageId,
    label: box.label,
    split: box.split,
    x1: box.xmin / box.width,
    y1: box.ymin / box.height,
    x2: box.xmax / box.width,
    y2: box.ymax / box.height,
  }));

/** The feature matrix of PF-27: (centre x, centre y, width, height) of each normalized box. */
export const yoloMatrix = (normalized: readonly NormalizedBox[]): number[][] =>
  normalized.map((box) => [(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2, box.x2 - box.x1, box.y2 - box.y1]);

export interface ClassSummaryRow {
  readonly label: string;
  readonly boxes: number;
  readonly images: number;
  readonly share: number;
  readonly meanArea: number;
}

/** boxes, distinct images, share of all boxes, mean normalized box area - per class. */
export function classSummary(clean: readonly CleanBox[]): ClassSummaryRow[] {
  const labels = [...new Set(clean.map((box) => box.label))];
  const rows = labels.map((label) => {
    const boxes = clean.filter((box) => box.label === label);
    return {
      label,
      boxes: boxes.length,
      images: new Set(boxes.map((box) => box.imageId)).size,
      share: boxes.length / clean.length,
      meanArea: meanOf(
        boxes.map((box) => ((box.xmax - box.xmin) * (box.ymax - box.ymin)) / (box.width * box.height)),
      ),
    };
  });
  return rows.sort((a, b) => b.boxes - a.boxes || compareText(a.label, b.label));
}

// ---------------------------------------------------------------------------------------
// CSV fixtures
// ---------------------------------------------------------------------------------------

const csvLine = (cells: readonly Cell[]): string => cells.map((cell) => cell ?? "").join(",");
const csvText = (rows: readonly AnnotationRaw[]): string =>
  [
    ANNOTATION_COLUMNS.join(","),
    ...rows.map((row) =>
      csvLine([row.imageId, row.width, row.height, row.label, row.xmin, row.ymin, row.xmax, row.ymax, row.split]),
    ),
  ].join("\n") + "\n";

interface VariantSpec {
  readonly labels: readonly string[];
  /** Relative class frequencies, same order as `labels`. */
  readonly weights: readonly number[];
  readonly images: readonly [number, number];
  readonly perImage: readonly [number, number];
  readonly sizes: readonly (readonly [number, number])[];
  readonly duplicates: number;
}

const VARIANT_SPECS: readonly VariantSpec[] = [
  {
    labels: ["cat", "dog", "bird"],
    weights: [5, 3, 1],
    images: [9, 11],
    perImage: [2, 4],
    sizes: [[640, 480], [800, 600]],
    duplicates: 2,
  },
  {
    labels: ["car", "bus", "bike", "person"],
    weights: [4, 1, 2, 6],
    images: [10, 13],
    perImage: [2, 4],
    sizes: [[1280, 720], [1024, 768], [640, 360]],
    duplicates: 3,
  },
  {
    labels: ["apple", "banana", "orange"],
    weights: [1, 1, 7],
    images: [8, 10],
    perImage: [3, 5],
    sizes: [[512, 512], [320, 240]],
    duplicates: 1,
  },
  {
    labels: ["helmet", "vest", "mask", "glove", "boot"],
    weights: [3, 3, 2, 1, 1],
    images: [9, 12],
    perImage: [2, 4],
    sizes: [[1920, 1080], [960, 540], [800, 800]],
    duplicates: 2,
  },
];

const pad3 = (value: number): string => String(value).padStart(3, "0");

export interface AnnotationFixture {
  readonly file: string;
  readonly csv: string;
  readonly records: readonly AnnotationRaw[];
  readonly allowedLabels: readonly string[];
}

function buildFixture(variant: number): AnnotationFixture {
  const spec = VARIANT_SPECS[variant - 1]!;
  const rng: SeededRng = createSeededRng(`python-foundations.m11.pf27.v${variant}`);
  const weighted = spec.labels.flatMap((label, index) => Array.from({ length: spec.weights[index]! }, () => label));
  const style = (text: string): string => rng.pick([text, text, text, text.toUpperCase(), `${text[0]!.toUpperCase()}${text.slice(1)}`]);
  const spaced = (text: string): string => rng.pick([text, text, text, ` ${text}`, `${text} `]);

  // ---- valid annotations, image by image
  const imageCount = rng.nextInt(spec.images[0], spec.images[1] + 1);
  const valid: AnnotationRaw[] = [];
  for (let image = 1; image <= imageCount; image += 1) {
    const [width, height] = rng.pick(spec.sizes);
    const split = rng.pick(["train", "train", "train", "val", "test"]);
    const boxCount = rng.nextInt(spec.perImage[0], spec.perImage[1] + 1);
    for (let box = 0; box < boxCount; box += 1) {
      const boxWidth = rng.nextInt(Math.floor(width / 10), Math.floor(width / 2));
      const boxHeight = rng.nextInt(Math.floor(height / 10), Math.floor(height / 2));
      const xmin = rng.nextInt(0, width - boxWidth) + (rng.nextInt(0, 4) === 0 ? 0.5 : 0);
      const ymin = rng.nextInt(0, height - boxHeight) + (rng.nextInt(0, 4) === 0 ? 0.5 : 0);
      valid.push({
        imageId: spaced(`img_${pad3(image)}`),
        width: String(width),
        height: String(height),
        label: spaced(style(rng.pick(weighted))),
        xmin: String(xmin),
        ymin: String(ymin),
        xmax: String(Math.floor(xmin) + boxWidth),
        ymax: String(Math.floor(ymin) + boxHeight),
        split: style(split),
      });
    }
  }

  // ---- bad rows, each derived from a valid one so it looks plausible
  const sample = (): AnnotationRaw => rng.pick(valid);
  const num = (cell: Cell): number => Number(cell ?? "0");
  const make = (kind: string): AnnotationRaw => {
    const base = sample();
    switch (kind) {
      case "missing-label":
        return { ...base, label: null };
      case "missing-coordinate":
        return { ...base, xmin: null };
      case "unreadable-coordinate":
        return { ...base, ymax: "n/a" };
      case "zero-width":
        return { ...base, width: "0" };
      case "negative-height":
        return { ...base, height: String(-num(base.height)) };
      case "inverted-box":
        return { ...base, xmin: base.xmax, xmax: base.xmin };
      case "degenerate-box":
        return { ...base, ymax: base.ymin };
      case "outside-image":
        return { ...base, xmax: String(num(base.width) + 20) };
      case "negative-origin":
        return { ...base, xmin: "-5" };
      case "unknown-label":
        return { ...base, label: "tree" };
      case "unknown-split":
        return { ...base, split: "dev" };
      case "missing-image-id":
        return { ...base, imageId: null };
      default:
        throw new Error(`unknown bad-row kind ${kind}`);
    }
  };
  const kinds = [
    "missing-label",
    "missing-coordinate",
    "unreadable-coordinate",
    "zero-width",
    "negative-height",
    "inverted-box",
    "degenerate-box",
    "outside-image",
    "negative-origin",
    "unknown-label",
    "unknown-split",
    "missing-image-id",
  ];
  // EVERY kind of mistake occurs in every variant (so a rule that is missing is always caught),
  // plus two to four extra random ones, so the number and the mix of bad rows differ per file.
  const extra = Array.from({ length: rng.nextInt(2, 5) }, () => rng.pick(kinds));
  const bad = [...kinds, ...extra].map(make);

  // Exact repeats of valid rows (differing only in spacing / letter case), placed LATER in the file.
  const repeats = Array.from({ length: spec.duplicates }, () => {
    const base = sample();
    return { ...base, label: (base.label ?? "").trim().toUpperCase(), imageId: ` ${(base.imageId ?? "").trim()}` };
  });

  // An INVALID row (unknown split) sharing its key with a valid row that comes later: removing
  // repeats BEFORE validating would wrongly drop the valid row.
  const shadowTarget = valid[rng.nextInt(1, valid.length)]!;
  const shadow: AnnotationRaw = { ...shadowTarget, split: "dev" };

  // ---- interleave: file order = valid rows with bad rows inserted at random positions
  const rows: AnnotationRaw[] = [];
  const insertAt = new Map<number, AnnotationRaw[]>();
  const place = (row: AnnotationRaw, from: number): void => {
    const position = rng.nextInt(from, valid.length + 1);
    insertAt.set(position, [...(insertAt.get(position) ?? []), row]);
  };
  for (const row of bad) place(row, 0);
  for (const row of repeats) place(row, Math.min(valid.length, Math.floor(valid.length / 2)));
  const shadowIndex = valid.indexOf(shadowTarget);
  const shadowHere = insertAt.get(shadowIndex) ?? [];
  insertAt.set(shadowIndex, [shadow, ...shadowHere]);
  for (let position = 0; position <= valid.length; position += 1) {
    rows.push(...(insertAt.get(position) ?? []));
    if (position < valid.length) rows.push(valid[position]!);
  }

  return {
    file: `annotations_v${variant}.csv`,
    csv: csvText(rows),
    records: rows,
    allowedLabels: spec.labels,
  };
}

export const ANNOTATION_FIXTURES: readonly AnnotationFixture[] = Array.from(
  { length: ANNOTATION_VARIANT_COUNT },
  (_, index) => buildFixture(index + 1),
);

/** Every staged file, for the template's `runtime.config.workspace.datasets`. */
export const ANNOTATION_DATASETS = ANNOTATION_FIXTURES.map((fixture) => ({
  filename: fixture.file,
  content: fixture.csv,
}));
