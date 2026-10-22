// M9 automated browser acceptance runner (PHASE-07 / M9 - curriculum expansion and behavioural grading). QA tooling only - not part of the app.
// Derived from ../m8-acceptance/runner.mjs (left untouched): same safety model, timeouts, strict cleanup.
//
// Safety model:
//  * Browser: playwright-core launch() -> Microsoft Edge with fresh, temporary, isolated contexts (deleted
//    on close). The user's real Edge profile is never opened and no real learning data is touched.
//  * Network: the app is served from one localhost origin that the runner (or QA_BASE_URL) provides. Any other
//    localhost port (notably Local Python on 127.0.0.1:8765) is blocked AND recorded as a failure. The only
//    external access allowed is GET https://cdn.jsdelivr.net/pyodide/ (Pyodide packages such as NumPy).
//  * Data: scenarios only READ IndexedDB. Progress is produced exclusively through the UI. Contexts are
//    discarded on close, so nothing the run creates survives it.
//  * Server: a Vite dev server on a free localhost port; only that child is stopped. QA_BASE_URL may point at
//    an already running localhost server (it is then left alone).
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  scenarioA, scenarioB, scenarioC, scenarioD, scenarioE, scenarioF, scenarioG, scenarioH,
} from "./scenarios.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(process.env.QA_REPO_ROOT ?? path.join(here, "..", ".."));
const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14) + "-" + Math.random().toString(36).slice(2, 6);
const reportDir = path.join(here, "reports", runId);
fs.mkdirSync(reportDir, { recursive: true });
const coursePath = path.join(repoRoot, "src", "content", "python-foundations", "content-m9.ts");

const PASS_LABEL = "M9_BROWSER_ACCEPTANCE_PASS";
const FAIL_LABEL = "M9_BROWSER_ACCEPTANCE_FAILED";
const log = (...a) => console.log("[m9-qa]", ...a);

const envMs = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};
const SCENARIO_TIMEOUT_MS = envMs("QA_SCENARIO_TIMEOUT_MS", 2_700_000); // B and C boot Pyodide for seven / eight missions; C downloads NumPy
const CLOSE_TIMEOUT_MS = envMs("QA_CLOSE_TIMEOUT_MS", 15_000);
const SHOT_TIMEOUT_MS = 10_000;
const RUN_TIMEOUT_MS = envMs("QA_RUN_TIMEOUT_MS", 9_000_000); // watchdog for the whole run

const results = []; // { id, title, status: PASS|FAIL|NOT RUN, checks, error, screenshots }
const cleanup = { server: "not started", browser: "not started", notes: [] };
const liveContexts = new Set();
const diag = {
  pageErrors: [],
  consoleErrors: [],
  runnerErrors: [],
  blocked: [], // non-local, not-allowed requests (aborted)
  foreignLocal: [], // localhost requests to an origin other than the app (aborted) - a FAILURE
  pyodideCdn: [], // allowed external requests (official Pyodide CDN)
  pyodideCdnFailed: [],
  failedRequests: [], // every request failure, classified
  httpErrors: [],
  workers: [],
  localPythonBadge: 0,
};
let browserInfo = { name: "unknown", version: "unknown", via: "unknown" };
let serverChild = null;
let browser = null;
let finalized = false;
let baseOrigin = "";

function loadPlaywright() {
  const candidates = [process.env.QA_PLAYWRIGHT_PATH, here, path.join(here, "..", "m8-acceptance"), path.join(here, "..", "m7-acceptance"), path.join(here, "..", "m70-smoke"), path.join(here, "..", "m3-acceptance")].filter(Boolean);
  for (const base of candidates) {
    try { return createRequire(path.join(base, "noop.js"))("playwright-core"); } catch { /* try next */ }
  }
  throw new Error("playwright-core not found. Run: npm install --prefix qa/m9-acceptance");
}

function git(args) {
  try { return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return "unavailable"; }
}

