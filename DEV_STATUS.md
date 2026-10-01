# Development Status

## Current Phase

```text
Foundation 2 — Content Registry + Validator
```

Status: **Complete**

Phase 0 remains complete and locked through the six source-of-truth documents:

- `PRODUCT_SPEC.md`
- `CURRICULUM.md`
- `MISSION_SYSTEM.md`
- `TECH_ARCHITECTURE.md`
- `ROADMAP.md`
- `DEV_STATUS.md`

Foundation 1 is complete and locked. F1.1 established the project/tooling foundation. F1.2 provides the smallest stable Core domain vocabulary and branded ID types. F1.3 provides the canonical `Concept` schema. F1.4 provides runtime-validatable `Course`, `World`, and `Lesson` hierarchy contracts. F1.5 provides the polymorphic `LearningActivity` contract. F1.6 provides the reusable `MissionTemplate` contract and JSON-safe extension configuration boundary. F1.7 provides the concrete generated `MissionInstance` snapshot with explicit learner/runtime/grading/world data boundaries. F1.8 provides the minimal strict `ContentPackManifest` contract for pack identity, schema versioning, course references, and pack dependencies. F1.9 provides the raw `AttemptRecord` evidence snapshot and minimal renderer-neutral `WorldEvent` envelope. F1.10 completes Foundation 1 with a coherent neutral fixture family, public-barrel integration checks, branded output checks, invalid-boundary regressions, JSON round-trip checks, and a domain dependency/type audit. F2.1 starts Foundation 2 with a small instantiable in-memory `ContentRegistry` for static content definitions only. F2.2 adds pure pre-registration duplicate-ID validation over the seven static content categories. F2.3 adds pure pre-registration validation for the locked static content reference families. F2.4 adds lightweight branded-ID capability validation for MissionTemplate extension references without introducing implementation registries. F2.5 adds explicit ContentPack schema-compatibility validation using a caller-supplied supported-version set. F2.6 completes Foundation 2 with one pure `validateContent` preflight entry point that composes all four validation passes with explicit capability/schema context before registration.

## Current Task

```text
F2.6 — Content validation entry point / Foundation 2 integration gate
```

Status: **Complete**

Scope completed:

- added public `ContentValidationContext`, `ContentValidationIssue`, and `ContentValidationReport` contracts plus pure `validateContent(definitions, context)`;
- `validateContent` runs duplicate-ID, static-reference, extension-ID, and schema-version validation in that exact order and never short-circuits later passes;
- report validity is derived from the merged issue list, ordering stays deterministic by pass, and validation does not mutate content or context inputs;
- coherent canonical content preflights successfully and can then be explicitly registered through the existing `ContentRegistry` API;
- invalid semantic content is blocked by normal loading composition using `report.valid`; `ContentRegistry` remains responsible only for in-memory catalog storage and same-category collision safety;
- no batch/atomic loader, rollback/transaction system, Concept Graph, Activity Registry, extension implementation registry, plugin-config validator, or production CS116 content was introduced.

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
- [x] Foundation 1 — Domain Types + Schemas complete.
- [x] F2.1 — In-memory Content Registry completed.
- [x] `ContentRegistry` provides typed in-memory catalogs for packs, concepts, courses, worlds, lessons, activities, and mission templates.
- [x] same-category duplicate registration fails before overwrite.
- [x] F2.2 — Duplicate-ID validation completed.
- [x] duplicate validation is a pure pre-registration pass over canonical typed content definitions.
- [x] one structured issue is returned per same-category duplicate ID group with all zero-based occurrence indexes.
- [x] duplicate diagnostics preserve canonical category order and first-occurrence order within each category.
- [x] F2.3 — Reference validation completed.
- [x] reference validation is a pure pre-registration pass over the existing `ContentDefinitionSet`.
- [x] one `MissingReferenceIssue` is returned per invalid static reference occurrence with deterministic field paths and source indexes.
- [x] F2.3 validates the locked static reference families while leaving extension IDs and Concept Graph semantics deferred.
- [x] F2.4 — Extension-ID validation completed.
- [x] extension capability metadata contains branded IDs only and does not map IDs to implementations.
- [x] MissionTemplate extension references validate in deterministic source/field order across five independent namespaces.
- [x] one `MissingExtensionIssue` is returned per missing authored extension occurrence without mutating content or capabilities.
- [x] F2.5 — Content schema version validation completed.
- [x] `ContentSchemaSupport.supportedSchemaVersions` is explicit caller-supplied compatibility policy with membership semantics only.
- [x] one `UnsupportedSchemaVersionIssue` is returned per unsupported pack occurrence in pack input order.
- [x] `ContentPack.version`, dependency versions, schema migrations, and MissionTemplate version compatibility remain outside F2.5.
- [x] F2.6 — Content validation entry point / Foundation 2 integration gate completed.
- [x] `validateContent` composes duplicate-ID → static-reference → extension-ID → schema-version validation with explicit caller-supplied context.
- [x] mixed invalid content reports all four issue categories without short-circuiting or cross-pass deduplication.
- [x] coherent valid content passes preflight and can be explicitly registered into a fresh `ContentRegistry`.
- [x] Foundation 2 — Content Registry + Validator complete and locked.

