import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationLifecycle } from "../../src/app/services/application-lifecycle";
import { OperationGate } from "../../src/app/services/operation-gate";
import {
  MISSION_DRAFT_DEBOUNCE_MS,
  MissionDraftScheduler,
  type MissionDraftSnapshot,
  type MissionDraftStatus,
  type OwnedMissionDraft,
} from "../../src/app/services/mission-draft-scheduler";
import { HintLevel, type LearningActivityId } from "../../src/core/domain";
import { MemoryLearningPersistence, PersistenceClosedError, type LearningPersistence } from "../../src/core/persistence";

/**
 * PHASE-04C.3D.6 (M5) - the draft scheduler on its own: debounce, coalescing,
 * serialization, invalidation and lifecycle admission.
 *
 * Determinism: timers are fake (`vi.advanceTimersByTime`), and every persistence
 * call goes through a gate that can hold the NEXT call of one method until the
 * test releases or fails it. Nothing sleeps. The store behind the gate is the
 * real in-memory LearningPersistence, so assertions are about what is actually
 * stored, and the event log proves the ORDER in which writes started and ended.
 */

const A = "activity.a" as LearningActivityId;
const B = "activity.b" as LearningActivityId;
const H1 = HintLevel.H1;
const H2 = HintLevel.H2;

type Method = "saveMissionDraft" | "deleteMissionDraft";

class Hold {
  readonly entered: Promise<void>;
  private markEntered!: () => void;
  private decide!: (decision: { readonly failed: boolean; readonly error?: unknown }) => void;
  private readonly decision: Promise<{ readonly failed: boolean; readonly error?: unknown }>;

  constructor() {
    this.entered = new Promise<void>((resolve) => {
      this.markEntered = resolve;
    });
    this.decision = new Promise((resolve) => {
      this.decide = resolve;
    });
  }

  async wait(): Promise<void> {
    this.markEntered();
    const decision = await this.decision;
    if (decision.failed) throw decision.error;
  }

  release(): void {
    this.decide({ failed: false });
  }

  fail(error: unknown): void {
    this.decide({ failed: true, error });
  }
}

function createGatedStore() {
  const inner = new MemoryLearningPersistence();
  const events: string[] = [];
  const holds = new Map<Method, Hold[]>();
  const failures = new Map<Method, unknown[]>();

  const label = (method: Method, arg: unknown): string =>
    method === "saveMissionDraft" ? (arg as { code: string }).code : String(arg);

  const gated =
    (method: Method) =>
    async (arg: unknown): Promise<void> => {
      events.push(`${method === "saveMissionDraft" ? "save" : "delete"}:start:${label(method, arg)}`);
      const hold = holds.get(method)?.shift();
      try {
        if (hold !== undefined) await hold.wait();
        const failure = failures.get(method)?.shift();
        if (failure !== undefined) throw failure;
        await (inner as unknown as Record<Method, (a: unknown) => Promise<void>>)[method](arg);
        events.push(`${method === "saveMissionDraft" ? "save" : "delete"}:ok:${label(method, arg)}`);
      } catch (error) {
        events.push(`${method === "saveMissionDraft" ? "save" : "delete"}:error:${label(method, arg)}`);
        throw error;
      }
    };

  const persistence = {
    saveMissionDraft: gated("saveMissionDraft"),
    deleteMissionDraft: gated("deleteMissionDraft"),
  } as unknown as LearningPersistence;

  return {
    persistence,
    events,
    inner,
    hold(method: Method): Hold {
      const created = new Hold();
      holds.set(method, [...(holds.get(method) ?? []), created]);
      return created;
    },
    failNext(method: Method, error: unknown): void {
      failures.set(method, [...(failures.get(method) ?? []), error]);
    },
    stored: (id: LearningActivityId) => inner.getMissionDraft(id),
    startsOf: (kind: "save" | "delete") => events.filter((event) => event.startsWith(`${kind}:start:`)),
  };
}

function setup(debounceMs?: number) {
  const store = createGatedStore();
  const lifecycle = new ApplicationLifecycle();
  const scheduler = new MissionDraftScheduler(store.persistence, lifecycle, debounceMs);
  return { store, lifecycle, scheduler };
}

function open(
  scheduler: MissionDraftScheduler,
  activityId: LearningActivityId = A,
  persisted?: MissionDraftSnapshot,
): OwnedMissionDraft {
  return scheduler.open({ activityId, seed: `seed.${activityId}`, variantIndex: 0, persisted: persisted ?? null });
}

const snap = (code: string, ...hintsUsed: HintLevel[]): MissionDraftSnapshot => ({ code, hintsUsed });

/** Lets already-resolved promise chains run; the in-memory store never needs a macrotask. */
async function flush(): Promise<void> {
  for (let turn = 0; turn < 25; turn += 1) await Promise.resolve();
}

function statusKind(draft: OwnedMissionDraft): MissionDraftStatus["kind"] {
  return draft.getStatus().kind;
}

