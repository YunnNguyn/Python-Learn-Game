import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CapstoneEvidence,
  CourseGraduationStatus,
  getCourseGraduation,
} from "../../src/app/course-graduation";
import { selectCourseReview } from "../../src/app/course-review";
import { getCourseActivityIds, getNextActivityInCourse, getNextStudyActivity } from "../../src/app/learning-path";
import {
  createApplicationServices,
  type ApplicationServices,
  type PlayableMissionSession,
} from "../../src/app/services/application-services";
import { CS116_PRODUCTION_IDS, registerCs116ProductionContent } from "../../src/content/cs116";
import {
  PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_IDS,
  PYTHON_FOUNDATIONS_M11_ACTIVITY_IDS,
} from "../../src/content/python-foundations";
import {
  AttemptRecordSchema,
  Difficulty,
  HintLevel,
  LearningStage,
  type AttemptRecord,
  type CourseId,
  type LearningActivityId,
} from "../../src/core/domain";
import { ContentRegistry } from "../../src/core/content";
import { RewardReason } from "../../src/core/meta-progression";
import { MissionEngine } from "../../src/core/missions";
import { IndexedDbLearningPersistence } from "../../src/core/persistence";

/**
 * PHASE-09 / M11 at the SERVICE level: the capstone PF-27 continues the SAME Python Foundations
 * course, so a learner who finished PF-26 before M11 keeps every bit of progress and simply finds
 * PF-27 open. Grading is stubbed exactly like the M9/M10 service tests - the real grading of PF-27
 * runs against real Pyodide in tests/python-foundations/m11-missions.test.ts and end to end in the
 * Edge acceptance runner. What these tests pin is everything AROUND a grade: unlock order, direct
 * service enforcement, the requested-variant entry point, completion, rewards and isolation.
 */

const fake = vi.hoisted(() => {
  const create = () => ({
    initialize: async () => ({ ok: true as const }),
    prepareMission: async () => ({ ok: true as const }),
    run: async () => ({ status: "SUCCESS" as const, stdout: "ran\n", stderr: "" }),
    submit: async () => ({ status: "SUCCESS" as const, stdout: "", stderr: "", serialized: { variables: {} } }),
    dispose: () => undefined,
  });
  return { create };
});
vi.mock("../../src/core/runtime/pyodide", () => ({ createPyodideRuntimeManager: fake.create }));
vi.mock("../../src/core/runtime/local-python", () => ({ createLocalPythonRuntimeManager: fake.create }));

const ALL = PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS as readonly string[];
const M11 = PYTHON_FOUNDATIONS_M11_ACTIVITY_IDS as readonly string[];
const PF_1_TO_26 = ALL.slice(0, 26);
const PF25 = ALL[24]!;
const PF26 = ALL[25]!;
const PF27 = ALL[26]!;
const VS01 = CS116_PRODUCTION_IDS.activityVs01;
const VS02 = CS116_PRODUCTION_IDS.activityVs02;
const PYTHON = PYTHON_FOUNDATIONS_IDS.course as CourseId;

function useFactory(): IDBFactory {
  const factory = new IDBFactory();
  vi.stubGlobal("indexedDB", factory);
  return factory;
}

async function start(): Promise<ApplicationServices> {
  const services = createApplicationServices();
  await services.initialize();
  return services;
}

async function openPlayable(
  services: ApplicationServices,
  activityId: string,
  options: Parameters<ApplicationServices["createMissionSession"]>[1] = { resumeDraft: false },
): Promise<PlayableMissionSession> {
  const created = await services.createMissionSession(activityId, options);
  if (!created.ok) throw new Error(`${activityId}: ${created.error.code} ${created.error.message}`);
  return created.value;
}

async function submit(session: PlayableMissionSession, passed: boolean, code = "x = 1") {
  const spy = vi.spyOn(MissionEngine.prototype, "submit").mockImplementation(async () => ({
    execution: { status: "SUCCESS" as const, stdout: "", stderr: "" },
    grading: { passed, checks: [] },
  }));
  try {
    return await session.session.submit(code);
  } finally {
    spy.mockRestore();
  }
}

