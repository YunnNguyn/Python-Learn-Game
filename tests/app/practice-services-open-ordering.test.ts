import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPracticeServices, type PracticeServices } from "../../src/app/services/practice-services";
import { MISSION_OPEN_SUPERSEDED } from "../../src/app/services/resolved-mission-session";
import { createBrowserPracticePersistence, GUEST_DATABASE_BASE_NAMES, GUEST_SCOPE, resolveScopedDatabaseName } from "../../src/core/persistence";
import { practiceActivityId } from "../../src/core/exercise-packs";
import { rawGetAll } from "../persistence/indexeddb-test-utils";
import { makeMinimalPack } from "../exercise-packs/pack-fixtures";

/**
 * PHASE-05-M7-R2 - the practice service set (REAL fake-indexeddb storage, REAL engine, scheduler and registry; only
 * the Pyodide runtime is replaced) opening the SAME exercise twice, the way React StrictMode / a quick route change
 * does: request #1 (cancelled by the page) and request #2 (the live one).
 */

const h = vi.hoisted(() => {
  interface Created {
    index: number;
    prepared: number;
    disposeCount: number;
  }
  const state = {
    created: [] as Created[],
    /** index of the runtime -> a promise its mission load waits for */
    loadGate: new Map<number, Promise<void>>(),
    /** index of the runtime -> its mission load fails */
    loadFails: new Set<number>(),
  };
  const create = () => {
    const record: Created = { index: state.created.length, prepared: 0, disposeCount: 0 };
    state.created.push(record);
    return {
      initialize: async () => ({ ok: true as const }),
      prepareMission: async () => {
        record.prepared += 1;
        await state.loadGate.get(record.index);
        return state.loadFails.has(record.index)
          ? { ok: false as const, error: { code: "RUNTIME_LOAD_FAILED", message: "boom" } }
          : { ok: true as const };
      },
      run: async () => ({ status: "SUCCESS" as const, stdout: "", stderr: "" }),
      submit: async () => ({ status: "SUCCESS" as const, stdout: "", stderr: "", serialized: { variables: {} } }),
      dispose: () => {
        record.disposeCount += 1;
      },
    };
  };
  return { state, create };
});

vi.mock("../../src/core/runtime/pyodide", () => ({ createPyodideRuntimeManager: h.create }));
vi.mock("../../src/core/runtime/local-python", () => ({
  createLocalPythonRuntimeManager: () => {
    throw new Error("Local Python must never be used for imported exercises.");
  },
}));

const ACTIVITY = practiceActivityId("mini.pack", "ex-one");
const practiceDb = resolveScopedDatabaseName(GUEST_DATABASE_BASE_NAMES.practice, GUEST_SCOPE);

const live: PracticeServices[] = [];
let factory: IDBFactory;

