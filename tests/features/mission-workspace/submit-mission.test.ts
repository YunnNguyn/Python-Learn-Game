import { describe, expect, it } from "vitest";

import { MissionSubmitCancelledError } from "../../../src/core/learning";
import {
  isActiveSession,
  releaseSession,
  shouldDeleteDraftAfterSubmit,
  submitMission,
  type MissionSubmitOutcome,
} from "../../../src/features/mission-workspace/submit-mission";

// submitMission is what MissionWorkspacePage.handleSubmit awaits. The page has no
// component-test infrastructure (no jsdom/testing-library), so the error
// classification that decides "benign vs observable" lives in this pure helper.

const resolvedResult = { attemptRecord: { id: "attempt.1" } } as never;

describe("submitMission", () => {
  it("reports a completed Submit", async () => {
    const outcome = await submitMission({ submit: async () => resolvedResult }, "code");
    expect(outcome).toEqual({ kind: "completed", result: resolvedResult });
  });

  it("reports a cancellation as benign, not as a failure", async () => {
    const outcome = await submitMission(
      { submit: () => Promise.reject(new MissionSubmitCancelledError()) },
      "code",
    );
    expect(outcome).toEqual({ kind: "cancelled" });
  });

  it("keeps a genuine persistence error observable, and never rejects", async () => {
    const failure = new Error("IndexedDB write failed");
    const unhandled: unknown[] = [];
    const proc = (globalThis as unknown as {
      process: { on(e: string, l: (r: unknown) => void): void; off(e: string, l: (r: unknown) => void): void };
    }).process;
    const listener = (reason: unknown) => { unhandled.push(reason); };
    proc.on("unhandledRejection", listener);
    try {
      const outcome = await submitMission({ submit: () => Promise.reject(failure) }, "code");
      expect(outcome).toEqual({ kind: "failed", error: failure });
      // One macrotask turn lets the runtime report any unhandled rejection.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).toHaveLength(0);
    } finally {
      proc.off("unhandledRejection", listener);
    }
  });
});

function fakeSession() {
  let disposeCount = 0;
  return { dispose: () => { disposeCount += 1; }, disposeCount: () => disposeCount };
}

describe("stale-session guard (MissionWorkspacePage sessionRef)", () => {
  it("is active while the slot holds the session", () => {
    const session = fakeSession();
    const slot = { current: session };
    expect(isActiveSession(slot, session)).toBe(true);
  });

  it("unmount (releaseSession) disposes the session once and invalidates its identity", () => {
    const session = fakeSession();
    const slot: { current: typeof session | null } = { current: session };

    releaseSession(slot);
    releaseSession(slot); // cleanup may run again (StrictMode, retry)

    expect(slot.current).toBeNull();
    expect(isActiveSession(slot, session)).toBe(false);
    expect(session.disposeCount()).toBe(1);
  });

  it("a replacement session does not make the old one active again", () => {
    const oldSession = fakeSession();
    const newSession = fakeSession();
    const slot: { current: typeof oldSession | null } = { current: oldSession };

    releaseSession(slot);
    slot.current = newSession;

    expect(isActiveSession(slot, oldSession)).toBe(false);
    expect(isActiveSession(slot, newSession)).toBe(true);
  });
});

describe("shouldDeleteDraftAfterSubmit", () => {
  const completed = (passed: boolean): MissionSubmitOutcome => ({
    kind: "completed",
    result: { attemptRecord: { passed } } as never,
  });

  it("deletes the draft after a passed Submit of the live session", () => {
    expect(shouldDeleteDraftAfterSubmit(completed(true), true)).toBe(true);
  });

  it("never lets a stale session start a draft deletion", () => {
    const session = fakeSession();
    const slot: { current: typeof session | null } = { current: session };
    releaseSession(slot); // user left the page while the Submit was persisting
    expect(shouldDeleteDraftAfterSubmit(completed(true), isActiveSession(slot, session))).toBe(false);
  });

  it("keeps the draft after a failed attempt, a cancellation or an error", () => {
    expect(shouldDeleteDraftAfterSubmit(completed(false), true)).toBe(false);
    expect(shouldDeleteDraftAfterSubmit({ kind: "cancelled" }, true)).toBe(false);
    expect(shouldDeleteDraftAfterSubmit({ kind: "failed", error: new Error("x") }, true)).toBe(false);
  });
});
