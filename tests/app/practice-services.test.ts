import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APPLICATION_SERVICES_RETIRED } from "../../src/app/services/application-lifecycle";
import { createApplicationServices } from "../../src/app/services/application-services";
import { MISSION_DRAFT_DEBOUNCE_MS } from "../../src/app/services/mission-draft-scheduler";
import {
  createPracticeServices,
  type PracticeServices,
} from "../../src/app/services/practice-services";
import practiceServicesSource from "../../src/app/services/practice-services.ts?raw";
import {
  AttemptRecordSchema,
  Difficulty,
  LearningStage,
  type AttemptRecord,
} from "../../src/core/domain";
import { practiceActivityId, validateExercisePack } from "../../src/core/exercise-packs";
import {
  GUEST_DATABASE_BASE_NAMES,
  GUEST_SCOPE,
  accountScope,
  resolveScopedDatabaseName,
  type PersistenceScope,
} from "../../src/core/persistence";
import { submitMission } from "../../src/features/mission-workspace/submit-mission";
import { createFlakyIndexedDb, type FlakyIndexedDb } from "../persistence/flaky-indexeddb";
import { rawGetAll, rawPut } from "../persistence/indexeddb-test-utils";
import { SAMPLE_PACK_TEXT, makeMinimalPack, makePack } from "../exercise-packs/pack-fixtures";

/**
 * PHASE-05-M7 - the practice service set against REAL (fake-indexeddb) storage and
 * the REAL Mission Engine, declarative grader, attempt session and draft scheduler.
 * Only the Pyodide runtime is replaced: it reports the variables a learner's code
 * "produced", so grading is genuine while no Python runs.
 */

const h = vi.hoisted(() => {
  interface Created {
    options: unknown;
    disposeCount: number;
    prepared: number;
  }
  const state = {
    created: [] as Created[],
    localCreated: 0,
    observed: {} as Record<string, unknown>,
  };
  const create = (options?: unknown) => {
    const record: Created = { options, disposeCount: 0, prepared: 0 };
    state.created.push(record);
    return {
      initialize: async () => ({ ok: true as const }),
      prepareMission: async () => {
        record.prepared += 1;
        return { ok: true as const };
      },
      run: async () => ({ status: "SUCCESS" as const, stdout: "", stderr: "" }),
      submit: async () => ({
        status: "SUCCESS" as const,
        stdout: "",
        stderr: "",
        serialized: { variables: state.observed },
      }),
      dispose: () => {
        record.disposeCount += 1;
      },
    };
  };
  const createLocal = () => {
    state.localCreated += 1;
    throw new Error("Local Python must never be used for imported exercises.");
  };
  return { state, create, createLocal };
});

vi.mock("../../src/core/runtime/pyodide", () => ({ createPyodideRuntimeManager: h.create }));
vi.mock("../../src/core/runtime/local-python", () => ({ createLocalPythonRuntimeManager: h.createLocal }));

const PRACTICE_BASE = GUEST_DATABASE_BASE_NAMES.practice;
const LEARNING_BASE = GUEST_DATABASE_BASE_NAMES.learning;
const scopeA = accountScope("acct-practice-A");
const scopeB = accountScope("acct-practice-B");
const practiceDb = (scope: PersistenceScope = GUEST_SCOPE) => resolveScopedDatabaseName(PRACTICE_BASE, scope);
const learningDb = (scope: PersistenceScope = GUEST_SCOPE) => resolveScopedDatabaseName(LEARNING_BASE, scope);

const MINIMAL_ACTIVITY = practiceActivityId("mini.pack", "ex-one");
const PASSING = { answer: { pythonType: "int", isNdarray: false, value: 3 } };
const FAILING = { answer: { pythonType: "NoneType", isNdarray: false } };

const minimalText = (mutate?: (pack: any) => void): string => {
  const pack = makeMinimalPack();
  mutate?.(pack);
  return JSON.stringify(pack);
};

const live: PracticeServices[] = [];
function services(scope?: PersistenceScope): PracticeServices {
  const created = createPracticeServices({ scope });
  live.push(created);
  return created;
}

function useFactory(): IDBFactory {
  const factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  return factory;
}

const databaseNames = async (factory: IDBFactory): Promise<string[]> =>
  (await factory.databases()).map((database) => database.name ?? "").sort();

const nextMacrotask = (): Promise<void> =>
  new Promise<void>((resolve) =>
    (globalThis as unknown as { setImmediate: (callback: () => void) => unknown }).setImmediate(resolve),
  );
async function idle(turns = 15): Promise<void> {
  for (let turn = 0; turn < turns; turn += 1) await nextMacrotask();
}

async function installOk(target: PracticeServices, text: string) {
  const outcome = await target.installPack(text);
  if (outcome.status !== "installed") throw new Error(`install failed: ${JSON.stringify(outcome)}`);
  return outcome;
}

