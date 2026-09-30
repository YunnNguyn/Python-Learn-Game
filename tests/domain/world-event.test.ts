import { describe, expect, it } from "vitest";

import {
  WorldEventSchema,
  type LearningActivityId,
  type WorldEventType,
} from "../../src/core/domain";

describe("WorldEventSchema", () => {
  it("parses semantic events with required JSON-object payloads", () => {
    expect(
      WorldEventSchema.parse({
        type: "TARGETS_SELECTED",
        payload: { ids: ["r2", "r5"] },
      }),
    ).toEqual({
      type: "TARGETS_SELECTED",
      payload: { ids: ["r2", "r5"] },
    });

    expect(
      WorldEventSchema.parse({
        type: "SIGNAL_ONLY",
        payload: {},
      }),
    ).toEqual({
      type: "SIGNAL_ONLY",
      payload: {},
    });
  });

  it("preserves WorldEventType branding and allows unregistered event types locally", () => {
    const event = WorldEventSchema.parse({
      type: "EVENT.DOES.NOT.EXIST",
      payload: { nested: { ok: true } },
    });

    const type: WorldEventType = event.type;
    expect(type).toBe("EVENT.DOES.NOT.EXIST");
  });

  it("keeps WorldEventType incompatible with unrelated branded strings", () => {
    const event = WorldEventSchema.parse({
      type: "TARGETS_SELECTED",
      payload: {},
    });

    // @ts-expect-error WorldEventType cannot substitute for LearningActivityId.
    const invalidActivityId: LearningActivityId = event.type;
    expect(invalidActivityId).toBe("TARGETS_SELECTED");
  });

  it.each([
    ["blank event type", { type: "   ", payload: {} }],
    ["missing payload", { type: "SIGNAL_ONLY" }],
    ["payload root array", { type: "TARGETS_SELECTED", payload: ["r2", "r5"] }],
    [
      "non-JSON payload value",
      { type: "TARGETS_SELECTED", payload: { callback: () => true } },
    ],
    [
      "renderer-specific root field",
      {
        type: "TARGETS_SELECTED",
        payload: {},
        phaserMethod: "lockTargets",
      },
    ],
    [
      "preview transport flag at root",
      { type: "TARGETS_SELECTED", payload: {}, preview: true },
    ],
  ])("rejects %s", (_caseName, input) => {
    expect(WorldEventSchema.safeParse(input).success).toBe(false);
  });
});
