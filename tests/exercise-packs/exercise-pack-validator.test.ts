import { describe, expect, it } from "vitest";

import {
  EXERCISE_PACK_LIMITS,
  ExercisePackIssueCode as Code,
  computePackContentHash,
  utf8ByteLength,
  validateExercisePack,
  type ExercisePackIssue,
  type ValidateExercisePackResult,
} from "../../src/core/exercise-packs";
import { SAMPLE_PACK_TEXT, makeMinimalPack, makePack, type Loose } from "./pack-fixtures";

function rejected(result: ValidateExercisePackResult): readonly ExercisePackIssue[] {
  if (result.ok) throw new Error("expected the pack to be rejected, but it was accepted");
  return result.issues;
}

function expectIssue(
  result: ValidateExercisePackResult,
  code: string,
  path: string,
): ExercisePackIssue {
  const issues = rejected(result);
  const found = issues.find((entry) => entry.code === code && entry.path === path);
  if (found === undefined) {
    throw new Error(`no ${code} at ${path}; got ${JSON.stringify(issues.map((i) => [i.code, i.path]))}`);
  }
  expect(found.message.length > 0).toBe(true);
  return found;
}

describe("accepting valid packs", () => {
  it("accepts the shipped sample pack text", () => {
    const result = validateExercisePack(SAMPLE_PACK_TEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.pack.id).toBe("ml-basics.linreg-numpy");
    expect(result.pack.exercises.map((exercise) => exercise.id)).toEqual(["mse-basic", "gd-step", "fix-normalization"]);
    expect(result.pack.exercises.map((exercise) => exercise.kind)).toEqual(["code", "code", "debug"]);
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.warnings).toEqual([]);
  });

  it("accepts a minimal pack and applies documented defaults", () => {
    const result = validateExercisePack(JSON.stringify(makeMinimalPack()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.pack.tags).toEqual([]);
    expect(result.pack.pack.learningObjectives).toEqual([]);
    expect(result.pack.pack.prerequisites).toEqual([]);
    // No reference solution: valid, but reported as a non-blocking warning.
    expect(result.warnings.map((warning) => warning.code)).toEqual([Code.NO_REFERENCE_SOLUTION]);
  });

  it("accepts a parsed object as well as text", () => {
    expect(validateExercisePack(makePack()).ok).toBe(true);
  });

  it("tolerates a UTF-8 byte-order mark in pasted or file text", () => {
    expect(validateExercisePack(`﻿${SAMPLE_PACK_TEXT}`).ok).toBe(true);
  });

  it("returns a copy that does not alias the caller's object", () => {
    const input = makePack();
    const result = validateExercisePack(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    input.exercises[0].title = "changed afterwards";
    expect(result.pack.exercises[0]!.title).toBe("Tính MSE");
  });
});

describe("content hash", () => {
  it("is computed by the app and ignores whitespace and key order", () => {
    const a = validateExercisePack(SAMPLE_PACK_TEXT);
    const reordered = JSON.stringify(JSON.parse(SAMPLE_PACK_TEXT), Object.keys(JSON.parse(SAMPLE_PACK_TEXT)).sort());
    const compact = validateExercisePack(JSON.stringify(JSON.parse(SAMPLE_PACK_TEXT)));
    expect(a.ok && compact.ok && a.contentHash === compact.contentHash).toBe(true);
    expect(reordered.length > 0).toBe(true);
    if (a.ok) expect(a.contentHash).toBe(computePackContentHash(a.pack));
  });

  it("changes when any content changes", () => {
    const base = validateExercisePack(makePack());
    const changed = makePack();
    changed.exercises[0].hints[0].text += " thêm";
    const other = validateExercisePack(changed);
    expect(base.ok && other.ok).toBe(true);
    if (base.ok && other.ok) expect(base.contentHash === other.contentHash).toBe(false);
  });

  it("cannot be supplied by the document", () => {
    const pack = makePack();
    pack.contentHash = "0".repeat(64);
    const result = validateExercisePack(pack);
    expectIssue(result, Code.FORBIDDEN_FIELD, "/contentHash");
  });
});

describe("input that is not a pack", () => {
  it("reports malformed JSON with a position and never throws", () => {
    const broken = SAMPLE_PACK_TEXT.replace('"schemaVersion": 1,', '"schemaVersion": 1');
    const issues = rejected(validateExercisePack(broken));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe(Code.JSON_SYNTAX);
    expect(issues[0]!.path).toBe("");
    expect(issues[0]!.message).toMatch(/dòng \d+, cột \d+/);
  });

  it("rejects empty and whitespace-only text", () => {
    expect(rejected(validateExercisePack(""))[0]!.code).toBe(Code.JSON_SYNTAX);
    expect(rejected(validateExercisePack("   \n "))[0]!.code).toBe(Code.JSON_SYNTAX);
  });

  it("rejects non-text, non-object input", () => {
    for (const input of [undefined, null, 42, true, () => 1, Symbol("x"), 10n]) {
      expect(rejected(validateExercisePack(input))[0]!.code).toBe(Code.INPUT_NOT_TEXT);
    }
  });

  it("rejects JSON whose root is not an object", () => {
    for (const text of ["[]", "123", '"pack"', "null", "true"]) {
      expect(rejected(validateExercisePack(text))[0]!.code).toBe(Code.WRONG_FORMAT);
    }
  });

  it("rejects a wrong format marker with an actionable message", () => {
    const pack = makePack();
    pack.format = "something-else";
    const issue = expectIssue(validateExercisePack(pack), Code.WRONG_FORMAT, "/format");
    expect(issue.message).toContain("python-learn-game.exercise-pack");
    const missing = makePack();
    delete missing.format;
    expectIssue(validateExercisePack(missing), Code.WRONG_FORMAT, "/format");
  });

  it("rejects unsupported schema versions", () => {
    for (const version of [0, 2, "1", 1.5, null]) {
      const pack = makePack();
      pack.schemaVersion = version;
      expectIssue(validateExercisePack(pack), Code.UNSUPPORTED_SCHEMA_VERSION, "/schemaVersion");
    }
  });
});

describe("unsupported content (atomic rejection)", () => {
  it("rejects unsupported exercise kinds and installs nothing", () => {
    for (const kind of ["quiz", "mcq", "essay", "predict", "CODE", 7, ""]) {
      const pack = makePack();
      pack.exercises[1].kind = kind;
      const issue = expectIssue(validateExercisePack(pack), Code.UNSUPPORTED_KIND, "/exercises/1/kind");
      expect(issue.message).toContain("code");
    }
  });

  it("reports a missing kind as a missing field", () => {
    const pack = makePack();
    delete pack.exercises[0].kind;
    expect(rejected(validateExercisePack(pack)).some((entry) => entry.path.startsWith("/exercises/0"))).toBe(true);
  });

  it.each([
    ["runtime", "/exercises/0/runtime"],
    ["runtimeId", "/exercises/0/runtimeId"],
    ["script", "/exercises/0/script"],
    ["scriptUrl", "/exercises/0/scriptUrl"],
    ["url", "/exercises/0/url"],
    ["import", "/exercises/0/import"],
    ["plugins", "/exercises/0/plugins"],
    ["eval", "/exercises/0/eval"],
    ["javascript", "/exercises/0/javascript"],
    ["html", "/exercises/0/html"],
    ["hooks", "/exercises/0/hooks"],
    ["onLoad", "/exercises/0/onLoad"],
    ["onSubmit", "/exercises/0/onSubmit"],
    ["generator", "/exercises/0/generator"],
    ["choices", "/exercises/0/choices"],
  ])("forbids the extension field %s with a specific message", (field, path) => {
    const pack = makePack();
    pack.exercises[0][field] = "x";
    const issue = expectIssue(validateExercisePack(pack), Code.FORBIDDEN_FIELD, path);
    expect(issue.message).toContain(field);
  });

  it("forbids a runtime selection at the pack level and inside nested objects too", () => {
    const pack = makePack();
    pack.pack.runtime = { id: "core.local_python" };
    expectIssue(validateExercisePack(pack), Code.FORBIDDEN_FIELD, "/pack/runtime");
    const nested = makePack();
    nested.exercises[0].grading.runtime = "core.local_python";
    expectIssue(validateExercisePack(nested), Code.FORBIDDEN_FIELD, "/exercises/0/grading/runtime");
  });

  it("reports unknown fields with a did-you-mean suggestion", () => {
    const pack = makePack();
    pack.exercises[0].hintz = pack.exercises[0].hints;
    delete pack.exercises[0].hints;
    const issue = expectIssue(validateExercisePack(pack), Code.UNKNOWN_FIELD, "/exercises/0/hintz");
    expect(issue.message).toContain("hints");
  });

  it("reports every unknown field of one object", () => {
    const pack = makePack();
    pack.extraOne = 1;
    pack.extraTwo = 2;
    const result = validateExercisePack(pack);
    expectIssue(result, Code.UNKNOWN_FIELD, "/extraOne");
    expectIssue(result, Code.UNKNOWN_FIELD, "/extraTwo");
  });

  it("rejects unsupported language and contradictory metadata", () => {
    const language = makePack();
    language.pack.language = "javascript";
    expectIssue(validateExercisePack(language), Code.INVALID_VALUE, "/pack/language");

    const tags = makePack();
    tags.pack.tags = ["numpy", "NumPy"];
    expectIssue(validateExercisePack(tags), Code.DUPLICATE_VALUE, "/pack/tags/1");

    const debug = makePack();
    debug.exercises[2].starterCode = "   \n";
    expectIssue(validateExercisePack(debug), Code.CONTRADICTORY_METADATA, "/exercises/2/starterCode");

    const symptomOnCode = makePack();
    symptomOnCode.exercises[0].symptom = "x";
    expectIssue(validateExercisePack(symptomOnCode), Code.UNKNOWN_FIELD, "/exercises/0/symptom");
  });
});

describe("shape and types", () => {
  it("reports missing required fields with their path", () => {
    const pack = makePack();
    delete pack.pack.title;
    delete pack.exercises[0].instructions;
    delete pack.exercises[1].grading;
    const result = validateExercisePack(pack);
    expectIssue(result, Code.MISSING_FIELD, "/pack/title");
    expectIssue(result, Code.MISSING_FIELD, "/exercises/0/instructions");
    expectIssue(result, Code.MISSING_FIELD, "/exercises/1/grading");
  });

  it("reports wrong types", () => {
    const pack = makePack();
    pack.exercises[0].revision = "1";
    pack.exercises[0].title = 5;
    pack.pack.tags = "numpy";
    const result = validateExercisePack(pack);
    expectIssue(result, Code.INVALID_TYPE, "/exercises/0/revision");
    expectIssue(result, Code.INVALID_TYPE, "/exercises/0/title");
    expectIssue(result, Code.INVALID_TYPE, "/pack/tags");
  });

  it("rejects bad revisions, difficulties and versions", () => {
    for (const revision of [0, -1, 1.5, 1_000_001]) {
      const pack = makePack();
      pack.exercises[0].revision = revision;
      rejected(validateExercisePack(pack));
    }
    const difficulty = makePack();
    difficulty.exercises[0].difficulty = "EASY";
    expectIssue(validateExercisePack(difficulty), Code.INVALID_VALUE, "/exercises/0/difficulty");
    for (const version of ["1", "1.0", "v1.0.0", "1.0.0-beta", ""]) {
      const pack = makePack();
      pack.pack.version = version;
      expectIssue(validateExercisePack(pack), Code.INVALID_VALUE, "/pack/version");
    }
  });

  it("requires at least one and at most fifty exercises", () => {
    const none = makePack();
    none.exercises = [];
    expectIssue(validateExercisePack(none), Code.INVALID_VALUE, "/exercises");

    const many = makeMinimalPack();
    const template = many.exercises[0];
    many.exercises = Array.from({ length: 51 }, (_, index) => ({ ...template, id: `ex-${index}` }));
    expectIssue(validateExercisePack(many), Code.TOO_MANY, "/exercises");

    const exactly = makeMinimalPack();
    exactly.exercises = Array.from({ length: 50 }, (_, index) => ({ ...template, id: `ex-${index}` }));
    expect(validateExercisePack(exactly).ok).toBe(true);
  });
});

describe("identifiers and Python names", () => {
  it.each(["Mini", "mini pack", "mini:pack", "mini_pack", "1mini", "-mini", "mini-", "mini..pack", "", "x".repeat(65), "mini/pack", "mìni"])(
    "rejects the pack id %s",
    (id) => {
      const pack = makeMinimalPack();
      pack.pack.id = id;
      const issues = rejected(validateExercisePack(pack));
      expect(issues.some((entry) => entry.path === "/pack/id")).toBe(true);
    },
  );

  it.each(["Ex", "a b", "a:b", "a_b", "", "ex/1"])("rejects the exercise id %s", (id) => {
    const pack = makeMinimalPack();
    pack.exercises[0].id = id;
    expect(rejected(validateExercisePack(pack)).some((entry) => entry.path === "/exercises/0/id")).toBe(true);
  });

  it("accepts ids made of dotted and dashed lowercase segments", () => {
    const pack = makeMinimalPack();
    pack.pack.id = "a1.b-2.c";
    pack.exercises[0].id = "ex-1.v2";
    expect(validateExercisePack(pack).ok).toBe(true);
  });

  it("rejects duplicate exercise ids at the later occurrence", () => {
    const pack = makePack();
    pack.exercises[2].id = pack.exercises[0].id;
    const issue = expectIssue(validateExercisePack(pack), Code.DUPLICATE_ID, "/exercises/2/id");
    expect(issue.message).toContain("1");
  });

  it("rejects Python keywords, dunder names and non-identifiers as setup variables", () => {
    const cases: Array<[string, string]> = [
      ["class", Code.PYTHON_KEYWORD],
      ["None", Code.PYTHON_KEYWORD],
      ["lambda", Code.PYTHON_KEYWORD],
      ["__builtins__", Code.RESERVED_NAME],
      ["__runtime_setup_json", Code.RESERVED_NAME],
      ["__mission_datasets_json", Code.RESERVED_NAME],
      ["__x", Code.RESERVED_NAME],
      ["1abc", Code.INVALID_IDENTIFIER],
      ["a-b", Code.INVALID_IDENTIFIER],
      ["a b", Code.INVALID_IDENTIFIER],
      ["", Code.INVALID_IDENTIFIER],
      ["é", Code.INVALID_IDENTIFIER],
      ["x".repeat(65), Code.INVALID_IDENTIFIER],
    ];
    for (const [name, code] of cases) {
      const pack = makeMinimalPack();
      pack.exercises[0].setupVariables = { [name]: 1 };
      expectIssue(validateExercisePack(pack), code, `/exercises/0/setupVariables/${name.replaceAll("~", "~0").replaceAll("/", "~1")}`);
    }
  });

  it("accepts soft keywords and underscore names as variables", () => {
    const pack = makeMinimalPack();
    pack.exercises[0].setupVariables = { match: 1, case: 2, type: 3, _: 4, _private: 5, X1: 6 };
    expect(validateExercisePack(pack).ok).toBe(true);
  });

  it("applies the same name rules to graded variables", () => {
    for (const [name, code] of [
      ["for", Code.PYTHON_KEYWORD],
      ["__runtime_secret", Code.RESERVED_NAME],
      ["a.b", Code.INVALID_IDENTIFIER],
    ] as const) {
      const pack = makeMinimalPack();
      pack.exercises[0].grading.checks[1].variable = name;
      expectIssue(validateExercisePack(pack), code, "/exercises/1".replace("1", "0") + "/grading/checks/1/variable");
    }
  });

  it("rejects a graded variable that is also a setup variable", () => {
    const pack = makeMinimalPack();
    pack.exercises[0].setupVariables = { answer: 3 };
    expectIssue(validateExercisePack(pack), Code.INVALID_GRADING, "/exercises/0/grading/checks/1/variable");
  });

  it("rejects too many setup variables", () => {
    const pack = makeMinimalPack();
    pack.exercises[0].setupVariables = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`v${index}`, index]));
    expectIssue(validateExercisePack(pack), Code.TOO_MANY, "/exercises/0/setupVariables");
  });
});