const unhandled = (() => {
  type Listener = (reason: unknown) => void;
  const proc = (
    globalThis as unknown as {
      process: { on(event: string, l: Listener): void; off(event: string, l: Listener): void };
    }
  ).process;
  return {
    collect() {
      const seen: unknown[] = [];
      const listener: Listener = (reason) => seen.push(reason);
      proc.on("unhandledRejection", listener);
      return { seen, stop: () => proc.off("unhandledRejection", listener) };
    },
  };
})();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(new Date("2026-10-16T01:00:00.000Z"));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("M5 draft scheduler - debounce and coalescing", () => {
  it("1. one edit is written once, only after the debounce expires, and is saved only after the write resolved", async () => {
    const { store, scheduler } = setup();
    const draft = open(scheduler);
    const seen: Array<MissionDraftStatus["kind"]> = [];
    draft.subscribe(() => seen.push(statusKind(draft)));

    draft.update(snap("x = 1"));
    expect(statusKind(draft)).toBe("scheduled");
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS - 1);
    await flush();
    expect(store.events).toEqual([]); // the timer has not fired: nothing is stored, nothing claimed

    const write = store.hold("saveMissionDraft");
    vi.advanceTimersByTime(1);
    await write.entered;
    expect(statusKind(draft)).toBe("saving"); // the timer fired, the write is NOT durable yet
    expect(await store.stored(A)).toBeNull();

    write.release();
    await flush();
    expect(statusKind(draft)).toBe("saved");
    expect(await store.stored(A)).toMatchObject({ activityId: A, code: "x = 1", hintsUsed: [], seed: "seed.activity.a", variantIndex: 0 });
    expect(seen).toEqual(["scheduled", "saving", "saved"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("2. rapid edits restart the debounce and are coalesced into one write of the latest code", async () => {
    const { store, scheduler } = setup();
    const draft = open(scheduler);
    for (const code of ["a", "ab", "abc", "abcd", "abcde"]) {
      draft.update(snap(code));
      vi.advanceTimersByTime(100); // always inside the window
    }
    await flush();
    expect(store.events).toEqual([]);

    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await flush();
    expect(store.startsOf("save")).toEqual(["save:start:abcde"]); // one write, the latest value
    expect((await store.stored(A))?.code).toBe("abcde");
  });

  it("2b. an unchanged snapshot is not rewritten, and a resumed draft is not rewritten until it changes", async () => {
    const { store, scheduler } = setup();
    const draft = open(scheduler, A, snap("resumed", H1));
    draft.update(snap("resumed", H1));
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 2);
    await flush();
    expect(store.events).toEqual([]);
    expect(statusKind(draft)).toBe("idle");

    draft.update(snap("resumed + edit", H1));
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await flush();
    expect(store.startsOf("save")).toEqual(["save:start:resumed + edit"]);
    draft.update(snap("resumed + edit", H1)); // same value again (e.g. an effect re-run)
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 2);
    await flush();
    expect(store.startsOf("save")).toHaveLength(1);
  });

  it("3. an edit made while an earlier save is in flight waits for it: writes never overlap", async () => {
    const { store, scheduler } = setup();
    const draft = open(scheduler);
    const first = store.hold("saveMissionDraft");
    draft.update(snap("first"));
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await first.entered;

    draft.update(snap("second"));
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await flush();
    expect(store.events).toEqual(["save:start:first"]); // the newer write is queued, NOT started

    first.release();
    await flush();
    expect(store.events).toEqual(["save:start:first", "save:ok:first", "save:start:second", "save:ok:second"]);
    expect((await store.stored(A))?.code).toBe("second");
  });

  it("4. an older save finishing after a newer edit neither overwrites it nor reports 'saved'", async () => {
    const { store, scheduler } = setup();
    const draft = open(scheduler);
    const first = store.hold("saveMissionDraft");
    draft.update(snap("older"));
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await first.entered;

    draft.update(snap("newer")); // still debouncing when the older save completes
    first.release();
    await flush();
    expect(await store.stored(A)).toMatchObject({ code: "older" });
    expect(statusKind(draft)).toBe("scheduled"); // NOT saved: the newest edit is not stored

    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await flush();
    expect((await store.stored(A))?.code).toBe("newer");
    expect(statusKind(draft)).toBe("saved");
  });

  it("4b. several snapshots queued behind a slow save collapse to the latest one (latest wins)", async () => {
    const { store, scheduler } = setup();
    const draft = open(scheduler);
    const slow = store.hold("saveMissionDraft");
    draft.update(snap("v1"));
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await slow.entered;

    for (const code of ["v2", "v3", "v4"]) {
      draft.update(snap(code));
      vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS); // each one reaches the queue
    }
    slow.release();
    await flush();
    expect(store.startsOf("save")).toEqual(["save:start:v1", "save:start:v4"]); // v2 and v3 were never written
    expect((await store.stored(A))?.code).toBe("v4");
  });

  it("5. a hint reveal and a code edit are written as ONE coherent snapshot", async () => {
    const { store, scheduler } = setup();
    const draft = open(scheduler);
    draft.update(snap("def f():\n    pass"));
    vi.advanceTimersByTime(100); // an edit is still debouncing...
    draft.update(snap("def f():\n    return 1", H1), { immediate: true }); // ...when a hint is revealed
    await flush();
    expect(store.startsOf("save")).toEqual(["save:start:def f():\n    return 1"]);
    expect(await store.stored(A)).toMatchObject({ code: "def f():\n    return 1", hintsUsed: [H1] });
    expect(vi.getTimerCount()).toBe(0); // the pending debounce was released by the immediate write

    draft.update(snap("def f():\n    return 1", H1, H2));
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await flush();
    expect(await store.stored(A)).toMatchObject({ hintsUsed: [H1, H2] });
    expect(store.startsOf("save")).toHaveLength(2); // never code and hints in separate records
  });

  it("5b. the re-render after an immediate hint save does not write the same snapshot again", async () => {
    const { store, scheduler } = setup();
    const draft = open(scheduler);
    draft.update(snap("c", H1), { immediate: true });
    await flush();
    draft.update(snap("c", H1)); // the React effect that follows the reveal
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 2);
    await flush();
    expect(store.startsOf("save")).toEqual(["save:start:c"]);
  });
});

