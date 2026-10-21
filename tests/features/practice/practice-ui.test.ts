import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import {
  PracticeServicesProvider,
  createPracticeServices,
  type InstallPracticePackOutcome,
  type PracticeCatalog,
  type PracticeExerciseDetail,
  type PracticePackDetail,
  type PracticePackSummary,
} from "../../../src/app/services";
import { validateExercisePack } from "../../../src/core/exercise-packs";
import { PracticeBriefPanel, PracticeOutcomePanel } from "../../../src/features/practice/PracticeBrief";
import { PracticeCatalogView, PracticePackView } from "../../../src/features/practice/PracticeCatalogView";
import { PracticeExercisePage } from "../../../src/features/practice/PracticeExercisePage";
import { PracticeIssuesList } from "../../../src/features/practice/PracticeIssuesList";
import { PracticePackPage } from "../../../src/features/practice/PracticePackPage";
import { PracticePackPreview } from "../../../src/features/practice/PracticePackPreview";
import { parsePracticeRoute } from "../../../src/features/practice/practice-route";
import {
  describeInstallOutcome,
  describeReadError,
  formatBytes,
  previewPack,
} from "../../../src/features/practice/practice-view-models";
import { SAMPLE_PACK_TEXT } from "../../exercise-packs/pack-fixtures";

// The Monaco editor needs a real browser; the workspace renders its loading state
// before the editor is mounted, so a stand-in keeps the module graph loadable in Node.
vi.mock("../../../src/features/mission-workspace/PythonEditor", () => ({ PythonEditor: () => null }));

/**
 * PHASE-05-M7 UI. The project has no jsdom / component-test infrastructure, so the
 * screens are split into pure views (props in, markup out) and containers that only
 * fetch; the views and the route guards are tested here by rendering to static markup.
 */

const render = (element: ReactElement): string => renderToStaticMarkup(element);

function renderRoute(location: string, routePath: string, element: ReactElement): string {
  const services = createPracticeServices();
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [location] },
      createElement(PracticeServicesProvider, {
        services,
        children: createElement(Routes, null, createElement(Route, { path: routePath, element })),
      }),
    ),
  );
}

const inRouter = (element: ReactElement): string =>
  render(createElement(MemoryRouter, { initialEntries: ["/practice"] }, element));

function makeDetail(overrides: Partial<PracticeExerciseDetail> = {}): PracticeExerciseDetail {
  return {
    exerciseId: "ex-one",
    activityId: "practice:mini.pack:ex-one" as never,
    kind: "code",
    title: "Bài một",
    difficulty: "easy",
    revision: 1,
    completed: false,
    attemptCount: 0,
    packId: "mini.pack",
    packTitle: "Mini",
    instructions: "Gán `answer = 3`.\n\nĐoạn hai.",
    datasets: [],
    feedback: { onPass: "Làm tốt lắm.", onFail: "Thử lại nhé." },
    explanation: "Vì 3 là đáp án.",
    referenceSolution: "answer = 3\n",
    previousExerciseId: null,
    nextExerciseId: "ex-two",
    ...overrides,
  };
}

describe("parsePracticeRoute", () => {
  it("accepts well-formed pack and exercise ids", () => {
    expect(parsePracticeRoute({ packId: "ml-basics.linreg-numpy" })).toEqual({ ok: true, packId: "ml-basics.linreg-numpy" });
    expect(parsePracticeRoute({ packId: "mini.pack", exerciseId: "ex-one" })).toEqual({
      ok: true,
      packId: "mini.pack",
      exerciseId: "ex-one",
    });
  });

  it("rejects missing, empty and malformed segments without consulting any service", () => {
    for (const params of [
      {},
      { packId: "" },
      { packId: "Mini Pack" },
      { packId: "UPPER" },
      { packId: "../x" },
      { packId: "a/b" },
      { packId: "-lead" },
      { packId: "mini.pack", exerciseId: "" },
      { packId: "mini.pack", exerciseId: "Bad Id" },
      { packId: "mini.pack", exerciseId: "x".repeat(65) },
    ]) {
      expect(parsePracticeRoute(params)).toEqual({ ok: false });
    }
  });
});

