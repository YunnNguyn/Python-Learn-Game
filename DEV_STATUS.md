# Development Status

## Current Phase

```text
Foundation 1 — Domain Types + Schemas
```

Status: **Complete**

Phase 0 remains complete and locked through the six source-of-truth documents:

- `PRODUCT_SPEC.md`
- `CURRICULUM.md`
- `MISSION_SYSTEM.md`
- `TECH_ARCHITECTURE.md`
- `ROADMAP.md`
- `DEV_STATUS.md`

F1.1 established the project/tooling foundation. F1.2 provides the smallest stable Core domain vocabulary and branded ID types. F1.3 provides the canonical `Concept` schema. F1.4 provides runtime-validatable `Course`, `World`, and `Lesson` hierarchy contracts. F1.5 provides the polymorphic `LearningActivity` contract. F1.6 provides the reusable `MissionTemplate` contract and JSON-safe extension configuration boundary. F1.7 provides the concrete generated `MissionInstance` snapshot with explicit learner/runtime/grading/world data boundaries. F1.8 provides the minimal strict `ContentPackManifest` contract for pack identity, schema versioning, course references, and pack dependencies. F1.9 provides the raw `AttemptRecord` evidence snapshot and minimal renderer-neutral `WorldEvent` envelope. F1.10 completes Foundation 1 with a coherent neutral fixture family, public-barrel integration checks, branded output checks, invalid-boundary regressions, JSON round-trip checks, and a domain dependency/type audit.

## Current Task

```text
F1.10 — Schema fixtures and validation
```

Status: **Complete**

Scope completed:

- added a test-only neutral coherent fixture family covering `Concept`, `Course`, `World`, `Lesson`, `LearningActivity`, `MissionTemplate`, `MissionInstance`, `ContentPackManifest`, `AttemptRecord`, and `WorldEvent`;
- added an integration gate that imports Foundation 1 contracts through the public `src/core/domain` barrel and checks branded schema output typing;
- added representative invalid fixtures for strict object boundaries, malformed branded IDs, mission/non-mission activity shape, JSON-safe extension config, learner/grader data separation, positive schema versions, AttemptRecord evidence fields, and renderer-neutral WorldEvent roots;
- added JSON serialize/parse round-trip checks for the major persisted/config contracts;
- audited `src/core/domain` for forbidden outward dependencies, explicit authored `any`, and broad public `unknown` config escapes while preserving the existing tooling smoke test;
- added no packages, Foundation 2 behavior, production CS116 content, registry/validator behavior, Concept Graph logic, or runtime/UI integrations.

## Completed

