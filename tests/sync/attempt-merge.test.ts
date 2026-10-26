import { describe, expect, it, vi } from "vitest";

import {
  AttemptRecordSchema,
  Difficulty,
  HintLevel,
  LearningStage,
  type AttemptRecord,
} from "../../src/core/domain";
import { LearningEngine } from "../../src/core/learning";
import { MetaProgressionEngine } from "../../src/core/meta-progression";
import {
  IndexedDbLearningPersistence,
  MemoryLearningPersistence,
} from "../../src/core/persistence";
import { RUNTIME_EXECUTION_STATUS } from "../../src/core/runtime/runtime-contracts";
import {
  AttemptConflictReason,
  AttemptMergeStatus,
  SyncDtoErrorCode,
  planAttemptMerge,
  type AttemptMergeEntry,
  type AttemptMergePlan,
} from "../../src/core/sync";

/** NEW mutable summary per call (zod keeps graderSummary by reference; never share it). */
function goodSummary() {
  return {
    executionStatus: RUNTIME_EXECUTION_STATUS.SUCCESS,
    gradingAvailable: true,
    gradingPassed: true,
    failedCategories: [] as string[],
  };
}

function makeRecord(overrides: Record<string, unknown> = {}): AttemptRecord {
  return AttemptRecordSchema.parse({
    id: "attempt.a",
    activityId: "activity.test",
    missionTemplateId: "template.test",
    missionTemplateVersion: 1,
    seed: "play:activity.test:v1:variant:0",
    difficulty: Difficulty.EASY,
    conceptIds: ["concept.a"],
    learningStage: LearningStage.GUIDED,
    startedAt: "2026-10-03T11:59:00.000Z",
    submittedAt: "2026-10-03T12:00:00.000Z",
    passed: true,
    submissionIndex: 1,
    runCountBeforeSubmit: 0,
    hintsUsed: [HintLevel.H1],
    runtimeErrorCount: 0,
    graderSummary: goodSummary(),
    ...overrides,
  });
}

