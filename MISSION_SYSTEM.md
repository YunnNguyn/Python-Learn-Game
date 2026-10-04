# Mission System — Learning, Generation, Grading, and Replay

> **2026-10-03 mission-direction lock.**
> Mission success is defined by learning quality, runtime behavior, structured grading, durable AttemptRecords, mastery, and review—not by a game-world reaction. Per-mission visualization is optional. After a Submit produces and durably records its immutable AttemptRecord, a separate meta-progression system may consume that evidence to grant bounded rewards. Reward logic must not alter the AttemptRecord, grader result, mastery derivation, hint evidence, or retry semantics.

## 1. Purpose and Ownership

This document owns the behavior of:

- the learning loop;
- `LearningActivity`;
- mission archetypes;
- `MissionTemplate` and `MissionInstance`;
- deterministic generation;
- difficulty;
- generated-mission safety;
- reference solvers;
- grading and feedback;
- hints;
- Run versus Submit;
- replay;
- review and recovery;
- Free Practice;
- the NumPy boss;
- the first vertical-slice activity sequence.

Technical module boundaries and persistence mechanisms are defined in `TECH_ARCHITECTURE.md`. Curriculum scope and concept ownership are defined in `CURRICULUM.md`.

## 2. Core Learning Loop

The canonical progression is:

```text
DISCOVER
↓
GUIDED PRACTICE
↓
INDEPENDENT PRACTICE
↓
TRANSFER
↓
MIXED REVIEW
↓
RETENTION CHECK
```

### DISCOVER

Purpose: introduce a concept with a short explanation, visual, example, or interactive observation.

Rules:

- keep explanation brief;
- avoid long passive lectures;
- show the meaning of the operation where possible;
- completion can establish `DISCOVERED` evidence but does not prove independent skill.

### GUIDED PRACTICE

Purpose: let the learner use the concept with scaffolding.

Allowed:

- starter code;
- TODO markers;
- constrained task shape;
- early hint access.

Guided success is evidence of practice, not final mastery.

### INDEPENDENT PRACTICE

Purpose: require the learner to produce the solution.

Rules:

- objective first;
- avoid giving the exact API unless the concept is still explicitly being taught;
- use generated variants when appropriate;
- require multiple meaningful variants before treating one success as stable independent evidence.

### TRANSFER

Purpose: test whether the learner recognizes when to use a technique.

Rules:

- do not name the target API or concept in the objective;
- use a changed context or problem representation;
- combine concepts when useful;
- transfer success is stronger evidence than repeating a known exercise format.

### MIXED REVIEW

Purpose: combine new and older concepts so the learner must identify the relevant tools.

Review selection operates by concept rather than chapter number.

### RETENTION CHECK

Purpose: test knowledge after a gap.

Rules:

- no automatic hints;
- avoid copying the exact earlier dataset;
- use a fresh generated variant where possible;
- record evidence separately from immediate practice.

## 3. LearningActivity Model

`LearningActivity` is the generic unit presented to the learner.

Do not assume every learning activity is an executable Python mission.

Supported architecture should allow types such as:

```text
CODE_MISSION
DEBUG_MISSION
PREDICT_OUTPUT
EXPLAIN_SHAPE
RECALL_CODE
BOSS_MISSION
```

The first implementation does not need every type. The abstraction exists so exam preparation and future learning formats do not have to be forced into `CodeMission`.

A conceptual activity definition should be able to reference:

- stable activity ID;
- title;
- activity type;
- concept IDs;
- learning stage;
- prerequisite or unlock rules;
- mission template when executable;
- assistance/exam restrictions;
- completion criteria;
- optional visualization configuration.

## 4. Mission Archetypes

Mission archetypes describe reusable problem/gameplay structures rather than library APIs.

```text
CONFIGURE
EXTRACT
FILTER
TRANSFORM
ANALYZE
ROUTE / SCORE
DEBUG
TRANSFER
```

Examples:

- `EXTRACT`: choose a column or feature from a sensor matrix;
- `FILTER`: produce IDs matching a condition;
- `TRANSFORM`: reshape, center, standardize, or encode data;
- `ANALYZE`: compute statistics and interpret them;
- `ROUTE / SCORE`: calculate scores and select entities;
- `DEBUG`: repair a broken solution;
- `TRANSFER`: solve a new context without being told the target API.

The same archetype may be reused by NumPy, pandas, ML predictions, or later content packs.

## 5. MissionTemplate vs MissionInstance

This distinction is mandatory.