- [x] Product vision and target learner defined.
- [x] Learning goals and product pillars defined.
- [x] CS116 retained as the primary curriculum source of truth.
- [x] Supplementary / ML Foundation labeling policy defined.
- [x] Optional Python Recovery scoped.
- [x] NumPy / Array Core curriculum mapped in detail.
- [x] Future CS116 worlds mapped at curriculum level.
- [x] MUST_RECALL / MUST_UNDERSTAND / LOOKUP_OK classification defined.
- [x] Course → World → Lesson → LearningActivity separated from Concept Graph prerequisites.
- [x] `LearningActivity` defined as broader than executable code missions.
- [x] `MissionTemplate` and `MissionInstance` separated.
- [x] Deterministic seed invariant defined.
- [x] Generated-mission validator/reference-solver expectations defined.
- [x] Reusable grader primitives and custom-grader escape hatch defined.
- [x] Structured feedback categories defined.
- [x] H1–H4 progressive hints defined.
- [x] Run and Submit semantics separated.
- [x] Pyodide/Web Worker recovery concept defined.
- [x] semantic `WorldEvent` bridge defined.
- [x] Phaser responsibility boundary defined.
- [x] React/web visualization path retained for data-oriented outputs.
- [x] `ContentPack`, Content Registry, and Content Validator boundaries defined.
- [x] attempt evidence and `MasteryState` model defined.
- [x] concept-based review/recovery/free-practice design defined.
- [x] first Sensor Control Room setting scoped.
- [x] VS-01 through VS-07 locked consistently.
- [x] implementation decomposed into small sequential roadmap tasks.
- [x] F1.1 — Project/tooling bootstrap for domain work completed.
- [x] npm project initialized with Vite, TypeScript, and Vitest.
- [x] strict TypeScript typecheck, tooling smoke test, and production build validated.
- [x] F1.2 — Core enums and IDs completed.
- [x] canonical serialized domain values encoded as `as const` objects with derived union types.
- [x] stable Core IDs encoded as branded strings with compile-time cross-domain protection.
- [x] F1.3 — Concept schema completed.
- [x] Zod 4 selected as the runtime schema strategy unless a concrete future requirement forces reconsideration.
- [x] canonical `ConceptSource` vocabulary and strict `ConceptSchema` added with `ConceptId` output typing.
- [x] F1.4 — Curriculum hierarchy schemas completed.
- [x] `CourseSchema`, `WorldSchema`, and `LessonSchema` added with branded reference arrays.
- [x] presentation hierarchy ownership locked as single-directional; reverse parent relationships remain derived/indexed concerns.
- [x] F1.5 — LearningActivity schema completed.
- [x] `LearningActivitySchema` implemented as a strict discriminated union across all six canonical activity types.
- [x] mission-backed activity variants require `MissionTemplateId`; non-mission variants carry no mission-template reference in v1.
- [x] F1.6 — MissionTemplate schema completed.
- [x] `MissionTemplateSchema` added with strict nested generator/grader/runtime/visualization bindings and branded references.
- [x] reusable JSON domain types/schemas added for extension configuration and restrictions.
- [x] F1.7 — MissionInstance schema completed.
- [x] `MissionInstanceSchema` added with branded generation identity and strict learner/runtime/grading/world payload boundaries.
- [x] instance seed storage locked to a required non-blank string while deterministic RNG interpretation remains deferred.
- [x] F1.8 — ContentPack manifest schema completed.
- [x] `ContentPackManifestSchema` added as a strict minimal manifest with branded course/dependency references.
- [x] ContentPack version strings remain non-blank and format-agnostic while manifest `schemaVersion` is a positive integer.
- [x] F1.9 — AttemptRecord and WorldEvent schemas completed.
- [x] `AttemptRecordSchema` added as strict raw evidence for exactly one Submit snapshot, including deterministic reproduction fields and canonical hint evidence.
- [x] `WorldEventSchema` added as a strict renderer-neutral semantic type + JSON payload envelope.
- [x] `HintLevel` and branded `WorldEventType` added as the only new primitive vocabulary required by F1.9.
- [x] F1.10 — Schema fixtures and Foundation 1 validation completed.
- [x] neutral Foundation 1 fixture family covers every major schema from Concept through WorldEvent.
- [x] public barrel integration, branded output typing, representative invalid-boundary regression, and JSON round-trip checks added.
- [x] domain dependency/type audit completed with no forbidden outward imports, authored `any`, or broad public `unknown` config boundary.

## In Progress

- Foundation 1 is complete.
- Foundation 2 has not started.

## Next Planned Phase

```text
Foundation 2 — Content Registry + Validator
```

## Next Planned Task

```text
F2.1 — In-memory Content Registry
```

Begin Foundation 2 with the in-memory Content Registry task defined by `ROADMAP.md`. No F2.1 implementation was started during F1.10.

## Architecture Locks

These decisions are source-of-truth constraints until deliberately revised:

1. **Engine / Content / Visualization separation**
   - Generic learning behavior belongs in the engine.
   - CS116 belongs in content.
   - renderer-specific behavior belongs in visualization.

2. **Player-written code has semantic world consequences**
   - Mission results become semantic `WorldEvent` data.
   - Content does not directly manipulate Phaser objects.

3. **Concept Graph is separate from presentation hierarchy**
   - Presentation: Course → World → Lesson → LearningActivity.
   - Knowledge prerequisites: Concept Graph.

4. **Concept is the smallest tracked learning unit**
   - released concept IDs are persistence contracts.

5. **LearningActivity is generic**
   - code mission, debug, predict-output, explain-shape, recall, and boss formats can coexist.

6. **MissionTemplate and MissionInstance are different**
   - templates define exercise families;
   - instances are generated exercises.

7. **Generation is deterministic**
   - same template/version/config/difficulty/seed produces the same mission.
   - generators do not use `Math.random()` directly.

