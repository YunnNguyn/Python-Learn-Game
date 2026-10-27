import { describe, expect, it } from "vitest";

import {
  CHALLENGE_DATABASE_VERSION,
  ChallengeStorageUnavailableError,
  ChallengeStorageUnreadableError,
  IndexedDbChallengePersistence,
  InvalidSubmissionRecordError,
  createBrowserChallengePersistence,
  type SubmissionRecord,
} from "../../src/core/challenge";
import {
  GUEST_DATABASE_BASE_NAMES,
  IndexedDbLearningPersistence,
  InvalidDatabaseBaseNameError,
  InvalidPersistenceScopeError,
  LEARNING_DATABASE_BASE_NAMES,
  PersistenceClosedError,
  PersistenceUpgradeBlockedError,
  accountScope,
} from "../../src/core/persistence";
import { createFlakyIndexedDb } from "../persistence/flaky-indexeddb";
import {
  openRawConnection,
  rawDescribeSchema,
  rawGetAll,
  rawPut,
  useIsolatedIndexedDb,
} from "../persistence/indexeddb-test-utils";

const CHALLENGE_DB = "python-learn-game-challenge";
const SHA = "a".repeat(64);

function record(overrides: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    id: "sub-1",
    challengeId: "house-prices",
    challengeVersion: "1.0.0",
    metric: "mae",
    score: 2.5,
    rowCount: 10,
    submittedAt: "2026-10-27T10:00:00.000Z",
    submissionSha256: SHA,
    ...overrides,
  };
}

async function databaseNames(factory: IDBFactory): Promise<string[]> {
  return (await factory.databases()).map((database) => database.name ?? "").sort();
}

