import type { ZodIssue } from "zod";

import { DeclarativeGraderConfigSchema } from "../grading";
import { ALLOWED_RUNTIME_PACKAGE_NAMES, isAllowedRuntimePackage, isSimpleDatasetFilename } from "../runtime/pyodide/runtime-config-rules";
import { adaptExercisePack } from "./exercise-pack-adapter";
import { canonicalJson, computePackContentHash, utf8ByteLength } from "./exercise-pack-hash";
import {
  ExercisePackIssueCode as Code,
  clip,
  escapeJsonPointerToken,
  toJsonPointer,
  type ExercisePackIssue,
} from "./exercise-pack-issues";
import {
  EXERCISE_PACK_FORMAT,
  EXERCISE_PACK_LIMITS as L,
  SUPPORTED_EXERCISE_KINDS,
  SUPPORTED_EXERCISE_PACK_SCHEMA_VERSIONS,
} from "./exercise-pack-limits";
import { ExercisePackSchema, type ExercisePack, type PackCheck, type PackExercise } from "./exercise-pack-schema";
import { FORBIDDEN_OBJECT_KEYS, findPythonNameProblem } from "./python-names";

/*
 * validateExercisePack (PHASE-05-M7).
 *
 * Layers, cheapest first; a layer that fails ends the run, so the expensive work
 * never sees input an earlier layer rejected:
 *
 *   1. input size      (UTF-8 bytes of the text)
 *   2. nesting depth   (a string-aware scan BEFORE JSON.parse builds anything)
 *   3. JSON.parse      (syntax errors with line/column)
 *   4. structure walk  (depth, node count, JSON-only data, prototype-pollution keys,
 *                       NUL / lone surrogates) - iterative, never recursive
 *   5. strict schema   (Zod; shape, types, per-field limits)
 *   6. semantic rules  (Python names, ids, datasets, packages, grading, hints)
 *   7. adapter         (the REAL domain schemas must accept the adapted objects)
 *
 * The function never throws: whatever it is given - even a getter that throws or a
 * cyclic object - the result is `{ ok: true, ... }` or `{ ok: false, issues }`.
 * Issue lists are bounded (`maxReportedIssues`) and never echo large values.
 *
 * The content hash is computed here, from the validated pack. It is never read
 * from the document.
 */

export interface ValidatedExercisePack {
  readonly ok: true;
  /** A deep copy: independent of the caller's input. */
  readonly pack: ExercisePack;
  /** SHA-256 (hex) of the canonical JSON of `pack`, computed by the app. */
  readonly contentHash: string;
  /** UTF-8 size of the document that was validated. */
  readonly sizeBytes: number;
  /** Non-blocking observations (e.g. an exercise without a reference solution). */
  readonly warnings: readonly ExercisePackIssue[];
}

export interface RejectedExercisePack {
  readonly ok: false;
  /** At most `maxReportedIssues` entries; a final MORE_ISSUES entry counts the rest. */
  readonly issues: readonly ExercisePackIssue[];
}

export type ValidateExercisePackResult = ValidatedExercisePack | RejectedExercisePack;

export function validateExercisePack(input: unknown): ValidateExercisePackResult {
  try {
    return validate(input);
  } catch (error) {
    // Defensive: validation itself must never take the importer down.
    return reject([
      issue(Code.NOT_JSON_DATA, "", `Không thể đọc dữ liệu đầu vào (${clip(String((error as Error)?.message ?? error), 80)}).`),
    ]);
  }
}

// --------------------------------------------------------------------------- driver

