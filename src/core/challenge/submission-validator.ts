import type { ChallengeDefinition } from "./challenge-definition";
import { ChallengeIssueCode, IssueCollector, truncateExample, type ChallengeIssue } from "./challenge-issues";
import { parseCsv, type CsvLimits } from "./csv";

/*
 * Structural and value validation of ONE two-column CSV (ID, target), used for both
 * the submission and the challenge's solution file.
 *
 * IDs are opaque strings: never trimmed, case-folded or converted ("001" != "1").
 */

export interface TargetRecord {
  readonly id: string;
  /** The raw target text. */
  readonly raw: string;
  /** Parsed value for numeric targets; 0 for categorical or invalid rows (which carry issues). */
  readonly number: number;
  readonly line: number;
}

export interface ReadTableResult {
  /** Null when the file's structure (parsing or header) is unusable. Otherwise one record per distinct non-empty ID. */
  readonly records: readonly TargetRecord[] | null;
  readonly issues: readonly ChallengeIssue[];
}

// Decimal or scientific notation only: no hex, no whitespace, no "Infinity", no separators.
const NUMERIC_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const NON_FINITE_PATTERN = /^[+-]?(?:nan|inf|infinity)$/i;

export type ParsedNumber =
  | { readonly ok: true; readonly value: number }
  | {
      readonly ok: false;
      readonly code: typeof ChallengeIssueCode.INVALID_NUMBER | typeof ChallengeIssueCode.NON_FINITE_NUMBER;
    };

export function parseStrictNumber(raw: string): ParsedNumber {
  if (NON_FINITE_PATTERN.test(raw)) return { ok: false, code: ChallengeIssueCode.NON_FINITE_NUMBER };
  if (!NUMERIC_PATTERN.test(raw)) return { ok: false, code: ChallengeIssueCode.INVALID_NUMBER };
  const value = Number(raw);
  // Syntactically valid but beyond double range (e.g. 1e999).
  if (!Number.isFinite(value)) return { ok: false, code: ChallengeIssueCode.NON_FINITE_NUMBER };
  return { ok: true, value };
}

const CSV_MESSAGES = {
  INPUT_TOO_LARGE: "Tệp quá lớn so với giới hạn cho phép.",
  TOO_MANY_ROWS: "Tệp có quá nhiều dòng so với giới hạn cho phép.",
  EMPTY_FILE: "Tệp trống.",
  MALFORMED_QUOTE: "Dấu ngoặc kép sai quy cách (chỉ được mở ở đầu ô và phải đóng đúng cách).",
  UNTERMINATED_QUOTE: "Có dấu ngoặc kép mở nhưng không được đóng.",
  BARE_CARRIAGE_RETURN: "Có ký tự xuống dòng CR đơn lẻ; hãy dùng LF hoặc CRLF.",
  ROW_COLUMN_COUNT: "Số cột của dòng này khác với số cột của dòng tiêu đề.",
} as const;

export function readTargetTable(definition: ChallengeDefinition, text: string, limits: CsvLimits): ReadTableResult {
  const issues = new IssueCollector();
  const parsed = parseCsv(text, limits);
  if (!parsed.ok) {
    issues.add(parsed.code, CSV_MESSAGES[parsed.code], parsed.line !== undefined ? { line: parsed.line } : {});
    return { records: null, issues: issues.toIssues() };
  }

  const { header, rows, rowLines } = parsed.table;
  const wanted = [definition.idColumn, definition.targetColumn];

  const seenColumns = new Set<string>();
  for (const name of header) {
    if (seenColumns.has(name)) {
      issues.add(ChallengeIssueCode.DUPLICATE_COLUMN, "Tiêu đề có cột bị trùng tên.", { line: 1, example: name });
    }
    seenColumns.add(name);
  }
  for (const name of header) {
    if (!wanted.includes(name)) {
      issues.add(ChallengeIssueCode.UNEXPECTED_COLUMN, "Tiêu đề có cột không được phép (chỉ gồm cột ID và cột dự đoán).", {
        line: 1,
        example: name,
      });
    }
  }
  for (const name of wanted) {
    if (!seenColumns.has(name)) {
      issues.add(ChallengeIssueCode.MISSING_COLUMN, "Thiếu cột bắt buộc trong tiêu đề (tên cột phân biệt hoa thường).", {
        line: 1,
        example: name,
      });
    }
  }
  if (issues.size > 0) return { records: null, issues: issues.toIssues() };

  if (rows.length === 0) {
    issues.add(ChallengeIssueCode.NO_ROWS, "Tệp không có dòng dữ liệu nào sau tiêu đề.");
    return { records: null, issues: issues.toIssues() };
  }

  const idIndex = header.indexOf(definition.idColumn);
  const targetIndex = header.indexOf(definition.targetColumn);
  const records: TargetRecord[] = [];
  const seenIds = new Set<string>();
  rows.forEach((row, index) => {
    const line = rowLines[index]!;
    const id = row[idIndex]!;
    const raw = row[targetIndex]!;

    if (id.trim() === "") {
      issues.add(ChallengeIssueCode.EMPTY_ID, "Có ID bị để trống.", { line });
      return;
    }
    const duplicate = seenIds.has(id);
    if (duplicate) issues.add(ChallengeIssueCode.DUPLICATE_ID, "Có ID xuất hiện nhiều lần.", { line, example: id });
    seenIds.add(id);

    let number = 0;
    if (raw.trim() === "") {
      issues.add(ChallengeIssueCode.EMPTY_PREDICTION, "Có giá trị dự đoán bị để trống.", { line, example: id });
    } else if (definition.targetType === "numeric") {
      const value = parseStrictNumber(raw);
      if (value.ok) number = value.value;
      else {
        issues.add(
          value.code,
          value.code === ChallengeIssueCode.NON_FINITE_NUMBER
            ? "Giá trị dự đoán là NaN, Infinity hoặc vượt quá giới hạn số thực."
            : "Giá trị dự đoán không phải số thập phân hợp lệ (chỉ nhận dạng thập phân hoặc khoa học, không nhận hex).",
          { line, example: truncateExample(raw) },
        );
      }
    }
    if (!duplicate) records.push({ id, raw, number, line });
  });

  return { records, issues: issues.toIssues() };
}
