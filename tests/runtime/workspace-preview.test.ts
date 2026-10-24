import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadPyodide, type PyodideInterface } from "pyodide";

import {
  IMAGE_PREVIEW_LIMITS,
  capturePreviewsAndScan,
  clearStalePreviews,
  configureMatplotlib,
} from "../../src/core/runtime/pyodide/workspace-preview";
import { requireNumpy, tryLoadNumpy, type NumpyState } from "./numpy-support";

/**
 * PHASE-08 / M10: the plot preview path against a REAL Pyodide with a REAL Matplotlib - what
 * becomes a `data:image/png` URL, what is bounded, what is cleaned up and what is refused.
 * (The Worker transport and the <img> rendering are covered by qa/m10-acceptance in Edge.)
 */

let pyodide: PyodideInterface;
let packages: NumpyState = { available: false, error: "not loaded" };

beforeAll(async () => {
  pyodide = await loadPyodide();
  configureMatplotlib(pyodide);
  packages = await tryLoadNumpy(pyodide);
  if (packages.available) {
    try {
      await pyodide.loadPackage(["matplotlib"]);
    } catch (error) {
      packages = { available: false, error: error instanceof Error ? error.message.split("\n")[0]! : String(error) };
    }
  }
}, 300_000);

beforeEach(() => {
  if (!packages.available) return;
  pyodide.runPython(
    "import os, shutil, sys\n" +
      'shutil.rmtree("artifacts", ignore_errors=True)\nshutil.rmtree("data", ignore_errors=True)\n' +
      'os.makedirs("artifacts"); os.makedirs("data")\n' +
      'plt = sys.modules.get("matplotlib.pyplot")\nif plt is not None: plt.close("all")\n',
  );
});

const run = (code: string) => pyodide.runPython(code);