/** What actually arrives from the network: a JSON round trip of the envelope. */
function wire(record: unknown, dtoVersion: number = 1): unknown {
  return JSON.parse(JSON.stringify({ dtoVersion, attempt: record }));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function only<S extends AttemptMergeStatus>(plan: AttemptMergePlan, status: S) {
  return plan.entries.filter(
    (entry): entry is Extract<AttemptMergeEntry, { status: S }> => entry.status === status,
  );
}

function ids(plan: AttemptMergePlan): Array<string | null> {
  return plan.entries.map((entry) => entry.attemptId);
}

const ZERO_COUNTS = {
  local_only: 0,
  remote_only: 0,
  exists: 0,
  conflict: 0,
  unsyncable_local: 0,
  invalid_remote: 0,
};

describe("planAttemptMerge classifications", () => {
  it("returns an empty plan for two empty collections", () => {
    expect(planAttemptMerge([], [])).toEqual({ entries: [], counts: ZERO_COUNTS });
  });

  it("classifies local-only attempts, ordered by submittedAt then id", () => {
    const later = makeRecord({ id: "attempt.z", submittedAt: "2026-10-03T13:00:00.000Z" });
    const earlier = makeRecord({ id: "attempt.b", submittedAt: "2026-10-03T09:00:00.000Z" });
    const plan = planAttemptMerge([later, earlier], []);

    expect(plan.counts).toEqual({ ...ZERO_COUNTS, local_only: 2 });
    expect(only(plan, AttemptMergeStatus.LOCAL_ONLY).map((e) => e.attemptId)).toEqual([
      "attempt.b",
      "attempt.z",
    ]);
    for (const entry of only(plan, AttemptMergeStatus.LOCAL_ONLY)) {
      expect(entry.copies).toBe(1);
      expect(entry.blockedByInvalidRemote).toBe(false);
    }
  });

  it("classifies remote-only attempts", () => {
    const record = makeRecord();
    const plan = planAttemptMerge([], [wire(record)]);

    expect(plan.counts).toEqual({ ...ZERO_COUNTS, remote_only: 1 });
    const [entry] = only(plan, AttemptMergeStatus.REMOTE_ONLY);
    expect(entry?.record).toStrictEqual(record);
  });

  it("classifies an equivalent attempt on both sides as exists, ignoring key order", () => {
    const record = makeRecord();
    const reversed = Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(record))).reverse());
    const plan = planAttemptMerge([record], [wire(reversed)]);

    expect(plan.counts).toEqual({ ...ZERO_COUNTS, exists: 1 });
    const [entry] = only(plan, AttemptMergeStatus.EXISTS);
    expect(entry?.local).toStrictEqual(record);
    expect(entry?.remote).toStrictEqual(record);
  });

  it("reports the same id with a different passed value as a conflict, never picking a winner", () => {
    const local = makeRecord({ passed: true, submittedAt: "2026-10-03T12:00:00.000Z" });
    const remote = makeRecord({ passed: false, submittedAt: "2026-10-03T18:00:00.000Z" });
    const plan = planAttemptMerge([local], [wire(remote)]);

    expect(plan.counts).toEqual({ ...ZERO_COUNTS, conflict: 1 });
    const [entry] = only(plan, AttemptMergeStatus.CONFLICT);
    expect(entry?.reasons).toEqual([AttemptConflictReason.CONTENT_MISMATCH]);
    expect(entry?.local).toStrictEqual([local]);
    expect(entry?.remote).toStrictEqual([remote]);
  });

  it("reports the same id with a different graderSummary as a conflict", () => {
    const local = makeRecord();
    const remote = makeRecord({
      graderSummary: { ...goodSummary(), gradingPassed: false, failedCategories: ["VALUE_ERROR"] },
    });
    const plan = planAttemptMerge([local], [wire(remote)]);

    expect(only(plan, AttemptMergeStatus.CONFLICT)).toHaveLength(1);
    expect(only(plan, AttemptMergeStatus.EXISTS)).toHaveLength(0);
  });

  it("keeps two independent attempts at the same mission separate", () => {
    const deviceA = makeRecord({ id: "attempt:instance:T1:1", submittedAt: "2026-10-03T10:00:00.000Z" });
    const deviceB = makeRecord({ id: "attempt:instance:T2:1", submittedAt: "2026-10-03T11:00:00.000Z" });

    const split = planAttemptMerge([deviceA], [wire(deviceB)]);
    expect(split.counts).toEqual({ ...ZERO_COUNTS, local_only: 1, remote_only: 1 });

    const both = planAttemptMerge([deviceA, deviceB], [wire(deviceA), wire(deviceB)]);
    expect(both.counts).toEqual({ ...ZERO_COUNTS, exists: 2 });
    expect(both.entries.every((e) => e.status !== AttemptMergeStatus.CONFLICT)).toBe(true);
  });
});

describe("planAttemptMerge duplicates inside one input", () => {
  it("coalesces identical local duplicates and reports the copy count", () => {
    const record = makeRecord();
    const plan = planAttemptMerge([record, structuredClone(record)], []);

    expect(plan.entries).toHaveLength(1);
    const [entry] = only(plan, AttemptMergeStatus.LOCAL_ONLY);
    expect(entry?.copies).toBe(2);
  });

  it("coalesces identical remote duplicates and identical duplicates against the other side", () => {
    const record = makeRecord();

    const remoteOnly = planAttemptMerge([], [wire(record), wire(record)]);
    expect(only(remoteOnly, AttemptMergeStatus.REMOTE_ONLY)[0]?.copies).toBe(2);

    const exists = planAttemptMerge([record, structuredClone(record)], [wire(record)]);
    const [entry] = only(exists, AttemptMergeStatus.EXISTS);
    expect(entry?.localCopies).toBe(2);
    expect(entry?.remoteCopies).toBe(1);
  });

  it("surfaces conflicting local duplicates as a conflict listing every variant", () => {
    const passed = makeRecord({ passed: true });
    const failed = makeRecord({ passed: false });
    const plan = planAttemptMerge([passed, failed], []);

    const [entry] = only(plan, AttemptMergeStatus.CONFLICT);
    expect(entry?.reasons).toEqual([AttemptConflictReason.LOCAL_DUPLICATE_CONFLICT]);
    expect(entry?.local).toHaveLength(2);
    expect(entry?.remote).toEqual([]);
  });

  it("surfaces conflicting remote duplicates, even when one equals the local record", () => {
    const passed = makeRecord({ passed: true });
    const failed = makeRecord({ passed: false });
    const plan = planAttemptMerge([passed], [wire(passed), wire(failed)]);

    const [entry] = only(plan, AttemptMergeStatus.CONFLICT);
    expect(entry?.reasons).toEqual([AttemptConflictReason.REMOTE_DUPLICATE_CONFLICT]);
    expect(entry?.local).toHaveLength(1);
    expect(entry?.remote).toHaveLength(2);
    expect(only(plan, AttemptMergeStatus.EXISTS)).toHaveLength(0);
  });
});

