import { IDBFactory } from "fake-indexeddb";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import {
  ChallengeServicesProvider,
  createChallengeServices,
  type ChallengeServices,
  type ChallengeSubmission,
  type ChallengeSummary,
} from "../../../src/app/services";
import { CHALLENGE_CATALOG } from "../../../src/content/challenges/catalog";
import solutionCsv from "../../../src/content/challenges/delivery-time/solution.csv?raw";
import sampleCsv from "../../../public/challenges/delivery-time/v1/sample_submission.csv?raw";
import { challengePresentation } from "../../../src/content/challenges/presentations";
import { IndexedDbChallengePersistence } from "../../../src/core/challenge";
import { parseCsv } from "../../../src/core/challenge/csv";
import { ChallengeDetailPage } from "../../../src/features/challenge/ChallengeDetailPage";
import { ChallengeListPage } from "../../../src/features/challenge/ChallengeListPage";
import {
  ChallengeBriefPanel,
  ChallengeHistoryPanel,
  ChallengeListView,
  ChallengeNoticeBox,
  ChallengeSubmitPanel,
  PRACTICE_NOT_EXAM_NOTE,
  type ChallengeSubmitPanelProps,
} from "../../../src/features/challenge/ChallengeViews";
import {
  buildHistoryRows,
  describeReadError,
  describeSubmitOutcome,
  formatScore,
  formatSubmittedAt,
  validateUploadFile,
} from "../../../src/features/challenge/challenge-view-models";
import { createFlakyIndexedDb } from "../../persistence/flaky-indexeddb";

/*
 * The project has no jsdom / component-test infrastructure, so the screens are pure views (props in, markup
 * out) with thin containers; views and view-models are tested here by rendering to static markup, and the
 * submit flow is tested against the REAL services over fake-indexeddb.
 */

const render = (element: ReactElement): string => renderToStaticMarkup(element);
const noop = () => undefined;

const solutionRows = (() => {
  const parsed = parseCsv(solutionCsv, { maxBytes: 100_000, maxRows: 100 });
  if (!parsed.ok) throw new Error("solution did not parse");
  return parsed.table.rows;
})();

function expectNoSolutionLabels(markup: string) {
  for (const [id, label] of solutionRows) {
    expect(markup).not.toContain(`${id},${label}`);
  }
}

function makeServices(factory: IDBFactory = new IDBFactory(), counter = { value: 0 }): { services: ChallengeServices; factory: IDBFactory } {
  const services = createChallengeServices(
    { catalog: CHALLENGE_CATALOG },
    {
      persistence: new IndexedDbChallengePersistence(factory),
      generateId: () => `sub-${(counter.value += 1)}`,
      now: () => new Date(Date.UTC(2026, 9, 27, 10, counter.value, 0)),
    },
  );
  return { services, factory };
}

function summaryOf(services: ChallengeServices): ChallengeSummary {
  const result = services.getChallenge("delivery-time");
  if (!result.ok) throw new Error("challenge missing");
  return result.value;
}

const SUMMARY = summaryOf(makeServices().services);
const PRESENTATION = challengePresentation("delivery-time")!;

function submission(overrides: Partial<ChallengeSubmission> = {}): ChallengeSubmission {
  return {
    id: "s1",
    challengeId: "delivery-time",
    challengeVersion: "1",
    metric: "mae",
    score: 3.25,
    rowCount: 12,
    submittedAt: "2026-10-27T10:05:00.000Z",
    submissionSha256: "a".repeat(64),
    ...overrides,
  };
}

function submitPanel(overrides: Partial<ChallengeSubmitPanelProps> = {}): string {
  return render(
    createElement(ChallengeSubmitPanel, {
      summary: SUMMARY,
      text: "",
      busy: false,
      notice: null,
      onTextChange: noop,
      onFileChange: noop,
      onLoadSample: noop,
      onSubmit: noop,
      ...overrides,
    }),
  );
}

