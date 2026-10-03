import type { HintLevel, HintSetId } from "../domain";

export interface HintDefinition {
  readonly level: HintLevel;
  readonly text: string;
}

export interface HintSet {
  readonly id: HintSetId;
  readonly hints: readonly HintDefinition[];
}

export interface RevealedHint extends HintDefinition {
  readonly index: number;
}