describe("planAttemptMerge invalid and unsupported records never disappear", () => {
  it("reports an unsupported DTO version and blocks, but does not overwrite, the valid local record", () => {
    const local = makeRecord({ id: "attempt.v2" });
    const plan = planAttemptMerge([local], [wire(local, 2)]);

    const [invalid] = only(plan, AttemptMergeStatus.INVALID_REMOTE);
    expect(invalid?.attemptId).toBe("attempt.v2");
    expect(invalid?.error.code).toBe(SyncDtoErrorCode.UNSUPPORTED_VERSION);
    expect(invalid?.error.receivedVersion).toBe(2);

    const [localOnly] = only(plan, AttemptMergeStatus.LOCAL_ONLY);
    expect(localOnly?.record).toStrictEqual(local);
    expect(localOnly?.blockedByInvalidRemote).toBe(true);
    expect(plan.entries).toHaveLength(2);
  });

  it("does not let a malformed remote entry replace a valid remote entry with the same id", () => {
    // Expectation updated in PHASE-04C.1B-R1: a valid remote copy that shares its id
    // with a rejected remote envelope is an ambiguity (conflict), not remote_only.
    const record = makeRecord({ id: "attempt.same" });
    const malformed = wire({ ...record, syncRevision: 3 });
    const plan = planAttemptMerge([], [malformed, wire(record)]);

    expect(only(plan, AttemptMergeStatus.REMOTE_ONLY)).toHaveLength(0);
    const [conflict] = only(plan, AttemptMergeStatus.CONFLICT);
    expect(conflict?.reasons).toEqual([AttemptConflictReason.REMOTE_INVALID]);
    expect(conflict?.remote).toStrictEqual([record]);
    expect(conflict?.local).toEqual([]);
    const [invalid] = only(plan, AttemptMergeStatus.INVALID_REMOTE);
    expect(invalid?.attemptId).toBe("attempt.same");
    expect(invalid?.error.code).toBe(SyncDtoErrorCode.INVALID_ATTEMPT);
  });

  it("reports malformed envelopes without echoing any rejected value", () => {
    const canary = "CANARY_ACCOUNT_77f2";
    const record = makeRecord();
    const plan = planAttemptMerge([], [
      null,
      [],
      "not an envelope",
      { dtoVersion: 1 },
      { dtoVersion: 1, attempt: record, accountId: canary },
      // Invalid (submissionIndex < 1) and its id contains whitespace, so it is not exposed.
      { dtoVersion: 1, attempt: { ...record, id: `bad id ${canary}`, submissionIndex: 0 } },
    ]);

    const invalid = only(plan, AttemptMergeStatus.INVALID_REMOTE);
    expect(invalid).toHaveLength(6);
    expect(plan.counts.invalid_remote).toBe(6);
    expect(JSON.stringify(plan)).not.toContain(canary);
    // Only the entry whose id is a safe printable token exposes an id.
    expect(invalid.filter((entry) => entry.attemptId !== null).map((e) => e.attemptId)).toEqual([
      "attempt.a",
    ]);
  });

  it("reports a valid AttemptRecord that DTO V1 cannot carry as unsyncable_local", () => {
    const canary = "CANARY_LEARNER_CODE_1c9e";
    const unsyncable = makeRecord({ id: "attempt.odd", graderSummary: { ...goodSummary(), stdout: canary } });
    const fine = makeRecord({ id: "attempt.fine", submittedAt: "2026-10-03T13:00:00.000Z" });
    const plan = planAttemptMerge([unsyncable, fine, null], []);

    const rejected = only(plan, AttemptMergeStatus.UNSYNCABLE_LOCAL);
    expect(rejected.map((e) => e.attemptId)).toEqual(["attempt.odd", null]);
    expect(rejected[0]?.error.code).toBe(SyncDtoErrorCode.UNSYNCABLE);
    expect(only(plan, AttemptMergeStatus.LOCAL_ONLY).map((e) => e.attemptId)).toEqual(["attempt.fine"]);
    expect(JSON.stringify(plan)).not.toContain(canary);
  });

  it("never reports a valid remote copy of an unsyncable local id as remote_only", () => {
    const unsyncable = makeRecord({ id: "attempt.odd", graderSummary: { ...goodSummary(), stdout: "x" } });
    const remote = makeRecord({ id: "attempt.odd" });
    const plan = planAttemptMerge([unsyncable], [wire(remote)]);

    expect(only(plan, AttemptMergeStatus.REMOTE_ONLY)).toHaveLength(0);
    const [conflict] = only(plan, AttemptMergeStatus.CONFLICT);
    expect(conflict?.reasons).toEqual([AttemptConflictReason.LOCAL_UNSYNCABLE]);
    expect(conflict?.local).toEqual([]);
    expect(conflict?.remote).toStrictEqual([remote]);
    expect(only(plan, AttemptMergeStatus.UNSYNCABLE_LOCAL)).toHaveLength(1);
  });
});

