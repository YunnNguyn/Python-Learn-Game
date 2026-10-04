# Roadmap — From Design Lock to NumPy Vertical Slice

> **2026-10-03 fast-track roadmap lock — supersedes the older visualization-first phase order below.**

Current production sequence:

```text
Phase A — First Real Playable Mission                         COMPLETE / LOCKED
Phase B — Persistent Learning Loop                           COMPLETE / LOCKED
Phase C — Reward & Meta-Game Foundation + Robot Workshop v1 COMPLETE / LOCKED
Phase D — Complete CS116 NumPy vertical slice VS-01..VS-07 COMPLETE / LOCKED
Phase E — Alpha Learning Experience                         CURRENT
Phase F — Curriculum expansion + optional meta-game systems
Phase G — Optional accounts / friends / cups after a backend exists
```

Phase C explicitly does **not** add Phaser or require per-mission game-world visualization. Its acceptance target is an idempotent reward pipeline, persisted inventory, bounded daily goals, anti-farming rules, and one real optional mini-system that consumes rewards without affecting grading/mastery.

## Roadmap Rules

This roadmap decomposes implementation into small tasks that can be assigned to Codex separately.

Rules:

1. Complete and validate each foundation before depending on it.
2. Build only the generic capability needed by the next playable slice.
3. Keep CS116 in the content layer.
4. Do not expand the NumPy world before the vertical slice proves the full pipeline.
5. Do not implement deferred marketplace, cloud, multiplayer, no-code authoring, or extra runtime systems.

Historical foundation order and current production phase order:

```text
Phase 0 + Foundations 1–5 — COMPLETE / LOCKED
App Shell + Python Runtime + Mission Pipeline — COMPLETE / LOCKED
Phase A — First Real Playable Mission — COMPLETE / LOCKED
Phase B — Persistent Learning Loop — COMPLETE / LOCKED
Phase C — Reward & Meta-Game Foundation + Robot Workshop v1 — COMPLETE / LOCKED
Phase D — Complete NumPy Vertical Slice VS-01..VS-07 — COMPLETE / LOCKED
Phase E — Alpha Learning Experience — CURRENT
Then expand curriculum and optional meta-game systems
```

The older Visualization Bridge section later in this document is retained as design history/reference only and is not on the active critical path.


## Phase E — Alpha Learning Experience

Goal: turn the complete NumPy slice into a coherent daily learning product before expanding content.

Current scope:

- derived linear activity unlock/progression without mutating AttemptRecord semantics;
- preserve access to legacy activities that already have attempts;
- "Hôm nay nên học gì?" recommendation on the learning dashboard;
- lightweight self-check inside the lesson tab, deliberately separate from mastery/grading evidence;
- keyboard shortcuts and sticky run/submit controls for faster practice;
- locked-state UX at lesson, activity and mission-service boundaries;
- laptop/mobile/accessibility polish.

Acceptance: a new learner can follow VS-01 → VS-07 without guessing what to do next, cannot accidentally skip the instructional sequence through normal navigation, can still resume old progress, and can move from lesson → practice with minimal scrolling.

## Phase 0 — Design Lock

Status: **complete when all six source-of-truth documents pass consistency validation**.

Deliverables:

- `PRODUCT_SPEC.md`
- `CURRICULUM.md`
- `MISSION_SYSTEM.md`
- `TECH_ARCHITECTURE.md`
- `ROADMAP.md`
- `DEV_STATUS.md`

Acceptance:

- canonical terminology is consistent;
- Engine / Content / Visualization separation is explicit;
- curriculum ownership is explicit;
- vertical slice is consistent;
- implementation has not started.

## Foundation 1 — Domain Types + Schemas

Goal: encode the locked domain contracts without building application behavior.

### F1.1 Project/tooling bootstrap for domain work

Create the minimum Vite/TypeScript project/tooling required to compile and test domain definitions.

Do not add Phaser/Pyodide behavior yet.

### F1.2 Core enums and IDs

Define initial types/enums for:

- `KnowledgeClassification`;
- `LearningStage`;
- `LearningActivityType`;
- `MasteryState`;
- review reasons;
- difficulty;
- stable ID aliases where useful.

### F1.3 Concept schema

Define schema/type for `Concept`:

```text
id
title
description
classification
source
prerequisites
tags
```

### F1.4 Curriculum hierarchy schemas

Define:

- Course;
- World;
- Lesson;
- references to `LearningActivity`.

Do not encode concept prerequisites through hierarchy.

### F1.5 LearningActivity schema

Define generic `LearningActivity` with extension-safe activity type and mission reference where applicable.

### F1.6 MissionTemplate schema

Define references for:

- concepts;
- stages;
- generator;
- grader;
- runtime;
- hints;
- visualization;
- restrictions.

### F1.7 MissionInstance schema

Define generated-instance fields including:

- template/version;
- seed;
- difficulty;
- objective/context;
- setup/starter code;
- grader/world data.

### F1.8 ContentPack manifest schema

Define:

- `id`;
- `version`;
- `schemaVersion`;
- metadata;
- courses;
- dependencies.

### F1.9 AttemptRecord and WorldEvent schemas

Define the initial raw learning-evidence contract and framework-neutral event envelope. Lock `AttemptRecord` so one Submit creates one immutable record; failed and successful submissions both produce records. Keep exact field/schema choices within this Foundation 1 task.

### F1.10 Schema fixtures and validation

Create a few minimal valid/invalid fixtures proving the contracts compile/validate.

Exit criteria:

- all locked domain terms have one canonical schema/type;
- schemas do not depend on React, Phaser, Pyodide, or IndexedDB implementation details.

## Foundation 2 — Content Registry + Validator

Goal: load and validate content definitions before runtime/game features exist.

### F2.1 In-memory Content Registry

Add registration/query APIs for:

- packs;
- concepts;
- courses/worlds/lessons;
- activities;
- mission templates.

### F2.2 Duplicate-ID validation

Reject duplicate IDs with actionable development errors.

### F2.3 Reference validation

Validate:

- concept references;
- lesson/activity references;
- mission template references.

### F2.4 Extension-ID validation

Prepare registry checks for generator, grader, runtime, hint, and visualization IDs.

Implement only IDs needed by current foundations.

### F2.5 Content/schema version checks

Reject unsupported schema versions and malformed pack metadata.

### F2.6 Developer validation entry point

Create the first form of future `content:validate`.

Exit criteria:

- invalid content fails loudly before gameplay;
- normal content can be registered without core source edits.

## Foundation 3 — Concept Graph + Activity Registry

Goal: separate knowledge dependencies from course presentation.

### F3.1 Concept Graph builder

Build graph from registered concept prerequisites.

### F3.2 Cycle detection

Reject dependency cycles.

### F3.3 Dependency queries

Support direct prerequisites and prerequisite traversal required by learning/review logic.

### F3.4 Activity Registry

Register/query `LearningActivity` by:

- ID;
- concepts;
- stage;
- type.

### F3.5 Minimal CS116 vertical-slice definitions

Register only the seven concepts required for the first slice plus skeleton activity metadata.

Do not author all NumPy content.

Exit criteria:

- presentation hierarchy and Concept Graph can change independently;
- activity lookup can support lesson, review, and practice selection.

## Foundation 4 — Mission Template / Instance + Seeded RNG

Goal: establish deterministic mission generation contracts.

### F4.1 Seeded RNG abstraction

Implement one deterministic RNG interface suitable for generators.

### F4.2 MissionTemplate resolution

Resolve a template by stable ID/version.

### F4.3 MissionInstance creation contract

Create instances through generator output rather than static exercise assumptions.

### F4.4 Determinism tests

Verify:

```text
same template/version/config/difficulty/seed
→ same MissionInstance
```

### F4.5 Deterministic retry policy

Define deterministic sub-seed behavior if a generated candidate fails validation.

Exit criteria:

- generation does not call `Math.random()`;
- attempt data can reproduce a generated mission.

## Foundation 5 — Generator + Grader Registries

Goal: make exercise generation and grading reusable.

### F5.1 Generator Registry

Map generator IDs to implementations behind a common interface.

### F5.2 First simple generators

Implement only generators needed by VS-01 through VS-05.

### F5.3 Instance validators

Add mission-family invariants such as non-empty/non-universal boolean-filter results.

### F5.4 Declarative Grader Engine

Implement minimum useful primitives:

- variable exists;
- ndarray/type;
- shape;
- exact/approx values;
- no exception.

### F5.5 Grader Registry escape hatch

Support registered custom grader interface without needing a custom grader yet.

### F5.6 Reference solver test loop

For generated missions:

```text
generate
→ validate
→ reference solve
→ grade
→ reference answer passes
```

Exit criteria:

- new normal missions can select/configure existing generators and graders;
- generated instances are validated before play.

## App Shell — React Workspace

Goal: create the smallest usable browser shell around established domain services.

### AS.1 Vite/React shell

Add app boot and routing/layout.

### AS.2 Feature boundaries

Create only feature entry points required for:

- home/course entry;
- lesson/activity launch;
- mission workspace;
- settings/debug development needs.

### AS.3 Monaco workspace

Add editor integration behind mission-workspace components.

### AS.4 Basic mission panels

Render:

- objective;
- setup/data preview;
- editor;
- Run/Submit controls;
- output/error area.

Exit criteria:

- UI consumes engine/domain APIs rather than containing mission logic.

## Python Runtime — Pyodide Worker

Goal: safely execute learner Python without freezing the main UI.

### PR.1 RuntimeManager interface

Define generic request/response contract.

### PR.2 Pyodide Web Worker boot

Load Pyodide in worker.

### PR.3 Basic code execution

Return stdout and exceptions.

### PR.4 Mission setup execution

Prepare setup data/environment for an instance.

### PR.5 Timeout and worker replacement

Prove recovery from infinite loop.

### PR.6 Environment restoration

After worker replacement, rebuild current mission setup.

Exit criteria:

- UI remains responsive when learner code hangs;
- callers do not depend directly on Pyodide.

## Mission Pipeline — Run + Submit + Grading

Goal: establish the complete executable activity lifecycle.

### MP.1 Run pipeline

Execute code for experimentation and return stdout/errors.

Do not grade hidden checks or update mastery. When runtime output is safely interpretable, allow optional ephemeral preview state / semantic events for visualization; these previews never become authoritative progress.

### MP.2 Fresh-state Submit pipeline

Recreate mission environment and execute setup + player code.

### MP.3 Grading integration

Feed execution results into declarative grader.

### MP.4 Structured feedback rendering

Render runtime/type/shape/value feedback without exposing full solution.

### MP.5 Attempt evidence envelope

Produce exactly one immutable `AttemptRecord` evidence snapshot for each Submit, including failed submissions. Capture submission-local evidence such as `submissionIndex` and `runCountBeforeSubmit` rather than a mutable aggregate `submitCount`.

Exit criteria:

- Run state cannot leak into Submit;
- grader output is structured and reusable.

## Visualization Bridge — Semantic Events + Phaser

Goal: prove code results can cause meaningful game-world reactions without coupling content to Phaser.

### VB.1 WorldEvent Bridge

Route semantic events to active visualization modules.

### VB.2 VisualizationModule contract

Define renderer-neutral lifecycle.

### VB.3 Sensor Control Room scene

Create one small Phaser scene.

### VB.4 SensorGrid module

Visualize array/grid state needed by VS-01.

### VB.5 RadarTargets module

React to selected-target semantic events.

### VB.6 StatusPanel

Show relevant semantic/system state if needed.

Exit criteria:

- mission code contains no direct Phaser object manipulation;
- one semantic event produces a visible, correct reaction.

## Learning System — Attempt History + Mastery

Goal: persist raw evidence and derive useful mastery states.

### LS.1 IndexedDB persistence boundary

Implement repository/service APIs behind generic persistence interfaces.

### LS.2 AttemptRecord persistence

Store each successful and failed Submit as its own immutable record with seed/version/concept/hint evidence.

### LS.3 Initial mastery derivation

Implement simple rules for:

```text
DISCOVERED
PRACTICING
INDEPENDENT
TRANSFERRED
RETAINED
```

### LS.4 Progress queries

Expose concept state and activity completion to UI.

Exit criteria:

- raw attempts remain the source evidence;
- one failure does not erase historical mastery.

## Review / Retry Variant — Vertical Slice Minimum

Goal: implement only the replay/review capability needed to prove the first vertical slice.

### RR.1 Retry Same Instance

Allow learner to revisit the current seed.

### RR.2 Retry Variant

Generate a new valid seed for the same learning intent.

### RR.3 Minimal concept-based review selection

Support the minimum concept-based selection required for VS-07. The underlying review reasons may include:

```text
WEAK
STALE
DEPENDENCY
RECENT_FAILURE
```

with a simple v1 priority function. Do not implement full Recovery Run composition or Free Practice session composition/UI before the first vertical-slice playtest.