describe("practice view models", () => {
  it("describes every install outcome, and only success ones as success", () => {
    const pack = {
      packId: "mini.pack",
      version: "1.0.0",
      title: "Mini",
      description: "d",
      topic: "t",
      tags: [],
      exerciseCount: 1,
      installedAt: "2026-10-20T00:00:00.000Z",
      progress: { completed: 0, total: 1 },
    };
    const outcomes: Array<[InstallPracticePackOutcome, string]> = [
      [{ status: "installed", pack }, "success"],
      [{ status: "already-installed", pack }, "info"],
      [{ status: "rejected", issues: [] }, "error"],
      [{ status: "conflict", packId: "mini.pack", existingVersion: "1.0.0", message: "m" }, "error"],
      [{ status: "limit-reached", limit: 30, message: "m" }, "error"],
      [{ status: "storage-unavailable", message: "m" }, "error"],
      [{ status: "upgrade-blocked", message: "m" }, "error"],
      [{ status: "retired", message: "m" }, "error"],
    ];
    for (const [outcome, tone] of outcomes) expect(describeInstallOutcome(outcome).tone).toBe(tone);
    // A successful install states durability honestly: it is the browser's IndexedDB, on this device.
    expect(describeInstallOutcome({ status: "installed", pack }).detail).toContain("IndexedDB");
  });

  it("describes read errors and formats sizes", () => {
    expect(describeReadError({ code: "CORRUPT", message: "x" }).title).toBe("Pack bị hỏng");
    expect(describeReadError({ code: "STORAGE_UNAVAILABLE", message: "x" }).tone).toBe("error");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KiB");
  });

  it("previews the shipped sample pack", () => {
    const result = validateExercisePack(SAMPLE_PACK_TEXT);
    if (!result.ok) throw new Error("sample pack must validate");
    const preview = previewPack(result.pack, result.warnings);
    expect(preview.packId).toBe("ml-basics.linreg-numpy");
    expect(preview.exercises.map((exercise) => exercise.id)).toEqual(["mse-basic", "gd-step", "fix-normalization"]);
    expect(preview.packages).toEqual(["numpy"]);
    expect(preview.datasetCount).toBe(0);
  });
});