8. **Generated content is constrained**
   - validators enforce mission invariants.
   - reference solvers support QA without revealing learner solutions.

9. **Grading is reusable**
   - normal missions configure common grader primitives.
   - custom graders are an escape hatch.

10. **Run and Submit are semantically different**
    - Run is experimentation.
    - Run may emit ephemeral preview state / semantic visualization events when runtime output is safely interpretable.
    - Run preview is non-authoritative: it does not complete activities, update mastery, or run final hidden grading.
    - Submit uses a clean environment, final grading, evidence recording, and learning updates.

11. **Runtime is behind RuntimeManager**
    - initial runtime is Pyodide in a Web Worker.
    - worker timeout/replacement prevents permanent UI freeze.

12. **Phaser has no curriculum/mastery logic**
    - Phaser owns scene/entities/animation/spatial reactions only.

13. **AttemptRecord is raw evidence**
    - one Submit creates one immutable `AttemptRecord`, whether the submission fails or passes.
    - a multi-submit mission session produces multiple records rather than mutating one record.
    - submission-local evidence may include `submissionIndex` and `runCountBeforeSubmit`; there is no mutable aggregate `submitCount` model.
    - mastery is derived from history.
    - one failure should raise review priority rather than erase historical mastery.

14. **Review is concept-based**
    - Free Practice and Recovery reuse the same activity/mission architecture.

15. **Content packs are an architectural boundary**
    - CS116 is the first pack.
    - remote marketplace/install systems are deferred.

16. **Normal content should not require Core Engine edits**
    - target: 80–90% of new missions are content/config only.
    - normal lessons should not require runtime, routing, mastery, or Phaser-core changes.

17. **First production scope is the NumPy vertical slice**
    - prove the full learning/runtime/visual pipeline before broad NumPy authoring.
    - primary concept lock: `numpy.array`, `numpy.shape`, `numpy.ndim`, `numpy.index.column`, `numpy.compare`, `numpy.boolean_mask`, `numpy.logical_and`.

18. **Module dependency direction is locked**
    - `core/` must not import from `content/`, `features/`, or `visualization/`.
    - `content/` may depend on public core contracts but not React feature internals or renderer internals.
    - `visualization/` may depend on renderer-neutral event/visualization contracts but not curriculum/mastery/mission content internals.
    - `features/` compose public engine services and should not own reusable domain rules.
    - `app/` is the composition root.
    - Generic Core Engine code must never import `content/cs116`; built-in CS116 registration happens from the application/composition boundary.

19. **Review sequencing stays vertical-slice-first**
    - before the first NumPy vertical-slice playtest: Retry Same Instance, Retry Variant, and minimal concept-based review selection only.
    - full Recovery Run composition and Free Practice session/UI implementation begin after the first vertical-slice playtest unless implementation evidence proves they are required earlier.

20. **Runtime schema strategy is Zod 4**
    - Zod 4 provides runtime validation and inferred TypeScript types for domain schemas.
    - F1.2 branded domain IDs remain canonical; schemas validate raw strings and convert them to the existing brands.
    - reconsider the library only if a concrete future requirement justifies the change.

21. **Presentation hierarchy ownership is single-directional**
    - `Course` owns/references `worldIds`.
    - `World` owns/references `lessonIds`.
    - `Lesson` owns/references `activityIds` and declares lesson membership through `conceptIds`.
    - `World.courseId` and `Lesson.worldId` are intentionally absent in v1; reverse relationships may be derived by future registry/indexing.
    - Concept dependency order remains in `Concept.prerequisites`, not hierarchy array order.

22. **LearningActivity is a discriminated union by `type`**
    - `CODE_MISSION`, `DEBUG_MISSION`, and `BOSS_MISSION` require `missionTemplateId: MissionTemplateId`.
    - `PREDICT_OUTPUT`, `EXPLAIN_SHAPE`, and `RECALL_CODE` do not carry `missionTemplateId` in v1.
    - every variant shares branded `LearningActivityId`, branded `ConceptId[]`, canonical `LearningStage`, title, and optional description.
    - subtype-specific payloads, execution handlers, exam assistance configuration, completion rules, and visualization configuration remain deferred until concrete runtime requirements exist.