const isLoopback = (u) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(u).hostname);

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
    s.on("error", reject);
  });
}

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms); })]);
  } finally { clearTimeout(timer); }
}

async function waitHttp(url, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try { const r = await fetch(url, { signal: controller.signal }); if (r.ok) return; } catch { /* retry */ }
    finally { clearTimeout(timer); }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("server did not become ready: " + url);
}

async function startServer() {
  if (process.env.QA_BASE_URL) {
    if (!isLoopback(process.env.QA_BASE_URL)) throw new Error("QA_BASE_URL must be localhost/127.0.0.1 (refusing: " + process.env.QA_BASE_URL + ")");
    cleanup.server = "reused existing server (left running, not owned)";
    await waitHttp(process.env.QA_BASE_URL, 30000);
    return process.env.QA_BASE_URL.replace(/\/$/, "");
  }
  const viteBin = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
  if (!fs.existsSync(viteBin)) throw new Error("vite not found in " + repoRoot + " (run npm ci in the repo first)");
  const port = await freePort();
  serverChild = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, BROWSER: "none" },
  });
  let out = "";
  serverChild.stdout.on("data", (d) => { out += d; });
  serverChild.stderr.on("data", (d) => { out += d; });
  serverChild.on("exit", (c) => { if (c) cleanup.notes.push("vite exited with code " + c); });
  serverChild.on("error", (e) => { cleanup.notes.push("vite process error: " + e.message); });
  serverChild.qaPort = port;
  const base = "http://127.0.0.1:" + port;
  try { await waitHttp(base + "/", 120000); } catch (e) { fs.writeFileSync(path.join(reportDir, "vite.log"), out); throw e; }
  cleanup.server = "started by runner on " + base + " (pid " + serverChild.pid + ")";
  serverChild.logRef = () => out;
  return base;
}

function portClosed(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const done = (closed) => { socket.destroy(); resolve(closed); };
    socket.setTimeout(2000, () => done(false));
    socket.once("connect", () => done(false));
    socket.once("error", () => done(true));
  });
}

// Stops ONLY the Vite child this runner started (by its own pid).
async function stopServer() {
  if (!serverChild) return;
  let stopError = null;
  try { fs.writeFileSync(path.join(reportDir, "vite.log"), serverChild.logRef?.() ?? ""); } catch { /* informational */ }
  try {
    if (serverChild.exitCode === null && serverChild.signalCode === null) {
      if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(serverChild.pid), "/T", "/F"], { stdio: "ignore", timeout: 15000 });
      else serverChild.kill("SIGTERM");
    }
  } catch (e) { stopError = e.message; }
  let closed = false;
  for (let attempt = 0; attempt < 10 && !closed; attempt += 1) {
    closed = await portClosed(serverChild.qaPort);
    if (!closed) await new Promise((r) => setTimeout(r, 500));
  }
  if (closed) cleanup.server += "; stopped" + (stopError ? ` (stop command reported: ${stopError})` : "");
  else cleanup.server += "; STOP FAILED: port " + serverChild.qaPort + " still accepts connections" + (stopError ? ` (${stopError})` : "");
}

async function launchBrowser(pw) {
  const executablePath = process.env.QA_EDGE_EXE;
  const config = executablePath ? { executablePath } : { channel: "msedge" };
  const b = await pw.chromium.launch({
    headless: process.env.QA_HEADED !== "1",
    args: ["--disable-background-networking", "--disable-component-update", "--no-first-run"], ...config,
  });
  browserInfo = {
    name: executablePath && !/edge/i.test(executablePath) ? "Chromium (QA_EDGE_EXE override)" : "Microsoft Edge",
    version: b.version(), via: executablePath ? "QA_EDGE_EXE" : "msedge channel",
  };
  return b;
}

const PYODIDE_CDN_PREFIX = "https://cdn.jsdelivr.net/pyodide/";