describe("Challenge listing", () => {
  const { services } = makeServices();
  const listing = services.listChallenges();

  it("shows title, description, metric, direction and an open action", () => {
    const markup = render(
      createElement(MemoryRouter, null, createElement(ChallengeListView, {
        state: { challenges: listing.ok ? listing.value : [] },
        presentationOf: challengePresentation,
      })),
    );
    expect(markup).toContain("Dự đoán thời gian giao hàng");
    expect(markup).toContain("MAE");
    expect(markup).toContain("Càng thấp càng tốt");
    expect(markup).toContain(PRESENTATION.shortDescription);
    expect(markup).toContain('href="/challenge/delivery-time"');
    expect(markup).toContain("Mở thử thách");
    expect(markup).not.toMatch(/bảng xếp hạng|đăng ký tài khoản/i);
  });

  it("renders an empty state", () => {
    expect(render(createElement(MemoryRouter, null, createElement(ChallengeListView, { state: { challenges: [] }, presentationOf: challengePresentation })))).toContain(
      "Chưa có thử thách nào",
    );
  });

  it("the page renders the catalog and the practice-not-exam note without touching storage", () => {
    const markup = render(
      createElement(MemoryRouter, null, createElement(ChallengeServicesProvider, { services, children: createElement(ChallengeListPage) })),
    );
    expect(markup).toContain("Dự đoán thời gian giao hàng");
    expect(markup).toContain("không phải kỳ thi bảo mật");
  });
});

describe("Challenge detail: brief", () => {
  const markup = render(createElement(ChallengeBriefPanel, { summary: SUMMARY, presentation: PRESENTATION }));

  it("shows the problem, metric direction, columns and the submission format", () => {
    expect(markup).toContain("Đề bài");
    expect(markup).toContain("MAE");
    expect(markup).toContain("Càng thấp càng tốt");
    for (const column of ["order_id", "distance_km", "traffic_level", "items_count", "delivery_minutes"]) expect(markup).toContain(column);
    expect(markup).toContain("Định dạng bài nộp");
    expect(markup).toContain("ORD041,35.4");
  });

  it("offers download links for all three public files", () => {
    for (const file of ["train.csv", "test.csv", "sample_submission.csv"]) {
      expect(markup).toContain(`download="${file}"`);
      expect(markup).toContain(`challenges/delivery-time/v1/${file}`);
    }
  });

  it("exposes no solution label", () => {
    expectNoSolutionLabels(markup);
  });
});

describe("Challenge detail: submission panel", () => {
  it("has labelled controls, a .csv-only file input and an empty-state disabled submit", () => {
    const markup = submitPanel();
    expect(markup).toContain('<label class="practice-import__label" for="challenge-file">');
    expect(markup).toContain('<label class="practice-import__label" for="challenge-editor">');
    expect(markup).toContain('accept=".csv,text/csv"');
    expect(markup).toContain('id="challenge-editor"');
    expect(markup).toContain("Nạp bài nộp mẫu");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Nộp bài<\/button>/);
    expect(markup).toContain("không chạy");
  });

  it("enables submit once there is text", () => {
    const markup = submitPanel({ text: "order_id,delivery_minutes\nORD041,30\n" });
    expect(markup).toMatch(/<button[^>]*class="primary-action"[^>]*>Nộp bài<\/button>/);
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Nộp bài<\/button>/);
    expect(markup).toContain("ORD041,30");
  });

  it("blocks every control while a submission is pending (no double submit)", () => {
    const markup = submitPanel({ text: "x", busy: true });
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Đang chấm\.\.\.<\/button>/);
    expect(markup.match(/disabled=""/g)?.length).toBe(4); // file input, textarea, sample button, submit button
  });

  it("shows the notice in a live region", () => {
    const markup = submitPanel({ notice: { tone: "error", title: "Lỗi thử", detail: "chi tiết" } });
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Lỗi thử");
  });
});