## In Progress

- Foundation 1 is complete.
- Foundation 2 is complete.
- Foundation 3 has not started.

## Next Planned Phase

```text
Foundation 3 — Concept Graph + Activity Registry
```

## Next Planned Task

```text
F3.1 — Concept Graph builder
```

Build graph from registered concept prerequisites. Foundation 3 has not started.

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

28. **ContentRegistry is the instantiable generic Core content catalog**
    - each registry instance owns private in-memory catalogs for `ContentPackManifest`, `Concept`, `Course`, `World`, `Lesson`, `LearningActivity`, and `MissionTemplate`;
    - runtime/evidence/event objects `MissionInstance`, `AttemptRecord`, and `WorldEvent` are not static registry categories;
    - registration accepts canonical Foundation 1 domain objects directly and does not re-parse unknown/raw JSON;
    - missing lookups return `undefined`, list APIs preserve Map insertion order, and no global singleton or mutable Map surface is exported;
    - same-category duplicate registration fails before mutation and remains an independent live collision guard even after preflight validation exists.

29. **Duplicate validation is a pure pre-registration content pass**
    - `ContentDefinitionSet` accepts readonly canonical Foundation 1 definitions for the seven static content categories and does not parse raw JSON or unknown values;
    - duplicate identity is scoped to each category, so equal runtime ID strings may coexist across categories;
    - each same-category duplicate group produces one `DuplicateIdIssue` containing every zero-based occurrence index;
    - issue order follows PACK → CONCEPT → COURSE → WORLD → LESSON → ACTIVITY → MISSION_TEMPLATE and first occurrence within each category;
    - validation does not mutate, register, sort, remove, repair, or resolve references; reference validation remains F2.3.

30. **Reference validation is a pure pre-registration pass**
    - each invalid static authored reference occurrence produces one `MissingReferenceIssue` with source kind/ID/index, deterministic field path, target kind, referenced ID, and actionable message;
    - F2.3 validates pack→course, pack→pack dependency, course→world, world→lesson, lesson→concept/activity, concept→prerequisite concept, mission-backed activity→mission template, and mission template→concept;
    - duplicate definitions remain F2.2, duplicate target IDs still count as existing references, and self-references are not rejected as missing;
    - Concept Graph cycles remain Foundation 3, while generator/grader/runtime/hint/visualization ID validation remains F2.4;
    - `MissionInstance`, `AttemptRecord`, and `WorldEvent` remain outside static content reference validation.

31. **Extension-ID validation uses lightweight capability metadata only**
    - `ExtensionCapabilitySet` contains branded IDs only and does not map IDs to implementations;
    - extension namespaces are GENERATOR, GRADER, RUNTIME, HINT_SET, and VISUALIZATION_MODULE;
    - MissionTemplate extension references are validated before registration without mutating content or capability inputs;
    - each missing source occurrence produces one deterministic `MissingExtensionIssue` in MissionTemplate input order and canonical field order;
    - plugin-specific config validation and actual extension registries remain deferred.

32. **Content schema compatibility is explicit supported-version membership**
    - `ContentPack.version` is a content release identifier and receives no additional compatibility semantics in F2.5;
    - `ContentPack.schemaVersion` is the application/content-data compatibility contract;
    - compatibility is explicit membership in `ContentSchemaSupport.supportedSchemaVersions`, with no minimum/maximum/range interpretation;
    - older schema versions are not automatically supported, and future versions use the same `UNSUPPORTED_SCHEMA_VERSION` diagnostic;
    - no schema migration, SemVer resolver, pack upgrade/downgrade transform, or dependency-version system exists in Foundation 2.

