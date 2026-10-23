import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getCourseActivityIds, getNextActivityInCourse, getNextStudyActivity } from "../../src/app/learning-path";
import {
  createApplicationServices,
  type ApplicationServices,
  type PlayableMissionSession,
} from "../../src/app/services/application-services";
import { CS116_PRODUCTION_IDS, registerCs116ProductionContent } from "../../src/content/cs116";
import {
  PYTHON_FOUNDATIONS_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_IDS,
  PYTHON_FOUNDATIONS_M9_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_M10_ACTIVITY_IDS,
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
import { rawGetAll } from "../persistence/indexeddb-test-utils";

/**
 * PHASE-08 / M10 at the SERVICE level: the four new worlds continue the SAME Python Foundations
 * course, so a learner who finished M9 keeps every bit of progress and simply finds PF-16 open. Grading is stubbed here exactly like python-foundations-services.test.ts - the real
 * grading of all eleven missions runs against real Pyodide in tests/python-foundations/m10-*.test.ts
 * and, end to end, in the Edge acceptance runner. What these tests pin is everything AROUND a
 * grade: unlock order, continuation without a reset, persistence, rewards and isolation.
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

const M8 = PYTHON_FOUNDATIONS_ACTIVITY_IDS as readonly string[];
const M9 = PYTHON_FOUNDATIONS_M9_ACTIVITY_IDS as readonly string[];
const M10 = PYTHON_FOUNDATIONS_M10_ACTIVITY_IDS as readonly string[];
const ALL = PYTHON_FOUNDATIONS_ALL_ACTIVITY_IDS as readonly string[];
const PF_1_TO_15 = [...M8, ...M9];
const [PF16, PF17, PF18] = M10 as [string, string, string, ...string[]];
const PF15 = M9[M9.length - 1]!;
const PF26 = M10[M10.length - 1]!;
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
  options: { resumeDraft?: boolean } = { resumeDraft: false },
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

/** Seeds reward-free history (as it would exist for a learner who finished M8 before M9 shipped). */
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

const draftRows = (factory: IDBFactory) =>
  rawGetAll(factory, "python-learn-game", "missionDrafts") as Promise<Array<{ activityId: string; code: string }>>;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("M10 course structure", () => {
  it("is ONE course: PF-01..PF-15 first and unchanged, then the eleven M10 activities", async () => {
    useFactory();
    const services = await start();

    expect(M10).toHaveLength(11);
    expect(M10).toEqual(Array.from({ length: 11 }, (_, index) => `python-foundations.pf${16 + index}`));
    expect(getCourseActivityIds(services.content, PYTHON)).toEqual([...PF_1_TO_15, ...M10]);
    expect(ALL).toEqual([...PF_1_TO_15, ...M10]);
    expect(services.content.getCourses().map((course) => course.id)).toEqual([
      CS116_PRODUCTION_IDS.course,
      PYTHON_FOUNDATIONS_IDS.course,
    ]);
    expect(getNextActivityInCourse(services.content, PF15 as LearningActivityId)).toBe(PF16);
    expect(getNextActivityInCourse(services.content, PF26 as LearningActivityId)).toBeUndefined();
    await services.dispose();
  });
});

describe("M10 continuation - a learner who finished M9 continues, nothing is reset", () => {
  it("PF-16 is open, PF-17 onwards stay locked, and the PF-01..PF-15 history is untouched", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_15.map((id) => [id] as const));
    const services = await start();

    expect(await lockedCode(services, PF16)).toBeNull();
    for (const locked of M10.slice(1)) expect(await lockedCode(services, locked), locked).toBe("ACTIVITY_LOCKED");
    for (const id of PF_1_TO_15) {
      expect(services.learning.getActivityProgress(id as LearningActivityId), id).toMatchObject({ completed: true, attemptCount: 1 });
      expect(await lockedCode(services, id), id).toBeNull();
    }
    expect(services.learning.getAttempts()).toHaveLength(15);
    expect(getNextStudyActivity(services.content, services.learning, PYTHON)).toEqual({ activityId: PF16, reason: "NEXT" });
    await services.dispose();
  });

  it("finishing PF-15 does not show the course as complete: the next step is PF-16", async () => {
    useFactory();
    const services = await start();
    await passThrough(services, PF_1_TO_15);

    const next = getNextStudyActivity(services.content, services.learning, PYTHON);
    expect(next).toEqual({ activityId: PF16, reason: "NEXT" });
    await services.dispose();
  });

  it("each pass opens exactly the next M10 mission; the course ends only after PF-26, whose review is recommended", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_15.map((id) => [id] as const));
    const services = await start();

    for (const [index, activityId] of M10.entries()) {
      expect(await lockedCode(services, activityId), activityId).toBeNull();
      const next = M10[index + 1];
      if (next !== undefined) expect(await lockedCode(services, next), next).toBe("ACTIVITY_LOCKED");
      expect(getNextStudyActivity(services.content, services.learning, PYTHON), activityId).toEqual({ activityId, reason: "NEXT" });
      const playable = await openPlayable(services, activityId);
      await submit(playable, true);
      playable.session.dispose();
    }

    for (const activityId of ALL) {
      expect(services.learning.getActivityProgress(activityId as LearningActivityId).completed, activityId).toBe(true);
    }
    // A finished course recommends its closing REVIEW-stage mission: the PF-26 data-prep mini-project.
    expect(getNextStudyActivity(services.content, services.learning, PYTHON)).toEqual({
      activityId: PF26,
      reason: "COMPLETE_REVIEW",
    });
    await services.dispose();
  });

  it("a learner who has not finished M9 cannot jump into M10", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_15.slice(0, 14).map((id) => [id] as const));
    const services = await start();

    expect(await lockedCode(services, PF15)).toBeNull();
    for (const locked of M10) expect(await lockedCode(services, locked), locked).toBe("ACTIVITY_LOCKED");
    await services.dispose();
  });

  it("an attempted (even failed) M10 activity stays reachable; its successor needs a pass", async () => {
    const factory = useFactory();
    await seedAttempts(factory, [...PF_1_TO_15.map((id) => [id] as const), [PF16], [PF17, { passed: false }]]);
    const services = await start();

    expect(await lockedCode(services, PF17)).toBeNull();
    expect(await lockedCode(services, PF18)).toBe("ACTIVITY_LOCKED");
    expect(services.learning.getActivityProgress(PF17 as LearningActivityId)).toMatchObject({
      attemptCount: 1,
      successfulAttemptCount: 0,
      completed: false,
    });
    await services.dispose();
  });
});

