import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AttemptRecordSchema,
  Difficulty,
  HintLevel,
  LearningStage,
  type AttemptRecord,
} from "../../src/core/domain";
import {
  AttemptProvenanceUnreadableError,
  DuplicateAttemptError,
  GUEST_SCOPE,
  ImportRequiresDurableStorageError,
  IndexedDbLearningPersistence,
  InvalidAttemptRecordError,
  InvalidImportOriginError,
  MemoryLearningPersistence,
  PersistenceDomainError,
  PersistenceUpgradeBlockedError,
  PersistenceUpgradeFailureReason,
  ResilientLearningPersistence,
  accountScope,
  type AddAttemptIfAbsentResult,
  type AttemptImportOrigin,
  type LearningPersistence,
} from "../../src/core/persistence";
import {
  openRawConnection,
  rawDescribeSchema,
  rawGetAll,
  rawPut,
  seedLearningV1Database,
  useIsolatedIndexedDb,
} from "./indexeddb-test-utils";

/**
 * PHASE-04C.3B - atomic imported-attempt persistence (Learning DB v2).
 * Section letters (A-P) follow the phase brief.
 */

const GUEST_DB = "python-learn-game";
const ATTEMPTS = "attempts";
const PROVENANCE = "attemptProvenance";

function makeAttempt(overrides: Record<string, unknown> = {}): AttemptRecord {
  return AttemptRecordSchema.parse({
    id: "attempt.test.1",
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
    runCountBeforeSubmit: 2,
    hintsUsed: [HintLevel.H1],
    runtimeErrorCount: 0,
    graderSummary: { checks: 3, failed: 0 },
    ...overrides,
  });
}

function at(minute: number): string {
  return `2026-10-03T12:${String(minute).padStart(2, "0")}:00.000Z`;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Retries while the upgrade is still reported BLOCKED. Right after the old tab
 * closes there is a short window before the pending upgrade finishes, during
 * which callers are (correctly) still told it is blocked.
 */
async function untilUnblocked<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof PersistenceUpgradeBlockedError)) throw error;
      await sleep(10);
    }
  }
  throw new Error("upgrade stayed blocked after the old connection closed");
}

/** A factory whose every open() fails, to model unavailable storage. */
function brokenFactory(): IDBFactory {
  return {
    open() {
      throw new Error("storage unavailable");
    },
  } as unknown as IDBFactory;
}

function ids(records: readonly AttemptRecord[]): string[] {
  return records.map((record) => String(record.id));
}