23. **MissionTemplate extension bindings are nested and JSON-safe**
    - `generator`, `grader`, `runtime`, and optional `visualization` are cohesive nested bindings rather than flattened ID/config fields.
    - extension `config` data and `restrictions` must be JSON-serializable objects; non-finite numbers and non-JSON runtime values are rejected.
    - the generic template schema validates JSON structure only; plugin-specific config validation remains deferred to the owning extension implementation.

24. **MissionInstance data is partitioned by ownership and visibility**
    - generated instance data is partitioned into `learner`, `runtime`, `grading`, and `world` payloads with strict structural containers.
    - `grading` is an architectural visibility boundary intended to prevent accidental answer leakage; it is not a client-side security boundary.
    - persisted seeds are required non-blank strings; hashing/RNG interpretation and derived-seed behavior remain deferred to generation infrastructure.
    - `MissionInstance` stores generated/effective instance data and references `templateId` + `templateVersion` instead of duplicating MissionTemplate extension bindings or template-only ownership.

25. **ContentPack manifests stay minimal and locally validatable**
    - pack `version` is a required non-blank string; SemVer enforcement and update semantics are deferred.
    - manifest `schemaVersion` is a finite positive integer starting at 1.
    - a pack references presentation content through ordered `courseIds: CourseId[]` rather than embedding Course definitions.
    - pack dependencies are ordered `ContentPackId[]` references in v1; version constraints, resolution, cycle detection, and loading order are deferred.
    - unresolved references, duplicate references, and self-dependency remain locally parseable; the manifest carries no opaque metadata bag or embedded content definition arrays.

26. **Attempt evidence and world events remain minimal semantic contracts**
    - one `AttemptRecord` represents exactly one Submit evidence snapshot; both passed and failed submissions produce their own append-only records.
    - deterministic mission reproduction evidence retains `missionTemplateId`, `missionTemplateVersion`, `difficulty`, and `seed`; there is no mutable aggregate `submitCount`.
    - `HintLevel` is exactly `H1`, `H2`, `H3`, and `H4`; ordering/uniqueness/progression behavior remains outside the schema.
    - `WorldEvent` contains only a branded semantic `type` plus required JSON-object `payload`; unregistered event types may parse locally.
    - preview versus authoritative delivery belongs to future mission-pipeline/bridge context rather than WorldEvent data; event-log metadata and renderer commands remain deferred.

27. **Foundation 1 contracts are complete; cross-object semantics remain deferred**
    - Foundation 1 now provides the canonical domain values/IDs and schemas for `Concept`, `Course`, `World`, `Lesson`, `LearningActivity`, `MissionTemplate`, `MissionInstance`, `ContentPackManifest`, `AttemptRecord`, and `WorldEvent`, plus JSON-safe `JsonObject` / `JsonValue` payload boundaries.
    - Foundation 1 schemas validate local structure and branded output types only; cross-reference resolution, duplicate-ID validation across objects, Concept Graph algorithms, extension registries, and the Content Validator belong to later foundations.
    - Foundation 1 validation uses neutral test fixtures only; production CS116 content remains outside Core domain contracts.

## Known Risks

### Pyodide startup and recovery latency

Terminating a stuck worker and reloading Pyodide may create noticeable delay. The vertical slice must measure the experience before more complex runtime recovery mechanisms are designed.

### Generated-content quality

Seed determinism alone does not guarantee useful exercises. Validators and reference-solver tests must prevent trivial, invalid, ambiguous, or unsolvable variants.

### Schema stability

Concept IDs, template versions, and attempt records become persistence contracts. Foundation 1 should keep schemas minimal so the project does not freeze speculative fields too early.

### Visualization overreach

There is a risk of spending time on Phaser art instead of validating learning. The first Sensor Control Room must remain small and reusable.

### Curriculum evidence gaps

Some practical ML topics, including current NumPy aggregation/axis coverage, may be useful but not yet confirmed by supplied CS116 materials. Keep them labeled **Supplementary / ML Foundation** until curriculum evidence confirms otherwise.

## Open Decisions

These decisions are intentionally deferred until implementation evidence is available:

- exact seeded RNG algorithm/package;
- exact runtime message schema field names;
- exact IndexedDB wrapper;
- precise v1 mastery thresholds for “multiple independent variants”;
- exact simple review-priority weights;
- whether a given data visualization is best rendered in React or Phaser on a case-by-case basis;
- which later grader primitives are justified after the vertical slice.

None of these blocks **Foundation 1 — Domain Types + Schemas**.

## Validation Status

F1.10 validation:

- [x] `npm.cmd run typecheck` — passed with public-barrel imports and branded output type checks;
- [x] `npm.cmd run test:run` — passed: 12 test files, 211 tests;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] `git diff --check` — passed; only working-tree LF→CRLF warnings were reported;
- [x] coherent neutral fixtures parse through `Concept`, `Course`, `World`, `Lesson`, both mission-backed and non-mission `LearningActivity` variants, `MissionTemplate`, `MissionInstance`, `ContentPackManifest`, `AttemptRecord`, and `WorldEvent`;
- [x] Foundation 1 contracts are exercised through the public `src/core/domain` barrel and retain branded output types for representative IDs and `WorldEventType`;
- [x] representative invalid fixtures protect strict object boundaries, malformed IDs, mission-template activity rules, JSON-safe extension configs, learner/grader separation, positive schema versions, AttemptRecord evidence shape, and renderer-neutral WorldEvent roots;
- [x] `MissionTemplate`, `MissionInstance`, `ContentPackManifest`, `AttemptRecord`, and `WorldEvent` survive JSON serialize/parse round trips;
- [x] `src/core/domain` imports only Zod and relative Core domain modules; no imports from content, features, visualization, app, React, Phaser, Monaco, Pyodide, or IndexedDB were found;
- [x] no explicit authored `any` was found in `src/core/domain`; public persisted/config payload boundaries use `JsonObject` / `JsonValue` rather than broad `unknown` escapes;
- [x] `tests/tooling.smoke.test.ts` remains present;
- [x] no new package was installed and `package.json` / `package-lock.json` have no F1.10 changes;
- [x] cross-reference validation, duplicate-ID validation, Concept Graph logic, extension registries, Content Validator behavior, production CS116 content, React, Phaser, Monaco, Pyodide, and IndexedDB were not added.

F1.9 validation:

- [x] `npm.cmd run typecheck` — passed, including branded AttemptRecord/activity/template/concept/event types and canonical Difficulty/HintLevel checks;
- [x] `npm.cmd run test:run` — passed: 11 test files, 206 tests;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] minimal and full `AttemptRecord` fixtures parse with required deterministic reproduction evidence, optional offset-aware `startedAt`, required offset-aware `submittedAt`, counters, hints, and optional JSON grader summary;
- [x] timestamps reject arbitrary strings and timezone-less datetimes while accepting `Z` and explicit-offset ISO datetimes; no chronological cross-field comparison was added;
- [x] submission/template versions and submission indices require finite positive integers; run/runtime-error counters require finite non-negative integers;
- [x] `HintLevel` is exactly H1/H2/H3/H4; empty, duplicate, and supplied-order hint arrays remain structurally valid;
- [x] `submitCount`, raw submitted source, session identity, and mission-instance identity are absent from AttemptRecord;
- [x] `WorldEvent` requires branded non-blank type plus JSON-object payload, rejects unexpected root fields, and permits structurally valid unregistered event types;
- [x] preview/authoritative flags, event-log fields, renderer commands, World Event Bridge behavior, mastery logic, and persistence were not added;
- [x] no new package was installed and `package.json` / `package-lock.json` have no F1.9 dependency changes;
- [x] F1.9 domain/test code has no dependency on content, features, visualization implementation, React, Phaser, Monaco, Pyodide, or IndexedDB.

F1.8 validation:

- [x] `npm.cmd run typecheck` — passed, including branded ContentPack/Course references and compile-time cross-domain ID misuse checks;
- [x] `npm.cmd run test:run` — passed: 9 test files, 167 tests;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] minimal and full `ContentPackManifest` fixtures parse with the locked field set and preserve supplied array order;
- [x] pack `version` accepts arbitrary non-blank strings without SemVer enforcement;
- [x] `schemaVersion` requires a finite positive integer;
- [x] unresolved course/dependency references, duplicate references, self-dependency, and empty arrays remain locally parseable;
- [x] unexpected top-level properties and misspelled schema fields are rejected;
- [x] no dependency version ranges/resolution, cycle detection, loading order, metadata bag, embedded content definitions, or production CS116 pack was added;
- [x] no new package was installed and `package.json` / `package-lock.json` have no F1.8 dependency changes;
- [x] F1.8 domain/test code has no dependency on content, features, visualization implementation, React, Phaser, Monaco, Pyodide, or IndexedDB.