async function passThrough(services: ApplicationServices, activityIds: readonly string[]) {
  for (const activityId of activityIds) {
    const playable = await openPlayable(services, activityId);
    const result = await submit(playable, true);
    expect(result.attemptRecord.passed, activityId).toBe(true);
    playable.session.dispose();
  }
}

function makeAttempt(id: string, activityId: string, overrides: Record<string, unknown> = {}): AttemptRecord {
  return AttemptRecordSchema.parse({
    id,
    activityId,
    missionTemplateId: "template.test",
    missionTemplateVersion: 1,
    seed: "seed",
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
    ...overrides,
  });
}

/** Seeds reward-free history, exactly as it exists for a learner who finished M10 before M11 shipped. */
async function seedAttempts(factory: IDBFactory, entries: ReadonlyArray<readonly [string, Record<string, unknown>?]>) {
  const store = new IndexedDbLearningPersistence(factory);
  for (const [index, [activityId, overrides]] of entries.entries()) {
    await store.importAttemptIfAbsent(makeAttempt(`seed.${index}`, activityId, overrides), "cloud-import");
  }
  await store.close();
}

async function lockedCode(services: ApplicationServices, activityId: string): Promise<string | null> {
  const created = await services.createMissionSession(activityId, { resumeDraft: false });
  if (created.ok) {
    created.value.session.dispose();
    return null;
  }
  return created.error.code ?? "UNKNOWN";
}

const CS116_ACTIVITIES: readonly string[] = (() => {
  const content = new ContentRegistry();
  registerCs116ProductionContent(content);
  return content.getCourses().flatMap((course) => getCourseActivityIds(content, course.id));
})();

const progressOf = (services: ApplicationServices, ids: readonly string[]) =>
  JSON.stringify(ids.map((id) => services.learning.getActivityProgress(id as LearningActivityId)));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("M11 course structure", () => {
  it("is still ONE course: the 26 historical activities first and unchanged, then PF-27", async () => {
    useFactory();
    const services = await start();

    expect(M11).toEqual(["python-foundations.pf27"]);
    expect(ALL).toHaveLength(27);
    expect(ALL).toEqual(Array.from({ length: 27 }, (_, index) => `python-foundations.pf${String(index + 1).padStart(2, "0")}`));
    expect(getCourseActivityIds(services.content, PYTHON)).toEqual(ALL);
    expect(services.content.getCourses().map((course) => course.id)).toEqual([
      CS116_PRODUCTION_IDS.course,
      PYTHON_FOUNDATIONS_IDS.course,
    ]);
    expect(getNextActivityInCourse(services.content, PF26 as LearningActivityId)).toBe(PF27);
    expect(getNextActivityInCourse(services.content, PF27 as LearningActivityId)).toBeUndefined();
    await services.dispose();
  });
});