Exit criteria:

- Retry Same Instance works;
- Retry Variant produces a fresh valid task;
- VS-07 can select a minimal concept-based review activity;
- no separate review/practice engine is introduced.

## NumPy Vertical Slice

Goal: implement the first complete learning experience.

Concept lock:

```text
numpy.array
numpy.shape
numpy.ndim
numpy.index.column
numpy.compare
numpy.boolean_mask
numpy.logical_and
```

### VS implementation tasks

1. VS-01 — Boot Sensor Grid.
2. VS-02 — Diagnose Telemetry.
3. VS-03 — Extract Threat Channel.
4. VS-04 — Radar Filter.
5. VS-05 — Radar Filter Variant.
6. VS-06 — Hostile Contact.
7. VS-07 — Recall Packet.

For each activity:

- author content definition;
- configure/generate mission instance where applicable;
- add grader config;
- add H1–H4 hints where allowed;
- keep generated learner data and hidden grading data separated;
- add focused content tests.

Vertical-slice technical acceptance:

- editor works;
- Python execution works;
- runtime errors/infinite loops recover;
- Submit starts clean;
- seeded generation reproduces;
- grader works;
- progress persists;
- Retry Variant changes the task;
- all seven missions generate reproducibly and grade the intended learner outputs.

Learning acceptance:

The learner can independently:

- interpret array shape;
- extract a column;
- write a boolean condition;
- combine conditions;
- solve VS-06 transfer;

without H3/H4.

## Playtest

Goal: validate learning and UX before expanding content volume.

### PT.1 Developer playthrough

Complete slice from a clean profile and deliberately test wrong shapes, runtime errors, and hint paths.

### PT.2 Replay test

Repeat generated missions with multiple seeds.

### PT.3 Minimal review-selection test

Inspect the concept-based selection used by VS-07 and confirm it can prioritize relevant weak/recent-failure evidence without requiring full Recovery Run composition.

### PT.4 Exam-assistance test

Verify activity restrictions can disable relevant assistance without redesign.

### PT.5 Friction review

Identify:

- unclear objectives;
- feedback that gives away answers;
- weak task-to-feedback links;
- generators that produce trivial variants;
- persistence/progression confusion.

Fix vertical-slice issues before broad curriculum authoring.

## Post-Playtest Review Expansion — Recovery Run + Free Practice

Begin only after the first vertical-slice playtest has completed and its blocking issues are fixed, unless implementation evidence proves one of these capabilities is required earlier.

### PRX.1 Recovery Run composition

Compose short sessions from weak/stale/dependency/recent-failure evidence using the same Concept, LearningActivity, MissionTemplate, and review architecture.

Target behavior remains the design in `MISSION_SYSTEM.md`, such as a short ~10–15 minute recovery session. Do not reset historical progress.

### PRX.2 Free Practice session composition

Allow selection by concept, difficulty, and session size using the same activity/mission registries.

### PRX.3 Free Practice UI

Add only the UI required to configure and launch those sessions after the underlying selection flow is proven.

Exit criteria:

- Recovery and Free Practice reuse the normal learning/mission architecture;
- no separate practice engine exists;
- these features did not block the first NumPy vertical slice.

## Expand NumPy World

Only after vertical-slice playtest passes:

1. array creation;
2. broader indexing/slicing/fancy indexing;
3. logical OR/NOT;
4. reshape/transpose;
5. vectorized operations;
6. aggregation/axis;
7. broadcasting;
8. centering/standardization;
9. dot product/matrix multiplication;
10. required matrix operations;
11. integrated NumPy boss.

Expand by small concept clusters. Reuse existing generators, graders, events, and visualization modules whenever possible.

Add a new engine primitive only when existing abstractions cannot express a real recurring content need.

## Later Curriculum Expansion

After World 1 is stable, proceed through the curriculum order in `CURRICULUM.md`:

```text
World 2 — Python for Data Science
World 3 — ML Pipeline
World 4 — Data Validation & EDA
World 5 — Feature Engineering
World 6 — Advanced Data Processing
World 7 — Feature Selection
World 8 — ML Models
World 9 — Ensemble & AutoML
World 10 — Model Selection
World 11 — Imbalanced Data & Error Analysis
Final — End-to-end ML Campaign + paper-exam simulation
```

Each world should be decomposed into concept clusters and small vertical increments rather than one large implementation task.

