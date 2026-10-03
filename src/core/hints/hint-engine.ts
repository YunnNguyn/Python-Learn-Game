import type { HintLevel } from "../domain";
import type { HintSet, RevealedHint } from "./hint-types";

export class HintEngine {
  private readonly revealed: RevealedHint[] = [];

  constructor(
    private readonly hintSet: HintSet | null,
    initialUsedLevels: readonly HintLevel[] = [],
  ) {
    if (!hintSet && initialUsedLevels.length > 0) {
      throw new Error("Cannot restore hint usage without a HintSet.");
    }

    initialUsedLevels.forEach((level, index) => {
      const hint = hintSet?.hints[index];
      if (!hint || hint.level !== level) {
        throw new Error("Restored hint usage must be a valid H1 -> H4 prefix.");
      }
      this.revealed.push(Object.freeze({ ...hint, index }));
    });
  }

  revealNext(): RevealedHint | null {
    if (!this.hintSet || this.revealed.length >= this.hintSet.hints.length) {
      return null;
    }

    const index = this.revealed.length;
    const hint = this.hintSet.hints[index]!;
    const revealed = Object.freeze({ ...hint, index });
    this.revealed.push(revealed);
    return revealed;
  }

  getRevealed(): readonly RevealedHint[] {
    return [...this.revealed];
  }

  getUsedLevels(): readonly HintLevel[] {
    return this.revealed.map((hint) => hint.level);
  }

  getRemainingCount(): number {
    return Math.max(0, (this.hintSet?.hints.length ?? 0) - this.revealed.length);
  }

  hasHints(): boolean {
    return (this.hintSet?.hints.length ?? 0) > 0;
  }
}