function validate(input: unknown): ValidateExercisePackResult {
  let value: unknown;
  let sizeBytes: number;

  if (typeof input === "string") {
    const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
    // UTF-16 units never outnumber UTF-8 bytes, so a longer string is certainly too big.
    sizeBytes = text.length > L.maxPackBytes ? text.length : utf8ByteLength(text);
    if (sizeBytes > L.maxPackBytes) return reject([tooLarge()]);
    const deep = scanNestingDepth(text);
    if (deep !== null) return reject([deep]);
    try {
      value = JSON.parse(text);
    } catch (error) {
      return reject([syntaxIssue(error, text)]);
    }
  } else if (typeof input === "object" && input !== null) {
    value = input;
    sizeBytes = 0; // measured on the canonical form after the structure walk
  } else {
    return reject([
      issue(Code.INPUT_NOT_TEXT, "", "Dữ liệu đầu vào phải là văn bản JSON (hoặc một object JSON)."),
    ]);
  }

  const walked = walkStructure(value);
  if (walked.length > 0) return reject(walked);

  if (typeof input !== "string") {
    sizeBytes = utf8ByteLength(canonicalJson(value));
    if (sizeBytes > L.maxPackBytes) return reject([tooLarge()]);
  }

  const shape = checkShape(value);
  if (shape.length > 0) return reject(shape);

  const parsed = ExercisePackSchema.safeParse(value);
  if (!parsed.success) {
    return reject(dedupe([...preChecks(value), ...parsed.error.issues.flatMap((zodIssue) => mapZodIssue(zodIssue, value))]));
  }
  const early = preChecks(value);
  if (early.length > 0) return reject(early);

  // Decouple from the caller's object (and from sub-objects the schema passed through).
  const pack = structuredClone(parsed.data) as ExercisePack;

  const semantic = checkSemantics(pack);
  if (semantic.length > 0) return reject(semantic);

  try {
    adaptExercisePack(pack);
  } catch (error) {
    return reject(adapterIssues(pack, error));
  }

  return {
    ok: true,
    pack,
    contentHash: computePackContentHash(pack),
    sizeBytes,
    warnings: lint(pack),
  };
}

function reject(all: readonly ExercisePackIssue[]): RejectedExercisePack {
  const unique = dedupe(all);
  if (unique.length <= L.maxReportedIssues) return { ok: false, issues: unique };
  const shown = unique.slice(0, L.maxReportedIssues);
  const more = unique.length - shown.length;
  return {
    ok: false,
    issues: [...shown, issue(Code.MORE_ISSUES, "", `…và ${more} lỗi nữa. Hãy sửa các lỗi trên rồi kiểm tra lại.`)],
  };
}

function issue(code: ExercisePackIssue["code"], path: string, message: string): ExercisePackIssue {
  return { code, path, message };
}

/** One issue per path: the first (earliest layer, most specific) report wins. */
function dedupe(all: readonly ExercisePackIssue[]): ExercisePackIssue[] {
  const seen = new Set<string>();
  const out: ExercisePackIssue[] = [];
  for (const entry of all) {
    if (seen.has(entry.path)) continue;
    seen.add(entry.path);
    out.push(entry);
  }
  return out;
}

function tooLarge(): ExercisePackIssue {
  return issue(
    Code.INPUT_TOO_LARGE,
    "",
    `Tệp quá lớn: giới hạn ${Math.floor(L.maxPackBytes / 1024)} KiB. Hãy chia nhỏ pack hoặc bỏ bớt dữ liệu.`,
  );
}

// --------------------------------------------------------------------------- layers 2-4

/**
 * Finds the nesting depth of JSON text without parsing it, so a hostile
 * "[[[[...]]]]" is rejected before JSON.parse allocates anything. String contents
 * (including escaped quotes) are skipped.
 */
function scanNestingDepth(text: string): ExercisePackIssue | null {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    if (inString) {
      if (char === 0x5c) i++; // backslash: skip the escaped character
      else if (char === 0x22) inString = false;
      continue;
    }
    if (char === 0x22) inString = true;
    else if (char === 0x7b || char === 0x5b) {
      depth++;
      if (depth > L.maxDepth) {
        return issue(Code.NESTING_TOO_DEEP, "", `Cấu trúc lồng quá sâu (tối đa ${L.maxDepth} cấp).`);
      }
    } else if (char === 0x7d || char === 0x5d) depth--;
  }
  return null;
}

function syntaxIssue(error: unknown, text: string): ExercisePackIssue {
  const raw = error instanceof Error ? error.message : String(error);
  const position = /position (\d+)/.exec(raw);
  let where = "";
  if (position) {
    const offset = Math.min(Number(position[1]), text.length);
    const before = text.slice(0, offset);
    const line = before.split("\n").length;
    const column = offset - (before.lastIndexOf("\n") + 1) + 1;
    where = ` (dòng ${line}, cột ${column})`;
  } else {
    const lineColumn = /line (\d+) column (\d+)/.exec(raw);
    if (lineColumn) where = ` (dòng ${lineColumn[1]}, cột ${lineColumn[2]})`;
  }
  return issue(
    Code.JSON_SYNTAX,
    "",
    `JSON không hợp lệ${where}: ${clip(raw, 100)}. Kiểm tra dấu phẩy, dấu ngoặc và dấu nháy kép.`,
  );
}

