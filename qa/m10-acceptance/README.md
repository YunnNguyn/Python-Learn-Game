# M10 automated verification (PHASE-08 — Data Science Toolkit: NumPy, pandas, Matplotlib, workflows)

One command, from the repo root (Windows PowerShell) — typecheck, Vitest (strict), production build, then the real-Edge acceptance:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File '.\qa\m10-acceptance\run-m10-verification.ps1'
```

Browser part only:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File '.\qa\m10-acceptance\run-m10-acceptance.ps1'
```

Needs: branch `develop` at `5c317bb` (the committed M9) with M10 applied (uncommitted), nothing staged, `npm ci` done, Node, Microsoft Edge, and internet access to `cdn.jsdelivr.net/pyodide/` (the Pyodide interpreter **and the NumPy, pandas and Matplotlib packages** — PF-14 … PF-26 run on the real libraries). `playwright-core` is reused from `qa/m9-acceptance`, `qa/m8-acceptance`, `qa/m7-acceptance`, `qa/m70-smoke` or `qa/m3-acceptance` when present (no browser download); otherwise it is installed into this folder only.

Results: `M10_VERIFICATION_PASS` / `M10_VERIFICATION_FAILED` (verification script) and `M10_BROWSER_ACCEPTANCE_PASS` / `M10_BROWSER_ACCEPTANCE_FAILED` (browser part), plus `reports/<run-id>/report.md`, `report.json`, screenshots, `<run-id>.zip`, `reports/LATEST.txt`, and `reports/verification-<time>/` (one log per step, `verification-summary.json`, zip).
Options (env): `QA_HEADED=1` (watch), `QA_BASE_URL=http://127.0.0.1:<port>` (use a running dev server; it is left alone), `QA_EDGE_EXE=<path>`, `QA_SCENARIO_TIMEOUT_MS`, `QA_RUN_TIMEOUT_MS`.

`qa/m9-acceptance` and `qa/m8-acceptance` are **not modified**. They remain the record of the earlier milestones; they target the 15-activity course (their A/E/F scenarios assert "0/15", "15/15" and "PF-15 ends the course", which is no longer true with M10 applied). The M10 runner replays PF-01 … PF-15 with the same checks (adapted to the 26-activity course) and adds PF-16 … PF-26, so this folder is the one to run from now on.

## Scenarios (real Edge, real Vite app, real Monaco, real Pyodide + NumPy + pandas + Matplotlib, real MissionEngine / grader / function probes, real IndexedDB)

