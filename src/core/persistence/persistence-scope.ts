/**
 * Persistence scopes: which local IndexedDB databases a persistence instance uses.
 *
 * - `guest` is the default and maps to the original, unchanged database names.
 * - `account` carries an OPAQUE account identifier that a future authenticated
 *   session will supply. Holding an account scope is NOT proof of authentication
 *   and this module performs no authentication, switching or syncing.
 *
 * Scope-to-database-name rule (see `resolveScopedDatabaseName`):
 *
 *   guest   -> <base>
 *   account -> <base>:account:<encodeURIComponent(accountId)>
 *
 * Properties:
 * - Injective: distinct account IDs always give distinct names, because the ID is
 *   percent-encoded (`%` itself becomes `%25`) and is never trimmed, case-folded
 *   or otherwise normalized.
 * - Account names can never equal a Guest name (they always contain ":account:",
 *   while Guest names contain no ":"), nor a name of the other database family
 *   (the base name precedes the first ":").
 * - The learning and meta families both resolve the SAME scope value, each with
 *   its own base name, so one scope selects both databases. The `practice`
 *   family (PHASE-05) resolves the same scope value with its own base name too.
 */

export const GUEST_DATABASE_BASE_NAMES = {
  learning: "python-learn-game",
  meta: "python-learn-game-meta",
  /**
   * Reserved for practice-only storage (imported Exercise Packs, PHASE-05).
   * It is served by the same schema owner as `learning` (see
   * `IndexedDbLearningPersistence`), but it is a database of its own: nothing
   * written to it is ever visible in, or counted by, the `learning` family.
   */
  practice: "python-learn-game-practice",
  /**
   * Challenge submissions (M13.2). Served by its own class, `IndexedDbChallengePersistence`
   * (core/challenge), NOT by `IndexedDbLearningPersistence`: it is deliberately absent from
   * `LEARNING_DATABASE_BASE_NAMES`, so the learning/practice schema owner can never open it.
   */
  challenge: "python-learn-game-challenge",
} as const;

/**
 * The base names the Learning persistence class may open. This is a CLOSED set:
 * `meta` is deliberately absent because that database has a different schema,
 * and an arbitrary string could contain ":" (breaking the injectivity rule
 * above, since Guest names must never contain ":") or collide with another
 * family.
 */
export const LEARNING_DATABASE_BASE_NAMES = Object.freeze([
  GUEST_DATABASE_BASE_NAMES.learning,
  GUEST_DATABASE_BASE_NAMES.practice,
] as const);

export type LearningDatabaseBaseName = (typeof LEARNING_DATABASE_BASE_NAMES)[number];

/** Thrown for a base name the Learning persistence class does not serve. Never echoes the value. */
export class InvalidDatabaseBaseNameError extends Error {
  constructor() {
    super("Invalid database base name for Learning persistence.");
    this.name = "InvalidDatabaseBaseNameError";
  }
}

/** Throws InvalidDatabaseBaseNameError unless `value` is one of LEARNING_DATABASE_BASE_NAMES. */
export function assertLearningDatabaseBaseName(
  value: unknown,
): asserts value is LearningDatabaseBaseName {
  if (!(LEARNING_DATABASE_BASE_NAMES as readonly unknown[]).includes(value)) {
    throw new InvalidDatabaseBaseNameError();
  }
}

export const MAX_ACCOUNT_ID_LENGTH = 256;

export type PersistenceScope =
  | { readonly kind: "guest" }
  | { readonly kind: "account"; readonly accountId: string };