async function newProfile(label) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", acceptDownloads: false });
  liveContexts.add(context);
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("about:")) return route.continue();
    if (isLoopback(url)) {
      if (new URL(url).origin === baseOrigin) return route.continue();
      diag.foreignLocal.push({ label, url }); // e.g. Local Python on :8765 - never allowed
      return route.abort("blockedbyclient");
    }
    if (url.startsWith(PYODIDE_CDN_PREFIX) && request.method() === "GET") {
      diag.pyodideCdn.push(url);
      return route.continue();
    }
    diag.blocked.push({ label, url });
    return route.abort("blockedbyclient");
  });
  context.on("requestfailed", (request) => {
    const url = request.url();
    const failure = request.failure()?.errorText ?? "unknown";
    const entry = { label, url: url.slice(0, 300), failure };
    diag.failedRequests.push(entry);
    if (url.startsWith(PYODIDE_CDN_PREFIX)) diag.pyodideCdnFailed.push(entry);
  });
  context.on("response", (response) => {
    if (response.status() >= 400) {
      const entry = { label, url: response.url().slice(0, 300), status: response.status() };
      diag.httpErrors.push(entry);
      if (response.url().startsWith(PYODIDE_CDN_PREFIX)) diag.pyodideCdnFailed.push(entry);
    }
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => diag.pageErrors.push({ label, message: String(e && e.stack ? e.stack : e) }));
  page.on("console", (m) => { if (m.type() === "error") diag.consoleErrors.push({ label, text: m.text().slice(0, 500) }); });
  page.on("worker", (w) => diag.workers.push({ label, url: w.url() }));
  return { context, page };
}

async function closeContext(context) {
  try {
    await withTimeout(context.close(), CLOSE_TIMEOUT_MS, "browser context shutdown");
    liveContexts.delete(context);
    return null;
  } catch (e) { return e.message; }
}

async function shot(page, name) {
  const file = path.join(reportDir, name + ".png");
  try { await withTimeout(page.screenshot({ path: file, fullPage: true }), SHOT_TIMEOUT_MS, "screenshot"); return file; } catch { return null; }
}

// A scenario that times out, throws or asserts nothing is a FAIL - never a PASS and never dropped.
async function runScenario(id, title, env, fn, timeoutMs = SCENARIO_TIMEOUT_MS) {
  const entry = { id, title, status: "FAIL", checks: [], error: null, screenshots: [], timedOut: false, ms: 0 };
  results.push(entry);
  env.checks = entry.checks;
  env.screenshots = entry.screenshots;
  const started = Date.now();
  try {
    await withTimeout(fn(env), timeoutMs, `${id} scenario`);
    entry.screenshots = entry.screenshots.filter(Boolean);
    entry.status = entry.checks.length > 0 && entry.checks.every((c) => c.ok) ? "PASS" : "FAIL";
    if (entry.checks.length === 0) entry.error = "scenario produced no assertions (never counts as PASS)";
  } catch (e) {
    entry.error = String(e && e.stack ? e.stack : e);
    entry.timedOut = /timed out after/.test(String(e && e.message));
    entry.reproduction = `Scenario ${id} stopped at its last recorded check (${entry.checks.at(-1)?.name ?? "before the first check"}). Run again with QA_HEADED=1 to watch it.`;
    const failShot = await shot(env.page, `${id}-error`);
    if (failShot) entry.screenshots.push(failShot);
  }
  if (entry.status === "FAIL" && !entry.error) {
    const failShot = await shot(env.page, `${id}-failure`);
    if (failShot) entry.screenshots.push(failShot);
  }
  entry.screenshots = entry.screenshots.filter(Boolean);
  entry.ms = Date.now() - started;
  log(entry.status.padEnd(7), id, title, `(${entry.checks.filter((c) => c.ok).length}/${entry.checks.length} checks, ${entry.ms}ms)`);
  for (const c of entry.checks.filter((c) => !c.ok)) log("   FAILED CHECK:", c.name, c.detail ?? "");
  if (entry.error) log("   ERROR:", entry.error.split("\n")[0]);
  saveReport("M9_BROWSER_ACCEPTANCE_IN_PROGRESS");
}

