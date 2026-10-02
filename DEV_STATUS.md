# Development Status

## Current Phase

```text
Python Runtime — Pyodide Worker
```

Status: **In Progress**

Phase 0 remains complete and locked through the six source-of-truth documents:

- `PRODUCT_SPEC.md`
- `CURRICULUM.md`
- `MISSION_SYSTEM.md`
- `TECH_ARCHITECTURE.md`
- `ROADMAP.md`
- `DEV_STATUS.md`

Foundation 1 is complete and locked. F1.1 established the project/tooling foundation. F1.2 provides the smallest stable Core domain vocabulary and branded ID types. F1.3 provides the canonical `Concept` schema. F1.4 provides runtime-validatable `Course`, `World`, and `Lesson` hierarchy contracts. F1.5 provides the polymorphic `LearningActivity` contract. F1.6 provides the reusable `MissionTemplate` contract and JSON-safe extension configuration boundary. F1.7 provides the concrete generated `MissionInstance` snapshot with explicit learner/runtime/grading/world data boundaries. F1.8 provides the minimal strict `ContentPackManifest` contract for pack identity, schema versioning, course references, and pack dependencies. F1.9 provides the raw `AttemptRecord` evidence snapshot and minimal renderer-neutral `WorldEvent` envelope. F1.10 completes Foundation 1 with a coherent neutral fixture family, public-barrel integration checks, branded output checks, invalid-boundary regressions, JSON round-trip checks, and a domain dependency/type audit. F2.1 starts Foundation 2 with a small instantiable in-memory `ContentRegistry` for static content definitions only. F2.2 adds pure pre-registration duplicate-ID validation over the seven static content categories. F2.3 adds pure pre-registration validation for the locked static content reference families. F2.4 adds lightweight branded-ID capability validation for MissionTemplate extension references without introducing implementation registries. F2.5 adds explicit ContentPack schema-compatibility validation using a caller-supplied supported-version set. F2.6 completes Foundation 2 with one pure `validateContent` preflight entry point that composes all four validation passes with explicit capability/schema context before registration. F3.1 starts Foundation 3 with a framework-independent Concept Graph snapshot derived only from registered `Concept.prerequisites`. F3.2 adds deterministic cyclic strongly-connected-component analysis over that snapshot without changing graph construction. F3.3 adds direct prerequisite snapshots plus deterministic nearest-first prerequisite traversal over `ConceptGraph`. F3.4 adds a derived specialized `ActivityRegistry` snapshot for activity ID, Concept, stage, and type lookup while preserving `ContentRegistry` as the canonical registration owner. F3.5 completes Foundation 3 with the exact seven production CS116 NumPy concepts, their minimal acyclic prerequisite graph, and seven content-local vertical-slice activity skeletons that reserve stable activity planning metadata without creating executable LearningActivity or MissionTemplate definitions. F4.1 starts Foundation 4 with a browser-safe stateful deterministic `SeededRng` using the locked `fnv1a32-mulberry32-v1` algorithm and the minimal `nextFloat`, `nextInt`, `pick`, and `shuffle` generator-facing API. F4.2 adds exact current-registry `MissionTemplateId` + version resolution with canonical object identity and no version fallback. F4.3 adds deterministic structural MissionInstance creation from an already resolved template, exact seed, difficulty, and already-produced generator payload. F4.4 proves end-to-end deterministic MissionInstance generation composition with a test-only generator fixture. F4.5 completes Foundation 4 with a versioned deterministic retry-seed derivation policy that preserves the canonical base seed on MissionInstance identity while keeping retry state generator-internal. F5.1 starts Foundation 5 with the production `MissionGenerator` interface and an instantiable in-memory `GeneratorRegistry` that maps stable generator IDs to executable implementations while preserving the locked static-content and determinism boundaries. F5.2 adds the first three reusable production CS116 NumPy generator families in the content layer, with deterministic config-driven generation and no semantic-retry ownership. F5.3 adds a generic pure `MissionInstanceValidator` contract plus the first production Threshold Filter semantic validator, preserving generator/validator separation and test-only deterministic retry composition. F5.4 adds the generic browser-safe declarative grader engine over normalized execution snapshots, schema-validates authored grader config, evaluates all seven minimum reusable checks in authored order, and returns deterministic structured grading results without runtime/Pyodide coupling. F5.5 adds the common synchronous `Grader` contract, an instantiable `GraderRegistry`, and the built-in `core.declarative` adapter while keeping static grader config, generated grading data, and execution snapshots as separate inputs.

## Current Task

Python Runtime — Pyodide Worker

```text
PR.4 — Mission setup execution
```

Status: **Awaiting Manual Browser Validation**

Runtime checkpoints:

```text
PR.1 — RuntimeManager interface
```

Status: **Complete / Locked**

Architecture lock:

- PR.1 establishes a generic asynchronous `RuntimeManager` boundary between application/mission orchestration and runtime-specific execution infrastructure.
- `RuntimeManager` exposes separate `initialize`, `prepareMission`, `run`, `submit`, and `dispose` lifecycle operations.
- Run and Submit remain separate API operations because future Submit execution must use clean mission state while Run is experimental.
- Runtime request/response contracts are JSON-safe and do not expose Worker, Pyodide, React, Monaco, or CS116-specific types.
- Learner Python exceptions are distinct from runtime-system failures.
- Execution results normalize `stdout`, `stderr`, optional serialized JSON-safe values, and one of `SUCCESS`, `PYTHON_EXCEPTION`, `RUNTIME_ERROR`, or `TIMEOUT`.
- `TIMEOUT` is a contract outcome only; timeout and worker replacement remain deferred to PR.5.
- Runtime serialized values remain generic and are not the F5.4 `GraderExecutionSnapshot` contract.
- PR.1 contains no Worker, Pyodide, runtime execution, Mission Engine, grading, or UI wiring.

PR.1 validation:

- [x] focused runtime contract test passed: 1 test file, 12 tests;
- [x] `npm.cmd run typecheck` passed;
- [x] full regression suite passed: 35 test files, 627 tests;
- [x] `npm.cmd run build` passed;
- [x] `git diff --check` passed;
- [x] package files remain unchanged from App Shell checkpoint `23d4b62`;
- [x] static runtime audit found no React, Monaco, Pyodide, Worker, Node-only, CS116/content, grading-snapshot, timer, recovery, or registry leakage.

```text
PR.2 — Pyodide Web Worker boot
```

Status: **Complete / Locked**

Architecture lock:

- PR.2 provides the concrete Pyodide-backed `RuntimeManager` implementation behind the unchanged PR.1 public contract.
- Pyodide boots exclusively inside a module Web Worker through the internal `RUNTIME_INIT → READY / RUNTIME_ERROR` protocol.
- Worker correlation uses deterministic monotonic request IDs that remain internal to the adapter.
- Pyodide core boot assets are self-hosted under `assets/pyodide/` and resolved from Vite `BASE_URL`; core boot has no external CDN dependency.
- `initialize()` is idempotent after READY, concurrent-safe while booting, and retries with a fresh worker after ordinary boot failure.
- Worker errors, message errors, and Pyodide initialization errors are normalized to `RuntimeSystemError`; stale worker/request responses cannot transition the current manager.
- `dispose()` terminates the active worker, settles pending initialization, and permanently disposes that manager instance.
- `prepareMission`, `run`, and `submit` remain deliberately unimplemented and return structured `NOT_IMPLEMENTED` results.
- PR.2 executes no learner Python, captures no stdout/stderr, loads no NumPy package, implements no timeout/recovery/environment restoration, and does not wire Mission Workspace controls.
- The development-only `/dev` probe exists solely to verify real browser Pyodide Worker boot and disposes its manager when the page unmounts.

