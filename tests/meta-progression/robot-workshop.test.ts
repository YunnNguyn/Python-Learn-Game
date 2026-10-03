import { describe, expect, it } from "vitest";

import {
  MetaProgressionEngine,
  MemoryMetaProgressionPersistence,
  RobotId,
  STARTER_ROBOT_BLUEPRINT,
  createEmptyMetaProgressionState,
} from "../../src/core/meta-progression";

describe("Robot Workshop", () => {
  it("spends persisted inventory, builds every part once, then assembles Scout-01", async () => {
    const store = new MemoryMetaProgressionPersistence();
    await store.saveState({
      ...createEmptyMetaProgressionState(),
      inventory: {
        metal_plate: 26,
        circuit_board: 14,
        energy_cell: 2,
      },
    });
    const engine = new MetaProgressionEngine(store);
    await engine.initialize();

    for (const part of STARTER_ROBOT_BLUEPRINT.parts) {
      expect(await engine.buildRobotPart(part.id)).toEqual({ ok: true });
      expect((await engine.buildRobotPart(part.id)).ok).toBe(false);
    }

    expect(engine.getSnapshot().inventory).toEqual({
      metal_plate: 0,
      circuit_board: 0,
      energy_cell: 0,
    });
    expect(engine.getSnapshot().builtRobotPartIds).toHaveLength(6);

    expect(await engine.assembleStarterRobot()).toEqual({ ok: true });
    expect(engine.getSnapshot().assembledRobotIds).toEqual([RobotId.STARTER_SCOUT]);
    expect((await engine.assembleStarterRobot()).ok).toBe(false);
  });

  it("refuses a part when inventory is insufficient", async () => {
    const engine = new MetaProgressionEngine(new MemoryMetaProgressionPersistence());
    await engine.initialize();

    const result = await engine.buildRobotPart(STARTER_ROBOT_BLUEPRINT.parts[0]!.id);
    expect(result).toMatchObject({
      ok: false,
      code: "INSUFFICIENT_ITEMS",
    });
    expect(engine.getSnapshot().builtRobotPartIds).toEqual([]);
  });
});