function pngSize(dataUrl: string): { width: number; height: number } {
  const prefix = "data:image/png;base64,";
  expect(dataUrl.startsWith(prefix)).toBe(true);
  const bytes = Uint8Array.from(atob(dataUrl.slice(prefix.length)), (char) => char.charCodeAt(0));
  expect(Array.from(bytes.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe("workspace preview (real Pyodide + Matplotlib)", () => {
  it("configures the Agg backend so Matplotlib works headless", (ctx) => {
    requireNumpy(ctx, packages);
    run("import matplotlib.pyplot as plt");
    expect(String(run("import matplotlib; matplotlib.get_backend()")).toLowerCase()).toBe("agg");
  }, 60_000);

  it("without any figure it only lists the workspace and never throws", (ctx) => {
    requireNumpy(ctx, packages);
    run('open("data/a.csv", "w").write("x\\n1\\n")');
    const workspace = capturePreviewsAndScan(pyodide)!;
    expect(workspace.datasets.map((file) => file.filename)).toEqual(["a.csv"]);
    expect(workspace.datasets[0]).toMatchObject({ category: "csv", extension: "csv" });
    expect(workspace.artifacts).toEqual([]);
  });

  it("turns an open figure into one valid, bounded PNG preview and closes the figure", (ctx) => {
    requireNumpy(ctx, packages);
    run("import matplotlib.pyplot as plt\nfig, ax = plt.subplots()\nax.plot([1, 2, 3], [3, 1, 2])\nax.set_title('T')");
    const workspace = capturePreviewsAndScan(pyodide)!;
    const images = workspace.artifacts.filter((file) => file.dataUrl !== undefined);
    expect(images).toHaveLength(1);
    const size = pngSize(images[0]!.dataUrl!);
    expect(size.width).toBeGreaterThan(50);
    expect(size.width).toBeLessThanOrEqual(IMAGE_PREVIEW_LIMITS.maxImageDimension);
    expect(size.height).toBeLessThanOrEqual(IMAGE_PREVIEW_LIMITS.maxImageDimension);
    expect(images[0]!.bytes).toBeLessThanOrEqual(IMAGE_PREVIEW_LIMITS.maxImageBytes);
    expect(Number(run("import matplotlib.pyplot as plt; len(plt.get_fignums())"))).toBe(0);
  });

  it("deletes the auto-captured files, so a later run never shows an earlier plot", (ctx) => {
    requireNumpy(ctx, packages);
    run("import matplotlib.pyplot as plt\nplt.subplots()");
    expect(capturePreviewsAndScan(pyodide)!.artifacts.length).toBe(1);
    expect(String(run('import os; ",".join(sorted(os.listdir("artifacts")))'))).toBe("");
    expect(capturePreviewsAndScan(pyodide)!.artifacts).toEqual([]);
  });

  it("renders at most the documented number of figures per run", (ctx) => {
    requireNumpy(ctx, packages);
    run("import matplotlib.pyplot as plt\nfor _ in range(7):\n    plt.figure()\n");
    const workspace = capturePreviewsAndScan(pyodide)!;
    expect(workspace.artifacts.length).toBe(IMAGE_PREVIEW_LIMITS.maxCapturedFigures);
    expect(Number(run("len(plt.get_fignums())"))).toBe(0);
  });

  it("bounds an absurd figsize in pixels before rendering", (ctx) => {
    requireNumpy(ctx, packages);
    run("import matplotlib.pyplot as plt\nplt.figure(figsize=(100, 100))");
    const workspace = capturePreviewsAndScan(pyodide)!;
    for (const file of workspace.artifacts.filter((entry) => entry.dataUrl !== undefined)) {
      const { width, height } = pngSize(file.dataUrl!);
      expect(width).toBeLessThanOrEqual(IMAGE_PREVIEW_LIMITS.maxImageDimension);
      expect(height).toBeLessThanOrEqual(IMAGE_PREVIEW_LIMITS.maxImageDimension);
      expect(width * height).toBeLessThanOrEqual(IMAGE_PREVIEW_LIMITS.maxImagePixels);
    }
  });

  it("clearStalePreviews removes only the auto-captured figures, never a learner's own file", (ctx) => {
    requireNumpy(ctx, packages);
    run('open("artifacts/figure-1.png", "wb").write(b"x")\nopen("artifacts/mine.png", "wb").write(b"y")');
    clearStalePreviews(pyodide);
    expect(String(run('",".join(sorted(__import__("os").listdir("artifacts")))'))).toBe("mine.png");
  });

  it("does not inline anything that is not a valid PNG, and says why", (ctx) => {
    requireNumpy(ctx, packages);
    run(
      'open("artifacts/fake.png", "wb").write(b"<html><script>alert(1)</script></html>" * 5)\n' +
        'open("artifacts/vector.svg", "w").write("<svg onload=alert(1)></svg>")\n',
    );
    const workspace = capturePreviewsAndScan(pyodide)!;
    expect(workspace.artifacts.every((file) => file.dataUrl === undefined)).toBe(true);
    const byName = Object.fromEntries(workspace.artifacts.map((file) => [file.filename, file.description ?? ""]));
    expect(byName["fake.png"]).toContain("không phải ảnh PNG");
    expect(byName["vector.svg"]).toContain("PNG");
  });

  it("does not inline an oversize image", (ctx) => {
    requireNumpy(ctx, packages);
    run(`import matplotlib.pyplot as plt\nfig = plt.figure(figsize=(6, 4))\nfig.savefig("artifacts/big.png", dpi=100)\nplt.close("all")\nopen("artifacts/big.png", "ab").write(b"\\0" * ${IMAGE_PREVIEW_LIMITS.maxImageBytes})`);
    const workspace = capturePreviewsAndScan(pyodide)!;
    const big = workspace.artifacts.find((file) => file.filename === "big.png")!;
    expect(big.dataUrl).toBeUndefined();
    expect(big.description).toContain("quá lớn");
  });

  it("inlines at most the documented number of images per run, in a stable order", (ctx) => {
    requireNumpy(ctx, packages);
    run(
      "import matplotlib.pyplot as plt\n" +
        "for number in range(6):\n" +
        "    fig = plt.figure(figsize=(1, 1))\n" +
        '    fig.savefig("artifacts/img" + str(number) + ".png", dpi=40)\n' +
        "    plt.close(fig)\n",
    );
    const workspace = capturePreviewsAndScan(pyodide)!;
    const inlined = workspace.artifacts.filter((file) => file.dataUrl !== undefined);
    expect(inlined.length).toBe(IMAGE_PREVIEW_LIMITS.maxInlineImages);
    expect(workspace.artifacts.map((file) => file.filename)).toEqual(["img0.png", "img1.png", "img2.png", "img3.png", "img4.png", "img5.png"]);
    expect(workspace.artifacts.slice(IMAGE_PREVIEW_LIMITS.maxInlineImages).every((file) => file.dataUrl === undefined)).toBe(true);
  });

  it("a mistake in the learner's plotting code cannot break the preview of the next run", (ctx) => {
    requireNumpy(ctx, packages);
    expect(() => run("import matplotlib.pyplot as plt\nfig, ax = plt.subplots()\nax.plot([1, 2], [1])")).toThrow();
    // the half-built figure is still open: it is previewed (and closed) like any other
    expect(() => capturePreviewsAndScan(pyodide)).not.toThrow();
    expect(Number(run("len(plt.get_fignums())"))).toBe(0);
  });
});