/** A gate a test opens by hand. */
function deferred() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/** Practice services whose FIRST stored-draft read (request #1's resolution) waits for `hold`. */
function servicesWithSlowFirstDraftRead(hold: Promise<void> | null): PracticeServices {
  const real = createBrowserPracticePersistence();
  let reads = 0;
  const persistence = new Proxy(real, {
    get(target, key) {
      if (key === "getMissionDraft") {
        return async (id: never) => {
          reads += 1;
          if (reads === 1 && hold !== null) await hold;
          return target.getMissionDraft(id);
        };
      }
      const value = (target as unknown as Record<PropertyKey, unknown>)[key];
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
  const created = createPracticeServices({}, { persistence });
  live.push(created);
  return created;
}

async function install(target: PracticeServices) {
  const outcome = await target.installPack(JSON.stringify(makeMinimalPack()));
  if (outcome.status !== "installed") throw new Error(`install failed: ${JSON.stringify(outcome)}`);
}

const draftRows = () => rawGetAll(factory, practiceDb, "missionDrafts") as Promise<Array<{ activityId: string; code: string }>>;

beforeEach(() => {
  h.state.created.length = 0;
  h.state.loadGate.clear();
  h.state.loadFails.clear();
  factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
});

afterEach(async () => {
  await Promise.all(live.splice(0).map((target) => target.dispose({ drainTimeoutMs: 1000 })));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("M7-R2 - practice services: the newest request owns the exercise's draft", () => {
  it("A+C. request #1 is slow to resolve, request #2 loads first: #2 stays authoritative, #1 never loads and leaks nothing", async () => {
    const hold = deferred();
    const target = servicesWithSlowFirstDraftRead(hold.promise);
    await install(target);

    const first = target.createExerciseSession("mini.pack", "ex-one", { resumeDraft: true }); // #1: stuck in resolution
    const second = await target.createExerciseSession("mini.pack", "ex-one", { resumeDraft: true }); // #2: loads first
    if (!second.ok) throw new Error(second.error.message);

    hold.open();
    const firstResult = await first;
    expect(firstResult.ok).toBe(false);
    expect(firstResult.ok === false && firstResult.error.code).toBe(MISSION_OPEN_SUPERSEDED);
    expect(h.state.created).toHaveLength(2);
    expect(h.state.created[1]!.prepared).toBe(0); // the stale request never started a load
    expect(h.state.created[1]!.disposeCount).toBe(1); // ... and its runtime was disposed

    second.value.draft.update({ code: "answer = 3\n", hintsUsed: [] });
    await second.value.draft.flush();
    expect((await draftRows()).map((row) => [row.activityId, row.code])).toEqual([[ACTIVITY, "answer = 3\n"]]);
    expect(second.value.draft.getStatus().kind).toBe("saved");
    second.value.session.dispose();
    expect(h.state.created.map((c) => c.disposeCount)).toEqual([1, 1]); // exactly once each: nothing leaked, nothing doubled
  });

  it("D. StrictMode shape: request #1 finishes its LOAD after request #2 - #1 hands out no session and #2 keeps autosaving", async () => {
    const target = servicesWithSlowFirstDraftRead(null);
    await install(target);
    const slowLoad = deferred();
    h.state.loadGate.set(0, slowLoad.promise); // the first runtime created (request #1) loads slowly

    const first = target.createExerciseSession("mini.pack", "ex-one", { resumeDraft: true });
    const second = await target.createExerciseSession("mini.pack", "ex-one", { resumeDraft: true });
    if (!second.ok) throw new Error(second.error.message);
    slowLoad.open();
    const firstResult = await first;

    expect(firstResult.ok).toBe(false);
    expect(firstResult.ok === false && firstResult.error.code).toBe(MISSION_OPEN_SUPERSEDED);
    expect(h.state.created[0]!.disposeCount).toBe(1); // the stale engine's runtime was disposed through the registry cleanup

    second.value.draft.update({ code: "answer = 4\n", hintsUsed: [] });
    await second.value.draft.flush();
    expect((await draftRows()).map((row) => row.code)).toEqual(["answer = 4\n"]);
    expect(second.value.draft.getStatus().kind).toBe("saved");

    // Retirement disposes exactly the live runtime once more (the stale one is not registered anywhere).
    await target.dispose({ drainTimeoutMs: 1000 });
    expect(h.state.created.map((c) => c.disposeCount)).toEqual([1, 1]);
  });

  it("B. an active session keeps autosaving when a newer request for the same exercise fails to load", async () => {
    const target = servicesWithSlowFirstDraftRead(null);
    await install(target);
    const active = await target.createExerciseSession("mini.pack", "ex-one", { resumeDraft: true });
    if (!active.ok) throw new Error(active.error.message);
    active.value.draft.update({ code: "answer = 1\n", hintsUsed: [] });
    await active.value.draft.flush();

    h.state.loadFails.add(1); // the second runtime cannot load the mission
    const failed = await target.createExerciseSession("mini.pack", "ex-one", { resumeDraft: true });
    expect(failed.ok).toBe(false);
    expect(failed.ok === false && failed.error.code).not.toBe(MISSION_OPEN_SUPERSEDED);

    active.value.draft.update({ code: "answer = 2\n", hintsUsed: [] });
    await active.value.draft.flush();
    expect((await draftRows()).map((row) => row.code)).toEqual(["answer = 2\n"]);
    expect(active.value.draft.getStatus().kind).toBe("saved");
    active.value.session.dispose();
  });

  it("E. when #2 takes over from an earlier ACTIVE session, that session's late save does not overwrite #2's draft", async () => {
    const target = servicesWithSlowFirstDraftRead(null);
    await install(target);
    const earlier = await target.createExerciseSession("mini.pack", "ex-one", { resumeDraft: true });
    if (!earlier.ok) throw new Error(earlier.error.message);
    const newer = await target.createExerciseSession("mini.pack", "ex-one", { resumeDraft: true });
    if (!newer.ok) throw new Error(newer.error.message);

    newer.value.draft.update({ code: "newer = 1\n", hintsUsed: [] });
    await newer.value.draft.flush();
    earlier.value.draft.update({ code: "earlier = LATE\n", hintsUsed: [] }, { immediate: true });
    await earlier.value.draft.flush();

    expect((await draftRows()).map((row) => row.code)).toEqual(["newer = 1\n"]);
    expect(earlier.value.draft.getStatus().kind).toBe("closed");
    earlier.value.session.dispose();
    newer.value.session.dispose();
  });
});