interface Frame {
  readonly value: unknown;
  readonly path: (string | number)[];
  readonly depth: number;
}

/**
 * Iterative walk (no recursion, so depth cannot overflow the stack). Rejects
 * anything that is not plain JSON data, over-deep or over-wide documents, and the
 * keys that enable prototype pollution. Own accessor properties are rejected
 * rather than read, so a hostile object cannot run code through the importer.
 */
function walkStructure(root: unknown): ExercisePackIssue[] {
  const issues: ExercisePackIssue[] = [];
  const stack: Frame[] = [{ value: root, path: [], depth: 1 }];
  let nodes = 0;
  let textLength = 0;
  const push = (code: ExercisePackIssue["code"], path: readonly (string | number)[], message: string) => {
    if (issues.length < L.maxReportedIssues * 2) issues.push(issue(code, toJsonPointer(path), message));
  };

  while (stack.length > 0) {
    const frame = stack.pop()!;
    const { value, path, depth } = frame;
    nodes++;
    if (nodes > L.maxNodes) {
      return [issue(Code.TOO_MANY_NODES, "", `Tài liệu có quá nhiều phần tử (tối đa ${L.maxNodes}).`)];
    }
    // Depth counts nested containers (objects / arrays); a scalar leaf is not a level.
    if (depth > L.maxDepth && typeof value === "object" && value !== null) {
      return [issue(Code.NESTING_TOO_DEEP, toJsonPointer(path), `Cấu trúc lồng quá sâu (tối đa ${L.maxDepth} cấp).`)];
    }

    if (value === null || typeof value === "boolean") continue;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) push(Code.NOT_JSON_DATA, path, "Số phải hữu hạn (không dùng NaN hoặc Infinity).");
      continue;
    }
    if (typeof value === "string") {
      textLength += value.length;
      if (textLength > L.maxPackBytes) return [tooLarge()];
      const problem = findTextProblem(value);
      if (problem !== null) push(Code.INVALID_VALUE, path, problem);
      continue;
    }
    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i--) {
        if (!(i in value)) {
          push(Code.NOT_JSON_DATA, [...path, i], "Mảng không được có phần tử trống.");
          continue;
        }
        stack.push({ value: value[i], path: [...path, i], depth: depth + 1 });
      }
      continue;
    }
    if (typeof value === "object") {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        push(Code.NOT_JSON_DATA, path, "Chỉ chấp nhận dữ liệu JSON thuần (object, mảng, chuỗi, số, boolean, null).");
        continue;
      }
      if (Object.getOwnPropertySymbols(value).length > 0) {
        push(Code.NOT_JSON_DATA, path, "Object không được có khóa dạng symbol.");
        continue;
      }
      for (const key of Object.keys(value).reverse()) {
        if (FORBIDDEN_OBJECT_KEYS.has(key)) {
          push(Code.FORBIDDEN_KEY, [...path, key], `Khóa \`${key}\` bị cấm ở mọi cấp của tài liệu.`);
          continue;
        }
        textLength += key.length;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor === undefined || !("value" in descriptor)) {
          push(Code.NOT_JSON_DATA, [...path, key], "Thuộc tính accessor (getter/setter) không được chấp nhận.");
          continue;
        }
        stack.push({ value: descriptor.value, path: [...path, key], depth: depth + 1 });
      }
      continue;
    }
    push(Code.NOT_JSON_DATA, path, "Chỉ chấp nhận dữ liệu JSON thuần (object, mảng, chuỗi, số, boolean, null).");
  }
  return issues;
}

/** NUL and unpaired surrogates have no faithful UTF-8 / Python form. */
function findTextProblem(text: string): string | null {
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit === 0) return "Chuỗi chứa ký tự NUL (U+0000), không được chấp nhận.";
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
      else return "Chuỗi chứa ký tự Unicode không hợp lệ (surrogate lẻ).";
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return "Chuỗi chứa ký tự Unicode không hợp lệ (surrogate lẻ).";
    }
  }
  return null;
}

// --------------------------------------------------------------------------- layer 5

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The document must be an object before anything else can be said about it. */
function checkShape(value: unknown): ExercisePackIssue[] {
  if (isRecord(value)) return [];
  return [issue(Code.WRONG_FORMAT, "", "Tài liệu phải là một object JSON có các trường format, schemaVersion, pack và exercises.")];
}

