import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AttemptRecordSchema,
  Difficulty,
  HintLevel,
  LearningStage,
  type LearningActivityId,
} from "../../src/core/domain";
import {
  GUEST_SCOPE,
  IndexedDbLearningPersistence,
  InvalidPersistenceScopeError,
  InvalidPersistenceScopeReason,
  MAX_ACCOUNT_ID_LENGTH,
  MemoryLearningPersistence,
  ResilientLearningPersistence,
  accountScope,
  createBrowserLearningPersistence,
  resolveScopedDatabaseName,
  type MissionDraftRecord,
  type PersistenceScope,
} from "../../src/core/persistence";
import {
  IndexedDbMetaProgressionPersistence,
  MemoryMetaProgressionPersistence,
  RewardReason,
  createBrowserMetaProgressionPersistence,
  createEmptyMetaProgressionState,
  type MetaProgressionState,
} from "../../src/core/meta-progression";
import { ResilientMetaProgressionPersistence } from "../../src/core/meta-progression/resilient-meta-progression-persistence";
import { rawDescribeSchema, rawGetAll, useIsolatedIndexedDb } from "./indexeddb-test-utils";

const GUEST_LEARNING = "python-learn-game";
const GUEST_META = "python-learn-game-meta";

function makeAttempt(id: string, overrides: Record<string, unknown> = {}) {
  return AttemptRecordSchema.parse({
    id,
    activityId: "activity.test",
    missionTemplateId: "template.test",
    missionTemplateVersion: 1,
    seed: "seed",
    difficulty: Difficulty.EASY,
    conceptIds: ["concept.a"],
    learningStage: LearningStage.GUIDED,
    startedAt: "2026-10-03T11:59:00.000Z",
    submittedAt: "2026-10-03T12:00:00.000Z",
    passed: true,
    submissionIndex: 1,
    runCountBeforeSubmit: 0,
    hintsUsed: [HintLevel.H1],
    runtimeErrorCount: 0,
    ...overrides,
  });
}

function makeDraft(code: string): MissionDraftRecord {
  return {
    activityId: "activity.test" as LearningActivityId,
    seed: "seed.variant.1",
    variantIndex: 1,
    code,
    hintsUsed: [HintLevel.H1],
    updatedAt: "2026-10-03T12:01:00.000Z",
  };
}

function makeMetaState(tag: string, metal: number): MetaProgressionState {
  return {
    ...createEmptyMetaProgressionState(),
    inventory: { metal_plate: metal, circuit_board: 0, energy_cell: 0 },
    processedAttemptIds: [`attempt.${tag}`],
    rewardedActivityIds: [`activity.${tag}`],
    rewardHistory: [
      {
        id: `reward.${tag}`,
        reason: RewardReason.FIRST_ACTIVITY_PASS,
        items: { metal_plate: metal, circuit_board: 0, energy_cell: 0 },
        awardedAt: "2026-10-03T10:00:00.000Z",
        sourceAttemptId: `attempt.${tag}`,
        sourceActivityId: `activity.${tag}`,
      },
    ],
  };
}

async function databaseNames(factory: IDBFactory): Promise<string[]> {
  return (await factory.databases()).map((info) => info.name ?? "").sort();
}

/** A factory whose every open() fails, to model unavailable storage. */
function brokenFactory(): IDBFactory {
  return {
    open() {
      throw new Error("storage unavailable");
    },
  } as unknown as IDBFactory;
}

const LEARNING_V1_LAYOUT = {
  version: 1,
  stores: {
    attempts: {
      keyPath: "id",
      indexes: {
        activityId: { keyPath: "activityId", unique: false, multiEntry: false },
        submittedAt: { keyPath: "submittedAt", unique: false, multiEntry: false },
        conceptIds: { keyPath: "conceptIds", unique: false, multiEntry: true },
      },
    },
    missionDrafts: { keyPath: "activityId", indexes: {} },
  },
};