PR.2 automated validation:

- [x] focused runtime-manager lifecycle tests passed: 1 test file, 14 tests;
- [x] TypeScript typecheck passed;
- [x] full regression suite passed: 36 test files, 641 tests;
- [x] production build passed and copied the four local Pyodide core boot assets;
- [x] Vite development probe served `/dev` plus all four Pyodide assets locally with correct HTTP content types;
- [x] `git diff --check` passed;
- [x] static audits found no learner execution protocol, `runPython`, package loading, timeout/recovery system, runtime wiring in Mission Workspace/content, or introduced Pyodide CDN URL.

PR.2 manual browser validation is complete. Checkpoint `c7be4c4` remains the locked baseline for PR.3.

```text
PR.3 — Basic code execution
```

Status: **Complete / Locked**

Architecture lock:

- PR.3 implements `RuntimeManager.run()` through internal `RUN_CODE → RUN_RESULT` messages to the already initialized Pyodide Web Worker.
- Learner Python executes only inside the Worker through `runPythonAsync`; the public PR.1 runtime contracts remain unchanged and transport request IDs remain internal.
- Every Run installs fresh Worker-owned stdout/stderr captures, preserves emitted output on learner failure, and resets the capture hooks afterward.
- Ordinary Pyodide `PythonError` failures normalize to `PYTHON_EXCEPTION`; runtime/Worker failures normalize to `RUNTIME_ERROR`.
- One manager permits only one active Run. Concurrent Run requests return `RUNTIME_BUSY`; Run before READY returns `RUNTIME_NOT_READY`; Run after disposal returns `RUNTIME_DISPOSED`.
- Ordinary learner Python exceptions keep the initialized Worker usable for later Runs.
- Worker/message failures settle a pending Run and discard the failed Worker; later recovery still requires an explicit `initialize()`.
- `prepareMission` and `submit` remain deliberately `NOT_IMPLEMENTED`.
- PR.3 adds no NumPy/package loading, mission setup, serialized grading observations, timeout/interrupt handling, automatic worker replacement, environment restoration, grading, `AttemptRecord`, `WorldEvent`, or Mission Workspace runtime wiring.
- Infinite-loop execution is explicitly deferred until the timeout/recovery work in PR.5.

PR.3 automated validation:

- [x] focused runtime-manager tests passed: 1 test file, 26 tests;
- [x] TypeScript typecheck passed;
- [x] full regression suite passed: 36 test files, 653 tests;
- [x] production build passed and retained local Pyodide asset copying;
- [x] `git diff --check` passed;
- [x] `package.json` and `package-lock.json` are unchanged from PR.2 checkpoint `c7be4c4`;
- [x] generic runtime contracts remain unchanged and Pyodide-free;
- [x] `src/content` remains unaware of Pyodide, Worker, RuntimeManager, and React;
- [x] Mission Workspace has no runtime `run`/`submit` wiring and keeps `Chạy thử` / `Nộp bài` disabled;
- [x] static audit found no NumPy/package loading, timeout/watchdog/interrupt handling, grading, `AttemptRecord`, `WorldEvent`, or recovery implementation in PR.3 scope.

PR.3 manual browser execution validation is complete. Checkpoint `f8e115f` remains the locked baseline for PR.4.

```text
PR.4 — Mission setup execution
```

Status: **Awaiting Manual Browser Validation**

Architecture lock:

- PR.4 implements `RuntimeManager.prepareMission()` through internal `MISSION_PREPARE → MISSION_PREPARED / RUNTIME_ERROR` messages to the initialized Pyodide Worker.
- The public `RuntimeMissionPreparationRequest` remains unchanged and generic: it carries only optional JSON-safe `runtimeConfig` and `setupData`; transport request IDs remain internal.
- Each successful preparation creates a fresh Python execution namespace owned by the Worker. The Worker serializes JSON-safe `setupData` once and parses it with Python `json.loads`, so learner globals use normal recursive Python JSON semantics (`str` / numeric value / `bool` / `None` / `list` / `dict`) without ordinary setup structures leaking `JsProxy` values.
- Runs are stateful inside the current prepared namespace: one Run may mutate prepared variables and later Runs observe that mutation until another successful prepare occurs.
- Re-preparing creates a clean baseline and removes variables that existed only in the previous mission namespace.
- Preparation is transactional: a replacement namespace is validated and created before the previous valid namespace is destroyed, so a failed prepare leaves the prior environment usable.
- Setup variable names must be valid non-keyword Python identifiers and cannot be `__builtins__` or use the reserved `__runtime_` prefix. Invalid names fail with `INVALID_SETUP_DATA`.
- `runtimeConfig` currently supports only `undefined` or an empty object. Any non-empty object fails explicitly with `UNSUPPORTED_RUNTIME_CONFIG`; no speculative runtime-config DSL is introduced.
- PR.3 Run behavior is preserved: stdout/stderr capture remains per-Run, learner `PythonError` still normalizes to `PYTHON_EXCEPTION`, and ordinary learner exceptions leave the Worker usable.
- PR.4 adds no NumPy or other package loading, arbitrary content setup script, full `MissionInstance` loading, automatic `learner.data` binding, grading-data exposure, serialized grading values, Submit implementation, timeout/interrupt handling, worker replacement, environment restoration, grading, `AttemptRecord`, `WorldEvent`, or Mission Workspace runtime wiring.
- PR.5 owns timeout and worker replacement. PR.6 owns environment restoration.

PR.4 automated validation:

- [x] focused PR.4 runtime/setup tests passed: 3 test files, 45 tests, including 5 tests against the installed Pyodide 314.0.7 runtime for recursive JSON-to-Python conversion;
- [x] full regression suite passed: 38 test files, 672 tests;
- [x] `npm.cmd run typecheck` passed;
- [x] `npm.cmd run build` passed: 774 modules transformed and four local Pyodide assets copied; existing browser-externalization and large-chunk warnings remain non-failing;
- [x] `git diff --check` passed; working-tree LF→CRLF notices are informational;
- [x] public PR.1 runtime contracts are unchanged from checkpoint `f8e115f`;
- [x] `package.json` and `package-lock.json` are unchanged from checkpoint `f8e115f`;
- [x] `src/content` is unchanged from checkpoint `f8e115f` and contains no Pyodide, RuntimeManager, React, or runtime-implementation coupling;
- [x] Mission Workspace is unchanged from checkpoint `f8e115f`, has no RuntimeManager/Pyodide wiring, and keeps `Chạy thử` / `Nộp bài` disabled;
- [x] static audit found no package loading, timeout/watchdog/interrupt implementation, recovery/restoration, arbitrary setup script, MissionInstance/learner/grading wiring, grading, AttemptRecord, or WorldEvent implementation in PR.4 runtime/debug scope;
- [x] `submit()` remains `NOT_IMPLEMENTED`;
- [x] no new package dependency was added;
- [x] the development-only `/dev` probe now supports JSON mission preparation diagnostics without wiring Mission Workspace.

Real Pyodide browser validation is required before PR.4 can be marked Complete / Locked.