describe("M5 draft scheduler - Submit invalidation", () => {
  it("6. a successful Submit with a pending debounce: the timer is cancelled and the draft is deleted", async () => {
    const { store, scheduler } = setup();
    await scheduler.save({ activityId: A, seed: "seed.activity.a", variantIndex: 0, code: "stored earlier", hintsUsed: [] });
    const draft = open(scheduler);
    draft.update(snap("typed just before Submit"));
    expect(vi.getTimerCount()).toBe(1);

    const discarding = draft.discard(); // what a passed Submit does
    expect(vi.getTimerCount()).toBe(0); // synchronously, before any await
    expect(statusKind(draft)).toBe("closed");
    await discarding;
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 3);
    await flush();

    expect(await store.stored(A)).toBeNull();
    expect(store.startsOf("save")).toEqual(["save:start:stored earlier"]); // the stale timer never wrote
    expect(store.startsOf("delete")).toEqual(["delete:start:activity.a"]);
  });

  it("7. a successful Submit with a save in flight: the delete is ordered after that save", async () => {
    const { store, scheduler } = setup();
    const draft = open(scheduler);
    const inFlight = store.hold("saveMissionDraft");
    draft.update(snap("in flight"));
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await inFlight.entered;

    const discarding = draft.discard();
    await flush();
    expect(store.events).toEqual(["save:start:in flight"]); // the delete waits; the UI call returned already
    inFlight.release();
    await discarding;
    expect(store.events).toEqual(["save:start:in flight", "save:ok:in flight", "delete:start:activity.a", "delete:ok:activity.a"]);
    expect(await store.stored(A)).toBeNull(); // the started save did not recreate the draft
  });

  it("8. no draft resurrection: a queued save, a later timer and a later update after the invalidation write nothing", async () => {
    const { store, scheduler } = setup();
    const draft = open(scheduler);
    const inFlight = store.hold("saveMissionDraft");
    draft.update(snap("first"));
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await inFlight.entered;
    draft.update(snap("queued behind the first"));
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS); // accepted, not started
    draft.update(snap("typed after that")); // timer pending

    const discarding = draft.discard();
    draft.update(snap("typed after Submit")); // the editor stays usable; the draft must not come back
    inFlight.release();
    await discarding;
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 3);
    await flush();

    expect(store.startsOf("save")).toEqual(["save:start:first"]);
    expect(await store.stored(A)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    await draft.flush();
    expect(store.startsOf("save")).toHaveLength(1); // flush() on a discarded draft is a no-op
  });

  it("9. discard() is only called for a passed Submit: a draft that is never discarded stays stored", async () => {
    const { store, scheduler } = setup();
    const draft = open(scheduler);
    draft.update(snap("work in progress"));
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await flush();
    // A failed or cancelled Submit calls nothing on the draft; more edits keep being saved.
    draft.update(snap("work in progress, fixed"));
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await flush();
    expect((await store.stored(A))?.code).toBe("work in progress, fixed");
    expect(store.startsOf("delete")).toEqual([]);
  });

  it("8b. only the newest draft handle of an activity deletes: a stale Submit cannot remove a newer session's draft", async () => {
    const { store, scheduler } = setup();
    const older = open(scheduler);
    older.update(snap("older session"), { immediate: true });
    older.close(); // the page left
    await flush();

    const newer = open(scheduler); // the mission was reopened
    newer.update(snap("newer session"), { immediate: true });
    await flush();

    await older.discard(); // the older session's Submit finally completes (passed)
    expect(store.startsOf("delete")).toEqual([]);
    expect((await store.stored(A))?.code).toBe("newer session");

    await newer.discard(); // the newest one may delete
    expect(await store.stored(A)).toBeNull();
  });

  it("8c. a passed Submit completing after the page left still deletes the draft when nothing newer exists", async () => {
    const { store, scheduler } = setup();
    const draft = open(scheduler);
    draft.update(snap("left the page"));
    draft.close(); // unmount: the final save is flushed
    await flush();
    expect((await store.stored(A))?.code).toBe("left the page");

    await draft.discard(); // the admitted Submit finishes afterwards
    expect(await store.stored(A)).toBeNull();
  });
});

describe("M5 draft scheduler - navigation, unmount and mission switching", () => {
  it("10. switching from mission A to mission B never writes A's code under B's activity", async () => {
    const { store, scheduler } = setup();
    const draftA = open(scheduler, A);
    draftA.update(snap("code of A"));
    draftA.close(); // route change disposes A's session
    const draftB = open(scheduler, B);
    draftB.update(snap("code of B"));
    draftB.update(snap("code of B, edited"));
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 2);
    await flush();

    expect(await store.stored(A)).toMatchObject({ activityId: A, code: "code of A", seed: "seed.activity.a" });
    expect(await store.stored(B)).toMatchObject({ activityId: B, code: "code of B, edited", seed: "seed.activity.b" });
    // A closed handle ignores a late render that still carries A's state.
    draftA.update(snap("late render with A's state"));
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 2);
    await flush();
    expect((await store.stored(A))?.code).toBe("code of A");
    expect((await store.stored(B))?.code).toBe("code of B, edited");
  });

  it("11. unmount before the debounce expires cancels the timer and saves the latest change once", async () => {
    const { store, scheduler } = setup();
    const draft = open(scheduler);
    draft.update(snap("typed, then navigated away"));
    expect(vi.getTimerCount()).toBe(1);

    draft.close();
    expect(vi.getTimerCount()).toBe(0); // no obsolete timer survives the page
    await flush();
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 3);
    await flush();
    expect(store.startsOf("save")).toEqual(["save:start:typed, then navigated away"]); // exactly one write
    expect((await store.stored(A))?.code).toBe("typed, then navigated away");
    draft.close();
    draft.update(snap("ignored"));
    await flush();
    expect(store.startsOf("save")).toHaveLength(1);
  });

  it("11b. unmounting a draft with nothing to save writes nothing", async () => {
    const { store, scheduler } = setup();
    const untouched = open(scheduler);
    untouched.close();
    const resumed = open(scheduler, A, snap("resumed", H1));
    resumed.update(snap("resumed", H1));
    resumed.close();
    await flush();
    expect(store.events).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("12. React StrictMode: repeated effect runs and a disposed first session neither lose nor duplicate a save", async () => {
    const { store, scheduler } = setup();
    // Mount 1 starts creating a session; StrictMode's cleanup disposes it before the page ever uses it.
    const firstMount = open(scheduler);
    firstMount.close();
    // Mount 2 creates the session that is actually used. Its effect runs twice (setup, cleanup, setup),
    // and the cleanup of an effect does not close the draft - the session owns it.
    const secondMount = open(scheduler);
    secondMount.update(snap("hello"));
    secondMount.update(snap("hello")); // second run of the same effect
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await flush();

    expect(store.startsOf("save")).toEqual(["save:start:hello"]);
    expect(vi.getTimerCount()).toBe(0);
    firstMount.update(snap("from the disposed mount"));
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await flush();
    expect((await store.stored(A))?.code).toBe("hello");
  });
});