/**
 * Targeted reports that Zod's generic messages cannot make actionable: wrong format
 * marker, unsupported schema version, unsupported exercise kind.
 */
function preChecks(value: unknown): ExercisePackIssue[] {
  const out: ExercisePackIssue[] = [];
  if (!isRecord(value)) return out;
  if (value.format !== EXERCISE_PACK_FORMAT) {
    out.push(
      issue(
        Code.WRONG_FORMAT,
        "/format",
        `Trường "format" phải là "${EXERCISE_PACK_FORMAT}" (đang là ${describe(value.format)}). Đây có thể không phải một Exercise Pack.`,
      ),
    );
  }
  if (!(SUPPORTED_EXERCISE_PACK_SCHEMA_VERSIONS as readonly unknown[]).includes(value.schemaVersion)) {
    out.push(
      issue(
        Code.UNSUPPORTED_SCHEMA_VERSION,
        "/schemaVersion",
        `schemaVersion ${describe(value.schemaVersion)} chưa được hỗ trợ. Phiên bản hỗ trợ: ${SUPPORTED_EXERCISE_PACK_SCHEMA_VERSIONS.join(", ")}.`,
      ),
    );
  }
  if (Array.isArray(value.exercises)) {
    value.exercises.forEach((exercise, index) => {
      if (!isRecord(exercise)) return;
      if (!(SUPPORTED_EXERCISE_KINDS as readonly unknown[]).includes(exercise.kind)) {
        if (exercise.kind === undefined) return; // reported as a missing field by the schema
        out.push(
          issue(
            Code.UNSUPPORTED_KIND,
            `/exercises/${index}/kind`,
            `Loại bài ${describe(exercise.kind)} chưa được hỗ trợ. Hiện chỉ nhận: ${SUPPORTED_EXERCISE_KINDS.map((kind) => `"${kind}"`).join(", ")}. Pack bị từ chối toàn bộ, không cài phần nào.`,
          ),
        );
      }
    });
  }
  return out;
}

function describe(value: unknown): string {
  if (typeof value === "string") return `"${clip(value, 40)}"`;
  if (value === undefined) return "(thiếu)";
  if (typeof value === "number" || typeof value === "boolean" || value === null) return String(value);
  return Array.isArray(value) ? "mảng" : "object";
}

// Why a field is refused, by name (compared case-insensitively). Everything not
// listed is a plain UNKNOWN_FIELD; these are the extensions people reach for.
const FORBIDDEN_FIELD_HINTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(runtime|runtimeid|runtimes|runtimeconfig|interpreter|engine|kernel|backend)$/i, "Pack không được chọn runtime: bài luôn chạy bằng Pyodide trong trình duyệt."],
  [/^(script|scripts|scripturl|scripturls|src|url|urls|href|link|links|cdn|externalscripts?|remote)$/i, "Pack không được tham chiếu script hay URL bên ngoài; mọi nội dung phải nằm trong chính tệp."],
  [/^(import|imports|require|module|modules|plugin|plugins|loader|dynamicimport)$/i, "Pack không được import mã động hoặc plugin."],
  [/^(js|javascript|eval|function|functions|handler|handlers|hooks?|callback|callbacks|code_js|html)$/i, "Pack không được chứa mã JavaScript hay HTML thực thi; chỉ chứa dữ liệu."],
  [/^on[A-Z]\w*$/, "Pack không hỗ trợ event hook. (Văn bản phản hồi khi đạt/chưa đạt nằm trong \"feedback\": { \"onPass\", \"onFail\" }.)"],
  [/^(generator|generators|variants?|seed|seeds|template|templates)$/, "Bài sinh động theo seed/generator chưa được hỗ trợ; mỗi bài có đúng một đề cố định."],
  [/^(choices|options|answers?|mcq|question|questions|essay|rubric)$/, "Bài trắc nghiệm/tự luận chưa được hỗ trợ; hiện chỉ có bài code và debug."],
  [/^(hash|contenthash|checksum|signature|installedat)$/i, "Giá trị băm/chữ ký do ứng dụng tự tính; không đọc từ tệp."],
];

// All names the schema knows, for "did you mean" suggestions on unknown fields.
const KNOWN_FIELD_NAMES = [
  "format", "schemaVersion", "pack", "exercises", "id", "version", "title", "description", "language",
  "topic", "tags", "learningObjectives", "prerequisites", "authoring", "author", "createdAt", "generator",
  "license", "notes", "revision", "kind", "difficulty", "instructions", "starterCode", "setupVariables",
  "datasets", "allowedPackages", "grading", "checks", "hints", "feedback", "explanation", "referenceSolution",
  "symptom", "filename", "content", "level", "text", "onPass", "onFail", "type", "variable", "expected",
  "absoluteTolerance",
];