Next: **PR.5 — Timeout and worker replacement**.

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
- [x] F3.1 — Concept Graph builder completed.
- [x] `ConceptGraph` stores registered Concept IDs plus direct authored prerequisite adjacency using `concept → prerequisite` edges.
- [x] graph construction preserves registry insertion order, authored prerequisite order, duplicate prerequisite references, and zero-prerequisite nodes.
- [x] graph snapshots copy prerequisite arrays and remain independent of Course/World/Lesson presentation hierarchy.
- [x] F3.1 intentionally permits cycles, self-cycles, and dangling declared prerequisite IDs without adding F3.2/F3.3 behavior.
- [x] F3.2 — Concept Graph cycle detection completed.
- [x] `detectConceptCycles` reports cyclic strongly-connected components without modifying F3.1 graph construction.
- [x] self-cycles, multi-node cycles, multiple separate cycles, and SCCs containing multiple simple cycles are detected with deterministic graph insertion-order output.
- [x] dangling prerequisite IDs are ignored during cycle analysis, duplicate edges do not duplicate components, and graph inputs remain unmodified.
- [x] F3.2 remains browser-safe pure TypeScript and adds no dependency-query, topological-sort, reverse-index, Activity Registry, or CS116 production behavior.
- [x] F3.3 — Concept dependency queries completed.
- [x] `getDirectPrerequisites` returns copied direct prerequisite snapshots with authored ordering and duplicate references intact.
- [x] `getAllPrerequisites` performs deterministic nearest-first BFS with unique first-discovery ordering and source exclusion.
- [x] dependency traversal terminates on self/two/multi-node cycles without invoking F3.2 and preserves dangling declared IDs as terminal prerequisites.
- [x] F3.3 queries operate only on `ConceptGraph`, leave graph state unchanged, and remain browser-safe pure TypeScript.
- [x] F3.3 adds no reverse dependency/path/depth/topological APIs, caches/indexes, Activity Registry, learning/review policy, or CS116 production content.
- [x] F3.4 — Activity Registry completed.
- [x] `ActivityRegistry` is a derived snapshot/index built from canonical `ContentRegistry.getActivities()` data and exposes no second activity mutation path.
- [x] specialized lookup supports activity ID, Concept ID, `LearningStage`, and `LearningActivityType`.
- [x] concept/stage/type queries preserve ContentRegistry insertion order and return fresh caller-owned arrays.
- [x] multi-concept activities index under each distinct Concept ID, duplicate Concept references inside one activity do not duplicate results, and authored `conceptIds` remain unchanged.
- [x] ActivityRegistry snapshot behavior is explicit: later ContentRegistry registrations require rebuilding to appear in specialized indexes.
- [x] F3.4 remains browser-safe pure TypeScript and adds no ConceptGraph coupling, hierarchy query, MissionTemplate resolution, review/practice policy, learner state, difficulty index, or CS116 production content.
- [x] F3.5 — Minimal CS116 vertical-slice definitions completed.
- [x] exactly seven production CS116 NumPy concepts are defined with locked IDs, titles, source, classifications, and minimal prerequisites.
- [x] the production CS116 Concept Graph is acyclic and dependency queries return the expected direct/transitive prerequisite relationships.
- [x] seven stable vertical-slice activity skeletons reserve IDs/titles/stages/Concept mappings while remaining content-local planning metadata.
- [x] no fake executable `LearningActivity`, `MissionTemplate`, generator, grader, runtime, prompt/test/hint/starter-code, or hierarchy definitions were introduced.
- [x] Core remains CS116-agnostic and never imports `content/cs116`.
- [x] Foundation 3 — Concept Graph + Activity Registry complete and locked.
- [x] F4.1 — Seeded RNG abstraction completed.
- [x] `SeededRng`, `createSeededRng(seed: string)`, and `SEEDED_RNG_ALGORITHM` provide the shared deterministic generator-facing random source.
- [x] RNG algorithm v1 is locked as FNV-1a 32-bit seed hashing over exact JavaScript string code units plus Mulberry32 uint32 PRNG state.
- [x] `nextInt` uses validated half-open integer ranges with a maximum span of `2^32` and unbiased uint32 rejection sampling.
- [x] generic `pick` and Fisher–Yates `shuffle` are deterministic for the same stream history and do not mutate supplied collections.
- [x] golden float/integer vectors lock reproducibility behavior and independent instances have no shared state.
- [x] F4.1 remains browser-safe and adds no external RNG dependency, template resolution, instance creation, generator registry, retry policy, RNG serialization, or CS116 content changes.
- [x] F4.2 — MissionTemplate resolution completed.
- [x] `resolveMissionTemplate` resolves only exact `MissionTemplateId` + exact positive safe-integer version pairs from the canonical `ContentRegistry`.
- [x] unknown IDs and known IDs requested with a different valid version return `undefined`; no latest/range/nearest/compatibility fallback exists.
- [x] successful resolution returns the exact registered `MissionTemplate` object without re-parsing, cloning, merging, or mutation.
- [x] `ContentRegistry` remains one-template-per-stable-ID with its duplicate-ID guard unchanged; multi-version history/archive behavior remains deferred.
- [x] F4.2 remains browser-safe and adds no RNG use, implementation registry, MissionInstance creation, persistence, or CS116 MissionTemplate content.
- [x] F4.3 — MissionInstance creation contract completed.
- [x] `MissionGeneratorOutput` contains only generated learner/runtime/grading/world payload and cannot override canonical identity metadata.
- [x] `createMissionInstance` consumes an already resolved template, exact seed, difficulty, and generated output without registry lookup or generator execution.
- [x] template ID/version and Concept IDs come from the template; seed/difficulty come from creation input; objective and concrete payload come from generator output.
- [x] generated starter code uses nullish override semantics over the template default, including preserving an explicit empty string.
- [x] deterministic delimiter-safe textual instance IDs depend only on template ID/version, difficulty, and exact seed; generated payload changes do not change the ID.
- [x] candidate instances are validated through the canonical `MissionInstanceSchema`, preserving learner/runtime/grading/world separation and rejecting invalid structural output.
- [x] F4.3 adds no generator interface/registry, semantic instance validator, RNG invocation, retry/sub-seed policy, grading/runtime execution, WorldEvent behavior, or CS116 mission content.
- [x] F4.4 — End-to-end mission determinism tests completed.
- [x] a local test-only generator consumes MissionTemplate generator config, Difficulty, and a caller-created fresh `SeededRng`, then composes its `MissionGeneratorOutput` through `createMissionInstance`.
- [x] identical template identity/version/config + difficulty + exact seed reproduce the full MissionInstance across independent runs, repeated runs, multiple fixed seeds, separate equivalent template objects, and JSON-round-tripped templates.
- [x] fixed changed-seed variants differ in concrete generated payload, each canonical difficulty reproduces independently, and controlled fixture difficulty affects generated sample count.
- [x] generator config evolution is modeled only as same stable template ID with a higher MissionTemplate version; config and fixed RNG call order are treated as reproducibility-sensitive.
- [x] inherited starter code, exact nontrivial seed text, learner/runtime/grading/world payloads, schema validity, and input immutability are covered.
- [x] F4.4 changes only test/status files and adds no production generator interface/registry, semantic validator, grader, reference solver, retry/sub-seed behavior, CS116 generator/content, runtime/UI behavior, or dependency.
- [x] F4.5 — Deterministic retry seed policy completed.
- [x] `deriveGenerationAttemptSeed` preserves exact base seed for attempt 0 and derives versioned encoded retry seeds for attempts 1+.
- [x] retry seed derivation is stateless, browser-safe, deterministic, and accepts the full non-negative safe-integer attempt-index range.
- [x] retry composition with F4.1 reproduces rejected attempts, later accepted output, and the full accepted MissionInstance from the same base seed.
- [x] MissionInstance keeps the canonical base seed and base-seed identity; retry seed/index are not persisted.
- [x] F4.5 adds no production retry loop, semantic validator, generator/grader registry, reference solver, CS116 content, AttemptRecord schema field, or dependency.
- [x] Foundation 4 — Mission Template / Instance + Seeded RNG complete and locked.
- [x] F5.1 — Generator Registry completed.
- [x] `MissionGeneratorContext` is limited to template version, generator config, canonical Difficulty, and caller-supplied SeededRng.
- [x] `MissionGenerator` synchronously returns the existing `MissionGeneratorOutput` contract and owns no mission identity, retry policy, grading, runtime execution, or visualization implementation.
- [x] `GeneratorRegistry` is instantiable, insertion-ordered, ID-based, append-only, and returns canonical implementation references plus isolated generator-ID snapshots.
- [x] duplicate generator-ID registration fails before mutation while ordinary missing lookup returns `undefined`.
- [x] GeneratorRegistry IDs compose with the existing F2.4 `ExtensionCapabilitySet.generatorIds` without validator changes.
- [x] F5.1 adds no real CS116 generator, semantic validator, grader infrastructure, reference solver, production retry orchestration, package dependency, or CS116 content change.
- [x] F5.2 — First simple generators completed.
- [x] exactly three first-slice CS116 production generator IDs are registered in deterministic order: matrix-shape, column-extract, threshold-filter.
- [x] VS-01/VS-02 share Matrix Shape through config, VS-03 uses Column Extract, and VS-04/VS-05 share Threshold Filter through config.
- [x] production CS116 generators remain content-local, deterministic, JSON-safe, browser-safe, and independent of Python/runtime/grader/visualization execution.
- [x] Threshold Filter returns candidate output directly without retrying empty or universal selections; semantic acceptance remains deferred to F5.3.
- [x] F5.3 — Instance validators completed.
- [x] Generic Core exposes only the pure `MissionInstanceValidator` contract; the first production Threshold Filter validator remains CS116 content-local.
- [x] Threshold Filter validation safely rejects malformed family data plus empty/universal expected selections without mutation, RNG, retry, grading, learner feedback, or reference solving.
- [x] F4.5 retry seeds, F5.2 generation, canonical MissionInstance creation, and F5.3 validation compose deterministically in test-only bounded retry coverage.
- [x] F5.4 — Declarative Grader Engine completed.
- [x] Generic Core now exposes a browser-safe declarative grader over normalized execution snapshots with schema-validated authored config and seven minimum reusable checks.
- [x] Learner/runtime mismatches return structured check failures, exact/approximate comparisons are deterministic, and no runtime/Pyodide or CS116 dependency is introduced.
- [x] F5.5 — Grader Registry escape hatch completed.
- [x] `GraderRegistry` provides the executable grader lookup boundary, registers `core.declarative`, and preserves custom graders as a local trusted escape hatch without changing static content validation.
- [x] F5.6 — Reference solver test loop completed.
- [x] Matrix Shape, Column Extract, and Threshold Filter reference solvers independently compute trusted expected behavior from learner mission data and drive the full generator → validator → solver → grader QA loop.
- [x] deterministic Threshold Filter retry reproduction, hidden-data cross-checks, negative grading, and solver purity/immutability are covered.
- [x] Foundation 5 — Generator + Grader Registries complete and locked.

