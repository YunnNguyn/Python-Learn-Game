import { metricDirection, type ChallengeDefinition } from "./challenge-definition";
import type { SubmissionRecord } from "./challenge-persistence";

/*
 * Pure history rules. The best score is DERIVED from stored records on every read;
 * there is no separate mutable "best" counter that could drift.
 */

const time = (record: SubmissionRecord): number => Date.parse(record.submittedAt);

/** Newest first; equal instants fall back to the id (descending), so the order is total and stable. */
export function compareNewestFirst(a: SubmissionRecord, b: SubmissionRecord): number {
  return time(b) - time(a) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

/** Records of exactly this challenge, version and metric (a defensive filter; storage already groups by id and version). */
export function recordsOfDefinition(
  definition: ChallengeDefinition,
  records: readonly SubmissionRecord[],
): SubmissionRecord[] {
  return records.filter(
    (record) =>
      record.challengeId === definition.id &&
      record.challengeVersion === definition.version &&
      record.metric === definition.metric,
  );
}

export function orderHistory(definition: ChallengeDefinition, records: readonly SubmissionRecord[]): SubmissionRecord[] {
  return recordsOfDefinition(definition, records).sort(compareNewestFirst);
}

/**
 * MAE: lowest score. Accuracy: highest score. A tie goes to the EARLIEST submission
 * (it reached that score first), then to the smaller id. Null when there is none.
 */
export function selectBest(definition: ChallengeDefinition, records: readonly SubmissionRecord[]): SubmissionRecord | null {
  const lowerIsBetter = metricDirection(definition.metric) === "lower-is-better";
  let best: SubmissionRecord | null = null;
  for (const record of recordsOfDefinition(definition, records)) {
    if (best === null) {
      best = record;
      continue;
    }
    const better = lowerIsBetter ? record.score < best.score : record.score > best.score;
    const tied = record.score === best.score;
    if (better || (tied && (time(record) < time(best) || (time(record) === time(best) && record.id < best.id)))) {
      best = record;
    }
  }
  return best;
}