describe("planAttemptMerge determinism", () => {
  function scenario() {
    const shared = makeRecord({ id: "attempt.shared", submittedAt: "2026-10-03T10:00:00.000Z" });
    const localOnly = makeRecord({ id: "attempt.local", submittedAt: "2026-10-03T11:00:00.000Z" });
    const remoteOnly = makeRecord({ id: "attempt.remote", submittedAt: "2026-10-03T09:00:00.000Z" });
    const conflictLocal = makeRecord({ id: "attempt.conflict", passed: true });
    const conflictRemote = makeRecord({ id: "attempt.conflict", passed: false });
    const dupA = makeRecord({ id: "attempt.dup", passed: true });
    const dupB = makeRecord({ id: "attempt.dup", passed: false });
    const unsyncable = makeRecord({ id: "attempt.odd", graderSummary: { ...goodSummary(), x: 1 } });
    return {
      local: [shared, localOnly, conflictLocal, dupA, dupB, structuredClone(dupA), unsyncable, null, 42],
      remote: [
        wire(shared),
        wire(remoteOnly),
        wire(conflictRemote),
        wire(shared, 9),
        null,
        { dtoVersion: 1 },
        wire({ ...remoteOnly, extra: true }),
      ],
    };
  }

  function mulberry32(seed: number) {
    let state = seed;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled<T>(items: readonly T[], random: () => number): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
    }
    return copy;
  }

  it("produces identical plans for shuffled inputs", () => {
    const { local, remote } = scenario();
    const baseline = planAttemptMerge(local, remote);
    expect(baseline.entries.length).toBeGreaterThan(5);

    const random = mulberry32(20261010);
    for (let run = 0; run < 40; run += 1) {
      const plan = planAttemptMerge(shuffled(local, random), shuffled(remote, random));
      expect(plan).toStrictEqual(baseline);
    }
    expect(planAttemptMerge([...local].reverse(), [...remote].reverse())).toStrictEqual(baseline);
  });

  it("orders equal submittedAt timestamps by id", () => {
    const at = "2026-10-03T12:00:00.000Z";
    const plan = planAttemptMerge(
      [makeRecord({ id: "attempt.c", submittedAt: at }), makeRecord({ id: "attempt.a", submittedAt: at })],
      [wire(makeRecord({ id: "attempt.b", submittedAt: at }))],
    );
    expect(ids(plan)).toEqual(["attempt.a", "attempt.b", "attempt.c"]);
  });

  it("orders chronologically across UTC offsets, with rejected entries last", () => {
    const plan = planAttemptMerge(
      [
        makeRecord({ id: "attempt.utc", submittedAt: "2026-10-03T08:00:00.000Z" }),
        makeRecord({ id: "attempt.bkk", submittedAt: "2026-10-03T12:00:00.000+07:00" }), // 05:00Z
      ],
      [{ dtoVersion: 1 }, wire(makeRecord({ id: "attempt.a0", submittedAt: "2026-10-04T00:00:00.000Z" }))],
    );
    expect(ids(plan)).toEqual(["attempt.bkk", "attempt.utc", "attempt.a0", null]);
    expect(plan.entries.at(-1)?.status).toBe(AttemptMergeStatus.INVALID_REMOTE);
  });

  it("orders rejected entries by id (null last), status, then error code", () => {
    const plan = planAttemptMerge(
      [{ id: "attempt.z" }, { id: "attempt.m" }, "junk"],
      [wire({ ...makeRecord({ id: "attempt.m" }), extra: 1 }), { dtoVersion: 3, attempt: { id: "attempt.m" } }, null],
    );
    expect(plan.entries.map((e) => [e.attemptId, e.status])).toEqual([
      ["attempt.m", "invalid_remote"],
      ["attempt.m", "invalid_remote"],
      ["attempt.m", "unsyncable_local"],
      ["attempt.z", "unsyncable_local"],
      [null, "invalid_remote"],
      [null, "unsyncable_local"],
    ]);
    const mRemote = only(plan, AttemptMergeStatus.INVALID_REMOTE).filter((e) => e.attemptId === "attempt.m");
    expect(mRemote.map((e) => e.error.code)).toEqual([
      SyncDtoErrorCode.INVALID_ATTEMPT,
      SyncDtoErrorCode.UNSUPPORTED_VERSION,
    ]);
  });

  it("is repeatable and its returned records are detached from inputs and later plans", () => {
    const { local, remote } = scenario();
    const detached = makeRecord({ id: "attempt.detached" });
    local.push(detached);
    remote.push(wire(detached));

    const first = planAttemptMerge(local, remote);
    const second = planAttemptMerge(local, remote);
    expect(second).toStrictEqual(first);

    const exists = only(first, AttemptMergeStatus.EXISTS).find(
      (entry) => entry.attemptId === "attempt.detached",
    );
    expect(exists).toBeDefined();
    (exists!.local as { passed: boolean }).passed = false;
    expect(planAttemptMerge(local, remote)).toStrictEqual(second);
    expect(detached.passed).toBe(true);
  });
});