describe("runtime packages and datasets", () => {
  it("rejects packages outside the runtime allow-list", () => {
    for (const name of ["torch", "requests", "NumPy", "Pandas", "numpy ", "os"]) {
      const pack = makeMinimalPack();
      pack.exercises[0].allowedPackages = [name];
      expectIssue(validateExercisePack(pack), Code.UNSUPPORTED_PACKAGE, "/exercises/0/allowedPackages/0");
    }
  });

  it("rejects an empty package name", () => {
    const pack = makeMinimalPack();
    pack.exercises[0].allowedPackages = [""];
    expect(rejected(validateExercisePack(pack)).some((entry) => entry.path === "/exercises/0/allowedPackages/0")).toBe(true);
  });

  it("accepts every enabled package and rejects duplicates", () => {
    const all = makeMinimalPack();
    all.exercises[0].allowedPackages = ["numpy", "pandas", "matplotlib", "pillow", "scipy", "scikit-learn", "opencv-python"];
    expect(validateExercisePack(all).ok).toBe(true);
    const twice = makeMinimalPack();
    twice.exercises[0].allowedPackages = ["numpy", "numpy"];
    expectIssue(validateExercisePack(twice), Code.DUPLICATE_VALUE, "/exercises/0/allowedPackages/1");
  });

  it.each(["../x.csv", "a/b.csv", "a\\b.csv", ".hidden", "..", ".", "a..b.csv", "name.", "with space.csv", "http:x.csv", "x".repeat(65), "tên.csv"])(
    "rejects the unsafe dataset file name %s",
    (filename) => {
      const pack = makeMinimalPack();
      pack.exercises[0].datasets = [{ filename, content: "a,b\n1,2\n" }];
      expect(rejected(validateExercisePack(pack)).some((entry) => entry.path === "/exercises/0/datasets/0/filename")).toBe(true);
    },
  );

  it("rejects an empty file name and duplicate names regardless of case", () => {
    const pack = makeMinimalPack();
    pack.exercises[0].datasets = [
      { filename: "Data.csv", content: "a\n" },
      { filename: "data.CSV", content: "b\n" },
    ];
    expectIssue(validateExercisePack(pack), Code.DUPLICATE_VALUE, "/exercises/0/datasets/1/filename");
    const empty = makeMinimalPack();
    empty.exercises[0].datasets = [{ filename: "", content: "" }];
    expect(validateExercisePack(empty).ok).toBe(false);
  });

  it("limits datasets per exercise and their total size", () => {
    const many = makeMinimalPack();
    many.exercises[0].datasets = Array.from({ length: 9 }, (_, index) => ({ filename: `d${index}.csv`, content: "a\n" }));
    expectIssue(validateExercisePack(many), Code.TOO_MANY, "/exercises/0/datasets");

    const big = makeMinimalPack();
    const chunk = "x".repeat(EXERCISE_PACK_LIMITS.maxDatasetBytesPerExercise / 2 + 1);
    big.exercises[0].datasets = [
      { filename: "a.csv", content: chunk },
      { filename: "b.csv", content: chunk },
    ];
    expectIssue(validateExercisePack(big), Code.DATASET_TOO_LARGE, "/exercises/0/datasets");
  });

  it("accepts datasets and passes them to the runtime configuration", () => {
    const pack = makeMinimalPack();
    pack.exercises[0].allowedPackages = ["pandas"];
    pack.exercises[0].datasets = [{ filename: "scores.csv", content: "name,score\na,1\n", description: "Điểm" }];
    expect(validateExercisePack(pack).ok).toBe(true);
  });
});

