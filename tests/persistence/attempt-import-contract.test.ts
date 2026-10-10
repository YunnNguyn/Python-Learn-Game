import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AttemptRecordSchema,
  Difficulty,
  HintLevel,
  LearningStage,
} from "../../src/core/domain";
import {
  DuplicateAttemptError,
  IndexedDbLearningPersistence,
  InvalidAttemptRecordError,
  MemoryLearningPersistence,
  ResilientLearningPersistence,
  type LearningPersistence,
} from "../../src/core/persistence";
import {
  MemoryMetaProgressionPersistence,
  MetaProgressionEngine,
} from "../../src/core/meta-progression";
import { rawGetAll, rawPut, useIsolatedIndexedDb } from "./indexeddb-test-utils";

function makeAttempt(overrides: Record<string, unknown> = {}) {
  return AttemptRecordSchema.parse({
    id: "attempt.import.1",
    activityId: "activity.test",
    missionTemplateId: "template.test",
    missionTemplateVersion: 1,
    seed: "seed",
    difficulty: Difficulty.EASY,
    conceptIds: ["concept.a", "concept.b"],
    learningStage: LearningStage.GUIDED,
    startedAt: "2026-10-03T11:59:00.000Z",
    submittedAt: "2026-10-03T12:00:00.000Z",
    passed: true,
    submissionIndex: 1,
    runCountBeforeSubmit: 0,
    hintsUsed: [HintLevel.H1],
    runtimeErrorCount: 0,
    graderSummary: { checks: 2, failed: 0 },
    ...overrides,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

type Harness = ReturnType<typeof useIsolatedIndexedDb>;
interface Subject {
  readonly store: LearningPersistence;
  /** A second, independent view of the same durable data (null for memory). */
  readonly reopen: (() => LearningPersistence) | null;
}

const IMPLEMENTATIONS: ReadonlyArray<readonly [string, (idb: Harness) => Subject]> = [
  [
    "MemoryLearningPersistence",
    () => ({ store: new MemoryLearningPersistence(), reopen: null }),
  ],
  [
    "IndexedDbLearningPersistence",
    (idb) => {
      const factory = idb.createFactory();
      return {
        store: idb.track(new IndexedDbLearningPersistence(factory)),
        reopen: () => idb.track(new IndexedDbLearningPersistence(factory)),
      };
    },
  ],
  [
    "ResilientLearningPersistence over IndexedDB",
    (idb) => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const factory = idb.createFactory();
      return {
        store: new ResilientLearningPersistence(
          idb.track(new IndexedDbLearningPersistence(factory)),
        ),
        reopen: () => idb.track(new IndexedDbLearningPersistence(factory)),
      };
    },
  ],
];

describe.each(IMPLEMENTATIONS)("attempt import contract: %s", (_name, build) => {
  const idb = useIsolatedIndexedDb();

  it("adds a new record", async () => {
    const { store, reopen } = build(idb);
    const attempt = makeAttempt();

    expect(await store.addAttemptIfAbsent(attempt)).toEqual({ status: "added" });
    expect(await store.getAttempts()).toEqual([attempt]);
    if (reopen) expect(await reopen().getAttempts()).toEqual([attempt]);
  });

  it("returns exists when the same record is imported again", async () => {
    const { store } = build(idb);
    const attempt = makeAttempt();
    await store.addAttemptIfAbsent(attempt);

    expect(await store.addAttemptIfAbsent(attempt)).toEqual({ status: "exists" });
    expect(await store.addAttemptIfAbsent(structuredClone(attempt))).toEqual({ status: "exists" });
    expect(await store.getAttempts()).toEqual([attempt]);
  });

  it("returns exists for a record created by addAttempt (the Submit path)", async () => {
    const { store } = build(idb);
    const attempt = makeAttempt();
    await store.addAttempt(attempt);
    expect(await store.addAttemptIfAbsent(attempt)).toEqual({ status: "exists" });
  });

  it("returns conflict for the same id with different content and preserves the original", async () => {
    const { store, reopen } = build(idb);
    const original = makeAttempt();
    await store.addAttemptIfAbsent(original);

    for (const changed of [
      { passed: false },
      { seed: "other-seed" },
      { conceptIds: ["concept.b", "concept.a"] },
      { graderSummary: { checks: 9, failed: 9 } },
      { startedAt: undefined },
    ]) {
      expect(await store.addAttemptIfAbsent(makeAttempt(changed))).toEqual({ status: "conflict" });
    }
    expect(await store.getAttempts()).toEqual([original]);
    if (reopen) expect(await reopen().getAttempts()).toEqual([original]);
  });

  it("leaves other records untouched", async () => {
    const { store } = build(idb);
    const other = makeAttempt({ id: "attempt.other", submittedAt: "2026-10-03T08:00:00.000Z" });
    await store.addAttempt(other);
    await store.addAttemptIfAbsent(makeAttempt());
    await store.addAttemptIfAbsent(makeAttempt({ passed: false }));

    expect((await store.getAttempts()).map((a) => a.id)).toEqual(["attempt.other", "attempt.import.1"]);
    expect((await store.getAttempts())[0]).toEqual(other);
  });

  it("rejects an invalid record with InvalidAttemptRecordError and stores nothing", async () => {
    const { store } = build(idb);
    const invalid = { ...makeAttempt(), submissionIndex: 0, passed: "yes" } as never;

    const error = await store.addAttemptIfAbsent(invalid).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidAttemptRecordError);
    expect((error as InvalidAttemptRecordError).issues.length).toBeGreaterThan(0);
    expect(await store.getAttempts()).toEqual([]);
  });

  it("rejects unknown fields (strict schema) instead of storing them", async () => {
    const { store } = build(idb);
    await expect(
      store.addAttemptIfAbsent({ ...makeAttempt(), syncRevision: 1 } as never),
    ).rejects.toBeInstanceOf(InvalidAttemptRecordError);
    expect(await store.getAttempts()).toEqual([]);
  });

  it("addAttempt keeps rejecting duplicates with DuplicateAttemptError and never overwrites", async () => {
    const { store } = build(idb);
    const original = makeAttempt();
    await store.addAttempt(original);

    await expect(store.addAttempt(makeAttempt({ passed: false }))).rejects.toBeInstanceOf(
      DuplicateAttemptError,
    );
    expect(await store.getAttempts()).toEqual([original]);
  });

  it("two concurrent imports of the same record store exactly one record", async () => {
    const { store, reopen } = build(idb);
    const attempt = makeAttempt();

    const results = await Promise.all([
      store.addAttemptIfAbsent(attempt),
      store.addAttemptIfAbsent(structuredClone(attempt)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["added", "exists"]);
    expect(await store.getAttempts()).toEqual([attempt]);
    if (reopen) expect(await reopen().getAttempts()).toEqual([attempt]);
  });

  it("many concurrent imports of the same record still store exactly one", async () => {
    const { store } = build(idb);
    const attempt = makeAttempt();

    const results = await Promise.all(
      Array.from({ length: 10 }, () => store.addAttemptIfAbsent(attempt)),
    );
    expect(results.filter((r) => r.status === "added")).toHaveLength(1);
    expect(results.filter((r) => r.status === "exists")).toHaveLength(9);
    expect(await store.getAttempts()).toHaveLength(1);
  });

  it("concurrent conflicting imports never overwrite each other", async () => {
    const { store } = build(idb);
    const first = makeAttempt({ seed: "seed-first" });
    const second = makeAttempt({ seed: "seed-second" });

    const [firstResult, secondResult] = await Promise.all([
      store.addAttemptIfAbsent(first),
      store.addAttemptIfAbsent(second),
    ]);
    const statuses = [firstResult.status, secondResult.status].sort();
    expect(statuses).toEqual(["added", "conflict"]);

    const stored = await store.getAttempts();
    expect(stored).toHaveLength(1);
    const winner = firstResult.status === "added" ? first : second;
    expect(stored[0]).toEqual(winner);
  });

  it("concurrent addAttempt and addAttemptIfAbsent for one id store one record", async () => {
    const { store } = build(idb);
    const attempt = makeAttempt();

    const [added, imported] = await Promise.allSettled([
      store.addAttempt(attempt),
      store.addAttemptIfAbsent(attempt),
    ]);
    // Whichever runs first wins; the loser reports the domain outcome, never a storage error.
    if (added.status === "rejected") {
      expect(added.reason).toBeInstanceOf(DuplicateAttemptError);
      expect(imported).toEqual({ status: "fulfilled", value: { status: "added" } });
    } else {
      expect(imported).toEqual({ status: "fulfilled", value: { status: "exists" } });
    }
    expect(await store.getAttempts()).toEqual([attempt]);
  });

  it("does not invoke progression or reward processing and creates no extra AttemptRecords", async () => {
    const { store } = build(idb);
    const recordAttempt = vi.spyOn(MetaProgressionEngine.prototype, "recordAttempt");
    const reconcileAttempts = vi.spyOn(MetaProgressionEngine.prototype, "reconcileAttempts");
    const loadState = vi.spyOn(MemoryMetaProgressionPersistence.prototype, "loadState");
    const saveState = vi.spyOn(MemoryMetaProgressionPersistence.prototype, "saveState");

    await store.addAttemptIfAbsent(makeAttempt({ id: "attempt.a" }));
    await store.addAttemptIfAbsent(makeAttempt({ id: "attempt.a" }));
    await store.addAttemptIfAbsent(makeAttempt({ id: "attempt.a", passed: false }));
    await store.addAttemptIfAbsent(makeAttempt({ id: "attempt.b" }));

    expect(recordAttempt).not.toHaveBeenCalled();
    expect(reconcileAttempts).not.toHaveBeenCalled();
    expect(loadState).not.toHaveBeenCalled();
    expect(saveState).not.toHaveBeenCalled();
    expect((await store.getAttempts()).map((a) => a.id).sort()).toEqual(["attempt.a", "attempt.b"]);
  });
});

describe("IndexedDB-specific import behavior", () => {
  const idb = useIsolatedIndexedDb();
  const DATABASE_NAME = "python-learn-game";

  async function createWithRawAccess() {
    const factory = idb.createFactory();
    const store = idb.track(new IndexedDbLearningPersistence(factory));
    await store.getAttempts(); // forces database creation
    return { factory, store };
  }

  it("treats a pre-existing record (written before this API existed) as exists, regardless of key order", async () => {
    const { factory, store } = await createWithRawAccess();
    const attempt = makeAttempt();
    // Same content, keys written in reverse order, as an older build could have stored it.
    const reversed = Object.fromEntries(Object.entries(attempt).reverse());
    await rawPut(factory, DATABASE_NAME, "attempts", reversed);

    expect(await store.addAttemptIfAbsent(attempt)).toEqual({ status: "exists" });
    expect(await rawGetAll(factory, DATABASE_NAME, "attempts")).toEqual([reversed]);
  });

  it("reports conflict for an unreadable stored row and does not overwrite it", async () => {
    const { factory, store } = await createWithRawAccess();
    const corrupt = { ...makeAttempt(), passed: "maybe" };
    await rawPut(factory, DATABASE_NAME, "attempts", corrupt);

    expect(await store.addAttemptIfAbsent(makeAttempt())).toEqual({ status: "conflict" });
    expect(await rawGetAll(factory, DATABASE_NAME, "attempts")).toEqual([corrupt]);
  });

  it("does not rewrite or deduplicate other rows", async () => {
    const { factory, store } = await createWithRawAccess();
    const legacy = { ...makeAttempt({ id: "attempt.legacy" }), futureField: 1 };
    await rawPut(factory, DATABASE_NAME, "attempts", legacy);

    await store.addAttemptIfAbsent(makeAttempt());
    const rows = (await rawGetAll(factory, DATABASE_NAME, "attempts")) as Array<{ id: string }>;
    expect(rows.map((r) => r.id).sort()).toEqual(["attempt.import.1", "attempt.legacy"]);
    expect(rows.find((r) => r.id === "attempt.legacy")).toEqual(legacy);
  });

  it("surfaces a genuine storage failure instead of reporting a domain outcome", async () => {
    const factory = idb.createFactory();
    vi.spyOn(factory, "open").mockImplementation(() => {
      throw new Error("IndexedDB disabled");
    });
    const store = idb.track(new IndexedDbLearningPersistence(factory));

    const error = await store.addAttemptIfAbsent(makeAttempt()).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(DuplicateAttemptError);
    expect(error).not.toBeInstanceOf(InvalidAttemptRecordError);
  });
});
