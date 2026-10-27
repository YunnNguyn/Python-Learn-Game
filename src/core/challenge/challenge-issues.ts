/**
 * Stable, typed validation issues of the Challenge engine (M13.1).
 *
 * `code` is the contract (tests and UI key on it); `message` is Vietnamese text for
 * the learner and may change. An issue NEVER carries ground truth: it may quote
 * values the learner submitted and identifiers (IDs), but never a solution label.
 */
export const ChallengeIssueCode = {
  INVALID_DEFINITION: "INVALID_DEFINITION",
  METRIC_TARGET_MISMATCH: "METRIC_TARGET_MISMATCH",
  /** The challenge's own solution file is unusable. `cause` names the underlying code. */
  SOLUTION_INVALID: "SOLUTION_INVALID",
  INPUT_TOO_LARGE: "INPUT_TOO_LARGE",
  TOO_MANY_ROWS: "TOO_MANY_ROWS",
  EMPTY_FILE: "EMPTY_FILE",
  MALFORMED_QUOTE: "MALFORMED_QUOTE",
  UNTERMINATED_QUOTE: "UNTERMINATED_QUOTE",
  BARE_CARRIAGE_RETURN: "BARE_CARRIAGE_RETURN",
  ROW_COLUMN_COUNT: "ROW_COLUMN_COUNT",
  DUPLICATE_COLUMN: "DUPLICATE_COLUMN",
  MISSING_COLUMN: "MISSING_COLUMN",
  UNEXPECTED_COLUMN: "UNEXPECTED_COLUMN",
  NO_ROWS: "NO_ROWS",
  EMPTY_ID: "EMPTY_ID",
  DUPLICATE_ID: "DUPLICATE_ID",
  EMPTY_PREDICTION: "EMPTY_PREDICTION",
  INVALID_NUMBER: "INVALID_NUMBER",
  NON_FINITE_NUMBER: "NON_FINITE_NUMBER",
  ROW_COUNT_MISMATCH: "ROW_COUNT_MISMATCH",
  MISSING_IDS: "MISSING_IDS",
  EXTRA_IDS: "EXTRA_IDS",
  SCORE_NOT_FINITE: "SCORE_NOT_FINITE",
} as const;

export type ChallengeIssueCode = (typeof ChallengeIssueCode)[keyof typeof ChallengeIssueCode];

export interface ChallengeIssue {
  readonly code: ChallengeIssueCode;
  readonly message: string;
  /** 1-based physical line of the first occurrence, when the issue is tied to a line. */
  readonly line?: number;
  /** How many places the issue occurred (issues of one code are aggregated). */
  readonly count?: number;
  /** A few offending IDs or submitted values (truncated); never solution labels. */
  readonly examples?: readonly string[];
  /** For SOLUTION_INVALID: the underlying code. */
  readonly cause?: ChallengeIssueCode;
}

export const MAX_ISSUE_EXAMPLES = 5;
const MAX_EXAMPLE_LENGTH = 64;

export function truncateExample(value: string): string {
  return value.length > MAX_EXAMPLE_LENGTH ? `${value.slice(0, MAX_EXAMPLE_LENGTH)}…` : value;
}

/** Collects issues, aggregating by code so a 100k-row file cannot produce 100k issues. */
export class IssueCollector {
  private readonly byCode = new Map<
    ChallengeIssueCode,
    { message: string; line?: number; count: number; examples: string[] }
  >();

  add(code: ChallengeIssueCode, message: string, options: { line?: number; example?: string } = {}): void {
    let entry = this.byCode.get(code);
    if (entry === undefined) {
      entry = { message, ...(options.line !== undefined ? { line: options.line } : {}), count: 0, examples: [] };
      this.byCode.set(code, entry);
    }
    entry.count += 1;
    if (options.example !== undefined && entry.examples.length < MAX_ISSUE_EXAMPLES) {
      entry.examples.push(truncateExample(options.example));
    }
  }

  get size(): number {
    return this.byCode.size;
  }

  toIssues(): ChallengeIssue[] {
    return [...this.byCode].map(([code, entry]) => ({
      code,
      message: entry.message,
      ...(entry.line !== undefined ? { line: entry.line } : {}),
      count: entry.count,
      ...(entry.examples.length > 0 ? { examples: entry.examples } : {}),
    }));
  }
}
