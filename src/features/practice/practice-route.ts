import { isPracticeSegment } from "../../core/exercise-packs";

export type PracticeRouteParams =
  | { readonly ok: true; readonly packId: string; readonly exerciseId?: string }
  | { readonly ok: false };

/**
 * Route params come from the URL and are untrusted. A segment that cannot be a
 * pack/exercise id is "not found" without asking the services anything.
 */
export function parsePracticeRoute(params: {
  readonly packId?: string;
  readonly exerciseId?: string;
}): PracticeRouteParams {
  const packId = params.packId;
  if (packId === undefined || !isPracticeSegment(packId)) return { ok: false };
  if (params.exerciseId === undefined) return { ok: true, packId };
  if (!isPracticeSegment(params.exerciseId)) return { ok: false };
  return { ok: true, packId, exerciseId: params.exerciseId };
}

export const practicePackPath = (packId: string): string => `/practice/${packId}`;
export const practiceExercisePath = (packId: string, exerciseId: string): string =>
  `/practice/${packId}/${exerciseId}`;