33. **Foundation 2 exposes one pure pre-registration content validation gate**
    - `validateContent` accepts canonical `ContentDefinitionSet` objects plus explicit `ContentValidationContext`; generic Core does not invent extension-capability or schema-support policy;
    - it composes duplicate-ID, static-reference, extension-ID, and schema-version validation in that exact pass order, runs every pass, and preserves each validator's deterministic internal ordering without cross-pass deduplication;
    - validation is non-mutating and reports only; it does not parse raw JSON, repair definitions, register content, or own loading transactions;
    - `ContentRegistry` remains a separate in-memory catalog with its independent same-category collision guard;
    - normal content-loading composition must gate registration on `report.valid`, while atomic batch loading, rollback, hot reload, and pack ownership remain deferred.

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

None of these blocks the next planned **Foundation 3 — Concept Graph + Activity Registry** work.

## Validation Status

F2.6 / Foundation 2 completion validation:

- [x] `npm.cmd run typecheck` — passed with the public `validateContent` API and readonly report/context contracts;
- [x] focused `npm.cmd run test:run -- tests/content/content-validator.test.ts` — passed: 1 test file, 6 tests;
- [x] `npm.cmd run test:run` — passed: 18 test files, 278 tests;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] `git diff --check` — passed; the existing working-tree LF→CRLF warning for `DEV_STATUS.md` remains informational;
- [x] empty content with explicit empty context is valid, coherent content produces zero issues, and mixed invalid content returns DUPLICATE_ID → MISSING_REFERENCE → MISSING_EXTENSION → UNSUPPORTED_SCHEMA_VERSION;
- [x] all four passes run when earlier passes fail, report validity is derived from issue count, and content/context arrays remain unmodified;
- [x] coherent valid content can be explicitly registered into a fresh `ContentRegistry` with representative lookups succeeding; invalid content is left unregistered by the integration policy;
- [x] `src/core/content` depends only on Core domain contracts and sibling content modules; no Concept Graph, pack resolver, Activity Registry, implementation registry, plugin-config validator, loader, rollback/transaction system, or CS116 production content was added;
- [x] `git diff -- package.json package-lock.json` is empty; no new package was installed.

F2.5 validation:

- [x] `npm.cmd run typecheck` — passed with the public schema-compatibility validation API;
- [x] focused `npm.cmd run test:run -- tests/content/schema-version-validator.test.ts` — passed: 1 test file, 14 tests;
- [x] `npm.cmd run test:run` — passed: 17 test files, 272 tests;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] `git diff --check` — passed; the existing working-tree LF→CRLF warning for `DEV_STATUS.md` remains informational;
- [x] explicit membership supports one or multiple schema versions, empty support rejects every pack, duplicate support values are harmless, and gaps do not imply ranges;
- [x] older and future schema versions both produce `UNSUPPORTED_SCHEMA_VERSION` unless explicitly listed;
- [x] each unsupported pack occurrence receives its own issue in input order, including duplicate pack-ID occurrences;
- [x] `ContentPack.version` formats such as `1.0.0`, `v1`, and `2026.09` remain ignored by compatibility validation;
- [x] MissionTemplate version, F2.2 duplicates, F2.3 references, and F2.4 extension IDs remain separate concerns;
- [x] validation does not mutate pack arrays/objects or support arrays and does not re-parse Foundation 1 schemas;
- [x] no schema migrations, dependency-version ranges, general `ContentValidator`, or production CS116 content were added;
- [x] `src/core/content` remains independent of `content/cs116`, features, visualization implementation, app, React, Phaser, Monaco, Pyodide, and IndexedDB;
- [x] no new package was installed and `package.json` / `package-lock.json` have no F2.5 changes.

F2.4 validation:

- [x] `npm.cmd run typecheck` — passed with the public extension-capability validation API;
- [x] focused `npm.cmd run test:run -- tests/content/extension-id-validator.test.ts` — passed: 1 test file, 14 tests;
- [x] `npm.cmd run test:run` — passed: 16 test files, 258 tests;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] `git diff --check` — passed; the existing working-tree LF→CRLF warning for `DEV_STATUS.md` remains informational;
- [x] empty definitions/capabilities and fully satisfied MissionTemplate extension references produce no issues;
- [x] required generator/grader/runtime references and optional hint/visualization references produce one structured issue per missing source occurrence in canonical field order;
- [x] extension namespaces are independent, wrong-category IDs do not satisfy another category, and duplicate capability IDs still count as existing;
- [x] repeated missing IDs across MissionTemplates produce distinct source-indexed issues and multi-template ordering is deterministic;
- [x] validation does not mutate MissionTemplate arrays/objects or capability arrays, and JSON-safe extension configs are ignored;
- [x] F2.4 does not repeat F2.3 static-reference validation and does not inspect `MissionInstance`, `AttemptRecord`, or `WorldEvent`;
- [x] no generator/grader/runtime/hint/visualization implementation registry, plugin-specific config validation, Concept Graph behavior, or production CS116 extension definition was added.
- [x] `src/core/content` depends only on Core domain plus sibling Core content modules and has no dependency on `content/cs116`, features, visualization implementation, app, React, Phaser, Monaco, Pyodide, or IndexedDB;
- [x] no new package was installed and `package.json` / `package-lock.json` have no F2.4 changes.