const EXPECTED = ["A", "B", "C", "D", "E", "F", "G", "H"];
const startedAt = new Date();

function reproSteps() {
  const out = [];
  for (const r of results.filter((x) => x.status !== "PASS")) {
    const failed = r.checks.filter((c) => !c.ok);
    out.push(`### ${r.id}. ${r.title}`);
    out.push(`1. From the repo root run: \`powershell -NoProfile -ExecutionPolicy Bypass -File .\\qa\\m9-acceptance\\run-m9-acceptance.ps1\` (add \`$env:QA_HEADED = "1"\` first to watch).`);
    out.push(`2. Scenario ${r.id} - ${r.title}.`);
    if (failed.length) out.push(`3. Failing check(s): ${failed.map((c) => `"${c.name}"${c.detail ? ` (${c.detail})` : ""}`).join("; ")}.`);
    if (r.error) out.push(`3. Error: ${r.error.split("\n")[0]}`);
    if (r.reproduction) out.push(`4. ${r.reproduction}`);
    if (r.screenshots?.length) out.push(`5. Screenshot(s): ${r.screenshots.join(", ")}`);
    out.push("");
  }
  return out;
}

function writeReport(label, head, branch) {
  const total = results.flatMap((r) => r.checks);
  const counts = {
    scenarios: { PASS: results.filter((r) => r.status === "PASS").length, FAIL: results.filter((r) => r.status === "FAIL").length, "NOT RUN": results.filter((r) => r.status === "NOT RUN").length },
    checks: { PASS: total.filter((c) => c.ok).length, FAIL: total.filter((c) => !c.ok).length, SKIP: 0 },
  };
  const lines = [];
  lines.push(`# M9 Browser Acceptance — ${label}`, "");
  lines.push(`- Run id: \`${runId}\``, `- Timestamp: ${startedAt.toISOString()}`);
  lines.push(`- Repository branch: \`${branch}\`  HEAD: \`${head}\``);
  lines.push(`- Browser: ${browserInfo.name} ${browserInfo.version} (${browserInfo.via}); fresh temporary isolated contexts`);
  lines.push(`- Course under test: \`${coursePath}\` (Python Foundations: PF-01..PF-07 from M8 and PF-08..PF-15 from M9, with real NumPy in PF-14 / PF-15)`);
  lines.push(`- Totals: scenarios PASS ${counts.scenarios.PASS} / FAIL ${counts.scenarios.FAIL} / NOT RUN ${counts.scenarios["NOT RUN"]}; checks PASS ${counts.checks.PASS} / FAIL ${counts.checks.FAIL} / SKIP 0 (a skipped step is a FAIL, never a skip)`);
  lines.push(`- Report folder: \`${reportDir}\``, "");
  lines.push("## Scenarios", "", "| Scenario | Result | Checks |", "|---|---|---|");
  for (const r of results) lines.push(`| ${r.id}. ${r.title} | **${r.status}** | ${r.checks.filter((c) => c.ok).length}/${r.checks.length} |`);
  lines.push("");
  for (const r of results) {
    lines.push(`### ${r.id}. ${r.title} — ${r.status}`, "");
    for (const c of r.checks) lines.push(`- ${c.ok ? "PASS" : "**FAIL**"} ${c.name}${c.detail ? ` — \`${c.detail}\`` : ""}`);
    if (r.error) lines.push("", "```", r.error, "```");
    if (r.screenshots?.length) lines.push("", ...r.screenshots.map((s) => `- screenshot: \`${s}\``));
    lines.push("");
  }
  const repro = reproSteps();
  if (repro.length) lines.push("## Reproduction of failures", "", ...repro);
  lines.push("## Cleanup", "", `- Dev server: ${cleanup.server}`, `- Browser: ${cleanup.browser}`);
  for (const n of cleanup.notes) lines.push(`- note: ${n}`);
  lines.push("- Real Edge profile: never opened. Every profile is a temporary context discarded at close; the runner only reads IndexedDB.", "");
  lines.push("## Diagnostics", "");
  lines.push(`- Uncaught page errors: ${diag.pageErrors.length}`);
  for (const e of diag.pageErrors.slice(0, 10)) lines.push(`  - [${e.label}] ${e.message.split("\n")[0]}`);
  if (diag.runnerErrors.length) lines.push("- Runner errors:", ...diag.runnerErrors.map((e) => `  - ${e.split("\n")[0]}`));
  lines.push(`- Console errors: ${diag.consoleErrors.length}`);
  for (const e of diag.consoleErrors.slice(0, 15)) lines.push(`  - [${e.label}] ${e.text}`);
  lines.push(`- Dedicated workers seen: ${diag.workers.length}`);
  for (const w of diag.workers.slice(0, 12)) lines.push(`  - [${w.label}] ${w.url.slice(0, 160)}`);
  lines.push(`- Pyodide CDN requests allowed: ${diag.pyodideCdn.length}`);
  for (const u of [...new Set(diag.pyodideCdn)].slice(0, 12)) lines.push(`  - ${u}`);
  lines.push(`- Failed network requests: ${diag.failedRequests.length}`);
  for (const f of diag.failedRequests.slice(0, 20)) lines.push(`  - [${f.label}] ${f.failure} ${f.url}`);
  lines.push(`- HTTP error responses: ${diag.httpErrors.length}`);
  for (const f of diag.httpErrors.slice(0, 20)) lines.push(`  - [${f.label}] ${f.status} ${f.url}`);
  lines.push(`- Blocked external requests (policy): ${diag.blocked.length}`);
  for (const b of [...new Set(diag.blocked.map((x) => x.url))].slice(0, 15)) lines.push(`  - ${b}`);
  lines.push(`- Blocked requests to other localhost origins (Local Python etc.; any entry is a failure): ${diag.foreignLocal.length}`);
  for (const b of diag.foreignLocal.slice(0, 10)) lines.push(`  - [${b.label}] ${b.url}`);
  lines.push("", "## Result", "", `**${label}**`, "");
  const file = path.join(reportDir, "report.md");
  fs.writeFileSync(file, lines.join("\n"));
  fs.writeFileSync(path.join(reportDir, "report.json"), JSON.stringify({ runId, label, startedAt, head, branch, browserInfo, counts, results, diagnostics: diag, cleanup }, null, 2));
  return file;
}