async function openOk(target: PracticeServices, packId = "mini.pack", exerciseId = "ex-one", options = {}) {
  const created = await target.createExerciseSession(packId, exerciseId, options);
  if (!created.ok) throw new Error(`${created.error.code}: ${created.error.message}`);
  return created.value;
}

function makeAttempt(overrides: Record<string, unknown> = {}): AttemptRecord {
  return AttemptRecordSchema.parse({
    id: "attempt.seed",
    activityId: MINIMAL_ACTIVITY,
    missionTemplateId: "practice.template:mini.pack:ex-one",
    missionTemplateVersion: 1,
    seed: "seed",
    difficulty: Difficulty.EASY,
    conceptIds: ["practice.concept:mini.pack"],
    learningStage: LearningStage.INDEPENDENT,
    startedAt: "2026-10-20T00:59:00.000Z",
    submittedAt: "2026-10-20T00:59:30.000Z",
    passed: true,
    submissionIndex: 1,
    runCountBeforeSubmit: 0,
    hintsUsed: [],
    runtimeErrorCount: 0,
    ...overrides,
  });
}

beforeEach(() => {
  h.state.created.length = 0;
  h.state.localCreated = 0;
  h.state.observed = PASSING;
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(live.splice(0).map((target) => target.dispose({ drainTimeoutMs: 1000 })));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("practice services - install", () => {
  it("installs a valid pack durably in the practice database and nowhere else", async () => {
    const factory = useFactory();
    const target = services();
    const outcome = await installOk(target, minimalText());
    expect(outcome.pack).toMatchObject({ packId: "mini.pack", version: "1.0.0", exerciseCount: 1 });
    expect(outcome.pack.progress).toEqual({ completed: 0, total: 1 });

    expect(await databaseNames(factory)).toEqual([practiceDb()]);
    const rows = (await rawGetAll(factory, practiceDb(), "practicePacks")) as Array<{
      packId: string;
      contentHash: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.packId).toBe("mini.pack");
    // The hash is the app's own canonical hash of the validated pack, not an author claim.
    const validated = validateExercisePack(minimalText());
    expect(validated.ok && rows[0]!.contentHash).toBe(validated.ok && validated.contentHash);
  });

  it("an invalid pack is rejected with located issues and writes nothing, not even a database", async () => {
    const factory = useFactory();
    const target = services();
    const outcome = await target.installPack(minimalText((pack) => delete pack.exercises[0].grading));
    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") {
      expect(outcome.issues.length).toBeGreaterThan(0);
      expect(outcome.issues.every((issue) => issue.path.startsWith("/") || issue.path === "")).toBe(true);
    }
    const garbage = await target.installPack("{ not json");
    expect(garbage.status).toBe("rejected");
    expect(await databaseNames(factory)).toEqual([]);
  });

  it("installing the same pack twice is idempotent; a different pack under the same id is a conflict that overwrites nothing", async () => {
    const factory = useFactory();
    const target = services();
    await installOk(target, minimalText());
    expect((await target.installPack(minimalText())).status).toBe("already-installed");

    const conflict = await target.installPack(minimalText((pack) => (pack.pack.title = "Tiêu đề khác")));
    expect(conflict.status).toBe("conflict");
    if (conflict.status === "conflict") expect(conflict.existingVersion).toBe("1.0.0");

    const rows = (await rawGetAll(factory, practiceDb(), "practicePacks")) as Array<{ document: { pack: { title: string } } }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.document.pack.title).toBe("Mini");
  });

  it("concurrent installs of the same pack produce exactly one installed result", async () => {
    const factory = useFactory();
    const target = services();
    const text = minimalText();
    const outcomes = await Promise.all([target.installPack(text), target.installPack(text), target.installPack(text)]);
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["already-installed", "already-installed", "installed"]);
    expect(await rawGetAll(factory, practiceDb(), "practicePacks")).toHaveLength(1);
  });

  it("rejects installation when durable IndexedDB is unavailable instead of falling back to memory", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const target = services();
    const outcome = await target.installPack(minimalText());
    expect(outcome.status).toBe("storage-unavailable");
    const listed = await target.listPacks();
    expect(listed.ok).toBe(false);
    if (!listed.ok) expect(listed.error.code).toBe("STORAGE_UNAVAILABLE");
    expect(target.getPersistenceKind()).toBe("memory");
  });

  it("reports the installed-pack limit instead of failing", async () => {
    useFactory();
    const target = services();
    for (let index = 0; index < 30; index += 1) {
      await installOk(target, minimalText((pack) => (pack.pack.id = `mini.pack-${index}`)));
    }
    const outcome = await target.installPack(minimalText((pack) => (pack.pack.id = "mini.pack-over")));
    expect(outcome.status).toBe("limit-reached");
    if (outcome.status === "limit-reached") expect(outcome.limit).toBe(30);
  });

  it("scopes installed packs to the account scope", async () => {
    useFactory();
    const a = services(scopeA);
    const b = services(scopeB);
    await installOk(a, minimalText());
    const seenByB = await b.listPacks();
    expect(seenByB.ok && seenByB.value.packs).toEqual([]);
    const seenByA = await a.listPacks();
    expect(seenByA.ok && seenByA.value.packs.map((pack) => pack.packId)).toEqual(["mini.pack"]);
  });

  it("installs the shipped sample pack exactly as a learner would import the file", async () => {
    useFactory();
    const target = services();
    const outcome = await installOk(target, SAMPLE_PACK_TEXT);
    expect(outcome.pack.packId).toBe("ml-basics.linreg-numpy");
    expect(outcome.pack.exerciseCount).toBe(3);
  });
});