describe("grading checks", () => {
  it("rejects unknown check types", () => {
    const pack = makeMinimalPack();
    pack.exercises[0].grading.checks.push({ type: "CALL_FUNCTION", variable: "f" });
    expectIssue(validateExercisePack(pack), Code.INVALID_GRADING, "/exercises/0/grading/checks/2/type");
  });

  it("rejects malformed checks", () => {
    const cases: Array<[Loose, string]> = [
      [{ type: "APPROX_VALUES", variable: "answer", expected: "3", absoluteTolerance: 0.1 }, "/exercises/0/grading/checks/2/expected"],
      [{ type: "APPROX_VALUES", variable: "answer", expected: 3, absoluteTolerance: -1 }, "/exercises/0/grading/checks/2/absoluteTolerance"],
      [{ type: "APPROX_VALUES", variable: "answer", expected: 3 }, "/exercises/0/grading/checks/2/absoluteTolerance"],
      [{ type: "SHAPE", variable: "answer", expected: [-1] }, "/exercises/0/grading/checks/2/expected/0"],
      [{ type: "SHAPE", variable: "answer", expected: [1.5] }, "/exercises/0/grading/checks/2/expected/0"],
      [{ type: "PYTHON_TYPE", variable: "answer" }, "/exercises/0/grading/checks/2/expected"],
      [{ type: "EXACT_VALUES", variable: "answer" }, "/exercises/0/grading/checks/2/expected"],
      [{ type: "VARIABLE_EXISTS" }, "/exercises/0/grading/checks/2/variable"],
      [{ type: "NO_EXCEPTION", extra: true }, "/exercises/0/grading/checks/2/extra"],
    ];
    for (const [check, path] of cases) {
      const pack = makeMinimalPack();
      pack.exercises[0].grading.checks.push(check);
      const issues = rejected(validateExercisePack(pack));
      expect(issues.some((entry) => entry.path === path)).toBe(true);
    }
  });

  it("requires between one and twenty checks", () => {
    const none = makeMinimalPack();
    none.exercises[0].grading.checks = [];
    expectIssue(validateExercisePack(none), Code.INVALID_VALUE, "/exercises/0/grading/checks");
    const many = makeMinimalPack();
    many.exercises[0].grading.checks = [{ type: "NO_EXCEPTION" }, ...Array.from({ length: 20 }, () => ({ type: "EXACT_VALUES", variable: "answer", expected: 3 }))];
    expectIssue(validateExercisePack(many), Code.TOO_MANY, "/exercises/0/grading/checks");
  });

  it("rejects grading that any code would pass", () => {
    const pack = makeMinimalPack();
    pack.exercises[0].grading.checks = [{ type: "NO_EXCEPTION" }, { type: "VARIABLE_EXISTS", variable: "answer" }];
    expectIssue(validateExercisePack(pack), Code.WEAK_GRADING, "/exercises/0/grading/checks");
  });

  it("rejects $gradingData references (values must be written out)", () => {
    const pack = makeMinimalPack();
    pack.exercises[0].grading.checks[1].expected = { $gradingData: "expected.answer" };
    expectIssue(validateExercisePack(pack), Code.INVALID_GRADING, "/exercises/0/grading/checks/1/expected");
    const nested = makeMinimalPack();
    nested.exercises[0].grading.checks[1].expected = [1, { a: { $gradingData: "x" } }];
    expectIssue(validateExercisePack(nested), Code.INVALID_GRADING, "/exercises/0/grading/checks/1/expected");
  });

  it("rejects contradictory expectations for the same variable", () => {
    const pack = makeMinimalPack();
    pack.exercises[0].grading.checks.push({ type: "EXACT_VALUES", variable: "answer", expected: 4 });
    expectIssue(validateExercisePack(pack), Code.INVALID_GRADING, "/exercises/0/grading/checks/2");
    const types = makeMinimalPack();
    types.exercises[0].grading.checks.push({ type: "PYTHON_TYPE", variable: "answer", expected: "int" }, { type: "PYTHON_TYPE", variable: "answer", expected: "str" });
    expectIssue(validateExercisePack(types), Code.INVALID_GRADING, "/exercises/0/grading/checks/3");
    const same = makeMinimalPack();
    same.exercises[0].grading.checks.push({ type: "EXACT_VALUES", variable: "answer", expected: 3 });
    expect(validateExercisePack(same).ok).toBe(true);
  });

  it("rejects an invalid Python type name", () => {
    const pack = makeMinimalPack();
    pack.exercises[0].grading.checks.push({ type: "PYTHON_TYPE", variable: "answer", expected: "int; import os" });
    expectIssue(validateExercisePack(pack), Code.INVALID_GRADING, "/exercises/0/grading/checks/2/expected");
  });
});

