// PHASE-07 / M9 browser acceptance scenarios (QA tooling only - not part of the app).
//
// Everything here drives the REAL application in a REAL browser: the real Vite-served React
// app, real Monaco, the real Pyodide worker (including the real NumPy wheel for PF-14 / PF-15),
// the real MissionEngine, the real declarative grader and the real function-probe helper.
// Nothing is mocked and IndexedDB is only ever READ - all progress is produced by using the UI,
// exactly like a learner.
//
// Derived from ../m8-acceptance/scenarios.mjs (left untouched): the same validated editor / IndexedDB
// helpers (native clipboard paste, exact-draft polling, no asserting the whole content of Monaco's
// virtualized DOM) generalised from seven to fifteen missions.
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
  Array.from({ length: 15 }, (_, index) => `python-foundations.pf${String(index + 1).padStart(2, "0")}`),
);
export const PF_M8 = Object.freeze(PF.slice(0, 7));
export const PF_M9 = Object.freeze(PF.slice(7));
const pfName = (id) => "PF-" + id.slice(-2);

export const LESSON1 = "python-foundations.values-decisions";
export const LESSON2 = "python-foundations.collections-functions";
export const LESSON3 = "python-foundations.sequences-records";
export const LESSON4 = "python-foundations.functions-projects";
export const LESSON5 = "python-foundations.numpy-arrays";
export const LESSON_TITLES = Object.freeze([
  "Bài 1 — Values & Decisions",
  "Bài 2 — Collections & Functions",
  "Bài 3 — Sequences & Records",
  "Bài 4 — Functions, Errors & Mini-project",
  "Bài 5 — NumPy Arrays",
]);
export const WORLD_TITLES = Object.freeze(["Python Foundations", "Collections & Intermediate Python", "Introduction to NumPy"]);
export const CS116_FIRST = "cs116.numpy.vs01";
export const CS116_SECOND = "cs116.numpy.vs02";

/** Starters, reference + deliberately wrong solutions of all 15 missions (a JSON copy of the TypeScript test data, kept in sync by qa-m9-fixture-sync.test.ts). */
export const SOLUTIONS = JSON.parse(fs.readFileSync(path.join(here, "fixtures", "solutions.json"), "utf8"));