F2.3 validation:

- [x] `npm.cmd run typecheck` — passed with the public missing-reference validation API;
- [x] `npm.cmd run test:run` — passed: 15 test files, 244 tests;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] `git diff --check` — passed; the existing working-tree LF→CRLF warning for `DEV_STATUS.md` remains informational;
- [x] empty input and a coherent definition set covering every F2.3 reference family produce no issues;
- [x] missing pack/course/dependency, concept prerequisite, course/world, world/lesson, lesson/concept/activity, mission-backed activity/template, and MissionTemplate/concept references produce structured issues with deterministic paths;
- [x] self pack/concept references count as existing, duplicate target definitions count as existing, and repeated missing references produce one issue per occurrence;
- [x] issue order is deterministic across source category, source input order, field order, and reference index;
- [x] MissionTemplate generator/grader/runtime/hint/visualization IDs are ignored for F2.3 and remain deferred to F2.4;
- [x] validation does not mutate input/reference arrays, register content, re-parse schemas, inspect runtime objects, or add Concept Graph behavior;
- [x] `src/core/content` remains independent of `content/cs116`, features, visualization, app, React, Phaser, Monaco, Pyodide, and IndexedDB;
- [x] no new package was installed and `package.json` / `package-lock.json` have no F2.3 changes.

F2.2 validation:

- [x] `npm.cmd run typecheck` — passed with the public duplicate-validation API and readonly typed definition input;
- [x] `npm.cmd run test:run` — passed: 14 test files, 228 tests;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] `git diff --check` — passed; the existing working-tree LF→CRLF warning for `DEV_STATUS.md` remains informational;
- [x] empty input and unique definitions across all seven static categories produce no issues;
- [x] duplicate concepts and activities produce one structured issue per duplicate group with all zero-based occurrence indexes;
- [x] multiple duplicate groups preserve first-occurrence order and multiple categories preserve the canonical category order;
- [x] equal runtime ID strings across categories remain valid, while different activity subtypes share the Activity namespace and MissionTemplate versions share the MissionTemplate namespace;
- [x] duplicate references inside an object are not treated as duplicate definitions, and no F2.3 missing-reference validation was added;
- [x] validation leaves input arrays/order untouched and does not use registry mutation as its implementation;
- [x] the existing `ContentRegistry` duplicate-registration guard remains unchanged and passing;
- [x] `src/core/content` has no dependency on `content/cs116`, features, visualization, app, React, Phaser, Monaco, Pyodide, or IndexedDB;
- [x] no new package was installed and `package.json` / `package-lock.json` have no F2.2 changes.

F2.1 validation:

- [x] `npm.cmd run typecheck` — passed with typed register/get/list APIs consuming public Foundation 1 domain contracts;
- [x] `npm.cmd run test:run` — passed: 13 test files, 217 tests;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] `git diff --check` — passed;
- [x] a new registry starts empty; missing typed lookups return `undefined` and all list APIs return empty arrays;
- [x] packs, concepts, courses, worlds, lessons, learning activities, and mission templates register and retrieve through their branded ID types;
- [x] list APIs preserve insertion order and return fresh readonly array surfaces rather than exposing internal Maps;
- [x] same-category duplicate registration throws before overwrite and leaves the original definition intact;
- [x] equivalent runtime strings in different branded categories can coexist because registry namespaces are category-local;
- [x] no `MissionInstance`, `AttemptRecord`, or `WorldEvent` registry category, global singleton, replacement/unregister API, batch pack registration, cross-reference validation, hierarchy traversal, Concept Graph query, specialized Activity query, pack dependency resolution, extension registry, raw schema parsing, or production CS116 content was added;
- [x] `src/core/content` imports only the public generic `src/core/domain` boundary and has no dependency on `content/cs116`, features, visualization, app, React, Phaser, Monaco, Pyodide, or IndexedDB;
- [x] no new package was installed and `package.json` / `package-lock.json` have no F2.1 changes.

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