describe("M11 continuation - a learner who finished PF-26 continues, nothing is reset", () => {
  it("PF-27 opens, the 26 earlier activities keep their history, and the course is NOT complete (26/27)", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_26.map((id) => [id] as const));
    const services = await start();

    expect(await lockedCode(services, PF27)).toBeNull();
    for (const id of PF_1_TO_26) {
      expect(services.learning.getActivityProgress(id as LearningActivityId), id).toMatchObject({ completed: true, attemptCount: 1 });
      expect(await lockedCode(services, id), id).toBeNull();
    }
    expect(services.learning.getAttempts()).toHaveLength(26);
    // Before M11 this state read "course finished, review PF-26"; now there is one step left.
    expect(getNextStudyActivity(services.content, services.learning, PYTHON)).toEqual({
      activityId: PF27,
      reason: "NEXT",
    });
    const graduation = getCourseGraduation(services.content, services.learning, PYTHON)!;
    expect(graduation.status).toBe(CourseGraduationStatus.IN_PROGRESS);
    expect(graduation.completedCount).toBe(26);
    expect(graduation.totalCount).toBe(27);
    expect(graduation.remainingActivityIds).toEqual([PF27]);
    await services.dispose();
  });

  it("direct service enforcement: PF-27 stays locked until PF-26 is PASSED; a failed PF-26 does not open it", async () => {
    const factory = useFactory();
    await seedAttempts(factory, [...ALL.slice(0, 25).map((id) => [id] as const), [PF26, { passed: false }]]);
    const services = await start();

    expect(await lockedCode(services, PF26)).toBeNull();
    expect(await lockedCode(services, PF27)).toBe("ACTIVITY_LOCKED");
    const direct = await services.createMissionSession(PF27, { resumeDraft: false, requestedVariantIndex: 2 });
    expect(direct.ok).toBe(false);
    if (!direct.ok) expect(direct.error.code).toBe("ACTIVITY_LOCKED");

    await services.dispose();
  });

  it("a learner who has not finished PF-25 cannot jump to PF-27", async () => {
    const factory = useFactory();
    await seedAttempts(factory, ALL.slice(0, 24).map((id) => [id] as const));
    const services = await start();

    expect(await lockedCode(services, PF25)).toBeNull();
    expect(await lockedCode(services, PF26)).toBe("ACTIVITY_LOCKED");
    expect(await lockedCode(services, PF27)).toBe("ACTIVITY_LOCKED");
    await services.dispose();
  });

  it("an attempted (even failed) PF-27 stays reachable and counts as an attempt, not as completion", async () => {
    const factory = useFactory();
    await seedAttempts(factory, [...PF_1_TO_26.map((id) => [id] as const), [PF27, { passed: false }]]);
    const services = await start();

    expect(await lockedCode(services, PF27)).toBeNull();
    expect(services.learning.getActivityProgress(PF27 as LearningActivityId)).toMatchObject({
      attemptCount: 1,
      successfulAttemptCount: 0,
      completed: false,
    });
    const graduation = getCourseGraduation(services.content, services.learning, PYTHON)!;
    expect(graduation.status).toBe(CourseGraduationStatus.IN_PROGRESS);
    expect(graduation.capstone?.evidence).toBe(CapstoneEvidence.NONE);
    expect(getNextStudyActivity(services.content, services.learning, PYTHON)).toEqual({
      activityId: PF27,
      reason: "CONTINUE",
    });
    await services.dispose();
  });

  it("PF-27 starts from contracts only: the starter has TODO stubs and hint levels H1-H4 exist", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_26.map((id) => [id] as const));
    const services = await start();

    const playable = await openPlayable(services, PF27);
    expect(playable.initialCode).toContain("TODO");
    expect(playable.initialCode).toContain("def clean_annotations");
    expect(playable.initialCode).not.toMatch(/drop_duplicates|to_numeric|groupby|ax\.bar|\.bar\(/);
    for (let level = 0; level < 4; level += 1) playable.session.revealNextHint();
    expect(playable.session.getRevealedHints().map((hint) => hint.level)).toEqual([
      HintLevel.H1,
      HintLevel.H2,
      HintLevel.H3,
      HintLevel.H4,
    ]);
    playable.session.dispose();
    await services.dispose();
  });
});