describe("IndexedDbChallengePersistence", () => {
  const idb = useIsolatedIndexedDb();
  const open = (factory: IDBFactory, scope?: Parameters<typeof accountScope>[0]) =>
    idb.track(new IndexedDbChallengePersistence(factory, scope === undefined ? undefined : accountScope(scope)));

  it("uses the dedicated database name and creates schema v1 on first use", async () => {
    const factory = idb.createFactory();
    const store = open(factory);
    expect(store.databaseName).toBe(CHALLENGE_DB);
    expect(GUEST_DATABASE_BASE_NAMES.challenge).toBe(CHALLENGE_DB);
    expect(CHALLENGE_DATABASE_VERSION).toBe(1);
    expect(await databaseNames(factory)).toEqual([]); // lazy: nothing opened yet

    await store.addSubmission(record());
    const schema = await rawDescribeSchema(factory, CHALLENGE_DB);
    expect(schema.version).toBe(1);
    expect(Object.keys(schema.stores)).toEqual(["submissions"]);
    expect(schema.stores.submissions!.keyPath).toBe("id");
    expect(schema.stores.submissions!.indexes).toEqual({
      byChallengeVersion: { keyPath: ["challengeId", "challengeVersion"], unique: false, multiEntry: false },
    });
  });

  it("keeps submissions readable after the database is closed and reopened", async () => {
    const factory = idb.createFactory();
    const first = open(factory);
    await first.addSubmission(record({ id: "a" }));
    await first.addSubmission(record({ id: "b", score: 1 }));
    await first.close();

    const second = open(factory);
    const rows = await second.listSubmissions("house-prices", "1.0.0");
    expect(rows.map((row) => row.id).sort()).toEqual(["a", "b"]);
    expect(rows.find((row) => row.id === "b")).toEqual(record({ id: "b", score: 1 }));
  });

  it("stores exactly the record fields: no CSV, no labels", async () => {
    const factory = idb.createFactory();
    await open(factory).addSubmission(record());
    const rows = await rawGetAll(factory, CHALLENGE_DB, "submissions");
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0] as object).sort()).toEqual(
      ["challengeId", "challengeVersion", "id", "metric", "rowCount", "score", "submissionSha256", "submittedAt"],
    );
  });

  it("queries by challenge id AND version", async () => {
    const factory = idb.createFactory();
    const store = open(factory);
    await store.addSubmission(record({ id: "a" }));
    await store.addSubmission(record({ id: "b", challengeVersion: "2.0.0" }));
    await store.addSubmission(record({ id: "c", challengeId: "other" }));
    expect((await store.listSubmissions("house-prices", "1.0.0")).map((row) => row.id)).toEqual(["a"]);
    expect((await store.listSubmissions("house-prices", "2.0.0")).map((row) => row.id)).toEqual(["b"]);
    expect(await store.listSubmissions("house-prices", "3.0.0")).toEqual([]);
  });

  it("never overwrites an existing id", async () => {
    const factory = idb.createFactory();
    const store = open(factory);
    await store.addSubmission(record({ score: 1 }));
    await expect(store.addSubmission(record({ score: 99 }))).rejects.toBeDefined();
    expect((await store.listSubmissions("house-prices", "1.0.0"))[0]!.score).toBe(1);
  });

  it("rejects an invalid record before touching storage", async () => {
    const factory = idb.createFactory();
    const store = open(factory);
    for (const bad of [
      record({ score: Number.NaN }),
      record({ metric: "accuracy", score: 1.5 }),
      record({ score: -1 }),
      record({ submissionSha256: "xyz" }),
      record({ rowCount: 0 }),
      record({ submittedAt: "yesterday" }),
      { ...record(), csv: "id,price" } as unknown as SubmissionRecord,
    ]) {
      await expect(store.addSubmission(bad)).rejects.toBeInstanceOf(InvalidSubmissionRecordError);
    }
    expect(await databaseNames(factory)).toEqual([]);
  });

  it("isolates Guest and account scopes", async () => {
    const factory = idb.createFactory();
    const guest = open(factory);
    const a = open(factory, "acct-A");
    const b = open(factory, "acct-B");
    await guest.addSubmission(record({ id: "g" }));
    await a.addSubmission(record({ id: "a" }));
    expect(a.databaseName).toBe(`${CHALLENGE_DB}:account:acct-A`);
    expect((await guest.listSubmissions("house-prices", "1.0.0")).map((row) => row.id)).toEqual(["g"]);
    expect((await a.listSubmissions("house-prices", "1.0.0")).map((row) => row.id)).toEqual(["a"]);
    expect(await b.listSubmissions("house-prices", "1.0.0")).toEqual([]);
  });

  it("does not add the challenge name to the Learning/Practice family and cannot be opened by it", () => {
    expect(LEARNING_DATABASE_BASE_NAMES).not.toContain(CHALLENGE_DB);
    const factory = idb.createFactory();
    expect(
      () => new IndexedDbLearningPersistence(factory, undefined, { databaseBaseName: CHALLENGE_DB as never }),
    ).toThrow(InvalidDatabaseBaseNameError);
  });

  it("leaves the Learning and Practice databases untouched", async () => {
    const factory = idb.createFactory();
    const learning = idb.track(new IndexedDbLearningPersistence(factory));
    const practice = idb.track(
      new IndexedDbLearningPersistence(factory, undefined, { databaseBaseName: GUEST_DATABASE_BASE_NAMES.practice }),
    );
    await learning.getAttempts();
    await practice.getAttempts();
    const before = {
      learning: await rawDescribeSchema(factory, GUEST_DATABASE_BASE_NAMES.learning),
      practice: await rawDescribeSchema(factory, GUEST_DATABASE_BASE_NAMES.practice),
    };
    expect([before.learning.version, before.practice.version]).toEqual([2, 3]);

    const store = open(factory);
    await store.addSubmission(record());
    await store.listSubmissions("house-prices", "1.0.0");

    expect(await databaseNames(factory)).toEqual(
      [CHALLENGE_DB, GUEST_DATABASE_BASE_NAMES.learning, GUEST_DATABASE_BASE_NAMES.practice].sort(),
    );
    expect(await rawDescribeSchema(factory, GUEST_DATABASE_BASE_NAMES.learning)).toEqual(before.learning);
    expect(await rawDescribeSchema(factory, GUEST_DATABASE_BASE_NAMES.practice)).toEqual(before.practice);
    expect(await rawGetAll(factory, GUEST_DATABASE_BASE_NAMES.learning, "attempts")).toEqual([]);
    expect(await rawGetAll(factory, GUEST_DATABASE_BASE_NAMES.practice, "attempts")).toEqual([]);
  });

  it("never opens a connection after close()", async () => {
    const factory = idb.createFactory();
    const store = open(factory);
    await store.close();
    expect(store.getCloseState()).toBe("closed");
    await expect(store.addSubmission(record())).rejects.toBeInstanceOf(PersistenceClosedError);
    await expect(store.listSubmissions("house-prices", "1.0.0")).rejects.toBeInstanceOf(PersistenceClosedError);
    expect(await databaseNames(factory)).toEqual([]);
  });

  it("reports a stored schema newer than the code as a blocked upgrade, without touching it", async () => {
    const factory = idb.createFactory();
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(CHALLENGE_DB, 2);
      request.onupgradeneeded = () => request.result.createObjectStore("future", { keyPath: "id" });
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    const store = open(factory);
    await expect(store.addSubmission(record())).rejects.toBeInstanceOf(PersistenceUpgradeBlockedError);
    expect((await rawDescribeSchema(factory, CHALLENGE_DB)).version).toBe(2);
  });

  it("reports unreadable rows and a missing store instead of an empty history", async () => {
    const factory = idb.createFactory();
    const damaged = open(factory);
    await damaged.addSubmission(record());
    await rawPut(factory, CHALLENGE_DB, "submissions", {
      id: "bad",
      challengeId: "house-prices",
      challengeVersion: "1.0.0",
      score: "oops",
    });
    await expect(damaged.listSubmissions("house-prices", "1.0.0")).rejects.toBeInstanceOf(ChallengeStorageUnreadableError);

    const emptyFactory = idb.createFactory();
    (await openRawConnection(emptyFactory, CHALLENGE_DB, 1)).close(); // v1 with no stores
    const missingStore = open(emptyFactory);
    await expect(missingStore.listSubmissions("a", "1")).rejects.toBeInstanceOf(ChallengeStorageUnreadableError);
    await expect(missingStore.addSubmission(record())).rejects.toBeInstanceOf(ChallengeStorageUnreadableError);
  });

  it("surfaces a failing write and stores nothing", async () => {
    const flaky = createFlakyIndexedDb(idb.createFactory());
    const store = idb.track(new IndexedDbChallengePersistence(flaky.factory));
    await store.addSubmission(record({ id: "ok" }));
    flaky.failStores("submissions");
    await expect(store.addSubmission(record({ id: "lost" }))).rejects.toBeDefined();
    flaky.heal();
    expect((await store.listSubmissions("house-prices", "1.0.0")).map((row) => row.id)).toEqual(["ok"]);
    expect(flaky.refused()).toBeGreaterThan(0);
  });
});

describe("createBrowserChallengePersistence", () => {
  it("fails closed without IndexedDB: every operation rejects, nothing is kept in memory", async () => {
    expect(typeof indexedDB).toBe("undefined");
    const store = createBrowserChallengePersistence();
    expect(store.kind).toBe("indexeddb");
    await expect(store.addSubmission(record())).rejects.toBeInstanceOf(ChallengeStorageUnavailableError);
    await expect(store.listSubmissions("house-prices", "1.0.0")).rejects.toBeInstanceOf(ChallengeStorageUnavailableError);
    await store.close();
    expect(store.getCloseState()).toBe("closed");
  });

  it("validates the scope even where IndexedDB is missing", () => {
    expect(() => createBrowserChallengePersistence({ kind: "account", accountId: "" })).toThrow(
      InvalidPersistenceScopeError,
    );
  });
});