describe("practice services - browsing", () => {
  it("lists packs, a pack's exercises in authored order and an exercise's text content", async () => {
    useFactory();
    const target = services();
    await installOk(target, SAMPLE_PACK_TEXT);

    const catalog = await target.listPacks();
    expect(catalog.ok).toBe(true);
    if (!catalog.ok) return;
    expect(catalog.value.packs.map((pack) => pack.packId)).toEqual(["ml-basics.linreg-numpy"]);
    expect(catalog.value.corrupt).toEqual([]);

    const pack = await target.getPack("ml-basics.linreg-numpy");
    expect(pack.ok).toBe(true);
    if (!pack.ok) return;
    expect(pack.value.exercises.map((exercise) => exercise.exerciseId)).toEqual(["mse-basic", "gd-step", "fix-normalization"]);
    expect(pack.value.exercises.map((exercise) => exercise.kind)).toEqual(["code", "code", "debug"]);
    expect(pack.value.exercises.every((exercise) => !exercise.completed && exercise.attemptCount === 0)).toBe(true);

    const exercise = await target.getExercise("ml-basics.linreg-numpy", "gd-step");
    expect(exercise.ok).toBe(true);
    if (!exercise.ok) return;
    expect(exercise.value.previousExerciseId).toBe("mse-basic");
    expect(exercise.value.nextExerciseId).toBe("fix-normalization");
    expect(exercise.value.instructions.length).toBeGreaterThan(0);
  });

  it("returns NOT_FOUND results (never throws) for missing and malformed ids", async () => {
    useFactory();
    const target = services();
    await installOk(target, minimalText());
    for (const [packId, exerciseId] of [
      ["nope", "ex-one"],
      ["mini.pack", "nope"],
      ["", ""],
      ["../../etc", "x"],
      ["Mini Pack", "EX ONE"],
    ] as const) {
      const pack = await target.getPack(packId);
      const exercise = await target.getExercise(packId, exerciseId);
      const session = await target.createExerciseSession(packId, exerciseId);
      if (packId !== "mini.pack") expect(pack.ok).toBe(false);
      expect(exercise.ok).toBe(false);
      expect(session.ok).toBe(false);
    }
  });

  it("shows a stored pack that fails re-validation as corrupt and refuses to open it", async () => {
    const factory = useFactory();
    const target = services();
    await installOk(target, minimalText());
    // Damage the stored row behind the app's back: the stored hash no longer matches the content.
    const [row] = (await rawGetAll(factory, practiceDb(), "practicePacks")) as Array<{
      document: { pack: { title: string } };
    }>;
    row!.document.pack.title = "Bị sửa";
    await rawPut(factory, practiceDb(), "practicePacks", row);

    const fresh = services();
    const catalog = await fresh.listPacks();
    expect(catalog.ok && catalog.value.corrupt.map((pack) => pack.packId)).toEqual(["mini.pack"]);
    expect(catalog.ok && catalog.value.packs).toEqual([]);
    const detail = await fresh.getPack("mini.pack");
    expect(detail.ok).toBe(false);
    if (!detail.ok) expect(detail.error.code).toBe("CORRUPT");
    const session = await fresh.createExerciseSession("mini.pack", "ex-one");
    expect(session.ok).toBe(false);
    expect(h.state.created).toHaveLength(0);
  });
});

describe("practice services - sessions run on Pyodide only", () => {
  it("opens an exercise on a Pyodide runtime with a timeout and never touches Local Python", async () => {
    useFactory();
    const target = services();
    await installOk(target, minimalText());
    const value = await openOk(target);
    expect(h.state.created).toHaveLength(1);
    expect(h.state.created[0]!.prepared).toBe(1);
    expect(typeof (h.state.created[0]!.options as { executionTimeoutMs: unknown }).executionTimeoutMs).toBe("number");
    expect(h.state.localCreated).toBe(0);
    expect(value.session.template.runtime.id).toBe("core.pyodide");
    expect(value.session.template.grader.id).toBe("core.declarative");
    expect(value.session.activity.id).toBe(MINIMAL_ACTIVITY);
    expect(value.initialCode).toBe("answer = None\n");
    expect(value.resumedDraft).toBe(false);
    value.session.dispose();
    expect(h.state.created[0]!.disposeCount).toBe(1);
  });

  it("the module imports nothing from Local Python, the CS116 service set, the learning engine or meta-progression", () => {
    const specifiers = [...practiceServicesSource.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);
    expect(specifiers.length).toBeGreaterThan(5);
    for (const specifier of specifiers) {
      for (const forbidden of ["local-python", "application-services", "meta-progression", "core/learning", "core/content", "rewards"]) {
        expect(specifier).not.toContain(forbidden);
      }
    }
    // Pyodide is the only runtime factory it can construct.
    expect(specifiers).toContain("../../core/runtime/pyodide");
  });
});

