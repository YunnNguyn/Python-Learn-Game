import { describe, expect, it } from "vitest";

import { HintLevel, type HintSetId } from "../../src/core/domain";
import { HintEngine, HintRegistry, type HintSet } from "../../src/core/hints";

const hintSet: HintSet = {
  id: "hints.test" as HintSetId,
  hints: [
    { level: HintLevel.H1, text: "concept" },
    { level: HintLevel.H2, text: "strategy" },
    { level: HintLevel.H3, text: "syntax" },
    { level: HintLevel.H4, text: "pseudo" },
  ],
};

describe("Hint Engine", () => {
  it("reveals H1 through H4 progressively and records use", () => {
    const engine = new HintEngine(hintSet);

    expect(engine.revealNext()?.level).toBe(HintLevel.H1);
    expect(engine.revealNext()?.level).toBe(HintLevel.H2);
    expect(engine.getUsedLevels()).toEqual([HintLevel.H1, HintLevel.H2]);
    expect(engine.getRemainingCount()).toBe(2);
  });

  it("restores a valid revealed prefix from a mission draft", () => {
    const engine = new HintEngine(hintSet, [HintLevel.H1, HintLevel.H2]);

    expect(engine.getRevealed().map((hint) => hint.level)).toEqual([
      HintLevel.H1,
      HintLevel.H2,
    ]);
    expect(engine.revealNext()?.level).toBe(HintLevel.H3);
  });

  it("rejects non-prefix restored hint evidence", () => {
    expect(() => new HintEngine(hintSet, [HintLevel.H2])).toThrow();
  });

  it("registers stable hint-set IDs and rejects duplicates", () => {
    const registry = new HintRegistry();
    registry.registerHintSet(hintSet);
    expect(registry.getHintSet(hintSet.id)).toBeDefined();
    expect(registry.getHintSetIds()).toEqual([hintSet.id]);
    expect(() => registry.registerHintSet(hintSet)).toThrow();
  });
});