describe("planAttemptMerge input safety and boundaries", () => {
  it("never mutates deep-frozen inputs", () => {
    const { local, remote } = (() => {
      const shared = makeRecord({ id: "attempt.shared" });
      return {
        local: [shared, makeRecord({ id: "attempt.odd", graderSummary: { ...goodSummary(), x: 1 } }), null],
        remote: [wire(shared), wire(makeRecord({ id: "attempt.r" })), { dtoVersion: 2 }],
      };
    })();
    deepFreeze(local);
    deepFreeze(remote);
    const localBefore = structuredClone(local);
    const remoteBefore = structuredClone(remote);

    const plan = planAttemptMerge(local, remote);

    expect(plan.entries.length).toBeGreaterThan(0);
    expect(local).toStrictEqual(localBefore);
    expect(remote).toStrictEqual(remoteBefore);
    expect(Object.isFrozen(local)).toBe(true);
  });

  it("calls no persistence, engine, reward or network operation", () => {
    const spies = [
      vi.spyOn(MemoryLearningPersistence.prototype, "addAttempt"),
      vi.spyOn(MemoryLearningPersistence.prototype, "addAttemptIfAbsent"),
      vi.spyOn(MemoryLearningPersistence.prototype, "getAttempts"),
      vi.spyOn(MemoryLearningPersistence.prototype, "clearAll"),
      vi.spyOn(IndexedDbLearningPersistence.prototype, "addAttempt"),
      vi.spyOn(IndexedDbLearningPersistence.prototype, "addAttemptIfAbsent"),
      vi.spyOn(IndexedDbLearningPersistence.prototype, "getAttempts"),
      vi.spyOn(LearningEngine.prototype, "initialize"),
      vi.spyOn(LearningEngine.prototype, "recordAttempt"),
      vi.spyOn(MetaProgressionEngine.prototype, "initialize"),
      vi.spyOn(MetaProgressionEngine.prototype, "recordAttempt"),
      vi.spyOn(MetaProgressionEngine.prototype, "reconcileAttempts"),
      vi.spyOn(globalThis, "fetch"),
    ];
    try {
      const record = makeRecord();
      planAttemptMerge([record, makeRecord({ id: "attempt.b" })], [wire(record), wire(makeRecord({ id: "attempt.c" }))]);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });
});

describe("planAttemptMerge same-id ambiguity (PHASE-04C.1B-R1)", () => {
  it("valid + unsyncable local with the same id and no remote: conflict, never local_only", () => {
    const valid = makeRecord({ id: "attempt.amb" });
    const unsyncable = makeRecord({ id: "attempt.amb", graderSummary: { ...goodSummary(), stdout: "x" } });
    const plan = planAttemptMerge([valid, unsyncable], []);

    expect(only(plan, AttemptMergeStatus.LOCAL_ONLY)).toHaveLength(0);
    const [conflict] = only(plan, AttemptMergeStatus.CONFLICT);
    expect(conflict?.reasons).toEqual([AttemptConflictReason.LOCAL_UNSYNCABLE]);
    expect(conflict?.local).toStrictEqual([valid]);
    expect(conflict?.remote).toEqual([]);
    const [rejected] = only(plan, AttemptMergeStatus.UNSYNCABLE_LOCAL);
    expect(rejected?.attemptId).toBe("attempt.amb");
    expect(rejected?.error.code).toBe(SyncDtoErrorCode.UNSYNCABLE);
  });

  it("valid + malformed remote with the same id and no local: conflict, never remote_only", () => {
    const valid = makeRecord({ id: "attempt.amb" });
    const plan = planAttemptMerge([], [wire({ ...valid, submissionIndex: 0 }), wire(valid)]);

    expect(only(plan, AttemptMergeStatus.REMOTE_ONLY)).toHaveLength(0);
    const [conflict] = only(plan, AttemptMergeStatus.CONFLICT);
    expect(conflict?.reasons).toEqual([AttemptConflictReason.REMOTE_INVALID]);
    expect(conflict?.remote).toStrictEqual([valid]);
    const [invalid] = only(plan, AttemptMergeStatus.INVALID_REMOTE);
    expect(invalid?.attemptId).toBe("attempt.amb");
    expect(invalid?.error.code).toBe(SyncDtoErrorCode.INVALID_ATTEMPT);
  });

  it("equivalent valid copies on both sides plus a rejected same-id record: conflict, never exists", () => {
    const record = makeRecord({ id: "attempt.amb" });
    const unsyncable = makeRecord({ id: "attempt.amb", graderSummary: { ...goodSummary(), stdout: "x" } });
    const localPlan = planAttemptMerge([record, unsyncable], [wire(record)]);
    expect(only(localPlan, AttemptMergeStatus.EXISTS)).toHaveLength(0);
    expect(only(localPlan, AttemptMergeStatus.CONFLICT)[0]?.reasons).toEqual([
      AttemptConflictReason.LOCAL_UNSYNCABLE,
    ]);

    const remotePlan = planAttemptMerge([record], [wire(record), wire({ ...record, submissionIndex: 0 })]);
    expect(only(remotePlan, AttemptMergeStatus.EXISTS)).toHaveLength(0);
    expect(only(remotePlan, AttemptMergeStatus.CONFLICT)[0]?.reasons).toEqual([
      AttemptConflictReason.REMOTE_INVALID,
    ]);
  });

  it("a rejected remote with a valid local and no valid remote blocks upload (local_only, blocked)", () => {
    const local = makeRecord({ id: "attempt.blocked" });
    const plan = planAttemptMerge([local], [wire({ ...local, submissionIndex: 0 })]);

    const [localOnly] = only(plan, AttemptMergeStatus.LOCAL_ONLY);
    expect(localOnly?.blockedByInvalidRemote).toBe(true);
    expect(only(plan, AttemptMergeStatus.CONFLICT)).toHaveLength(0);
  });

  it("rejected records without a readable id never associate with valid ids", () => {
    const valid = makeRecord({ id: "attempt.clean" });
    const plan = planAttemptMerge([valid, { junk: true }], [null, wire(valid)]);

    expect(only(plan, AttemptMergeStatus.EXISTS)).toHaveLength(1);
    expect(only(plan, AttemptMergeStatus.CONFLICT)).toHaveLength(0);
    const nullIds = plan.entries.filter((e) => e.attemptId === null);
    expect(nullIds.map((e) => e.status).sort()).toEqual(["invalid_remote", "unsyncable_local"]);
  });

  it("same-id ambiguity holds under shuffled input order", () => {
    const valid = makeRecord({ id: "attempt.amb" });
    const unsyncable = makeRecord({ id: "attempt.amb", graderSummary: { ...goodSummary(), stdout: "x" } });
    const local = [valid, unsyncable, makeRecord({ id: "attempt.other", submittedAt: "2026-10-03T13:00:00.000Z" })];
    const remote = [wire(valid), wire({ ...valid, submissionIndex: 0 }), null];
    const baseline = planAttemptMerge(local, remote);

    expect(only(baseline, AttemptMergeStatus.EXISTS)).toHaveLength(0);
    expect(only(baseline, AttemptMergeStatus.CONFLICT)).toHaveLength(1);
    for (const order of [
      [local, remote],
      [[...local].reverse(), [...remote].reverse()],
      [[unsyncable, local[2], valid], [null, wire({ ...valid, submissionIndex: 0 }), wire(valid)]],
    ] as const) {
      expect(planAttemptMerge(order[0], order[1])).toStrictEqual(baseline);
    }
  });

  it("orders equal instants written with different offsets by attempt id", () => {
    // Same instant: 12:00+07:00 == 05:00Z. Raw strings would sort 'b' (05:00Z) first; id must decide.
    const b = makeRecord({ id: "attempt.b", submittedAt: "2026-10-03T05:00:00.000Z" });
    const a = makeRecord({ id: "attempt.a", submittedAt: "2026-10-03T12:00:00.000+07:00" });
    const plan = planAttemptMerge([b, a], []);
    expect(ids(plan)).toEqual(["attempt.a", "attempt.b"]);

    const reversed = planAttemptMerge([a, b], []);
    expect(reversed).toStrictEqual(plan);
  });

  it("does not mutate inputs and performs no automatic conflict resolution", () => {
    const valid = makeRecord({ id: "attempt.amb" });
    const unsyncable = makeRecord({ id: "attempt.amb", graderSummary: { ...goodSummary(), stdout: "x" } });
    const remoteBad = wire({ ...valid, submissionIndex: 0 });
    const local = deepFreeze([valid, unsyncable]);
    const remote = deepFreeze([remoteBad, wire(valid)]);
    const localBefore = structuredClone(local);
    const remoteBefore = structuredClone(remote);

    const plan = planAttemptMerge(local, remote);

    expect(local).toStrictEqual(localBefore);
    expect(remote).toStrictEqual(remoteBefore);
    expect(plan.counts.exists).toBe(0);
    expect(plan.counts.local_only).toBe(0);
    expect(plan.counts.remote_only).toBe(0);
    expect(plan.counts.conflict).toBe(1);
  });
});

describe("planAttemptMerge same-id correlation with unsafe ids (PHASE-04C.1B-R2)", () => {
  const UNICODE_ID = "attempt:tiếng-Việt";
  const LONG_ID = `attempt:${"x".repeat(600)}`;

  function unsyncableCopy(id: string) {
    return makeRecord({ id, graderSummary: { ...goodSummary(), stdout: "x" } });
  }

  it("valid + unsyncable local with the same non-ASCII id and no remote: conflict, not local_only", () => {
    const valid = makeRecord({ id: UNICODE_ID });
    const plan = planAttemptMerge([valid, unsyncableCopy(UNICODE_ID)], []);

    expect(only(plan, AttemptMergeStatus.LOCAL_ONLY)).toHaveLength(0);
    const [conflict] = only(plan, AttemptMergeStatus.CONFLICT);
    expect(conflict?.attemptId).toBe(UNICODE_ID);
    expect(conflict?.reasons).toEqual([AttemptConflictReason.LOCAL_UNSYNCABLE]);
    expect(conflict?.local).toStrictEqual([valid]);
  });

  it("valid + invalid remote with the same non-ASCII id and no local: conflict, not remote_only", () => {
    const valid = makeRecord({ id: UNICODE_ID });
    const plan = planAttemptMerge([], [wire({ ...valid, submissionIndex: 0 }), wire(valid)]);

    expect(only(plan, AttemptMergeStatus.REMOTE_ONLY)).toHaveLength(0);
    const [conflict] = only(plan, AttemptMergeStatus.CONFLICT);
    expect(conflict?.attemptId).toBe(UNICODE_ID);
    expect(conflict?.reasons).toEqual([AttemptConflictReason.REMOTE_INVALID]);
    expect(conflict?.remote).toStrictEqual([valid]);
  });

  it("valid local + rejected remote with the same unsafe id cannot become an unblocked upload candidate", () => {
    const local = makeRecord({ id: UNICODE_ID });
    const plan = planAttemptMerge([local], [wire({ ...local, submissionIndex: 0 })]);

    const [localOnly] = only(plan, AttemptMergeStatus.LOCAL_ONLY);
    expect(localOnly?.attemptId).toBe(UNICODE_ID);
    expect(localOnly?.blockedByInvalidRemote).toBe(true);
  });

  it("rejected diagnostics report attemptId null for ids that fail the public SAFE_ID policy", () => {
    const plan = planAttemptMerge(
      [unsyncableCopy(UNICODE_ID), unsyncableCopy(LONG_ID), unsyncableCopy("has space")],
      [wire({ ...makeRecord({ id: UNICODE_ID }), submissionIndex: 0 })],
    );

    const rejected = plan.entries.filter(
      (e) => e.status === AttemptMergeStatus.UNSYNCABLE_LOCAL || e.status === AttemptMergeStatus.INVALID_REMOTE,
    );
    expect(rejected).toHaveLength(4);
    for (const entry of rejected) expect(entry.attemptId).toBeNull();
  });

  it("correlates IDs longer than the diagnostic limit when the schema accepts them", () => {
    const valid = makeRecord({ id: LONG_ID });
    const local = makeRecord({ id: LONG_ID, submittedAt: "2026-10-03T13:00:00.000Z" });
    expect(AttemptRecordSchema.safeParse(valid).success).toBe(true);

    const local_plan = planAttemptMerge([valid, unsyncableCopy(LONG_ID)], []);
    expect(only(local_plan, AttemptMergeStatus.LOCAL_ONLY)).toHaveLength(0);
    expect(only(local_plan, AttemptMergeStatus.CONFLICT)[0]?.reasons).toEqual([
      AttemptConflictReason.LOCAL_UNSYNCABLE,
    ]);

    const remote_plan = planAttemptMerge([], [wire({ ...local, submissionIndex: 0 }), wire(local)]);
    expect(only(remote_plan, AttemptMergeStatus.REMOTE_ONLY)).toHaveLength(0);
    expect(only(remote_plan, AttemptMergeStatus.CONFLICT)[0]?.reasons).toEqual([
      AttemptConflictReason.REMOTE_INVALID,
    ]);
  });

  it("does not treat near-identical ids as matches (no trimming, case folding or normalization)", () => {
    const exact = makeRecord({ id: UNICODE_ID });
    const trailing = unsyncableCopy(`${UNICODE_ID} `);
    const folded = unsyncableCopy(UNICODE_ID.toUpperCase());
    const plan = planAttemptMerge([exact, trailing, folded], []);

    expect(only(plan, AttemptMergeStatus.CONFLICT)).toHaveLength(0);
    expect(only(plan, AttemptMergeStatus.LOCAL_ONLY).map((e) => e.attemptId)).toEqual([UNICODE_ID]);
    expect(only(plan, AttemptMergeStatus.UNSYNCABLE_LOCAL)).toHaveLength(2);
  });

  it("stays deterministic under shuffled input order", () => {
    const local = [
      makeRecord({ id: UNICODE_ID }),
      unsyncableCopy(UNICODE_ID),
      makeRecord({ id: LONG_ID, submittedAt: "2026-10-03T09:00:00.000Z" }),
      makeRecord({ id: "attempt.clean", submittedAt: "2026-10-03T14:00:00.000Z" }),
      null,
    ];
    const remote = [wire({ ...makeRecord({ id: UNICODE_ID }), submissionIndex: 0 }), wire(makeRecord({ id: LONG_ID, submittedAt: "2026-10-03T09:00:00.000Z" })), null];
    const baseline = planAttemptMerge(local, remote);

    const rotations = (items: readonly unknown[]) =>
      items.map((_, i) => [...items.slice(i), ...items.slice(0, i)]);
    for (const l of [...rotations(local), [...local].reverse()]) {
      for (const r of [...rotations(remote), [...remote].reverse()]) {
        expect(planAttemptMerge(l, r)).toStrictEqual(baseline);
      }
    }
  });

  it("never mutates frozen inputs and never leaks the raw rejected id into diagnostics", () => {
    const canary = "CANARY_ID_tiếng-Việt";
    const local = deepFreeze([
      makeRecord({ id: canary }),
      unsyncableCopy(canary),
    ]);
    const remote = deepFreeze([wire({ ...makeRecord({ id: canary }), submissionIndex: 0 })]);
    const localBefore = structuredClone(local);
    const remoteBefore = structuredClone(remote);

    const plan = planAttemptMerge(local, remote);

    expect(local).toStrictEqual(localBefore);
    expect(remote).toStrictEqual(remoteBefore);
    const diagnostics = plan.entries.filter(
      (e) => e.status === AttemptMergeStatus.UNSYNCABLE_LOCAL || e.status === AttemptMergeStatus.INVALID_REMOTE,
    );
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(JSON.stringify(diagnostics)).not.toContain(canary);
    for (const entry of diagnostics) expect(entry.attemptId).toBeNull();
    expect(plan.counts.conflict).toBe(1);
    expect(plan.counts.local_only).toBe(0);
  });
});