describe("practice views render text only", () => {
  it("shows issues with their JSON Pointer and escapes hostile text", () => {
    const markup = render(
      createElement(PracticeIssuesList, {
        issues: [
          { code: "INVALID_TYPE", path: "/exercises/0/title", message: "Phải là chuỗi <script>alert(1)</script>." },
          { code: "WRONG_FORMAT", path: "", message: "Sai định dạng." },
        ],
      }),
    );
    expect(markup).toContain("/exercises/0/title");
    expect(markup).toContain("(toàn bộ tài liệu)");
    expect(markup).toContain("INVALID_TYPE");
    expect(markup).not.toContain("<script>");
    expect(markup).toContain("&lt;script&gt;");
  });

  it("the pre-install review states what the pack is and that running it is not sandboxed", () => {
    const result = validateExercisePack(SAMPLE_PACK_TEXT);
    if (!result.ok) throw new Error("sample pack must validate");
    const markup = render(createElement(PracticePackPreview, { preview: previewPack(result.pack, result.warnings) }));
    expect(markup).toContain("ml-basics.linreg-numpy");
    expect(markup).toContain("numpy");
    expect(markup).toContain("không tự chạy gì khi cài đặt");
    expect(markup).toContain("không phải là sandbox bảo mật hoàn chỉnh");
    // It never claims that isolation prevents Python from reaching browser storage.
    expect(markup).not.toMatch(/an toàn tuyệt đối|cách ly hoàn toàn|không thể truy cập/i);
  });

  it("renders the catalog in each state", () => {
    expect(inRouter(createElement(PracticeCatalogView, { state: { status: "loading" } }))).toContain("Đang đọc");
    expect(
      inRouter(
        createElement(PracticeCatalogView, {
          state: { status: "error", error: { code: "STORAGE_UNAVAILABLE", message: "IndexedDB bị chặn" } },
        }),
      ),
    ).toContain("IndexedDB bị chặn");
    const empty: PracticeCatalog = { packs: [], corrupt: [], unreadableCount: 0 };
    expect(inRouter(createElement(PracticeCatalogView, { state: { status: "ready", value: empty } }))).toContain("Chưa có pack nào");

    const populated: PracticeCatalog = {
      packs: [
        {
          packId: "mini.pack",
          version: "1.0.0",
          title: "Mini <b>pack</b>",
          description: "Mô tả",
          topic: "Thử nghiệm",
          tags: [],
          exerciseCount: 2,
          installedAt: "2026-10-20T00:00:00.000Z",
          progress: { completed: 1, total: 2 },
        },
      ],
      corrupt: [{ packId: "broken.pack", installedAt: "2026-10-20T00:00:00.000Z" }],
      unreadableCount: 1,
    };
    const markup = inRouter(createElement(PracticeCatalogView, { state: { status: "ready", value: populated } }));
    expect(markup).toContain('href="/practice/mini.pack"');
    expect(markup).toContain("1/2 bài hoàn thành");
    expect(markup).toContain("Mini &lt;b&gt;pack&lt;/b&gt;");
    expect(markup).not.toContain("<b>pack</b>");
    expect(markup).toContain("broken.pack");
    expect(markup).toContain("1 bản ghi pack");
  });

  it("renders a pack with links to each exercise and its completion", () => {
    const pack: PracticePackDetail = {
      packId: "mini.pack",
      version: "1.0.0",
      title: "Mini",
      description: "Mô tả",
      topic: "Thử nghiệm",
      tags: [],
      exerciseCount: 2,
      installedAt: "2026-10-20T00:00:00.000Z",
      progress: { completed: 1, total: 2 },
      learningObjectives: ["Hiểu MSE"],
      prerequisites: [],
      exercises: [
        { exerciseId: "ex-one", activityId: "a" as never, kind: "code", title: "Bài một", difficulty: "easy", revision: 1, completed: true, attemptCount: 2 },
        { exerciseId: "ex-two", activityId: "b" as never, kind: "debug", title: "Bài hai", difficulty: "hard", revision: 1, completed: false, attemptCount: 0 },
      ],
    };
    const markup = inRouter(createElement(PracticePackView, { packId: "mini.pack", state: { status: "ready", value: pack } }));
    expect(markup).toContain('href="/practice/mini.pack/ex-one"');
    expect(markup).toContain('href="/practice/mini.pack/ex-two"');
    expect(markup).toContain("Đã đạt");
    expect(markup).toContain("Chưa làm");
    expect(markup).toContain("Sửa lỗi");
    expect(markup).toContain("Hiểu MSE");

    const failed = inRouter(
      createElement(PracticePackView, {
        packId: "mini.pack",
        state: { status: "error", error: { code: "NOT_FOUND", message: "Không tìm thấy pack này." } },
      }),
    );
    expect(failed).toContain("Không tìm thấy pack này.");
    expect(failed).toContain('href="/practice"');
  });

  it("unknown progress is shown as unknown, never as zero completed", () => {
    const unknown: PracticePackSummary = {
      packId: "mini.pack",
      version: "1.0.0",
      title: "Mini",
      description: "Mô tả",
      topic: "Thử nghiệm",
      tags: [],
      exerciseCount: 2,
      installedAt: "2026-10-20T00:00:00.000Z",
      progress: { completed: null, total: 2 },
    };
    const catalog = inRouter(
      createElement(PracticeCatalogView, {
        state: { status: "ready", value: { packs: [unknown], corrupt: [], unreadableCount: 0 } },
      }),
    );
    expect(catalog).toContain("Không đọc được tiến độ");
    expect(catalog).not.toContain("0/2");

    const detail: PracticePackDetail = {
      ...unknown,
      learningObjectives: [],
      prerequisites: [],
      exercises: [
        { exerciseId: "ex-one", activityId: "a" as never, kind: "code", title: "Bài một", difficulty: "easy", revision: 1, completed: null, attemptCount: null },
      ],
    };
    const markup = inRouter(createElement(PracticePackView, { packId: "mini.pack", state: { status: "ready", value: detail } }));
    expect(markup).toContain("Không đọc được tiến độ");
    expect(markup).not.toContain("Chưa làm");
    expect(markup).not.toContain("0/2");
    expect(markup).toContain('href="/practice/mini.pack/ex-one"');
  });

  it("the brief shows authored text as text, never as HTML", () => {
    const markup = inRouter(
      createElement(PracticeBriefPanel, {
        detail: makeDetail({
          instructions: "Đừng chạy <img src=x onerror=alert(1)> nhé.\n\nĐoạn hai.",
          symptom: "Kết quả sai",
          datasets: [{ filename: "data.csv", description: "Dữ liệu mẫu" }],
        }),
      }),
    );
    expect(markup).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(markup).not.toContain("<img");
    expect(markup).toContain("Triệu chứng");
    expect(markup).toContain("data.csv");
    expect(markup).toContain("Hãy đọc mã khởi đầu");
  });

  it("the outcome reveals explanation and the reference solution only after a pass", () => {
    const passed = inRouter(createElement(PracticeOutcomePanel, { detail: makeDetail(), attempt: { passed: true } }));
    expect(passed).toContain("Làm tốt lắm.");
    expect(passed).toContain("Vì 3 là đáp án.");
    expect(passed).toContain("answer = 3");
    expect(passed).toContain('href="/practice/mini.pack/ex-two"');
    expect(passed).toContain("ứng dụng không chạy lời giải này");

    const failed = inRouter(createElement(PracticeOutcomePanel, { detail: makeDetail(), attempt: { passed: false } }));
    expect(failed).toContain("Thử lại nhé.");
    expect(failed).not.toContain("Vì 3 là đáp án.");
    expect(failed).not.toContain("answer = 3");
    expect(failed).not.toContain("Bài tiếp theo");
  });
});