function suggest(key: string): string | null {
  let best: { name: string; distance: number } | null = null;
  for (const name of KNOWN_FIELD_NAMES) {
    const distance = editDistance(key.toLowerCase(), name.toLowerCase());
    if (distance <= 2 && (best === null || distance < best.distance)) best = { name, distance };
  }
  return best === null ? null : best.name;
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

function valueAt(root: unknown, path: readonly (string | number | symbol)[]): unknown {
  let current: unknown = root;
  for (const token of path) {
    if (typeof token === "symbol" || current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[token];
  }
  return current;
}

function mapZodIssue(zodIssue: ZodIssue, root: unknown): ExercisePackIssue[] {
  if (zodIssue.code === "unrecognized_keys") {
    return zodIssue.keys.map((key) => mapUnknownKey(zodIssue.path, key));
  }
  return [mapSingleZodIssue(zodIssue, root)];
}

function mapUnknownKey(parent: readonly (string | number | symbol)[], key: string): ExercisePackIssue {
  const path = toJsonPointer(parent);
  const where = path === "" ? "tài liệu" : `\`${path}\``;
  const fieldPath = `${path}/${escapeJsonPointerToken(key)}`;
  for (const [pattern, why] of FORBIDDEN_FIELD_HINTS) {
    if (pattern.test(key)) return issue(Code.FORBIDDEN_FIELD, fieldPath, `Trường \`${clip(key)}\` không được phép. ${why}`);
  }
  const near = suggest(key);
  return issue(
    Code.UNKNOWN_FIELD,
    fieldPath,
    `Trường lạ \`${clip(key)}\` trong ${where}.${near ? ` Có phải ý bạn là \`${near}\`?` : ""} Pack chặt chẽ: mọi trường phải thuộc schema.`,
  );
}

function mapSingleZodIssue(zodIssue: ZodIssue, root: unknown): ExercisePackIssue {
  const path = toJsonPointer(zodIssue.path);
  const at = valueAt(root, zodIssue.path);
  const where = path === "" ? "tài liệu" : `\`${path}\``;

  switch (zodIssue.code) {
    case "invalid_type": {
      if (at === undefined) return issue(Code.MISSING_FIELD, path, `Thiếu trường bắt buộc tại ${where}.`);
      return issue(Code.INVALID_TYPE, path, `Sai kiểu dữ liệu tại ${where}: cần ${zodIssue.expected}, đang là ${describeType(at)}.`);
    }
    case "too_big": {
      if (zodIssue.origin === "string") {
        return issue(Code.TOO_LONG, path, `Chuỗi tại ${where} quá dài: tối đa ${String(zodIssue.maximum)} ký tự.`);
      }
      if (zodIssue.origin === "array") {
        return issue(Code.TOO_MANY, path, `Quá nhiều phần tử tại ${where}: tối đa ${String(zodIssue.maximum)}.`);
      }
      return issue(Code.INVALID_VALUE, path, `Giá trị tại ${where} quá lớn: tối đa ${String(zodIssue.maximum)}.`);
    }
    case "too_small": {
      if (zodIssue.origin === "string" || zodIssue.origin === "array") {
        return issue(Code.INVALID_VALUE, path, `${zodIssue.origin === "string" ? "Chuỗi" : "Danh sách"} tại ${where} phải có ít nhất ${String(zodIssue.minimum)} ${zodIssue.origin === "string" ? "ký tự" : "phần tử"}.`);
      }
      return issue(Code.INVALID_VALUE, path, `Giá trị tại ${where} quá nhỏ: tối thiểu ${String(zodIssue.minimum)}.`);
    }
    case "invalid_value": {
      const values = zodIssue.values.map((entry) => `"${String(entry)}"`).join(", ");
      return issue(Code.INVALID_VALUE, path, `Giá trị tại ${where} không hợp lệ (đang là ${describe(at)}). Giá trị cho phép: ${values}.`);
    }
    case "invalid_union": {
      if (zodIssue.path[zodIssue.path.length - 1] === "type") {
        return issue(Code.INVALID_GRADING, path, `Loại kiểm tra ${describe(at)} chưa được hỗ trợ. Hỗ trợ: NO_EXCEPTION, VARIABLE_EXISTS, PYTHON_TYPE, NDARRAY_TYPE, SHAPE, EXACT_VALUES, APPROX_VALUES.`);
      }
      return issue(Code.INVALID_VALUE, path, `Giá trị tại ${where} không khớp bất kỳ dạng nào được hỗ trợ.`);
    }
    case "custom": {
      const tag = (zodIssue.params as { packCode?: string } | undefined)?.packCode;
      const code = (tag !== undefined && tag in Code ? tag : Code.INVALID_VALUE) as ExercisePackIssue["code"];
      return issue(code, path, zodIssue.message);
    }
    default:
      return issue(Code.INVALID_VALUE, path, `Giá trị tại ${where} không hợp lệ: ${clip(zodIssue.message, 100)}`);
  }
}

function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "mảng";
  return typeof value === "object" ? "object" : typeof value;
}

// --------------------------------------------------------------------------- layer 6

function checkSemantics(pack: ExercisePack): ExercisePackIssue[] {
  const out: ExercisePackIssue[] = [];
  const add = (code: ExercisePackIssue["code"], path: string, message: string) => {
    out.push(issue(code, path, message));
  };

  // Pack metadata.
  duplicatesOf(pack.pack.tags).forEach((index) =>
    add(Code.DUPLICATE_VALUE, `/pack/tags/${index}`, "Thẻ (tag) bị trùng."),
  );
  duplicatesOf(pack.pack.learningObjectives).forEach((index) =>
    add(Code.DUPLICATE_VALUE, `/pack/learningObjectives/${index}`, "Mục tiêu học tập bị trùng."),
  );
  duplicatesOf(pack.pack.prerequisites).forEach((index) =>
    add(Code.DUPLICATE_VALUE, `/pack/prerequisites/${index}`, "Điều kiện tiên quyết bị trùng."),
  );

  // Exercises.
  const ids = new Map<string, number>();
  pack.exercises.forEach((exercise, index) => {
    const base = `/exercises/${index}`;
    const firstSeen = ids.get(exercise.id);
    if (firstSeen !== undefined) {
      add(Code.DUPLICATE_ID, `${base}/id`, `Mã bài \`${clip(exercise.id)}\` bị trùng với bài số ${firstSeen + 1}.`);
    } else {
      ids.set(exercise.id, index);
    }
    checkExercise(exercise, base, add);
  });
  return out;
}

function duplicatesOf(values: readonly string[]): number[] {
  const seen = new Set<string>();
  const dup: number[] = [];
  values.forEach((value, index) => {
    const key = value.trim().toLowerCase();
    if (seen.has(key)) dup.push(index);
    seen.add(key);
  });
  return dup;
}

type Add = (code: ExercisePackIssue["code"], path: string, message: string) => void;

function checkExercise(exercise: PackExercise, base: string, add: Add): void {
  // Contradictory content for the declared kind.
  if (exercise.kind === "debug" && exercise.starterCode.trim().length === 0) {
    add(Code.CONTRADICTORY_METADATA, `${base}/starterCode`, "Bài loại \"debug\" cần mã khởi đầu (mã có lỗi) để người học sửa; hiện đang trống.");
  }
  if (exercise.referenceSolution !== undefined && exercise.referenceSolution.trim().length === 0) {
    add(Code.INVALID_VALUE, `${base}/referenceSolution`, "referenceSolution không được để trống; bỏ trường này nếu không có lời giải.");
  }

  // Setup variables become Python globals.
  const setupNames = new Set<string>();
  const setup = exercise.setupVariables;
  if (setup !== undefined) {
    const names = Object.keys(setup);
    if (names.length > L.maxSetupVariables) {
      add(Code.TOO_MANY, `${base}/setupVariables`, `Quá nhiều biến setup: tối đa ${L.maxSetupVariables}.`);
    }
    for (const name of names) {
      const problem = findPythonNameProblem(name, L.maxIdentifierLength);
      if (problem !== null) addNameProblem(add, `${base}/setupVariables/${escapeJsonPointerToken(name)}`, name, problem);
      setupNames.add(name);
    }
  }

  // Runtime packages: stricter than the Worker (exact lowercase names, no duplicates).
  const packages = exercise.allowedPackages ?? [];
  const seenPackages = new Set<string>();
  packages.forEach((name, index) => {
    const path = `${base}/allowedPackages/${index}`;
    if (!isAllowedRuntimePackage(name) || name !== name.toLowerCase()) {
      add(Code.UNSUPPORTED_PACKAGE, path, `Gói \`${clip(name)}\` chưa được hỗ trợ trong trình duyệt. Gói hợp lệ: ${ALLOWED_RUNTIME_PACKAGE_NAMES.join(", ")} (viết thường).`);
    } else if (seenPackages.has(name)) {
      add(Code.DUPLICATE_VALUE, path, `Gói \`${name}\` bị khai báo hai lần.`);
    }
    seenPackages.add(name);
  });

  // Datasets are written into the virtual data/ directory.
  const filenames = new Set<string>();
  let datasetBytes = 0;
  (exercise.datasets ?? []).forEach((dataset, index) => {
    const path = `${base}/datasets/${index}`;
    const name = dataset.filename;
    if (!isSafeDatasetFilename(name)) {
      add(Code.UNSAFE_FILENAME, `${path}/filename`, `Tên tệp dữ liệu \`${clip(name)}\` không an toàn. Chỉ dùng chữ, số, ".", "_", "-"; không bắt đầu bằng dấu chấm, không có "..", không có dấu "/".`);
    } else if (filenames.has(name.toLowerCase())) {
      add(Code.DUPLICATE_VALUE, `${path}/filename`, `Tên tệp dữ liệu \`${clip(name)}\` bị trùng (không phân biệt hoa/thường).`);
    }
    filenames.add(name.toLowerCase());
    datasetBytes += utf8ByteLength(dataset.content);
  });
  if (datasetBytes > L.maxDatasetBytesPerExercise) {
    add(Code.DATASET_TOO_LARGE, `${base}/datasets`, `Tổng dữ liệu của bài vượt giới hạn ${Math.floor(L.maxDatasetBytesPerExercise / 1024)} KiB.`);
  }

  // Hints are an ordered H1..Hn prefix (the HintEngine contract).
  (exercise.hints ?? []).forEach((hint, index) => {
    const expected = `H${index + 1}`;
    if (hint.level !== expected) {
      add(Code.INVALID_HINTS, `${base}/hints/${index}/level`, `Gợi ý thứ ${index + 1} phải có level "${expected}" (đang là "${hint.level}"). Các gợi ý đi liền theo thứ tự H1, H2, H3, H4.`);
    }
  });

  checkGrading(exercise, base, setupNames, add);
}

function addNameProblem(add: Add, path: string, name: string, problem: NonNullable<ReturnType<typeof findPythonNameProblem>>): void {
  const label = clip(name);
  switch (problem) {
    case "NOT_IDENTIFIER":
      add(Code.INVALID_IDENTIFIER, path, `\`${label}\` không phải tên biến Python hợp lệ (chỉ chữ ASCII, số, "_"; không bắt đầu bằng số).`);
      break;
    case "TOO_LONG":
      add(Code.INVALID_IDENTIFIER, path, `Tên biến \`${label}\` quá dài (tối đa ${L.maxIdentifierLength} ký tự).`);
      break;
    case "KEYWORD":
      add(Code.PYTHON_KEYWORD, path, `\`${label}\` là từ khóa của Python, không dùng làm tên biến.`);
      break;
    case "RESERVED":
      add(Code.RESERVED_NAME, path, `Tên \`${label}\` bị dành riêng (tên bắt đầu bằng "__" thuộc về runtime).`);
      break;
  }
}

function isSafeDatasetFilename(name: string): boolean {
  return (
    isSimpleDatasetFilename(name) &&
    name.length <= L.maxDatasetFilenameLength &&
    !name.startsWith(".") &&
    !name.endsWith(".") &&
    !name.includes("..")
  );
}

const PYTHON_TYPE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function checkGrading(exercise: PackExercise, base: string, setupNames: ReadonlySet<string>, add: Add): void {
  const checks = exercise.grading.checks;
  const byKey = new Map<string, { index: number; canonical: string }>();
  let meaningful = false;

  checks.forEach((check: PackCheck, index) => {
    const path = `${base}/grading/checks/${index}`;
    if ("variable" in check) {
      const problem = findPythonNameProblem(check.variable, L.maxIdentifierLength);
      if (problem !== null) addNameProblem(add, `${path}/variable`, check.variable, problem);
      else if (setupNames.has(check.variable)) {
        add(Code.INVALID_GRADING, `${path}/variable`, `Biến được chấm \`${check.variable}\` trùng tên một biến setup; bài sẽ được chấm trên dữ liệu có sẵn thay vì kết quả của người học.`);
      }
    }
    if (check.type === "PYTHON_TYPE" && !PYTHON_TYPE_NAME.test(check.expected)) {
      add(Code.INVALID_GRADING, `${path}/expected`, `Tên kiểu Python \`${clip(check.expected)}\` không hợp lệ (ví dụ "float", "list", "ndarray").`);
    }
    if (check.type === "EXACT_VALUES" && containsGradingDataReference(check.expected)) {
      add(Code.INVALID_GRADING, `${path}/expected`, "Không dùng tham chiếu \"$gradingData\" trong pack; hãy ghi thẳng giá trị mong đợi.");
    }
    if (check.type === "PYTHON_TYPE" || check.type === "NDARRAY_TYPE" || check.type === "SHAPE" || check.type === "EXACT_VALUES" || check.type === "APPROX_VALUES") {
      meaningful = true;
    }
    // Two different expectations for the same thing can never both hold.
    if ("expected" in check) {
      const key = `${check.type}:${check.variable}`;
      const canonical = canonicalJson(check.expected);
      const earlier = byKey.get(key);
      if (earlier === undefined) byKey.set(key, { index, canonical });
      else if (earlier.canonical !== canonical && check.type !== "PYTHON_TYPE") {
        add(Code.INVALID_GRADING, path, `Mâu thuẫn với kiểm tra số ${earlier.index + 1}: cùng loại ${check.type} trên biến \`${check.variable}\` nhưng giá trị mong đợi khác nhau.`);
      } else if (earlier.canonical !== canonical) {
        add(Code.INVALID_GRADING, path, `Mâu thuẫn với kiểm tra số ${earlier.index + 1}: hai kiểu Python khác nhau cho biến \`${check.variable}\`.`);
      }
    }
  });

  if (!meaningful) {
    add(Code.WEAK_GRADING, `${base}/grading/checks`, "Các kiểm tra quá yếu: cần ít nhất một kiểm tra PYTHON_TYPE, NDARRAY_TYPE, SHAPE, EXACT_VALUES hoặc APPROX_VALUES, nếu không mọi mã đều đạt.");
  }
  // The domain grader schema is the final authority on the checks themselves.
  const domain = DeclarativeGraderConfigSchema.safeParse({ checks });
  if (!domain.success) {
    add(Code.INVALID_GRADING, `${base}/grading/checks`, `Cấu hình chấm điểm bị bộ chấm của ứng dụng từ chối: ${clip(domain.error.issues[0]?.message ?? "không hợp lệ", 100)}`);
  }
}

function containsGradingDataReference(value: unknown): boolean {
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) stack.push(...current);
    else if (isRecord(current)) {
      if (Object.hasOwn(current, "$gradingData")) return true;
      stack.push(...Object.values(current));
    }
  }
  return false;
}

