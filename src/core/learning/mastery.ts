import {
  HintLevel,
  LearningStage,
  MasteryState,
  type AttemptRecord,
  type ConceptId,
  type MasteryState as MasteryStateValue,
} from "../domain";

export const RETENTION_DELAY_MS = 24 * 60 * 60 * 1000;

const HIGH_LEVEL_HINTS = new Set<HintLevel>([HintLevel.H3, HintLevel.H4]);

export interface ConceptProgress {
  readonly conceptId: ConceptId;
  readonly mastery: MasteryStateValue;
  readonly attemptCount: number;
  readonly successfulAttemptCount: number;
  readonly lastAttemptAt?: string;
  readonly lastSuccessAt?: string;
}

export function deriveConceptProgress(
  conceptId: ConceptId,
  allAttempts: readonly AttemptRecord[],
): ConceptProgress {
  const attempts = allAttempts
    .filter((attempt) => attempt.conceptIds.includes(conceptId))
    .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));

  if (attempts.length === 0) {
    return {
      conceptId,
      mastery: MasteryState.UNSEEN,
      attemptCount: 0,
      successfulAttemptCount: 0,
    };
  }

  const successes = attempts.filter((attempt) => attempt.passed);
  let mastery: MasteryStateValue = MasteryState.DISCOVERED;

  if (
    successes.some(
      (attempt) =>
        attempt.learningStage === LearningStage.DISCOVER ||
        attempt.learningStage === LearningStage.GUIDED,
    )
  ) {
    mastery = MasteryState.PRACTICING;
  }

  const independentSeeds = new Set(
    successes
      .filter(
        (attempt) =>
          attempt.learningStage === LearningStage.INDEPENDENT &&
          !attempt.hintsUsed.some((hint) => HIGH_LEVEL_HINTS.has(hint)),
      )
      .map((attempt) => attempt.seed),
  );
  if (independentSeeds.size >= 2) {
    mastery = MasteryState.INDEPENDENT;
  }

  if (successes.some((attempt) => attempt.learningStage === LearningStage.TRANSFER)) {
    mastery = MasteryState.TRANSFERRED;
  }

  if (hasRetentionEvidence(successes)) {
    mastery = MasteryState.RETAINED;
  }

  return {
    conceptId,
    mastery,
    attemptCount: attempts.length,
    successfulAttemptCount: successes.length,
    lastAttemptAt: attempts.at(-1)?.submittedAt,
    ...(successes.length > 0 ? { lastSuccessAt: successes.at(-1)!.submittedAt } : {}),
  };
}

function hasRetentionEvidence(successes: readonly AttemptRecord[]): boolean {
  if (successes.some((attempt) => attempt.learningStage === LearningStage.RETENTION)) {
    return true;
  }

  const firstSuccess = successes.at(0);
  if (!firstSuccess) return false;
  const firstSuccessTime = Date.parse(firstSuccess.submittedAt);
  if (!Number.isFinite(firstSuccessTime)) return false;

  return successes.some((attempt) => {
    if (attempt.learningStage !== LearningStage.REVIEW) return false;
    const reviewTime = Date.parse(attempt.submittedAt);
    return Number.isFinite(reviewTime) && reviewTime - firstSuccessTime >= RETENTION_DELAY_MS;
  });
}