describe("M5 draft scheduler - failures", () => {
  it("13. a failed write is observed, reported as failed (never saved), and does not break later saves", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const collector = unhandled.collect();
    try {
      const { store, scheduler } = setup();
      const draft = open(scheduler);
      const failure = new Error("IndexedDB write failed");
      store.failNext("saveMissionDraft", failure);
      draft.update(snap("will fail"));
      vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
      await flush();

      const status = draft.getStatus();
      expect(status.kind).toBe("failed");
      expect((status as Extract<MissionDraftStatus, { kind: "failed" }>).error).toBe(failure);
      expect(await store.stored(A)).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);

      draft.update(snap("will succeed"));
      expect(statusKind(draft)).toBe("scheduled"); // a new edit supersedes the failure
      vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
      await flush();
      expect(statusKind(draft)).toBe("saved");
      expect((await store.stored(A))?.code).toBe("will succeed");
      await flush();
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });

  it("13b. flush() retries a failed write; a direct caller receives the original error", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { store, scheduler } = setup();
    const draft = open(scheduler);
    store.failNext("saveMissionDraft", new Error("first attempt"));
    draft.update(snap("retry me"), { immediate: true });
    await flush();
    expect(statusKind(draft)).toBe("failed");

    await draft.flush();
    expect(statusKind(draft)).toBe("saved");
    expect((await store.stored(A))?.code).toBe("retry me");

    const direct = new Error("direct write failed");
    store.failNext("saveMissionDraft", direct);
    await expect(
      scheduler.save({ activityId: A, seed: "s", variantIndex: 0, code: "direct", hintsUsed: [] }),
    ).rejects.toBe(direct);
  });

  it("13c. an older failure arriving after a newer successful save is not reported", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { store, scheduler } = setup();
    const draft = open(scheduler);
    const older = store.hold("saveMissionDraft");
    draft.update(snap("older"), { immediate: true });
    await older.entered;
    draft.update(snap("newer"), { immediate: true }); // queued behind the older write
    older.fail(new Error("older write failed"));
    await flush();

    expect((await store.stored(A))?.code).toBe("newer");
    expect(statusKind(draft)).toBe("saved"); // the failure belongs to a revision that was superseded
    expect(warn).toHaveBeenCalledTimes(1); // still logged: it is a real error
  });

  it("13d. a failed delete is observed and never rejects to the caller", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const collector = unhandled.collect();
    try {
      const { store, scheduler } = setup();
      const draft = open(scheduler);
      draft.update(snap("kept"), { immediate: true });
      await flush();
      const deleteError = new Error("delete failed");
      store.failNext("deleteMissionDraft", deleteError);
      await expect(draft.discard()).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls.some((call) => call[1] === deleteError)).toBe(true); // the original error is kept for diagnostics
      expect((await store.stored(A))?.code).toBe("kept"); // reported, not claimed as deleted
      await flush();
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });
});

describe("M5 draft scheduler - M4 retirement", () => {
  it("14. a write accepted before retirement still settles; one queued behind it is also drained", async () => {
    const { store, lifecycle, scheduler } = setup();
    const draft = open(scheduler);
    const inFlight = store.hold("saveMissionDraft");
    draft.update(snap("admitted"), { immediate: true });
    await inFlight.entered;
    draft.update(snap("queued before retirement"), { immediate: true });

    lifecycle.beginRetirement();
    const drained = lifecycle.waitForDrain(1000);
    expect(lifecycle.getPendingDurableOperationCount()).toBe(2); // both are tracked durable operations
    inFlight.release();
    expect(await drained).toBe(true);

    expect(store.events).toEqual([
      "save:start:admitted",
      "save:ok:admitted",
      "save:start:queued before retirement",
      "save:ok:queued before retirement",
    ]);
    expect((await store.stored(A))?.code).toBe("queued before retirement");
    expect(statusKind(draft)).toBe("saved");
  });

  it("15. a timer that fires after retirement opens no write, logs nothing and leaves no rejection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const collector = unhandled.collect();
    try {
      const { store, lifecycle, scheduler } = setup();
      const draft = open(scheduler);
      draft.update(snap("typed, then the set retired"));
      expect(vi.getTimerCount()).toBe(1);

      lifecycle.beginRetirement(); // retirement does not touch this handle's timer by itself
      vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
      await flush();

      expect(store.events).toEqual([]); // nothing started
      expect(statusKind(draft)).toBe("closed");
      expect(warn).not.toHaveBeenCalled(); // expected cancellation is not noise
      expect(error).not.toHaveBeenCalled();
      draft.update(snap("more"));
      vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
      await flush();
      expect(store.events).toEqual([]);
      // Direct operations are refused the same way.
      await expect(scheduler.save({ activityId: A, seed: "s", variantIndex: 0, code: "x", hintsUsed: [] })).rejects.toMatchObject({
        code: "APPLICATION_SERVICES_RETIRED",
      });
      await expect(scheduler.delete(A)).rejects.toMatchObject({ code: "APPLICATION_SERVICES_RETIRED" });
      await flush();
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });

  it("15b. closing a draft after retirement is silent and cannot write; a closed storage is not a failure either", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { store, lifecycle, scheduler } = setup();
    const retired = open(scheduler, A);
    retired.update(snap("unsaved tail"));
    lifecycle.beginRetirement();
    retired.close();
    await flush();
    expect(store.events).toEqual([]);

    const second = setup();
    const closedStorage = open(second.scheduler, A);
    second.store.failNext("saveMissionDraft", new PersistenceClosedError());
    closedStorage.update(snap("storage already closed"), { immediate: true });
    await flush();
    expect(statusKind(closedStorage)).toBe("closed");
    expect(warn).not.toHaveBeenCalled();
  });

  it("15c. a delete started by the Submit's own admitted work is still allowed after retirement began", async () => {
    const { store, lifecycle, scheduler } = setup();
    await scheduler.save({ activityId: A, seed: "s", variantIndex: 0, code: "to delete", hintsUsed: [] });
    const draft = open(scheduler);

    let discarding: Promise<void> = Promise.resolve();
    const submitWork = lifecycle.trackAdmitted(async () => {
      lifecycle.beginRetirement(); // retirement begins while the Submit is still persisting
      discarding = draft.discardWithinAdmittedWork();
      await discarding;
    });
    await submitWork;
    expect(await lifecycle.waitForDrain(1000)).toBe(true);
    expect(await store.stored(A)).toBeNull();
  });
});

