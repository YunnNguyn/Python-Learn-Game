# Product Spec — Python/ML Learning Game

> **2026-10-03 product-direction lock — supersedes visualization-first requirements below.**
> **2026-10-03 UI theme lock:** the production web app uses a native dark interface by default (dark slate surfaces, light text, blue accent). This is the official product theme rather than a browser-extension transformation; Monaco remains dark to match the surrounding workspace.
> The production product is first and foremost a focused Python/ML learning and exercise web app. Ordinary missions do **not** need a game-world or semantic visualization. Run/Submit, grading, mastery, review, and learning clarity stay primary. Gamification lives beside the learning loop as optional meta progression: learning evidence can grant durable rewards used by systems such as Robot Workshop, collections, pets, gardens, daily goals, and later social cups. A visualization may still be added when it materially teaches a concept, but Phaser/game-world reaction is no longer a product acceptance requirement.

Current high-level loop:

```text
learn / practice / review
→ immutable AttemptRecord
→ Learning Engine (progress + mastery)
→ Reward / Meta Progression Engine
→ inventory / daily goals / optional mini-systems
```

The reward layer must never change grader outcomes or mastery evidence. Repeated easy submissions must not provide an unlimited farming path.

## 1. Product Vision

Build an extensible browser-based Python/ML learning application in which the learner writes real code, receives structured feedback, builds durable mastery, and can optionally use learning rewards in separate meta-game systems.

The initial learning path is:

```text
Python
→ NumPy
→ Data Science
→ Machine Learning
```

The first production curriculum is **CS116 — Python Programming for Machine Learning**. CS116 is the first content package, not the definition of the engine. The same learning architecture should later support Deep Learning, PyTorch, Computer Vision, NLP, Kaggle practice, and additional exercise packs.

The central product rule is:

> The learner must do the programming work, and feedback must stay grounded in the learner's actual execution and submission evidence.

A representative loop is:

```text
mission data
→ learner writes Python
→ code executes
→ grader evaluates result
→ immutable learning evidence is recorded
→ mastery/review updates
→ bounded optional rewards are granted
```

Visualization is optional and should be used only when it materially improves understanding. Gamification should live around the learning loop rather than forcing every programming task into a game scene.

## 2. Target Learner

The primary learner already has programming experience and wants practical competence in Python for Data Science and Machine Learning.

The learner does not need a long beginner-programming course. A short optional diagnostic/recovery path should repair missing Python skills only when they block Data/ML work.

The product should support a learner who wants to:

- write code independently rather than copy generated answers;
- remember important APIs and common patterns;
- reason about array shapes and transformations;
- process real datasets;
- build and debug ML pipelines;
- practice important code without autocomplete;
- prepare for the CS116 paper exam;
- progress toward Computer Vision, Deep Learning, PyTorch, and Kaggle.

## 3. Learning Goals

The product prioritizes **learning by doing**. A successful learner should be able to:

1. recognize the appropriate technique from a problem statement;
2. write the necessary Python/NumPy code independently;
3. predict and explain shapes, axes, and transformations;
4. debug runtime, type, shape, and value errors;
5. transfer a concept to a new context instead of memorizing one literal solution;
6. retain important knowledge after a delay;
7. use documentation appropriately for low-priority APIs while recalling high-priority patterns from memory;
8. combine data preparation, feature work, model training, validation, and evaluation into complete ML workflows.

## 4. Product Pillars

### 4.1 Code causes meaningful consequences

The player does not answer a multiple-choice question and then receive an unrelated animation. The code result should map to a semantic outcome.

Example:

```text
sensor feature matrix
→ NumPy boolean filtering
→ selected entity IDs
→ TARGETS_SELECTED event
→ radar locks those entities
```

### 4.2 Practice progresses toward independence

Learning follows the sequence defined in `MISSION_SYSTEM.md`:

```text
DISCOVER
→ GUIDED PRACTICE
→ INDEPENDENT PRACTICE
→ TRANSFER
→ MIXED REVIEW
→ RETENTION CHECK
```

Hints and starter code decrease as independence increases.

### 4.3 Generated replay requires understanding

Normal practice should use reproducible generated variants. Replaying a mission should change data, thresholds, shapes, or other relevant parameters while preserving the intended concept and a valid solution.

### 4.4 Learning evidence matters more than cosmetic progression

Progression is primarily driven by activity completion and concept mastery. XP, stars, achievements, facility upgrades, and cosmetics may be added later as secondary rewards.

### 4.5 Architecture supports growth without redesign

The system separates **Engine**, **Content**, and **Visualization**. Adding ordinary content should usually register data/configuration rather than change core runtime, routing, mastery logic, or visualization engine internals.

## 5. Product Scope

### 5.1 Initial product scope

The initial product will eventually include:

- browser application shell;
- curriculum navigation;
- concept-aware learning progression;
- code activities and other learning activity types;
- Monaco-based editing;
- Python execution through Pyodide in a Web Worker;
- deterministic mission generation;
- reusable grading;
- structured feedback and progressive hints;
- local progress persistence in IndexedDB;
- review, retry-variant, and free-practice flows;
- an Exam Mode capable of disabling or limiting assistance.

### 5.2 First production world

The first production world is **NumPy / Array Core**.

The first implementation milestone is a small vertical slice covering:

```text
numpy.array
numpy.shape
numpy.ndim
numpy.index.column
numpy.compare
numpy.boolean_mask
numpy.logical_and
```

The canonical vertical-slice activities are:

| ID | Activity | Stage | Focus |
|---|---|---|---|
| VS-01 | Boot Sensor Grid | Discover / Guided | `np.array`, `shape`, `ndim` |
| VS-02 | Diagnose Telemetry | Independent | shape reasoning |
| VS-03 | Extract Threat Channel | Independent | column extraction |
| VS-04 | Radar Filter | Guided | boolean filtering |
| VS-05 | Radar Filter Variant | Independent | generated filtering |
| VS-06 | Hostile Contact | Transfer | indexing + boolean logic |
| VS-07 | Recall Packet | Review | generated mixed recall |

See `CURRICULUM.md` for concept ownership and `MISSION_SYSTEM.md` for activity behavior.

### 5.3 Optional visualization

Visualization is not part of the baseline acceptance path. A future lesson may add a focused visualization when it materially improves understanding, but normal NumPy missions remain editor + runtime + grading experiences.

Art production is not an initial success criterion.

## 6. Non-Goals

The initial product does not require:

- a backend;
- accounts;
- cloud saves;
- multiplayer;
- a procedural large world;
- remote content marketplaces;
- public AI-generated mission publishing;
- plugin sandboxing;
- SQL or JavaScript runtimes;
- a no-code content authoring system;
- a large GUI content editor;
- every future activity type implemented at once;
- every future course implemented before the NumPy vertical slice.

These may have architectural extension points where useful, but they must not block the first playable learning slice.

## 7. Game-World Premise

The first learning environment is a compact technical control room. The player operates systems by writing real Python.

Mission context can frame arrays as sensor feeds, telemetry, robots, targets, channels, or system measurements. The game fiction must stay subordinate to the learning objective: story terminology should clarify the data's meaning, not obscure the programming task.

Reusable semantic events allow later content to reuse the same visualization behavior. For example, selecting entities might be produced by NumPy masks, pandas filtering, or model thresholding without those content packages directly controlling Phaser objects.

## 8. Core UX

The mission workspace should eventually present:

- objective and context;
- input/setup data in an understandable form;
- code editor;
- Run;
- Submit;
- stdout/errors;
- structured grader feedback;
- progressive hints when permitted;
- a visualization that responds to semantic results;
- progress/mastery feedback after a real submission.

`Run` supports experimentation and does not update mastery, complete a mission, or run final hidden grading. When current runtime output can be safely interpreted, Run may emit ephemeral preview state or semantic visualization events so the learner can see what their code currently does. This preview is not authoritative progress.

`Submit` evaluates from a fresh mission state. Each Submit creates one immutable `AttemptRecord`, whether it passes or fails, then updates learning state from that evidence and emits authoritative semantic world events when appropriate. The exact lifecycle is owned by `MISSION_SYSTEM.md` and `TECH_ARCHITECTURE.md`.

## 9. Learning and Game Relationship

Gameplay is a representation of computational meaning.

Good relationship:

```text
learner filters dangerous robots
→ result contains robot IDs
→ radar highlights exactly those robots
```

Weak relationship:

```text
learner answers unrelated quiz
→ arbitrary XP animation
```

The game world should reinforce:

- which entities were selected;
- how data changed;
- why a result passed or failed;
- how shapes or thresholds affect the outcome.

For data-heavy outputs, React/web visualizations may be more appropriate than Phaser. The product does not force every concept into a game scene.

## 10. Progression Principles

Progression depends primarily on:

```text
mission/activity completion
+
concept mastery
```

The primary learning status uses named `MasteryState` values rather than scientifically misleading percentage scores:

```text
UNSEEN
DISCOVERED
PRACTICING
INDEPENDENT
TRANSFERRED
RETAINED
```

One failure should not erase historical mastery. It should add evidence and increase review priority.

Optional secondary achievement labels may later include:

```text
CLEAR
CLEAN CLEAR
MASTERY
```

## 11. Exam Support

Because CS116 includes a paper exam, the product must eventually support an Exam Mode with configurable restrictions such as:

- autocomplete off;
- syntax hints off;
- documentation off;
- Run disabled or limited.

Exam activities may include:

- write code from scratch;
- fill missing code;
- predict output;
- find bugs;
- explain shape;
- select an appropriate API.

This requirement is why `LearningActivity` is more general than an executable code mission.

## 12. Product Success Criteria

### Vertical-slice technical success

The first vertical slice must demonstrate:

- code editor workflow works;
- Python execution works;
- runtime errors do not break the UI;
- infinite loops can be recovered from;
- Submit starts from a clean execution state;
- seeded generation is reproducible;
- grading works through reusable grading infrastructure;
- progress persists locally;
- Retry Variant changes the task;
- all seven canonical NumPy activities run, grade, persist, and support retry variants.

### Vertical-slice learning success

The learner can independently:

- interpret array shape;
- extract a column;
- write a boolean condition;
- combine conditions;
- solve a transfer mission;

without relying on H3/H4 hints.

### Replay success

Generated variants require concept understanding rather than memorizing one answer.

## 13. Product-Level Architecture Locks

The detailed architecture is owned by `TECH_ARCHITECTURE.md`, but these product rules are locked:

1. **Engine, Content, and Visualization are separate boundaries.**
2. **Concept Graph prerequisites are separate from Course → World → Lesson → LearningActivity presentation hierarchy.**
3. **LearningActivity is the generic learning unit; not every activity executes Python.**
4. **MissionTemplate and MissionInstance are distinct.**
5. **Generated missions are deterministic for template/version/config/difficulty/seed.**
6. **Run and Submit have different semantics.**
7. **Phaser does not own curriculum, mastery, generation, grading, or review logic.**
8. **CS116 is a content package using the engine.**
9. **Adding a normal mission should not require modification of the Core Engine.**
10. **Adding a normal lesson should primarily register concepts, activities, missions, and progression rather than modify runtime, React routing, mastery logic, or Phaser core.**

Target extensibility:

```text
80–90% new missions
→ content/config only

10–20% specialized missions
→ optional generator/grader/visualization plugin
```