const META_V1_LAYOUT = {
  version: 1,
  stores: { progressionState: { keyPath: "key", indexes: {} } },
};

/**
 * Creates a pre-existing Guest database exactly as a build from before this
 * phase would have (independent of the classes under test).
 */
async function seedLegacyDatabase(
  factory: IDBFactory,
  name: string,
  setup: (database: IDBDatabase) => void,
  storeName: string,
  value: unknown,
): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => setup(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(value);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("scope-to-database-name rule", () => {
  it("keeps the exact legacy Guest database names", () => {
    expect(resolveScopedDatabaseName("python-learn-game", GUEST_SCOPE)).toBe("python-learn-game");
    expect(resolveScopedDatabaseName("python-learn-game-meta", GUEST_SCOPE)).toBe(
      "python-learn-game-meta",
    );
  });

  it("maps an account to <base>:account:<encodeURIComponent(id)> for both families", () => {
    const scope = accountScope("acct-123");
    expect(resolveScopedDatabaseName(GUEST_LEARNING, scope)).toBe(
      "python-learn-game:account:acct-123",
    );
    expect(resolveScopedDatabaseName(GUEST_META, scope)).toBe(
      "python-learn-game-meta:account:acct-123",
    );
    expect(resolveScopedDatabaseName(GUEST_LEARNING, accountScope("acct:x"))).toBe(
      "python-learn-game:account:acct%3Ax",
    );
    expect(resolveScopedDatabaseName(GUEST_LEARNING, accountScope("a/b"))).toBe(
      "python-learn-game:account:a%2Fb",
    );
  });

  it("is deterministic across calls and across scope objects", () => {
    const first = resolveScopedDatabaseName(GUEST_LEARNING, accountScope("acct-1"));
    const second = resolveScopedDatabaseName(GUEST_LEARNING, {
      kind: "account",
      accountId: "acct-1",
    });
    expect(second).toBe(first);
  });

  it("gives every distinct id a distinct name (case, specials, unicode forms, lookalikes)", () => {
    const ids = [
      "a",
      "A",
      "a%",
      "a%25",
      "%41",
      "a:b",
      "a:account:b",
      "a/b",
      "a?b",
      "a#b",
      "a.b",
      "a_b",
      "a-b",
      "a b",
      "é", // é precomposed
      "é", // e + combining accent: looks identical, must stay a different id
      "guest",
      "python-learn-game",
      "python-learn-game-meta",
      "日本語",
      "😀",
    ];
    const learning = ids.map((id) => resolveScopedDatabaseName(GUEST_LEARNING, accountScope(id)));
    const meta = ids.map((id) => resolveScopedDatabaseName(GUEST_META, accountScope(id)));

    const all = [GUEST_LEARNING, GUEST_META, ...learning, ...meta];
    expect(new Set(all).size).toBe(all.length);
    // Raw ids are never used as names; every account name carries the marker.
    for (const name of [...learning, ...meta]) expect(name).toContain(":account:");
  });

  it("accepts an id of exactly the maximum length", () => {
    expect(() => accountScope("x".repeat(MAX_ACCOUNT_ID_LENGTH))).not.toThrow();
  });
});

describe("invalid scopes fail explicitly", () => {
  const INVALID_IDS: ReadonlyArray<[string, unknown, InvalidPersistenceScopeReason]> = [
    ["empty", "", InvalidPersistenceScopeReason.ACCOUNT_ID_EMPTY],
    ["leading space", " a", InvalidPersistenceScopeReason.ACCOUNT_ID_SURROUNDING_WHITESPACE],
    ["trailing space", "a ", InvalidPersistenceScopeReason.ACCOUNT_ID_SURROUNDING_WHITESPACE],
    ["whitespace only", "\t", InvalidPersistenceScopeReason.ACCOUNT_ID_SURROUNDING_WHITESPACE],
    ["newline", "a\nb", InvalidPersistenceScopeReason.ACCOUNT_ID_CONTROL_CHARACTER],
    ["NUL", "a\u0000b", InvalidPersistenceScopeReason.ACCOUNT_ID_CONTROL_CHARACTER],
    ["email address", "user@example.com", InvalidPersistenceScopeReason.ACCOUNT_ID_LOOKS_LIKE_EMAIL],
    ["too long", "x".repeat(MAX_ACCOUNT_ID_LENGTH + 1), InvalidPersistenceScopeReason.ACCOUNT_ID_TOO_LONG],
    ["lone surrogate", "\ud800", InvalidPersistenceScopeReason.ACCOUNT_ID_MALFORMED_UNICODE],
    ["null", null, InvalidPersistenceScopeReason.ACCOUNT_ID_NOT_STRING],
    ["undefined", undefined, InvalidPersistenceScopeReason.ACCOUNT_ID_NOT_STRING],
    ["number", 42, InvalidPersistenceScopeReason.ACCOUNT_ID_NOT_STRING],
    ["object", {}, InvalidPersistenceScopeReason.ACCOUNT_ID_NOT_STRING],
  ];

  it.each(INVALID_IDS)("rejects account id: %s", (_label, accountId, reason) => {
    expect(() => accountScope(accountId as string)).toThrow(InvalidPersistenceScopeError);
    try {
      resolveScopedDatabaseName(GUEST_LEARNING, { kind: "account", accountId });
      expect.unreachable("resolveScopedDatabaseName should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidPersistenceScopeError);
      expect((error as InvalidPersistenceScopeError).reason).toBe(reason);
    }
  });

  const INVALID_SCOPES: ReadonlyArray<[string, unknown, InvalidPersistenceScopeReason]> = [
    ["null", null, InvalidPersistenceScopeReason.NOT_AN_OBJECT],
    ["undefined", undefined, InvalidPersistenceScopeReason.NOT_AN_OBJECT],
    ["string", "guest", InvalidPersistenceScopeReason.NOT_AN_OBJECT],
    ["array", [], InvalidPersistenceScopeReason.NOT_AN_OBJECT],
    ["empty object", {}, InvalidPersistenceScopeReason.UNKNOWN_KIND],
    ["wrong-case kind", { kind: "Guest" }, InvalidPersistenceScopeReason.UNKNOWN_KIND],
    ["account without id", { kind: "account" }, InvalidPersistenceScopeReason.ACCOUNT_ID_NOT_STRING],
    [
      "guest carrying an account id",
      { kind: "guest", accountId: "acct-1" },
      InvalidPersistenceScopeReason.GUEST_WITH_ACCOUNT_ID,
    ],
  ];

  it.each(INVALID_SCOPES)("rejects scope: %s", (_label, scope, reason) => {
    try {
      resolveScopedDatabaseName(GUEST_LEARNING, scope);
      expect.unreachable("resolveScopedDatabaseName should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidPersistenceScopeError);
      expect((error as InvalidPersistenceScopeError).reason).toBe(reason);
    }
  });

  it("never echoes the rejected account id in the error", () => {
    try {
      accountScope("user@example.com");
      expect.unreachable("accountScope should have thrown");
    } catch (error) {
      expect((error as Error).message).not.toContain("example");
    }
  });
});

describe("IndexedDB persistence scopes (fake-indexeddb)", () => {
  const idb = useIsolatedIndexedDb();

  const scopeA = accountScope("acct-A");
  const scopeB = accountScope("acct-B");

  function learning(factory: IDBFactory, scope?: PersistenceScope) {
    return idb.track(new IndexedDbLearningPersistence(factory, scope));
  }
  function meta(factory: IDBFactory, scope?: PersistenceScope) {
    return idb.track(new IndexedDbMetaProgressionPersistence(factory, scope));
  }

  describe("Guest default and backward compatibility", () => {
    it("zero/one-argument constructors resolve the exact legacy Guest names", () => {
      const factory = idb.createFactory();
      expect(learning(factory).databaseName).toBe(GUEST_LEARNING);
      expect(learning(factory, GUEST_SCOPE).databaseName).toBe(GUEST_LEARNING);
      expect(learning(factory, undefined).databaseName).toBe(GUEST_LEARNING);
      expect(meta(factory).databaseName).toBe(GUEST_META);
      expect(meta(factory, GUEST_SCOPE).databaseName).toBe(GUEST_META);
    });

    it("opens only the legacy Guest databases when no scope is given", async () => {
      const factory = idb.createFactory();
      await learning(factory).addAttempt(makeAttempt("attempt.guest"));
      await meta(factory).saveState(makeMetaState("guest", 5));
      expect(await databaseNames(factory)).toEqual([GUEST_LEARNING, GUEST_META].sort());
    });

    it("default constructors read pre-existing Guest data", async () => {
      const factory = idb.createFactory();
      const attempt = makeAttempt("attempt.legacy");
      const state = makeMetaState("legacy", 9);

      await seedLegacyDatabase(
        factory,
        GUEST_LEARNING,
        (database) => {
          const attempts = database.createObjectStore("attempts", { keyPath: "id" });
          attempts.createIndex("activityId", "activityId", { unique: false });
          attempts.createIndex("submittedAt", "submittedAt", { unique: false });
          attempts.createIndex("conceptIds", "conceptIds", { unique: false, multiEntry: true });
          database.createObjectStore("missionDrafts", { keyPath: "activityId" });
        },
        "attempts",
        attempt,
      );
      await seedLegacyDatabase(
        factory,
        GUEST_META,
        (database) => {
          database.createObjectStore("progressionState", { keyPath: "key" });
        },
        "progressionState",
        { key: "primary", state },
      );

      expect(await learning(factory).getAttempts()).toEqual([attempt]);
      expect(await learning(factory, GUEST_SCOPE).getAttempts()).toEqual([attempt]);
      expect(await meta(factory).loadState()).toEqual(state);
      expect(await meta(factory, GUEST_SCOPE).loadState()).toEqual(state);

      // Account scopes do not see it, and the legacy rows are untouched.
      expect(await learning(factory, scopeA).getAttempts()).toEqual([]);
      expect(await meta(factory, scopeA).loadState()).toBeNull();
      expect(await rawGetAll(factory, GUEST_LEARNING, "attempts")).toHaveLength(1);
      expect(await rawGetAll(factory, GUEST_META, "progressionState")).toHaveLength(1);
    });
  });

  describe("schema versions are unchanged", () => {
    it("Guest and account databases all use version 1 with the original layout", async () => {
      const factory = idb.createFactory();
      for (const scope of [GUEST_SCOPE, scopeA, scopeB]) {
        const learningStore = learning(factory, scope);
        const metaStore = meta(factory, scope);
        await learningStore.getAttempts();
        await metaStore.loadState();

        expect(await rawDescribeSchema(factory, learningStore.databaseName)).toEqual(
          LEARNING_V1_LAYOUT,
        );
        expect(await rawDescribeSchema(factory, metaStore.databaseName)).toEqual(META_V1_LAYOUT);
      }
    });
  });

  describe("distinct databases per scope", () => {
    it("gives Guest, A and B distinct learning and meta databases that share one scope", async () => {
      const factory = idb.createFactory();
      const scopes = [GUEST_SCOPE, scopeA, scopeB];
      const learningNames = scopes.map((scope) => learning(factory, scope).databaseName);
      const metaNames = scopes.map((scope) => meta(factory, scope).databaseName);

      expect(new Set(learningNames).size).toBe(3);
      expect(new Set(metaNames).size).toBe(3);
      expect(learningNames).toEqual([
        "python-learn-game",
        "python-learn-game:account:acct-A",
        "python-learn-game:account:acct-B",
      ]);
      expect(metaNames).toEqual([
        "python-learn-game-meta",
        "python-learn-game-meta:account:acct-A",
        "python-learn-game-meta:account:acct-B",
      ]);
      // Same scope => same account suffix for both families.
      expect(learningNames.map((name) => name.slice(GUEST_LEARNING.length))).toEqual(
        metaNames.map((name) => name.slice(GUEST_META.length)),
      );
    });

    it("creates exactly six databases once Guest, A and B have all been used", async () => {
      const factory = idb.createFactory();
      for (const scope of [GUEST_SCOPE, scopeA, scopeB]) {
        await learning(factory, scope).getAttempts();
        await meta(factory, scope).loadState();
      }
      expect(await databaseNames(factory)).toEqual(
        [
          GUEST_LEARNING,
          GUEST_META,
          "python-learn-game:account:acct-A",
          "python-learn-game-meta:account:acct-A",
          "python-learn-game:account:acct-B",
          "python-learn-game-meta:account:acct-B",
        ].sort(),
      );
    });
  });

  describe("Guest/A/B isolation", () => {
    it("isolates attempts and drafts, including identical ids and activity ids", async () => {
      const factory = idb.createFactory();
      const guest = learning(factory);
      const a = learning(factory, scopeA);
      const b = learning(factory, scopeB);

      const guestOnly = makeAttempt("attempt.guest");
      const aOnly = makeAttempt("attempt.a");
      const bOnly = makeAttempt("attempt.b");
      // The same attempt id may exist in different scopes with different content.
      const sharedA = makeAttempt("attempt.shared", { passed: true });
      const sharedB = makeAttempt("attempt.shared", { passed: false });

      await guest.addAttempt(guestOnly);
      await a.addAttempt(aOnly);
      await a.addAttempt(sharedA);
      await b.addAttempt(bOnly);
      await b.addAttempt(sharedB);

      await guest.saveMissionDraft(makeDraft("guest code"));
      await a.saveMissionDraft(makeDraft("A code"));
      await b.saveMissionDraft(makeDraft("B code"));

      const idsOf = async (store: IndexedDbLearningPersistence) =>
        (await store.getAttempts()).map((attempt) => String(attempt.id)).sort();
      expect(await idsOf(guest)).toEqual(["attempt.guest"]);
      expect(await idsOf(a)).toEqual(["attempt.a", "attempt.shared"]);
      expect(await idsOf(b)).toEqual(["attempt.b", "attempt.shared"]);
      expect((await a.getAttempts()).find((x) => x.id === "attempt.shared")?.passed).toBe(true);
      expect((await b.getAttempts()).find((x) => x.id === "attempt.shared")?.passed).toBe(false);

      const activity = "activity.test" as LearningActivityId;
      expect((await guest.getMissionDraft(activity))?.code).toBe("guest code");
      expect((await a.getMissionDraft(activity))?.code).toBe("A code");
      expect((await b.getMissionDraft(activity))?.code).toBe("B code");
    });

    it("clearing one scope leaves the others intact", async () => {
      const factory = idb.createFactory();
      const guest = learning(factory);
      const a = learning(factory, scopeA);
      const b = learning(factory, scopeB);
      await guest.addAttempt(makeAttempt("attempt.guest"));
      await a.addAttempt(makeAttempt("attempt.a"));
      await b.addAttempt(makeAttempt("attempt.b"));
      await a.saveMissionDraft(makeDraft("A code"));
      await b.saveMissionDraft(makeDraft("B code"));

      await a.clearAll();

      expect(await a.getAttempts()).toEqual([]);
      expect(await a.getMissionDraft("activity.test" as LearningActivityId)).toBeNull();
      expect(await guest.getAttempts()).toHaveLength(1);
      expect(await b.getAttempts()).toHaveLength(1);
      expect((await b.getMissionDraft("activity.test" as LearningActivityId))?.code).toBe("B code");
    });

    it("isolates meta-progression inventory and rewards", async () => {
      const factory = idb.createFactory();
      const guest = meta(factory);
      const a = meta(factory, scopeA);
      const b = meta(factory, scopeB);

      const guestState = makeMetaState("guest", 1);
      const aState = makeMetaState("a", 20);
      const bState = makeMetaState("b", 300);
      await guest.saveState(guestState);
      await a.saveState(aState);
      await b.saveState(bState);

      expect(await guest.loadState()).toEqual(guestState);
      expect(await a.loadState()).toEqual(aState);
      expect(await b.loadState()).toEqual(bState);
      expect((await a.loadState())?.inventory.metal_plate).toBe(20);
      expect((await b.loadState())?.rewardedActivityIds).toEqual(["activity.b"]);

      await a.clear();
      expect(await a.loadState()).toBeNull();
      expect(await guest.loadState()).toEqual(guestState);
      expect(await b.loadState()).toEqual(bState);
    });

    it("keeps raw rows of each database separate (storage-level evidence)", async () => {
      const factory = idb.createFactory();
      await learning(factory).addAttempt(makeAttempt("attempt.guest"));
      await learning(factory, scopeA).addAttempt(makeAttempt("attempt.a"));
      await learning(factory, scopeB).addAttempt(makeAttempt("attempt.b"));

      const idsIn = async (name: string) =>
        ((await rawGetAll(factory, name, "attempts")) as Array<{ id: string }>).map((row) => row.id);
      expect(await idsIn(GUEST_LEARNING)).toEqual(["attempt.guest"]);
      expect(await idsIn("python-learn-game:account:acct-A")).toEqual(["attempt.a"]);
      expect(await idsIn("python-learn-game:account:acct-B")).toEqual(["attempt.b"]);
    });
  });

  describe("reopening and switching", () => {
    it("reopening the same account scope (even with a new scope object) retains data", async () => {
      const factory = idb.createFactory();
      const first = learning(factory, accountScope("acct-A"));
      const firstMeta = meta(factory, accountScope("acct-A"));
      await first.addAttempt(makeAttempt("attempt.a"));
      await first.saveMissionDraft(makeDraft("A code"));
      await firstMeta.saveState(makeMetaState("a", 7));
      await idb.close(first);
      await idb.close(firstMeta);

      const second = learning(factory, accountScope("acct-A"));
      const secondMeta = meta(factory, accountScope("acct-A"));
      expect((await second.getAttempts()).map((x) => x.id)).toEqual(["attempt.a"]);
      expect((await second.getMissionDraft("activity.test" as LearningActivityId))?.code).toBe("A code");
      expect(await secondMeta.loadState()).toEqual(makeMetaState("a", 7));
    });

    it("switching between persistence instances neither copies nor deletes data", async () => {
      const factory = idb.createFactory();
      const guest = learning(factory);
      const guestMeta = meta(factory);
      await guest.addAttempt(makeAttempt("attempt.guest"));
      await guestMeta.saveState(makeMetaState("guest", 1));

      // Switch to A: starts empty (nothing copied from Guest) and writes its own data.
      const a = learning(factory, scopeA);
      const aMeta = meta(factory, scopeA);
      expect(await a.getAttempts()).toEqual([]);
      expect(await aMeta.loadState()).toBeNull();
      await a.addAttempt(makeAttempt("attempt.a"));
      await aMeta.saveState(makeMetaState("a", 2));

      // Switch to B and back through Guest and A.
      const b = learning(factory, scopeB);
      expect(await b.getAttempts()).toEqual([]);
      expect((await learning(factory).getAttempts()).map((x) => x.id)).toEqual(["attempt.guest"]);
      expect((await learning(factory, scopeA).getAttempts()).map((x) => x.id)).toEqual(["attempt.a"]);
      expect(await meta(factory).loadState()).toEqual(makeMetaState("guest", 1));
      expect(await meta(factory, scopeA).loadState()).toEqual(makeMetaState("a", 2));
      expect(await meta(factory, scopeB).loadState()).toBeNull();

      // Raw check: Guest rows are exactly what was written; nothing leaked or vanished.
      expect(await rawGetAll(factory, GUEST_LEARNING, "attempts")).toHaveLength(1);
      expect(await rawGetAll(factory, "python-learn-game:account:acct-A", "attempts")).toHaveLength(1);
      expect(await rawGetAll(factory, "python-learn-game:account:acct-B", "attempts")).toHaveLength(0);
    });
  });

  describe("accidental collisions", () => {
    it("case differences and special characters never share a database", async () => {
      const factory = idb.createFactory();
      const ids = ["Acct", "acct", "ACCT", "acct%", "acct%25", "acct:x", "acct/x", "acct.x", "acct x", "ａcct"];
      for (const id of ids) {
        const scope = accountScope(id);
        await learning(factory, scope).addAttempt(makeAttempt(`attempt.${id}`));
        await meta(factory, scope).saveState(makeMetaState("x", ids.indexOf(id) + 1));
      }
      for (const id of ids) {
        const scope = accountScope(id);
        const attempts = await learning(factory, scope).getAttempts();
        expect(attempts.map((x) => x.id)).toEqual([`attempt.${id}`]);
        expect((await meta(factory, scope).loadState())?.inventory.metal_plate).toBe(
          ids.indexOf(id) + 1,
        );
      }
      expect((await databaseNames(factory)).length).toBe(ids.length * 2);
    });
  });

  describe("invalid scopes never open Guest", () => {
    it.each([
      ["null", null],
      ["empty object", {}],
      ["account without id", { kind: "account" }],
      ["account with email id", { kind: "account", accountId: "user@example.com" }],
      ["guest carrying an account id", { kind: "guest", accountId: "acct-A" }],
    ])("constructors throw for %s and open nothing", async (_label, scope) => {
      const factory = idb.createFactory();
      expect(() => new IndexedDbLearningPersistence(factory, scope as never)).toThrow(
        InvalidPersistenceScopeError,
      );
      expect(() => new IndexedDbMetaProgressionPersistence(factory, scope as never)).toThrow(
        InvalidPersistenceScopeError,
      );
      expect(await databaseNames(factory)).toEqual([]);
    });
  });

  describe("browser factories", () => {
    it("default to Guest and select the requested account scope", async () => {
      const factory = idb.createFactory();
      vi.stubGlobal("indexedDB", factory);

      const guestLearning = createBrowserLearningPersistence();
      const guestMeta = createBrowserMetaProgressionPersistence();
      await guestLearning.addAttempt(makeAttempt("attempt.guest"));
      await guestMeta.saveState(makeMetaState("guest", 1));
      expect(await databaseNames(factory)).toEqual([GUEST_LEARNING, GUEST_META].sort());

      const aLearning = createBrowserLearningPersistence(scopeA);
      const aMeta = createBrowserMetaProgressionPersistence(scopeA);
      expect(aLearning.kind).toBe("indexeddb");
      expect(await aLearning.getAttempts()).toEqual([]);
      expect(await aMeta.loadState()).toBeNull();
      await aLearning.addAttempt(makeAttempt("attempt.a"));

      expect((await guestLearning.getAttempts()).map((x) => x.id)).toEqual(["attempt.guest"]);
      expect(await databaseNames(factory)).toEqual(
        [
          GUEST_LEARNING,
          GUEST_META,
          "python-learn-game:account:acct-A",
          "python-learn-game-meta:account:acct-A",
        ].sort(),
      );
    });

    it("reject invalid scopes with and without IndexedDB, never returning Guest storage", () => {
      const factory = idb.createFactory();
      vi.stubGlobal("indexedDB", factory);
      expect(() => createBrowserLearningPersistence({ kind: "account" } as never)).toThrow(
        InvalidPersistenceScopeError,
      );
      expect(() => createBrowserMetaProgressionPersistence(null as never)).toThrow(
        InvalidPersistenceScopeError,
      );

      vi.stubGlobal("indexedDB", undefined);
      expect(() => createBrowserLearningPersistence({ kind: "account" } as never)).toThrow(
        InvalidPersistenceScopeError,
      );
      expect(() => createBrowserMetaProgressionPersistence(null as never)).toThrow(
        InvalidPersistenceScopeError,
      );
    });

    it("without IndexedDB returns independent in-memory stores per instance", async () => {
      vi.stubGlobal("indexedDB", undefined);
      const first = createBrowserLearningPersistence(scopeA);
      const second = createBrowserLearningPersistence(scopeA);
      expect(first).toBeInstanceOf(MemoryLearningPersistence);
      expect(createBrowserMetaProgressionPersistence(scopeA)).toBeInstanceOf(
        MemoryMetaProgressionPersistence,
      );
      await first.addAttempt(makeAttempt("attempt.a"));
      expect(await second.getAttempts()).toEqual([]);
    });
  });

  describe("resilient fallback keeps scope semantics", () => {
    it("learning: a failed-over account wrapper uses its own empty memory and never touches Guest or other scopes", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const healthy = idb.createFactory();
      const guest = learning(healthy);
      await guest.addAttempt(makeAttempt("attempt.guest"));

      const resilientA = new ResilientLearningPersistence(
        new IndexedDbLearningPersistence(brokenFactory(), scopeA),
      );
      const resilientB = new ResilientLearningPersistence(
        new IndexedDbLearningPersistence(brokenFactory(), scopeB),
      );

      // Failover starts empty: no Guest data is imported into the fallback.
      expect(await resilientA.getAttempts()).toEqual([]);
      expect(resilientA.kind).toBe("memory");

      await resilientA.addAttempt(makeAttempt("attempt.a"));
      expect((await resilientA.getAttempts()).map((x) => x.id)).toEqual(["attempt.a"]);
      // Another account's fallback is a separate memory store.
      expect(await resilientB.getAttempts()).toEqual([]);

      // Nothing leaked into real storage; Guest data unchanged; no account DB created.
      expect((await guest.getAttempts()).map((x) => x.id)).toEqual(["attempt.guest"]);
      expect(await databaseNames(healthy)).toEqual([GUEST_LEARNING]);
    });

    it("learning: a healthy account wrapper stays on its scoped IndexedDB database", async () => {
      const factory = idb.createFactory();
      const primary = learning(factory, scopeA);
      const resilient = new ResilientLearningPersistence(primary);
      await resilient.addAttempt(makeAttempt("attempt.a"));
      expect(resilient.kind).toBe("indexeddb");
      expect(await databaseNames(factory)).toEqual(["python-learn-game:account:acct-A"]);
    });

    it("meta: a failed-over account wrapper uses its own empty memory and never touches Guest or other scopes", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const healthy = idb.createFactory();
      const guest = meta(healthy);
      const guestState = makeMetaState("guest", 4);
      await guest.saveState(guestState);

      const resilientA = new ResilientMetaProgressionPersistence(
        new IndexedDbMetaProgressionPersistence(brokenFactory(), scopeA),
      );
      const resilientB = new ResilientMetaProgressionPersistence(
        new IndexedDbMetaProgressionPersistence(brokenFactory(), scopeB),
      );

      expect(await resilientA.loadState()).toBeNull();
      expect(resilientA.kind).toBe("memory");
      await resilientA.saveState(makeMetaState("a", 8));
      expect(await resilientA.loadState()).toEqual(makeMetaState("a", 8));
      expect(await resilientB.loadState()).toBeNull();

      expect(await guest.loadState()).toEqual(guestState);
      expect(await databaseNames(healthy)).toEqual([GUEST_META]);
    });
  });
});