describe("M5 draft scheduler - ordering of direct operations and reads", () => {
  it("16. settled(): a read issued after earlier writes sees them (resume reads the latest saved draft)", async () => {
    const { store, scheduler } = setup();
    const draft = open(scheduler);
    const slow = store.hold("saveMissionDraft");
    draft.update(snap("final save before leaving"));
    draft.close(); // unmount: flush starts
    await slow.entered;

    let readCompleted = false;
    const read = scheduler.settled(A).then(async () => {
      readCompleted = true;
      return store.stored(A);
    });
    await flush();
    expect(readCompleted).toBe(false); // the read waits for the in-flight write

    slow.release();
    expect((await read)?.code).toBe("final save before leaving");
    expect(await scheduler.settled(B)).toBeUndefined(); // an activity without pending writes does not wait
  });

  it("direct saves and deletes keep their acceptance order and are never coalesced", async () => {
    const { store, scheduler } = setup();
    const first = store.hold("saveMissionDraft");
    const input = (code: string) => ({ activityId: A, seed: "s", variantIndex: 0, code, hintsUsed: [] as HintLevel[] });
    const p1 = scheduler.save(input("one"));
    await first.entered;
    const p2 = scheduler.save(input("two"));
    const p3 = scheduler.delete(A);
    const p4 = scheduler.save(input("four"));
    await flush();
    expect(store.events).toEqual(["save:start:one"]);
    first.release();
    await Promise.all([p1, p2, p3, p4]);
    expect(store.events).toEqual([
      "save:start:one",
      "save:ok:one",
      "save:start:two",
      "save:ok:two",
      "delete:start:activity.a",
      "delete:ok:activity.a",
      "save:start:four",
      "save:ok:four",
    ]);
    expect((await store.stored(A))?.code).toBe("four");
  });

  it("17. a draft writes only to the persistence of its own scheduler (scope) and never falls back to another", async () => {
    const one = setup();
    const two = setup();
    const draftOne = open(one.scheduler);
    draftOne.update(snap("scope one"), { immediate: true });
    await flush();
    expect((await one.store.stored(A))?.code).toBe("scope one");
    expect(await two.store.stored(A)).toBeNull();
    expect(two.store.events).toEqual([]);

    // A failing store reports a failure; the write is not redirected to the other set.
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    one.store.failNext("saveMissionDraft", new Error("scope one storage failed"));
    draftOne.update(snap("scope one, again"), { immediate: true });
    await flush();
    expect(statusKind(draftOne)).toBe("failed");
    expect(two.store.events).toEqual([]);
    expect(await two.store.stored(A)).toBeNull();
  });

  it("18. listeners that throw cannot break scheduling or leak an unhandled rejection", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const collector = unhandled.collect();
    try {
      const { store, scheduler } = setup();
      const draft = open(scheduler);
      draft.subscribe(() => {
        throw new Error("listener failed");
      });
      draft.update(snap("still saved"));
      vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
      await flush();
      expect((await store.stored(A))?.code).toBe("still saved");
      expect(statusKind(draft)).toBe("saved");
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });
});

/*
 * PHASE-04C.3D.6-R1 - generation fencing. Opening a newer handle for an activity
 * supersedes every older handle of it: from then on the older one cannot ADMIT a
 * save (update, timer, close, flush). What it had already admitted is untouched.
 */
