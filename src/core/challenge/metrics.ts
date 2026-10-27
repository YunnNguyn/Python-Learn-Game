/*
 * Deterministic metrics. Callers pass arrays already in canonical (lexicographic ID)
 * order, so the floating-point summation order, and therefore the score, never
 * depends on submission row order.
 *
 * Limitations: MAE is computed in IEEE-754 double precision with Neumaier compensated
 * summation (far less rounding error than naive summation, but not exact). An absolute
 * error or sum beyond Number.MAX_VALUE yields Infinity; the caller reports that as
 * SCORE_NOT_FINITE instead of returning it as a score.
 */

/** Mean absolute error; lower is better. Arrays must have equal, nonzero length. */
export function meanAbsoluteError(predicted: readonly number[], actual: readonly number[]): number {
  let sum = 0;
  let compensation = 0;
  for (let i = 0; i < predicted.length; i += 1) {
    const term = Math.abs(predicted[i]! - actual[i]!);
    const total = sum + term;
    compensation += Math.abs(sum) >= Math.abs(term) ? sum - total + term : term - total + sum;
    sum = total;
  }
  return (sum + compensation) / predicted.length;
}

/** Fraction of exactly equal (case-sensitive, no normalization) labels, in [0, 1]; higher is better. */
export function accuracy(predicted: readonly string[], actual: readonly string[]): number {
  let correct = 0;
  for (let i = 0; i < predicted.length; i += 1) {
    if (predicted[i] === actual[i]) correct += 1;
  }
  return correct / predicted.length;
}
