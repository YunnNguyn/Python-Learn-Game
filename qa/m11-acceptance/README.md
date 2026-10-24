# M11 automated verification (PHASE-09 — Course Completion, Capstone, Review & Learning UX)

One command, from the repo root (Windows PowerShell) — typecheck, Vitest (strict), production build, then the real-Edge acceptance:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File '.\qa\m11-acceptance\run-m11-verification.ps1'
```

Browser part only:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File '.\qa\m11-acceptance\run-m11-acceptance.ps1'
```

Needs: branch `develop` at `08fee96` (the committed M10) with M11 applied (uncommitted), nothing staged, `npm ci` done, Node, Microsoft Edge, and internet access to `cdn.jsdelivr.net/pyodide/` (the Pyodide interpreter **and the NumPy, pandas and Matplotlib packages** — PF-14 … PF-27 run on the real libraries). `playwright-core` is reused from `qa/m10-acceptance`, `qa/m9-acceptance`, `qa/m8-acceptance`, `qa/m7-acceptance`, `qa/m70-smoke` or `qa/m3-acceptance` when present (no browser download); otherwise it is installed into this folder only.

Results: `M11_VERIFICATION_PASS` / `M11_VERIFICATION_FAILED` (verification script) and `M11_BROWSER_ACCEPTANCE_PASS` / `M11_BROWSER_ACCEPTANCE_FAILED` (browser part), plus `reports/<run-id>/report.md`, `report.json`, screenshots, `<run-id>.zip`, `reports/LATEST.txt`, and `reports/verification-<time>/` (one log per step, `verification-summary.json`, zip).
Options (env): `QA_HEADED=1` (watch), `QA_BASE_URL=http://127.0.0.1:<port>` (use a running dev server; it is left alone), `QA_EDGE_EXE=<path>`, `QA_SCENARIO_TIMEOUT_MS`, `QA_RUN_TIMEOUT_MS`.

`qa/m10-acceptance`, `qa/m9-acceptance` and `qa/m8-acceptance` are **not modified**. They remain the record of the earlier milestones; they target the 26-, 15- and 7-activity courses (their scenarios assert "0/26", "26/26" and "PF-26 ends the course", which is no longer true with M11 applied). The M11 runner replays PF-01 … PF-26 with the same checks (adapted to the 27-activity course, where PF-26 is **not** the end) and adds the capstone PF-27, the course completion summary, the review panel and the fresh-variant retry, so this folder is the one to run from now on.

## Scenarios (real Edge, real Vite app, real Monaco, real Pyodide + NumPy + pandas + Matplotlib, real MissionEngine / grader, real IndexedDB)

