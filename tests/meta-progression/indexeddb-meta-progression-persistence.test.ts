import { afterEach, describe, expect, it, vi } from "vitest";

import {
  IndexedDbMetaProgressionPersistence,
  RewardReason,
  RobotPartId,
  createEmptyMetaProgressionState,
  type MetaProgressionState,
} from "../../src/core/meta-progression";
import { ResilientMetaProgressionPersistence } from "../../src/core/meta-progression/resilient-meta-progression-persistence";
import {
  rawDescribeSchema,
  rawGetAll,
  rawPut,
  useIsolatedIndexedDb,
} from "../persistence/indexeddb-test-utils";

const DATABASE_NAME = "python-learn-game-meta";
const STORE_NAME = "progressionState";

function makeState(): MetaProgressionState {
  return {
    ...createEmptyMetaProgressionState(),
    inventory: { metal_plate: 22, circuit_board: 13, energy_cell: 2 },
    processedAttemptIds: ["attempt.fail", "attempt.pass"],
    rewardedActivityIds: ["activity.test"],
    focusedRewardedActivityIds: ["activity.test"],
    dailyFirstPassDateKeys: ["2026-10-03"],
    claimedDailyGoalDateKeys: ["2026-10-03"],
    dailyStatsByDate: {
      "2026-10-03": { attempts: 2, passes: 1, focusedPasses: 1 },
    },
    rewardHistory: [
      {
        id: "reward.first.activity.test",
        reason: RewardReason.FIRST_ACTIVITY_PASS,
        items: { metal_plate: 12, circuit_board: 8, energy_cell: 1 },
        awardedAt: "2026-10-03T10:00:00.000Z",
        sourceAttemptId: "attempt.pass",
        sourceActivityId: "activity.test",
      },
    ],
    builtRobotPartIds: [RobotPartId.CHASSIS],
    assembledRobotIds: [],
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("IndexedDbMetaProgressionPersistence (fake-indexeddb)", () => {
  const idb = useIsolatedIndexedDb();

  function createStore(factory = idb.createFactory()) {
    return { factory, store: idb.track(new IndexedDbMetaProgressionPersistence(factory)) };
  }

  it("reports kind indexeddb and loads null when nothing is stored", async () => {
    const { store } = createStore();
    expect(store.kind).toBe("indexeddb");
    expect(await store.loadState()).toBeNull();
  });

  it("persists a valid progression document and restores it equal but not identical", async () => {
    const { store } = createStore();
    const state = makeState();
    await store.saveState(state);

    const loaded = await store.loadState();
    expect(loaded).toEqual(state);
    expect(loaded).not.toBe(state);
  });

  it("restores the document through a fresh persistence instance", async () => {
    const { factory, store } = createStore();
    const state = makeState();
    await store.saveState(state);
    await idb.close(store);

    const reopened = idb.track(new IndexedDbMetaProgressionPersistence(factory));
    expect(await reopened.loadState()).toEqual(state);
  });

  it("keeps a single 'primary' record and overwrites it on save", async () => {
    const { factory, store } = createStore();
    await store.saveState(makeState());
    const next = { ...makeState(), inventory: { metal_plate: 1, circuit_board: 1, energy_cell: 1 } };
    await store.saveState(next);

    expect(await store.loadState()).toEqual(next);
    const rows = await rawGetAll(factory, DATABASE_NAME, STORE_NAME);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "primary" });
  });

  it("refuses to save an invalid document and leaves the previous one intact", async () => {
    const { store } = createStore();
    const good = makeState();
    await store.saveState(good);

    const invalid = { ...good, inventory: { ...good.inventory, metal_plate: -1 } };
    await expect(store.saveState(invalid)).rejects.toThrow();
    expect(await store.loadState()).toEqual(good);
  });

  describe("invalid persisted state falls back to null", () => {
    async function withRaw(value: unknown) {
      const context = createStore();
      await context.store.loadState(); // forces database creation
      await rawPut(context.factory, DATABASE_NAME, STORE_NAME, value);
      return context;
    }

    it("when the state fails MetaProgressionStateSchema (wrong version)", async () => {
      const { store } = await withRaw({ key: "primary", state: { ...makeState(), version: 2 } });
      expect(await store.loadState()).toBeNull();
    });

    it("when the state has an unknown field (strict schema, current behavior)", async () => {
      const { store } = await withRaw({ key: "primary", state: { ...makeState(), accountId: "acc-1" } });
      expect(await store.loadState()).toBeNull();
    });

    it("when the record has no 'state' property", async () => {
      const { store } = await withRaw({ key: "primary" });
      expect(await store.loadState()).toBeNull();
    });

    it("when the state is not an object", async () => {
      const { store } = await withRaw({ key: "primary", state: "corrupted" });
      expect(await store.loadState()).toBeNull();
    });

    it("does not delete the invalid record on read (data stays recoverable)", async () => {
      const { factory, store } = await withRaw({ key: "primary", state: { version: 99 } });
      await store.loadState();
      expect(await rawGetAll(factory, DATABASE_NAME, STORE_NAME)).toHaveLength(1);
    });

    it("is not treated as a storage failure by the resilient wrapper", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const { store } = await withRaw({ key: "primary", state: { version: 99 } });
      const resilient = new ResilientMetaProgressionPersistence(store);

      expect(await resilient.loadState()).toBeNull();
      expect(resilient.kind).toBe("indexeddb");
    });
  });

  describe("clear", () => {
    it("removes the stored document, also for a fresh instance", async () => {
      const { factory, store } = createStore();
      await store.saveState(makeState());
      await store.clear();
      expect(await store.loadState()).toBeNull();
      await idb.close(store);

      const reopened = idb.track(new IndexedDbMetaProgressionPersistence(factory));
      expect(await reopened.loadState()).toBeNull();
    });

    it("is a no-op on an empty database and the store is writable afterwards", async () => {
      const { store } = createStore();
      await expect(store.clear()).resolves.toBeUndefined();
      await store.saveState(makeState());
      expect(await store.loadState()).toEqual(makeState());
    });
  });

  it("keeps database name, version and store layout stable (compatibility contract)", async () => {
    const { factory, store } = createStore();
    await store.loadState();
    expect(await rawDescribeSchema(factory, DATABASE_NAME)).toEqual({
      version: 1,
      stores: { [STORE_NAME]: { keyPath: "key", indexes: {} } },
    });
  });
});