## In Progress

- Foundation 1 is complete.
- Foundation 2 is complete.
- Foundation 3 is complete and locked.
- Foundation 4 is complete and locked.
- Foundation 5 is complete and locked.
- App Shell is next; implementation has not started.

## Next Planned Phase

```text
App Shell — React Workspace
```

## Next Planned Task

```text
AS.1 — Vite/React shell
```

Establish the browser-first React application shell and composition root on top of the locked Foundation 1–5 contracts.

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

34. **Concept Graph construction is derived only from registered Concept prerequisites**
    - `buildConceptGraph` derives a framework-independent snapshot solely from `ContentRegistry.getConcepts()` and each `Concept.prerequisites` array;
    - canonical edge direction is `concept → prerequisite`, while Concept insertion order and authored prerequisite order remain deterministic and unsorted;
    - Course, World, and Lesson presentation hierarchy does not participate in graph construction;
    - F3.1 preserves direct authored prerequisite references, including duplicates and defensive dangling IDs, without repair or revalidation;
    - F3.1 performs no cycle detection or dependency traversal; cycle detection remains F3.2 and dependency queries remain F3.3.

35. **Concept cycle detection analyzes the F3.1 graph without changing graph construction**
    - cycles are represented as cyclic strongly-connected components rather than every possible simple cycle;
    - a component is cyclic when it contains more than one registered Concept, or when a single registered Concept has a direct self-edge;
    - cyclic component order and member order follow `ConceptGraph.conceptIds` insertion order, independent of internal SCC traversal order;
    - dangling prerequisite IDs are ignored during cycle traversal because they are not graph nodes; missing-reference validation remains Foundation 2;
    - cycle detection is pure analysis and does not repair edges, mutate the graph, throw for normal cycle findings, or change `buildConceptGraph`.

36. **Concept dependency queries consume ConceptGraph as the canonical dependency snapshot**
    - queries operate on `ConceptGraph`, not Course/World/Lesson presentation hierarchy or `ContentRegistry`;
    - `getDirectPrerequisites` preserves authored prerequisite order and duplicate references while returning a caller-owned array;
    - `getAllPrerequisites` performs deterministic nearest-first breadth-first traversal, with first discovery fixing output position;
    - transitive results contain each discovered prerequisite at most once and never contain the source Concept;
    - traversal is cycle-safe but does not replace or automatically invoke F3.2 cycle detection;
    - dangling declared prerequisite IDs are returned once as terminal references while F2.3 remains responsible for missing-reference validation.

37. **ActivityRegistry is a derived specialized snapshot while ContentRegistry remains canonical**
    - static `LearningActivity` registration continues exclusively through `ContentRegistry.registerActivity`;
    - `buildActivityRegistry` snapshots `ContentRegistry.getActivities()` and does not add a second registration/mutation path or live synchronization;
    - ActivityRegistry supports lookup by activity ID, Concept ID, `LearningStage`, and `LearningActivityType`;
    - concept/stage/type result ordering follows canonical ContentRegistry activity registration order and multi-result queries return caller-owned arrays;
    - a multi-concept activity is indexed under each distinct Concept ID, while duplicate Concept IDs inside one activity do not duplicate that activity in results;
    - ActivityRegistry and ConceptGraph remain independent Core capabilities, and review/practice selection policy remains deferred.

38. **Foundation 3 production CS116 vertical-slice definitions are locked**
    - exactly seven primary Concept IDs exist for the first production slice, in canonical order: `numpy.array`, `numpy.shape`, `numpy.ndim`, `numpy.index.column`, `numpy.compare`, `numpy.boolean_mask`, `numpy.logical_and`;
    - F3.5 knowledge classifications are explicit implementation choices derived from curriculum emphasis: `numpy.array`, `numpy.shape`, `numpy.ndim`, `numpy.index.column`, and `numpy.boolean_mask` are `MUST_RECALL`; `numpy.compare` and `numpy.logical_and` are `MUST_UNDERSTAND`;
    - minimal prerequisites are locked as: `numpy.array` → `[]`; `numpy.shape`, `numpy.ndim`, `numpy.index.column`, and `numpy.compare` → [`numpy.array`]; `numpy.boolean_mask` → [`numpy.compare`]; `numpy.logical_and` → [`numpy.compare`];
    - this graph is intentionally minimal and acyclic; presentation sequencing remains separate from Concept prerequisites;
    - seven stable planning skeletons are reserved as `cs116.numpy.vs01` through `cs116.numpy.vs07`, with their F3.5 titles, stages, source-stage labels where present, and exact Concept mappings;
    - these skeletons are content-local metadata only, not canonical executable `LearningActivity` or `MissionTemplate` definitions, and they are not registered in `ActivityRegistry`;
    - Generic Core remains CS116-agnostic: `core/` never imports or references `content/cs116`.