| | |
|---|---|
| **A Discover** | fresh profile: `/learn` lists both courses, Python Foundations says 0/26; the course page lists the seven worlds and ten lessons (3+4+3+3+2+3+2+2+2+2) in order; every M9 / M10 lesson is fully locked and names the activity that unlocks it; direct `/activity/` and `/mission/` URLs of PF-02 / PF-08 / PF-14 / PF-16 / PF-19 / PF-23 / PF-25 / VS-02 are refused by the service layer and link back into their own course; unknown ids |
| **B Legacy PF-01…PF-07** | the M8 contract in the same profile (Run records nothing, starter / wrong / reference Submit, hints, unlock, reward once, leave & resume); then **PF-07 is not the end of the course** — PF-08 is offered, nothing is reset |
| **C PF-08…PF-15 → M10** | the eight M9 missions (PF-10 with an F5 in the middle of the mission; PF-14 requests the real NumPy package); then **PF-15 is no longer the end of the course**: its next-step panel, the course page ("Học tiếp: PF-16", 15/26) and `/learn` all offer PF-16, PF-16 is available and PF-17 … PF-26 stay locked, and none of the 15 earlier passing attempts changed |
| **D PF-16…PF-26** | the eleven M10 missions, continued from the course's own "continue" action, each with: Pyodide badge, starter autosaved exactly to IndexedDB, Run (no grade, no attempt, no reward), H1 opens and carries no code, starter not passed, a plausible wrong solution names the real variable / function, no reference line on the page, reference passes, draft removed, next mission unlocked in the SAME course. Extras: **pandas and Matplotlib are fetched from the Pyodide CDN**; PF-24's buggy starter **runs and previews its misleading charts**; PF-23 / PF-26 **Run previews the learner's plot as a decoded PNG** (data URL, ≤ 4 images, ≤ 400 KB each, labelled "Biểu đồ N do mã của bạn vẽ"), records nothing, and a later Run of code that draws nothing **clears the old preview**; PF-25 / PF-26 list their CSV file(s) from `data/`; PF-25 **F5 keeps the same variant, data and CSV files**; first-pass reward for PF-16 once; PF-26 ends the course; lessons 6 … 10 and the course page show n/n |
| **E Typed-value grading** | PF-16: a `broadcast_shape` that always answers the displayed example passes the example and fails the hidden cases; `x_col` with the right numbers in a `(1, n)` row (or flat `(n,)`) is a **shape** mistake, not a value mistake; NumPy's own `ValueError` is the learner's error, not a runtime failure. PF-17 / PF-18: `keepdims` / batch **shape** mistakes; a function that divides its argument in place is told so. PF-19: Series vs DataFrame is a **type** mistake; `inplace=True` is reported on the variables it breaks. PF-20: a function writing a column into its argument. PF-21: `int64` instead of `float64` is a **dtype** mistake. PF-22: category as a column instead of the index is an **index / columns** mistake. PF-23: a missing legend is graded on the **figure** (not pixels); unsorted bars are reported on `ax_rank` only; Matplotlib's `ValueError` is a learner error. PF-24: fixing one chart does not hide the other; aggregation-only fixes still fail both charts. PF-25: wrong join / duplicates caught on `dataset`; `check_columns` returning a bool instead of raising. PF-26: unstandardised matrix, missing axis labels (figure graded, pipeline accepted), mutated argument. Every section ends with the reference passing |
| **F Isolation** | every stored attempt / concept is Python Foundations', all 26 passed, the new concepts (broadcasting … data-pipeline) credited, the M7 practice database was never created, CS116 still starts at VS-01 with VS-02 locked, per-course pills (26/26 vs 0/…), one first-pass reward per mission (26), the finished course offers "Ôn tập:", no draft left by passed missions |
| **G Viewports** | desktop 1280×800 and mobile 390×844: `/learn`, course, lessons 1 / 5 / 6 / 7 / 9 / 10, PF-14 / PF-16 / PF-23 activity pages without horizontal page scroll; the Python (PF-08), NumPy (PF-16), pandas (PF-19) and CSV (PF-25) workspaces are usable and Run works; the **plot preview fits the viewport**; long typed-value feedback (PF-22) fits |
| **H Fresh profile** | a brand-new profile: autosave to IndexedDB, reopen, **F5**, history persistence, PF-02 locked, and M9 (PF-08) / M10 (PF-16, PF-19, PF-25) locked — a new profile cannot jump ahead |
| **I Diagnostics** | no uncaught page errors, no console errors, no request to any other localhost origin (Local Python `:8765` is blocked and fails the run), every Pyodide CDN request succeeded, **NumPy, pandas and Matplotlib were fetched from the CDN**, plot previews were decoded by the browser, the Local Python badge never appeared |

## Isolation and honesty rules

- Fresh, temporary Edge contexts (never your profile); data is discarded at close. IndexedDB is only **read** — all progress is produced through the UI. Editor input goes through the real clipboard (Ctrl+V), never synthetic events.
- Network: only the app's own localhost origin and `GET https://cdn.jsdelivr.net/pyodide/…`; everything else is aborted and listed.
- A scenario with no assertions, a timeout or any failed check is FAIL. There is no SKIP. The PASS marker requires A–I all PASS, no page/runner errors, no blocked local-service request, browser closed and the runner-owned server stopped, and the browser to be Microsoft Edge.
- `fixtures/solutions.json` is a JSON copy of the starters and of the M8 + M9 + M10 reference / wrong solutions (the plain-`.mjs` runner cannot import TypeScript). `tests/python-foundations/qa-m10-fixture-sync.test.ts` fails if the copy ever differs.
- Hidden grading cases are **not** secure in the browser build: they are absent from the learner UI and from feedback, not cryptographically hidden. Scenarios D / E verify what the learner is shown, not secrecy against DevTools.
- Plots are graded on figure **properties** (title, labels, legend, series kind / order / values), never on pixels; the PNG preview is for the learner's eyes and is only checked here for being a valid, decoded, bounded image.

## What cannot be verified automatically

Visual polish and the *correctness of what the chart looks like* at other viewport sizes, keyboard-shortcut feel, screen-reader accessibility, Vietnamese copy quality, other browsers, long-running performance, timeouts of runaway learner code in the real browser worker (covered by unit tests), the first-load time of the pandas / Matplotlib wheels on a slow connection, and that the CS116 course *itself* still completes end to end (isolation is checked here from the Python side and by unit/service tests in both directions). The Vite dev server is used, not the production build (`npm run build` in the verification script covers that).