describe("M5-R1 draft scheduler - stale handles cannot save over a newer session", () => {
  it("R1-1. the reported reproduction: the newer handle saves, then the older handle's update() must not win", async () => {
    const { store, scheduler } = setup();
    const older = open(scheduler);
    const newer = open(scheduler);
    newer.update(snap("VALID_NEWER"), { immediate: true });
    await flush();
    expect((await store.stored(A))?.code).toBe("VALID_NEWER");

    older.update(snap("STALE_OLDER"), { immediate: true });
    older.update(snap("STALE_OLDER, debounced"));
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 3);
    await flush();

    expect((await store.stored(A))?.code).toBe("VALID_NEWER");
    expect(store.startsOf("save")).toEqual(["save:start:VALID_NEWER"]);
    expect(vi.getTimerCount()).toBe(0);
    expect(statusKind(older)).toBe("closed"); // never "scheduled", "saving" or "saved" for work that was refused
  });

  it("R1-2. a stale handle's close() does not flush its obsolete content over the newer handle", async () => {
    const { store, scheduler } = setup();
    const older = open(scheduler);
    older.update(snap("older, unsaved tail")); // debounce pending
    const newer = open(scheduler);
    newer.update(snap("VALID_NEWER"), { immediate: true });
    await flush();

    older.close(); // the old page's cleanup runs late
    await flush();
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 3);
    await flush();

    expect((await store.stored(A))?.code).toBe("VALID_NEWER");
    expect(store.startsOf("save")).toEqual(["save:start:VALID_NEWER"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("R1-3. a stale handle's flush() neither writes its tail nor retries a write that failed before it was superseded", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { store, scheduler } = setup();
    const older = open(scheduler);
    store.failNext("saveMissionDraft", new Error("older write failed"));
    older.update(snap("older, failed"), { immediate: true });
    await flush();
    expect(statusKind(older)).toBe("failed");
    expect(warn).toHaveBeenCalledTimes(1);

    const newer = open(scheduler);
    newer.update(snap("VALID_NEWER"), { immediate: true });
    await flush();
    older.update(snap("older, typed after")); // refused
    await older.flush(); // must resolve, and must not retry or write anything
    older.close();
    await flush();

    expect((await store.stored(A))?.code).toBe("VALID_NEWER");
    expect(store.startsOf("save")).toEqual(["save:start:older, failed", "save:start:VALID_NEWER"]);
    expect(statusKind(older)).not.toBe("saved");
  });

  it("R1-4. a debounce timer armed by the older handle fires after the newer handle opened: it writes nothing", async () => {
    const { store, scheduler } = setup();
    const older = open(scheduler);
    older.update(snap("older, waiting for its timer"));
    expect(vi.getTimerCount()).toBe(1);
    const newer = open(scheduler);

    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await flush();
    expect(store.events).toEqual([]);
    expect(await store.stored(A)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    newer.update(snap("VALID_NEWER"));
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await flush();
    expect((await store.stored(A))?.code).toBe("VALID_NEWER");
    expect(statusKind(newer)).toBe("saved");
  });

  it("R1-4b. the first call a stale handle receives after being superseded drops its timer and tail at once (no timer is armed for obsolete work)", async () => {
    const { store, scheduler } = setup();
    const older = open(scheduler);
    older.update(snap("older, waiting for its timer"));
    expect(vi.getTimerCount()).toBe(1);
    open(scheduler);

    older.update(snap("older, typed after being superseded"));
    expect(vi.getTimerCount()).toBe(0); // neither the old timer nor a new one
    expect(statusKind(older)).toBe("closed");
    expect(store.events).toEqual([]);
  });

  it("R1-5. a save the older handle admitted BEFORE the newer one opened still settles, and the newer save is ordered after it and wins", async () => {
    const { store, scheduler } = setup();
    const older = open(scheduler);
    const inFlight = store.hold("saveMissionDraft");
    older.update(snap("older, admitted"), { immediate: true });
    await inFlight.entered;

    const newer = open(scheduler);
    newer.update(snap("VALID_NEWER"), { immediate: true });
    older.update(snap("older, refused")); // after supersession
    await flush();
    expect(store.startsOf("save")).toEqual(["save:start:older, admitted"]); // newer waits its turn (G)

    inFlight.release();
    await flush();
    expect(store.events).toEqual([
      "save:start:older, admitted",
      "save:ok:older, admitted",
      "save:start:VALID_NEWER",
      "save:ok:VALID_NEWER",
    ]);
    expect((await store.stored(A))?.code).toBe("VALID_NEWER");
    expect(statusKind(newer)).toBe("saved");
    expect(statusKind(older)).not.toBe("failed");
  });

  it("R1-5b. a save the older handle queued (not started) before the newer one opened keeps its place in the order", async () => {
    const { store, scheduler } = setup();
    const older = open(scheduler);
    const inFlight = store.hold("saveMissionDraft");
    older.update(snap("older 1"), { immediate: true });
    await inFlight.entered;
    older.update(snap("older 2, queued"), { immediate: true }); // admitted while older was the newest

    const newer = open(scheduler);
    newer.update(snap("VALID_NEWER"), { immediate: true });
    inFlight.release();
    await flush();

    expect(store.startsOf("save")).toEqual(["save:start:older 1", "save:start:older 2, queued", "save:start:VALID_NEWER"]);
    expect((await store.stored(A))?.code).toBe("VALID_NEWER");
  });

  it("R1-6. the newest handle keeps saving normally after an older one became stale and was closed", async () => {
    const { store, scheduler } = setup();
    const older = open(scheduler);
    const newer = open(scheduler);
    older.close();
    newer.update(snap("first"), { immediate: true });
    await flush();
    older.update(snap("stale"), { immediate: true });
    newer.update(snap("second", H1));
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await flush();
    newer.close();
    await flush();

    expect(store.startsOf("save")).toEqual(["save:start:first", "save:start:second"]);
    expect(await store.stored(A)).toMatchObject({ code: "second", hintsUsed: [H1] });
    expect(statusKind(newer)).toBe("saved");
  });

  it("R1-7. a stale passed Submit (discard) cannot delete the newer handle's draft, even with its own tail pending", async () => {
    const { store, scheduler } = setup();
    const older = open(scheduler);
    older.update(snap("older tail"));
    const newer = open(scheduler);
    newer.update(snap("VALID_NEWER"), { immediate: true });
    await flush();

    await older.discardWithinAdmittedWork();
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 3);
    await flush();
    expect(store.startsOf("delete")).toEqual([]);
    expect(store.startsOf("save")).toEqual(["save:start:VALID_NEWER"]);
    expect((await store.stored(A))?.code).toBe("VALID_NEWER");
  });

  it("R1-8. normal navigation is unchanged: with no newer handle, close() still flushes the final change; the next session resumes it", async () => {
    const { store, scheduler } = setup();
    const first = open(scheduler);
    first.update(snap("typed just before leaving", H1));
    first.close(); // the page unmounts; nothing newer exists yet
    await flush();
    expect(await store.stored(A)).toMatchObject({ code: "typed just before leaving", hintsUsed: [H1] });

    await scheduler.settled(A);
    const second = open(scheduler, A, snap("typed just before leaving", H1));
    second.update(snap("typed just before leaving", H1)); // resumed content: not rewritten
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    await flush();
    expect(store.startsOf("save")).toEqual(["save:start:typed just before leaving"]);
    first.update(snap("first handle after being superseded"), { immediate: true });
    await flush();
    expect((await store.stored(A))?.code).toBe("typed just before leaving");
  });

  it("R1-9. superseding is per activity and per scheduler: another activity and another scope are never fenced", async () => {
    const one = setup();
    const two = setup();
    const olderA = open(one.scheduler, A);
    const handleB = open(one.scheduler, B);
    const otherScopeA = open(two.scheduler, A);
    open(one.scheduler, A); // supersedes olderA only

    handleB.update(snap("B is unaffected"), { immediate: true });
    otherScopeA.update(snap("other scope is unaffected"), { immediate: true });
    olderA.update(snap("A stale"), { immediate: true });
    await flush();

    expect((await one.store.stored(B))?.code).toBe("B is unaffected");
    expect(await one.store.stored(A)).toBeNull();
    expect((await two.store.stored(A))?.code).toBe("other scope is unaffected");
    expect(one.store.startsOf("save")).toEqual(["save:start:B is unaffected"]);
    expect(two.store.startsOf("save")).toEqual(["save:start:other scope is unaffected"]);
  });

  it("R1-10. refusing a stale handle's work leaves no timer, no log, no listener noise and no unhandled rejection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const collector = unhandled.collect();
    try {
      const { store, scheduler } = setup();
      const older = open(scheduler);
      const notifications: Array<MissionDraftStatus["kind"]> = [];
      older.subscribe(() => notifications.push(statusKind(older)));
      older.update(snap("older"));
      open(scheduler);
      older.update(snap("older 2"), { immediate: true });
      await older.flush();
      older.close();
      await older.discard();
      vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS * 3);
      await flush();

      expect(store.events).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(notifications).not.toContain("saved");
      expect(notifications).not.toContain("saving");
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });

  it("R1-11. fencing does not weaken M4: a stale handle's already admitted write is drained before persistence closes", async () => {
    const { store, scheduler, lifecycle } = setup();
    const older = open(scheduler);
    const inFlight = store.hold("saveMissionDraft");
    older.update(snap("older, admitted"), { immediate: true });
    await inFlight.entered;
    open(scheduler); // supersedes older while its write is in flight

    lifecycle.beginRetirement();
    let drained = false;
    const draining = lifecycle.waitForDrain(1000).then((ok) => {
      drained = ok;
    });
    await flush();
    expect(drained).toBe(false); // the admitted write is still counted
    inFlight.release();
    await draining;
    expect(drained).toBe(true);
    expect(store.events).toEqual(["save:start:older, admitted", "save:ok:older, admitted"]);
  });
});

/*
 * PHASE-04C.3D.6-R2 - a superseded handle publishes "closed" at once. The status
 * must not wait for the old handle to be called again, and an admitted write that
 * settles later may not bring "saved" (or "failed") back.
 */