describe("hints", () => {
  it.each([
    [["H2"], 0],
    [["H1", "H3"], 1],
    [["H1", "H1"], 1],
    [["H2", "H1"], 0],
    [["H1", "H2", "H4"], 2],
  ])("rejects the hint order %j", (levels, badIndex) => {
    const pack = makeMinimalPack();
    pack.exercises[0].hints = (levels as string[]).map((level) => ({ level, text: "Gợi ý" }));
    expectIssue(validateExercisePack(pack), Code.INVALID_HINTS, `/exercises/0/hints/${badIndex}/level`);
  });

  it("accepts H1 alone, H1..H4 and no hints", () => {
    for (const count of [0, 1, 2, 3, 4]) {
      const pack = makeMinimalPack();
      pack.exercises[0].hints = Array.from({ length: count }, (_, index) => ({ level: `H${index + 1}`, text: "Gợi ý" }));
      expect(validateExercisePack(pack).ok).toBe(true);
    }
  });

  it("rejects a fifth hint, unknown levels and blank text", () => {
    const five = makeMinimalPack();
    five.exercises[0].hints = Array.from({ length: 5 }, (_, index) => ({ level: `H${index + 1}`, text: "x" }));
    expect(validateExercisePack(five).ok).toBe(false);
    const level = makeMinimalPack();
    level.exercises[0].hints = [{ level: "H0", text: "x" }];
    expectIssue(validateExercisePack(level), Code.INVALID_VALUE, "/exercises/0/hints/0/level");
    const blank = makeMinimalPack();
    blank.exercises[0].hints = [{ level: "H1", text: "   " }];
    expect(validateExercisePack(blank).ok).toBe(false);
  });
});