export const InvalidPersistenceScopeReason = {
  NOT_AN_OBJECT: "NOT_AN_OBJECT",
  UNKNOWN_KIND: "UNKNOWN_KIND",
  GUEST_WITH_ACCOUNT_ID: "GUEST_WITH_ACCOUNT_ID",
  ACCOUNT_ID_NOT_STRING: "ACCOUNT_ID_NOT_STRING",
  ACCOUNT_ID_EMPTY: "ACCOUNT_ID_EMPTY",
  ACCOUNT_ID_TOO_LONG: "ACCOUNT_ID_TOO_LONG",
  ACCOUNT_ID_SURROUNDING_WHITESPACE: "ACCOUNT_ID_SURROUNDING_WHITESPACE",
  ACCOUNT_ID_CONTROL_CHARACTER: "ACCOUNT_ID_CONTROL_CHARACTER",
  ACCOUNT_ID_MALFORMED_UNICODE: "ACCOUNT_ID_MALFORMED_UNICODE",
  ACCOUNT_ID_LOOKS_LIKE_EMAIL: "ACCOUNT_ID_LOOKS_LIKE_EMAIL",
} as const;

export type InvalidPersistenceScopeReason =
  (typeof InvalidPersistenceScopeReason)[keyof typeof InvalidPersistenceScopeReason];

/**
 * Thrown for any scope that cannot be mapped to a database. The message and
 * `reason` never echo the rejected value (an account ID may be sensitive).
 */
export class InvalidPersistenceScopeError extends Error {
  readonly reason: InvalidPersistenceScopeReason;

  constructor(reason: InvalidPersistenceScopeReason) {
    super(`Invalid persistence scope: ${reason}.`);
    this.name = "InvalidPersistenceScopeError";
    this.reason = reason;
  }
}

export const GUEST_SCOPE: PersistenceScope = Object.freeze({ kind: "guest" });

/** Builds a validated, frozen account scope. Throws InvalidPersistenceScopeError. */
export function accountScope(accountId: string): PersistenceScope {
  assertValidAccountId(accountId);
  return Object.freeze({ kind: "account", accountId });
}

/**
 * Maps a scope to a database name. Throws InvalidPersistenceScopeError for any
 * invalid scope; it NEVER falls back to the Guest database.
 */
export function resolveScopedDatabaseName(baseName: string, scope: unknown): string {
  if (typeof scope !== "object" || scope === null || Array.isArray(scope)) {
    throw new InvalidPersistenceScopeError(InvalidPersistenceScopeReason.NOT_AN_OBJECT);
  }
  const { kind } = scope as { kind?: unknown };

  if (kind === "guest") {
    if (Object.hasOwn(scope, "accountId")) {
      throw new InvalidPersistenceScopeError(InvalidPersistenceScopeReason.GUEST_WITH_ACCOUNT_ID);
    }
    return baseName;
  }

  if (kind === "account") {
    const { accountId } = scope as { accountId?: unknown };
    assertValidAccountId(accountId);
    return `${baseName}:account:${encodeURIComponent(accountId)}`;
  }

  throw new InvalidPersistenceScopeError(InvalidPersistenceScopeReason.UNKNOWN_KIND);
}

function assertValidAccountId(value: unknown): asserts value is string {
  const fail = (reason: InvalidPersistenceScopeReason): never => {
    throw new InvalidPersistenceScopeError(reason);
  };

  if (typeof value !== "string") fail(InvalidPersistenceScopeReason.ACCOUNT_ID_NOT_STRING);
  const id = value as string;
  if (id.length === 0) fail(InvalidPersistenceScopeReason.ACCOUNT_ID_EMPTY);
  if (id.length > MAX_ACCOUNT_ID_LENGTH) fail(InvalidPersistenceScopeReason.ACCOUNT_ID_TOO_LONG);
  // Rejected, never trimmed: " a" and "a" must not silently become one identity.
  if (id !== id.trim()) fail(InvalidPersistenceScopeReason.ACCOUNT_ID_SURROUNDING_WHITESPACE);
  if (/[\u0000-\u001f\u007f]/.test(id)) fail(InvalidPersistenceScopeReason.ACCOUNT_ID_CONTROL_CHARACTER);
  // An account ID is opaque; an email address is never a database identity.
  if (id.includes("@")) fail(InvalidPersistenceScopeReason.ACCOUNT_ID_LOOKS_LIKE_EMAIL);
  try {
    encodeURIComponent(id); // throws URIError on lone surrogates
  } catch {
    fail(InvalidPersistenceScopeReason.ACCOUNT_ID_MALFORMED_UNICODE);
  }
}
