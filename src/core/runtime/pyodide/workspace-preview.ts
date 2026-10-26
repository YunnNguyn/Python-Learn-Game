import type { PyodideInterface } from "pyodide";

import type { RuntimeWorkspaceInfo } from "../runtime-contracts";

/**
 * Plot previews and the workspace listing (PHASE-08 / M10).
 *
 * Everything the learner can SEE of the virtual workspace passes through this module:
 *
 *  - `configureMatplotlib` makes a headless Matplotlib usable in a Web Worker (the default
 *    interactive backend is not) by selecting Agg before anything imports it;
 *  - `capturePreviewsAndScan` renders the figures the learner left open as PNG files (the
 *    way a notebook's inline backend would), closes them, lists `data/` and `artifacts/`,
 *    and inlines ONLY validated, bounded PNG images as `data:image/png;base64,...` URLs;
 *  - `clearStalePreviews` removes the auto-captured files before an execution so a preview
 *    always belongs to the run being shown.
 *
 * What is guaranteed (and unit-tested against a real Pyodide with Matplotlib):
 *  - an inlined image has a valid PNG signature and IHDR, and sane dimensions;
 *  - at most `maxCapturedFigures` figures are rendered per run, at most `maxInlineImages`
 *    images are inlined, and no image or total payload exceeds the byte limits - an oversize
 *    figure is re-rendered once at a lower resolution, then skipped with a note;
 *  - figure size is bounded in PIXELS before rendering, so `figsize=(100, 100)` cannot ask
 *    the interpreter for gigabytes;
 *  - every figure is closed after capture (nothing accumulates between runs), the BytesIO
 *    buffers are released, and the auto-captured files are deleted right after they were
 *    read (the data URL is all the UI needs);
 *  - no HTML, SVG or script is ever produced or rendered: non-PNG files are listed without
 *    a preview.
 *
 * Not guaranteed: a learner who calls `plt.figure(figsize=(100, 100))` AND saves it
 * themselves with `savefig` bypasses the size guard (the Worker's execution timeout and
 * the browser's memory limit are the only defence there).
 */

export const IMAGE_PREVIEW_LIMITS = Object.freeze({
  /** Open figures rendered per execution. */
  maxCapturedFigures: 3,
  /** Images inlined as data URLs per execution (figures + learner-saved PNGs). */
  maxInlineImages: 4,
  maxImageBytes: 400_000,
  maxTotalInlineBytes: 1_000_000,
  maxImageDimension: 2_000,
  maxImagePixels: 2_000_000,
  /** Files listed per group (data / artifacts). */
  maxListedFiles: 50,
  figureFilePrefix: "figure-",
});

const L = IMAGE_PREVIEW_LIMITS;

const PNG_HELPERS = `
import base64
import io
import json
import os
import pathlib
import struct
import sys
import warnings

_PNG_SIGNATURE = b"\\x89PNG\\r\\n\\x1a\\n"

def _png_size(data):
    # A PNG starts with an 8-byte signature followed by an IHDR chunk (length 13).
    if len(data) < 33 or data[:8] != _PNG_SIGNATURE or data[12:16] != b"IHDR":
        return None
    width, height = struct.unpack(">II", data[16:24])
    if width < 1 or height < 1:
        return None
    if width > ${L.maxImageDimension} or height > ${L.maxImageDimension} or width * height > ${L.maxImagePixels}:
        return None
    return width, height
`;

/** Defines `plg_clear()` - removes the auto-captured figure files. */
const CLEAR_SOURCE = `
import pathlib

def plg_clear():
    base = pathlib.Path("artifacts")
    if base.is_dir():
        for path in base.glob("${L.figureFilePrefix}*.png"):
            try:
                path.unlink()
            except Exception:
                pass
    return "ok"
`;

/** Defines `plg_capture()` - renders the open figures to artifacts/figure-N.png and closes them. */
const CAPTURE_SOURCE = `${PNG_HELPERS}
def plg_capture():
    report = {"captured": 0, "skipped": 0, "notes": []}
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is None:
        return json.dumps(report)
    try:
        numbers = list(plt.get_fignums())
    except Exception:
        return json.dumps(report)
    kept = 0
    for number in numbers:
        if kept >= ${L.maxCapturedFigures}:
            report["skipped"] += 1
            continue
        try:
            figure = plt.figure(number)
            width, height = figure.get_size_inches()
            dpi = float(figure.dpi)
            pixels = width * height * dpi * dpi
            if pixels > ${L.maxImagePixels}:
                dpi = (${L.maxImagePixels} / (width * height)) ** 0.5
            if dpi < 20:
                report["skipped"] += 1
                report["notes"].append("figure " + str(number) + ": too large to preview")
                continue
            data = None
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                for _attempt in range(2):
                    buffer = io.BytesIO()
                    figure.savefig(buffer, format="png", dpi=dpi, bbox_inches="tight")
                    candidate = buffer.getvalue()
                    buffer.close()
                    if len(candidate) <= ${L.maxImageBytes} and _png_size(candidate) is not None:
                        data = candidate
                        break
                    dpi = dpi / 2
                    if dpi < 20:
                        break
            if data is None:
                report["skipped"] += 1
                report["notes"].append("figure " + str(number) + ": preview too large")
                continue
            kept += 1
            os.makedirs("artifacts", exist_ok=True)
            pathlib.Path("artifacts/${L.figureFilePrefix}" + str(kept) + ".png").write_bytes(data)
            report["captured"] += 1
        except Exception:
            report["skipped"] += 1
            report["notes"].append("figure " + str(number) + ": could not be rendered")
    try:
        plt.close("all")
    except Exception:
        pass
    return json.dumps(report)
`;

