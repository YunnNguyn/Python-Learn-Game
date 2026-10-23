// PHASE-08 / M10 browser acceptance scenarios (QA tooling only - not part of the app).
//
// Everything here drives the REAL application in a REAL browser: the real Vite-served React
// app, real Monaco, the real Pyodide worker (including the real NumPy, pandas and Matplotlib
// wheels fetched from the official Pyodide CDN), the real MissionEngine, the real declarative
// grader and the real function-probe helper. Nothing is mocked and IndexedDB is only ever READ -
// all progress is produced by using the UI, exactly like a learner.
//
// Derived from ../m9-acceptance/scenarios.mjs (left untouched): the same validated editor / IndexedDB
// helpers (native clipboard paste, exact-draft polling, no asserting the whole content of Monaco's
// virtualized DOM) generalised from fifteen to twenty-six missions, plus the M10 additions: package
// readiness (pandas, Matplotlib), the plot preview, typed-value (DataFrame / Series / ndarray / figure)
// feedback, CSV workspaces and the M9 -> M10 hand-over.
//
// A scenario fills env.checks with { name, ok, detail } entries.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const DB = Object.freeze({
  learning: "python-learn-game",
  practice: "python-learn-game-practice",
  meta: "python-learn-game-meta",
});

export const COURSE = Object.freeze({
  python: "python-foundations",
  cs116: "python-ml-practice",
});

export const PF = Object.freeze(
  Array.from({ length: 26 }, (_, index) => `python-foundations.pf${String(index + 1).padStart(2, "0")}`),
);
export const PF_M8 = Object.freeze(PF.slice(0, 7));
export const PF_M9 = Object.freeze(PF.slice(7, 15));
export const PF_M10 = Object.freeze(PF.slice(15));
const pfName = (id) => "PF-" + id.slice(-2);

export const LESSON1 = "python-foundations.values-decisions";
export const LESSON2 = "python-foundations.collections-functions";
export const LESSON3 = "python-foundations.sequences-records";
export const LESSON4 = "python-foundations.functions-projects";
export const LESSON5 = "python-foundations.numpy-arrays";
export const LESSON6 = "python-foundations.numpy-shapes-axes";
export const LESSON7 = "python-foundations.pandas-frames";
export const LESSON8 = "python-foundations.pandas-cleaning";
export const LESSON9 = "python-foundations.matplotlib-charts";
export const LESSON10 = "python-foundations.data-workflows";
export const LESSON_IDS = Object.freeze([LESSON1, LESSON2, LESSON3, LESSON4, LESSON5, LESSON6, LESSON7, LESSON8, LESSON9, LESSON10]);
export const LESSON_SIZES = Object.freeze([3, 4, 3, 3, 2, 3, 2, 2, 2, 2]); // 26 activities
export const LESSON_TITLES = Object.freeze([
  "Bài 1 — Values & Decisions",
  "Bài 2 — Collections & Functions",
  "Bài 3 — Sequences & Records",
  "Bài 4 — Functions, Errors & Mini-project",
  "Bài 5 — NumPy Arrays",
  "Bài 6 — NumPy: Shapes, Axes & Preprocessing",
  "Bài 7 — pandas: DataFrame & Filtering",
  "Bài 8 — pandas: Cleaning & Aggregation",
  "Bài 9 — Matplotlib: Charts",
  "Bài 10 — Data Workflows",
]);
export const WORLD_TITLES = Object.freeze([
  "Python Foundations",
  "Collections & Intermediate Python",
  "Introduction to NumPy",
  "NumPy Advanced",
  "pandas",
  "Matplotlib",
  "Data Workflows",
]);
export const CS116_FIRST = "cs116.numpy.vs01";
export const CS116_SECOND = "cs116.numpy.vs02";

/** Starters, reference + deliberately wrong solutions of all 26 missions (a JSON copy of the TypeScript test data, kept in sync by qa-m10-fixture-sync.test.ts). */
export const SOLUTIONS = JSON.parse(fs.readFileSync(path.join(here, "fixtures", "solutions.json"), "utf8"));

const T = Object.freeze({
  ui: 30_000, // ordinary UI reaction
  boot: 240_000, // first Pyodide boot (the interpreter is fetched from the official CDN)
  run: 420_000, // one Run / Submit round trip (the first NumPy, pandas and Matplotlib missions also download their wheels)
  idb: 25_000, // an expected IndexedDB write (the draft debounce is 350 ms)
});

const norm = (text) => String(text ?? "").replace(/\u00a0/g, " ").replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
const lf = (text) => String(text ?? "").replace(/\r\n/g, "\n");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function makeChecker(list) {
  return (name, ok, detail = "") => {
    list.push({ name, ok: Boolean(ok), detail: String(detail) });
    return Boolean(ok);
  };
}

// ----------------------------------------------------------------------------- IndexedDB (read only)

/** Every store of the named databases (null when the database does not exist). Never creates a database. */
export async function dumpDatabases(page, names) {
  return page.evaluate(async (wanted) => {
    const known = (await indexedDB.databases()).map((d) => d.name);
    const out = {};
    for (const name of wanted) {
      if (!known.includes(name)) { out[name] = null; continue; }
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(name); // no version: never upgrades
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("open blocked: " + name));
      });
      try {
        const stores = {};
        for (const store of Array.from(db.objectStoreNames)) {
          stores[store] = await new Promise((resolve, reject) => {
            const request = db.transaction(store, "readonly").objectStore(store).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
        }
        out[name] = { version: db.version, stores };
      } finally { db.close(); }
    }
    return out;
  }, names);
}

export async function readStore(page, dbName, storeName) {
  const dump = (await dumpDatabases(page, [dbName]))[dbName];
  return dump?.stores?.[storeName] ?? [];
}

/** Polls IndexedDB (observation, not a fixed sleep) until `predicate(rows)` holds or the deadline passes. */
export async function waitForStore(page, dbName, storeName, predicate, ms = T.idb) {
  const deadline = Date.now() + ms;
  let rows = [];
  do {
    rows = await readStore(page, dbName, storeName);
    if (predicate(rows)) return { ok: true, rows };
    await sleep(250);
  } while (Date.now() < deadline);
  return { ok: false, rows };
}

const attemptsOf = async (page, activityId) =>
  (await readStore(page, DB.learning, "attempts")).filter((r) => r.activityId === activityId);
const draftsOf = async (page) => readStore(page, DB.learning, "missionDrafts");

/** The meta-progression state (inventory + reward history) as stored; null before it exists. */
async function metaState(page) {
  const rows = await readStore(page, DB.meta, "progressionState");
  return rows[0]?.state ?? null;
}

// ----------------------------------------------------------------------------- page helpers

async function settle(page) {
  await page.locator("main, #root").first().waitFor({ state: "visible", timeout: T.ui });
  await page.waitForLoadState("networkidle", { timeout: T.ui }).catch(() => undefined);
}

export async function editorText(page) {
  return norm(await page.evaluate(() => document.querySelector(".monaco-editor .view-lines")?.textContent ?? ""));
}

/** Everything on the page except the code editor (the learner's own code may share lines with an answer). */
async function pageTextWithoutEditor(page) {
  return page.evaluate(() => {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll(".python-editor, .monaco-editor, script, style").forEach((node) => node.remove());
    return (clone.textContent ?? "").replace(/\u00a0/g, " ");
  });
}