describe("Challenge submit flow with the real services", () => {
  const notice = (markup: string) => markup;

  it("shows validation errors with stable codes and persists nothing", async () => {
    const { services } = makeServices();
    const outcome = await services.submit("delivery-time", "order_id,delivery_minutes\nORD041,abc\n");
    const described = describeSubmitOutcome(outcome, SUMMARY);
    expect(described.tone).toBe("error");
    const markup = notice(render(createElement(ChallengeNoticeBox, { notice: described })));
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("INVALID_NUMBER");
    expect(markup).toContain("ROW_COUNT_MISMATCH");
    expect(markup).toContain("MISSING_IDS");
    expect(markup).toContain("không được lưu");
    expectNoSolutionLabels(markup);
    const history = await services.listSubmissions("delivery-time");
    expect(history.ok && history.value).toEqual([]);
  });

  it("reports a saved score only after persistence, and the sample baseline scores 8.617 MAE", async () => {
    const { services } = makeServices();
    const outcome = await services.submit("delivery-time", sampleCsv);
    expect(outcome.status).toBe("saved");
    const described = describeSubmitOutcome(outcome, SUMMARY);
    expect(described).toMatchObject({ tone: "success", title: "Đã chấm và lưu bài nộp" });
    expect(described.detail).toContain("8.617");
    expect(described.detail).toContain("càng thấp càng tốt");
    expect(render(createElement(ChallengeNoticeBox, { notice: described }))).toContain('role="status"');
  });

  it("never says saved when storage fails", async () => {
    const flaky = createFlakyIndexedDb(new IDBFactory());
    const { services } = makeServices(flaky.factory);
    flaky.failStores("submissions");
    const outcome = await services.submit("delivery-time", sampleCsv);
    expect(outcome.status).toBe("storage-unavailable");
    const described = describeSubmitOutcome(outcome, SUMMARY);
    expect(described.tone).toBe("error");
    expect(described.title).toContain("CHƯA được lưu");
    const markup = render(createElement(ChallengeNoticeBox, { notice: described }));
    expect(markup).not.toContain("Đã chấm và lưu");
    expect(markup).toContain('role="alert"');
  });

  it("without IndexedDB the page-level error is explicit", async () => {
    const services = createChallengeServices({ catalog: CHALLENGE_CATALOG });
    expect(describeSubmitOutcome(await services.submit("delivery-time", sampleCsv), SUMMARY).title).toContain("CHƯA được lưu");
    const history = await services.listSubmissions("delivery-time");
    expect(history.ok).toBe(false);
    if (!history.ok) {
      const markup = render(createElement(ChallengeHistoryPanel, { summary: SUMMARY, state: { status: "error", error: history.error } }));
      expect(markup).toContain("Không dùng được kho lưu trữ");
      expect(markup).toContain('role="alert"');
    }
  });

  it("keeps history across a reload: a new service set over the same database shows the saved submission", async () => {
    const factory = new IDBFactory();
    const first = makeServices(factory, { value: 0 });
    await first.services.submit("delivery-time", sampleCsv);
    await first.services.dispose();

    const second = makeServices(factory, { value: 10 });
    const [list, best] = await Promise.all([second.services.listSubmissions("delivery-time"), second.services.getBest("delivery-time")]);
    expect(list.ok && best.ok).toBe(true);
    if (list.ok && best.ok) {
      const markup = render(
        createElement(ChallengeHistoryPanel, { summary: SUMMARY, state: { status: "ready", value: { submissions: list.value, best: best.value } } }),
      );
      expect(markup).toContain("MAE 8.617");
      expect(markup).toContain("Tốt nhất");
    }
  });
});

describe("Challenge history and best score", () => {
  const panel = (state: Parameters<typeof ChallengeHistoryPanel>[0]["state"]) =>
    render(createElement(ChallengeHistoryPanel, { summary: SUMMARY, state }));

  it("has a loading state", () => {
    expect(panel({ status: "loading" })).toContain("Đang đọc lịch sử nộp bài");
  });

  it("has an empty state without a best score", () => {
    const markup = panel({ status: "ready", value: { submissions: [], best: null } });
    expect(markup).toContain("Chưa có bài nộp nào");
    expect(markup).not.toContain("Tốt nhất</span>");
    expect(markup).toContain("thấp hơn là tốt hơn");
  });

  it("lists submissions in the given order, marks exactly the best one, and shows time, metric and score", () => {
    const newest = submission({ id: "new", score: 5, submittedAt: "2026-10-27T12:00:00.000Z" });
    const best = submission({ id: "best", score: 1.5, submittedAt: "2026-10-27T11:00:00.000Z" });
    const oldest = submission({ id: "old", score: 9, submittedAt: "2026-10-27T10:00:00.000Z" });
    const markup = panel({ status: "ready", value: { submissions: [newest, best, oldest], best } });

    expect(markup.match(/Tốt nhất<\/span>/g)).toHaveLength(1);
    expect(markup).toContain("Điểm tốt nhất: <strong>1.500</strong>");
    expect(markup).toContain("2026-10-27 12:00 UTC");
    expect(markup.indexOf("MAE 5.000")).toBeLessThan(markup.indexOf("MAE 1.500"));
    expect(markup.indexOf("MAE 1.500")).toBeLessThan(markup.indexOf("MAE 9.000"));
    expect(markup).toContain("phiên bản 1");
  });

  it("buildHistoryRows preserves order and flags only the best id", () => {
    const rows = buildHistoryRows({
      submissions: [submission({ id: "a" }), submission({ id: "b" })],
      best: submission({ id: "b" }),
    });
    expect(rows.map((row) => [row.id, row.isBest])).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });
});