```text
MissionTemplate
+
seed
+
difficulty
=
MissionInstance
```

### MissionTemplate

A `MissionTemplate` defines a family of exercises.

It should be able to reference:

```text
id
version
concept IDs
allowed learning stages
generator ID
generator configuration
grader ID
grader configuration
starter code
runtime configuration
hint set
visualization configuration
restrictions
```

The template does not store one fixed dataset as the fundamental mission model.

### MissionInstance

A `MissionInstance` is one concrete generated exercise.

It can contain:

```text
instance ID
template ID
template version
seed
difficulty
concept IDs
objective
context/story text
setup data
starter code
visible tests
grader data
world state
```

An instance should contain everything needed to reproduce or audit the learner's attempt, subject to the versioned template and content pack.

## 6. Deterministic Generation

Generation must be reproducible.

Invariant:

```text
same template
+
same template version
+
same generator config
+
same difficulty
+
same seed
=
same mission
```

Mission generators must not call `Math.random()` directly.

The future implementation should provide a shared seeded RNG abstraction and pass it into generators.

Benefits:

- bug reproduction;
- stable attempt records;
- deterministic tests;
- fair replay/debugging;
- easier content QA.

## 7. Difficulty

Difficulty is an input to mission generation and activity selection.

Difficulty should change cognitive load in controlled ways rather than only scale numbers.

Potential dimensions:

- number of rows/entities;
- number of features;
- number of conditions;
- distractor data;
- amount of starter code;
- whether the relevant API is named;
- shape complexity;
- whether multiple concepts are combined;
- tolerance for edge cases;
- assistance availability.

Difficulty values should remain simple in v1, for example:

```text
EASY
NORMAL
HARD
```

Do not build an adaptive difficulty research system before the vertical slice.

## 8. Generated Mission Safety

Randomness is constrained by learning intent.

Generated content must validate required invariants before it becomes playable.

### Boolean filtering

Typical constraints:

```text
at least 1 selected entity
not every entity selected
```

When the objective expects one exact target, generation must ensure uniqueness.

### Standardization

Avoid unintended zero standard deviation unless zero variance is itself the intended lesson.

### Matrix multiplication

Generate compatible shapes for valid missions.

If shape mismatch is the teaching objective, the mismatch must be intentional and reflected in the grader/feedback.

### Boss missions

Guarantee:

- a valid solution exists;
- intermediate operations remain defined;
- unique target when required;
- no accidental ties when the objective expects one winner;
- reference solver completes successfully.

## 9. Generator, Validator, Reference Solver

Where appropriate, generated mission families should have:

```text
generator
validator
reference solver
```

### Generator

Produces candidate mission data from seed, difficulty, and configuration.

### Validator

Checks mission-specific invariants before release to the learner.

### Reference solver

Computes a trusted expected result for:

- content validation;
- expected-result generation;
- generator QA;
- grader QA.

Reference solver code is developer infrastructure. It must not automatically expose solution code to the learner.

## 10. Grading Architecture

Normal missions should use reusable grader primitives rather than bespoke grading functions embedded in every mission.

Core planned primitives:

```text
variable_exists
python_type
ndarray_type
dtype
shape
exact_values
approx_values
scalar_value
no_exception
raises_exception
not_mutated
```

Potential later capabilities:

```text
function behavior
AST restrictions
performance constraints
```

Add those only when a real content requirement appears.

### Declarative grading

The normal path should configure reusable grader primitives.

Example conceptual rule set:

```text
result must exist
result must be ndarray
result shape must equal (4, 1)
result values approximately equal expected
```

### Custom grader plugin

Complex bosses or specialized activities may register a custom grader plugin as an escape hatch.

Custom graders remain behind the same grader interface and return the same structured result shape.

## 11. Structured Feedback

The grader returns structured results, not only arbitrary UI prose.

Feedback must be able to distinguish categories such as:

```text
RUNTIME_ERROR
TYPE_ERROR
SHAPE_ERROR
VALUE_ERROR
CONCEPTUAL_GUIDANCE
```

Example:

```text
Expected shape (4,1)
Received shape (4,)
```

Possible conceptual follow-up:

```text
The mission requires a column vector.
Check whether your result preserves the second dimension.
```

Feedback should point to the failed property or relevant concept without immediately revealing the full solution.

Grader feedback and hint progression are separate concerns: a failed shape check can report the mismatch without automatically granting H3/H4 guidance.

## 12. Hint System

Four progressive levels:

```text
H1 — Concept
H2 — Strategy
H3 — Relevant API / syntax
H4 — Pseudocode
```