/** Lines of a reference solution that are substantial and not simply part of the starter scaffold or of the code just submitted. */
function secretLines(activityId, submittedCode = "") {
  const own = new Set(
    [SOLUTIONS[activityId].starter, submittedCode]
      .flatMap((text) => lf(text).split("\n"))
      .map((line) => norm(line.replace(/\s+#.*$/, ""))),
  );
  return lf(SOLUTIONS[activityId].reference)
    .split("\n")
    .map((line) => norm(line))
    .filter((line) => line.length >= 14 && !line.startsWith("#") && !line.startsWith("print(") && !own.has(line));
}

export async function openEditor(page) {
  const tab = page.getByRole("button", { name: "Làm bài", exact: true });
  await tab.waitFor({ state: "visible", timeout: T.boot });
  await tab.click();
  await page.locator(".monaco-editor").first().waitFor({ state: "visible", timeout: T.ui });
}

/**
 * Paste through the browser clipboard like a real learner (Ctrl+V).
 * A synthetic ClipboardEvent followed by insertText can flatten Python newlines
 * in Monaco; that tests the injection mechanism rather than the real editor.
 */
export async function setEditorCode(page, code) {
  const origin = new URL(page.url()).origin;
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  await page.evaluate(async (text) => {
    if (!navigator.clipboard?.writeText) {
      throw new Error("Browser Clipboard API unavailable in the QA context");
    }
    await navigator.clipboard.writeText(text);
  }, code);
  await page.locator(".monaco-editor .view-lines").first().click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
}

/** Event-driven wait for IndexedDB to hold EXACTLY `code` as the draft of the activity. */
async function waitExactDraft(page, activityId, code, ms = T.idb) {
  const started = Date.now();
  const timeline = [];
  for (;;) {
    const rows = await draftsOf(page);
    const row = rows.find((r) => r.activityId === activityId);
    const state = row === undefined ? "absent" : lf(row.code) === lf(code) ? "exact" : "other-code";
    if (timeline.at(-1)?.state !== state) timeline.push({ atMs: Date.now() - started, state });
    if (state === "exact") return { ok: true, ms: Date.now() - started, timeline };
    if (Date.now() - started >= ms) return { ok: false, ms: Date.now() - started, timeline };
    await sleep(100);
  }
}

/** Enters `code` in Monaco and waits until IndexedDB holds exactly that code (a UI "saved" message alone is never proof). */
async function enterCode(page, activityId, code) {
  await setEditorCode(page, code);
  const result = await waitExactDraft(page, activityId, code, T.idb);
  // The durable IDB code (including line breaks) is the authority. Monaco's
  // .view-lines.textContent flattens separate visual lines; it is diagnostic only.
  const row = (await draftsOf(page)).find((r) => r.activityId === activityId);
  return {
    ...result,
    how: "native-clipboard",
    expectedLines: lf(code).split("\n").length,
    storedLines: row ? lf(row.code).split("\n").length : null,
    editorHead: (await editorText(page).catch(() => "")).slice(0, 160),
  };
}

async function waitButtonsReady(page) {
  const run = page.getByRole("button", { name: /^Chạy thử/ });
  const submit = page.getByRole("button", { name: /^Nộp bài/ });
  await run.waitFor({ state: "visible", timeout: T.ui });
  const deadline = Date.now() + T.run;
  while (Date.now() < deadline) {
    if ((await run.isEnabled()) && (await submit.isEnabled())) return true;
    await sleep(250);
  }
  return false;
}

async function clickRun(page) {
  await page.getByRole("button", { name: /^Chạy thử/ }).click();
  let shown = true;
  try { await page.locator(".mission-result-status").first().waitFor({ state: "visible", timeout: T.run }); } catch { shown = false; }
  // The previous Run's result stays on screen until the new one replaces it, so "a result is visible" alone can return while this
  // Run is still going (and the editor is still read-only). A finished Run is: result visible AND the controls usable again.
  if (shown && !(await waitButtonsReady(page))) shown = false;
  return shown;
}

/**
 * Clicks Submit and waits until THIS Submit is finished: the new attempt is stored in IndexedDB and the controls are
 * usable again. (The previous Submit's feedback stays on screen until the new one replaces it, so "a feedback is
 * visible" alone would read a stale result.) Returns "passed" | "failed" | "none".
 */
async function clickSubmit(page, activityId) {
  const before = (await attemptsOf(page, activityId)).length;
  await page.getByRole("button", { name: /^Nộp bài/ }).click();
  const stored = await waitForStore(page, DB.learning, "attempts", (rows) => rows.filter((r) => r.activityId === activityId).length === before + 1, T.run);
  if (!stored.ok) return "none";
  if (!(await waitButtonsReady(page))) return "none";
  const row = stored.rows.filter((r) => r.activityId === activityId).at(-1);
  // The page shows the verdict of the attempt that was just stored.
  const verdict = row.passed ? ".grading-feedback--passed" : ".grading-feedback--failed";
  try { await page.locator(verdict).first().waitFor({ state: "visible", timeout: T.ui }); } catch { return "none"; }
  return row.passed ? "passed" : "failed";
}
// ----------------------------------------------------------------------------- M10 helpers

/**
 * The feedback items as the learner sees them: for every `<li class="grading-feedback__item">` the title (h4),
 * the detail line, the "Cần" (expected) and "Hiện tại" (actual) values, and the per-case rows.
 */
async function feedbackItems(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll(".grading-feedback__item")).map((item) => {
      const meta = {};
      item.querySelectorAll(".grading-feedback__metadata > div").forEach((row) => {
        meta[row.querySelector("dt")?.textContent?.trim() ?? "?"] = row.querySelector("dd code")?.textContent ?? "";
      });
      return {
        title: item.querySelector("h4")?.textContent?.trim() ?? "",
        detail: item.querySelector(".grading-feedback__detail")?.textContent?.trim() ?? "",
        expected: meta["Cần"],
        actual: meta["Hiện tại"],
        cases: Array.from(item.querySelectorAll(".grading-feedback__case")).map((row) => ({
          passed: row.className.includes("--passed"),
          label: (row.textContent ?? "").replace(/^[✓✗]\s*/, "").replace(/^(Đạt|Chưa đạt):\s*/, "").trim(),
        })),
      };
    }),
  );
}

const itemOf = (items, functionName) => items.find((item) => item.title.includes(`“${functionName}”`) && /ca kiểm tra/.test(item.title));
/** A typed-value (DataFrame / Series / ndarray / figure) item: "Biến “name” chưa khớp yêu cầu." */
const itemOfVar = (items, variable) => items.find((item) => item.title.startsWith(`Biến “${variable}”`));
const passedOf = (item) => Number(/đạt (\d+)\/(\d+) ca/.exec(item?.title ?? "")?.[1] ?? NaN);
const totalOf = (item) => Number(/đạt (\d+)\/(\d+) ca/.exec(item?.title ?? "")?.[2] ?? NaN);
const literalOf = (text) => (text === undefined || text.includes("…") ? null : text.replace(/^[A-Za-z_][A-Za-z0-9_]*: /, ""));

const pill = (page, title) =>
  page.locator("article.learning-card", { has: page.getByRole("heading", { name: title, exact: false }) }).locator(".progress-pill").first();

/**
 * The plots a Run renders from the learner's open Matplotlib figures (the app shows them as <img> under "File đầu ra").
 * Waits until at least `minCount` images exist and every one has really decoded (images are lazy: each is scrolled into view).
 */
async function waitPreviews(page, minCount, diag, ms = T.ui) {
  const deadline = Date.now() + ms;
  let list = [];
  do {
    const images = page.locator("img.mission-workspace-files__image");
    const count = await images.count();
    for (let i = 0; i < count; i += 1) await images.nth(i).scrollIntoViewIfNeeded().catch(() => undefined);
    list = await page.evaluate(() =>
      Array.from(document.querySelectorAll("img.mission-workspace-files__image")).map((img) => {
        const src = img.getAttribute("src") ?? "";
        return {
          head: src.slice(0, 22),
          alt: img.alt,
          loaded: img.complete && img.naturalWidth > 0 && img.naturalHeight > 0,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          width: Math.round(img.getBoundingClientRect().width),
          kb: Math.round((src.length * 3) / 4 / 1024),
        };
      }),
    );
    if (list.length >= minCount && list.every((p) => p.loaded)) break;
    await sleep(250);
  } while (Date.now() < deadline);
  if (diag && list.length > 0 && list.every((p) => p.loaded)) diag.plotPreviews = (diag.plotPreviews ?? 0) + list.length;
  return list;
}

const previewCount = (page) => page.locator("img.mission-workspace-files__image").count();
/** Waits until no plot preview is on screen (the previous run's result stays visible until the new one replaces it). */
async function waitNoPreviews(page, ms = T.run) {
  const deadline = Date.now() + ms;
  for (;;) {
    const count = await previewCount(page);
    if (count === 0 || Date.now() >= deadline) return count;
    await sleep(250);
  }
}
const previewsAreValid = (list) =>
  list.length >= 1 && list.length <= 4 &&
  list.every((p) => p.head === "data:image/png;base64," && p.loaded && /^Biểu đồ \d+ do mã của bạn vẽ$/.test(p.alt) && p.kb <= 400);

/** The learning cards of a lesson page once the list has stopped growing (cards render one by one). */
async function stableCardClasses(page) {
  let previous = -1;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const classes = await page.locator("article.learning-card").evaluateAll((nodes) => nodes.map((node) => node.className));
    if (classes.length === previous && classes.length > 0) return classes;
    previous = classes.length;
    await sleep(150);
  }
  return page.locator("article.learning-card").evaluateAll((nodes) => nodes.map((node) => node.className));
}

/** Names of the dataset files listed by the workspace panel ("Dữ liệu" group). */
async function datasetFiles(page) {
  return page.evaluate(() => {
    const group = Array.from(document.querySelectorAll(".mission-workspace-files__group")).find((g) => g.querySelector("h2")?.textContent?.trim() === "Dữ liệu");
    return Array.from(group?.querySelectorAll("li strong") ?? []).map((n) => n.textContent?.trim() ?? "");
  });
}

/** Opens the "Dữ liệu" tab, reads the variables handed to the learner, and returns to the editor. */
async function readMissionData(page) {
  await page.getByRole("button", { name: "Dữ liệu", exact: true }).click();
  await page.locator(".mission-data-list").waitFor({ state: "visible", timeout: T.ui });
  const text = norm(await page.locator(".mission-data-list").innerText());
  await page.getByRole("button", { name: "Làm bài", exact: true }).click();
  return text;
}

async function openMissionAgain(page, base, activityId) {
  await page.goto(base + `/mission/${activityId}`);
  await page.waitForURL(`**/mission/${activityId}`, { timeout: T.ui });
  await openEditor(page);
  await waitButtonsReady(page);
}

async function openFirstMission(page, base) {
  await page.goto(base + "/learn");
  await settle(page);
  await page.locator(`article[data-course-id="${COURSE.python}"] [data-testid="course-continue"]`).click();
  await page.waitForURL(`**/activity/${PF[0]}`, { timeout: T.ui });
  await page.getByRole("link", { name: "Bắt đầu thực hành" }).click();
  await page.waitForURL(`**/mission/${PF[0]}`, { timeout: T.ui });
}

/** The graded wrong solution to submit for a mission, and the name the feedback must mention. */
function wrongOf(activityId) {
  const wrong = SOLUTIONS[activityId].wrong.find((w) => w.raises === undefined);
  const needle = wrong.fails.length > 0 ? wrong.fails[0] : wrong.failsFunctions[0];
  return { wrong, needle };
}

const namedWrong = (activityId, name) => {
  const found = SOLUTIONS[activityId].wrong.find((w) => w.name === name);
  if (!found) throw new Error(`fixture has no wrong solution named “${name}” for ${activityId}`);
  return found;
};

/** Enter `code`, Submit, and read what the learner sees. `ok` is false when the code never reached IndexedDB. */
async function submitCode(page, activityId, code) {
  const entered = await enterCode(page, activityId, code);
  if (!entered.ok) return { ok: false, entered, outcome: "none", items: [], text: "" };
  const outcome = await clickSubmit(page, activityId);
  const items = await feedbackItems(page);
  const text = outcome === "failed" ? await page.locator(".grading-feedback--failed").first().innerText() : "";
  return { ok: true, entered, outcome, items, text };
}

/** Ends a mission section the way a learner would: the reference passes (and the draft is removed again). */
async function finishWithReference(page, activityId, check) {
  const entered = await enterCode(page, activityId, SOLUTIONS[activityId].reference);
  check(`[${pfName(activityId)}] the reference solution reached IndexedDB`, entered.ok, entered.ok ? "" : JSON.stringify(entered));
  if (!entered.ok) return;
  check(`[${pfName(activityId)}] the reference solution passes`, (await clickSubmit(page, activityId)) === "passed");
}

// ----------------------------------------------------------------------------- A. Discovery, structure, locked states