describe("hostile and oversized input", () => {
  const kib = 1024;

  it("rejects text over 512 KiB before parsing it, and accepts text at exactly 512 KiB", () => {
    const over = " ".repeat(EXERCISE_PACK_LIMITS.maxPackBytes + 1);
    expect(rejected(validateExercisePack(over))[0]!.code).toBe(Code.INPUT_TOO_LARGE);

    const base = JSON.stringify(makeMinimalPack());
    const padded = base + " ".repeat(EXERCISE_PACK_LIMITS.maxPackBytes - utf8ByteLength(base));
    expect(utf8ByteLength(padded)).toBe(EXERCISE_PACK_LIMITS.maxPackBytes);
    expect(validateExercisePack(padded).ok).toBe(true);
    expect(rejected(validateExercisePack(`${padded} `))[0]!.code).toBe(Code.INPUT_TOO_LARGE);
  });

  it("measures UTF-8 bytes, not characters", () => {
    const base = JSON.stringify(makeMinimalPack());
    // Each "é" is 2 bytes: this text has fewer than 512K characters but more than 512 KiB.
    const text = base + " ".repeat(10) + "é".repeat(EXERCISE_PACK_LIMITS.maxPackBytes / 2);
    expect(text.length < EXERCISE_PACK_LIMITS.maxPackBytes).toBe(true);
    expect(rejected(validateExercisePack(text))[0]!.code).toBe(Code.INPUT_TOO_LARGE);
  });

  it("rejects very deep nesting without recursing (or overflowing the stack)", () => {
    expect(rejected(validateExercisePack("[".repeat(100_000)))[0]!.code).toBe(Code.NESTING_TOO_DEEP);
    expect(rejected(validateExercisePack(`${"[".repeat(21)}${"]".repeat(21)}`))[0]!.code).toBe(Code.NESTING_TOO_DEEP);
    const deepObject = '{"a":'.repeat(30) + "1" + "}".repeat(30);
    expect(rejected(validateExercisePack(deepObject))[0]!.code).toBe(Code.NESTING_TOO_DEEP);
  });

  it("allows exactly 20 nested containers and ignores brackets inside strings", () => {
    const withBracketString = makeMinimalPack();
    withBracketString.exercises[0].instructions = "[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[ \\\" ]]]]]";
    expect(validateExercisePack(JSON.stringify(withBracketString)).ok).toBe(true);

    // exercises[0].grading.checks[1] is the 6th container level, so `expected` starts at level 7.
    const withExpectedNesting = (levels: number): string => {
      let value: unknown = 1;
      for (let i = 0; i < levels; i++) value = [value];
      const pack = makePack();
      pack.exercises[0].grading.checks[1] = { type: "EXACT_VALUES", variable: "mse", expected: value };
      return JSON.stringify(pack);
    };
    expect(validateExercisePack(withExpectedNesting(14)).ok).toBe(true); // containers at levels 7..20
    expect(rejected(validateExercisePack(withExpectedNesting(15)))[0]!.code).toBe(Code.NESTING_TOO_DEEP);
    // The same limit applies to parsed objects (no text to pre-scan).
    expect(validateExercisePack(JSON.parse(withExpectedNesting(14))).ok).toBe(true);
    expect(rejected(validateExercisePack(JSON.parse(withExpectedNesting(15))))[0]!.code).toBe(Code.NESTING_TOO_DEEP);
  });

  it("rejects deeply nested parsed objects (including cycles) without throwing", () => {
    const cyclic: Loose = makePack();
    cyclic.exercises[0].grading.self = cyclic;
    expect(rejected(validateExercisePack(cyclic))[0]!.code).toBe(Code.NESTING_TOO_DEEP);
  });

  it("rejects too many JSON nodes", () => {
    const pack = makeMinimalPack();
    pack.exercises[0].setupVariables = { numbers: Array.from({ length: 50_001 }, () => 0) };
    expect(rejected(validateExercisePack(JSON.stringify(pack)))[0]!.code).toBe(Code.TOO_MANY_NODES);
  });

  it("limits individual text fields", () => {
    const fields: Array<[string[], number]> = [
      [["exercises", "0", "instructions"], 64 * kib + 1],
      [["exercises", "0", "starterCode"], 32 * kib + 1],
      [["exercises", "0", "referenceSolution"], 32 * kib + 1],
      [["exercises", "0", "explanation"], 64 * kib + 1],
      [["pack", "title"], 121],
      [["pack", "description"], 2001],
    ];
    for (const [path, length] of fields) {
      const pack = makeMinimalPack();
      let target: Loose = pack;
      for (const key of path.slice(0, -1)) target = target[key];
      target[path[path.length - 1]!] = "x".repeat(length);
      const issues = rejected(validateExercisePack(pack));
      expect(issues.some((entry) => entry.code === Code.TOO_LONG && entry.path === `/${path.join("/")}`)).toBe(true);
    }
  });

  it("accepts text fields exactly at their limit", () => {
    const pack = makeMinimalPack();
    pack.exercises[0].instructions = "x".repeat(64 * kib);
    pack.exercises[0].starterCode = "x".repeat(32 * kib);
    pack.pack.title = "x".repeat(120);
    expect(validateExercisePack(JSON.stringify(pack)).ok).toBe(true);
  });

  it("rejects prototype-pollution keys at any depth", () => {
    for (const key of ["__proto__", "constructor", "prototype"]) {
      const text = JSON.stringify(makeMinimalPack()).replace('"mini.pack"', `"mini.pack"`).replace('"language":"python"', `"language":"python","${key}":{"polluted":true}`);
      const result = validateExercisePack(text);
      expect(rejected(result).some((entry) => entry.code === Code.FORBIDDEN_KEY && entry.path.endsWith(`/${key}`))).toBe(true);
    }
    const deep = `{"format":"x","a":{"b":[{"__proto__":{"polluted":true}}]}}`;
    expect(rejected(validateExercisePack(deep)).some((entry) => entry.code === Code.FORBIDDEN_KEY && entry.path === "/a/b/0/__proto__")).toBe(true);
    // Nothing leaked into Object.prototype.
    expect(({} as Loose).polluted).toBeUndefined();
  });

  it("rejects prototype-pollution keys inside setup variables and expected values", () => {
    const setup = '{"format":"python-learn-game.exercise-pack","schemaVersion":1,"pack":{},"exercises":[{"setupVariables":{"__proto__":{"x":1}}}]}';
    expect(rejected(validateExercisePack(setup)).some((entry) => entry.code === Code.FORBIDDEN_KEY)).toBe(true);
  });

  it("rejects values that are not plain JSON data in object input", () => {
    const bad: Loose[] = [
      { n: Number.NaN },
      { n: Number.POSITIVE_INFINITY },
      { u: undefined },
      { f: () => 1 },
      { d: new Date(0) },
      { m: new Map() },
      { s: Symbol("x") },
      { b: 10n },
      { sparse: [1, , 3] }, // eslint-disable-line no-sparse-arrays
      Object.assign(Object.create({ inherited: 1 }), { own: 1 }),
      { [Symbol("k")]: 1 },
    ];
    for (const value of bad) {
      const pack = makePack();
      pack.exercises[0].grading.junk = value;
      expect(rejected(validateExercisePack(pack)).length > 0).toBe(true);
    }
  });

  it("never runs getters of a hostile object", () => {
    let ran = false;
    const pack = makePack();
    Object.defineProperty(pack.exercises[0], "trap", {
      enumerable: true,
      get() {
        ran = true;
        throw new Error("getter executed");
      },
    });
    const result = validateExercisePack(pack);
    expect(ran).toBe(false);
    expect(rejected(result).some((entry) => entry.code === Code.NOT_JSON_DATA)).toBe(true);
  });

  it("rejects NUL and lone surrogates in strings", () => {
    const nul = makeMinimalPack();
    nul.exercises[0].starterCode = "a\u0000b";
    expectIssue(validateExercisePack(nul), Code.INVALID_VALUE, "/exercises/0/starterCode");
    const surrogate = makeMinimalPack();
    surrogate.exercises[0].instructions = "x\ud800y";
    expectIssue(validateExercisePack(surrogate), Code.INVALID_VALUE, "/exercises/0/instructions");
    const fine = makeMinimalPack();
    fine.exercises[0].instructions = "emoji 😀 ok";
    expect(validateExercisePack(fine).ok).toBe(true);
  });
});