### H1 — Concept

Reminds the learner what kind of idea matters.

### H2 — Strategy

Suggests a decomposition or reasoning approach.

### H3 — Relevant API / syntax

Points toward concrete library/API syntax.

### H4 — Pseudocode

Provides a near-solution structure without handing over complete executable code.

Rules:

- unlock progressively;
- record each hint used;
- independent/mastery evidence should distinguish attempts that used H3/H4;
- Retention Check should not auto-open hints;
- Exam Mode may disable hints entirely.

## 13. Run vs Submit

This semantic distinction is mandatory.

### RUN

Purpose: experimentation.

Run may:

```text
execute code
show stdout
show exceptions
show preview
emit ephemeral preview state / semantic WorldEvent(s) when output is safely interpretable
```

Run must not:

```text
complete the activity
update concept mastery
run final hidden grading
create an AttemptRecord
```

Run preview is temporary and is not authoritative progress. A useful conceptual flow is:

```text
RUN
→ execute current code
→ inspect usable result/artifact
→ optional ephemeral WorldEvent / preview state
→ visualization reacts
```

The visualization may show valid-but-wrong learner output when that helps learning. For example, a valid boolean mask that selects the wrong targets may still be previewed on the radar while no mastery or completion state changes.

### SUBMIT

Submit evaluates the learner from a clean execution state.

Canonical lifecycle:

```text
fresh mission environment
→ setup
→ player code
→ grader
→ authoritative structured result
→ semantic WorldEvent(s)
→ immutable AttemptRecord
→ Learning Engine
```

Submit must not depend on variables or mutations left behind by previous Run operations.

**One Submit creates one immutable `AttemptRecord`.** Failed and successful submissions both create records. The record is the evidence snapshot for that single submission; a multi-submit mission session is not represented by mutating one record.

When pedagogically useful, the authoritative Submit response may still visualize a learner-produced result that is structurally valid but incorrect. Grader feedback explains the mismatch while the visualization communicates what the submitted computation actually selected or produced. This behavior remains renderer-neutral through `WorldEvent` / preview contracts and does not couple missions to Phaser.

If the runtime worker is recycled, the mission environment must be reconstructed from the `MissionInstance`.

## 14. Runtime Failure Semantics

User code may contain:

```python
while True:
    pass
```

or other broken code.

The expected user-level behavior is:

```text
execution timeout
→ terminate worker
→ create replacement worker
→ reload Python runtime
→ restore mission environment
```

The main UI must remain responsive.

The technical worker protocol is owned by `TECH_ARCHITECTURE.md`.

## 15. Semantic World Events

Mission grading/result processing should emit semantic events rather than manipulate visualization objects directly.

Example:

```text
TARGETS_SELECTED
{
  ids: [...]
}
```

The mission system communicates meaning. A visualization module decides how to display that meaning.

The same event family can later be produced by NumPy filtering, pandas filtering, or ML thresholding.

## 16. Attempt Evidence and Mastery

`AttemptRecord` is the immutable raw evidence for exactly one Submit. `MasteryState` is derived from the sequence of records.

Useful attempt evidence includes:

```text
activityId
missionTemplateId
missionTemplateVersion
seed
conceptIds
learningStage
startedAt / submittedAt as appropriate
passed
submissionIndex
runCountBeforeSubmit
hintsUsed
runtimeErrorCount
graderSummary
```

An optional session identifier may be introduced later if it improves grouping or UX analytics, but it is not required for the v1 evidence model and does not justify a separate session subsystem.

Do not reduce history to:

```text
completed = true
```

Canonical mastery states:

```text
UNSEEN
DISCOVERED
PRACTICING
INDEPENDENT
TRANSFERRED
RETAINED
```

Possible v1 derivation rules:

```text
DISCOVERED
= Discover completion

PRACTICING
= Guided success

INDEPENDENT
= multiple independent generated variants
   completed without high-level hints

TRANSFERRED
= transfer mission success

RETAINED
= delayed review success
```

One later failure should not erase historical mastery. It should contribute evidence and raise review priority.

## 17. Review System

Review operates by **Concept**, not chapter number.

Review reasons may include:

```text
WEAK
STALE
DEPENDENCY
RECENT_FAILURE
```

Initial implementation should use a transparent heuristic. The architecture should allow replacement later.

Avoid building a complicated spaced-repetition algorithm before the vertical slice.

Example simple selection logic:

1. prioritize recent failures;
2. include weak prerequisite concepts;
3. include concepts not practiced for a while;
4. add mixed transfer when enough concepts are available.

## 18. Recovery Mode

When the learner returns after a break, provide a short concept-based recovery session without resetting progress.

Target:

```text
RECOVERY RUN
5 missions
~10–15 minutes
```

Possible mix:

```text
2 stale concepts
2 weak concepts
1 mixed transfer
```

The exact heuristic can remain simple in v1.

## 19. Free Practice

Free Practice reuses the same content and mission architecture.

The learner should eventually select:

```text
concept
difficulty
session size
```

Example:

```text
Boolean Filtering
Normal
10 missions
```

Free Practice must not introduce a separate practice engine. It selects compatible `LearningActivity`/`MissionTemplate` entries from the same registries.

## 20. Replay and Retry Variant

Replay should distinguish:

- retrying the same instance when the learner wants to fix a solution;
- requesting a new variant when the learner wants fresh evidence.

`Retry Variant` should keep the same learning intent while changing the seed and regenerating valid instance data.

Generated variants should change meaningful properties such as:

- values;
- thresholds;
- entity counts;
- shapes where allowed;
- corrupted rows;
- weight vectors;
- condition combinations.

Changing only entity names while preserving an identical literal solution is weak replay.

## 21. NumPy Boss

The World 1 boss is an integrated `BOSS_MISSION`.

Possible task chain:

1. inspect feature-matrix shape;
2. extract required features;
3. filter invalid entities;
4. calculate statistics;
5. center or standardize data;
6. apply a weight vector;
7. calculate scores;
8. identify the priority/dangerous entity.

The objective must not enumerate which NumPy functions solve each step.

Replay varies:

```text
dataset
number of robots
thresholds
corrupted samples
weight vector
```

Boss acceptance:

- generator passes mission validator;
- reference solver succeeds;
- grader accepts the reference result;
- any expected unique target is actually unique;
- no accidental zero-variance feature breaks standardization;
- world events represent the semantic result rather than implementation-specific NumPy details.

## 22. First Vertical Slice

The first vertical slice tests only:

```text
numpy.array
numpy.shape
numpy.ndim
numpy.index.column
numpy.compare
numpy.boolean_mask
numpy.logical_and
```

Canonical sequence:

### VS-01 — Boot Sensor Grid

Stage: Discover / Guided.

Focus:

- create an array;
- inspect `shape`;
- inspect `ndim`;
- connect dimensions to the concrete generated matrix shown in the task.

### VS-02 — Diagnose Telemetry

Stage: Independent.

Focus:

- reason about shapes;
- identify dimensionality without excessive scaffolding.

### VS-03 — Extract Threat Channel

Stage: Independent.

Focus:

- extract a column from a 2D matrix;
- preserve/understand the resulting shape.

### VS-04 — Radar Filter

Stage: Guided.

Focus:

- comparisons;
- boolean mask;
- use the mask to select the requested IDs.

### VS-05 — Radar Filter Variant

Stage: Independent.

Focus:

- seeded generated filtering task;
- changed data/thresholds;
- no reliance on one memorized answer.

### VS-06 — Hostile Contact

Stage: Transfer.

Focus:

- combine indexing and boolean logic;
- objective does not name the NumPy APIs;
- require two vectorized conditions combined with element-wise AND.

### VS-07 — Recall Packet

Stage: Mixed Review / retention preparation.

Focus:

- generated review across slice concepts;
- reduced assistance;
- useful evidence for review scheduling.

## 23. Vertical-Slice Acceptance

### Technical

The slice must prove:

- editor workflow;
- Python execution;
- recovery from runtime errors and infinite loops;
- clean-state Submit;
- deterministic generation;
- reusable grader behavior;
- local progress persistence;
- Retry Variant;
- complete VS-01 through VS-07 production content with deterministic generated variants.

### Learning

Without H3/H4, the learner can:

- interpret array shape;
- extract a column;
- write a boolean condition;
- combine conditions;
- solve the transfer mission.

### Replay

Fresh variants require the same concept understanding but do not permit memorizing the literal earlier answer.

## 24. Extension Rules

Normal mission addition should involve:

```text
concept references
activity definition
MissionTemplate
generator config
grader config
hints
visualization mapping
```

and should **not** require Core Engine modification.

Target:

```text
80–90% new missions
→ content/config only

10–20% specialized missions
→ may add a registered generator, grader, or visualization plugin
```

New activity types, grader primitives, or generator capabilities should be added only when multiple real content cases justify them.