export async function scenarioA(env) {
  const { page, base, checks, shot, screenshots } = env;
  const check = makeChecker(checks);

  // --- /learn lists both courses and offers one obvious "continue" action for each
  await page.goto(base + "/learn");
  await settle(page);
  const card = page.locator(`article[data-course-id="${COURSE.python}"]`);
  check("/learn lists the Python Foundations course next to the existing course",
    (await card.count()) === 1 && (await page.locator(`article[data-course-id="${COURSE.cs116}"]`).count()) === 1);
  const cont = card.locator('[data-testid="course-continue"]');
  check("the course card has a primary 'start' action naming PF-01 (a fresh profile starts at the beginning)", (await cont.innerText()).startsWith("Bắt đầu:") && (await cont.innerText()).includes("PF-01"), await cont.innerText());
  check("each course has its own continue action (CS116 starts at VS-01, not at Python)",
    (await page.locator(`article[data-course-id="${COURSE.cs116}"] [data-testid="course-continue"]`).getAttribute("href")) === `/activity/${CS116_FIRST}`);
  check("the Python Foundations card counts 26 activities (7 + 8 + 11), none done", /0\/26/.test(await card.locator(".progress-pill").innerText()), await card.locator(".progress-pill").innerText());
  screenshots.push(await shot(page, "A-learn"));

  // --- course page: seven worlds, ten lessons, in order
  await card.getByRole("link", { name: "Mở khóa học" }).click();
  await page.waitForURL(`**/course/${COURSE.python}`, { timeout: T.ui });
  await page.getByRole("heading", { level: 1 }).first().waitFor({ state: "visible", timeout: T.ui });
  check("/course/python-foundations opens", /Python Foundations/.test(await page.getByRole("heading", { level: 1 }).first().innerText()));
  check("the course page offers the same continue action", (await page.locator('[data-testid="course-continue"]').getAttribute("href")) === `/activity/${PF[0]}`);
  const worldTitles = await page.locator("article.learning-card h2").allInnerTexts();
  check("the course page lists the original world, the two M9 worlds and the four M10 worlds, in order", JSON.stringify(worldTitles.map((t) => t.trim())) === JSON.stringify(WORLD_TITLES), JSON.stringify(worldTitles));
  const lessonLinks = await page.locator(".learning-card__links a").allInnerTexts();
  check("all ten lessons are listed in order with their progress (3+4+3+3+2+3+2+2+2+2 = 26 activities)",
    lessonLinks.length === 10 && LESSON_SIZES.every((size, index) => lessonLinks[index].includes(LESSON_TITLES[index]) && lessonLinks[index].includes(`0/${size}`)), JSON.stringify(lessonLinks));
  screenshots.push(await shot(page, "A-course"));

  // --- lesson 1: first activity available, the rest locked
  await page.getByRole("link", { name: /Values & Decisions/ }).click();
  await page.waitForURL(`**/lesson/${LESSON1}`, { timeout: T.ui });
  await page.locator("article.learning-card").first().waitFor({ state: "visible", timeout: T.ui });
  const cards = await stableCardClasses(page);
  check("lesson 1 lists its three activities", cards.length === 3, JSON.stringify(cards));
  check("PF-01 is available and the rest are locked on a fresh profile",
    cards.length === 3 && !cards[0].includes("locked") && cards[1].includes("locked") && cards[2].includes("locked"), JSON.stringify(cards));
  check("the lesson links back to its course", (await page.locator('[data-testid="lesson-course-link"]').getAttribute("href")) === `/course/${COURSE.python}`);

  // --- the M9 and M10 lessons exist, are listed with their activities, and are ALL locked before the previous one is finished
  const later = [[LESSON3, 3, 7], [LESSON4, 3, 10], [LESSON5, 2, 13], [LESSON6, 3, 15], [LESSON7, 2, 18], [LESSON8, 2, 20], [LESSON9, 2, 22], [LESSON10, 2, 24]];
  for (const [lessonId, count, first] of later) {
    await page.goto(base + `/lesson/${lessonId}`);
    await page.locator("article.learning-card").first().waitFor({ state: "visible", timeout: T.ui });
    const lessonCards = page.locator("article.learning-card");
    const classes = await stableCardClasses(page);
    check(`lesson ${lessonId.split(".")[1]} lists its ${count} activities, all locked on a fresh profile`, classes.length === count && classes.every((c) => c.includes("locked")), JSON.stringify(classes));
    check(`... the first one (${pfName(PF[first])}) says which activity unlocks it`, (await lessonCards.nth(0).innerText()).includes(pfName(PF[first - 1])), (await lessonCards.nth(0).locator(".learning-card__stage").innerText()));
    check(`... the lesson links back to the SAME course`, (await page.locator('[data-testid="lesson-course-link"]').getAttribute("href")) === `/course/${COURSE.python}`);
  }
  screenshots.push(await shot(page, "A-lesson-pandas"));

  // --- direct URLs: the same rules as the UI
  await page.goto(base + `/activity/${PF[1]}`);
  await settle(page);
  check("/activity/<PF-02> shows the locked panel (and no way to start)", (await page.locator(".activity-locked-panel").count()) === 1 && (await page.getByRole("link", { name: /thực hành/ }).count()) === 0);
  for (const id of [PF[1], PF[7], PF[13], PF[15], PF[18], PF[22], PF[24]]) {
    await page.goto(base + `/mission/${id}`);
    await page.getByRole("heading", { name: "Không thể mở nhiệm vụ" }).waitFor({ state: "visible", timeout: T.ui * 2 });
    check(`/mission/<${pfName(id)}> is refused by the service layer, not just hidden`, (await page.locator("main, #root").first().innerText()).includes("Hoàn thành"));
    check(`... and the refusal links back into the SAME course`, (await page.locator(".mission-error-back-link").getAttribute("href")).includes("python-foundations"), await page.locator(".mission-error-back-link").getAttribute("href"));
  }
  await page.goto(base + `/mission/${CS116_SECOND}`);
  await page.getByRole("heading", { name: "Không thể mở nhiệm vụ" }).waitFor({ state: "visible", timeout: T.ui * 2 });
  check("CS116's second activity is locked too, and its refusal sends the learner back into CS116, not Python Foundations",
    !(await page.locator(".mission-error-back-link").getAttribute("href")).includes("python-foundations"), await page.locator(".mission-error-back-link").getAttribute("href"));
  check("no mission was started by any of these refusals (no attempt, no draft)",
    (await readStore(page, DB.learning, "attempts")).length === 0 && (await draftsOf(page)).length === 0);

  // --- unknown routes degrade gracefully
  await page.goto(base + "/course/no-such-course");
  const noCourse = await page.getByRole("heading", { name: "Không tìm thấy khóa học" }).waitFor({ state: "visible", timeout: T.ui }).then(() => true, () => false);
  await page.goto(base + "/lesson/no-such-lesson");
  const noLesson = await page.getByRole("heading", { name: "Không tìm thấy bài học" }).waitFor({ state: "visible", timeout: T.ui }).then(() => true, () => false);
  check("unknown course / lesson ids show a clear 'not found' page", noCourse && noLesson, JSON.stringify({ noCourse, noLesson }));
}

// ----------------------------------------------------------------------------- B / C / D. Playing the missions

const HINT_MISSIONS = new Set([1, 9, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]); // PF-02, PF-10 and every M10 mission: H1 is a concept and carries no code span
const REWARD_MISSIONS = new Set([0, 7, 15]); // first pass of a course, of the M9 block and of the M10 block
const F5_MISSIONS = new Set([9, 24]); // PF-10 (M9) and PF-25 (M10, with CSV files)
const PLOT_MISSIONS = new Set([22, 25]); // PF-23 and PF-26: the reference solution draws and the plot must be previewed
const PF24 = 23;

/**
 * One mission, end to end like a learner: open, Run (no grade), Submit the starter (not passed), Submit a wrong
 * solution (feedback names the real mistake, nothing of the answer leaks), Submit the reference (passed, draft
 * removed, next mission unlocked and offered in the SAME course).
 *
 * M10 additions: package readiness for pandas and Matplotlib, CSV files listed in the workspace, the PNG preview of the
 * learner's plot after Run (and no stale preview afterwards), and the M9 -> M10 hand-over.
 */