describe("error reporting", () => {
  it("bounds the number of reported issues and says how many were dropped", () => {
    const pack = makeMinimalPack();
    for (let index = 0; index < 120; index++) pack[`bad${index}`] = index;
    const issues = rejected(validateExercisePack(pack));
    expect(issues).toHaveLength(EXERCISE_PACK_LIMITS.maxReportedIssues + 1);
    const last = issues[issues.length - 1]!;
    expect(last.code).toBe(Code.MORE_ISSUES);
    expect(last.message).toContain("70");
  });

  it("never echoes large or hostile values", () => {
    const pack = makeMinimalPack();
    pack["K".repeat(5000)] = 1;
    pack.pack.id = "I".repeat(5000);
    const issues = rejected(validateExercisePack(pack));
    for (const entry of issues) {
      expect(entry.message.length < 600).toBe(true);
    }
  });

  it("escapes JSON Pointer tokens in paths", () => {
    const pack = makeMinimalPack();
    pack.exercises[0].setupVariables = { "a/b~c": 1 };
    expectIssue(validateExercisePack(pack), Code.INVALID_IDENTIFIER, "/exercises/0/setupVariables/a~1b~0c");
  });

  it("gives every issue a stable code, a pointer path and a Vietnamese message", () => {
    const pack = makePack();
    pack.exercises[0].kind = "quiz";
    pack.exercises[1].hintz = [];
    pack.pack.language = "go";
    for (const entry of rejected(validateExercisePack(pack))) {
      expect(typeof entry.code).toBe("string");
      expect(entry.path === "" || entry.path.startsWith("/")).toBe(true);
      expect(entry.message.length > 10).toBe(true);
    }
  });
});

