import { CHALLENGE_LIMITS, parseChallengeDefinition, type ChallengeMetric } from "./challenge-definition";
import { ChallengeIssueCode, MAX_ISSUE_EXAMPLES, truncateExample, type ChallengeIssue } from "./challenge-issues";
import { accuracy, meanAbsoluteError } from "./metrics";
import { readTargetTable, type TargetRecord } from "./submission-validator";

export type ScoreSubmissionResult =
  | { readonly ok: true; readonly metric: ChallengeMetric; readonly score: number; readonly rowCount: number }
  | { readonly ok: false; readonly issues: readonly ChallengeIssue[] };

const compareIds = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function idExamples(ids: readonly string[]): string[] {
  return [...ids].sort(compareIds).slice(0, MAX_ISSUE_EXAMPLES).map(truncateExample);
}

/**
 * Validates `submissionCsv` against `solutionCsv` under `definition`, then scores it.
 * Pure and deterministic; never throws for bad input. Predictions are matched by ID
 * and processed in lexicographic (UTF-16 code unit) ID order, so row order is irrelevant.
 * Failure issues never contain solution labels.
 */
export function scoreSubmission(definition: unknown, solutionCsv: string, submissionCsv: string): ScoreSubmissionResult {
  const parsedDefinition = parseChallengeDefinition(definition);
  if (!parsedDefinition.ok) return { ok: false, issues: parsedDefinition.issues };
  const challenge = parsedDefinition.definition;

  // The solution is trusted challenge content: any defect is the challenge's, not the learner's.
  const solution = readTargetTable(challenge, solutionCsv, CHALLENGE_LIMITS);
  const solutionRecords = solution.records;
  if (solutionRecords === null || solution.issues.length > 0 || solutionRecords.length > challenge.limits.maxRows) {
    return {
      ok: false,
      issues: [
        {
          code: ChallengeIssueCode.SOLUTION_INVALID,
          message: "Dữ liệu đáp án của thử thách bị lỗi nên chưa thể chấm bài. Đây không phải lỗi của bạn.",
          cause: solution.issues[0]?.code ?? ChallengeIssueCode.TOO_MANY_ROWS,
        },
      ],
    };
  }

  const submission = readTargetTable(challenge, submissionCsv, {
    maxBytes: challenge.limits.maxSubmissionBytes,
    maxRows: challenge.limits.maxRows,
  });
  const issues: ChallengeIssue[] = [...submission.issues];
  const submitted = submission.records;

  if (submitted !== null) {
    if (submitted.length !== solutionRecords.length) {
      issues.push({
        code: ChallengeIssueCode.ROW_COUNT_MISMATCH,
        message: `Số dòng dữ liệu không khớp: cần ${solutionRecords.length} dòng, tệp có ${submitted.length} dòng.`,
        count: submitted.length,
      });
    }
    const expectedIds = new Set(solutionRecords.map((record) => record.id));
    const submittedIds = new Set(submitted.map((record) => record.id));
    const missing = solutionRecords.filter((record) => !submittedIds.has(record.id)).map((record) => record.id);
    const extra = submitted.filter((record) => !expectedIds.has(record.id)).map((record) => record.id);
    if (missing.length > 0) {
      issues.push({
        code: ChallengeIssueCode.MISSING_IDS,
        message: `Thiếu ${missing.length} ID so với yêu cầu.`,
        count: missing.length,
        examples: idExamples(missing),
      });
    }
    if (extra.length > 0) {
      issues.push({
        code: ChallengeIssueCode.EXTRA_IDS,
        message: `Có ${extra.length} ID không thuộc bộ kiểm tra.`,
        count: extra.length,
        examples: idExamples(extra),
      });
    }
  }
  if (submitted === null || issues.length > 0) return { ok: false, issues };

  const byId = new Map<string, TargetRecord>(submitted.map((record) => [record.id, record]));
  const ordered = [...solutionRecords].sort((a, b) => compareIds(a.id, b.id));
  const actual = ordered;
  const predicted = ordered.map((record) => byId.get(record.id)!);

  const score =
    challenge.metric === "mae"
      ? meanAbsoluteError(
          predicted.map((record) => record.number),
          actual.map((record) => record.number),
        )
      : accuracy(
          predicted.map((record) => record.raw),
          actual.map((record) => record.raw),
        );
  if (!Number.isFinite(score)) {
    return {
      ok: false,
      issues: [
        {
          code: ChallengeIssueCode.SCORE_NOT_FINITE,
          message: "Không tính được điểm vì sai số vượt quá giới hạn số thực. Hãy kiểm tra các giá trị dự đoán quá lớn.",
        },
      ],
    };
  }
  return { ok: true, metric: challenge.metric, score, rowCount: ordered.length };
}
