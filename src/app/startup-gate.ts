/*
 * Routes that own their services and storage and never depend on the CS116
 * initialization (pending / failed). A CS116 startup failure must not hide them.
 * Matching is by whole path segment: `/practice` and `/practice/...` match,
 * `/practices` and `/practice-x` do not.
 */
const INDEPENDENT_ROOTS = ["/practice", "/challenge"] as const;

export function bypassesStartupGate(pathname: string): boolean {
  return INDEPENDENT_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}
