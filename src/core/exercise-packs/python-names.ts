/**
 * Python-name rules of the Exercise Pack importer.
 *
 * Variable names in a pack (setup variables, graded variables) become Python
 * globals. The Pyodide Worker accepts anything `str.isidentifier()` accepts that is
 * not a keyword, `__builtins__` or `__runtime_*`. The importer is deliberately
 * STRICTER than that (never looser): ASCII identifiers only, no leading double
 * underscore at all. Names the runtime or the observation helper uses for their own
 * state live in that dunder space, so excluding it keeps a pack from colliding
 * with, or overwriting, runtime-private state.
 */

/** Python 3 hard keywords (`keyword.kwlist`). Soft keywords (match, case, type, _) are valid names. */
export const PYTHON_KEYWORDS: ReadonlySet<string> = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class",
  "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global",
  "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise",
  "return", "try", "while", "with", "yield",
]);

const ASCII_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type PythonNameProblem = "NOT_IDENTIFIER" | "TOO_LONG" | "KEYWORD" | "RESERVED";

/** Returns why `name` is not an acceptable pack variable name, or null when it is. */
export function findPythonNameProblem(name: string, maxLength: number): PythonNameProblem | null {
  if (!ASCII_IDENTIFIER.test(name)) return "NOT_IDENTIFIER";
  if (name.length > maxLength) return "TOO_LONG";
  if (PYTHON_KEYWORDS.has(name)) return "KEYWORD";
  if (name.startsWith("__")) return "RESERVED";
  return null;
}

/** Keys that must never appear anywhere in an imported document (prototype pollution). */
export const FORBIDDEN_OBJECT_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);