function saveReport(label) {
  try { return writeReport(label, git(["rev-parse", "--short", "HEAD"]), git(["rev-parse", "--abbrev-ref", "HEAD"])); }
  catch (e) { console.error("[m9-qa] could not write the report:", e.message); return null; }
}

async function finalize(reason) {
  if (finalized) return;
  finalized = true;
  for (const context of [...liveContexts]) {
    const problem = await closeContext(context);
    if (problem) cleanup.notes.push("context close failed: " + problem);
  }
  try {
    if (browser) {
      await withTimeout(browser.close(), CLOSE_TIMEOUT_MS, "browser shutdown");
      cleanup.browser = "closed (temporary profiles discarded)";
    }
  } catch (e) { cleanup.browser = "CLOSE FAILED: " + e.message; }
  await stopServer();

  for (const id of EXPECTED) {
    if (!results.some((r) => r.id === id)) {
      results.push({ id, title: "(not executed)", status: "NOT RUN", checks: [], error: reason ?? "not executed", screenshots: [] });
    }
  }
  const browserClosed = !browser || cleanup.browser.startsWith("closed (");
  const serverStopped = !serverChild || cleanup.server.includes("; stopped");
  const allPass =
    EXPECTED.every((id) => results.find((r) => r.id === id)?.status === "PASS") &&
    results.every((r) => r.status === "PASS") &&
    diag.pageErrors.length === 0 && diag.runnerErrors.length === 0 && diag.foreignLocal.length === 0 &&
    browserClosed && serverStopped;
  const label = allPass ? PASS_LABEL : FAIL_LABEL;
  const reportFile = saveReport(label);
  try { fs.writeFileSync(path.join(here, "reports", "LATEST.txt"), reportDir + "\n"); } catch { /* informational */ }
  console.log("\n" + label);
  if (!(browserClosed && serverStopped)) console.log(`Cleanup incomplete: browser=${cleanup.browser}; server=${cleanup.server}`);
  console.log("Report: " + (reportFile ?? "(not written)"));
  process.exitCode = allPass ? 0 : 1;
}