39. **F4.1 provides one shared deterministic SeededRng contract**
    - canonical RNG seed input is the exact supplied string; the implementation does not trim, case-fold, Unicode-normalize, parse, or auto-generate seed text;
    - algorithm v1 is `fnv1a32-mulberry32-v1`: FNV-1a 32-bit hashes JavaScript UTF-16 code units into initial uint32 state, then Mulberry32 advances the deterministic stream;
    - public generator-facing primitives are exactly `nextFloat`, `nextInt`, `pick`, and `shuffle`; the internal uint32 primitive remains private;
    - same seed plus the same call sequence produces the same outputs, while separately created RNGs never share mutable state;
    - `nextInt` uses half-open `[minInclusive, maxExclusive)` semantics, finite safe-integer bounds, a maximum span of `2^32`, and deterministic rejection sampling over uint32 outputs;
    - `pick` and `shuffle` operate on positions only, remain generic over item type, and do not mutate caller collections; shuffle uses Fisher–Yates;
    - production RNG code uses no `Math.random`, timestamps, crypto entropy, Node-specific APIs, machine state, or global RNG singleton;
    - changing hashing or PRNG behavior changes generated streams for existing seeds and is therefore a compatibility decision;
    - runtime algorithm selection, general fork/sub-seed APIs, and RNG state serialization remain deferred; deterministic generation-attempt retry seed derivation is locked by F4.5.

40. **F4.2 MissionTemplate resolution is exact and current-registry only**
    - resolution requires the exact `MissionTemplateId` plus an exact finite positive safe-integer version;
    - the resolver queries only `ContentRegistry.getMissionTemplate(templateId)` and succeeds only when that registered object's `version` equals the requested version;
    - unknown IDs and known IDs with another valid version are normal misses that return `undefined`;
    - successful resolution returns the exact canonical registered object by identity without schema re-parse, clone, config merge, or mutation;
    - no latest, nearest, range, minimum/maximum, compatibility, or alternate-template fallback is allowed;
    - `ContentRegistry` remains one-template-per-stable-ID and is not expanded into a multi-version store;
    - historical content archives, migration tables, and historical loading remain deferred; a future historical loader may populate the relevant historical registry before using the same exact resolver contract.

41. **F4.3 MissionInstance creation separates generated payload from canonical identity**
    - creation consumes an already resolved `MissionTemplate`, exact seed, requested difficulty, and already-produced `MissionGeneratorOutput`;
    - `MissionGeneratorOutput` owns only concrete learner/runtime/grading/world payload and exposes no instance/template identity, seed, difficulty, or Concept-ID override fields;
    - `templateId`, `templateVersion`, and ordered `conceptIds` always come from the supplied template, while seed and difficulty come exactly from creation input;
    - generated learner `starterCode` overrides template `starterCode` with nullish semantics; an explicit generated empty string is preserved;
    - instance IDs are transparent deterministic text derived only from encoded template ID, template version, difficulty, and encoded exact seed; generated payload does not participate;
    - learner-visible data, runtime setup data, grading-only data, and world initial state remain separate canonical branches;
    - template generator/grader/runtime/visualization configs, restrictions, and hint references remain template-version-owned and are not copied into MissionInstance;
    - the factory validates the assembled object through the existing canonical `MissionInstanceSchema` and performs no semantic mission-family validation;
    - generator execution/interface/registry remains Foundation 5, determinism integration is covered by F4.4, and generation-attempt retry seed derivation is defined by F4.5 / Architecture Lock 43.

42. **F4.4 proves deterministic MissionInstance generation composition with a test-only fixture**
    - the integration harness composes MissionTemplate identity/version/config, Difficulty, exact seed, a freshly created `SeededRng`, deterministic fixture generation, `MissionGeneratorOutput`, and `createMissionInstance`;
    - for identical reproduction inputs, independent runs produce deeply identical full MissionInstances including learner, runtime, grading, and world payloads, not only the deterministic instance ID;
    - selected changed fixed seeds may produce deterministic allowed variants; F4.4 makes no statistical randomness-quality guarantee;
    - generator config and RNG consumption order are reproducibility-sensitive behavior, so changes that affect historical reproduction require a MissionTemplate version bump;
    - no production `MissionGenerator` interface or Generator Registry is introduced by F4.4; Foundation 5 retains that ownership;
    - deterministic generation-attempt retry seed behavior is defined by F4.5 / Architecture Lock 43.

43. **F4.5 locks deterministic generation-attempt retry seed derivation and completes Foundation 4**
    - policy identifier is `mission-retry-seed-v1`;
    - attempt indexes are zero-based finite non-negative safe integers; attempt 0 returns the exact base seed unchanged;
    - attempts 1+ derive the exact string `mission-retry:v1:<attemptIndex>:<encodeURIComponent(baseSeed)>` from the exact base seed without normalization, hashing, entropy, or state;
    - the derived attempt seed is consumed by the existing F4.1 `SeededRng`; derivation itself does not create RNG state or orchestrate retries;
    - `MissionInstance.seed` remains the canonical public reproduction seed and deterministic instance identity continues to use that base seed;
    - retry attempt seed/index are internal generation details and are not persisted into MissionInstance or AttemptRecord;
    - changes to generator behavior, semantic validation, retry acceptance behavior, or RNG consumption that can change the accepted output for an existing reproduction tuple require a MissionTemplate version bump;
    - no production retry loop, global max-attempt policy, semantic validator framework, Generator Registry, Grader Registry, reference solver, or CS116 mission-family implementation is introduced by F4.5;
    - Foundation 4 — Mission Template / Instance + Seeded RNG is complete and locked; the next planned phase is Foundation 5 — Generator + Grader Registries.

44. **F5.1 defines the production MissionGenerator contract and GeneratorRegistry**
    - `GeneratorRegistry` is an instantiable in-memory executable extension registry mapping stable `MissionGeneratorId` values to canonical `MissionGenerator` implementation references;
    - `ContentRegistry` remains the owner of static content definitions; executable generator behavior is kept in `GeneratorRegistry`;
    - `MissionGeneratorContext` contains only `templateVersion`, optional generator `config`, canonical `Difficulty`, and a caller-supplied `SeededRng`;
    - `MissionGenerator.generate` is synchronous and returns the existing F4.3 `MissionGeneratorOutput` contract;
    - generators receive no raw seed, retry seed/index, MissionTemplate object, template ID, MissionInstance ID, Concept IDs, grader/runtime/visualization bindings, or lifecycle/execution-environment dependencies;
    - generator IDs belong to the registry association and are not duplicated on implementation objects; different IDs may intentionally share the same implementation reference;
    - duplicate generator-ID registration throws before mutation; missing lookup returns `undefined`; ID snapshots preserve insertion order and do not expose mutable internal state;
    - multiple GeneratorRegistry instances are independent, with no global singleton, unregister, replacement, overwrite option, registry version, or config-schema registry;
    - `GeneratorRegistry.getGeneratorIds()` can be supplied directly to the existing F2.4 `ExtensionCapabilitySet.generatorIds` without changing `validateExtensionIds`, `validateContent`, or Foundation 2 semantics;
    - GeneratorRegistry performs no MissionInstance assembly, retry orchestration, semantic validation, grading, reference solving, runtime execution, or visualization implementation;
    - F5.1 remains the generic executable-generator contract/registry boundary; concrete CS116 implementations remain content-owned.