describe("M5-R2 draft scheduler - superseded handle status", () => {
  it("R2-1. a previously saved handle reports closed as soon as a newer handle opens, and subscribers are told once", async () => {
    const { scheduler } = setup();
    const older = open(scheduler);
    older.update(snap("saved before"), { immediate: true });
    await flush();
    expect(statusKind(older)).toBe("saved");
    const seen: Array<MissionDraftStatus["kind"]> = [];
    older.subscribe(() => seen.push(statusKind(older)));

    open(scheduler);
    expect(statusKind(older)).toBe("closed"); // no call on the old handle was needed
    await flush();
    older.update(snap("later")); // refused
    older.close();
    await older.flush();
    expect(statusKind(older)).toBe("closed");
    expect(seen).toEqual(["closed"]);
  });

  it("R2-2. the reported reproduction: the old write is pending, the new handle opens, the old write settles - still closed, never saved", async () => {
    const { store, scheduler } = setup();
    const older = open(scheduler);
    const seen: Array<MissionDraftStatus["kind"]> = [];
    older.subscribe(() => seen.push(statusKind(older)));
    const inFlight = store.hold("saveMissionDraft");
    older.update(snap("OLD"), { immediate: true });
    await inFlight.entered;
    expect(statusKind(older)).toBe("saving");

    open(scheduler);
    expect(statusKind(older)).toBe("closed");
    inFlight.release();
    await flush();
    expect(statusKind(older)).toBe("closed");
    expect((await store.stored(A))?.code).toBe("OLD"); // the admitted write did settle
    expect(seen).toEqual(["saving", "closed"]); // no duplicate, no "saved"
  });

  it("R2-3. a pending timer is dropped with the transition; an admitted write that FAILS later is logged but does not change the status", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const collector = unhandled.collect();
    try {
      const { store, scheduler } = setup();
      const older = open(scheduler);
      const inFlight = store.hold("saveMissionDraft");
      older.update(snap("admitted"), { immediate: true });
      await inFlight.entered;
      older.update(snap("admitted, then edited")); // timer armed
      expect(vi.getTimerCount()).toBe(1);
      const seen: Array<MissionDraftStatus["kind"]> = [];
      older.subscribe(() => seen.push(statusKind(older)));

      open(scheduler);
      expect(vi.getTimerCount()).toBe(0);
      expect(statusKind(older)).toBe("closed");
      const failure = new Error("old write failed");
      inFlight.fail(failure);
      await flush();
      expect(statusKind(older)).toBe("closed");
      expect(seen).toEqual(["closed"]);
      expect(warn.mock.calls.some((call) => call[1] === failure)).toBe(true); // still observed
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });

  it("R2-4. the newer handle is unaffected: its own status goes scheduled -> saving -> saved, and admitted writes settle in order", async () => {
    const { store, scheduler } = setup();
    const older = open(scheduler);
    const inFlight = store.hold("saveMissionDraft");
    older.update(snap("OLD"), { immediate: true });
    await inFlight.entered;

    const newer = open(scheduler);
    const seen: Array<MissionDraftStatus["kind"]> = [];
    newer.subscribe(() => seen.push(statusKind(newer)));
    newer.update(snap("NEW"));
    expect(statusKind(newer)).toBe("scheduled");
    vi.advanceTimersByTime(MISSION_DRAFT_DEBOUNCE_MS);
    expect(statusKind(newer)).toBe("saving");
    inFlight.release();
    await flush();

    expect(store.events).toEqual(["save:start:OLD", "save:ok:OLD", "save:start:NEW", "save:ok:NEW"]);
    expect(seen).toEqual(["scheduled", "saving", "saved"]);
    expect(statusKind(newer)).toBe("saved");
    expect(statusKind(older)).toBe("closed");
    expect((await store.stored(A))?.code).toBe("NEW");
  });

  it("R2-5. only handles of the SAME activity and scheduler are superseded", async () => {
    const one = setup();
    const two = setup();
    const a = open(one.scheduler, A);
    const b = open(one.scheduler, B);
    const otherScope = open(two.scheduler, A);
    for (const handle of [a, b, otherScope]) handle.update(snap("x"), { immediate: true });
    await flush();
    open(one.scheduler, A);
    expect(statusKind(a)).toBe("closed");
    expect(statusKind(b)).toBe("saved");
    expect(statusKind(otherScope)).toBe("saved");
  });
});

/*
 * PHASE-04C.3D.7-R1 - a handle retired by a Clear may not authorize a delete.
 * A Clear retires handles without opening a newer one, so the generation alone
 * ("is this the newest handle?") cannot tell an obsolete handle from the current
 * one. The delete authority is "not superseded by a newer handle AND not retired
 * by a Clear", checked where a delete is admitted - including the admitted-work path.
 */
