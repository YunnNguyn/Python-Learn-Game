import { ChallengeIssueCode } from "./challenge-issues";

/*
 * Strict CSV reader (RFC 4180 subset) for Challenge files.
 *
 * Accepts: one leading UTF-8 BOM, LF or CRLF record ends, quoted fields containing
 * commas, newlines and `""`, a last record with or without a trailing newline.
 * Rejects (typed, never repaired): a quote inside an unquoted field, text after a
 * closing quote, an unterminated quote, a bare CR, records whose width differs from
 * the header, empty input, and input over the byte or row limit.
 * Every field is returned as a string; nothing is trimmed or converted.
 */

export interface CsvLimits {
  readonly maxBytes: number;
  /** Data rows, excluding the header. */
  readonly maxRows: number;
}

export type CsvErrorCode =
  | typeof ChallengeIssueCode.INPUT_TOO_LARGE
  | typeof ChallengeIssueCode.TOO_MANY_ROWS
  | typeof ChallengeIssueCode.EMPTY_FILE
  | typeof ChallengeIssueCode.MALFORMED_QUOTE
  | typeof ChallengeIssueCode.UNTERMINATED_QUOTE
  | typeof ChallengeIssueCode.BARE_CARRIAGE_RETURN
  | typeof ChallengeIssueCode.ROW_COLUMN_COUNT;

export interface CsvTable {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
  /** 1-based physical line on which each row starts; parallel to `rows`. */
  readonly rowLines: readonly number[];
}

export type CsvParseResult =
  | { readonly ok: true; readonly table: CsvTable }
  | { readonly ok: false; readonly code: CsvErrorCode; readonly line?: number };

export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

export function parseCsv(text: string, limits: CsvLimits): CsvParseResult {
  if (utf8ByteLength(text) > limits.maxBytes) return { ok: false, code: ChallengeIssueCode.INPUT_TOO_LARGE };

  const records: string[][] = [];
  const lines: number[] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let afterQuote = false;
  let atFieldStart = true;
  let line = 1;
  let recordLine = 1;

  const endRecord = (): CsvParseResult | null => {
    fields.push(field);
    if (records.length > 0 && fields.length !== records[0]!.length) {
      return { ok: false, code: ChallengeIssueCode.ROW_COLUMN_COUNT, line: recordLine };
    }
    if (records.length >= limits.maxRows + 1) {
      return { ok: false, code: ChallengeIssueCode.TOO_MANY_ROWS, line: recordLine };
    }
    records.push(fields);
    lines.push(recordLine);
    fields = [];
    field = "";
    atFieldStart = true;
    afterQuote = false;
    return null;
  };

  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i < text.length) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        afterQuote = true;
      } else {
        if (c === "\n") line += 1;
        field += c;
      }
      i += 1;
      continue;
    }
    if (c === ",") {
      fields.push(field);
      field = "";
      atFieldStart = true;
      afterQuote = false;
    } else if (c === "\n" || (c === "\r" && text[i + 1] === "\n")) {
      const failed = endRecord();
      if (failed !== null) return failed;
      if (c === "\r") i += 1;
      line += 1;
      recordLine = line;
    } else if (c === "\r") {
      return { ok: false, code: ChallengeIssueCode.BARE_CARRIAGE_RETURN, line };
    } else if (c === '"') {
      if (!atFieldStart) return { ok: false, code: ChallengeIssueCode.MALFORMED_QUOTE, line };
      inQuotes = true;
      atFieldStart = false;
    } else {
      if (afterQuote) return { ok: false, code: ChallengeIssueCode.MALFORMED_QUOTE, line };
      field += c;
      atFieldStart = false;
    }
    i += 1;
  }

  if (inQuotes) return { ok: false, code: ChallengeIssueCode.UNTERMINATED_QUOTE, line };
  if (fields.length > 0 || field !== "" || !atFieldStart) {
    const failed = endRecord();
    if (failed !== null) return failed;
  }
  if (records.length === 0) return { ok: false, code: ChallengeIssueCode.EMPTY_FILE };

  return { ok: true, table: { header: records[0]!, rows: records.slice(1), rowLines: lines.slice(1) } };
}
