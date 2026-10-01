/**
 * Versioned deterministic seed-derivation policy for generation attempts.
 *
 * Attempt 0 deliberately preserves the exact base seed so existing first-pass
 * generation remains unchanged. Retry attempts namespace and encode that exact
 * seed because this string format is part of the reproducibility contract.
 */
export const GENERATION_ATTEMPT_SEED_POLICY =
  "mission-retry-seed-v1" as const;

const RETRY_SEED_PREFIX = "mission-retry:v1";

export function deriveGenerationAttemptSeed(
  baseSeed: string,
  attemptIndex: number,
): string {
  if (
    !Number.isFinite(attemptIndex) ||
    !Number.isSafeInteger(attemptIndex) ||
    attemptIndex < 0
  ) {
    throw new RangeError(
      "attemptIndex must be a finite non-negative safe integer.",
    );
  }

  if (attemptIndex === 0) {
    return baseSeed;
  }

  return `${RETRY_SEED_PREFIX}:${attemptIndex}:${encodeURIComponent(baseSeed)}`;
}