describe("practice services - Submit stays out of CS116", () => {
  it("a passed Submit writes one attempt to the practice database only and creates no CS116 database", async () => {
    const factory = useFactory();
    const target = services();
    await installOk(target, minimalText());
    const { session } = await openOk(target);

    const result = await session.submit("answer = 3\n");
    expect(result.grading?.passed).toBe(true);
    expect(result.attemptRecord.passed).toBe(true);
    expect(result.attemptRecord.learningStage).toBe(LearningStage.INDEPENDENT);
    expect(result.attemptRecord.missionTemplateVersion).toBe(1);

    const attempts = (await rawGetAll(factory, practiceDb(), "attempts")) as AttemptRecord[];
    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.activityId).toBe(MINIMAL_ACTIVITY);
    // Not even an empty CS116 learning or meta-progression database was opened.
    expect(await databaseNames(factory)).toEqual([practiceDb()]);
    expect(await databaseNames(factory)).not.toContain(learningDb());
    session.dispose();
  });

  it("completion means a passed attempt for the CURRENT revision; a failed attempt does not complete", async () => {
    useFactory();
    const target = services();
    await installOk(target, minimalText());

    h.state.observed = FAILING;
    const failedSession = (await openOk(target)).session;
    const failed = await failedSession.submit("answer = None\n");
    expect(failed.grading?.passed).toBe(false);
    failedSession.dispose();
    let detail = await target.getPack("mini.pack");
    expect(detail.ok && detail.value.exercises[0]).toMatchObject({ completed: false, attemptCount: 1 });

    h.state.observed = PASSING;
    const passedSession = (await openOk(target)).session;
    await passedSession.submit("answer = 3\n");
    passedSession.dispose();
    detail = await target.getPack("mini.pack");
    expect(detail.ok && detail.value.exercises[0]).toMatchObject({ completed: true, attemptCount: 2 });
    expect(detail.ok && detail.value.progress).toEqual({ completed: 1, total: 1 });
  });

  it("a passed attempt of an OLDER revision does not complete the current revision", async () => {
    useFactory();
    const target = services();
    await installOk(target, minimalText((pack) => (pack.exercises[0].revision = 2)));
    // Progress written by an earlier build of the exercise (revision 1) through the practice store.
    const { createBrowserPracticePersistence } = await import("../../src/core/persistence");
    const store = createBrowserPracticePersistence();
    await store.addAttempt(makeAttempt({ missionTemplateVersion: 1 }));
    await store.close();

    const detail = await target.getPack("mini.pack");
    expect(detail.ok && detail.value.exercises[0]).toMatchObject({ completed: false, attemptCount: 1, revision: 2 });
  });

  it("progress survives service recreation (reload)", async () => {
    useFactory();
    const first = services();
    await installOk(first, minimalText());
    const { session } = await openOk(first);
    await session.submit("answer = 3\n");
    session.dispose();
    await first.dispose({ drainTimeoutMs: 1000 });

    const second = services();
    const detail = await second.getPack("mini.pack");
    expect(detail.ok && detail.value.progress).toEqual({ completed: 1, total: 1 });
  });

  it("clearing CS116 learning data leaves installed packs and practice progress untouched", async () => {
    const factory = useFactory();
    const practice = services();
    await installOk(practice, minimalText());
    const { session } = await openOk(practice);
    await session.submit("answer = 3\n");
    session.dispose();

    const cs116 = createApplicationServices();
    try {
      await cs116.initialize();
      await cs116.clearLearningData();
    } finally {
      await cs116.dispose({ drainTimeoutMs: 1000 });
    }

    expect(await rawGetAll(factory, practiceDb(), "practicePacks")).toHaveLength(1);
    expect(await rawGetAll(factory, practiceDb(), "attempts")).toHaveLength(1);
    const detail = await services().getPack("mini.pack");
    expect(detail.ok && detail.value.progress).toEqual({ completed: 1, total: 1 });
  });
});