describe("M11 graduation through the real services", () => {
  it("27/27 is COMPLETED, survives a reload, and is not revoked by a later failure", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_26.map((id) => [id] as const));
    const first = await start();
    await passThrough(first, [PF27]);

    const done = getCourseGraduation(first.content, first.learning, PYTHON)!;
    expect(done.status).toBe(CourseGraduationStatus.COMPLETED);
    expect(done.completedCount).toBe(27);
    // CS116 semantics are unchanged: a finished course still recommends its closing REVIEW-stage mission.
    expect(getNextStudyActivity(first.content, first.learning, PYTHON)).toEqual({
      activityId: PF26,
      reason: "COMPLETE_REVIEW",
    });

    // A failed fresh-variant retry and a failed older activity after completion.
    const retry = await openPlayable(first, PF27, { requestedVariantIndex: done.capstone!.freshVariantIndex, resumeDraft: true });
    await submit(retry, false);
    retry.session.dispose();
    const older = await openPlayable(first, ALL[9]!);
    await submit(older, false);
    older.session.dispose();
    await first.dispose();

    const reloaded = await start();
    const after = getCourseGraduation(reloaded.content, reloaded.learning, PYTHON)!;
    expect(after.status).toBe(CourseGraduationStatus.COMPLETED);
    expect(after.completedCount).toBe(27);
    expect(after.completedAt).toBe(done.completedAt);
    expect(after.capstone?.attemptCount).toBe(done.capstone!.attemptCount + 1);
    await reloaded.dispose();
  });

  it("a PF-27 pass with H3 is WITH_SUPPORT; a later pass on a fresh variant without H3/H4 is INDEPENDENT", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_26.map((id) => [id] as const));
    const services = await start();

    const supported = await openPlayable(services, PF27);
    for (let level = 0; level < 3; level += 1) supported.session.revealNextHint();
    const result = await submit(supported, true);
    expect(result.attemptRecord.hintsUsed).toContain(HintLevel.H3);
    supported.session.dispose();

    let view = getCourseGraduation(services.content, services.learning, PYTHON)!;
    expect(view.status).toBe(CourseGraduationStatus.COMPLETED);
    expect(view.capstone?.evidence).toBe(CapstoneEvidence.WITH_SUPPORT);
    expect(view.capstone?.freshVariantIndex).toBe(1);

    const retry = await openPlayable(services, PF27, { requestedVariantIndex: 1, resumeDraft: true });
    expect(retry.variantIndex).toBe(1);
    expect(retry.session.instance.seed).not.toBe(result.attemptRecord.seed);
    retry.session.revealNextHint(); // H1 only
    await submit(retry, true);
    retry.session.dispose();

    view = getCourseGraduation(services.content, services.learning, PYTHON)!;
    expect(view.status).toBe(CourseGraduationStatus.COMPLETED);
    expect(view.capstone?.evidence).toBe(CapstoneEvidence.INDEPENDENT);
    expect(view.capstone?.passedAttemptCount).toBe(2);
    expect(view.capstone?.freshVariantIndex).toBe(2);
    await services.dispose();
  });

  it("same-day attempts never produce RETAINED, even after repeated PF-26 and PF-27 passes", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_26.map((id) => [id] as const));
    const services = await start();
    await passThrough(services, [PF27, PF26, PF27]);

    const view = getCourseGraduation(services.content, services.learning, PYTHON)!;
    expect(view.retention.retainedConceptCount).toBe(0);
    await services.dispose();
  });

  it("review (course scoped) after completion never offers a CS116 or locked activity and keeps a retention slot", async () => {
    const factory = useFactory();
    await seedAttempts(factory, [
      ...CS116_ACTIVITIES.map((id) => [id, { submittedAt: "2026-09-20T10:00:00.000Z", passed: false }] as const),
      ...PF_1_TO_26.map((id) => [id] as const),
    ]);
    const services = await start();
    await passThrough(services, [PF27]);

    const review = selectCourseReview({
      content: services.content,
      reader: services.learning,
      courseId: PYTHON,
      now: new Date(),
    });
    const pfSet = new Set(ALL);
    for (const item of review.items) expect(pfSet.has(item.activityId), item.activityId).toBe(true);
    expect(review.items.length).toBeLessThanOrEqual(3);
    await services.dispose();
  });
});