describe("M10 Run versus Submit, rewards and persistence", () => {
  it("Run on an M10 mission records nothing and unlocks nothing", async () => {
    useFactory();
    const services = await start();
    await passThrough(services, PF_1_TO_15);
    const before = {
      attempts: services.learning.getAttempts().length,
      inventory: services.metaProgression.getSnapshot().inventory,
    };

    const playable = await openPlayable(services, PF16);
    expect((await playable.session.run("x = 1")).execution.status).toBe("SUCCESS");

    expect(services.learning.getAttempts()).toHaveLength(before.attempts);
    expect(services.metaProgression.getSnapshot().inventory).toEqual(before.inventory);
    expect(await lockedCode(services, PF17)).toBe("ACTIVITY_LOCKED");
    await services.dispose();
  });

  it("the first pass of an M10 mission earns its reward once; a failed Submit and a repeat earn nothing new", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_15.map((id) => [id] as const));
    const services = await start();
    const reasons = (attemptId: string) =>
      services.metaProgression.getRewardGrantsForAttempt(attemptId).map((grant) => grant.reason);

    const playable = await openPlayable(services, PF16);
    const failed = await submit(playable, false);
    expect(reasons(failed.attemptRecord.id)).toEqual([]);
    const passed = await submit(playable, true);
    expect(reasons(passed.attemptRecord.id)).toContain(RewardReason.FIRST_ACTIVITY_PASS);
    playable.session.dispose();

    const again = await openPlayable(services, PF16);
    const repeat = await submit(again, true);
    again.session.dispose();
    expect(reasons(repeat.attemptRecord.id)).not.toContain(RewardReason.FIRST_ACTIVITY_PASS);
    expect(
      services.metaProgression
        .getSnapshot()
        .recentRewards.filter((grant) => grant.reason === RewardReason.FIRST_ACTIVITY_PASS && grant.sourceActivityId === PF16),
    ).toHaveLength(1);
    await services.dispose();
  });

  it("an M10 pass, its unlock and its history survive a reload", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_15.map((id) => [id] as const));
    const first = await start();
    await passThrough(first, [PF16, PF17]);
    await first.dispose();

    const reloaded = await start();
    // The seeded history shares one timestamp, so the order of those rows is not part of the contract.
    expect(reloaded.learning.getAttempts().map((attempt) => attempt.activityId).sort()).toEqual([...PF_1_TO_15, PF16, PF17].sort());
    expect(reloaded.learning.getActivityProgress(PF17 as LearningActivityId).completed).toBe(true);
    expect(await lockedCode(reloaded, PF18)).toBeNull();
    expect(await lockedCode(reloaded, M10[3]!)).toBe("ACTIVITY_LOCKED");
    await reloaded.dispose();
  });

  it("the draft and hints of an M10 mission come back after leaving the page and after a reload", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_15.map((id) => [id] as const));
    const services = await start();

    const playable = await openPlayable(services, PF16);
    expect(playable.resumedDraft).toBe(false);
    expect(playable.initialCode).toContain("TODO");
    playable.session.revealNextHint();
    playable.draft.update(
      { code: "x_col = x[:, np.newaxis]  # wip", hintsUsed: playable.session.getRevealedHints().map((hint) => hint.level) },
      { immediate: true },
    );
    await playable.draft.flush();
    playable.session.dispose();
    await services.dispose();

    const reloaded = await start();
    const reopened = await openPlayable(reloaded, PF16, { resumeDraft: true });
    expect(reopened.resumedDraft).toBe(true);
    expect(reopened.initialCode).toBe("x_col = x[:, np.newaxis]  # wip");
    expect(reopened.session.getRevealedHints().map((hint) => hint.level)).toEqual([HintLevel.H1]);
    expect((await draftRows(factory)).map((row) => row.activityId)).toEqual([PF16]);
    reopened.session.dispose();
    await reloaded.dispose();
  });

  it("every M10 mission opens with its starter code (not the reference) and with hint levels H1-H4 available", async () => {
    const factory = useFactory();
    await seedAttempts(factory, ALL.slice(0, -1).map((id) => [id] as const));
    const services = await start();

    for (const activityId of M10) {
      const playable = await openPlayable(services, activityId);
      expect(playable.initialCode, activityId).toContain("TODO");
      for (let level = 0; level < 4; level += 1) playable.session.revealNextHint();
      expect(playable.session.getRevealedHints().map((hint) => hint.level), activityId).toEqual([
        HintLevel.H1,
        HintLevel.H2,
        HintLevel.H3,
        HintLevel.H4,
      ]);
      playable.session.dispose();
    }
    await services.dispose();
  });
});