describe("practice services - drafts", () => {
  const draftRows = (factory: IDBFactory) =>
    rawGetAll(factory, practiceDb(), "missionDrafts") as Promise<Array<{ activityId: string; code: string }>>;

  it("saves a draft, resumes it after service recreation, and honors resumeDraft:false / resetCode", async () => {
    const factory = useFactory();
    const first = services();
    await installOk(first, minimalText());
    const opened = await openOk(first);
    opened.draft.update({ code: "answer = 7\n", hintsUsed: [] });
    await opened.draft.flush();
    expect((await draftRows(factory)).map((row) => [row.activityId, row.code])).toEqual([[MINIMAL_ACTIVITY, "answer = 7\n"]]);
    opened.session.dispose();
    await first.dispose({ drainTimeoutMs: 1000 });

    const second = services();
    const resumed = await openOk(second);
    expect(resumed.resumedDraft).toBe(true);
    expect(resumed.initialCode).toBe("answer = 7\n");
    resumed.session.dispose();

    const fresh = await openOk(second, "mini.pack", "ex-one", { resumeDraft: false });
    expect(fresh.resumedDraft).toBe(false);
    expect(fresh.initialCode).toBe("answer = None\n");
    fresh.session.dispose();

    const reset = await openOk(second, "mini.pack", "ex-one", { resetCode: true });
    expect(reset.resumedDraft).toBe(false);
    expect(reset.initialCode).toBe("answer = None\n");
    reset.session.dispose();
  });

  it("writes the debounced draft only after the debounce, to the practice database", async () => {
    const factory = useFactory();
    const target = services();
    await installOk(target, minimalText());
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const { draft, session } = await openOk(target);
    draft.update({ code: "answer = 1\n", hintsUsed: [] });
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS - 1);
    await idle();
    expect(await draftRows(factory)).toEqual([]);
    vi.advanceTimersByTime(1);
    await idle(40);
    expect((await draftRows(factory)).map((row) => row.code)).toEqual(["answer = 1\n"]);
    expect(await databaseNames(factory)).toEqual([practiceDb()]);
    session.dispose();
  });

  it("a passed Submit discards the draft; a failed Submit keeps it", async () => {
    const factory = useFactory();
    const target = services();
    await installOk(target, minimalText());

    h.state.observed = FAILING;
    const failedOpen = await openOk(target);
    failedOpen.draft.update({ code: "answer = None\n", hintsUsed: [] });
    await failedOpen.draft.flush();
    await failedOpen.session.submit("answer = None\n");
    await idle(40);
    expect(await draftRows(factory)).toHaveLength(1);
    failedOpen.session.dispose();

    h.state.observed = PASSING;
    const passedOpen = await openOk(target);
    passedOpen.draft.update({ code: "answer = 3\n", hintsUsed: [] });
    await passedOpen.draft.flush();
    const passed = await passedOpen.session.submit("answer = 3\n");
    expect(passed.grading?.passed).toBe(true);
    for (let turn = 0; turn < 100 && (await draftRows(factory)).length > 0; turn += 1) await nextMacrotask();
    expect(await draftRows(factory)).toEqual([]);
    passedOpen.session.dispose();
  });

  it("drafts of the same exercise in different scopes are independent", async () => {
    useFactory();
    const a = services(scopeA);
    const b = services(scopeB);
    await installOk(a, minimalText());
    await installOk(b, minimalText());
    const openedA = await openOk(a);
    openedA.draft.update({ code: "answer = 'A'\n", hintsUsed: [] });
    await openedA.draft.flush();
    openedA.session.dispose();

    const openedB = await openOk(b);
    expect(openedB.resumedDraft).toBe(false);
    openedB.session.dispose();
  });
});

describe("practice services - retirement and disposal", () => {
  it("dispose() disposes the open runtime once, closes persistence and refuses every later request", async () => {
    useFactory();
    const target = services();
    await installOk(target, minimalText());
    const { session } = await openOk(target);

    const first = await target.dispose({ drainTimeoutMs: 1000 });
    expect(first.status).toBe("disposed");
    expect(h.state.created[0]!.disposeCount).toBe(1);
    expect(target.getLifecycleState().status).toBe("disposed");

    session.dispose(); // the page cleaning up afterwards is harmless
    expect(h.state.created[0]!.disposeCount).toBe(1);

    const second = await target.dispose();
    expect(second).toBe(first);

    const created = await target.createExerciseSession("mini.pack", "ex-one");
    expect(created.ok).toBe(false);
    if (!created.ok) expect(created.error.code).toBe(APPLICATION_SERVICES_RETIRED);
    expect((await target.installPack(minimalText())).status).toBe("retired");
    const listed = await target.listPacks();
    expect(listed.ok).toBe(false);
    if (!listed.ok) expect(listed.error.code).toBe("RETIRED");
    expect(h.state.created).toHaveLength(1);
  });

  it("an install in flight when disposal starts is drained, not cut off", async () => {
    const factory = useFactory();
    const target = services();
    const pending = target.installPack(minimalText());
    const disposing = target.dispose({ drainTimeoutMs: 2000 });
    const [outcome, disposal] = await Promise.all([pending, disposing]);
    // Either the install was admitted before retirement (and then finished durably) or it was refused; never half-done.
    if (outcome.status === "installed") {
      expect(await rawGetAll(factory, practiceDb(), "practicePacks")).toHaveLength(1);
    } else {
      expect(outcome.status).toBe("retired");
      expect(await databaseNames(factory)).toEqual([]);
    }
    expect(disposal.status).toBe("disposed");
  });

  it("a session requested while the pack is being read is not created after retirement", async () => {
    useFactory();
    const target = services();
    await installOk(target, minimalText());
    const pending = target.createExerciseSession("mini.pack", "ex-one");
    const disposal = target.dispose({ drainTimeoutMs: 2000 });
    const created = await pending;
    await disposal;
    // Whatever the interleaving, no runtime outlives the disposal.
    for (const runtime of h.state.created) expect(runtime.disposeCount).toBeGreaterThanOrEqual(1);
    if (created.ok) expect(h.state.created).toHaveLength(1);
    else expect(created.error.code).toBe(APPLICATION_SERVICES_RETIRED);
  });
});