// --------------------------------------------------------------------------- layer 7 + lint

function adapterIssues(pack: ExercisePack, error: unknown): ExercisePackIssue[] {
  const message = error instanceof Error ? error.message : String(error);
  // Zod errors from the domain schemas carry the path of the failing domain field,
  // which means nothing to the author; point at the exercise instead.
  const exerciseIndex = findFailingExerciseIndex(pack);
  return [
    issue(
      Code.ADAPTER_REJECTED,
      exerciseIndex === null ? "/exercises" : `/exercises/${exerciseIndex}`,
      `Ứng dụng không thể chuyển bài này thành nhiệm vụ chạy được: ${clip(message.replace(/\s+/g, " "), 160)}`,
    ),
  ];
}

function findFailingExerciseIndex(pack: ExercisePack): number | null {
  for (let index = 0; index < pack.exercises.length; index++) {
    try {
      adaptExercisePack({ ...pack, exercises: [pack.exercises[index]!] });
    } catch {
      return index;
    }
  }
  return null;
}

function lint(pack: ExercisePack): ExercisePackIssue[] {
  const warnings: ExercisePackIssue[] = [];
  pack.exercises.forEach((exercise, index) => {
    if (exercise.referenceSolution === undefined) {
      warnings.push(
        issue(Code.NO_REFERENCE_SOLUTION, `/exercises/${index}/referenceSolution`, "Bài chưa có referenceSolution nên không thể kiểm chứng tự động rằng đề giải được (chỉ cảnh báo)."),
      );
    }
  });
  return warnings;
}
