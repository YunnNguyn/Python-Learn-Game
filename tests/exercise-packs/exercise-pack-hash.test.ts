import { describe, expect, it } from "vitest";

import {
  canonicalJson,
  computePackContentHash,
  sha256Hex,
  utf8ByteLength,
} from "../../src/core/exercise-packs";

const encoder = new TextEncoder();

async function referenceSha256(bytes: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("sha256Hex", () => {
  it("matches the published test vectors", () => {
    expect(sha256Hex(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex(encoder.encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(encoder.encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
    expect(sha256Hex(new Uint8Array(1_000_000).fill(0x61))).toBe(
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    );
  });

  it("agrees with the platform implementation across every padding boundary", async () => {
    for (let length = 0; length <= 200; length++) {
      const bytes = new Uint8Array(length).map((_, index) => (index * 31 + length) & 0xff);
      expect(sha256Hex(bytes)).toBe(await referenceSha256(bytes));
    }
  });

  it("hashes non-ASCII text through UTF-8", async () => {
    const text = "Hồi quy tuyến tính — 線形回帰 — 😀";
    expect(sha256Hex(encoder.encode(text))).toBe(await referenceSha256(encoder.encode(text)));
    expect(utf8ByteLength("😀")).toBe(4);
    expect(utf8ByteLength("é")).toBe(2);
  });
});

describe("canonicalJson", () => {
  it("ignores key order and whitespace, and sorts nested keys", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[1,{"y":2,"z":1}]},"b":1}',
    );
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });

  it("keeps array order (it is content)", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("refuses values JSON cannot represent", () => {
    expect(() => canonicalJson({ a: Number.NaN })).toThrow(TypeError);
    expect(() => canonicalJson({ a: Number.POSITIVE_INFINITY })).toThrow(TypeError);
    expect(() => canonicalJson({ a: undefined })).toThrow(TypeError);
  });
});

describe("computePackContentHash", () => {
  it("depends on content only", () => {
    const one = computePackContentHash({ x: 1, y: [1, 2] });
    expect(one).toBe(computePackContentHash({ y: [1, 2], x: 1 }));
    expect(one).not.toBe(computePackContentHash({ x: 1, y: [2, 1] }));
    expect(one).toMatch(/^[0-9a-f]{64}$/);
  });
});