describe("practice services - sample pack", () => {
  it("every sample exercise adapts to a Pyodide runnable and its starter code does not already pass the declared checks", async () => {
    useFactory();
    const target = services();
    await installOk(target, SAMPLE_PACK_TEXT);
    const pack = makePack();
    for (const exercise of pack.exercises) {
      h.state.observed = {};
      const value = await openOk(target, pack.pack.id, exercise.id);
      expect(value.initialCode).toBe(exercise.starterCode);
      const submitted = await value.session.submit(exercise.starterCode);
      // With nothing observed, grading cannot pass: starter-passes-nothing at the grading layer.
      expect(submitted.grading?.passed).toBe(false);
      value.session.dispose();
    }
  });
});


// ---------------------------------------------------------------------------------------
// PHASE-05-M7-R1
// ---------------------------------------------------------------------------------------

/** A (fake) IndexedDB whose transactions can be made to fail after the database is open. */
function useFlakyFactory(): { factory: IDBFactory; flaky: FlakyIndexedDb } {
  const factory = new IDBFactory();
  const flaky = createFlakyIndexedDb(factory);
  vi.stubGlobal("indexedDB", flaky.factory);
  return { factory, flaky };
}

type StoredPackRow = { packId: string; contentHash: string; document: any };
const packRows = (factory: IDBFactory) => rawGetAll(factory, practiceDb(), "practicePacks") as Promise<StoredPackRow[]>;

/** Replaces the stored document (not the metadata) behind the application's back. */
async function tamperDocument(factory: IDBFactory, mutate: (document: any) => void): Promise<StoredPackRow> {
  const [row] = await packRows(factory);
  mutate(row!.document);
  await rawPut(factory, practiceDb(), "practicePacks", row);
  return row!;
}

describe("R1-A - a stored pack is verified against its hash on EVERY read", () => {
  const tampers: Array<[string, (document: any) => void]> = [
    ["the title (still a valid pack)", (document) => (document.pack.title = "Bị sửa")],
    ["the expected answer of an exercise (still a valid pack)", (document) => (document.exercises[0].grading.checks[1].expected = 99)],
    ["the starter code (still a valid pack)", (document) => (document.exercises[0].starterCode = "answer = 42\n")],
  ];

  it.each(tampers)(
    "the SAME warmed service instance rejects a document modified in IndexedDB: %s",
    async (_name, mutate) => {
      const factory = useFactory();
      const target = services();
      await installOk(target, minimalText());

      // Warm everything a cache could have kept: list, detail, exercise, and an opened session.
      const warmList = await target.listPacks();
      expect(warmList.ok && warmList.value.packs.map((pack) => pack.packId)).toEqual(["mini.pack"]);
      expect((await target.getPack("mini.pack")).ok).toBe(true);
      expect((await target.getExercise("mini.pack", "ex-one")).ok).toBe(true);
      (await openOk(target)).session.dispose();
      const runtimesBefore = h.state.created.length;
      expect(runtimesBefore).toBe(1);

      // The metadata (packId, contentHash, version) is untouched; only the document differs.
      const before = await tamperDocument(factory, mutate);

      const list = await target.listPacks();
      expect(list.ok && list.value.corrupt.map((pack) => pack.packId)).toEqual(["mini.pack"]);
      expect(list.ok && list.value.packs).toEqual([]);

      const detail = await target.getPack("mini.pack");
      expect(detail.ok).toBe(false);
      if (!detail.ok) expect(detail.error.code).toBe("CORRUPT");
      expect((await target.getExercise("mini.pack", "ex-one")).ok).toBe(false);

      const session = await target.createExerciseSession("mini.pack", "ex-one");
      expect(session.ok).toBe(false);
      if (!session.ok) expect(session.error.code).toBe("PRACTICE_CORRUPT");
      expect(h.state.created).toHaveLength(runtimesBefore); // no runtime was created for the damaged pack
      expect(h.state.localCreated).toBe(0);

      // Nothing was silently repaired or overwritten.
      const [after] = await packRows(factory);
      expect(after).toEqual(before);
      expect(after!.contentHash).toBe(before.contentHash);

      // A fresh service instance agrees.
      const fresh = services();
      const freshList = await fresh.listPacks();
      expect(freshList.ok && freshList.value.corrupt.map((pack) => pack.packId)).toEqual(["mini.pack"]);
      expect((await fresh.getPack("mini.pack")).ok).toBe(false);
      expect((await fresh.createExerciseSession("mini.pack", "ex-one")).ok).toBe(false);
      expect(h.state.created).toHaveLength(runtimesBefore);
    },
  );

  it("an unchanged pack still opens on the warmed instance and on a fresh instance", async () => {
    useFactory();
    const target = services();
    await installOk(target, minimalText());
    expect((await target.getPack("mini.pack")).ok).toBe(true);
    const first = await openOk(target);
    first.session.dispose();
    const second = await openOk(target); // read again after the first read: still verified, still fine
    expect(second.initialCode).toBe("answer = None\n");
    second.session.dispose();

    const fresh = services();
    const opened = await openOk(fresh);
    expect(opened.session.activity.id).toBe(MINIMAL_ACTIVITY);
    opened.session.dispose();
    expect(h.state.created).toHaveLength(3);
  });

  it("a row that is damaged AFTER a successful read is detected on the next read, and healing the row heals the pack", async () => {
    const factory = useFactory();
    const target = services();
    await installOk(target, minimalText());
    expect((await target.getPack("mini.pack")).ok).toBe(true);

    const original = JSON.parse(JSON.stringify((await packRows(factory))[0]!.document));
    await tamperDocument(factory, (document) => (document.pack.title = "Bị sửa"));
    expect((await target.getPack("mini.pack")).ok).toBe(false);

    // Restoring the exact original document (by hand) makes it verify again: no stale "corrupt" memo either.
    await tamperDocument(factory, (document) => {
      for (const key of Object.keys(document)) delete document[key];
      Object.assign(document, original);
    });
    expect((await target.getPack("mini.pack")).ok).toBe(true);
  });
});