describe("M11 requested variant (?variant=N) entry point", () => {
  it("opens exactly that variant, with a seed derived from it, and keeps the course unchanged", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_26.map((id) => [id] as const));
    const services = await start();

    const three = await openPlayable(services, PF27, { requestedVariantIndex: 3, resumeDraft: true });
    expect(three.variantIndex).toBe(3);
    expect(three.session.instance.seed).toMatch(/variant:3$/);
    three.session.dispose();
    const zero = await openPlayable(services, PF27, { resumeDraft: true });
    expect(zero.variantIndex).toBe(0);
    expect(zero.session.instance.seed).not.toBe(three.session.instance.seed);
    zero.session.dispose();
    await services.dispose();
  });

  it("ignores an invalid value (negative, fractional, NaN, Infinity) and behaves as if it was absent", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_26.map((id) => [id] as const));
    const services = await start();

    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2]) {
      const playable = await openPlayable(services, PF27, { requestedVariantIndex: bad, resumeDraft: true });
      expect(playable.variantIndex, String(bad)).toBe(0);
      playable.session.dispose();
    }
    await services.dispose();
  });

  it("resumes the draft of the SAME variant after a reload, and starts another variant from the starter code", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_26.map((id) => [id] as const));
    const services = await start();

    const playable = await openPlayable(services, PF27, { requestedVariantIndex: 2, resumeDraft: true });
    playable.draft.update({ code: "my_wip = 1  # variant 2", hintsUsed: [] }, { immediate: true });
    await playable.draft.flush();
    playable.session.dispose();
    await services.dispose();

    const reloaded = await start();
    const same = await openPlayable(reloaded, PF27, { requestedVariantIndex: 2, resumeDraft: true });
    expect(same.resumedDraft).toBe(true);
    expect(same.initialCode).toBe("my_wip = 1  # variant 2");
    expect(same.variantIndex).toBe(2);
    same.session.dispose();

    // No query at all: the stored draft decides, exactly as before M11.
    const plain = await openPlayable(reloaded, PF27, { resumeDraft: true });
    expect(plain.resumedDraft).toBe(true);
    expect(plain.variantIndex).toBe(2);
    plain.session.dispose();

    const other = await openPlayable(reloaded, PF27, { requestedVariantIndex: 4, resumeDraft: true });
    expect(other.resumedDraft).toBe(false);
    expect(other.variantIndex).toBe(4);
    expect(other.initialCode).toContain("TODO");
    expect(other.initialCode).not.toContain("variant 2");
    other.session.dispose();
    await reloaded.dispose();
  });

  it("an explicit variantIndex or seed still wins over requestedVariantIndex", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_26.map((id) => [id] as const));
    const services = await start();

    const explicit = await openPlayable(services, PF27, { variantIndex: 5, requestedVariantIndex: 1, resumeDraft: false });
    expect(explicit.variantIndex).toBe(5);
    explicit.session.dispose();
    await services.dispose();
  });
});