async function playMission(env, index, hooks = {}) {
  const { page, base, diag, checks, shot, screenshots } = env;
  const check = makeChecker(checks);
  const activityId = PF[index];
  const label = `[${pfName(activityId)}]`;
  const solutions = SOLUTIONS[activityId];
  const isLast = index === PF.length - 1;
  await page.waitForURL(`**/mission/${activityId}`, { timeout: T.ui });

  await openEditor(page);
  const badge = ((await page.locator(".mission-runtime-badge").first().textContent({ timeout: T.boot })) ?? "").trim();
  if (badge !== "Pyodide") diag.localPythonBadge += 1;
  check(`${label} the workspace shows the Pyodide runtime (no Local Python)`, badge === "Pyodide", badge);
  // Monaco virtualizes its line DOM: check the visible opening line AND the complete starter persisted by the
  // real editor via autosave, never the viewport text alone.
  const starter = await editorText(page);
  const expectedStarter = lf(solutions.starter);
  const firstStarterLine = expectedStarter.split("\n").find((line) => line.trim())?.trim() ?? "";
  const storedStarter = await waitForStore(
    page, DB.learning, "missionDrafts",
    (rows) => rows.some((row) => row.activityId === activityId && lf(row.code) === expectedStarter),
    T.idb,
  );
  check(`${label} Monaco shows its starter and autosaves the complete TODO scaffold`,
    firstStarterLine.length > 0 && starter.includes(firstStarterLine) && expectedStarter.includes("TODO") && storedStarter.ok,
    JSON.stringify({ visibleHead: starter.slice(0, 120), firstStarterLine, exactDraftPersisted: storedStarter.ok, draftsForActivity: storedStarter.rows.filter((row) => row.activityId === activityId).length }));
  check(`${label} Run and Submit are available`, await waitButtonsReady(page));
  screenshots.push(await shot(page, `B-${pfName(activityId).toLowerCase()}-opened`));

  // Run: real Python, no attempt, no reward, no grading
  const metaBefore = JSON.stringify((await metaState(page))?.inventory ?? null);
  const attemptsBefore = (await attemptsOf(page, activityId)).length;
  check(`${label} Run executes the starter in the real runtime`, await clickRun(page));
  check(`${label} Run shows no grade`, (await page.locator(".grading-feedback").count()) === 0);
  check(`${label} Run records nothing: no attempt, no reward`,
    (await attemptsOf(page, activityId)).length === attemptsBefore && JSON.stringify((await metaState(page))?.inventory ?? null) === metaBefore);
  check(`${label} the runtime is ready again after Run`, await waitButtonsReady(page));

  // M10: the CSV files of the workspace are listed (PF-25 two files, PF-26 one file)
  if (index === 24 || index === 25) {
    const files = await datasetFiles(page);
    const wanted = index === 24 ? 2 : 1;
    check(`${label} the workspace lists the CSV file(s) the mission reads from data/`, files.length >= wanted && files.every((name) => /\.csv$/i.test(name)), JSON.stringify(files));
  }
  // M10: PF-24 starts from runnable-but-misleading charts that Run must show; PF-23 starts without any figure
  if (index === PF24) {
    const shown = await waitPreviews(page, 1, diag, T.run);
    check(`${label} Run on the buggy starter previews its (misleading) charts as PNG images`, previewsAreValid(shown), JSON.stringify(shown));
  }
  if (index === 22) {
    check(`${label} the untouched starter draws nothing, so Run shows no plot preview`, (await previewCount(page)) === 0);
  }

  // Hints: H1 opens, and a hint is a concept, not the answer
  if (HINT_MISSIONS.has(index)) {
    await page.getByRole("button", { name: /^Mở gợi ý tiếp theo/ }).click();
    await page.locator(".mission-hint-item").first().waitFor({ state: "visible", timeout: T.ui });
    const hintText = await page.locator(".mission-hint-item").first().innerText();
    check(`${label} H1 opens and carries no code`, /^H1/.test(hintText) && (await page.locator(".mission-hint-item code").count()) === 0, hintText.slice(0, 80));
  }

  // Submit the starter: not passed; a debug mission reports the real Python error
  check(`${label} Submit of the starter is graded NOT passed`, (await clickSubmit(page, activityId)) === "failed");
  const starterFeedback = await page.locator(".grading-feedback--failed").first().innerText();
  if (activityId === PF[2] || activityId === PF[11]) check(`${label} the debug mission reports the real TypeError`, /TypeError/.test(starterFeedback), starterFeedback.slice(0, 160));
  const starterItems = await feedbackItems(page);
  const afterFail = await waitForStore(page, DB.learning, "attempts", (rows) => rows.filter((r) => r.activityId === activityId).length === attemptsBefore + 1);
  const failedRow = afterFail.rows.filter((r) => r.activityId === activityId).at(-1);
  check(`${label} the failed attempt is stored (passed=false)`, afterFail.ok && failedRow?.passed === false);
  check(`${label} a failed Submit offers no next step`, (await page.locator(".mission-next-step").count()) === 0);
  check(`${label} no reward for a failed Submit`, !JSON.stringify((await metaState(page))?.rewardHistory ?? []).includes(failedRow?.id ?? "no-attempt"));

  // Mid-course (M8): leave and come back while the mission is "in progress"
  if (index === 3) {
    await page.goto(base + `/lesson/${LESSON2}`);
    await page.locator("article.learning-card").first().waitFor({ state: "visible", timeout: T.ui });
    const states = await page.locator("article.learning-card .progress-pill").allInnerTexts();
    check(`${label} lesson 2 shows completed / in-progress / locked: PF-04 'Đang luyện', PF-05..PF-07 'Chưa mở'`,
      states.length === 4 && states[0].trim() === "Đang luyện" && states.slice(1).every((s) => s.trim() === "Chưa mở"), JSON.stringify(states));
    await page.goto(base + `/course/${COURSE.python}`);
    await page.locator('[data-testid="course-continue"]').waitFor({ state: "visible", timeout: T.ui });
    const resume = await page.locator('[data-testid="course-continue"]').innerText();
    check(`${label} the course's continue action resumes PF-04 ("Tiếp tục:")`, resume.startsWith("Tiếp tục:") && resume.includes("PF-04"), resume);
    await page.locator('[data-testid="course-continue"]').click();
    await page.getByRole("link", { name: "Tiếp tục thực hành" }).click();
    await page.waitForURL(`**/mission/${activityId}`, { timeout: T.ui });
    await openEditor(page);
    check(`${label} the work in progress (the starter) is still there after leaving`, (await editorText(page)).includes("TODO"));
    check(`${label} buttons ready after returning`, await waitButtonsReady(page));
  }

  // An incorrect-but-plausible solution names the variable / function that is wrong
  const { wrong, needle } = wrongOf(activityId);
  const secrets = secretLines(activityId, wrong.code);
  const enteredWrong = await enterCode(page, activityId, wrong.code);
  check(`${label} an incorrect solution reached Monaco and IndexedDB (${enteredWrong.how})`, enteredWrong.ok, enteredWrong.ok ? "" : JSON.stringify(enteredWrong));
  if (!enteredWrong.ok) throw new Error(`${label} the incorrect code was not durably stored exactly; aborting dependent grading checks`);

  // Autosave + F5 in the middle of a mission: the exact draft, the same variant, the same data (and the same CSV files).
  if (F5_MISSIONS.has(index)) {
    const rowBefore = (await draftsOf(page)).find((r) => r.activityId === activityId);
    const dataBefore = await readMissionData(page);
    const filesBefore = index === 24 ? JSON.stringify(await datasetFiles(page)) : "";
    check(`${label} the draft record stores the seed and variant of the mission being solved`, typeof rowBefore?.seed === "string" && rowBefore.seed.length > 0 && Number.isInteger(rowBefore?.variantIndex), JSON.stringify({ seed: rowBefore?.seed, variantIndex: rowBefore?.variantIndex }));
    await page.waitForFunction(() => /Đã lưu bản nháp\./.test(document.body.innerText), undefined, { timeout: T.idb });
    check(`${label} the page says "Đã lưu bản nháp."`, true);
    await page.reload();
    await settle(page);
    await openEditor(page);
    check(`${label} F5 restores the learner's code`, (await editorText(page)).includes(norm(lf(wrong.code).split("\n").find((l) => l.trim()) ?? "")), (await editorText(page)).slice(0, 120));
    check(`${label} ... and says so`, (await page.locator(".mission-draft-notice").allInnerTexts()).some((t) => t.includes("Đã khôi phục bản nháp")));
    const rowAfter = (await draftsOf(page)).find((r) => r.activityId === activityId);
    check(`${label} F5 restores the same variant (same seed, same data)`, rowAfter?.variantIndex === rowBefore.variantIndex && rowAfter?.seed === rowBefore.seed && lf(rowAfter.code) === lf(wrong.code));
    check(`${label} the mission data shown to the learner is unchanged by F5`, dataBefore === (await readMissionData(page)));
    if (index === 24) {
      await waitButtonsReady(page);
      await clickRun(page); // the file list belongs to the workspace of a run
      const filesAfter = JSON.stringify(await datasetFiles(page));
      check(`${label} ... and so are the CSV files staged for it (the fixed CSV variant is stored with the draft)`, filesBefore !== "[]" && filesBefore === filesAfter, JSON.stringify({ filesBefore, filesAfter }));
    }
    check(`${label} F5 left no extra attempt`, (await attemptsOf(page, activityId)).length === attemptsBefore + 1);
    check(`${label} buttons ready after F5`, await waitButtonsReady(page));
  }

  check(`${label} the incorrect solution is graded NOT passed`, (await clickSubmit(page, activityId)) === "failed");
  const wrongFeedback = await page.locator(".grading-feedback--failed").first().innerText();
  check(`${label} the feedback names the real mistake “${needle}”`, wrongFeedback.includes(needle), wrongFeedback.slice(0, 200));
  check(`${label} the feedback does not print the reference solution`, secrets.every((line) => !norm(wrongFeedback).includes(line)));
  check(`${label} the next activity is still locked (no 'next step' panel)`, (await page.locator(".mission-next-step").count()) === 0);
  const visibleText = norm(await pageTextWithoutEditor(page));
  const leaked = secrets.filter((line) => visibleText.includes(line));
  check(`${label} no reference-solution line appears anywhere on the page before a pass`, leaked.length === 0, JSON.stringify(leaked));
  check(`${label} controls usable again`, await waitButtonsReady(page));

  // The reference solution passes
  const enteredRef = await enterCode(page, activityId, solutions.reference);
  check(`${label} the reference solution is stored as the draft (${enteredRef.how})`, enteredRef.ok, enteredRef.ok ? "" : JSON.stringify(enteredRef));
  if (!enteredRef.ok) throw new Error(`${label} the reference code was not durably stored exactly; aborting dependent grading checks`);

  // M10 plot missions: Run (exploration) shows the learner's own figures as PNG previews, records nothing, and a
  // later Run of code that draws nothing clears the old previews (no stale picture of a previous run).
  if (PLOT_MISSIONS.has(index)) {
    const attemptsNow = (await attemptsOf(page, activityId)).length;
    check(`${label} Run of the reference draws and finishes`, await clickRun(page));
    const shown = await waitPreviews(page, 1, diag, T.run);
    check(`${label} the learner's plot is previewed: PNG data URL, decoded, at most 4 images, each at most 400 KB, labelled “Biểu đồ N do mã của bạn vẽ”`, previewsAreValid(shown), JSON.stringify(shown));
    check(`${label} Run with a plot records nothing (no attempt)`, (await attemptsOf(page, activityId)).length === attemptsNow);
    screenshots.push(await shot(page, `B-${pfName(activityId).toLowerCase()}-preview`));
    if (index === 22) {
      const enteredStarter = await enterCode(page, activityId, solutions.starter);
      check(`${label} the untouched starter was typed again (${enteredStarter.how})`, enteredStarter.ok, enteredStarter.ok ? "" : JSON.stringify(enteredStarter));
      check(`${label} Run of code that draws nothing finishes`, await clickRun(page));
      check(`${label} ... and the previous run's plot is gone (no stale preview)`, (await waitNoPreviews(page)) === 0);
      const again = await enterCode(page, activityId, solutions.reference);
      check(`${label} the reference was typed again for Submit`, again.ok, again.ok ? "" : JSON.stringify(again));
      if (!again.ok) throw new Error(`${label} the reference code was not durably stored exactly; aborting`);
    }
    await waitButtonsReady(page);
  }

  const passedOutcome = await clickSubmit(page, activityId);
  check(`${label} the reference solution is graded passed`, passedOutcome === "passed");
  if (passedOutcome === "passed") {
    check(`${label} the feedback says "Đạt"`, (await page.locator(".grading-feedback__status").first().innerText()).trim() === "Đạt");
  }
  const afterPass = await waitForStore(page, DB.learning, "attempts", (rows) => rows.filter((r) => r.activityId === activityId && r.passed === true).length === 1);
  check(`${label} exactly one passing attempt is stored`, afterPass.ok);
  check(`${label} the UI confirms the saved passing attempt`, (await page.locator(".mission-attempt-evidence").first().innerText()).includes("Kết quả đạt yêu cầu"));
  const draftGone = await waitForStore(page, DB.learning, "missionDrafts", (rows) => !rows.some((r) => r.activityId === activityId), T.idb);
  check(`${label} the passed Submit removed this mission's draft`, draftGone.ok);
  screenshots.push(await shot(page, `B-${pfName(activityId).toLowerCase()}-passed`));

  const nextPanel = page.locator(".mission-next-step");
  await nextPanel.waitFor({ state: "visible", timeout: T.ui });
  const nextTitle = await nextPanel.locator("h2").innerText();
  if (!isLast) {
    check(`${label} the next activity is unlocked and offered ("Đã mở hoạt động tiếp theo")`, /Đã mở hoạt động tiếp theo/.test(nextTitle), nextTitle);
    check(`${label} the next-step link stays in this course (${pfName(PF[index + 1])})`, (await nextPanel.getByRole("link", { name: "Làm tiếp" }).getAttribute("href")) === `/mission/${PF[index + 1]}`);
    if (index === 6 || index === 14) {
      const next = pfName(PF[index + 1]);
      check(`${label} ${pfName(activityId)} no longer ends the course: it hands over to ${next}`, !/hoàn thành khóa học/.test(nextTitle) && (await nextPanel.innerText()).includes(next), (await nextPanel.innerText()).slice(0, 120));
    }
  } else {
    check(`${label} the last mission ends the course ("Bạn đã hoàn thành khóa học này") without leaving it`, /Bạn đã hoàn thành khóa học này/.test(nextTitle) && (await nextPanel.getByRole("link", { name: "Làm tiếp" }).count()) === 0);
  }

  // First pass of a block: the reward is earned once, a repeated pass earns none
  if (REWARD_MISSIONS.has(index)) {
    const grants = ((await metaState(page))?.rewardHistory ?? []).filter((g) => g.sourceActivityId === activityId && g.reason === "FIRST_ACTIVITY_PASS");
    check(`${label} the first pass earned the first-pass reward exactly once`, grants.length === 1, JSON.stringify(grants.map((g) => g.reason)));
    await waitButtonsReady(page);
    const second = await clickSubmit(page, activityId);
    const after = ((await metaState(page))?.rewardHistory ?? []).filter((g) => g.sourceActivityId === activityId && g.reason === "FIRST_ACTIVITY_PASS");
    check(`${label} submitting the same passing code again is graded passed but earns no second first-pass reward`, second === "passed" && after.length === 1, `${second}, rewards=${after.length}`);
  }

  // The real packages are requested from the official Pyodide CDN the first time a mission needs them
  const fetched = (pattern) => diag.pyodideCdn.some((u) => pattern.test(u));
  const sample = (pattern) => JSON.stringify([...new Set(diag.pyodideCdn.filter((u) => pattern.test(u)))].slice(0, 3));
  if (index === 13) check(`${label} NumPy ran for real: the NumPy package was fetched from the official Pyodide CDN`, fetched(/numpy/i), sample(/numpy/i));
  if (index === 18) check(`${label} pandas ran for real: the pandas package was fetched from the official Pyodide CDN`, fetched(/pandas/i), sample(/pandas/i));
  if (index === 22) check(`${label} Matplotlib ran for real: the Matplotlib package was fetched from the official Pyodide CDN`, fetched(/matplotlib/i), sample(/matplotlib/i));

  if (hooks.after) await hooks.after({ index, activityId, starterItems });

  // Continue inside the same course via the offered link (hooks.stay: remain on this page, e.g. to keep the next mission unopened)
  if (hooks.stay) {
    return;
  }
  if (!isLast) {
    await nextPanel.getByRole("link", { name: "Làm tiếp" }).click();
  } else {
    await nextPanel.getByRole("link", { name: "Về khóa học" }).click();
    await page.waitForURL(`**/course/${COURSE.python}`, { timeout: T.ui });
  }
}