45. **F5.2 locks the first production CS116 generator families**
    - exactly three stable first-slice IDs exist: `cs116.numpy.matrix-shape`, `cs116.numpy.column-extract`, and `cs116.numpy.threshold-filter`;
    - Matrix Shape serves VS-01/VS-02, Column Extract serves VS-03, and Threshold Filter serves VS-04/VS-05; VS-06/VS-07 remain unimplemented at this stage;
    - concrete generator code lives under `src/content/cs116/generators`; `src/core` remains independent of CS116 content;
    - activity-level differences are represented primarily by validated generator config such as matrix mode and threshold instruction level/comparison;
    - each generator returns deterministic JSON-safe `MissionGeneratorOutput` derived only from template version, config, Difficulty, and caller-supplied SeededRng;
    - generators do not execute Python, assemble MissionInstance identity, own grader/runtime execution, provide solution code, or manipulate visualization;
    - Threshold Filter computes candidate expected IDs once and returns them even when the result is empty or universal; semantic retry/acceptance belongs to F5.3;
    - RNG consumption order is part of reproducibility: matrix values are row-major; Column Extract samples the target column only after the matrix; Threshold Filter samples values in entity order and threshold last;
    - any behavior change that can alter output for an existing template/config/difficulty/seed tuple requires MissionTemplate versioning;
    - Foundation 5 remains in progress; F5.3 provides semantic candidate acceptance after canonical instance creation.

46. **F5.3 defines semantic MissionInstance validation without collapsing generator, retry, or grader boundaries**
    - Generic Core defines only a pure `MissionInstanceValidator` contract over canonical `MissionInstance`, with stable string issue codes and `valid === (issues.length === 0)`;
    - the first production validator is content-owned Threshold Filter validation for valid family data plus non-empty/non-universal expected selections;
    - malformed family data returns `THRESHOLD_FILTER_INVALID_DATA` and short-circuits semantic count checks; ordinary invalidity is returned, not thrown;
    - validators do not mutate instances, consume RNG, retry/resample/repair generation, log or persist state, grade learner submissions, or emit learner-facing feedback;
    - Threshold Filter validation does not recompute GT/GTE solutions; reference solving remains deferred;
    - the F5.2 Threshold Filter generator remains candidate-only and may emit rejected empty/universal candidates;
    - no ValidatorRegistry, validator ID, MissionTemplate validation binding, MissionInstance validation field, or production retry service is introduced;
    - deterministic F4.5 + F5.2 + F5.3 retry composition is proven only through bounded test integration;
    - Foundation 5 remains in progress; F5.4 — Declarative Grader Engine follows this boundary.

47. **F5.4 defines a generic declarative grader over normalized execution snapshots**
    - the grader consumes only a normalized `GraderExecutionSnapshot`: a variable map whose observed values contain `pythonType`, `isNdarray`, optional `shape`, optional JSON `value`, plus an optional execution exception;
    - the grader remains independent of Python, Pyodide, RuntimeManager, Worker protocol, and CS116 content; runtime-specific code is responsible for producing the normalized snapshot;
    - declarative grader config is validated through the canonical local Zod schema before any check evaluation; malformed authored config throws as an authoring/configuration error;
    - learner/runtime mismatches never throw from grading and instead produce structured `GraderCheckResult` failures using the locked failure categories;
    - the minimum primitive set is `NO_EXCEPTION`, `VARIABLE_EXISTS`, `PYTHON_TYPE`, `NDARRAY_TYPE`, `SHAPE`, `EXACT_VALUES`, and `APPROX_VALUES`;
    - authored checks execute in exact authored order, all checks run without short-circuiting, and the overall result passes exactly when every authored check passes;
    - `EXACT_VALUES` uses recursive structural JSON equality with array order significance and object key-order independence;
    - `APPROX_VALUES` accepts numeric scalars or recursively nested numeric arrays and uses only the explicitly authored non-negative absolute tolerance; no relative tolerance is implied;
    - execution exceptions are copied into `GraderResult.runtimeError` whenever present, while an exception affects overall pass only when an authored check fails because of it, such as `NO_EXCEPTION`;
    - `GraderResult` is the generic common result for future grader implementations; optional `conceptualGuidance` and `semanticResult` remain undefined in F5.4;
    - F5.4 adds no `GraderRegistry`, custom grader implementation, built-in grader ID, production CS116 grader config, learner feedback renderer, dtype/scalar duplicate primitive, raises-exception primitive, mutation primitive, or new dependency;
    - Foundation 5 remains in progress; F5.5 — Grader Registry escape hatch is next.

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

- exact runtime message schema field names;
- exact IndexedDB wrapper;
- precise v1 mastery thresholds for “multiple independent variants”;
- exact simple review-priority weights;
- whether a given data visualization is best rendered in React or Phaser on a case-by-case basis;
- which later grader primitives are justified after the vertical slice.

None of these blocks the next planned **Foundation 5 — Generator + Grader Registries** work.

## Validation Status

F5.4 validation:

- [x] TypeScript typecheck — passed;
- [x] focused `tests/grading/declarative-grader.test.ts` — passed: 1 test file, 60 tests;
- [x] full Vitest suite — passed: 32 test files, 584 tests;
- [x] Vite 8.3.1 production build — passed;
- [x] `git diff --check` — passed with only informational LF→CRLF warnings from existing modified files;
- [x] `git diff -- package.json package-lock.json` — empty; no dependency was added;
- [x] `src/core/grading` audit found no Pyodide, runtime implementation, Node-only API, React, Phaser, IndexedDB, or `content/cs116` dependency;
- [x] schema/config rejection, all seven primitives, missing observations, all-check execution, authored order, overall pass semantics, recursive exact comparison, absolute-tolerance approximate comparison, runtime-error copying, input immutability, fresh result isolation, deterministic repeat grading, and a representative vertical-slice-like snapshot are covered;
- [x] no manual user testing is required for this foundation-only change;
- [x] Foundation 5 remains in progress with F5.5 — Grader Registry escape hatch as the next planned task.

F5.3 validation:

- [x] TypeScript typecheck — passed;
- [x] focused `tests/content/cs116/validators/threshold-filter-validator.test.ts` — passed: 1 test file, 25 tests;
- [x] full Vitest suite — passed: 31 test files, 524 tests;
- [x] Vite 8.3.1 production build — passed;
- [x] `git diff --check` — passed with only informational LF→CRLF warnings;
- [x] `git diff -- package.json package-lock.json` — empty; no dependency was added;
- [x] `src/core` audit found no import from `content/cs116`;
- [x] production validator audit found no Math.random, time/crypto entropy, Node-only API, filesystem/network dependency, or external state access;
- [x] invalid family data, empty/universal selection rejection, valid 1..N-1 acceptance, deterministic issue results, input immutability, fresh result isolation, real generator composition, representative difficulty candidates, multi-seed coverage, and test-only deterministic retry composition are covered;
- [x] no manual user testing is required for this foundation-only change;
- [x] Foundation 5 remains in progress with F5.4 — Declarative Grader Engine as the next planned task.

F5.2 validation:

- [x] TypeScript typecheck — passed;
- [x] focused `tests/content/cs116/generators/generators.test.ts` — passed: 1 test file, 25 tests;
- [x] full Vitest suite — passed: 30 test files, 499 tests;
- [x] `npm.cmd run build` — passed with Vite 8.3.1 production bundling;
- [x] `git diff --check` — passed; only informational working-tree LF→CRLF warnings were emitted;
- [x] `git diff -- package.json package-lock.json` — empty; no dependency was added;
- [x] `src/core` audit found no import from `content/cs116`;
- [x] production generator audit found no Math.random, time/crypto entropy, Node-only API, filesystem/network dependency, or external state access;
- [x] exactly three registered IDs, duplicate-registration failure, fixed-seed determinism, selected changed-seed variants, difficulty sizing, range constraints, hidden grading data, local config validation, pre-RNG invalid-config rejection, GT/GTE correctness, no semantic retry, and F4 MissionInstance composition are covered;
- [x] no manual user testing is required for this foundation-only change;
- [x] Foundation 5 remains in progress with F5.3 — Instance validators as the next planned task.