describe("M11 retries do not farm rewards", () => {
  const reasonsOf = (services: ApplicationServices, attemptId: string) =>
    services.metaProgression.getRewardGrantsForAttempt(attemptId).map((grant) => grant.reason);
  const countOf = (services: ApplicationServices, reason: string, activityId?: string) =>
    services.metaProgression
      .getSnapshot()
      .recentRewards.filter((grant) => grant.reason === reason && (activityId === undefined || grant.sourceActivityId === activityId))
      .length;

  it("the first PF-27 pass earns its first-pass reward once; any number of fresh-variant retries add nothing more once the daily bonus is spent", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_26.map((id) => [id] as const));
    const services = await start();

    const first = await openPlayable(services, PF27);
    const firstResult = await submit(first, true);
    first.session.dispose();
    expect(reasonsOf(services, firstResult.attemptRecord.id)).toContain(RewardReason.FIRST_ACTIVITY_PASS);

    // The first few retries may finish today's daily goals (a once-per-day bonus that already exists).
    for (const variant of [1, 2, 3]) {
      const retry = await openPlayable(services, PF27, { requestedVariantIndex: variant, resumeDraft: false });
      const result = await submit(retry, true);
      retry.session.dispose();
      expect(reasonsOf(services, result.attemptRecord.id), `variant ${variant}`).not.toContain(RewardReason.FIRST_ACTIVITY_PASS);
      expect(reasonsOf(services, result.attemptRecord.id), `variant ${variant}`).not.toContain(RewardReason.FOCUSED_ACTIVITY_PASS);
    }
    const saturated = JSON.stringify(services.metaProgression.getSnapshot().inventory);

    for (const variant of [4, 5, 6, 7, 8]) {
      const retry = await openPlayable(services, PF27, { requestedVariantIndex: variant, resumeDraft: false });
      const result = await submit(retry, true);
      retry.session.dispose();
      expect(reasonsOf(services, result.attemptRecord.id), `variant ${variant}`).toEqual([]);
    }
    expect(JSON.stringify(services.metaProgression.getSnapshot().inventory)).toBe(saturated);
    expect(countOf(services, RewardReason.FIRST_ACTIVITY_PASS, PF27)).toBe(1);
    expect(countOf(services, RewardReason.FOCUSED_ACTIVITY_PASS, PF27)).toBeLessThanOrEqual(1);
    expect(countOf(services, RewardReason.DAILY_GOALS_COMPLETE)).toBeLessThanOrEqual(1);
    await services.dispose();
  });

  it("repeating an older activity after completion earns no further reward once its own first pass is spent", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_26.map((id) => [id] as const));
    const services = await start();
    await passThrough(services, [PF27]);
    const target = ALL[10]!;

    // A history imported from the cloud/seed carries no rewards, so the first NEW pass of an old
    // activity may claim its one-time first-pass reward - exactly the pre-M11 behavior.
    const once = await openPlayable(services, target, { requestedVariantIndex: 1, resumeDraft: false });
    await submit(once, true);
    once.session.dispose();
    const spent = JSON.stringify(services.metaProgression.getSnapshot().inventory);

    for (const variant of [2, 3, 4]) {
      const again = await openPlayable(services, target, { requestedVariantIndex: variant, resumeDraft: false });
      const result = await submit(again, true);
      again.session.dispose();
      expect(reasonsOf(services, result.attemptRecord.id), `variant ${variant}`).toEqual([]);
    }
    expect(JSON.stringify(services.metaProgression.getSnapshot().inventory)).toBe(spent);
    expect(countOf(services, RewardReason.FIRST_ACTIVITY_PASS, target)).toBeLessThanOrEqual(1);
    await services.dispose();
  });
});

describe("M11 isolation - CS116 and the earlier Python activities are untouched", () => {
  it("finishing all 27 Python Foundations activities opens only the first CS116 mission", async () => {
    const factory = useFactory();
    await seedAttempts(factory, ALL.map((id) => [id] as const));
    const services = await start();

    expect(await lockedCode(services, VS01)).toBeNull();
    expect(await lockedCode(services, VS02)).toBe("ACTIVITY_LOCKED");
    await services.dispose();
  });

  it("finishing all of CS116 opens only PF-01, never PF-27", async () => {
    const factory = useFactory();
    await seedAttempts(factory, CS116_ACTIVITIES.map((id) => [id] as const));
    const services = await start();

    expect(await lockedCode(services, ALL[0]!)).toBeNull();
    expect(await lockedCode(services, PF27)).toBe("ACTIVITY_LOCKED");
    expect(await lockedCode(services, PF26)).toBe("ACTIVITY_LOCKED");
    await services.dispose();
  });

  it("PF-27 passes change no CS116 progress and no PF-01..PF-26 progress", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_26.map((id) => [id] as const));
    const services = await start();
    const cs116Concepts = services.content
      .getConcepts()
      .map((concept) => concept.id)
      .filter((id) => !String(id).startsWith("python."));
    const cs116Snapshot = () =>
      JSON.stringify([
        cs116Concepts.map((id) => services.learning.getConceptProgress(id)),
        CS116_ACTIVITIES.map((id) => services.learning.getActivityProgress(id as LearningActivityId)),
      ]);
    const before = cs116Snapshot();
    const earlier = progressOf(services, PF_1_TO_26);

    await passThrough(services, [PF27]);

    expect(cs116Snapshot()).toBe(before);
    expect(progressOf(services, PF_1_TO_26)).toBe(earlier);
    await services.dispose();
  });
});