/** B: the seven M8 missions (legacy contract) and the hand-over to PF-08. */
export async function scenarioB(env) {
  const { page, base, diag, checks, shot, screenshots } = env;
  const check = makeChecker(checks);

  await openFirstMission(page, base);
  const workersBefore = diag.workers.filter((w) => /pyodide/i.test(w.url)).length;
  for (let index = 0; index < PF_M8.length; index += 1) await playMission(env, index);
  const started = diag.workers.filter((w) => /pyodide/i.test(w.url)).length - workersBefore;
  check("real Pyodide workers were started for the seven M8 missions", started >= PF_M8.length, `workers: ${started}`);

  // --- end state as the learner sees it: M8 done, the course is NOT over
  await page.goto(base + `/lesson/${LESSON1}`);
  await page.locator("article.learning-card").first().waitFor({ state: "visible", timeout: T.ui });
  const l1 = await page.locator("article.learning-card .progress-pill").allInnerTexts();
  await page.goto(base + `/lesson/${LESSON2}`);
  await page.locator("article.learning-card").first().waitFor({ state: "visible", timeout: T.ui });
  const l2 = await page.locator("article.learning-card .progress-pill").allInnerTexts();
  check("both M8 lessons show every activity completed", l1.length === 3 && l2.length === 4 && [...l1, ...l2].every((s) => s.trim() === "Đã hoàn thành"), JSON.stringify([l1, l2]));
  await page.goto(base + `/course/${COURSE.python}`);
  await page.locator('[data-testid="course-continue"]').waitFor({ state: "visible", timeout: T.ui });
  const lessonLinks = await page.locator(".learning-card__links a").allInnerTexts();
  const wanted = ["3/3", "4/4", "0/3", "0/3", "0/2", "0/3", "0/2", "0/2", "0/2", "0/2"];
  check("the course page shows 3/3 and 4/4 for the M8 lessons and 0/n for the eight later ones", lessonLinks.length === 10 && wanted.every((p, i) => lessonLinks[i].includes(p)), JSON.stringify(lessonLinks));
  const resume = await page.locator('[data-testid="course-continue"]').innerText();
  check("PF-07 is NOT shown as the end of the course: the continue action offers PF-08 (\"Học tiếp:\")", resume.startsWith("Học tiếp:") && resume.includes("PF-08"), resume);
  await page.goto(base + "/learn");
  await settle(page);
  const learnText = await page.locator("main, #root").first().innerText();
  check("/learn does not announce a finished course after PF-07", !/Lộ trình hiện tại đã hoàn thành/.test(learnText) && /PF-08/.test(learnText));
  await page.goto(base + `/lesson/${LESSON3}`);
  await page.locator("article.learning-card").first().waitFor({ state: "visible", timeout: T.ui });
  const m9Classes = await page.locator("article.learning-card").evaluateAll((nodes) => nodes.map((node) => node.className));
  check("with M8 finished PF-08 is available and PF-09 / PF-10 are still locked", !m9Classes[0].includes("locked") && m9Classes[1].includes("locked") && m9Classes[2].includes("locked"), JSON.stringify(m9Classes));
  screenshots.push(await shot(page, "B-after-m8"));
  const attempts = await readStore(page, DB.learning, "attempts");
  check("nothing of the M8 progress was reset: a passing attempt per M8 mission remains stored", PF_M8.every((id) => attempts.some((a) => a.activityId === id && a.passed)), JSON.stringify([...new Set(attempts.map((a) => a.activityId))]));
  await page.goto(base + `/mission/${PF[7]}`);
  await page.waitForURL(`**/mission/${PF[7]}`, { timeout: T.ui });
}

/** C: the eight M9 missions in order, in the same profile, and the continuation into M10 (PF-15 is no longer the end). */
export async function scenarioC(env) {
  const { page, base, diag, checks, shot, screenshots } = env;
  const check = makeChecker(checks);
  const workersBefore = diag.workers.filter((w) => /pyodide/i.test(w.url)).length;
  // PF-15 stays on its page: the next mission (PF-16) must remain unopened until the continuation is checked from the course page.
  for (let index = 7; index < PF_M9.length + PF_M8.length; index += 1) await playMission(env, index, index === 14 ? { stay: true } : {});
  const started = diag.workers.filter((w) => /pyodide/i.test(w.url)).length - workersBefore;
  check("real Pyodide workers were started for the eight M9 missions", started >= PF_M9.length, `workers: ${started}`);

  for (const [lessonId, count] of [[LESSON3, 3], [LESSON4, 3], [LESSON5, 2]]) {
    await page.goto(base + `/lesson/${lessonId}`);
    await page.locator("article.learning-card").first().waitFor({ state: "visible", timeout: T.ui });
    const pills = await page.locator("article.learning-card .progress-pill").allInnerTexts();
    check(`lesson ${lessonId.split(".")[1]} shows every activity completed`, pills.length === count && pills.every((s) => s.trim() === "Đã hoàn thành"), JSON.stringify(pills));
  }
  await page.goto(base + `/course/${COURSE.python}`);
  await page.locator('[data-testid="course-continue"]').waitFor({ state: "visible", timeout: T.ui });
  const lessonLinks = await page.locator(".learning-card__links a").allInnerTexts();
  const wanted = ["3/3", "4/4", "3/3", "3/3", "2/2", "0/3", "0/2", "0/2", "0/2", "0/2"];
  check("the course page shows 15/15 for the first five lessons and 0/n for the five M10 lessons", lessonLinks.length === 10 && wanted.every((p, i) => lessonLinks[i].includes(p)), JSON.stringify(lessonLinks));
  const resume = await page.locator('[data-testid="course-continue"]').innerText();
  check("PF-15 is NOT shown as the end of the course: the continue action offers PF-16 (\"Học tiếp:\"), not a review", resume.startsWith("Học tiếp:") && resume.includes("PF-16") && !resume.startsWith("Ôn tập:"), resume);
  await page.goto(base + "/learn");
  await settle(page);
  const learnText = await page.locator("main, #root").first().innerText();
  check("/learn does not announce a finished course after PF-15 and offers PF-16", !/Lộ trình hiện tại đã hoàn thành/.test(learnText) && /PF-16/.test(learnText));
  check("the Python Foundations card counts 15/26", /15\/26/.test(await page.locator(`article[data-course-id="${COURSE.python}"] .progress-pill`).innerText()));

  // --- lesson 6 opens with PF-16 only; everything after it is still locked
  await page.goto(base + `/lesson/${LESSON6}`);
  await page.locator("article.learning-card").first().waitFor({ state: "visible", timeout: T.ui });
  const l6 = await page.locator("article.learning-card").evaluateAll((nodes) => nodes.map((node) => node.className));
  check("with M9 finished PF-16 is available and PF-17 / PF-18 are still locked", l6.length === 3 && !l6[0].includes("locked") && l6[1].includes("locked") && l6[2].includes("locked"), JSON.stringify(l6));
  for (const lessonId of [LESSON7, LESSON8, LESSON9, LESSON10]) {
    await page.goto(base + `/lesson/${lessonId}`);
    await page.locator("article.learning-card").first().waitFor({ state: "visible", timeout: T.ui });
    const classes = await page.locator("article.learning-card").evaluateAll((nodes) => nodes.map((node) => node.className));
    check(`lesson ${lessonId.split(".")[1]} is still entirely locked`, classes.length === 2 && classes.every((c) => c.includes("locked")), JSON.stringify(classes));
  }
  const attempts = await readStore(page, DB.learning, "attempts");
  check("nothing of the M8 / M9 progress was reset: a passing attempt per mission PF-01..PF-15", PF.slice(0, 15).every((id) => attempts.some((a) => a.activityId === id && a.passed)));
  check("no attempt exists for an M10 activity yet", !attempts.some((a) => PF_M10.includes(a.activityId)));
  screenshots.push(await shot(page, "C-course-m9-complete"));
}