describe("R1-B - practice progress is never volatile and never fabricated", () => {
  const quiet = () => vi.spyOn(console, "error").mockImplementation(() => undefined);

  it("practice persistence is IndexedDB-backed and never fails over to memory", async () => {
    const { flaky } = useFlakyFactory();
    quiet();
    const target = services();
    await installOk(target, minimalText());
    expect(target.getPersistenceKind()).toBe("indexeddb");
    flaky.failEverything();
    expect((await target.listPacks()).ok).toBe(false);
    expect((await target.installPack(minimalText((pack) => (pack.pack.id = "other.pack")))).status).toBe("storage-unavailable");
    expect(target.getPersistenceKind()).toBe("indexeddb"); // still the durable store; it did not flip to RAM
    expect(flaky.refused()).toBeGreaterThan(0);
  });

  it("Submit does not report a stored attempt when IndexedDB fails, and nothing appears as progress after reload", async () => {
    const { factory, flaky } = useFlakyFactory();
    quiet();
    const target = services();
    await installOk(target, minimalText());
    const { session, draft } = await openOk(target);
    draft.update({ code: "answer = 3\n", hintsUsed: [] });
    await draft.flush();
    expect(draft.getStatus().kind).toBe("saved");

    flaky.failStores("attempts");
    const outcome = await submitMission(session, "answer = 3\n");
    expect(outcome.kind).toBe("failed"); // the learner is told it was not saved ...
    expect(flaky.refused()).toBeGreaterThan(0);
    await idle(20);
    expect(await rawGetAll(factory, practiceDb(), "attempts")).toEqual([]); // ... and it was not
    // A failed save must not discard the draft either (a passed attempt would have).
    expect((await rawGetAll(factory, practiceDb(), "missionDrafts")) as unknown[]).toHaveLength(1);
    session.dispose();

    // Later reads do not resurrect the attempt from a hidden in-memory copy.
    flaky.heal();
    expect(target.getPersistenceKind()).toBe("indexeddb");
    const sameInstance = await target.getPack("mini.pack");
    expect(sameInstance.ok && sameInstance.value.progress).toEqual({ completed: 0, total: 1 });
    expect(sameInstance.ok && sameInstance.value.exercises[0]).toMatchObject({ completed: false, attemptCount: 0 });

    await target.dispose({ drainTimeoutMs: 1000 });
    const recreated = services();
    const detail = await recreated.getPack("mini.pack");
    expect(detail.ok && detail.value.progress).toEqual({ completed: 0, total: 1 });
    expect(detail.ok && detail.value.exercises[0]).toMatchObject({ completed: false, attemptCount: 0 });
  });

  it("after the failure is gone, Submit works again and is stored durably", async () => {
    const { factory, flaky } = useFlakyFactory();
    quiet();
    const target = services();
    await installOk(target, minimalText());
    const { session } = await openOk(target);
    flaky.failStores("attempts");
    expect((await submitMission(session, "answer = 3\n")).kind).toBe("failed");
    flaky.heal();
    const retried = await submitMission(session, "answer = 3\n");
    expect(retried.kind).toBe("completed");
    session.dispose();
    expect(await rawGetAll(factory, practiceDb(), "attempts")).toHaveLength(1);
  });

  it("a draft that could not be written is reported as failed, never as saved, and is absent after reload", async () => {
    const { factory, flaky } = useFlakyFactory();
    quiet();
    const target = services();
    await installOk(target, minimalText());
    const { session, draft } = await openOk(target);

    flaky.failStores("missionDrafts");
    draft.update({ code: "answer = 5\n", hintsUsed: [] });
    await draft.flush();
    const status = draft.getStatus();
    expect(status.kind).toBe("failed");
    expect(status.kind === "failed" && status.error).toBeDefined();
    expect(await rawGetAll(factory, practiceDb(), "missionDrafts")).toEqual([]);

    // The scheduler retries the same snapshot once storage works again, and only then says "saved".
    flaky.heal();
    await draft.flush();
    expect(draft.getStatus().kind).toBe("saved");
    expect(((await rawGetAll(factory, practiceDb(), "missionDrafts")) as Array<{ code: string }>).map((row) => row.code)).toEqual(["answer = 5\n"]);
    session.dispose();
  });

  it("a failed autosave leaves nothing behind for a recreated service to resume", async () => {
    const { flaky } = useFlakyFactory();
    quiet();
    const first = services();
    await installOk(first, minimalText());
    const opened = await openOk(first);
    flaky.failStores("missionDrafts");
    opened.draft.update({ code: "answer = 'volatile'\n", hintsUsed: [] });
    await opened.draft.flush();
    expect(opened.draft.getStatus().kind).toBe("failed");
    opened.session.dispose();
    await first.dispose({ drainTimeoutMs: 1000 });

    flaky.heal();
    const second = services();
    const reopened = await openOk(second);
    expect(reopened.resumedDraft).toBe(false);
    expect(reopened.initialCode).toBe("answer = None\n");
    reopened.session.dispose();
  });

  it("an attempts-read failure reports progress as unknown (null), never as 0 completed, and the pack stays readable", async () => {
    const { factory, flaky } = useFlakyFactory();
    const logged = quiet();
    const first = services();
    await installOk(first, minimalText());
    const { session } = await openOk(first);
    await session.submit("answer = 3\n");
    session.dispose();
    await first.dispose({ drainTimeoutMs: 1000 });

    const target = services();
    flaky.failStores("attempts");
    const list = await target.listPacks();
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.value.packs.map((pack) => pack.packId)).toEqual(["mini.pack"]); // content is still there
      expect(list.value.packs[0]!.progress).toEqual({ completed: null, total: 1 });
    }
    const detail = await target.getPack("mini.pack");
    expect(detail.ok).toBe(true);
    if (detail.ok) {
      expect(detail.value.progress.completed).toBeNull();
      expect(detail.value.exercises[0]).toMatchObject({ completed: null, attemptCount: null });
    }
    expect(logged).toHaveBeenCalled(); // the cause is reported, not swallowed
    expect(await packRows(factory)).toHaveLength(1); // nothing was deleted or overwritten as "recovery"

    // The truth comes back when storage does.
    flaky.heal();
    const healed = await target.getPack("mini.pack");
    expect(healed.ok && healed.value.progress).toEqual({ completed: 1, total: 1 });
  });

  it("a draft-read failure blocks opening the exercise (an unread draft is not 'no draft')", async () => {
    const { factory, flaky } = useFlakyFactory();
    quiet();
    const first = services();
    await installOk(first, minimalText());
    const stored = await openOk(first);
    stored.draft.update({ code: "answer = 9\n", hintsUsed: [] });
    await stored.draft.flush();
    stored.session.dispose();
    await first.dispose({ drainTimeoutMs: 1000 });

    h.state.created.length = 0; // count only runtimes created from here on
    const target = services();
    flaky.failStores("missionDrafts");
    const created = await target.createExerciseSession("mini.pack", "ex-one");
    expect(created.ok).toBe(false);
    if (!created.ok) {
      expect(created.error.code).toBe("PRACTICE_STORAGE_UNAVAILABLE");
      expect(created.error.message).toContain("IndexedDB");
    }
    expect(h.state.created).toHaveLength(0);
    // The stored draft was not touched.
    expect(((await rawGetAll(factory, practiceDb(), "missionDrafts")) as Array<{ code: string }>).map((row) => row.code)).toEqual(["answer = 9\n"]);

    flaky.heal();
    const reopened = await openOk(target);
    expect(reopened.resumedDraft).toBe(true);
    expect(reopened.initialCode).toBe("answer = 9\n");
    reopened.session.dispose();
  });

  it("an IndexedDB outage never deletes or overwrites installed pack content", async () => {
    const { factory, flaky } = useFlakyFactory();
    quiet();
    const target = services();
    await installOk(target, minimalText());
    const before = await packRows(factory);

    flaky.failEverything();
    expect((await target.listPacks()).ok).toBe(false);
    expect((await target.installPack(minimalText())).status).toBe("storage-unavailable");
    expect((await target.createExerciseSession("mini.pack", "ex-one")).ok).toBe(false);
    flaky.heal();

    expect(await packRows(factory)).toEqual(before);
    expect((await target.getPack("mini.pack")).ok).toBe(true);
    expect((await services().getPack("mini.pack")).ok).toBe(true);
  });
});