/** Defines `plg_scan()` - lists data/ and artifacts/ and inlines validated PNG previews. */
const SCAN_SOURCE = `${PNG_HELPERS}
_CATEGORY = {
    "png": "image", "jpg": "image", "jpeg": "image", "gif": "image", "webp": "image", "bmp": "image", "svg": "image",
    "csv": "csv", "json": "json", "txt": "text",
}

def _scan(dirname, inline_state):
    items = []
    base = pathlib.Path(dirname)
    if not base.is_dir():
        return items
    for path in sorted(base.iterdir()):
        if not path.is_file():
            continue
        if len(items) >= ${L.maxListedFiles}:
            break
        extension = path.suffix.lower().lstrip(".")
        size = path.stat().st_size
        category = _CATEGORY.get(extension, "file")
        item = {
            "filename": path.name,
            "relativePath": dirname + "/" + path.name,
            "bytes": size,
            "extension": extension,
            "category": category,
        }
        if inline_state is not None and category == "image":
            if extension != "png":
                item["description"] = "Chỉ xem trước ảnh PNG."
            elif inline_state["count"] >= ${L.maxInlineImages}:
                item["description"] = "Không xem trước: đã đủ số ảnh tối đa được hiển thị."
            elif size <= 0 or size > ${L.maxImageBytes}:
                item["description"] = "Không xem trước: ảnh quá lớn."
            elif inline_state["bytes"] + size > ${L.maxTotalInlineBytes}:
                item["description"] = "Không xem trước: tổng dung lượng ảnh vượt giới hạn."
            else:
                data = path.read_bytes()
                if _png_size(data) is None:
                    item["description"] = "Không xem trước: không phải ảnh PNG hợp lệ."
                else:
                    inline_state["count"] += 1
                    inline_state["bytes"] += len(data)
                    item["dataUrl"] = "data:image/png;base64," + base64.b64encode(data).decode("ascii")
        items.append(item)
    return items

def plg_scan():
    state = {"count": 0, "bytes": 0}
    return json.dumps({
        "datasets": _scan("data", None),
        "artifacts": _scan("artifacts", state),
    })
`;

function call(pyodide: PyodideInterface, source: string, entry: string): string {
  const result = pyodide.runPython(
    `(lambda __ns: (exec(${JSON.stringify(source)}, __ns), __ns[${JSON.stringify(entry)}]())[1])({})`,
  ) as unknown;
  return typeof result === "string" ? result : "";
}

/**
 * Makes Matplotlib usable headless inside the Worker. Must run before the first import of
 * matplotlib (the learner's `import matplotlib.pyplot`), so the Worker calls it as soon as
 * the mission asks for the package. Idempotent.
 */
export function configureMatplotlib(pyodide: PyodideInterface): void {
  pyodide.runPython(
    "import os, warnings\n" +
      'os.environ["MPLBACKEND"] = "Agg"\n' +
      'warnings.filterwarnings("ignore", message=r"FigureCanvasAgg is non-interactive")\n' +
      'warnings.filterwarnings("ignore", message=r"The [xy] parameter as float was deprecated")\n',
  );
}

/** Removes auto-captured figure files left by an earlier execution. Never throws. */
export function clearStalePreviews(pyodide: PyodideInterface): void {
  try {
    call(pyodide, CLEAR_SOURCE, "plg_clear");
  } catch {
    // best effort: a stale preview is replaced by the next capture anyway
  }
}

export interface PreviewCaptureReport {
  readonly captured: number;
  readonly skipped: number;
}

/**
 * After an execution: render + close the open figures, list the workspace (inlining
 * validated PNGs), then delete the auto-captured files. Returns undefined when even the
 * listing failed. Never throws.
 */
export function capturePreviewsAndScan(pyodide: PyodideInterface): RuntimeWorkspaceInfo | undefined {
  try {
    call(pyodide, CAPTURE_SOURCE, "plg_capture");
  } catch {
    // a figure that cannot be previewed must not break the run
  }
  let workspace: RuntimeWorkspaceInfo | undefined;
  try {
    const parsed = JSON.parse(call(pyodide, SCAN_SOURCE, "plg_scan")) as unknown;
    workspace = parsed as RuntimeWorkspaceInfo;
  } catch {
    workspace = undefined;
  }
  clearStalePreviews(pyodide);
  return workspace;
}

/** Test hook: the capture report (what was rendered / skipped) for the current figures. */
export function capturePreviewReport(pyodide: PyodideInterface): PreviewCaptureReport {
  try {
    const parsed = JSON.parse(call(pyodide, CAPTURE_SOURCE, "plg_capture")) as PreviewCaptureReport;
    return { captured: parsed.captured, skipped: parsed.skipped };
  } catch {
    return { captured: 0, skipped: 0 };
  }
}