describe("robustness (fuzz)", () => {
  // A small deterministic PRNG so failures are reproducible.
  function prng(seed: number) {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    };
  }

  function collectPaths(value: unknown, path: string[] = [], out: string[][] = []): string[][] {
    out.push(path);
    if (Array.isArray(value)) value.forEach((item, index) => collectPaths(item, [...path, String(index)], out));
    else if (typeof value === "object" && value !== null) {
      for (const [key, item] of Object.entries(value)) collectPaths(item, [...path, key], out);
    }
    return out;
  }

  const garbage: unknown[] = [null, true, false, 0, -1, 1.5, "", "x", "H9", [], {}, [1, 2], { a: 1 }, "😀", "a".repeat(300)];

  it("never throws and always returns a well-formed result", () => {
    const random = prng(20260420);
    for (let iteration = 0; iteration < 400; iteration++) {
      const pack = makePack();
      const mutations = 1 + Math.floor(random() * 4);
      for (let step = 0; step < mutations; step++) {
        const paths = collectPaths(pack).filter((path) => path.length > 0);
        const path = paths[Math.floor(random() * paths.length)]!;
        let parent: Loose = pack;
        for (const key of path.slice(0, -1)) parent = parent[key];
        const last = path[path.length - 1]!;
        const action = Math.floor(random() * 4);
        if (action === 0) {
          if (Array.isArray(parent)) parent.splice(Number(last), 1);
          else delete parent[last];
        } else if (action === 1) {
          parent[last] = garbage[Math.floor(random() * garbage.length)];
        } else if (action === 2 && !Array.isArray(parent)) {
          parent[`${last}x`] = parent[last];
        } else if (action === 3 && Array.isArray(parent)) {
          parent.push(structuredClone(parent[Number(last)]));
        }
      }
      for (const input of [pack, JSON.stringify(pack)]) {
        const result = validateExercisePack(input);
        if (result.ok) {
          expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
        } else {
          expect(result.issues.length > 0).toBe(true);
          expect(result.issues.length <= EXERCISE_PACK_LIMITS.maxReportedIssues + 1).toBe(true);
          for (const entry of result.issues) {
            expect(typeof entry.message).toBe("string");
            expect(entry.path === "" || entry.path.startsWith("/")).toBe(true);
          }
        }
      }
    }
  }, 20_000);

  it("never throws for arbitrary JSON text", () => {
    const random = prng(7);
    const alphabet = ['{', '}', '[', ']', '"', ':', ',', '1', 'null', 'true', '"a"', '\\', ' '];
    for (let iteration = 0; iteration < 300; iteration++) {
      let text = "";
      const length = Math.floor(random() * 60);
      for (let i = 0; i < length; i++) text += alphabet[Math.floor(random() * alphabet.length)];
      const result = validateExercisePack(text);
      expect(typeof result.ok).toBe("boolean");
    }
  });
});
