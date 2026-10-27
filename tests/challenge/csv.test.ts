import { describe, expect, it } from "vitest";

import { parseCsv } from "../../src/core/challenge/csv";

const LIMITS = { maxBytes: 10_000, maxRows: 100 };

function table(text: string, limits = LIMITS) {
  const result = parseCsv(text, limits);
  if (!result.ok) throw new Error(`expected ok, got ${result.code}`);
  return result.table;
}

function code(text: string, limits = LIMITS) {
  const result = parseCsv(text, limits);
  return result.ok ? "OK" : result.code;
}

describe("parseCsv", () => {
  it("parses LF, CRLF and a missing final newline identically", () => {
    const expected = { header: ["id", "y"], rows: [["a", "1"], ["b", "2"]] };
    for (const text of ["id,y\na,1\nb,2\n", "id,y\r\na,1\r\nb,2\r\n", "id,y\na,1\nb,2", "id,y\r\na,1\r\nb,2"]) {
      const parsed = table(text);
      expect({ header: parsed.header, rows: parsed.rows }).toEqual(expected);
    }
  });

  it("strips exactly one leading UTF-8 BOM", () => {
    expect(table("﻿id,y\na,1\n").header).toEqual(["id", "y"]);
    expect(table("﻿﻿id,y\na,1\n").header).toEqual(["﻿id", "y"]);
  });

  it("supports quoted commas, escaped quotes and multiline fields", () => {
    const parsed = table('id,y\n"a,1","say ""hi"""\n"b","line1\nline2"\r\n"c","x\r\ny"\n');
    expect(parsed.rows).toEqual([
      ["a,1", 'say "hi"'],
      ["b", "line1\nline2"],
      ["c", "x\r\ny"],
    ]);
  });

  it("tracks the physical start line of each row across multiline fields", () => {
    const parsed = table('id,y\n"a","l1\nl2"\nb,2\n');
    expect(parsed.rowLines).toEqual([2, 4]);
  });

  it("keeps whitespace and leading zeros untouched", () => {
    expect(table("id,y\n 001 , x \n").rows).toEqual([[" 001 ", " x "]]);
  });

  it("accepts an empty quoted last field and empty fields", () => {
    expect(table('id,y\na,""').rows).toEqual([["a", ""]]);
    expect(table("id,y\na,\n").rows).toEqual([["a", ""]]);
  });

  it("rejects malformed quotation", () => {
    expect(code('id,y\na,b"c\n')).toBe("MALFORMED_QUOTE");
    expect(code('id,y\n"a"x,1\n')).toBe("MALFORMED_QUOTE");
    expect(code('id,y\n"a""",1\n')).toBe("OK");
    expect(code('id,y\n"a" ,1\n')).toBe("MALFORMED_QUOTE");
    expect(code('id,y\n"a,1\n')).toBe("UNTERMINATED_QUOTE");
  });

  it("rejects a bare carriage return, empty input and inconsistent columns", () => {
    expect(code("id,y\ra,1\n")).toBe("BARE_CARRIAGE_RETURN");
    expect(code("")).toBe("EMPTY_FILE");
    expect(code("﻿")).toBe("EMPTY_FILE");
    expect(code("id,y\na,1,2\n")).toBe("ROW_COLUMN_COUNT");
    expect(code("id,y\na\n")).toBe("ROW_COLUMN_COUNT");
    expect(code("id,y\na,1\n\nb,2\n")).toBe("ROW_COLUMN_COUNT");
  });

  it("enforces byte and row limits", () => {
    expect(code("id,y\na,1\n", { maxBytes: 8, maxRows: 10 })).toBe("INPUT_TOO_LARGE");
    expect(code("id,y\na,1\n", { maxBytes: 9, maxRows: 10 })).toBe("OK");
    // Bytes, not characters: "é" is 2 bytes.
    expect(code("id,y\né,1\n", { maxBytes: 9, maxRows: 10 })).toBe("INPUT_TOO_LARGE");
    expect(code("id,y\na,1\nb,2\nc,3\n", { maxBytes: 100, maxRows: 2 })).toBe("TOO_MANY_ROWS");
    expect(code("id,y\na,1\nb,2\n", { maxBytes: 100, maxRows: 2 })).toBe("OK");
  });
});