/** D: the eleven M10 missions in order, in the same profile, on the same course. */
export async function scenarioD(env) {
  const { page, base, diag, checks, shot, screenshots } = env;
  const check = makeChecker(checks);

  // Continue the way a learner does: the course's own continue action leads to PF-16.
  await page.goto(base + "/learn");
  await settle(page);
  await page.locator(`article[data-course-id="${COURSE.python}"] [data-testid="course-continue"]`).click();
  await page.waitForURL(`**/activity/${PF[15]}`, { timeout: T.ui });
  await page.getByRole("link", { name: /thực hành/ }).first().click();
  await page.waitForURL(`**/mission/${PF[15]}`, { timeout: T.ui });

  const workersBefore = diag.workers.filter((w) => /pyodide/i.test(w.url)).length;
  const previewsBefore = diag.plotPreviews ?? 0;
  for (let index = 15; index < PF.length; index += 1) await playMission(env, index);
  const started = diag.workers.filter((w) => /pyodide/i.test(w.url)).length - workersBefore;
  check("real Pyodide workers were started for the eleven M10 missions", started >= PF_M10.length, `workers: ${started}`);
  check("plot previews were decoded by the browser during the M10 missions (PF-23, PF-24, PF-26)", (diag.plotPreviews ?? 0) - previewsBefore >= 4, String((diag.plotPreviews ?? 0) - previewsBefore));

  for (const [lessonId, count] of [[LESSON6, 3], [LESSON7, 2], [LESSON8, 2], [LESSON9, 2], [LESSON10, 2]]) {
    await page.goto(base + `/lesson/${lessonId}`);
    await page.locator("article.learning-card").first().waitFor({ state: "visible", timeout: T.ui });
    const pills = await page.locator("article.learning-card .progress-pill").allInnerTexts();
    check(`lesson ${lessonId.split(".")[1]} shows every activity completed`, pills.length === count && pills.every((s) => s.trim() === "Đã hoàn thành"), JSON.stringify(pills));
  }
  await page.goto(base + `/course/${COURSE.python}`);
  await page.locator('[data-testid="course-continue"]').waitFor({ state: "visible", timeout: T.ui });
  const lessonLinks = await page.locator(".learning-card__links a").allInnerTexts();
  check("the course page shows n/n for all ten lessons (26/26)", lessonLinks.length === 10 && LESSON_SIZES.every((size, i) => lessonLinks[i].includes(`${size}/${size}`)), JSON.stringify(lessonLinks));
  check("a finished course offers a review (\"Ôn tập:\"), not a locked or foreign activity", (await page.locator('[data-testid="course-continue"]').innerText()).startsWith("Ôn tập:"), await page.locator('[data-testid="course-continue"]').innerText());
  await shot(page, "D-course-complete").then((s) => screenshots.push(s));
}

// ----------------------------------------------------------------------------- E. Behavioural / typed-value grading (M10)

export async function scenarioE(env) {
  const { page, base, checks, shot, screenshots } = env;
  const check = makeChecker(checks);

  // --- PF-16: right values, wrong shape; a hard-coded answer passes only the displayed example
  const id16 = PF[15];
  await openMissionAgain(page, base, id16);
  check("[PF-16] Submit of the starter is graded NOT passed", (await clickSubmit(page, id16)) === "failed");
  const starter16 = await feedbackItems(page);
  const bs0 = itemOf(starter16, "broadcast_shape");
  check("[PF-16] broadcast_shape is graded on SEVERAL cases (\"đạt k/n ca kiểm tra\", n >= 4)", totalOf(bs0) >= 4, bs0?.title ?? "");
  const shapeExpected = literalOf(bs0?.expected);
  if (shapeExpected !== null && shapeExpected !== undefined) {
    const hardCoded = `import numpy as np\n\n\ndef broadcast_shape(*args, **kwargs):\n    return ${shapeExpected}\n`;
    const r = await submitCode(page, id16, hardCoded);
    const item = itemOf(r.items, "broadcast_shape");
    check("[PF-16] a broadcast_shape that always answers the displayed example passes the example and fails the hidden cases",
      r.ok && r.outcome === "failed" && item?.cases[0]?.passed === true && item.cases.some((c) => !c.passed) && item.expected === undefined, JSON.stringify({ outcome: r.outcome, title: item?.title, expected: item?.expected }));
  } else {
    check("[PF-16] the displayed example of broadcast_shape is readable from the starter's feedback", false, JSON.stringify(bs0?.expected));
  }
  const row16 = await submitCode(page, id16, namedWrong(id16, "x_col is a row (1, n): right values, wrong shape").code);
  const xcol = itemOfVar(row16.items, "x_col");
  check("[PF-16] x_col with the right numbers but the wrong shape is graded not passed with a SHAPE explanation, not a value one",
    row16.ok && row16.outcome === "failed" && /Kích thước của kết quả chưa đúng/.test(xcol?.detail ?? ""), JSON.stringify({ outcome: row16.outcome, item: xcol }));
  const flat16 = await submitCode(page, id16, namedWrong(id16, "x_col stays a flat vector (n,)").code);
  check("[PF-16] a flat (n,) vector where a column (n, 1) is required is a shape mistake too", flat16.ok && flat16.outcome === "failed" && /Kích thước/.test(itemOfVar(flat16.items, "x_col")?.detail ?? ""), JSON.stringify(itemOfVar(flat16.items, "x_col")));
  const raise16 = await submitCode(page, id16, namedWrong(id16, "adds two vectors of different length").code);
  check("[PF-16] NumPy's own ValueError for a broadcast that cannot work is reported as the learner's Python error", raise16.ok && raise16.outcome === "failed" && /ValueError/.test(raise16.text) && !/Môi trường chạy Python gặp sự cố/.test(raise16.text), raise16.text.slice(0, 160));
  await finishWithReference(page, id16, check);

  // --- PF-17: keepdims shape mistake, and a function that changes its argument
  const id17 = PF[16];
  await openMissionAgain(page, base, id17);
  const keep17 = await submitCode(page, id17, namedWrong(id17, "row_totals loses a dimension: right values, wrong shape").code);
  check("[PF-17] row_totals without keepdims is a SHAPE mistake", keep17.ok && keep17.outcome === "failed" && /Kích thước/.test(itemOfVar(keep17.items, "row_totals")?.detail ?? ""), JSON.stringify(itemOfVar(keep17.items, "row_totals")));
  const mut17 = await submitCode(page, id17, namedWrong(id17, "row_shares changes its argument in place").code);
  check("[PF-17] a function that divides its argument in place is told so (\"đã sửa đổi dữ liệu đầu vào\")", mut17.ok && mut17.outcome === "failed" && /đã sửa đổi dữ liệu đầu vào/.test(itemOf(mut17.items, "row_shares")?.detail ?? ""), JSON.stringify(itemOf(mut17.items, "row_shares")?.detail));
  await finishWithReference(page, id17, check);

  // --- PF-18: batches of the wrong shape
  const id18 = PF[17];
  await openMissionAgain(page, base, id18);
  const batch18 = await submitCode(page, id18, namedWrong(id18, "to_batches reshapes to (size, -1, f): right numbers, wrong shape").code);
  check("[PF-18] batches reshaped to (size, -1, f) are a SHAPE mistake on the prepared result", batch18.ok && batch18.outcome === "failed" && /Kích thước/.test(itemOfVar(batch18.items, "prepared")?.detail ?? ""), JSON.stringify(itemOfVar(batch18.items, "prepared")));
  await finishWithReference(page, id18, check);

  // --- PF-19: DataFrame / Series, inplace=True
  const id19 = PF[18];
  await openMissionAgain(page, base, id19);
  const frame19 = await submitCode(page, id19, namedWrong(id19, "names is a one-column DataFrame, not a Series").code);
  check("[PF-19] a one-column DataFrame where a Series is required is a TYPE mistake", frame19.ok && frame19.outcome === "failed" && /Kiểu dữ liệu/.test(itemOfVar(frame19.items, "names")?.detail ?? ""), JSON.stringify(itemOfVar(frame19.items, "names")));
  const inplace19 = await submitCode(page, id19, namedWrong(id19, "set_index(inplace=True) returns None and changes df").code);
  check("[PF-19] set_index(inplace=True) is reported on the variables it breaks (by_id and df)", inplace19.ok && inplace19.outcome === "failed" && itemOfVar(inplace19.items, "by_id") !== undefined && itemOfVar(inplace19.items, "df") !== undefined, inplace19.text.slice(0, 160));
  await finishWithReference(page, id19, check);

  // --- PF-20: a pandas function must not write into its argument
  const id20 = PF[19];
  await openMissionAgain(page, base, id20);
  const mut20 = await submitCode(page, id20, namedWrong(id20, "add_total writes the column into its argument").code);
  check("[PF-20] add_total that adds a column to the table it received is told so (\"đã sửa đổi dữ liệu đầu vào\")", mut20.ok && mut20.outcome === "failed" && /đã sửa đổi dữ liệu đầu vào/.test(itemOf(mut20.items, "add_total")?.detail ?? ""), JSON.stringify(itemOf(mut20.items, "add_total")?.detail));
  const and20 = await submitCode(page, id20, namedWrong(id20, "select_orders uses `and` between two Series").code);
  check("[PF-20] `and` between two Series raises ValueError, shown as the learner's Python error", and20.ok && and20.outcome === "failed" && /ValueError/.test(and20.text), and20.text.slice(0, 160));
  await finishWithReference(page, id20, check);

  // --- PF-21: dtype after cleaning
  const id21 = PF[20];
  await openMissionAgain(page, base, id21);
  const dtype21 = await submitCode(page, id21, namedWrong(id21, "age becomes int64 instead of float64").code);
  check("[PF-21] an age column converted to int64 instead of float64 is a DTYPE mistake", dtype21.ok && dtype21.outcome === "failed" && /dtype/.test(itemOfVar(dtype21.items, "cleaned")?.detail ?? ""), JSON.stringify(itemOfVar(dtype21.items, "cleaned")));
  await finishWithReference(page, id21, check);

  // --- PF-22: the index of an aggregated table
  const id22 = PF[21];
  await openMissionAgain(page, base, id22);
  const index22 = await submitCode(page, id22, namedWrong(id22, "category stays a column instead of the index").code);
  check("[PF-22] a report whose category is a column instead of the index is an INDEX / COLUMNS mistake", index22.ok && index22.outcome === "failed" && /Chỉ số hàng|Tên hoặc thứ tự cột/.test(itemOfVar(index22.items, "report")?.detail ?? ""), JSON.stringify(itemOfVar(index22.items, "report")));
  await finishWithReference(page, id22, check);

  // --- PF-23: figure properties (legend, order, title, bar order) and Matplotlib's own error
  const id23 = PF[22];
  await openMissionAgain(page, base, id23);
  const legend23 = await submitCode(page, id23, namedWrong(id23, "plot_trend forgets the legend").code);
  check("[PF-23] a line chart without a legend is graded on the figure (\"Biểu đồ chưa đúng yêu cầu\"), not on pixels", legend23.ok && legend23.outcome === "failed" && /Biểu đồ chưa đúng yêu cầu/.test(itemOfVar(legend23.items, "ax_trend")?.detail ?? ""), JSON.stringify(itemOfVar(legend23.items, "ax_trend")));
  const sort23 = await submitCode(page, id23, namedWrong(id23, "plot_ranking does not sort the bars").code);
  check("[PF-23] bars that are not sorted are reported on ax_rank, while the trend chart is accepted", sort23.ok && sort23.outcome === "failed" && itemOfVar(sort23.items, "ax_rank") !== undefined && itemOfVar(sort23.items, "ax_trend") === undefined, JSON.stringify(sort23.items.map((i) => i.title)));
  const len23 = await submitCode(page, id23, namedWrong(id23, "Matplotlib refuses x and y of different lengths (a learner error, not a package failure)").code);
  check("[PF-23] Matplotlib's ValueError for x and y of different lengths is a learner error, not a runtime failure", len23.ok && len23.outcome === "failed" && /ValueError/.test(len23.text) && !/Môi trường chạy Python gặp sự cố/.test(len23.text), len23.text.slice(0, 160));
  await finishWithReference(page, id23, check);

  // --- PF-24: debug a misleading chart; fixing one chart must not hide the other
  const id24 = PF[23];
  await openMissionAgain(page, base, id24);
  const half24 = await submitCode(page, id24, namedWrong(id24, "profit chart is fixed, region chart is not").code);
  check("[PF-24] when only the profit chart is fixed the feedback points at the region chart and not at the profit chart",
    half24.ok && half24.outcome === "failed" && itemOfVar(half24.items, "ax_region") !== undefined && itemOfVar(half24.items, "ax_profit") === undefined, JSON.stringify(half24.items.map((i) => i.title)));
  const sum24 = await submitCode(page, id24, namedWrong(id24, "fixes the aggregation only (sum) and nothing else").code);
  check("[PF-24] a fix that only repairs the aggregation still fails both charts (labels and legend are part of the bug)",
    sum24.ok && sum24.outcome === "failed" && itemOfVar(sum24.items, "ax_profit") !== undefined && itemOfVar(sum24.items, "ax_region") !== undefined, JSON.stringify(sum24.items.map((i) => i.title)));
  const leg24 = await submitCode(page, id24, namedWrong(id24, "profit chart fixed except the legend").code);
  check("[PF-24] the profit chart without its legend is still wrong", leg24.ok && leg24.outcome === "failed" && itemOfVar(leg24.items, "ax_profit") !== undefined, JSON.stringify(leg24.items.map((i) => i.title)));
  await finishWithReference(page, id24, check);

  // --- PF-25: CSV, join, clean dataset
  const id25 = PF[24];
  await openMissionAgain(page, base, id25);
  const left25 = await submitCode(page, id25, namedWrong(id25, "left join keeps the orders of unknown customers").code);
  check("[PF-25] a left join that keeps the orders of unknown customers produces a wrong dataset", left25.ok && left25.outcome === "failed" && itemOfVar(left25.items, "dataset") !== undefined, JSON.stringify(left25.items.map((i) => i.title)));
  const dup25 = await submitCode(page, id25, namedWrong(id25, "does not drop duplicated customer ids").code);
  check("[PF-25] duplicated customer ids that are not dropped are caught on the dataset", dup25.ok && dup25.outcome === "failed" && itemOfVar(dup25.items, "dataset") !== undefined, JSON.stringify(dup25.items.map((i) => i.title)));
  const bool25 = await submitCode(page, id25, namedWrong(id25, "check_columns returns a bool instead of raising").code);
  check("[PF-25] check_columns that returns a bool instead of raising for a missing column fails on its own cases", bool25.ok && bool25.outcome === "failed" && itemOf(bool25.items, "check_columns")?.cases.some((c) => !c.passed) === true, JSON.stringify(bool25.items.map((i) => i.title)));
  await finishWithReference(page, id25, check);

  // --- PF-26: the independent mini-project
  const id26 = PF[25];
  await openMissionAgain(page, base, id26);
  const std26 = await submitCode(page, id26, namedWrong(id26, "the matrix X is not standardised").code);
  check("[PF-26] a mini-project whose feature matrix is not standardised is not passed", std26.ok && std26.outcome === "failed" && /prepare|result/.test(std26.text), std26.text.slice(0, 160));
  const axes26 = await submitCode(page, id26, namedWrong(id26, "the diagnostic plot has no axis labels").code);
  check("[PF-26] a diagnostic plot without axis labels is graded on the figure, the data pipeline is accepted", axes26.ok && axes26.outcome === "failed" && itemOfVar(axes26.items, "ax") !== undefined, JSON.stringify(axes26.items.map((i) => i.title)));
  const mut26 = await submitCode(page, id26, namedWrong(id26, "prepare converts the columns of its argument in place").code);
  check("[PF-26] prepare that converts the columns of its argument in place is not passed", mut26.ok && mut26.outcome === "failed" && /prepare/.test(mut26.text), mut26.text.slice(0, 160));
  await finishWithReference(page, id26, check);
  screenshots.push(await shot(page, "E-pf26-passed"));
}

