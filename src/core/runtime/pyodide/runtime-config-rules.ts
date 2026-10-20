/**
 * Pyodide runtime configuration rules shared by the Pyodide Worker and (in a
 * later PHASE-05 milestone) the Exercise Pack validator.
 *
 * This module is PURE DATA + PURE PREDICATES: it imports nothing, touches no
 * worker/DOM/Pyodide API, and therefore can be imported from any layer without
 * pulling the Pyodide runtime in. The Worker is the AUTHORITY at execution
 * time and consumes exactly these rules; a validator that imports them can
 * only ever accept a subset of what the Worker accepts (it may add stricter
 * rules of its own, never looser ones).
 *
 * Deliberately NOT here: `core.local_python`. Local Python is a different
 * runtime and nothing in this module makes it available to anything.
 */

/**
 * Pyodide packages enabled for production content. These all ship in the
 * Pyodide package index, so loadPackage can fetch them in the browser. The
 * Data/ML worlds (pandas, Matplotlib, Pillow, scikit-learn, OpenCV) run fully
 * in-browser through this runtime, which is what makes the app hostable as a
 * static site with no local service. Adding a package is a deliberate change to THIS list (and is visible in
 * review), never a side effect of a content file.
 */
export const ALLOWED_RUNTIME_PACKAGE_NAMES: readonly string[] = Object.freeze([
  "numpy",
  "pandas",
  "matplotlib",
  "pillow",
  "scipy",
  "scikit-learn",
  "opencv-python",
]);

/** The only top-level `runtimeConfig` keys the Worker understands. */
export const ALLOWED_RUNTIME_CONFIG_KEY_NAMES: readonly string[] = Object.freeze([
  "packages",
  "workspace",
]);

const ALLOWED_RUNTIME_PACKAGES: ReadonlySet<string> = new Set(ALLOWED_RUNTIME_PACKAGE_NAMES);
const ALLOWED_RUNTIME_CONFIG_KEYS: ReadonlySet<string> = new Set(ALLOWED_RUNTIME_CONFIG_KEY_NAMES);

/** Dataset file names staged into the virtual `data/` directory. */
const SIMPLE_FILENAME = /^[A-Za-z0-9._-]+$/;

/**
 * Whether `packageName` is an enabled Pyodide package. The comparison is
 * case-insensitive (exactly as the Worker has always done); the Worker still
 * passes the name to `loadPackage` as written by the caller.
 */
export function isAllowedRuntimePackage(packageName: string): boolean {
  return ALLOWED_RUNTIME_PACKAGES.has(packageName.toLowerCase());
}

/** Whether `key` is a top-level `runtimeConfig` key the Worker accepts. */
export function isAllowedRuntimeConfigKey(key: string): boolean {
  return ALLOWED_RUNTIME_CONFIG_KEYS.has(key);
}

/**
 * The Worker's dataset file-name rule: one or more of `A-Z a-z 0-9 . _ -`.
 *
 * This is the Worker's MINIMUM, not a recommendation. In particular it still
 * accepts "." and ".." (the Worker rejects those later, when writing, because
 * they are directories). A stricter validator should reject them up front.
 */
export function isSimpleDatasetFilename(filename: string): boolean {
  return SIMPLE_FILENAME.test(filename);
}