F5.1 validation:

- [x] TypeScript typecheck — passed;
- [x] focused `tests/generators/generator-registry.test.ts` — passed: 1 test file, 13 tests;
- [x] full Vitest suite — passed: 29 test files, 474 tests, including all locked Foundation 4 coverage;
- [x] `npm.cmd run build` — passed with Vite 8.3.1 production bundling;
- [x] `git diff --check` — passed;
- [x] `git diff -- package.json package-lock.json` — empty; no dependency was added;
- [x] `git diff -- src/content/cs116` — empty; production CS116 content is unchanged;
- [x] fresh registry behavior, canonical implementation identity, multiple independent mappings, ordinary misses, duplicate same/different implementation rejection, shared implementation under different IDs, insertion order, ID snapshot isolation, and independent registry instances are covered;
- [x] MissionGenerator fixture coverage proves direct use of templateVersion/config/Difficulty/caller-supplied SeededRng, same-seed deterministic reproduction, and selected changed-seed variation;
- [x] existing F2.4 `validateExtensionIds` accepts `GeneratorRegistry.getGeneratorIds()` through `ExtensionCapabilitySet.generatorIds`, while an absent registered generator still produces the existing missing-generator issue;
- [x] production `src/core/generators` contains no `Math.random`, `Date.now`, `performance.now`, crypto randomness, Node-only API, filesystem/network dependency, or external state access;
- [x] Foundation 4 remains complete and locked; Foundation 5 is in progress and next planned task is F5.2 — First simple generators.

F4.5 validation:

- [x] TypeScript typecheck — passed;
- [x] focused `tests/missions/generation-attempt-seed.test.ts` — passed: 1 test file, 32 tests;
- [x] full Vitest suite — passed: 28 test files, 461 tests, including F4.1-F4.4 coverage;
- [x] `npm.cmd run build` — passed with Vite 8.3.1 production bundling;
- [x] `git diff --check` — passed; only the existing line-ending warning for `DEV_STATUS.md` was emitted;
- [x] `git diff -- package.json package-lock.json` — empty; no dependency was added;
- [x] `git diff -- src/content/cs116` — empty; production CS116 content is unchanged;
- [x] policy identifier, exact attempt-0 preservation, golden retry strings, delimiter encoding, no normalization, safe-integer validation, stateless recreation, distinct retry indexes, and F4.1 RNG composition are covered;
- [x] test-only retry simulation contains at least one rejected attempt before later deterministic success and reproduces the rejected sequence, accepted attempt, accepted generator output, and full MissionInstance;
- [x] accepted MissionInstance stores the original base seed, keeps the base-seed-derived instance ID, and persists no retry seed/index metadata;
- [x] production `generation-attempt-seed.ts` contains no `Math.random`, timestamp/crypto entropy, Node-only API, external dependency, production retry loop, semantic validator, generator registry, grader, reference solver, or max-attempt policy;
- [x] at F4.5 completion, Foundation 4 was complete and locked with F5.1 — Generator Registry as the next planned task.

F4.4 validation:

- [x] TypeScript typecheck — passed;
- [x] focused `tests/missions/mission-determinism.test.ts` — passed: 1 test file, 19 tests;
- [x] full Vitest suite — passed: 27 test files, 429 tests;
- [x] `npm.cmd run build` — passed after moving aside a stale generated `dist` directory whose existing files were undeletable in the host filesystem; browser bundling also passed with `--emptyOutDir false` during diagnosis;
- [x] `git diff --check` — passed;
- [x] `git diff -- package.json package-lock.json` — empty; no dependency was added;
- [x] identical-tuple deep equality, repeated fresh-RNG reproduction, multiple fixed seeds, separate equivalent templates, JSON round-trip, exact complex seed preservation, starter-code inheritance, learner/runtime/grading/world reproduction, difficulty reproduction/variant behavior, versioned config evolution, schema validity, and input immutability are covered;
- [x] fixture generation contains no `Math.random`, timestamp/performance entropy, crypto entropy, shared/global RNG state, retry/sub-seed logic, or production generator registry behavior;
- [x] production source and `src/content/cs116` are unchanged by F4.4; browser-safety remains the F4.1-F4.3 production path;
- [x] at F4.4 completion, Foundation 4 remained in progress with F4.5 as the next task.

F4.3 validation:

- [x] TypeScript typecheck — passed with public `MissionGeneratorOutput`, `CreateMissionInstanceInput`, and `createMissionInstance` contracts;
- [x] focused `tests/missions/mission-instance-creation.test.ts` — passed: 1 test file, 27 tests;
- [x] full Vitest suite — passed: 26 test files, 410 tests;
- [x] Vite production build — passed, confirming F4.3 production code remains browser-bundle safe;
- [x] `git diff --check` — passed;
- [x] `git diff -- package.json package-lock.json` — empty; no dependency was added;
- [x] minimal/full payload assembly, starter-code fallback/override/explicit-empty/absence, Concept-ID copying, exact seed preservation, deterministic ID reproduction and each identity dimension, delimiter-safe encoding, payload-independent identity, learner/grading/runtime/world separation, template-config exclusion, canonical-schema parsing/failure, input immutability, registry-free creation, and F4.2 composition are covered;
- [x] existing F4.1 seeded-RNG tests and F4.2 exact resolver tests remain green in the full suite;
- [x] production `src/core/missions/mission-instance-creation.ts` imports only the Core domain boundary and uses browser-safe ECMAScript/TypeScript primitives;
- [x] no generator execution/interface/registry, semantic instance validator, grading, runtime execution, WorldEvent logic, retry/sub-seed policy, RNG invocation, CS116 content change, or package change was added;
- [x] Foundation 4 remains in progress and next task is F4.4 — Determinism tests.

F4.2 validation:

- [x] TypeScript typecheck — passed with public `resolveMissionTemplate(registry, templateId, version)`;
- [x] focused `tests/missions/mission-template-resolver.test.ts` — passed: 1 test file, 18 tests;
- [x] full Vitest suite — passed: 25 test files, 383 tests;
- [x] Vite production build — passed, confirming `core/missions` remains browser-bundle safe;
- [x] `git diff --check` — passed;
- [x] `git diff -- package.json package-lock.json` — empty; no dependency was added;
- [x] exact-match identity, unknown-ID miss, both older/newer version mismatches, no cross-template fallback, same-version ID isolation, version 1, invalid version rejection, no mutation, multiple distinct IDs, empty registry, and semantic-content irrelevance are covered;
- [x] existing Foundation 2 duplicate-ID behavior and F4.1 seeded-RNG golden vectors remain green in the full suite;
- [x] production resolver code depends only on existing Core content/domain boundaries and browser-safe ECMAScript/TypeScript primitives;
- [x] no multi-version registry, version history/archive, latest/range/list API, activity-to-template resolver, generator/grader/runtime implementation resolution, RNG use, MissionInstance creation, retry/sub-seed policy, persistence, hashing/fingerprints, or CS116 MissionTemplate content was added;
- [x] F4.2 remains complete and its exact-resolution contract remains unchanged by F4.3.

F4.1 validation:

- [x] TypeScript typecheck — passed with the public `SeededRng`, `createSeededRng`, and `SEEDED_RNG_ALGORITHM` contracts;
- [x] focused `tests/random/seeded-rng.test.ts` — passed: 1 test file, 23 tests;
- [x] full Vitest suite — passed: 24 test files, 365 tests;
- [x] Vite production build — passed, confirming `core/random` remains browser-bundle safe;
- [x] `git diff --check` — passed;
- [x] `git diff -- package.json package-lock.json` — empty; no RNG dependency was added;
- [x] same-seed stream reproduction, stream restart on recreation, independent instance state, exact seed-text behavior, fixed different-seed smoke streams, `[0,1)` float range, exact float and integer golden vectors, half-open integer ranges, size-one range behavior, exact `2^32` span support, invalid-bound rejection, deterministic pick, empty-pick failure, deterministic Fisher–Yates shuffle, collection immutability, permutation preservation, empty/singleton shuffle, and generic object-reference behavior are covered;
- [x] production `src/core/random/seeded-rng.ts` has no imports and contains no `Math.random`, timestamp/performance entropy, crypto entropy, Node API, machine-specific state, or `content/cs116` dependency;
- [x] no fork/sub-seed API, retry policy, RNG serialization, random-boolean/distribution framework, MissionTemplate resolution, MissionInstance creation, Generator Registry/implementation, or CS116 content change was added;
- [x] Foundation 3 remains complete and locked; F4.1 is complete and its deterministic RNG contract remains unchanged by F4.2.

F3.5 / Foundation 3 completion validation:

- [x] TypeScript typecheck — passed with the seven production CS116 Concept definitions and vertical-slice skeleton contracts;
- [x] focused `tests/content/cs116/vertical-slice.test.ts` — passed: 1 test file, 9 tests;
- [x] full Vitest suite — passed: 23 test files, 342 tests;
- [x] Vite production build — passed, confirming the new static content remains browser-safe;
- [x] `git diff --check` — passed;
- [x] `git diff -- package.json package-lock.json` — empty; no dependency change was introduced;
- [x] Core import audit over `src/core/**/*.ts` found zero imports/references to `content/cs116`;
- [x] exact seven-Concept order/count, source/schema validity, classifications, ContentRegistry registration, exact prerequisite graph, acyclicity, dependency queries, stable skeleton IDs/titles/stages/source labels, exact Concept mappings, and skeleton Concept-reference validity are covered;
- [x] skeletons remain outside canonical executable activity/mission registries and no Foundation 4 implementation was added.

F3.4 validation:

- [x] `npm.cmd run typecheck` — passed with public `ActivityRegistry` and `buildActivityRegistry` contracts;
- [x] focused `npm.cmd run test:run -- tests/activities/activity-registry.test.ts` — passed: 1 test file, 12 tests;
- [x] `npm.cmd run test:run` — passed: 22 test files, 333 tests;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] `git diff --check` — passed; the existing working-tree LF→CRLF warning for `DEV_STATUS.md` remains informational;
- [x] empty registry, ID hit/miss, concept selection, unknown concept, multi-concept indexing, duplicate Concept reference deduplication, stage/type filtering, insertion order, result-array isolation, snapshot rebuilding, no mutation path, and no hierarchy/ConceptGraph requirement are covered;
- [x] ActivityRegistry captures canonical LearningActivity object references without schema reparsing, duplicate-ID validation, static-reference validation, or deep-clone/freeze infrastructure;
- [x] production F3.4 code imports only Core content/domain contracts and uses no Node filesystem/path/process APIs, shell calls, absolute paths, desktop/server APIs, machine state, or ConceptGraph dependency;
- [x] no Lesson/Course/World query, combined filter API, MissionTemplate resolution, review/free-practice selection policy, learner completion/mastery/progress state, difficulty index, or production CS116 content was added;
- [x] `git diff -- package.json package-lock.json` is empty; no new package was installed.

F3.3 validation:

- [x] `npm.cmd run typecheck` — passed with public `getDirectPrerequisites` and `getAllPrerequisites` exports;
- [x] focused `npm.cmd run test:run -- tests/concepts/concept-dependencies.test.ts` — passed: 1 test file, 18 tests;
- [x] `npm.cmd run test:run` — passed: 21 test files, 321 tests;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] `git diff --check` — passed; the existing working-tree LF→CRLF warning for `DEV_STATUS.md` remains informational;
- [x] unknown/root behavior, direct authored order/duplicates, direct snapshot isolation, one-level and multi-level BFS, authored frontier order, shared prerequisites, first-discovery placement, two/three-node cycles, self-cycle behavior, dangling references, duplicate edges, transitive snapshot isolation, graph immutability, and presentation-hierarchy independence are covered;
- [x] F3.1 graph construction and F3.2 cycle detection remain unchanged and their existing tests remain green;
- [x] production F3.3 code imports only Core TypeScript contracts and uses no Node filesystem/path/process APIs, shell calls, absolute paths, desktop/server APIs, or machine state;
- [x] no reverse dependency query, path/depth query, topological ordering, reverse index, closure cache, Activity Registry, learning/review policy, graph package, or production CS116 content was added;
- [x] `git diff -- package.json package-lock.json` is empty; no new package was installed.

F3.2 validation:

- [x] `npm.cmd run typecheck` — passed with public `ConceptCycleComponent` and `detectConceptCycles` exports;
- [x] focused `npm.cmd run test:run -- tests/concepts/concept-cycle.test.ts` — passed: 1 test file, 14 tests;
- [x] `npm.cmd run test:run` — passed: 20 test files, 303 tests;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] `git diff --check` — passed; the existing working-tree LF→CRLF warning for `DEV_STATUS.md` remains informational;
- [x] SCC analysis covers empty/acyclic graphs, self-cycles, two/three-node cycles, multiple separate cycles, one SCC with multiple simple cycles, deterministic component/member ordering, dangling edges, duplicate edges, and graph immutability;
- [x] existing F3.1 graph-builder tests remain intact, including cycle-permitting construction behavior;
- [x] production F3.2 code imports only Core TypeScript contracts and uses no Node filesystem/path/process APIs, shell calls, absolute paths, desktop/server APIs, or machine state;
- [x] no dependency query API, transitive closure, topological ordering, reverse dependency index, Activity Registry, Foundation 2 validator rewrite, graph package, or production CS116 content was added;
- [x] `git diff -- package.json package-lock.json` is empty; no new package was installed.

F3.1 validation:

- [x] `npm.cmd run typecheck` — passed with the public `ConceptGraph` and `buildConceptGraph` contracts;
- [x] focused `npm.cmd run test:run -- tests/concepts/concept-graph.test.ts` — passed: 1 test file, 11 tests;
- [x] `npm.cmd run test:run` — passed: 19 test files, 289 tests;
- [x] `npm.cmd run build` — passed with Vite production build;
- [x] `git diff --check` — passed; the existing working-tree LF→CRLF warning for `DEV_STATUS.md` remains informational;
- [x] graph construction preserves Concept insertion order, authored prerequisite order, duplicate prerequisite references, zero-prerequisite nodes, and copied prerequisite arrays;
- [x] two-node cycles, self-cycles, and defensive dangling prerequisite IDs remain buildable in F3.1 without cycle or missing-reference diagnostics;
- [x] `src/core/concepts` depends only on sibling Core content/domain contracts; no content/cs116, features, visualization, app, React, Phaser, Monaco, Pyodide, or IndexedDB dependency was added;
- [x] no dependency traversal, topological ordering, reverse dependency index, Activity Registry, mastery logic, graph framework, or production CS116 content was added;
- [x] `git diff -- package.json package-lock.json` is empty; no new package was installed.

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