// ----------------------------------------------------------------------------- F. Isolation

export async function scenarioF(env) {
  const { page, base, checks, shot, screenshots } = env;
  const check = makeChecker(checks);

  const dump = await dumpDatabases(page, [DB.learning, DB.practice, DB.meta]);
  const attempts = dump[DB.learning]?.stores?.attempts ?? [];
  check("every stored attempt belongs to a Python Foundations activity", attempts.length > 0 && attempts.every((a) => PF.includes(a.activityId)), JSON.stringify([...new Set(attempts.map((a) => a.activityId))]));
  check("all twenty-six missions have a passing attempt", PF.every((id) => attempts.some((a) => a.activityId === id && a.passed)));
  check("no CS116 activity has an attempt", !attempts.some((a) => String(a.activityId).startsWith("cs116.")));
  check("no CS116 / python-ml-practice concept was credited", attempts.every((a) => a.conceptIds.every((c) => String(c).startsWith("python."))), JSON.stringify([...new Set(attempts.flatMap((a) => a.conceptIds))]));
  check("M9 missions credited the NumPy concepts (indexing, comprehensions, numpy-arrays, numpy-masks-axis)",
    ["python.indexing", "python.comprehensions", "python.numpy-arrays", "python.numpy-masks-axis"].every((c) => attempts.some((a) => a.passed && a.conceptIds.includes(c))));
  const m10Concepts = ["python.numpy-broadcasting", "python.numpy-reductions", "python.numpy-preprocessing", "python.pandas-frames", "python.pandas-filtering", "python.pandas-missing-values", "python.pandas-groupby", "python.matplotlib-charts", "python.chart-debugging", "python.csv-loading", "python.data-pipeline"];
  check("M10 missions credited the new Python concepts (broadcasting ... data-pipeline), all in the python.* namespace",
    m10Concepts.every((c) => attempts.some((a) => a.passed && a.conceptIds.includes(c))), JSON.stringify(m10Concepts.filter((c) => !attempts.some((a) => a.passed && a.conceptIds.includes(c)))));
  check("the M7 practice database was never created", dump[DB.practice] === null);
  const drafts = dump[DB.learning]?.stores?.missionDrafts ?? [];
  check("no draft is left behind by passed missions", !drafts.some((d) => PF.includes(d.activityId) && attempts.some((a) => a.activityId === d.activityId && a.passed)), JSON.stringify(drafts.map((d) => d.activityId)));

  // CS116 keeps its own start, even though Python Foundations is finished
  await page.goto(base + "/learn");
  await settle(page);
  const cs116 = page.locator(`article[data-course-id="${COURSE.cs116}"]`);
  const cs116Continue = cs116.locator('[data-testid="course-continue"]');
  check("CS116 still starts at VS-01 ('Bắt đầu:'), unaffected by Python Foundations", (await cs116Continue.innerText()).startsWith("Bắt đầu:") && (await cs116Continue.getAttribute("href")) === `/activity/${CS116_FIRST}`, await cs116Continue.innerText());
  const pythonContinue = page.locator(`article[data-course-id="${COURSE.python}"] [data-testid="course-continue"]`);
  const pythonLabel = await pythonContinue.innerText();
  check("Python Foundations offers a review of a closing mission ('Ôn tập:'), not an earlier block's PF-07 / PF-15", pythonLabel.startsWith("Ôn tập:") && !pythonLabel.includes("PF-07") && !pythonLabel.includes("PF-15"), pythonLabel);
  check("the progress pills are per course (Python 26/26, CS116 0/…)",
    (await page.locator(`article[data-course-id="${COURSE.python}"] .progress-pill`).innerText()).includes("26/26") &&
    (await cs116.locator(".progress-pill").innerText()).startsWith("0/"));
  const todayCard = await page.locator(".today-study-card").first().innerText();
  check("the Today card stays coherent: it names a single course and an activity of THAT course",
    /python foundations/i.test(todayCard) && !/python-ml-practice|CS116|VS-0/i.test(todayCard), todayCard.slice(0, 200));
  screenshots.push(await shot(page, "F-learn"));

  await page.goto(base + `/activity/${CS116_SECOND}`);
  await settle(page);
  check("CS116's second activity is still locked after finishing the whole of Python Foundations", (await page.locator(".activity-locked-panel").count()) === 1);
  await page.goto(base + `/activity/${CS116_FIRST}`);
  await settle(page);
  check("CS116's first activity is open", (await page.locator(".activity-locked-panel").count()) === 0 && (await page.getByRole("link", { name: /thực hành/ }).count()) === 1);

  const meta = (await metaState(page)) ?? { rewardHistory: [] };
  const firstPass = meta.rewardHistory.filter((g) => g.reason === "FIRST_ACTIVITY_PASS");
  check("rewards were granted only for Python Foundations activities, once each (26 first passes)",
    firstPass.every((g) => PF.includes(g.sourceActivityId)) && new Set(firstPass.map((g) => g.sourceActivityId)).size === firstPass.length && firstPass.length === PF.length,
    JSON.stringify({ grants: firstPass.length }));
}

// ----------------------------------------------------------------------------- G. Viewports

async function layoutProbe(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
}