const watchdog = setTimeout(() => {
  diag.runnerErrors.push(`run exceeded ${RUN_TIMEOUT_MS}ms (watchdog)`);
  log("WATCHDOG: run timed out");
  finalize("run timed out").finally(() => process.exit(1));
}, RUN_TIMEOUT_MS);
watchdog.unref();
for (const event of ["unhandledRejection", "uncaughtException"]) {
  process.on(event, (error) => {
    diag.runnerErrors.push(`${event}: ${String(error && error.stack ? error.stack : error)}`);
    log(event.toUpperCase(), error && error.message ? error.message : error);
  });
}

try {
  if (!fs.existsSync(coursePath)) throw new Error("course not found: " + coursePath + " (is M9 applied to this working tree?)");

  const pw = loadPlaywright();
  const base = await startServer();
  baseOrigin = new URL(base).origin;
  browser = await launchBrowser(pw);
  cleanup.browser = "launched (temporary profiles)";
  log("browser:", browserInfo.name, browserInfo.version, "| base:", base);

  // Profile 1: a brand-new profile; A-F share it (the state built by B and C is what D, E and F look at).
  const p1 = await newProfile("profile-1");
  const env1 = { page: p1.page, base, diag, shot, state: {} };
  await runScenario("A", "Discover the course, its five lessons, locked/available states, direct URLs", env1, scenarioA);
  await runScenario("B", "Legacy PF-01..PF-07 in real Python, then the hand-over to PF-08 (no reset, not the end of the course)", env1, scenarioB);
  await runScenario("C", "PF-08..PF-15 in real Python and real NumPy: Run, wrong and right Submit, unlock, autosave, F5", env1, scenarioC);
  await runScenario("D", "Behavioural grading: multi-case functions, hard-coded answers, exceptions, NumPy shape/dtype/value", env1, scenarioD);
  await runScenario("E", "Isolation from CS116 and from M7 practice", env1, scenarioE);
  await runScenario("F", "Desktop and mobile viewport smoke (lessons, Python and NumPy workspaces, multi-case feedback)", env1, scenarioF);

  // Profile 2: a second brand-new profile for draft persistence, F5 and reopen (a new profile cannot enter M9).
  const p2 = await newProfile("profile-2");
  const env2 = { page: p2.page, base, diag, shot, state: {} };
  await runScenario("G", "Fresh profile: autosave, reopen, F5, history persistence, M9 stays locked", env2, scenarioG);
  const problems = [await closeContext(p2.context), await closeContext(p1.context)].filter(Boolean);
  if (problems.length) diag.runnerErrors.push("profile close failed: " + problems.join("; "));

  const envH = { page: env1.page, diag };
  await runScenario("H", "Diagnostics: no uncaught errors, no Local Python, CDN and NumPy healthy", envH, scenarioH);
} catch (e) {
  results.push({ id: "RUNNER", title: "Runner infrastructure", status: "FAIL", checks: [], error: String(e && e.stack ? e.stack : e), screenshots: [] });
  log("RUNNER ERROR:", e.message);
}
try { await finalize("runner stopped before this scenario"); }
catch (e) { console.error("[m9-qa] finalization failed:", e && e.stack ? e.stack : e); process.exitCode = 1; }
clearTimeout(watchdog);
process.exit(process.exitCode ?? 1);