F1.7 validation:

- [x] `npm.cmd run typecheck` — passed, including branded MissionInstance/template/concept references, canonical `Difficulty`, and learner payload boundary type checks;
- [x] `npm.cmd run test:run` — passed: 8 test files, 141 tests;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] minimal and full `MissionInstance` fixtures parse with learner/runtime/grading/world data partitioning;
- [x] seed accepts arbitrary non-blank strings and rejects blank or numeric values without interpreting RNG semantics;
- [x] `templateVersion` requires a finite positive integer and unresolved template/concept references remain locally parseable;
- [x] all structural containers reject unexpected keys while their generic JSON payload objects remain extensible;
- [x] learner data, visible tests, runtime setup data, grading data, and world initial state reuse the F1.6 JSON-object contract;
- [x] representative MissionTemplate-only fields and a top-level `hiddenTests` field are rejected from MissionInstance;
- [x] no cross-validation against MissionTemplate, generator/RNG logic, runtime/grader implementation, or production CS116 instance was added;
- [x] no new package was installed;
- [x] F1.7 domain/test code has no dependency on content, features, visualization implementation, React, Phaser, Monaco, Pyodide, or IndexedDB.

F1.6 validation:

- [x] `npm.cmd run typecheck` — passed, including branded MissionTemplate references and compile-time JSON compatibility checks;
- [x] `npm.cmd run test:run` — passed: 7 test files, 103 tests;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] minimal and full `MissionTemplate` fixtures parse with the locked field set;
- [x] template and nested extension bindings reject unexpected keys;
- [x] `version` requires a finite positive integer;
- [x] extension configs require JSON-compatible objects; root arrays and representative non-JSON values are rejected;
- [x] unresolved concept/generator/grader/runtime/hint/visualization IDs remain locally parseable;
- [x] no `MissionInstance` seed/difficulty/generated-state fields, registry implementations, plugin implementations, or production CS116 definitions were added;
- [x] no new package was installed;
- [x] F1.6 domain/test code has no dependency on content, features, visualization, React, Phaser, Monaco, Pyodide, or IndexedDB.

F1.5 validation:

- [x] `npm.cmd run typecheck` — passed, including discriminated-union narrowing and branded ID checks;
- [x] `npm.cmd run test:run` — passed: 6 test files, 58 tests;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] all six canonical activity variants parse with their intended field sets;
- [x] mission-backed activities require `missionTemplateId`;
- [x] non-mission activities reject `missionTemplateId` as an unexpected key;
- [x] unknown activity types, blank IDs/titles, invalid stages, malformed concept arrays, and unexpected fields are rejected;
- [x] unresolved concept/template IDs remain locally parseable;
- [x] no Activity Engine, MissionTemplate schema, progression/unlock/mastery logic, exam config, visualization config, or production CS116 activity definitions were added;
- [x] no new package was installed;
- [x] activity schema code has no dependency on content, features, visualization, React, Phaser, Monaco, Pyodide, or IndexedDB.

F1.4 validation:

- [x] `npm.cmd run typecheck` — passed, including hierarchy brand compatibility checks;
- [x] `npm.cmd run test:run` — passed: 5 test files, 41 tests;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] `CourseSchema`, `WorldSchema`, and `LessonSchema` use strict object validation;
- [x] parsed hierarchy IDs/reference arrays retain the correct custom branded ID types;
- [x] empty arrays, unresolved references, duplicate references, and supplied ordering remain locally parseable;
- [x] no redundant `World.courseId` or `Lesson.worldId` field was added;
- [x] no Content Registry, Concept Graph, progression/unlock, or LearningActivity implementation was added;
- [x] no new package was installed;
- [x] curriculum schema code has no dependency on content, features, visualization, React, Phaser, Monaco, Pyodide, or IndexedDB.

