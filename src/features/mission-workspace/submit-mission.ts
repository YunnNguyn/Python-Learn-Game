import {
  isMissionSubmitCancelledError,
  type MissionAttemptSession,
  type MissionSubmitWithAttempt,
} from "../../core/learning";

/**
 * Settled outcome of one Submit. `submitMission` never rejects, so a UI event
 * handler that awaits it cannot leak an unhandled promise rejection.
 *
 *  - completed: the AttemptRecord was created and handed to persistence.
 *  - cancelled: the session was disposed while grading was pending (navigation,
 *    retry, unmount). Benign: nothing was recorded and nothing should be shown.
 *  - failed:    a genuine error (typically persistence rejecting the record).
 *    It must stay observable to the learner, never be swallowed.
 */
export type MissionSubmitOutcome =
  | { readonly kind: "completed"; readonly result: MissionSubmitWithAttempt }
  | { readonly kind: "cancelled" }
  | { readonly kind: "failed"; readonly error: unknown };

export async function submitMission(
  session: Pick<MissionAttemptSession, "submit">,
  code: string,
): Promise<MissionSubmitOutcome> {
  try {
    return { kind: "completed", result: await session.submit(code) };
  } catch (error) {
    if (isMissionSubmitCancelledError(error)) return { kind: "cancelled" };
    return { kind: "failed", error };
  }
}

/** The page-owned slot holding the one live session (`sessionRef` in MissionWorkspacePage). */
export interface MissionSessionSlot<S extends { dispose(): void }> {
  current: S | null;
}

/**
 * True only while `session` is the slot's live session. It becomes false as soon
 * as the slot is released (unmount, route change, retry) or another session
 * replaces it, so a late async completion can tell it is stale.
 */
export function isActiveSession<S extends { dispose(): void }>(
  slot: MissionSessionSlot<S>,
  session: S,
): boolean {
  return slot.current === session;
}

/** Disposes the live session (idempotent) and clears the slot so no completion is "current" any more. */
export function releaseSession<S extends { dispose(): void }>(slot: MissionSessionSlot<S>): void {
  slot.current?.dispose();
  slot.current = null;
}

/**
 * Whether a finished Submit may delete the mission draft: only a passed attempt
 * of the session that is STILL the live one. A stale Submit (page left, mission
 * retried or reopened) must not touch drafts, because a newer session may have
 * saved a draft the old Submit knows nothing about.
 *
 * Since M5 the page no longer deletes drafts: the service set discards a draft
 * itself when a passed attempt is stored, and decides staleness by draft
 * generation (see mission-draft-scheduler.ts). This predicate is kept as the
 * documented page-level rule and for its existing tests.
 */
export function shouldDeleteDraftAfterSubmit(
  outcome: MissionSubmitOutcome,
  sessionIsActive: boolean,
): boolean {
  return outcome.kind === "completed" && outcome.result.attemptRecord.passed && sessionIsActive;
}