describe("M6-R1 draft scheduler - handles retired by Clear cannot delete post-Clear drafts", () => {
  function setupWithGate() {
    const store = createGatedStore();
    const lifecycle = new ApplicationLifecycle();
    const gate = new OperationGate();
    const scheduler = new MissionDraftScheduler(store.persistence, lifecycle, undefined, gate);
    /** What clearLearningData() does to drafts: retire handles now, then clear exclusively after earlier work. */
    const clear = (): Promise<void> => {
      scheduler.resetForClear();
      return gate.runExclusive(async () => {
        await scheduler.settledAll();
        await store.inner.clearMissionDrafts();
      });
    };
    const directSave = (code: string, activityId: LearningActivityId = A) =>
      scheduler.save({ activityId, seed: `seed.${activityId}`, variantIndex: 0, code, hintsUsed: [] });
    return { store, lifecycle, gate, scheduler, clear, directSave };
  }

  it("M6R1-1. old handle, Clear, valid direct save, then the old discard(): the valid draft survives", async () => {
    const { store, scheduler, clear, directSave } = setupWithGate();
    const old = open(scheduler);
    old.update(snap("pre-Clear text"), { immediate: true });
    await flush();
    await clear();
    expect(await store.stored(A)).toBeNull();

    await directSave("NEW_AFTER_CLEAR");
    await old.discard(); // the pre-Clear session's Submit finally completes (passed)
    await flush();
    expect(store.startsOf("delete")).toEqual([]);
    expect((await store.stored(A))?.code).toBe("NEW_AFTER_CLEAR");
  });

  it("M6R1-2. the same with discardWithinAdmittedWork() inside a gate-held Submit operation", async () => {
    const { store, gate, lifecycle, scheduler, clear, directSave } = setupWithGate();
    const old = open(scheduler);
    old.update(snap("pre-Clear text"), { immediate: true });
    await flush();
    await clear();
    await directSave("NEW_AFTER_CLEAR");

    // How the Submit composite runs: admitted, shared on the gate, discard started inside it.
    await lifecycle.trackAdmitted(() => gate.runShared(async () => old.discardWithinAdmittedWork()));
    await flush();
    expect(store.startsOf("delete")).toEqual([]);
    expect((await store.stored(A))?.code).toBe("NEW_AFTER_CLEAR");
  });

  it("M6R1-3. the reviewer's sequence: Clear held, a valid save queued, the old Submit's admitted discard queued behind it", async () => {
    const { store, gate, lifecycle, scheduler, clear, directSave } = setupWithGate();
    const old = open(scheduler);
    old.update(snap("pre-Clear text"), { immediate: true });
    await flush();

    const release = (() => {
      let done!: () => void;
      const held = new Promise<void>((resolve) => {
        done = resolve;
      });
      void gate.runShared(() => held); // an earlier mutation: Clear must wait for it
      return done;
    })();
    const clearing = clear();
    const saving = directSave("NEW_AFTER_CLEAR"); // queued behind the Clear
    const submitWork = lifecycle.trackAdmitted(() => gate.runShared(async () => old.discardWithinAdmittedWork())); // behind it too
    release();
    await Promise.all([clearing, saving, submitWork]);
    await flush();

    expect(store.startsOf("delete")).toEqual([]);
    expect((await store.stored(A))?.code).toBe("NEW_AFTER_CLEAR");
  });

  it("M6R1-4. a delete admitted BEFORE the Clear is neither cancelled nor reordered: it settles, then Clear clears", async () => {
    const { store, scheduler, clear } = setupWithGate();
    const draft = open(scheduler);
    draft.update(snap("x"), { immediate: true });
    await flush();
    const deletion = store.hold("deleteMissionDraft");
    const discarding = draft.discardWithinAdmittedWork();
    await deletion.entered;

    const clearing = clear();
    await flush();
    expect(store.events.filter((event) => event.startsWith("delete:"))).toEqual([`delete:start:${A}`]);
    deletion.release();
    await Promise.all([discarding, clearing]);
    expect(store.events.slice(-2)).toEqual([`delete:start:${A}`, `delete:ok:${A}`].slice(-2));
    expect(await store.stored(A)).toBeNull();
  });

  it("M6R1-5. a fresh handle opened after Clear saves and deletes its own draft normally", async () => {
    const { store, scheduler, clear } = setupWithGate();
    const old = open(scheduler);
    await clear();
    const fresh = open(scheduler);
    fresh.update(snap("fresh work"), { immediate: true });
    await flush();
    expect((await store.stored(A))?.code).toBe("fresh work");

    await old.discard(); // refused
    expect((await store.stored(A))?.code).toBe("fresh work");
    await fresh.discardWithinAdmittedWork(); // allowed
    expect(await store.stored(A)).toBeNull();
    expect(store.startsOf("delete")).toEqual([`delete:start:${A}`]);
  });

  it("M6R1-6. repeated Clears never reactivate a retired handle (generations are never reused)", async () => {
    const { store, scheduler, clear, directSave } = setupWithGate();
    const old = open(scheduler);
    await clear();
    await clear();
    await clear();
    const fresh = open(scheduler); // a new generation, not a recycled one
    await directSave("NEW_AFTER_CLEAR");
    await old.discard();
    old.update(snap("old text"), { immediate: true });
    old.close();
    await flush();
    expect(store.startsOf("delete")).toEqual([]);
    expect(store.startsOf("save")).toEqual(["save:start:NEW_AFTER_CLEAR"]);
    expect(statusKind(old)).toBe("closed");
    expect(statusKind(fresh)).not.toBe("closed");
    expect((await store.stored(A))?.code).toBe("NEW_AFTER_CLEAR");
  });

  it("M6R1-7. a FAILED Clear does not give the retired handle its authority back", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { store, scheduler, gate, directSave } = setupWithGate();
    const old = open(scheduler);
    scheduler.resetForClear();
    const failure = new Error("clear failed");
    await expect(gate.runExclusive(async () => Promise.reject(failure))).rejects.toBe(failure);

    await directSave("VALID_DRAFT");
    await old.discard();
    await old.discardWithinAdmittedWork();
    expect(store.startsOf("delete")).toEqual([]);
    expect((await store.stored(A))?.code).toBe("VALID_DRAFT");
  });

  it("M6R1-8. isolation: a retired handle's delete never touches another activity or another scheduler (scope)", async () => {
    const one = setupWithGate();
    const two = setupWithGate();
    const oldA = open(one.scheduler, A);
    const otherScope = open(two.scheduler, A);
    otherScope.update(snap("other scope"), { immediate: true });
    await flush();
    await one.clear();
    const freshB = open(one.scheduler, B);
    freshB.update(snap("activity B"), { immediate: true });
    await flush();

    await oldA.discardWithinAdmittedWork();
    await oldA.discard();
    expect((await one.store.stored(B))?.code).toBe("activity B");
    expect((await two.store.stored(A))?.code).toBe("other scope");
    expect(one.store.startsOf("delete")).toEqual([]);
    expect(two.store.startsOf("delete")).toEqual([]);
  });

  it("M6R1-10. a delete the gate delayed is re-checked when it starts: retired meanwhile by a Clear or by a newer handle, it is skipped", async () => {
    const { store, scheduler, gate, clear } = setupWithGate();
    const release = (() => {
      let done!: () => void;
      const held = new Promise<void>((resolve) => {
        done = resolve;
      });
      void gate.runExclusive(() => held); // a Clear is running
      return done;
    })();
    const retiredByClear = open(scheduler, A);
    const retiredByNewer = open(scheduler, B);
    retiredByClear.update(snap("a"), { immediate: false });
    const first = retiredByClear.discard(); // delayed behind the running Clear (still allowed at request time)
    const second = retiredByNewer.discard(); // delayed too
    await flush();
    expect(store.startsOf("delete")).toEqual([]);
    const retire = clear(); // a second Clear retires `retiredByClear` ...
    const newerB = open(scheduler, B); // ... and a newer handle takes B over
    newerB.update(snap("B, valid"), { immediate: true });
    release();
    await Promise.all([first, second, retire]);
    await flush();
    // Both delayed deletes were skipped when they finally started (no delete reached storage).
    expect(store.startsOf("delete")).toEqual([]);
  });

  it("M6R1-9. no unhandled rejection, no leftover timer, and retirement still drains the admitted work", async () => {
    const collector = unhandled.collect();
    try {
      const { store, scheduler, lifecycle, clear, directSave } = setupWithGate();
      const old = open(scheduler);
      old.update(snap("pre-Clear tail")); // timer armed
      await clear();
      expect(vi.getTimerCount()).toBe(0);
      await directSave("NEW_AFTER_CLEAR");
      const inFlight = store.hold("saveMissionDraft");
      const fresh = open(scheduler);
      fresh.update(snap("fresh, admitted"), { immediate: true });
      await inFlight.entered;
      lifecycle.beginRetirement();
      const drained = lifecycle.waitForDrain(1000);
      await old.discardWithinAdmittedWork(); // refused, resolves, holds nothing back
      inFlight.release();
      expect(await drained).toBe(true);
      expect((await store.stored(A))?.code).toBe("fresh, admitted");
    } finally {
      collector.stop();
    }
    expect(collector.seen).toEqual([]);
  });
});
