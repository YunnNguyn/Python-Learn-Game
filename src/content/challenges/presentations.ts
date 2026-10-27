import { DELIVERY_TIME_PRESENTATION } from "./delivery-time/presentation";
import type { ChallengePresentation } from "./presentation";

export type { ChallengePresentation } from "./presentation";

const PRESENTATIONS: ReadonlyMap<string, ChallengePresentation> = new Map([
  [DELIVERY_TIME_PRESENTATION.id, DELIVERY_TIME_PRESENTATION],
]);

export function challengePresentation(challengeId: string): ChallengePresentation | undefined {
  return PRESENTATIONS.get(challengeId);
}
