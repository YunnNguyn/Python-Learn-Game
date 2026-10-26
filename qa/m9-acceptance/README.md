# M9 automated verification (PHASE-07 — curriculum expansion & behavioural grading)

One command, from the repo root (Windows PowerShell) — typecheck, Vitest (strict), production build, then the real-Edge acceptance:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File '.\qa\m9-acceptance\run-m9-verification.ps1'
```

Browser part only (about the same as `qa/m8-acceptance`):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File '.\qa\m9-acceptance\run-m9-acceptance.ps1'
```

Needs: branch `develop` at `cf7daf1` (accepted M8) with M9 applied (uncommitted), nothing staged, `npm ci` done, Node, Microsoft Edge, and internet access to `cdn.jsdelivr.net/pyodide/` (the Pyodide interpreter **and the NumPy package** — PF-14 / PF-15 run on real NumPy). `playwright-core` is reused from `qa/m8-acceptance`, `qa/m7-acceptance`, `qa/m70-smoke` or `qa/m3-acceptance` when present (no browser download).

Results: `M9_VERIFICATION_PASS` / `M9_VERIFICATION_FAILED` (verification script) and `M9_BROWSER_ACCEPTANCE_PASS` / `M9_BROWSER_ACCEPTANCE_FAILED` (browser part), plus `reports/<run-id>/report.md`, `report.json`, screenshots, `<run-id>.zip`, `reports/LATEST.txt`, and `reports/verification-<time>/` (one log per step, `verification-summary.json`, zip).
Options (env): `QA_HEADED=1` (watch), `QA_BASE_URL=http://127.0.0.1:<port>` (use a running dev server; it is left alone), `QA_EDGE_EXE=<path>`, `QA_SCENARIO_TIMEOUT_MS`, `QA_RUN_TIMEOUT_MS`.

## Scenarios (real Edge, real Vite app, real Monaco, real Pyodide + NumPy, real MissionEngine/grader/function probes, real IndexedDB)

| | |
|---|---|
| **A Discover** | fresh profile: `/learn` lists both courses, Python Foundations says 0/15; the course page lists the three worlds and five lessons (3 + 4 + 3 + 3 + 2) in order; every M9 lesson is fully locked and names the activity that unlocks it; direct `/activity/` and `/mission/` URLs of PF-02 / PF-08 / PF-14 / VS-02 are refused by the service layer and link back into their own course; unknown ids |
| **B Legacy PF-01…PF-07** | the M8 contract in the same profile: Run records nothing, starter / wrong / reference Submit, hints, unlock, reward once, leave & resume; then **PF-07 is not the end of the course** — the next-step panel and the course's continue action offer PF-08, nothing is reset, PF-08 opens and PF-09 stays locked |
| **C PF-08…PF-15** | the eight M9 missions in order, same checks (Pyodide badge, starter autosaved to IndexedDB, Run vs Submit, starter not passed, plausible wrong solution names the real mistake, no reference line on the page, reference passes, draft removed, next mission unlocked in the SAME course); PF-10: H1 hint and an **F5 in the middle of the mission** (exact draft, same seed/variant, same data); PF-08 first-pass reward once; PF-12 reports the real `TypeError`; PF-14 requests the **real NumPy package** from the Pyodide CDN; PF-15 ends the course; the three M9 lessons and the course page show 3/3, 4/4, 3/3, 3/3, 2/2 |
| **D Behavioural grading** | PF-11: each function is graded on several cases; a function that **returns the displayed example's constants** passes the example (✓) and fails the others (✗) and the failing hidden case does not reveal its expected value; wrong value / wrong type / "should raise but returned" / mutated input / crash (`TypeError`) each get their own explanation; the reference passes. PF-13: swallowing invalid JSON fails its case. PF-14: hard-coded `describe_array`, wrong dtype, reference on real NumPy. PF-15: input mutation and wrong-axis mean fail, reference passes |
| **E Isolation** | every stored attempt / concept is Python Foundations', all fifteen passed, new M9 concepts credited, the M7 practice database was never created, CS116 still starts at VS-01 with VS-02 locked, per-course progress pills (15/15 vs 0/…), one first-pass reward per mission, the finished course offers "Ôn tập:" (not PF-07) |
| **F Viewports** | desktop 1280×800 and mobile 390×844: `/learn`, course, lessons 1 / 3 / 5, `PF-08` and `PF-14` activity pages render without horizontal page scroll; the Python workspace (PF-08), the NumPy workspace (PF-14) and the multi-case feedback (PF-11) are usable at both sizes |
| **G Fresh profile** | a brand-new profile: autosave to IndexedDB, reopen, **F5**, history persistence, PF-02 locked, and M9 (PF-08) locked — a new profile cannot jump into M9 |
| **H Diagnostics** | no uncaught page errors, no console errors, no request to any other localhost origin (Local Python `:8765` is blocked and fails the run), every Pyodide CDN request succeeded, **NumPy was fetched from the CDN**, the Local Python badge never appeared |

## Isolation and honesty rules

- Fresh, temporary Edge contexts (never your profile); data is discarded at close. IndexedDB is only **read** — all progress is produced through the UI. Editor input goes through the real clipboard (Ctrl+V), never synthetic events.
- Network: only the app's own localhost origin and `GET https://cdn.jsdelivr.net/pyodide/…`; everything else is aborted and listed.
- A scenario with no assertions, a timeout or any failed check is FAIL. There is no SKIP. The PASS marker requires A–H all PASS, no page/runner errors, no blocked local-service request, browser closed and the runner-owned server stopped, and the browser to be Microsoft Edge.
- `fixtures/solutions.json` is a JSON copy of the starters and of the M8 + M9 reference / wrong solutions (the plain-`.mjs` runner cannot import TypeScript). `tests/python-foundations/qa-m9-fixture-sync.test.ts` fails if the copy ever differs.
- Hidden grading cases are **not** secure in the browser build: they are absent from the learner UI and from feedback, not cryptographically hidden (see the grading notes in the handoff report). Scenario D verifies what the learner is shown, not secrecy against DevTools.

## What cannot be verified automatically

Visual polish at other viewport sizes, keyboard-shortcut feel, screen-reader accessibility, Vietnamese copy quality, other browsers, long-running performance, timeouts of runaway learner code in the real browser worker (covered by unit tests), and that the CS116 course *itself* still completes end to end (isolation is checked here from the Python side and by unit/service tests in both directions). The Vite dev server is used, not the production build (`npm run build` in the verification script covers that).
