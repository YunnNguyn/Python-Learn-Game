import { HintLevel, type HintSetId } from "../domain";
import type { HintSet } from "./hint-types";

const CANONICAL_LEVEL_ORDER = [
  HintLevel.H1,
  HintLevel.H2,
  HintLevel.H3,
  HintLevel.H4,
] as const;

export class HintRegistry {
  private readonly sets = new Map<HintSetId, HintSet>();

  registerHintSet(set: HintSet): void {
    if (this.sets.has(set.id)) {
      throw new Error(`HintSet already registered: ${String(set.id)}`);
    }

    if (set.hints.length !== CANONICAL_LEVEL_ORDER.length) {
      throw new Error(`HintSet must define H1 through H4 exactly once: ${String(set.id)}`);
    }

    CANONICAL_LEVEL_ORDER.forEach((level, index) => {
      const hint = set.hints[index];
      if (!hint || hint.level !== level || hint.text.trim().length === 0) {
        throw new Error(`HintSet must define hints in H1 -> H4 order: ${String(set.id)}`);
      }
    });

    this.sets.set(set.id, Object.freeze({
      id: set.id,
      hints: Object.freeze(set.hints.map((hint) => Object.freeze({ ...hint }))),
    }));
  }

  getHintSet(id: HintSetId): HintSet | undefined {
    return this.sets.get(id);
  }

  getHintSetIds(): readonly HintSetId[] {
    return [...this.sets.keys()];
  }
}