export async function scenarioG(env) {
  const { page, base, diag, checks, shot, screenshots } = env;
  const check = makeChecker(checks);
  const viewports = [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 390, height: 844 },
  ];
  const routes = [
    ["/learn", "Python Foundations"],
    [`/course/${COURSE.python}`, "Data Workflows"],
    [`/lesson/${LESSON1}`, "Values & Decisions"],
    [`/lesson/${LESSON5}`, "NumPy Arrays"],
    [`/lesson/${LESSON6}`, "Shapes, Axes"],
    [`/lesson/${LESSON7}`, "pandas"],
    [`/lesson/${LESSON9}`, "Matplotlib"],
    [`/lesson/${LESSON10}`, "Data Workflows"],
    [`/activity/${PF[13]}`, "PF-14"],
    [`/activity/${PF[15]}`, "PF-16"],
    [`/activity/${PF[22]}`, "PF-23"],
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const [route, text] of routes) {
      await page.goto(base + route);
      await settle(page);
      const probe = await layoutProbe(page);
      check(`${viewport.name} ${route}: renders and has no horizontal page scroll`, (await page.locator("main, #root").first().innerText()).includes(text) && probe.scrollWidth <= probe.innerWidth + 1, JSON.stringify(probe));
    }
    screenshots.push(await shot(page, `G-${viewport.name}-lesson`));

    // the workspace of a NumPy, a pandas and a CSV mission: editor and both actions reachable, Run works
    for (const activityId of [PF[7], PF[15], PF[18], PF[24]]) {
      await page.goto(base + `/mission/${activityId}`);
      await openEditor(page);
      const ready = await waitButtonsReady(page);
      const run = page.getByRole("button", { name: /^Chạy thử/ });
      const submit = page.getByRole("button", { name: /^Nộp bài/ });
      await run.scrollIntoViewIfNeeded();
      const runBox = await run.boundingBox();
      await submit.scrollIntoViewIfNeeded();
      const submitBox = await submit.boundingBox();
      const editorBox = await page.locator(".monaco-editor").first().boundingBox();
      const probe = await layoutProbe(page);
      check(`${viewport.name} workspace ${pfName(activityId)}: editor, Run and Submit are usable`, ready && runBox && submitBox && editorBox && runBox.width > 40 && submitBox.width > 40 && editorBox.width > 200 && runBox.x >= -1 && submitBox.x + submitBox.width <= viewport.width + 1, JSON.stringify({ runBox, submitBox, editorBox }));
      check(`${viewport.name} workspace ${pfName(activityId)}: no horizontal page scroll`, probe.scrollWidth <= probe.innerWidth + 1, JSON.stringify(probe));
      screenshots.push(await shot(page, `G-${viewport.name}-workspace-${pfName(activityId).toLowerCase()}`));
      check(`${viewport.name} workspace ${pfName(activityId)}: Run works at this size`, await clickRun(page));
      if (activityId === PF[24]) {
        const files = await datasetFiles(page);
        const filesProbe = await layoutProbe(page);
        check(`${viewport.name} workspace ${pfName(activityId)}: the CSV file list fits (no horizontal scroll)`, files.length >= 2 && filesProbe.scrollWidth <= filesProbe.innerWidth + 1, JSON.stringify({ files, filesProbe }));
      }
    }

    // the plot preview must fit the viewport: run the reference of PF-23 (a passed mission, so nothing is graded or stored as an attempt)
    const plotId = PF[22];
    await page.goto(base + `/mission/${plotId}`);
    await openEditor(page);
    await waitButtonsReady(page);
    const attemptsBefore = (await attemptsOf(page, plotId)).length;
    const entered = await enterCode(page, plotId, SOLUTIONS[plotId].reference);
    check(`${viewport.name} PF-23: the reference reached IndexedDB`, entered.ok);
    const ran = entered.ok ? await clickRun(page) : false;
    const shown = ran ? await waitPreviews(page, 1, diag, T.run) : [];
    const probe = await layoutProbe(page);
    check(`${viewport.name} PF-23: the plot preview is valid and no wider than the viewport, without horizontal page scroll`,
      previewsAreValid(shown) && shown.every((p) => p.width <= viewport.width + 1) && probe.scrollWidth <= probe.innerWidth + 1, JSON.stringify({ shown, probe }));
    check(`${viewport.name} PF-23: Run left no attempt behind`, (await attemptsOf(page, plotId)).length === attemptsBefore);
    screenshots.push(await shot(page, `G-${viewport.name}-plot-preview`));

    // typed-value feedback with long values (a DataFrame / figure mismatch) must fit the viewport too
    const feedbackId = PF[21];
    await page.goto(base + `/mission/${feedbackId}`);
    await openEditor(page);
    await waitButtonsReady(page);
    const wrongCode = namedWrong(feedbackId, "avg_revenue is the mean of units").code;
    const sent = await enterCode(page, feedbackId, wrongCode);
    const outcome = sent.ok ? await clickSubmit(page, feedbackId) : "none";
    const feedback = page.locator(".grading-feedback--failed").first();
    const feedbackBox = await feedback.boundingBox().catch(() => null);
    const feedbackProbe = await layoutProbe(page);
    check(`${viewport.name} typed-value feedback (PF-22) renders inside the viewport without horizontal scroll`, outcome === "failed" && feedbackBox !== null && feedbackBox.width <= viewport.width + 1 && feedbackProbe.scrollWidth <= feedbackProbe.innerWidth + 1, JSON.stringify({ outcome, feedbackBox, feedbackProbe }));
    screenshots.push(await shot(page, `G-${viewport.name}-feedback-pf22`));
    await enterCode(page, feedbackId, SOLUTIONS[feedbackId].reference);
    await clickSubmit(page, feedbackId); // leaves PF-22 passed with no draft, as it was
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

// ----------------------------------------------------------------------------- H. Fresh-profile persistence (legacy PF-01)

export async function scenarioH(env) {
  const { page, base, checks, shot, screenshots } = env;
  const check = makeChecker(checks);
  const activityId = PF[0];
  const marker = "# QA-M10 work in progress " + Date.now() + "\npixel_count = width * height\n";

  await openFirstMission(page, base);
  await openEditor(page);
  check("a brand-new profile opens PF-01 with the starter", (await editorText(page)).includes("TODO"));
  check("the runtime is ready", await waitButtonsReady(page));

  const entered = await enterCode(page, activityId, marker);
  check(`the learner's code is durable in IndexedDB (${entered.how})`, entered.ok, entered.ok ? "" : JSON.stringify(entered));
  const row = (await draftsOf(page)).find((r) => r.activityId === activityId);
  check("the draft record belongs to this activity and stores the seed of the variant being solved", row?.activityId === activityId && typeof row?.seed === "string" && row.seed.length > 0, JSON.stringify({ seed: row?.seed, variantIndex: row?.variantIndex }));
  await page.waitForFunction(() => /Đã lưu bản nháp\./.test(document.body.innerText), undefined, { timeout: T.idb });
  check('the page says "Đã lưu bản nháp."', true);
  const variantBefore = row.variantIndex;
  const dataBefore = await readMissionData(page);
  check("the mission data (width, height, channels) is shown to the learner", /width/.test(dataBefore) && /height/.test(dataBefore) && /channels/.test(dataBefore), dataBefore.slice(0, 120));

  check("Run works while a draft exists", await clickRun(page));
  check("Run left no attempt behind", (await attemptsOf(page, activityId)).length === 0);

  await page.goto(base + `/lesson/${LESSON1}`);
  await page.locator("article.learning-card").first().waitFor({ state: "visible", timeout: T.ui });
  const pillText = (await page.locator("article.learning-card .progress-pill").first().innerText()).trim();
  check("PF-01 is not 'completed' just because it was edited and run", pillText !== "Đã hoàn thành", pillText);
  await page.getByRole("link", { name: /Xem hoạt động|Tiếp tục/ }).first().click();
  await page.getByRole("link", { name: /thực hành/ }).first().click();
  await page.waitForURL(`**/mission/${activityId}`, { timeout: T.ui });
  await openEditor(page);
  check("leaving and reopening restores the code", (await editorText(page)).includes("QA-M10 work in progress"), (await editorText(page)).slice(0, 120));
  check("... and says so", (await page.locator(".mission-draft-notice").allInnerTexts()).some((t) => t.includes("Đã khôi phục bản nháp")));

  await page.reload();
  await settle(page);
  await openEditor(page);
  check("F5 restores the code again", (await editorText(page)).includes("QA-M10 work in progress"));
  check("F5 restores the same variant (same seed, same data)", (await draftsOf(page)).find((r) => r.activityId === activityId)?.variantIndex === variantBefore);
  const dataAfter = await readMissionData(page);
  check("the mission data shown to the learner is unchanged by F5", dataBefore === dataAfter, `${dataBefore} / ${dataAfter}`);
  check("F5 left no attempt and no progress", (await readStore(page, DB.learning, "attempts")).length === 0);
  screenshots.push(await shot(page, "H-restored"));

  check("Submit of unfinished work is graded not passed", (await clickSubmit(page, activityId)) === "failed");
  await waitForStore(page, DB.learning, "attempts", (rows) => rows.length === 1);
  await page.reload();
  await settle(page);
  await page.goto(base + `/activity/${activityId}`);
  await page.locator(".activity-progress-grid").waitFor({ state: "visible", timeout: T.ui });
  const stats = await page.locator(".activity-progress-card strong").allInnerTexts();
  check("after F5 the activity page still counts 1 submission and 0 passes", stats[0]?.trim() === "1" && stats[1]?.trim() === "0", JSON.stringify(stats));
  await page.goto(base + `/lesson/${LESSON1}`);
  await page.locator("article.learning-card").first().waitFor({ state: "visible", timeout: T.ui });
  const cards = page.locator("article.learning-card");
  check("after F5 PF-02 is still locked", (await cards.nth(1).getAttribute("class")).includes("locked"));
  for (const [lessonId, name] of [[LESSON3, "M9: PF-08"], [LESSON6, "M10: PF-16"], [LESSON7, "M10: PF-19"], [LESSON10, "M10: PF-25"]]) {
    await page.goto(base + `/lesson/${lessonId}`);
    await page.locator("article.learning-card").first().waitFor({ state: "visible", timeout: T.ui });
    check(`a new profile cannot jump ahead (${name} is locked)`, (await page.locator("article.learning-card").first().getAttribute("class")).includes("locked"));
  }
  await page.goto(base + `/mission/${PF[15]}`);
  await page.getByRole("heading", { name: "Không thể mở nhiệm vụ" }).waitFor({ state: "visible", timeout: T.ui * 2 });
  check("... and the service layer refuses PF-16 for a profile that has not finished PF-15", true);
}

// ----------------------------------------------------------------------------- I. Diagnostics

export async function scenarioI(env) {
  const { diag, checks } = env;
  const check = makeChecker(checks);
  const sample = (pattern) => JSON.stringify([...new Set(diag.pyodideCdn.filter((u) => pattern.test(u)))].slice(0, 3));
  check("no uncaught page errors", diag.pageErrors.length === 0, JSON.stringify(diag.pageErrors.slice(0, 3)));
  check("no console errors", diag.consoleErrors.length === 0, JSON.stringify(diag.consoleErrors.slice(0, 5)));
  check("no request to another localhost origin (Local Python is never contacted)", diag.foreignLocal.length === 0, JSON.stringify(diag.foreignLocal.slice(0, 3)));
  check("every Pyodide CDN request succeeded", diag.pyodideCdnFailed.length === 0, JSON.stringify(diag.pyodideCdnFailed.slice(0, 3)));
  check("the NumPy package was requested from the official Pyodide CDN", diag.pyodideCdn.some((u) => /numpy/i.test(u)), sample(/numpy/i));
  check("the pandas package was requested from the official Pyodide CDN (PF-19..PF-22, PF-25, PF-26 ran on real pandas)", diag.pyodideCdn.some((u) => /pandas/i.test(u)), sample(/pandas/i));
  check("the Matplotlib package was requested from the official Pyodide CDN (PF-23, PF-24, PF-26 ran on real Matplotlib)", diag.pyodideCdn.some((u) => /matplotlib/i.test(u)), sample(/matplotlib/i));
  check("plot previews were rendered by the browser (PNG data URLs decoded in <img>)", (diag.plotPreviews ?? 0) >= 6, String(diag.plotPreviews ?? 0));
  check("the Local Python badge never appeared", diag.localPythonBadge === 0);
  check("no HTTP error responses from the app", diag.httpErrors.filter((e) => !String(e.url).startsWith("https://")).length === 0, JSON.stringify(diag.httpErrors.slice(0, 3)));
}