describe("Challenge view-model helpers", () => {
  it("formats scores and times independently of locale", () => {
    expect(formatScore("mae", 1.23456)).toBe("1.235");
    expect(formatScore("accuracy", 0.75)).toBe("75.0%");
    expect(formatSubmittedAt("2026-10-27T09:05:00.000Z")).toBe("2026-10-27 09:05 UTC");
  });

  it("validates an upload before it is read: .csv only and a size cap", () => {
    const max = SUMMARY.limits.maxSubmissionBytes;
    expect(validateUploadFile({ name: "predictions.csv", size: 100 }, max)).toBeNull();
    expect(validateUploadFile({ name: "PREDICTIONS.CSV", size: max }, max)).toBeNull();
    expect(validateUploadFile({ name: "predictions.txt", size: 100 }, max)).toMatchObject({ tone: "error", title: "Chỉ nhận tệp .csv" });
    expect(validateUploadFile({ name: "predictions.csv.exe", size: 100 }, max)).not.toBeNull();
    expect(validateUploadFile({ name: "csv", size: 100 }, max)).not.toBeNull();
    expect(validateUploadFile({ name: "big.csv", size: max + 1 }, max)).toMatchObject({ tone: "error", title: "Tệp quá lớn" });
  });

  it("describes every read error code with a title and the service message", () => {
    for (const code of ["NOT_FOUND", "CORRUPT", "STORAGE_UNAVAILABLE", "UPGRADE_BLOCKED", "RETIRED"] as const) {
      const described = describeReadError({ code, message: "m" });
      expect(described).toMatchObject({ tone: "error", detail: "m" });
      expect(described.title.length).toBeGreaterThan(3);
    }
  });
});

describe("Challenge detail page (container)", () => {
  function renderAt(path: string, services = makeServices().services): string {
    return render(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(ChallengeServicesProvider, {
          services,
          children: createElement(
            Routes,
            null,
            createElement(Route, { path: "/challenge/:challengeId", element: createElement(ChallengeDetailPage) }),
          ),
        }),
      ),
    );
  }

  it("renders the whole screen at once, with history still loading, and no solution label", () => {
    const markup = renderAt("/challenge/delivery-time");
    expect(markup).toContain("<h1");
    expect(markup).toContain("Dự đoán thời gian giao hàng");
    expect(markup).toContain(PRACTICE_NOT_EXAM_NOTE);
    expect(markup).toContain("Tải train.csv");
    expect(markup).toContain('id="challenge-editor"');
    expect(markup).toContain("Đang đọc lịch sử nộp bài");
    expectNoSolutionLabels(markup);
    expect(markup).not.toMatch(/bảng xếp hạng:|xếp hạng #/i);
  });

  it("shows a not-found state with a way back for an unknown challenge", () => {
    const markup = renderAt("/challenge/nope");
    expect(markup).toContain("Không tìm thấy thử thách");
    expect(markup).toContain('href="/challenge"');
    expect(markup).not.toContain('id="challenge-editor"');
  });

  it("is honest that this is practice and not a secure exam", () => {
    expect(PRACTICE_NOT_EXAM_NOTE).toContain("không phải kỳ thi bảo mật");
    expect(PRACTICE_NOT_EXAM_NOTE).not.toMatch(/bí mật tuyệt đối|không thể xem/i);
  });
});