| | |
|---|---|
| **A Discover** | fresh profile: `/learn` lists both courses, Python Foundations says 0/27; the course page lists the eight worlds and **eleven lessons** (3+4+3+3+2+3+2+2+2+2+1 = 27 activities) in order and states "0/27" without any completion summary; every M9 / M10 / M11 lesson is fully locked and names the activity that unlocks it; direct `/activity/` and `/mission/` URLs of PF-02 / PF-08 / PF-14 / PF-16 / PF-19 / PF-23 / PF-25 / **PF-27** / VS-02 are refused by the service layer — **also `/mission/<PF-27>?variant=3`** (the variant parameter is not a bypass) |
| **B Legacy PF-01…PF-07** | the M8 contract in the same profile; **PF-07 is not the end of the course** — PF-08 is offered, nothing is reset |
| **C PF-08…PF-15** | the eight M9 missions (PF-10 with an F5 in the middle); PF-15 is not the end of the course (15/27, "Học tiếp: PF-16"); none of the 15 earlier attempts changed; lessons 6 … 11 are locked |
| **D PF-16…PF-26 → 26/27** | the eleven M10 missions (pandas / Matplotlib from the CDN, plot previews, CSV workspaces, F5 on PF-25). **PF-26 is no longer the end of the course**: its next-step panel offers PF-27; the course page says "Học tiếp: PF-27" and **26/27**, shows the plain progress line, has no completion summary and no "Bạn đã hoàn thành khóa học"; `/learn` agrees |
| **E Typed-value grading** | the M10 behavioural checks (shape / dtype / index / figure / mutation / hard-coded answers / learner errors), unchanged |
| **F Capstone PF-27 (guided)** | entered from the course's own "continue"; Pyodide badge; starter autosaved exactly; the annotation CSV listed; the idle note says **Run only tries (no grade, no progress), Submit grades on a clean Python**; the lesson card has no "new topics"; Run records nothing; **F5** on a draft keeps the variant, data and CSV; **H1–H3 opened** (H1 has no code, none of the reference's lines on the page); six wrong solutions (hard-coded visible result, dedupe-before-validate, in-place mutation, corner-format `X`, chart without axis labels, float `rejected`) are not passed and name the real mistake; failed attempts keep the course at 26/27; the reference's Run **previews the chart**; Submit passes and stores `hintsUsed = [H1,H2,H3]`; the panel says **"Bạn đã hoàn thành khóa học này"**, separates completing from mastering, says the pass used H3/H4 and asks for a hint-free retry on a fresh variant; first-pass reward once, **no focused-pass reward** for a guided pass |
| **G 27/27 summary, review, retry** | the course page shows the **completion summary** (derived from stored attempts; no certificate / badge / score), no perpetual "continue" button; **GUIDED** label (`data-evidence=WITH_SUPPORT`), nothing claimed RETAINED (24h rule not met), the evidence table lists the attempts; the **review panel** shows ≤ 3 distinct Python Foundations items (never CS116, never locked) or explains why it is empty; `/learn` card has summary / review / retry links and the Today card stays in-course; the hash link **focuses the summary**; the retry link opens `/mission/<PF-27>?variant=N` — a **fresh variant** with its own seed, different data and CSV, no hint open, no attempt created; a failed Submit there **never revokes completion**; F5 on that URL keeps the variant; the reference passes **without hints** (`hintsUsed = []`) -> **INDEPENDENT** label ("cho riêng capstone này, không phải điểm số của cả khóa"), focused-pass reward once; **"Tạo đề mới"** puts the new variant in the address bar, moves focus to the new heading and survives F5; a **review item** opens a fresh variant of an earlier activity, its passing attempt is stored on that variant's seed, no second first-pass reward, course still complete |
| **H Isolation** | every stored attempt / concept is Python Foundations', all 27 passed (`python.annotation-qa` credited), the M7 practice database was never created, CS116 still starts at VS-01 with VS-02 locked, per-course pills (27/27 vs 0/…), the graduated card has no "continue" while CS116's is untouched, one first-pass reward per mission (27), no draft left by passed missions |
| **I Viewports** | desktop 1280×800 and mobile 390×844: `/learn`, course, lessons 1 / 5 / 6 / 7 / 9 / 10 / 11, PF-14 / PF-16 / PF-23 / PF-27 activity pages without horizontal scroll; the NumPy, pandas, CSV and capstone workspaces are usable and Run works; **the completion summary and the review panel fit the viewport, `#course-completion` receives keyboard focus, its actions are tappable and Tab is not trapped**; the plot preview and long typed-value feedback fit |
| **J Fresh profile** | a brand-new profile: autosave, reopen, **F5**, history persistence, PF-02 locked, M9 / M10 / **M11 (PF-27, also through `?variant=0`)** locked; the course page shows plain 0/27 progress |
| **K Diagnostics** | no uncaught page errors, no console errors, no request to any other localhost origin (Local Python `:8765`), every Pyodide CDN request succeeded, **no blocked external request at all**, NumPy / pandas / Matplotlib fetched from the CDN, ≥ 8 plot previews decoded, the Local Python badge never appeared |

## Isolation and honesty rules

- Fresh, temporary Edge contexts (never your profile); data is discarded at close. IndexedDB is only **read** — all progress, including the 27/27 state, is produced through the UI. **No 27/27 is ever fabricated by writing to IndexedDB.** Editor input goes through the real clipboard (Ctrl+V), never synthetic events.
- Network: only the app's own localhost origin and `GET https://cdn.jsdelivr.net/pyodide/…`; everything else is aborted, listed and fails scenario K.
- A scenario with no assertions, a timeout or any failed check is FAIL. There is no SKIP. The PASS marker requires A–K all PASS, no page/runner errors, no blocked local-service request, browser closed and the runner-owned server stopped, and the browser to be Microsoft Edge (the PowerShell wrapper requires it).
- `fixtures/solutions.json` is a JSON copy of the starters and of the M8 + M9 + M10 + M11 reference / wrong solutions (the plain-`.mjs` runner cannot import TypeScript). `tests/python-foundations/qa-m11-fixture-sync.test.ts` fails if the copy ever differs.
- The completion label is a statement about stored attempts only: it never says "mastered", gives no score and no certificate. The READY/RETAINED wording follows the existing mastery rules (a retention-stage pass, or a review pass ≥ 24 h after the first success) and is therefore **not** reachable in a few minutes of automated play; the runner asserts that it is *not* claimed.
- Hidden grading cases are **not** secure in the browser build. Plots are graded on figure properties, never on pixels.

## What cannot be verified automatically

Visual polish, the *look* of the summary / review panel and of the capstone chart, keyboard-shortcut feel beyond the focus checks above, screen-reader announcements, Vietnamese copy quality, other browsers, the `RETAINED` label after a real 24 h gap (covered by unit tests with injected timestamps), the first-load time of the pandas / Matplotlib wheels on a slow connection, the error text on a cold / offline network, and that the CS116 course itself still completes end to end. The Vite dev server is used, not the production build (`npm run build` in the verification script covers that).
