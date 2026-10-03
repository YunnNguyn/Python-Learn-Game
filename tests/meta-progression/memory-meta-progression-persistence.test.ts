import { describe, expect, it } from "vitest";

import {
  MemoryMetaProgressionPersistence,
  createEmptyMetaProgressionState,
} from "../../src/core/meta-progression";

describe("MemoryMetaProgressionPersistence", () => {
  it("stores snapshots by value and can clear them", async () => {
    const store = new MemoryMetaProgressionPersistence();
    const state = {
      ...createEmptyMetaProgressionState(),
      inventory: {
        metal_plate: 7,
        circuit_board: 3,
        energy_cell: 1,
      },
    };

    await store.saveState(state);
    const first = await store.loadState();
    expect(first).toEqual(state);
    expect(first).not.toBe(state);

    await store.clear();
    expect(await store.loadState()).toBeNull();
  });
});