describe("practice routes", () => {
  it("malformed pack and exercise ids render the not-found page without opening anything", () => {
    for (const location of ["/practice/Bad%20Id", "/practice/UPPER", "/practice/..%2Fx"]) {
      expect(renderRoute(location, "/practice/:packId", createElement(PracticePackPage))).toContain("Không tìm thấy trang");
    }
    for (const location of ["/practice/mini.pack/Bad%20Id", "/practice/Bad%20Id/ex-one", "/practice/mini.pack/UPPER"]) {
      expect(
        renderRoute(location, "/practice/:packId/:exerciseId", createElement(PracticeExercisePage)),
      ).toContain("Không tìm thấy trang");
    }
  });

  it("a well-formed pack route shows its loading state; a well-formed exercise route opens the workspace's loading state", () => {
    const pack = renderRoute("/practice/mini.pack", "/practice/:packId", createElement(PracticePackPage));
    expect(pack).toContain("Đang đọc pack");
    expect(pack).not.toContain("Không tìm thấy trang");

    const exercise = renderRoute(
      "/practice/mini.pack/ex-one",
      "/practice/:packId/:exerciseId",
      createElement(PracticeExercisePage),
    );
    expect(exercise).toContain("Đang chuẩn bị nhiệm vụ");
    expect(exercise).not.toContain("Không tìm thấy trang");
  });
});