function isIsoInstant(value: unknown): boolean {
  return typeof value === "string" && new Date(value).toISOString() === value;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("attempt provenance (Learning DB v2)", () => {
  const idb = useIsolatedIndexedDb();

  function createStore(factory = idb.createFactory(), scope = GUEST_SCOPE) {
    return { factory, store: idb.track(new IndexedDbLearningPersistence(factory, scope)) };
  }

  async function provenanceRows(factory: IDBFactory, databaseName = GUEST_DB) {
    return (await rawGetAll(factory, databaseName, PROVENANCE)) as Array<{
      attemptId: string;
      origin: string;
      importedAt: string;
    }>;
  }

  // ---------------------------------------------------------------- A
  describe("A. v1 -> v2 migration", () => {
    it("adds attemptProvenance and preserves attempts, drafts and the database name", async () => {
      const factory = idb.createFactory();
      const legacy = makeAttempt({ id: "attempt.legacy.1" });
      const legacyTwo = makeAttempt({ id: "attempt.legacy.2", submittedAt: at(5) });
      const draft = {
        activityId: "activity.test",
        seed: "seed.variant.1",
        variantIndex: 1,
        code: "answer = 42",
        hintsUsed: [HintLevel.H1],
        updatedAt: "2026-10-03T12:01:00.000Z",
      };
      await seedLearningV1Database(factory, GUEST_DB, {
        attempts: [legacy, legacyTwo],
        drafts: [draft],
      });
      expect((await rawDescribeSchema(factory, GUEST_DB)).version).toBe(1);

      const { store } = createStore(factory);
      expect(await store.getAttempts()).toEqual([legacy, legacyTwo]);

      const schema = await rawDescribeSchema(factory, GUEST_DB);
      expect(schema.version).toBe(2);
      expect(Object.keys(schema.stores).sort()).toEqual([PROVENANCE, ATTEMPTS, "missionDrafts"].sort());
      expect(schema.stores[PROVENANCE]).toEqual({ keyPath: "attemptId", indexes: {} });
      expect(Object.keys(schema.stores[ATTEMPTS]?.indexes ?? {}).sort()).toEqual([
        "activityId",
        "conceptIds",
        "submittedAt",
      ]);

      // Rows are byte-for-byte what the v1 build stored; nothing was rewritten or tagged.
      expect(await rawGetAll(factory, GUEST_DB, ATTEMPTS)).toEqual([legacy, legacyTwo]);
      expect(await rawGetAll(factory, GUEST_DB, "missionDrafts")).toEqual([draft]);
      expect(await provenanceRows(factory)).toEqual([]);
      expect((await store.getMissionDraft(draft.activityId as never))?.code).toBe("answer = 42");
    });

    it("keeps legacy v1 attempts local (reward eligible) with no marker", async () => {
      const factory = idb.createFactory();
      const legacy = makeAttempt({ id: "attempt.legacy.1" });
      await seedLearningV1Database(factory, GUEST_DB, { attempts: [legacy] });

      const { store } = createStore(factory);
      expect(await store.getRewardEligibleAttemptsSnapshot()).toEqual([legacy]);
      expect(await provenanceRows(factory)).toEqual([]);
    });

    it("migrates an existing account database in place, without touching Guest or Meta", async () => {
      const factory = idb.createFactory();
      const scope = accountScope("acct-A");
      const accountDb = new IndexedDbLearningPersistence(factory, scope).databaseName;
      const accountAttempt = makeAttempt({ id: "attempt.account" });
      const guestAttempt = makeAttempt({ id: "attempt.guest" });
      await seedLearningV1Database(factory, accountDb, { attempts: [accountAttempt] });
      await seedLearningV1Database(factory, GUEST_DB, { attempts: [guestAttempt] });

      // A Meta database at its own v1, created independently.
      const metaName = "python-learn-game-meta";
      await new Promise<void>((resolve, reject) => {
        const request = factory.open(metaName, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("progressionState", { keyPath: "key" });
        };
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => reject(request.error);
      });

      const { store } = createStore(factory, scope);
      expect(await store.getAttempts()).toEqual([accountAttempt]);

      const versions = Object.fromEntries(
        (await factory.databases()).map((info) => [info.name ?? "", info.version]),
      );
      expect(versions[accountDb]).toBe(2);
      expect(versions[GUEST_DB]).toBe(1); // not opened by this store, so not upgraded
      expect(versions[metaName]).toBe(1); // Meta DB and its version untouched
    });
  });

  // ---------------------------------------------------------------- B
  describe("B. new Guest and Account databases", () => {
    it("are created directly at v2 with the provenance store, and stay isolated", async () => {
      const factory = idb.createFactory();
      const scopeA = accountScope("acct-A");
      const guest = createStore(factory, GUEST_SCOPE).store;
      const accountA = createStore(factory, scopeA).store;

      await guest.getAttempts();
      await accountA.getAttempts();
      for (const name of [guest.databaseName, accountA.databaseName]) {
        const schema = await rawDescribeSchema(factory, name);
        expect(schema.version).toBe(2);
        expect(schema.stores[PROVENANCE]).toEqual({ keyPath: "attemptId", indexes: {} });
      }

      const record = makeAttempt({ id: "attempt.account.import" });
      expect(await accountA.importAttemptIfAbsent(record, "cloud-import")).toEqual({ status: "added" });
      expect(await provenanceRows(factory, accountA.databaseName)).toHaveLength(1);
      expect(await provenanceRows(factory, guest.databaseName)).toEqual([]);
      expect(await guest.getAttempts()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------- C
  describe("C. atomic add", () => {
    it.each<AttemptImportOrigin>(["cloud-import", "guest-copy"])(
      "stores the attempt and a %s marker together, and nothing else in the attempt",
      async (origin) => {
        const { factory, store } = createStore();
        const record = makeAttempt();

        expect(await store.importAttemptIfAbsent(record, origin)).toEqual({ status: "added" });

        expect(await store.getAttempts()).toEqual([record]);
        // No provenance/metadata inside the attempts store.
        expect(await rawGetAll(factory, GUEST_DB, ATTEMPTS)).toEqual([record]);
        const rows = await provenanceRows(factory);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ attemptId: "attempt.test.1", origin });
        expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["attemptId", "importedAt", "origin"]);
        expect(isIsoInstant(rows[0]?.importedAt)).toBe(true);
      },
    );

    it("survives a fresh instance (durable)", async () => {
      const { factory, store } = createStore();
      const record = makeAttempt();
      await store.importAttemptIfAbsent(record, "cloud-import");
      await idb.close(store);

      const reopened = idb.track(new IndexedDbLearningPersistence(factory));
      expect(await reopened.getAttempts()).toEqual([record]);
      expect(await reopened.getRewardEligibleAttemptsSnapshot()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------- D / E
  describe("D. identical import -> exists", () => {
    it("is a no-op for attempt and provenance, even with another origin", async () => {
      const { factory, store } = createStore();
      const record = makeAttempt();
      await store.importAttemptIfAbsent(record, "cloud-import");
      const before = await provenanceRows(factory);

      expect(await store.importAttemptIfAbsent(record, "guest-copy")).toEqual({ status: "exists" });
      expect(await store.importAttemptIfAbsent(record, "cloud-import")).toEqual({ status: "exists" });

      expect(await provenanceRows(factory)).toEqual(before);
      expect(await store.getAttempts()).toEqual([record]);
    });
  });

  describe("E. same id, different content -> conflict", () => {
    it("leaves the stored attempt and its provenance untouched", async () => {
      const { factory, store } = createStore();
      const original = makeAttempt();
      await store.importAttemptIfAbsent(original, "cloud-import");
      const before = await provenanceRows(factory);

      const result = await store.importAttemptIfAbsent(makeAttempt({ passed: false }), "guest-copy");

      expect(result).toEqual({ status: "conflict" });
      expect(await store.getAttempts()).toEqual([original]);
      expect(await provenanceRows(factory)).toEqual(before);
    });

    it("reports conflict, and writes nothing, against an unreadable stored row", async () => {
      const { factory, store } = createStore();
      await store.getAttempts();
      const corrupt = { ...makeAttempt(), passed: "yes" };
      await rawPut(factory, GUEST_DB, ATTEMPTS, corrupt);

      expect(await store.importAttemptIfAbsent(makeAttempt(), "cloud-import")).toEqual({
        status: "conflict",
      });
      expect(await rawGetAll(factory, GUEST_DB, ATTEMPTS)).toEqual([corrupt]);
      expect(await provenanceRows(factory)).toEqual([]);
    });
  });

  // ---------------------------------------------------------------- F
  describe("F. local attempts stay local", () => {
    it("an identical import of a locally stored attempt does not relabel it", async () => {
      const { factory, store } = createStore();
      const local = makeAttempt();
      await store.addAttempt(local);

      expect(await store.importAttemptIfAbsent(local, "cloud-import")).toEqual({ status: "exists" });

      expect(await provenanceRows(factory)).toEqual([]);
      expect(await store.getRewardEligibleAttemptsSnapshot()).toEqual([local]);
    });

    it("a conflicting import of a locally stored attempt does not touch it", async () => {
      const { factory, store } = createStore();
      const local = makeAttempt();
      await store.addAttempt(local);

      expect(
        await store.importAttemptIfAbsent(makeAttempt({ passed: false }), "cloud-import"),
      ).toEqual({ status: "conflict" });

      expect(await provenanceRows(factory)).toEqual([]);
      expect(await store.getRewardEligibleAttemptsSnapshot()).toEqual([local]);
    });

    it("addAttempt and addAttemptIfAbsent never create provenance", async () => {
      const { factory, store } = createStore();
      await store.addAttempt(makeAttempt({ id: "attempt.a" }));
      await store.addAttemptIfAbsent(makeAttempt({ id: "attempt.b", submittedAt: at(1) }));
      expect(await provenanceRows(factory)).toEqual([]);
      await expect(store.addAttempt(makeAttempt({ id: "attempt.a" }))).rejects.toBeInstanceOf(
        DuplicateAttemptError,
      );
    });
  });

  // ---------------------------------------------------------------- G
  describe("G. aborted transaction leaves neither row", () => {
    it("rolls the attempt back when the provenance write fails", async () => {
      const { factory, store } = createStore();
      await store.getAttempts(); // create the database
      // An inconsistent marker with no attempt: the provenance `add` must fail
      // AFTER the attempt `add` was issued, aborting the whole transaction.
      const orphan = {
        attemptId: "attempt.orphan",
        origin: "cloud-import",
        importedAt: "2026-10-03T10:00:00.000Z",
      };
      await rawPut(factory, GUEST_DB, PROVENANCE, orphan);

      await expect(
        store.importAttemptIfAbsent(makeAttempt({ id: "attempt.orphan" }), "guest-copy"),
      ).rejects.toThrow();

      expect(await rawGetAll(factory, GUEST_DB, ATTEMPTS)).toEqual([]);
      expect(await provenanceRows(factory)).toEqual([orphan]);

      // The connection is still usable for other ids.
      expect(
        await store.importAttemptIfAbsent(makeAttempt({ id: "attempt.fine" }), "guest-copy"),
      ).toEqual({ status: "added" });
      expect(ids(await store.getAttempts())).toEqual(["attempt.fine"]);
    });

    it("never reports the orphaned id as reward eligible", async () => {
      const { factory, store } = createStore();
      await store.getAttempts();
      await rawPut(factory, GUEST_DB, PROVENANCE, {
        attemptId: "attempt.orphan",
        origin: "cloud-import",
        importedAt: "2026-10-03T10:00:00.000Z",
      });
      expect(await store.getRewardEligibleAttemptsSnapshot()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------- H / I
  describe("H. concurrency on one instance", () => {
    it("10 concurrent identical imports -> exactly one added", async () => {
      const { factory, store } = createStore();
      const record = makeAttempt();

      const results = await Promise.all(
        Array.from({ length: 10 }, () => store.importAttemptIfAbsent(record, "cloud-import")),
      );

      expect(results.filter((r) => r.status === "added")).toHaveLength(1);
      expect(results.filter((r) => r.status === "exists")).toHaveLength(9);
      expect(await store.getAttempts()).toEqual([record]);
      expect(await provenanceRows(factory)).toHaveLength(1);
    });

    it("10 concurrent imports with two competing contents -> one winner, rest exists/conflict", async () => {
      const { factory, store } = createStore();
      const variants = [makeAttempt(), makeAttempt({ passed: false })];

      const results = await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          store.importAttemptIfAbsent(variants[index % 2] as AttemptRecord, "cloud-import"),
        ),
      );

      expect(results.filter((r) => r.status === "added")).toHaveLength(1);
      const winnerIndex = results.findIndex((r) => r.status === "added");
      expect(await store.getAttempts()).toEqual([variants[winnerIndex % 2]]);
      expect(await provenanceRows(factory)).toHaveLength(1);
    });
  });

  describe("I. concurrency across instances", () => {
    it("two instances importing the same record -> one added, one exists", async () => {
      const factory = idb.createFactory();
      const first = createStore(factory).store;
      const second = createStore(factory).store;
      const record = makeAttempt();

      const results = await Promise.all([
        first.importAttemptIfAbsent(record, "cloud-import"),
        second.importAttemptIfAbsent(record, "guest-copy"),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual(["added", "exists"]);
      expect(await provenanceRows(factory)).toHaveLength(1);
      expect(await first.getAttempts()).toEqual([record]);
    });

    it("an import racing a local add: provenance exists iff the import was the writer", async () => {
      const factory = idb.createFactory();
      const importer = createStore(factory).store;
      const local = createStore(factory).store;
      const record = makeAttempt();

      const [importResult, localResult] = await Promise.all([
        importer.importAttemptIfAbsent(record, "cloud-import"),
        local.addAttemptIfAbsent(record),
      ]);

      const rows = await provenanceRows(factory);
      expect([importResult.status, localResult.status].filter((s) => s === "added")).toHaveLength(1);
      expect(rows).toHaveLength(importResult.status === "added" ? 1 : 0);
      expect(await importer.getAttempts()).toEqual([record]);
    });
  });

  // ---------------------------------------------------------------- J
  describe("J. reward-eligible snapshot", () => {
    it("excludes every imported attempt and keeps local and legacy ones, ordered", async () => {
      const factory = idb.createFactory();
      const legacy = makeAttempt({ id: "attempt.legacy", submittedAt: at(1) });
      await seedLearningV1Database(factory, GUEST_DB, { attempts: [legacy] });
      const { store } = createStore(factory);

      const local = makeAttempt({ id: "attempt.local", submittedAt: at(9) });
      await store.addAttempt(local);
      await store.importAttemptIfAbsent(makeAttempt({ id: "attempt.cloud", submittedAt: at(3) }), "cloud-import");
      await store.importAttemptIfAbsent(makeAttempt({ id: "attempt.copy", submittedAt: at(4) }), "guest-copy");

      expect(ids(await store.getAttempts())).toEqual([
        "attempt.legacy",
        "attempt.cloud",
        "attempt.copy",
        "attempt.local",
      ]);
      expect(await store.getRewardEligibleAttemptsSnapshot()).toEqual([legacy, local]);
    });

    it("returns detached records", async () => {
      const { store } = createStore();
      await store.addAttempt(makeAttempt());

      const first = await store.getRewardEligibleAttemptsSnapshot();
      (first[0] as { passed: boolean }).passed = false;
      (first[0]?.conceptIds as string[]).push("tampered");

      const second = await store.getRewardEligibleAttemptsSnapshot();
      expect(second[0]?.passed).toBe(true);
      expect(second[0]?.conceptIds).toEqual(["concept.a", "concept.b"]);
    });

    it("rejects, rather than returning unfiltered data, when a provenance row is corrupt", async () => {
      const { factory, store } = createStore();
      await store.addAttempt(makeAttempt());
      await rawPut(factory, GUEST_DB, PROVENANCE, { attemptId: "x", origin: "nobody", importedAt: "nope" });

      await expect(store.getRewardEligibleAttemptsSnapshot()).rejects.toBeInstanceOf(
        AttemptProvenanceUnreadableError,
      );
      // Plain reads still work: only reward eligibility is unknowable.
      expect(await store.getAttempts()).toHaveLength(1);
    });

    it("rejects when a v2 database lacks the provenance store", async () => {
      const factory = idb.createFactory();
      await new Promise<void>((resolve, reject) => {
        const request = factory.open(GUEST_DB, 2);
        request.onupgradeneeded = () => {
          request.result.createObjectStore(ATTEMPTS, { keyPath: "id" });
          request.result.createObjectStore("missionDrafts", { keyPath: "activityId" });
        };
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => reject(request.error);
      });

      const { store } = createStore(factory);
      await expect(store.getRewardEligibleAttemptsSnapshot()).rejects.toBeInstanceOf(
        AttemptProvenanceUnreadableError,
      );
    });

    it("does not fail over to empty memory through Resilient when provenance is unreadable", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const { factory, store } = createStore();
      await store.addAttempt(makeAttempt());
      await rawPut(factory, GUEST_DB, PROVENANCE, { attemptId: "x", origin: "nobody", importedAt: "nope" });
      const resilient = new ResilientLearningPersistence(store);

      await expect(resilient.getRewardEligibleAttemptsSnapshot()).rejects.toBeInstanceOf(
        AttemptProvenanceUnreadableError,
      );
      expect(resilient.kind).toBe("indexeddb");
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------- K
  describe("K. snapshot consistency under concurrent import/clear", () => {
    it("never shows an imported attempt without its marker, and ends consistent", async () => {
      const { factory, store } = createStore();
      await store.addAttempt(makeAttempt({ id: "local.1", submittedAt: at(0) }));

      const writes: Array<Promise<unknown>> = [];
      const snapshots: Array<Promise<readonly AttemptRecord[]>> = [];
      for (let index = 0; index < 20; index += 1) {
        writes.push(
          store.importAttemptIfAbsent(
            makeAttempt({ id: `imported.${index}`, submittedAt: at(index + 1) }),
            index % 2 === 0 ? "cloud-import" : "guest-copy",
          ),
        );
        snapshots.push(store.getRewardEligibleAttemptsSnapshot());
        if (index === 10) writes.push(store.clearAttempts());
      }
      await Promise.all(writes);

      for (const snapshot of await Promise.all(snapshots)) {
        expect(ids(snapshot).filter((id) => id.startsWith("imported."))).toEqual([]);
      }

      const storedImported = (await rawGetAll(factory, GUEST_DB, ATTEMPTS))
        .map((row) => (row as { id: string }).id)
        .filter((id) => id.startsWith("imported."));
      const marked = (await provenanceRows(factory)).map((row) => row.attemptId);
      expect(new Set(marked)).toEqual(new Set(storedImported));
      expect(marked).toHaveLength(storedImported.length);
    });
  });

  // ---------------------------------------------------------------- Q
  describe("Q. snapshot read failures fail closed (never an ordinary storage failure)", () => {
    type CachedHandle = { handle: { database: Promise<IDBDatabase> } | null };

    /** Opens the store's cached connection so a test can inject a fault into it. */
    async function databaseOf(store: IndexedDbLearningPersistence): Promise<IDBDatabase> {
      await store.getAttempts();
      const handle = (store as unknown as CachedHandle).handle;
      if (!handle) throw new Error("expected an open connection");
      return handle.database;
    }

    function succeedingRequest(result: unknown) {
      const request: { onsuccess: null | (() => void); onerror: null | (() => void); result: unknown } = {
        onsuccess: null,
        onerror: null,
        result,
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    }

    function failingRequest() {
      const request: { onsuccess: null | (() => void); onerror: null | (() => void); result: unknown } = {
        onsuccess: null,
        onerror: null,
        result: undefined,
      };
      queueMicrotask(() => request.onerror?.());
      return request;
    }

    /**
     * Each entry installs one fault into the snapshot read. Attempts reads always
     * succeed; only the provenance read (or the transaction itself) misbehaves.
     */
    const faults: Array<[string, (database: IDBDatabase) => void]> = [
      [
        "a provenance getAll that throws",
        (database) => {
          vi.spyOn(database, "transaction").mockImplementation(
            () =>
              ({
                objectStore(name: string) {
                  return {
                    getAll() {
                      if (name === PROVENANCE) throw new Error("provenance getAll threw");
                      return succeedingRequest([]);
                    },
                  };
                },
                abort() {},
              }) as unknown as IDBTransaction,
          );
        },
      ],
      [
        "a provenance request that fails",
        (database) => {
          vi.spyOn(database, "transaction").mockImplementation(
            () =>
              ({
                objectStore(name: string) {
                  return {
                    getAll: () => (name === PROVENANCE ? failingRequest() : succeedingRequest([])),
                  };
                },
                abort() {},
              }) as unknown as IDBTransaction,
          );
        },
      ],
      [
        "a snapshot transaction that aborts",
        (database) => {
          const original = database.transaction.bind(database);

          vi.spyOn(database, "transaction").mockImplementation((names, mode) => {
            const transaction = original(names, mode);
            queueMicrotask(() => transaction.abort());
            return transaction;
          });
        },
      ],
      [
        "a transaction that cannot be created",
        (database) => {
          vi.spyOn(database, "transaction").mockImplementation(() => {
            throw new DOMException("store missing", "NotFoundError");
          });
        },
      ],
    ];

    it.each(faults)("%s -> AttemptProvenanceUnreadableError with the original cause, nothing mutated", async (_label, install) => {
      const { factory, store } = createStore();
      const local = makeAttempt({ id: "attempt.local", submittedAt: at(1) });
      const imported = makeAttempt({ id: "attempt.imported", submittedAt: at(2) });
      await store.addAttempt(local);
      await store.importAttemptIfAbsent(imported, "cloud-import");
      const attemptsBefore = await rawGetAll(factory, GUEST_DB, ATTEMPTS);
      const provenanceBefore = await provenanceRows(factory);

      install(await databaseOf(store));
      const error = await store.getRewardEligibleAttemptsSnapshot().then(
        () => null,
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(AttemptProvenanceUnreadableError);
      expect((error as Error).cause).toBeInstanceOf(Error);
      expect(await rawGetAll(factory, GUEST_DB, ATTEMPTS)).toEqual(attemptsBefore);
      expect(await provenanceRows(factory)).toEqual(provenanceBefore);

      // Once the fault is gone the healthy snapshot is correct again.
      vi.restoreAllMocks();
      expect(ids(await store.getRewardEligibleAttemptsSnapshot())).toEqual(["attempt.local"]);
    });

    it.each(faults)("through Resilient, %s is rethrown and never switches to memory", async (_label, install) => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const { store } = createStore();
      await store.addAttempt(makeAttempt({ id: "attempt.local" }));
      const resilient = new ResilientLearningPersistence(store);

      install(await databaseOf(store));
      const error = await resilient.getRewardEligibleAttemptsSnapshot().then(
        () => null,
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(AttemptProvenanceUnreadableError);
      expect(resilient.kind).toBe("indexeddb");
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("genuine IndexedDB unavailability still falls back to memory on the snapshot (ordinary behaviour)", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const resilient = new ResilientLearningPersistence(
        idb.track(new IndexedDbLearningPersistence(brokenFactory())),
      );

      expect(await resilient.getRewardEligibleAttemptsSnapshot()).toEqual([]);
      expect(resilient.kind).toBe("memory");
    });

    it("a healthy snapshot is unchanged: local attempts included, imported attempts excluded", async () => {
      const { store } = createStore();
      const local = makeAttempt({ id: "attempt.local", submittedAt: at(1) });
      await store.addAttempt(local);
      await store.importAttemptIfAbsent(makeAttempt({ id: "attempt.imported", submittedAt: at(2) }), "guest-copy");

      expect(await store.getRewardEligibleAttemptsSnapshot()).toEqual([local]);
    });
  });

  // ---------------------------------------------------------------- L
  describe("L. clears remove provenance atomically", () => {
    async function seeded() {
      const context = createStore();
      await context.store.addAttempt(makeAttempt({ id: "attempt.local" }));
      await context.store.importAttemptIfAbsent(makeAttempt({ id: "attempt.imported", submittedAt: at(2) }), "cloud-import");
      await context.store.saveMissionDraft({
        activityId: "activity.test" as never,
        seed: "seed",
        variantIndex: 0,
        code: "x = 1",
        hintsUsed: [],
        updatedAt: "2026-10-03T12:01:00.000Z",
      });
      return context;
    }

    it("clearAttempts removes attempts and provenance, keeps drafts, allows re-import", async () => {
      const { factory, store } = await seeded();
      await store.clearAttempts();

      expect(await rawGetAll(factory, GUEST_DB, ATTEMPTS)).toEqual([]);
      expect(await provenanceRows(factory)).toEqual([]);
      expect(await store.getMissionDraft("activity.test" as never)).not.toBeNull();
      expect(
        await store.importAttemptIfAbsent(makeAttempt({ id: "attempt.imported", submittedAt: at(2) }), "guest-copy"),
      ).toEqual({ status: "added" });
    });

    it("clearAll removes attempts, provenance and drafts", async () => {
      const { factory, store } = await seeded();
      await store.clearAll();

      expect(await rawGetAll(factory, GUEST_DB, ATTEMPTS)).toEqual([]);
      expect(await provenanceRows(factory)).toEqual([]);
      expect(await rawGetAll(factory, GUEST_DB, "missionDrafts")).toEqual([]);
    });

    it("clearMissionDrafts leaves attempts and provenance alone", async () => {
      const { factory, store } = await seeded();
      await store.clearMissionDrafts();

      expect(await store.getAttempts()).toHaveLength(2);
      expect(await provenanceRows(factory)).toHaveLength(1);
      expect(ids(await store.getRewardEligibleAttemptsSnapshot())).toEqual(["attempt.local"]);
    });
  });

  // ---------------------------------------------------------------- M
  describe("M. invalid input never reaches storage", () => {
    it("rejects an invalid record, an unknown origin and a payload-supplied origin before opening the database", async () => {
      const factory = idb.createFactory();
      const openSpy = vi.spyOn(factory, "open");
      const { store } = createStore(factory);

      await expect(
        store.importAttemptIfAbsent({ ...makeAttempt(), submissionIndex: 0 } as never, "cloud-import"),
      ).rejects.toBeInstanceOf(InvalidAttemptRecordError);
      await expect(
        store.importAttemptIfAbsent(makeAttempt(), "evil" as never),
      ).rejects.toBeInstanceOf(InvalidImportOriginError);
      await expect(
        store.importAttemptIfAbsent(makeAttempt(), undefined as never),
      ).rejects.toBeInstanceOf(InvalidImportOriginError);
      // Origin cannot ride in on the payload: the schema is strict.
      await expect(
        store.importAttemptIfAbsent({ ...makeAttempt(), origin: "local" } as never, "cloud-import"),
      ).rejects.toBeInstanceOf(InvalidAttemptRecordError);

      expect(openSpy).not.toHaveBeenCalled();
      expect(await factory.databases()).toEqual([]);
    });

    it("leaves existing data untouched after a rejected import", async () => {
      const { factory, store } = createStore();
      const record = makeAttempt();
      await store.importAttemptIfAbsent(record, "cloud-import");

      await expect(
        store.importAttemptIfAbsent({ ...record, id: "attempt.bad", runtimeErrorCount: -1 } as never, "guest-copy"),
      ).rejects.toBeInstanceOf(InvalidAttemptRecordError);

      expect(await store.getAttempts()).toEqual([record]);
      expect(await provenanceRows(factory)).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------- N
  describe("N. imports fail closed without durable storage", () => {
    it("MemoryLearningPersistence validates, then refuses and stores nothing", async () => {
      const memory = new MemoryLearningPersistence();
      await expect(memory.importAttemptIfAbsent(makeAttempt(), "cloud-import")).rejects.toBeInstanceOf(
        ImportRequiresDurableStorageError,
      );
      await expect(
        memory.importAttemptIfAbsent({ ...makeAttempt(), submissionIndex: 0 } as never, "cloud-import"),
      ).rejects.toBeInstanceOf(InvalidAttemptRecordError);
      await expect(memory.importAttemptIfAbsent(makeAttempt(), "evil" as never)).rejects.toBeInstanceOf(
        InvalidImportOriginError,
      );
      expect(await memory.getAttempts()).toEqual([]);
    });

    it("MemoryLearningPersistence snapshot returns detached local attempts", async () => {
      const memory = new MemoryLearningPersistence();
      await memory.addAttempt(makeAttempt());
      const first = await memory.getRewardEligibleAttemptsSnapshot();
      (first[0] as { passed: boolean }).passed = false;
      expect((await memory.getRewardEligibleAttemptsSnapshot())[0]?.passed).toBe(true);
    });

    it("Resilient over unavailable IndexedDB rejects, stores nothing and does not flip failover", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const primary = idb.track(new IndexedDbLearningPersistence(brokenFactory()));
      const resilient = new ResilientLearningPersistence(primary);

      const error = await resilient.importAttemptIfAbsent(makeAttempt(), "cloud-import").then(
        () => null,
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(ImportRequiresDurableStorageError);
      expect((error as ImportRequiresDurableStorageError).cause).toBeInstanceOf(Error);
      expect(resilient.kind).toBe("indexeddb");
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("Resilient that already failed over to memory rejects imports and keeps memory empty", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const primary = idb.track(new IndexedDbLearningPersistence(brokenFactory()));
      const resilient = new ResilientLearningPersistence(primary);
      await resilient.getAttempts(); // genuine storage failure -> one-way failover
      expect(resilient.kind).toBe("memory");

      await expect(resilient.importAttemptIfAbsent(makeAttempt(), "cloud-import")).rejects.toBeInstanceOf(
        ImportRequiresDurableStorageError,
      );
      expect(await resilient.getAttempts()).toEqual([]);
      expect(await resilient.getRewardEligibleAttemptsSnapshot()).toEqual([]);
    });

    it("Resilient surfaces validation errors as-is", async () => {
      const resilient = new ResilientLearningPersistence(
        idb.track(new IndexedDbLearningPersistence(idb.createFactory())),
      );
      await expect(
        resilient.importAttemptIfAbsent({ ...makeAttempt(), submissionIndex: 0 } as never, "cloud-import"),
      ).rejects.toBeInstanceOf(InvalidAttemptRecordError);
      await expect(resilient.importAttemptIfAbsent(makeAttempt(), "evil" as never)).rejects.toBeInstanceOf(
        InvalidImportOriginError,
      );
      expect(resilient.kind).toBe("indexeddb");
    });

    it("Resilient imports normally when IndexedDB is healthy", async () => {
      const { factory, store } = createStore();
      const resilient = new ResilientLearningPersistence(store);
      const result: AddAttemptIfAbsentResult = await resilient.importAttemptIfAbsent(
        makeAttempt(),
        "guest-copy",
      );
      expect(result).toEqual({ status: "added" });
      expect(await provenanceRows(factory)).toHaveLength(1);
      expect(await resilient.getRewardEligibleAttemptsSnapshot()).toEqual([]);
    });

    it("Resilient rethrows a domain error from the primary without failing over", async () => {
      const blocked = new PersistenceUpgradeBlockedError(PersistenceUpgradeFailureReason.BLOCKED);
      const primary = {
        kind: "indexeddb",
        importAttemptIfAbsent: () => Promise.reject(blocked),
      } as unknown as LearningPersistence;
      const resilient = new ResilientLearningPersistence(primary);

      await expect(resilient.importAttemptIfAbsent(makeAttempt(), "cloud-import")).rejects.toBe(blocked);
      expect(resilient.kind).toBe("indexeddb");
    });
  });

  // ---------------------------------------------------------------- O
  describe("O. versionchange and blocked upgrades are never silent", () => {
    it("closes its connection on versionchange so another tab can upgrade (no blocked event)", async () => {
      const { factory, store } = createStore();
      await store.getAttempts();

      const onBlocked = vi.fn();
      const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = factory.open(GUEST_DB, 3);
        request.onupgradeneeded = () => undefined;
        request.onblocked = onBlocked;
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      upgraded.close();

      expect(onBlocked).not.toHaveBeenCalled();
    });

    it("then reports a newer stored schema as a typed error instead of reusing a dead handle", async () => {
      const { factory, store } = createStore();
      await store.getAttempts();
      await new Promise<void>((resolve, reject) => {
        const request = factory.open(GUEST_DB, 3);
        request.onupgradeneeded = () => undefined;
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => reject(request.error);
      });

      const error = await store.getAttempts().then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(PersistenceUpgradeBlockedError);
      expect((error as PersistenceUpgradeBlockedError).reason).toBe(
        PersistenceUpgradeFailureReason.VERSION_NEWER_THAN_CODE,
      );
      expect(error).toBeInstanceOf(PersistenceDomainError);
    });

    it("rejects a database already newer than the code with the same typed error", async () => {
      const factory = idb.createFactory();
      await new Promise<void>((resolve, reject) => {
        const request = factory.open(GUEST_DB, 7);
        request.onupgradeneeded = () => undefined;
        request.onsuccess = () => {
          request.result.close();
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
      const { store } = createStore(factory);

      await expect(store.getAttempts()).rejects.toMatchObject({
        name: "PersistenceUpgradeBlockedError",
        reason: PersistenceUpgradeFailureReason.VERSION_NEWER_THAN_CODE,
      });
    });

    describe("blocked by an old tab that ignores versionchange", () => {
      async function blockedSetup() {
        const factory = idb.createFactory();
        const legacy = makeAttempt({ id: "attempt.legacy" });
        await seedLearningV1Database(factory, GUEST_DB, { attempts: [legacy] });
        const blocker = await openRawConnection(factory, GUEST_DB);
        expect(blocker.version).toBe(1);
        const { store } = createStore(factory);
        return { factory, legacy, blocker, store };
      }

      it("rejects with a typed BLOCKED error instead of hanging or emptying", async () => {
        const { blocker, store } = await blockedSetup();
        try {
          const error = await store.getAttempts().then(
            () => null,
            (caught: unknown) => caught,
          );
          expect(error).toBeInstanceOf(PersistenceUpgradeBlockedError);
          expect((error as PersistenceUpgradeBlockedError).reason).toBe(
            PersistenceUpgradeFailureReason.BLOCKED,
          );
        } finally {
          blocker.close();
        }
      });

      it("keeps rejecting promptly while blocked (no silent hang on a second call) and never writes", async () => {
        const { legacy, blocker, store } = await blockedSetup();
        try {
          for (let round = 0; round < 3; round += 1) {
            await expect(store.getAttempts()).rejects.toBeInstanceOf(PersistenceUpgradeBlockedError);
            await expect(
              store.importAttemptIfAbsent(makeAttempt({ id: "attempt.new" }), "cloud-import"),
            ).rejects.toBeInstanceOf(PersistenceUpgradeBlockedError);
            await expect(store.getRewardEligibleAttemptsSnapshot()).rejects.toBeInstanceOf(
              PersistenceUpgradeBlockedError,
            );
          }
          // The stored v1 data is intact and nothing was imported. (Read through the
          // old connection: a fresh open would queue behind the blocked upgrade.)
          const rows = await new Promise<unknown[]>((resolve, reject) => {
            const request = blocker.transaction(ATTEMPTS, "readonly").objectStore(ATTEMPTS).getAll();
            request.onsuccess = () => resolve(request.result as unknown[]);
            request.onerror = () => reject(request.error);
          });
          expect(rows).toEqual([legacy]);
          expect([...blocker.objectStoreNames]).toEqual(["attempts", "missionDrafts"]);
        } finally {
          blocker.close();
        }
      });

      it("recovers once the old tab closes: the pending upgrade completes and the data is intact", async () => {
        const { factory, legacy, blocker, store } = await blockedSetup();
        await expect(store.getAttempts()).rejects.toBeInstanceOf(PersistenceUpgradeBlockedError);

        blocker.close();

        expect(await untilUnblocked(() => store.getAttempts())).toEqual([legacy]);
        expect((await rawDescribeSchema(factory, GUEST_DB)).version).toBe(2);
        expect(await provenanceRows(factory)).toEqual([]);
        expect(
          await store.importAttemptIfAbsent(makeAttempt({ id: "attempt.new", submittedAt: at(7) }), "cloud-import"),
        ).toEqual({ status: "added" });
      });

      it("the connection opened after the block clears is managed (closes on versionchange, no leak)", async () => {
        const { factory, blocker, store } = await blockedSetup();
        await expect(store.getAttempts()).rejects.toBeInstanceOf(PersistenceUpgradeBlockedError);

        blocker.close();
        await untilUnblocked(() => store.getAttempts());

        // A leaked connection that ignores versionchange would make this open report `blocked`.
        const onBlocked = vi.fn();
        const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = factory.open(GUEST_DB, 3);
          request.onupgradeneeded = () => undefined;
          request.onblocked = onBlocked;
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        upgraded.close();
        expect(onBlocked).not.toHaveBeenCalled();
      });

      it("Resilient keeps surfacing the blocked upgrade and does not become an empty memory store", async () => {
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const { blocker, store } = await blockedSetup();
        const resilient = new ResilientLearningPersistence(store);
        try {
          await expect(resilient.getAttempts()).rejects.toBeInstanceOf(PersistenceUpgradeBlockedError);
          await expect(resilient.getRewardEligibleAttemptsSnapshot()).rejects.toBeInstanceOf(
            PersistenceUpgradeBlockedError,
          );
          await expect(
            resilient.importAttemptIfAbsent(makeAttempt({ id: "attempt.new" }), "cloud-import"),
          ).rejects.toBeInstanceOf(PersistenceUpgradeBlockedError);

          expect(resilient.kind).toBe("indexeddb");
          expect(console.warn).not.toHaveBeenCalled();
        } finally {
          blocker.close();
        }
      });
    });
  });

  // ---------------------------------------------------------------- P
  describe("P. existing behaviour is unchanged on v2", () => {
    it("keeps ordering, duplicate detection, draft handling and invalid-row filtering", async () => {
      const { factory, store } = createStore();
      const late = makeAttempt({ id: "attempt.late", submittedAt: at(30) });
      const early = makeAttempt({ id: "attempt.early", submittedAt: at(1) });
      await store.addAttempt(late);
      await store.addAttempt(early);
      await expect(store.addAttempt(early)).rejects.toBeInstanceOf(DuplicateAttemptError);
      expect(ids(await store.getAttempts())).toEqual(["attempt.early", "attempt.late"]);

      await rawPut(factory, GUEST_DB, ATTEMPTS, { ...makeAttempt({ id: "attempt.bad" }), passed: "yes" });
      expect(ids(await store.getAttempts())).toEqual(["attempt.early", "attempt.late"]);
      expect(ids(await store.getRewardEligibleAttemptsSnapshot())).toEqual(["attempt.early", "attempt.late"]);

      await store.clearAttempts();
      expect(await store.getAttempts()).toEqual([]);
    });

    it("ResilientLearningPersistence still fails over on genuine storage failure", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const resilient = new ResilientLearningPersistence(
        idb.track(new IndexedDbLearningPersistence(brokenFactory())),
      );
      await resilient.addAttempt(makeAttempt());
      expect(resilient.kind).toBe("memory");
      expect(await resilient.getRewardEligibleAttemptsSnapshot()).toEqual([makeAttempt()]);
    });
  });
});