const T = Object.freeze({
  ui: 30_000, // ordinary UI reaction
  boot: 240_000, // first Pyodide boot (the interpreter is fetched from the official CDN)
  run: 300_000, // one Run / Submit round trip (the first NumPy mission also downloads the NumPy wheel)
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

/**
 * The feedback items as the learner sees them: for every `<li class="grading-feedback__item">` the title (h4),
 * the detail line, the "Cần" (expected) and "Hiện tại" (actual) values, and the per-case ✓/✗ rows.
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

const itemOf = (items, functionName) => items.find((item) => item.title.includes(`“${functionName}”`));
const passedOf = (item) => Number(/đạt (\d+)\/(\d+) ca/.exec(item?.title ?? "")?.[1] ?? NaN);
const totalOf = (item) => Number(/đạt (\d+)\/(\d+) ca/.exec(item?.title ?? "")?.[2] ?? NaN);

const pill = (page, title) =>
  page.locator("article.learning-card", { has: page.getByRole("heading", { name: title, exact: false }) }).locator(".progress-pill").first();

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
  check("the Python Foundations card counts 15 activities (7 + 8), none done", /0\/15/.test(await card.locator(".progress-pill").innerText()), await card.locator(".progress-pill").innerText());
  screenshots.push(await shot(page, "A-learn"));

  // --- course page: three worlds, five lessons, in order
  await card.getByRole("link", { name: "Mở khóa học" }).click();
  await page.waitForURL(`**/course/${COURSE.python}`, { timeout: T.ui });
  await page.getByRole("heading", { level: 1 }).first().waitFor({ state: "visible", timeout: T.ui });
  check("/course/python-foundations opens", /Python Foundations/.test(await page.getByRole("heading", { level: 1 }).first().innerText()));
  check("the course page offers the same continue action", (await page.locator('[data-testid="course-continue"]').getAttribute("href")) === `/activity/${PF[0]}`);
  const worldTitles = await page.locator("article.learning-card h2").allInnerTexts();
  check("the course page lists the original world and the two M9 worlds, in order", JSON.stringify(worldTitles.map((t) => t.trim())) === JSON.stringify(WORLD_TITLES), JSON.stringify(worldTitles));
  const lessonLinks = await page.locator(".learning-card__links a").allInnerTexts();
  const expectedLinks = [["0/3", 0], ["0/4", 1], ["0/3", 2], ["0/3", 3], ["0/2", 4]];
  check("all five lessons are listed in order with their progress (3 + 4 + 3 + 3 + 2 = 15 activities)",
    lessonLinks.length === 5 && expectedLinks.every(([progress, index]) => lessonLinks[index].includes(LESSON_TITLES[index]) && lessonLinks[index].includes(progress)), JSON.stringify(lessonLinks));
  screenshots.push(await shot(page, "A-course"));

  // --- lesson 1: first activity available, the rest locked
  await page.getByRole("link", { name: /Values & Decisions/ }).click();
  await page.waitForURL(`**/lesson/${LESSON1}`, { timeout: T.ui });
  await page.locator("article.learning-card").first().waitFor({ state: "visible", timeout: T.ui });
  const cards = page.locator("article.learning-card");
  check("lesson 1 lists its three activities", (await cards.count()) === 3);
  check("PF-01 is available and the rest are locked on a fresh profile",
    !(await cards.nth(0).getAttribute("class")).includes("locked") && (await cards.nth(1).getAttribute("class")).includes("locked") && (await cards.nth(2).getAttribute("class")).includes("locked"));
  check("the lesson links back to its course", (await page.locator('[data-testid="lesson-course-link"]').getAttribute("href")) === `/course/${COURSE.python}`);

  // --- the M9 lessons exist, are listed with their activities, and are ALL locked before M8 is finished
  for (const [lessonId, count, first] of [[LESSON3, 3, 7], [LESSON4, 3, 10], [LESSON5, 2, 13]]) {
    await page.goto(base + `/lesson/${lessonId}`);
    await page.locator("article.learning-card").first().waitFor({ state: "visible", timeout: T.ui });
    const lessonCards = page.locator("article.learning-card");
    const classes = await lessonCards.evaluateAll((nodes) => nodes.map((node) => node.className));
    check(`lesson ${lessonId.split(".")[1]} lists its ${count} activities, all locked on a fresh profile`, classes.length === count && classes.every((c) => c.includes("locked")), JSON.stringify(classes));
    check(`... the first one (${pfName(PF[first])}) says which activity unlocks it`, (await lessonCards.nth(0).innerText()).includes(pfName(PF[first - 1])), (await lessonCards.nth(0).locator(".learning-card__stage").innerText()));
    check(`... the lesson links back to the SAME course`, (await page.locator('[data-testid="lesson-course-link"]').getAttribute("href")) === `/course/${COURSE.python}`);
  }
  screenshots.push(await shot(page, "A-lesson-numpy"));

  // --- direct URLs: the same rules as the UI
  await page.goto(base + `/activity/${PF[1]}`);
  await settle(page);
  check("/activity/<PF-02> shows the locked panel (and no way to start)", (await page.locator(".activity-locked-panel").count()) === 1 && (await page.getByRole("link", { name: /thực hành/ }).count()) === 0);
  for (const id of [PF[1], PF[7], PF[13]]) {
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

// ----------------------------------------------------------------------------- B / C. Playing the missions

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

/**
 * One mission, end to end like a learner: open, Run (no grade), Submit the starter (not passed), Submit a wrong
 * solution (feedback names the real mistake, nothing of the answer leaks), Submit the reference (passed, draft
 * removed, next mission unlocked and offered in the SAME course).
 *
 * `after(info)` runs once the mission is passed and the next-step panel is visible (extras per mission).
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

  // Hints: H1 opens, and a hint is a concept, not the answer
  if (index === 1 || index === 9) {
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

  // Autosave + F5 in the middle of an M9 mission: the exact draft, the same variant, the same data.
  if (index === 9) {
    const rowBefore = (await draftsOf(page)).find((r) => r.activityId === activityId);
    const readData = async () => {
      await page.getByRole("button", { name: "Dữ liệu", exact: true }).click();
      await page.locator(".mission-data-list").waitFor({ state: "visible", timeout: T.ui });
      const text = norm(await page.locator(".mission-data-list").innerText());
      await page.getByRole("button", { name: "Làm bài", exact: true }).click();
      return text;
    };
    const dataBefore = await readData();
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
    check(`${label} the mission data shown to the learner is unchanged by F5`, dataBefore === (await readData()));
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
    if (index === 6) {
      check(`${label} PF-07 no longer ends the course: it hands over to PF-08`, !/hoàn thành khóa học/.test(nextTitle) && (await nextPanel.innerText()).includes("PF-08"), (await nextPanel.innerText()).slice(0, 120));
    }
  } else {
    check(`${label} the last mission ends the course ("Bạn đã hoàn thành khóa học này") without leaving it`, /Bạn đã hoàn thành khóa học này/.test(nextTitle) && (await nextPanel.getByRole("link", { name: "Làm tiếp" }).count()) === 0);
  }

  // First pass of a course (PF-01) and of the first M9 mission (PF-08): the reward is earned once, a repeated pass earns none
  if (index === 0 || index === 7) {
    const grants = ((await metaState(page))?.rewardHistory ?? []).filter((g) => g.sourceActivityId === activityId && g.reason === "FIRST_ACTIVITY_PASS");
    check(`${label} the first pass earned the first-pass reward exactly once`, grants.length === 1, JSON.stringify(grants.map((g) => g.reason)));
    await waitButtonsReady(page);
    const second = await clickSubmit(page, activityId);
    const after = ((await metaState(page))?.rewardHistory ?? []).filter((g) => g.sourceActivityId === activityId && g.reason === "FIRST_ACTIVITY_PASS");
    check(`${label} submitting the same passing code again is graded passed but earns no second first-pass reward`, second === "passed" && after.length === 1, `${second}, rewards=${after.length}`);
  }

  // NumPy missions: the real NumPy wheel is requested from the official Pyodide CDN
  if (index === 13) {
    check(`${label} NumPy ran for real: the NumPy package was fetched from the official Pyodide CDN`, diag.pyodideCdn.some((u) => /numpy/i.test(u)), JSON.stringify([...new Set(diag.pyodideCdn.filter((u) => /numpy/i.test(u)))].slice(0, 3)));
  }

  if (hooks.after) await hooks.after({ index, activityId, starterItems });

  // Continue inside the same course via the offered link
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
  check("the course page shows 3/3 and 4/4 for the M8 lessons and 0/3, 0/3, 0/2 for the M9 ones", /3\/3/.test(lessonLinks[0]) && /4\/4/.test(lessonLinks[1]) && /0\/3/.test(lessonLinks[2]) && /0\/3/.test(lessonLinks[3]) && /0\/2/.test(lessonLinks[4]), JSON.stringify(lessonLinks));
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
  check("nothing of the M8 progress was reset: seven passing attempts per mission remain stored", PF_M8.every((id) => attempts.some((a) => a.activityId === id && a.passed)), JSON.stringify([...new Set(attempts.map((a) => a.activityId))]));
  await page.goto(base + `/mission/${PF[7]}`);
  await page.waitForURL(`**/mission/${PF[7]}`, { timeout: T.ui });
}

/** C: the eight M9 missions in order, in the same profile, on the same course. */
export async function scenarioC(env) {
  const { diag, checks } = env;
  const check = makeChecker(checks);
  const workersBefore = diag.workers.filter((w) => /pyodide/i.test(w.url)).length;
  for (let index = 7; index < PF.length; index += 1) await playMission(env, index);
  const started = diag.workers.filter((w) => /pyodide/i.test(w.url)).length - workersBefore;
  check("real Pyodide workers were started for the eight M9 missions", started >= PF_M9.length, `workers: ${started}`);

  const { page, base } = env;
  for (const [lessonId, count] of [[LESSON3, 3], [LESSON4, 3], [LESSON5, 2]]) {
    await page.goto(base + `/lesson/${lessonId}`);
    await page.locator("article.learning-card").first().waitFor({ state: "visible", timeout: T.ui });
    const pills = await page.locator("article.learning-card .progress-pill").allInnerTexts();
    check(`lesson ${lessonId.split(".")[1]} shows every activity completed`, pills.length === count && pills.every((s) => s.trim() === "Đã hoàn thành"), JSON.stringify(pills));
  }
  await page.goto(base + `/course/${COURSE.python}`);
  await page.locator('[data-testid="course-continue"]').waitFor({ state: "visible", timeout: T.ui });
  const lessonLinks = await page.locator(".learning-card__links a").allInnerTexts();
  check("the course page shows 3/3, 4/4, 3/3, 3/3, 2/2", ["3/3", "4/4", "3/3", "3/3", "2/2"].every((p, i) => lessonLinks[i]?.includes(p)), JSON.stringify(lessonLinks));
  check("a finished course offers a review (\"Ôn tập:\"), not a locked or foreign activity", (await page.locator('[data-testid="course-continue"]').innerText()).startsWith("Ôn tập:"), await page.locator('[data-testid="course-continue"]').innerText());
  await env.shot(page, "C-course-complete").then((s) => env.screenshots.push(s));
}

// ----------------------------------------------------------------------------- D. Behavioural (multi-case) grading

async function openMissionAgain(page, base, activityId) {
  await page.goto(base + `/mission/${activityId}`);
  await page.waitForURL(`**/mission/${activityId}`, { timeout: T.ui });
  await openEditor(page);
  await waitButtonsReady(page);
}

/**
 * A Python literal from the "Cần" value of the feedback. For a wrong-TYPE result the text is prefixed with the
 * expected type ("list: [1.0, 2.0]"); the prefix is dropped. null when it was truncated or absent.
 */
const literalOf = (text) => (text === undefined || text.includes("…") ? null : text.replace(/^[A-Za-z_][A-Za-z0-9_]*: /, ""));

export async function scenarioD(env) {
  const { page, base, checks, shot, screenshots } = env;
  const check = makeChecker(checks);
  const id11 = PF[10];
  const sol11 = SOLUTIONS[id11];
  const named = (activityId, name) => SOLUTIONS[activityId].wrong.find((w) => w.name === name);

  // --- PF-11: two functions, graded on several cases each
  await openMissionAgain(page, base, id11);
  check("[PF-11] Submit of the starter is graded NOT passed", (await clickSubmit(page, id11)) === "failed");
  const starterItems = await feedbackItems(page);
  const ma0 = itemOf(starterItems, "moving_average");
  const cl0 = itemOf(starterItems, "clip_values");
  check("[PF-11] each function is graded on SEVERAL cases (\"đạt k/n ca kiểm tra\", n >= 6)", totalOf(ma0) >= 6 && totalOf(cl0) >= 6, JSON.stringify([ma0?.title, cl0?.title]));
  check("[PF-11] the case list shows labels, not hidden expected values (only the displayed example reveals its answer)",
    (ma0?.cases.length ?? 0) >= 6 && ma0.cases.some((c) => c.label === "Ví dụ trong đề") && (ma0.expected === undefined || ma0.cases[0].label === "Ví dụ trong đề"), JSON.stringify(ma0?.cases.slice(0, 3)));
  const maExpected = literalOf(ma0?.expected);
  const clExpected = literalOf(cl0?.expected);
  check("[PF-11] the first failing case of a starter is the displayed example and shows what it expects", maExpected !== null && clExpected !== null, JSON.stringify([ma0?.expected, cl0?.expected]));

  // The hard-coded regression: copy the displayed example into the functions.
  if (maExpected !== null && clExpected !== null) {
    const hardCoded = `def moving_average(values, window):\n    return ${maExpected}\n\n\ndef clip_values(values, low, high):\n    return ${clExpected}\n`;
    const entered = await enterCode(page, id11, hardCoded);
    check("[PF-11] the hard-coded answer reached Monaco and IndexedDB", entered.ok, entered.ok ? "" : JSON.stringify(entered));
    check("[PF-11] a function that returns the constants of the displayed example is graded NOT passed", (await clickSubmit(page, id11)) === "failed");
    const items = await feedbackItems(page);
    const ma = itemOf(items, "moving_average");
    const cl = itemOf(items, "clip_values");
    for (const [name, item] of [["moving_average", ma], ["clip_values", cl]]) {
      check(`[PF-11] hard-coded ${name}: the displayed example passes (✓) but other cases fail (✗)`,
        item?.cases[0]?.passed === true && item.cases.some((c) => !c.passed) && passedOf(item) >= 1 && passedOf(item) < totalOf(item), JSON.stringify(item?.title));
      check(`[PF-11] hard-coded ${name}: the failing hidden case does not reveal its expected value`, item?.expected === undefined && item?.detail.length > 0, JSON.stringify({ expected: item?.expected, detail: item?.detail }));
    }
    check("[PF-11] ... and no 'next step' is offered for the hard-coded answer", (await page.locator(".mission-next-step").count()) === 0);
    screenshots.push(await shot(page, "D-hardcoded-pf11"));
  }

  // Wrong RETURN versus EXCEPTION versus mutation: the learner is told which kind of mistake it is.
  const probes = [
    ["moving_average", { code: `def moving_average(values, window):\n    if window <= 0 or window > len(values):\n        return []\n    return [sum(values[i:i + window]) / window for i in range(len(values) - window + 1)]\n\n\ndef clip_values(values, low, high):\n    return [min(max(v, low), high) for v in values]\n` }, /Hàm cần báo lỗi nhưng đã trả về một giá trị/, "a function that should raise ValueError but quietly returns a value"],
    ["moving_average", named(id11, "moving_average never validates the window"), /Hàm báo lỗi sai loại \(ZeroDivisionError\)/, "a function that raises the WRONG exception type (ZeroDivisionError instead of ValueError)"],
    ["moving_average", named(id11, "moving_average returns a tuple"), /Kiểu dữ liệu trả về chưa đúng/, "a function that returns a tuple instead of a list (wrong TYPE)"],
    ["moving_average", named(id11, "moving_average with floor division"), /kết quả chưa khớp yêu cầu/, "a function that returns the wrong VALUE"],
    ["clip_values", named(id11, "clip_values changes the input list in place"), /đã sửa đổi dữ liệu đầu vào/, "a function that mutates its input"],
  ];
  for (const [fn, wrong, pattern, what] of probes) {
    const entered = await enterCode(page, id11, wrong.code);
    if (!entered.ok) { check(`[PF-11] ${what}: code reached IndexedDB`, false, JSON.stringify(entered)); continue; }
    const outcome = await clickSubmit(page, id11);
    const item = itemOf(await feedbackItems(page), fn);
    check(`[PF-11] ${what} -> graded not passed with the matching explanation`, outcome === "failed" && pattern.test(item?.detail ?? ""), JSON.stringify({ outcome, detail: item?.detail }));
  }
  const raising = `def moving_average(values, window):\n    return values + window\n\n\ndef clip_values(values, low, high):\n    return values\n`;
  const enteredRaise = await enterCode(page, id11, raising);
  check("[PF-11] a function that CRASHES (TypeError) reached IndexedDB", enteredRaise.ok);
  const raiseOutcome = await clickSubmit(page, id11);
  const raised = itemOf(await feedbackItems(page), "moving_average");
  check("[PF-11] a function that raises on a valid input is reported as an error (\"gặp lỗi TypeError\"), not as a wrong value", raiseOutcome === "failed" && /gặp lỗi TypeError/.test(raised?.detail ?? ""), JSON.stringify(raised?.detail));
  const enteredRef = await enterCode(page, id11, sol11.reference);
  check("[PF-11] the reference solution reached IndexedDB", enteredRef.ok);
  check("[PF-11] the reference solution still passes (all cases of both functions)", (await clickSubmit(page, id11)) === "passed");
  const passedItems = await feedbackItems(page);
  check("[PF-11] a passing result lists every case as passed", [itemOf(passedItems, "moving_average"), itemOf(passedItems, "clip_values")].every((item) => item === undefined || item.cases.every((c) => c.passed)), JSON.stringify(passedItems.map((i) => i.title)));

  // --- PF-13: raising ValueError on invalid JSON is part of the contract
  const id13 = PF[12];
  await openMissionAgain(page, base, id13);
  const swallow = named(id13, "swallows invalid JSON instead of raising ValueError");
  const enteredSwallow = await enterCode(page, id13, swallow.code);
  check("[PF-13] the code that swallows invalid JSON reached IndexedDB", enteredSwallow.ok);
  const swallowOutcome = await clickSubmit(page, id13);
  const swallowItem = itemOf(await feedbackItems(page), "summarize_records");
  check("[PF-13] invalid JSON that is swallowed instead of raising ValueError is graded not passed on its own case", swallowOutcome === "failed" && swallowItem !== undefined && swallowItem.cases.some((c) => !c.passed), JSON.stringify(swallowItem?.title));
  const enteredRef13 = await enterCode(page, id13, SOLUTIONS[id13].reference);
  check("[PF-13] the reference solution reached IndexedDB", enteredRef13.ok);
  check("[PF-13] the reference solution passes the mini-project", (await clickSubmit(page, id13)) === "passed");

  // --- PF-14: NumPy shape / dtype / value on real NumPy
  const id14 = PF[13];
  await openMissionAgain(page, base, id14);
  check("[PF-14] Submit of the starter is graded NOT passed", (await clickSubmit(page, id14)) === "failed");
  const items14 = await feedbackItems(page);
  const desc = itemOf(items14, "describe_array");
  check("[PF-14] describe_array is graded on several arrays (different ndim and dtype)", totalOf(desc) >= 4, desc?.title ?? "");
  const descExpected = literalOf(desc?.expected);
  if (descExpected !== null && descExpected !== undefined) {
    const hardCoded = `import numpy as np\n\narr = np.array(table, dtype=np.float64)\n\n\ndef describe_array(a):\n    return ${descExpected}\n`;
    const entered = await enterCode(page, id14, hardCoded);
    check("[PF-14] the hard-coded describe_array reached IndexedDB", entered.ok);
    const outcome = await clickSubmit(page, id14);
    const item = itemOf(await feedbackItems(page), "describe_array");
    check("[PF-14] a describe_array that always answers for the displayed example passes the example and fails the other arrays",
      outcome === "failed" && item?.cases[0]?.passed === true && item.cases.some((c) => !c.passed) && item.expected === undefined, JSON.stringify({ outcome, title: item?.title, expected: item?.expected }));
  } else {
    check("[PF-14] the displayed example of describe_array is readable from the feedback", false, JSON.stringify(desc?.expected));
  }
  const wrongDtype = named(id14, "array built without dtype (integers)");
  const enteredDtype = await enterCode(page, id14, wrongDtype.code);
  check("[PF-14] the wrong-dtype code reached IndexedDB", enteredDtype.ok);
  const dtypeOutcome = await clickSubmit(page, id14);
  const dtypeFeedback = await page.locator(".grading-feedback--failed").first().innerText();
  check("[PF-14] an array built with the wrong dtype is graded not passed and the feedback names the variable", dtypeOutcome === "failed" && wrongDtype.fails.some((v) => dtypeFeedback.includes(v)), dtypeFeedback.slice(0, 160));
  const enteredRef14 = await enterCode(page, id14, SOLUTIONS[id14].reference);
  check("[PF-14] the reference solution reached IndexedDB", enteredRef14.ok);
  check("[PF-14] the reference solution passes on real NumPy", (await clickSubmit(page, id14)) === "passed");

  // --- PF-15: composing several NumPy operations
  const id15 = PF[14];
  await openMissionAgain(page, base, id15);
  const mutate = named(id15, "scale_valid overwrites the input array in place");
  const enteredMutate = await enterCode(page, id15, mutate.code);
  check("[PF-15] the code that overwrites the input array reached IndexedDB", enteredMutate.ok);
  const mutateOutcome = await clickSubmit(page, id15);
  const mutateItem = itemOf(await feedbackItems(page), "scale_valid");
  check("[PF-15] a function that modifies its input array is graded not passed with a matching explanation", mutateOutcome === "failed" && /đã sửa đổi dữ liệu đầu vào/.test(mutateItem?.detail ?? ""), JSON.stringify(mutateItem?.detail));
  const axis = named(id15, "sensor_means averages over the wrong axis");
  const enteredAxis = await enterCode(page, id15, axis.code);
  check("[PF-15] the wrong-axis code reached IndexedDB", enteredAxis.ok);
  const axisOutcome = await clickSubmit(page, id15);
  const axisItem = itemOf(await feedbackItems(page), "sensor_means");
  check("[PF-15] averaging over the wrong axis is graded not passed on the sensor_means cases", axisOutcome === "failed" && axisItem !== undefined && axisItem.cases.some((c) => !c.passed), JSON.stringify(axisItem?.title));
  const enteredRef15 = await enterCode(page, id15, SOLUTIONS[id15].reference);
  check("[PF-15] the reference solution reached IndexedDB", enteredRef15.ok);
  check("[PF-15] the reference solution passes on real NumPy", (await clickSubmit(page, id15)) === "passed");
  screenshots.push(await shot(page, "D-pf15-passed"));
}

// ----------------------------------------------------------------------------- E. Isolation

export async function scenarioE(env) {
  const { page, base, checks, shot, screenshots } = env;
  const check = makeChecker(checks);

  const dump = await dumpDatabases(page, [DB.learning, DB.practice, DB.meta]);
  const attempts = dump[DB.learning]?.stores?.attempts ?? [];
  check("every stored attempt belongs to a Python Foundations activity", attempts.length > 0 && attempts.every((a) => PF.includes(a.activityId)), JSON.stringify([...new Set(attempts.map((a) => a.activityId))]));
  check("all fifteen missions have a passing attempt", PF.every((id) => attempts.some((a) => a.activityId === id && a.passed)));
  check("no CS116 activity has an attempt", !attempts.some((a) => String(a.activityId).startsWith("cs116.")));
  check("no CS116 / python-ml-practice concept was credited", attempts.every((a) => a.conceptIds.every((c) => String(c).startsWith("python."))), JSON.stringify([...new Set(attempts.flatMap((a) => a.conceptIds))]));
  check("M9 missions credited the new Python concepts (indexing, comprehensions, numpy-arrays, numpy-masks-axis)",
    ["python.indexing", "python.comprehensions", "python.numpy-arrays", "python.numpy-masks-axis"].every((c) => attempts.some((a) => a.passed && a.conceptIds.includes(c))));
  check("the M7 practice database was never created", dump[DB.practice] === null);
  const drafts = dump[DB.learning]?.stores?.missionDrafts ?? [];
  check("no draft is left behind by passed missions", !drafts.some((d) => PF.includes(d.activityId) && attempts.some((a) => a.activityId === d.activityId && a.passed)));

  // CS116 keeps its own start, even though Python Foundations is finished
  await page.goto(base + "/learn");
  await settle(page);
  const cs116 = page.locator(`article[data-course-id="${COURSE.cs116}"]`);
  const cs116Continue = cs116.locator('[data-testid="course-continue"]');
  check("CS116 still starts at VS-01 ('Bắt đầu:'), unaffected by Python Foundations", (await cs116Continue.innerText()).startsWith("Bắt đầu:") && (await cs116Continue.getAttribute("href")) === `/activity/${CS116_FIRST}`, await cs116Continue.innerText());
  const pythonContinue = page.locator(`article[data-course-id="${COURSE.python}"] [data-testid="course-continue"]`);
  const pythonLabel = await pythonContinue.innerText();
  check("Python Foundations offers a review of its closing mission ('Ôn tập:'), not PF-07", pythonLabel.startsWith("Ôn tập:") && !pythonLabel.includes("PF-07"), pythonLabel);
  check("the progress pills are per course (Python 15/15, CS116 0/…)",
    (await page.locator(`article[data-course-id="${COURSE.python}"] .progress-pill`).innerText()).includes("15/15") &&
    (await cs116.locator(".progress-pill").innerText()).startsWith("0/"));
  const todayCard = await page.locator(".today-study-card").first().innerText();
  check("the Today card stays coherent: it names a single course and an activity of THAT course",
    /python foundations/i.test(todayCard) && !/python-ml-practice|CS116|VS-0/i.test(todayCard), todayCard.slice(0, 200));
  screenshots.push(await shot(page, "E-learn"));

  await page.goto(base + `/activity/${CS116_SECOND}`);
  await settle(page);
  check("CS116's second activity is still locked after finishing the whole of Python Foundations", (await page.locator(".activity-locked-panel").count()) === 1);
  await page.goto(base + `/activity/${CS116_FIRST}`);
  await settle(page);
  check("CS116's first activity is open", (await page.locator(".activity-locked-panel").count()) === 0 && (await page.getByRole("link", { name: /thực hành/ }).count()) === 1);

  const meta = (await metaState(page)) ?? { rewardHistory: [] };
  const firstPass = meta.rewardHistory.filter((g) => g.reason === "FIRST_ACTIVITY_PASS");
  check("rewards were granted only for Python Foundations activities, once each",
    firstPass.every((g) => PF.includes(g.sourceActivityId)) && new Set(firstPass.map((g) => g.sourceActivityId)).size === firstPass.length && firstPass.length === PF.length,
    JSON.stringify({ grants: firstPass.length }));
}

// ----------------------------------------------------------------------------- F. Viewports

async function layoutProbe(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
}

export async function scenarioF(env) {
  const { page, base, checks, shot, screenshots } = env;
  const check = makeChecker(checks);
  const viewports = [
    { name: "desktop", width: 1280, height: 800 },
    { name: "mobile", width: 390, height: 844 },
  ];
  const routes = [
    ["/learn", "Python Foundations"],
    [`/course/${COURSE.python}`, "Introduction to NumPy"],
    [`/lesson/${LESSON1}`, "Values & Decisions"],
    [`/lesson/${LESSON3}`, "Sequences & Records"],
    [`/lesson/${LESSON5}`, "NumPy Arrays"],
    [`/activity/${PF[7]}`, "PF-08"],
    [`/activity/${PF[13]}`, "PF-14"],
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const [route, text] of routes) {
      await page.goto(base + route);
      await settle(page);
      const probe = await layoutProbe(page);
      check(`${viewport.name} ${route}: renders and has no horizontal page scroll`, (await page.locator("main, #root").first().innerText()).includes(text) && probe.scrollWidth <= probe.innerWidth + 1, JSON.stringify(probe));
    }
    screenshots.push(await shot(page, `F-${viewport.name}-lesson`));

    // the workspace of a Python mission and of a NumPy mission: editor and both actions reachable
    for (const activityId of [PF[7], PF[13]]) {
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
      screenshots.push(await shot(page, `F-${viewport.name}-workspace-${pfName(activityId).toLowerCase()}`));
      check(`${viewport.name} workspace ${pfName(activityId)}: Run works at this size`, await clickRun(page));
    }

    // the multi-case feedback (long case lists and call texts) must fit the viewport too
    await page.goto(base + `/mission/${PF[10]}`);
    await openEditor(page);
    await waitButtonsReady(page);
    const entered = await enterCode(page, PF[10], SOLUTIONS[PF[10]].wrong.find((w) => w.name === "moving_average never validates the window").code);
    const outcome = entered.ok ? await clickSubmit(page, PF[10]) : "none";
    const feedback = page.locator(".grading-feedback--failed").first();
    const feedbackBox = await feedback.boundingBox().catch(() => null);
    const probe = await layoutProbe(page);
    check(`${viewport.name} multi-case feedback (PF-11) renders inside the viewport without horizontal scroll`, outcome === "failed" && feedbackBox !== null && feedbackBox.width <= viewport.width + 1 && probe.scrollWidth <= probe.innerWidth + 1, JSON.stringify({ outcome, feedbackBox, probe }));
    screenshots.push(await shot(page, `F-${viewport.name}-feedback-pf11`));
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

// ----------------------------------------------------------------------------- G. Fresh-profile persistence (legacy PF-01)

export async function scenarioG(env) {
  const { page, base, checks, shot, screenshots } = env;
  const check = makeChecker(checks);
  const activityId = PF[0];
  const marker = "# QA-M9 work in progress " + Date.now() + "\npixel_count = width * height\n";

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
  const readData = async () => {
    await page.getByRole("button", { name: "Dữ liệu", exact: true }).click();
    await page.locator(".mission-data-list").waitFor({ state: "visible", timeout: T.ui });
    const text = norm(await page.locator(".mission-data-list").innerText());
    await page.getByRole("button", { name: "Làm bài", exact: true }).click();
    return text;
  };
  const dataBefore = await readData();
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
  check("leaving and reopening restores the code", (await editorText(page)).includes("QA-M9 work in progress"), (await editorText(page)).slice(0, 120));
  check("... and says so", (await page.locator(".mission-draft-notice").allInnerTexts()).some((t) => t.includes("Đã khôi phục bản nháp")));

  await page.reload();
  await settle(page);
  await openEditor(page);
  check("F5 restores the code again", (await editorText(page)).includes("QA-M9 work in progress"));
  check("F5 restores the same variant (same seed, same data)", (await draftsOf(page)).find((r) => r.activityId === activityId)?.variantIndex === variantBefore);
  const dataAfter = await readData();
  check("the mission data shown to the learner is unchanged by F5", dataBefore === dataAfter, `${dataBefore} / ${dataAfter}`);
  check("F5 left no attempt and no progress", (await readStore(page, DB.learning, "attempts")).length === 0);
  screenshots.push(await shot(page, "G-restored"));

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
  await page.goto(base + `/lesson/${LESSON3}`);
  await page.locator("article.learning-card").first().waitFor({ state: "visible", timeout: T.ui });
  check("a new profile cannot jump into M9: PF-08 is locked", (await page.locator("article.learning-card").first().getAttribute("class")).includes("locked"));
}

// ----------------------------------------------------------------------------- H. Diagnostics

export async function scenarioH(env) {
  const { diag, checks } = env;
  const check = makeChecker(checks);
  check("no uncaught page errors", diag.pageErrors.length === 0, JSON.stringify(diag.pageErrors.slice(0, 3)));
  check("no console errors", diag.consoleErrors.length === 0, JSON.stringify(diag.consoleErrors.slice(0, 5)));
  check("no request to another localhost origin (Local Python is never contacted)", diag.foreignLocal.length === 0, JSON.stringify(diag.foreignLocal.slice(0, 3)));
  check("every Pyodide CDN request succeeded", diag.pyodideCdnFailed.length === 0, JSON.stringify(diag.pyodideCdnFailed.slice(0, 3)));
  check("the NumPy package was requested from the official Pyodide CDN (PF-14 / PF-15 ran on real NumPy)", diag.pyodideCdn.some((u) => /numpy/i.test(u)), JSON.stringify([...new Set(diag.pyodideCdn.filter((u) => /numpy/i.test(u)))].slice(0, 3)));
  check("the Local Python badge never appeared", diag.localPythonBadge === 0);
  check("no HTTP error responses from the app", diag.httpErrors.filter((e) => !String(e.url).startsWith("https://")).length === 0, JSON.stringify(diag.httpErrors.slice(0, 3)));
}