F1.3 validation:

- [x] `npm.cmd install zod --cache .\.npm-cache` — installed `zod@4.6.5` as a runtime dependency;
- [x] `npm.cmd run typecheck` — passed, including `ConceptId` output typing and cross-domain brand checks;
- [x] `npm.cmd run test:run` — passed: 4 test files, 25 tests;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] `ConceptSchema` rejects unknown keys and validates only local field structure;
- [x] structurally valid nonexistent prerequisite IDs remain accepted;
- [x] `src/core/domain/concept.ts` imports only Zod plus existing Core domain IDs/values;
- [x] no content, features, visualization, React, Phaser, Monaco, Pyodide, or IndexedDB dependency was added to Concept code;
- [x] no registry, graph/cycle, mastery/review, or production CS116 concept logic was added.

F1.2 validation:

- [x] `npm.cmd run typecheck` — passed, including nominal ID misuse checks;
- [x] `npm.cmd run test:run` — passed: 3 test files, 10 tests;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] no TypeScript `enum` exists in `src/core/domain` or its focused tests;
- [x] `src/core/domain` has no imports from content, features, visualization, or CS116-specific code;
- [x] no React, Phaser, Monaco, Pyodide, IndexedDB, or runtime-schema dependency was added;
- [x] no domain object schema or runtime ID validation was implemented.

F1.1 validation:

- [x] `npm.cmd install --save-dev typescript vite vitest --cache .\.npm-cache` — dependency installation passed;
- [x] `npm.cmd run typecheck` — passed with strict TypeScript configuration;
- [x] `npm.cmd run test` — passed: 1 test file, 1 test;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] `npm.cmd run dev -- --host 127.0.0.1` — Vite dev server started successfully; port 5173 was already occupied, so Vite selected 5174;
- [x] the six Phase 0 source-of-truth documents remain present;
- [x] no React product UI or later runtime/game systems were implemented;
- [x] no domain schemas, CS116 content definitions, or runtime-schema library were added.

Phase 0 validation:

- [x] all six required Markdown files exist;
- [x] canonical terminology is consistent across documents;
- [x] phase names and roadmap ordering are consistent;
- [x] curriculum world order is consistent;
- [x] VS-01 through VS-07 are consistent;
- [x] Engine / Content / Visualization boundaries are consistent;
- [x] `MissionTemplate` and `MissionInstance` are consistently separated;
- [x] Concept Graph and presentation hierarchy are consistently separated;
- [x] `LearningActivity` remains broader than `CODE_MISSION`;
- [x] seed determinism is a cross-document invariant;
- [x] grading uses reusable primitives with a custom-plugin escape hatch;
- [x] Run and Submit semantics are consistent;
- [x] Run preview may emit ephemeral semantic visualization state without completion, mastery updates, or final hidden grading;
- [x] one Submit creates one immutable `AttemptRecord` for both failed and successful submissions;
- [x] no contradictory mutable `submitCount` model remains;
- [x] Phaser contains no curriculum/mastery responsibility;
- [x] module dependency direction is explicit and Generic Core Engine code never imports `content/cs116`;
- [x] future `ContentPack` extension is possible without a marketplace;
- [x] normal mission/lesson extensibility rules are explicit;
- [x] the vertical slice uses 7 primary concepts including `numpy.compare`;
- [x] full Recovery Run and Free Practice implementation are sequenced after the first vertical-slice playtest;
- [x] deferred future systems are not required before the NumPy vertical slice;
- [x] no production application/runtime code was added.

## Source-of-Truth Ownership

Use each document for its owning concern:

| Document | Owns |
|---|---|
| `PRODUCT_SPEC.md` | vision, learner, pillars, scope, UX, success criteria |
| `CURRICULUM.md` | CS116 source policy, curriculum map, concept learning scope |
| `MISSION_SYSTEM.md` | learning loop, activities, missions, generation, grading, hints, replay/review |
| `TECH_ARCHITECTURE.md` | system boundaries, contracts, runtime, registry, persistence, validation |
| `ROADMAP.md` | implementation sequencing and task decomposition |
| `DEV_STATUS.md` | current operational status, locks, risks, open decisions |