describe("M10 isolation - CS116 and M7 practice are untouched", () => {
  it("finishing all of Python Foundations opens only the first CS116 mission", async () => {
    const factory = useFactory();
    await seedAttempts(factory, ALL.map((id) => [id] as const));
    const services = await start();

    expect(await lockedCode(services, VS01)).toBeNull();
    expect(await lockedCode(services, VS02)).toBe("ACTIVITY_LOCKED");
    await services.dispose();
  });

  it("finishing all of CS116 opens only PF-01, never an M10 mission", async () => {
    const factory = useFactory();
    await seedAttempts(factory, CS116_ACTIVITIES.map((id) => [id] as const));
    const services = await start();

    expect(await lockedCode(services, ALL[0]!)).toBeNull();
    for (const locked of M10) expect(await lockedCode(services, locked), locked).toBe("ACTIVITY_LOCKED");
    await services.dispose();
  });

  it("M10 passes change no CS116 progress and no PF-01..PF-15 progress", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_15.map((id) => [id] as const));
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
    const earlier = progressOf(services, PF_1_TO_15);

    await passThrough(services, [PF16, PF17, PF18]);

    expect(cs116Snapshot()).toBe(before);
    expect(progressOf(services, PF_1_TO_15)).toBe(earlier);
    await services.dispose();
  });

  it("M10 adds no practice pack and touches no practice store", async () => {
    const factory = useFactory();
    await seedAttempts(factory, PF_1_TO_15.map((id) => [id] as const));
    const services = await start();
    await passThrough(services, [PF16]);
    const packs = (await rawGetAll(factory, "python-learn-game", "practicePacks").catch(() => [])) as unknown[];
    expect(packs).toEqual([]);
    await services.dispose();
  });
});
