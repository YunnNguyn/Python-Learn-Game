import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCourseActivityIds } from "../../src/app/learning-path";
import {
  createApplicationServices,
  type ApplicationServices,
  type PlayableMissionSession,
} from "../../src/app/services/application-services";
import { CS116_PRODUCTION_IDS, registerCs116ProductionContent } from "../../src/content/cs116";
import {
  PYTHON_FOUNDATIONS_ACTIVITY_IDS,
  PYTHON_FOUNDATIONS_IDS,
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
 * PHASE-06 / M8 Parts A, C, D at the SERVICE level: the real application services
 * (registries, learning engine, meta-progression, drafts) over IndexedDB, with
 * Python Foundations registered next to CS116.
 *
 * Grading is stubbed here exactly like the M4-M7 service tests (`MissionEngine.submit`),
 * because the grading itself is proven against a REAL Pyodide by
 * pyodide-missions.test.ts and, end to end, by the Edge acceptance runner. What these tests
 * pin is everything AROUND a grade: who may open what, what a Run records, what a pass
 * unlocks, what survives a restart, and what the other course and M7 practice never see.
 */

const fake = vi.hoisted(() => {
  const counters = { runs: 0, submits: 0 };
  const create = () => ({
    initialize: async () => ({ ok: true as const }),
    prepareMission: async () => ({ ok: true as const }),
    run: async () => {
      counters.runs += 1;
      return { status: "SUCCESS" as const, stdout: "ran\n", stderr: "" };
    },
    submit: async () => {
      counters.submits += 1;
      return { status: "SUCCESS" as const, stdout: "", stderr: "", serialized: { variables: {} } };
    },
    dispose: () => undefined,
  });
  return { counters, create };
});
vi.mock("../../src/core/runtime/pyodide", () => ({ createPyodideRuntimeManager: fake.create }));
vi.mock("../../src/core/runtime/local-python", () => ({ createLocalPythonRuntimeManager: fake.create }));

const PF = PYTHON_FOUNDATIONS_ACTIVITY_IDS as readonly string[];
const [PF1, PF2, PF3, PF4] = PF as [string, string, string, string, ...string[]];
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

function stubGrading(passed: boolean) {
  return vi.spyOn(MissionEngine.prototype, "submit").mockImplementation(async () => ({
    execution: { status: "SUCCESS" as const, stdout: "", stderr: "" },
    grading: { passed, checks: [] },
  }));
}

async function submit(session: PlayableMissionSession, passed: boolean, code = "x = 1") {
  const spy = stubGrading(passed);
  try {
    return await session.session.submit(code);
  } finally {
    spy.mockRestore();
  }
}

/** Passes every listed activity through the real Submit path (a fresh session each time). */
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

/** Seeds reward-free, passed history (as an import would) for the given activities. */
async function seedPassed(factory: IDBFactory, activityIds: readonly string[]) {
  const store = new IndexedDbLearningPersistence(factory);
  for (const [index, activityId] of activityIds.entries()) {
    await store.importAttemptIfAbsent(makeAttempt(`seed.${index}`, activityId), "cloud-import");
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

/** Every CS116 activity, in CS116's own order (the course as it was before Python Foundations existed). */
const CS116_ACTIVITIES: readonly string[] = (() => {
  const content = new ContentRegistry();
  registerCs116ProductionContent(content);
  return content.getCourses().flatMap((course) => getCourseActivityIds(content, course.id));
})();

const databaseNames = async (factory: IDBFactory) =>
  (await factory.databases()).map((info) => info.name ?? "").sort();

const draftRows = (factory: IDBFactory) =>
  rawGetAll(factory, "python-learn-game", "missionDrafts") as Promise<Array<{ activityId: string; code: string }>>;

beforeEach(() => {
  fake.counters.runs = 0;
  fake.counters.submits = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Part A - the first activity of each course is open, nothing else is", () => {
  it("a fresh profile can open PF-01 and VS-01, and is refused PF-02..PF-07 and VS-02 by createMissionSession itself", async () => {
    useFactory();
    const services = await start();

    expect(await lockedCode(services, PF1)).toBeNull();
    expect(await lockedCode(services, VS01)).toBeNull();
    for (const locked of [...PF.slice(1), VS02]) {
      expect(await lockedCode(services, locked), locked).toBe("ACTIVITY_LOCKED");
    }
    await services.dispose();
  });

  it("the refusal names the activity to finish first", async () => {
    useFactory();
    const services = await start();
    const refused = await services.createMissionSession(PF2, { resumeDraft: false });

    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("unreachable");
    expect(refused.error.message).toContain("PF-01");
    await services.dispose();
  });
});

describe("Part C - Run versus Submit", () => {
  it("Run records no attempt, no mastery, no reward and unlocks nothing", async () => {
    useFactory();
    const services = await start();
    const before = {
      inventory: services.metaProgression.getSnapshot().inventory,
      revision: services.learning.getSnapshot().revision,
    };

    const playable = await openPlayable(services, PF1);
    const run = await playable.session.run("pixel_count = 1");
    expect(run.execution.status).toBe("SUCCESS");
    expect(fake.counters.runs).toBe(1);

    expect(services.learning.getAttempts()).toEqual([]);
    expect(services.learning.getActivityProgress(PF1 as LearningActivityId)).toMatchObject({
      attemptCount: 0,
      completed: false,
    });
    expect(services.learning.getSnapshot().revision).toBe(before.revision);
    expect(services.metaProgression.getSnapshot().inventory).toEqual(before.inventory);
    expect(services.metaProgression.getSnapshot().recentRewards).toEqual([]);
    expect(await lockedCode(services, PF2)).toBe("ACTIVITY_LOCKED");
    await services.dispose();
  });

  it("a failed Submit is stored as an attempt but earns nothing and opens nothing", async () => {
    useFactory();
    const services = await start();
    const inventory = services.metaProgression.getSnapshot().inventory;

    const playable = await openPlayable(services, PF1);
    const failed = await submit(playable, false);

    expect(failed.attemptRecord).toMatchObject({ activityId: PF1, passed: false });
    expect(services.learning.getActivityProgress(PF1 as LearningActivityId)).toMatchObject({
      attemptCount: 1,
      successfulAttemptCount: 0,
      completed: false,
    });
    expect(services.metaProgression.getSnapshot().inventory).toEqual(inventory);
    expect(services.metaProgression.getRewardGrantsForAttempt(failed.attemptRecord.id)).toEqual([]);
    expect(await lockedCode(services, PF2)).toBe("ACTIVITY_LOCKED");
    await services.dispose();
  });

  it("a passing Submit unlocks exactly the next activity of the SAME course", async () => {
    useFactory();
    const services = await start();

    const playable = await openPlayable(services, PF1);
    const passed = await submit(playable, true);

    expect(passed.attemptRecord).toMatchObject({ activityId: PF1, passed: true });
    expect(services.learning.getActivityProgress(PF1 as LearningActivityId).completed).toBe(true);
    expect(await lockedCode(services, PF2)).toBeNull();
    expect(await lockedCode(services, PF3)).toBe("ACTIVITY_LOCKED");
    // The other course did not move.
    expect(await lockedCode(services, VS02)).toBe("ACTIVITY_LOCKED");
    await services.dispose();
  });

  it("walks the whole course in order: every pass opens the next mission, PF-07 ends it", async () => {
    useFactory();
    const services = await start();

    for (const [index, activityId] of PF.entries()) {
      expect(await lockedCode(services, activityId), activityId).toBeNull();
      const next = PF[index + 1];
      if (next !== undefined) expect(await lockedCode(services, next), next).toBe("ACTIVITY_LOCKED");
      const playable = await openPlayable(services, activityId);
      await submit(playable, true);
      playable.session.dispose();
    }

    for (const activityId of PF) {
      expect(services.learning.getActivityProgress(activityId as LearningActivityId).completed, activityId).toBe(true);
    }
    expect(getCourseActivityIds(services.content, PYTHON)).toEqual(PF);
    await services.dispose();
  });
});

describe("Part D - rewards are earned by the first pass only", () => {
  it("the first pass grants the stage reward; a repeated pass of the same activity grants none", async () => {
    useFactory();
    const services = await start();

    const first = await openPlayable(services, PF1);
    const firstPass = await submit(first, true);
    first.session.dispose();
    const reasons = (attemptId: string) =>
      services.metaProgression.getRewardGrantsForAttempt(attemptId).map((grant) => grant.reason);
    expect(reasons(firstPass.attemptRecord.id)).toContain(RewardReason.FIRST_ACTIVITY_PASS);
    const afterFirst = services.metaProgression.getSnapshot().inventory;

    const again = await openPlayable(services, PF1);
    const secondPass = await submit(again, true);
    again.session.dispose();

    expect(secondPass.attemptRecord.id).not.toBe(firstPass.attemptRecord.id);
    expect(reasons(secondPass.attemptRecord.id)).not.toContain(RewardReason.FIRST_ACTIVITY_PASS);
    expect(reasons(secondPass.attemptRecord.id)).not.toContain(RewardReason.FOCUSED_ACTIVITY_PASS);
    const afterSecond = services.metaProgression.getSnapshot().inventory;
    for (const key of Object.keys(afterFirst) as Array<keyof typeof afterFirst>) {
      expect(afterSecond[key], key).toBeGreaterThanOrEqual(afterFirst[key]);
    }
    expect(
      services.metaProgression.getSnapshot().recentRewards.filter(
        (grant) => grant.reason === RewardReason.FIRST_ACTIVITY_PASS && grant.sourceActivityId === PF1,
      ),
    ).toHaveLength(1);
    await services.dispose();
  });

  it("a failed Submit followed by a pass still earns the first-pass reward exactly once", async () => {
    useFactory();
    const services = await start();

    const playable = await openPlayable(services, PF1);
    await submit(playable, false);
    const passed = await submit(playable, true);

    expect(
      services.metaProgression.getRewardGrantsForAttempt(passed.attemptRecord.id).map((grant) => grant.reason),
    ).toContain(RewardReason.FIRST_ACTIVITY_PASS);
    await services.dispose();
  });
});

describe("Part D - progress and drafts survive leaving the page, a reload and a restart", () => {
  it("a new service set over the same storage still has the unlocked activity and the history", async () => {
    useFactory();
    const first = await start();
    await passThrough(first, [PF1, PF2]);
    await first.dispose();

    const reloaded = await start();
    expect(reloaded.learning.getAttempts().map((attempt) => attempt.activityId)).toEqual([PF1, PF2]);
    expect(reloaded.learning.getActivityProgress(PF2 as LearningActivityId).completed).toBe(true);
    expect(await lockedCode(reloaded, PF3)).toBeNull();
    expect(await lockedCode(reloaded, PF4)).toBe("ACTIVITY_LOCKED");
    await reloaded.dispose();
  });

  it("the editor draft is stored per activity and comes back on reopen, hints included", async () => {
    const factory = useFactory();
    const services = await start();

    const playable = await openPlayable(services, PF1);
    expect(playable.resumedDraft).toBe(false);
    expect(playable.initialCode).toContain("TODO");
    playable.session.revealNextHint();
    playable.draft.update(
      {
        code: "pixel_count = width * height  # my work in progress",
        hintsUsed: playable.session.getRevealedHints().map((hint) => hint.level),
      },
      { immediate: true },
    );
    await playable.draft.flush();
    playable.session.dispose(); // leaving the page

    const reopened = await openPlayable(services, PF1, { resumeDraft: true });
    expect(reopened.resumedDraft).toBe(true);
    expect(reopened.initialCode).toBe("pixel_count = width * height  # my work in progress");
    expect(reopened.session.getRevealedHints().map((hint) => hint.level)).toEqual([HintLevel.H1]);
    reopened.session.dispose();
    await services.dispose();

    // ... and after a full reload (a new service set over the same storage).
    const reloaded = await start();
    const afterReload = await openPlayable(reloaded, PF1, { resumeDraft: true });
    expect(afterReload.resumedDraft).toBe(true);
    expect(afterReload.initialCode).toContain("my work in progress");
    const rows = await draftRows(factory);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.activityId).toBe(PF1);
    expect(rows[0]!.code).toContain("my work in progress");
    afterReload.session.dispose();
    await reloaded.dispose();
  });

  it("a passed Submit discards that mission's draft; a failed one keeps it", async () => {
    const factory = useFactory();
    const services = await start();

    const playable = await openPlayable(services, PF1);
    playable.draft.update({ code: "wip = 1", hintsUsed: [] }, { immediate: true });
    await playable.draft.flush();
    await submit(playable, false, "wip = 1");
    expect((await draftRows(factory)).map((row) => row.activityId)).toEqual([PF1]);

    await submit(playable, true, "wip = 2");
    await vi.waitFor(async () => expect(await draftRows(factory)).toEqual([]));
    await services.dispose();
  });

  it("drafts of the two courses never share a record", async () => {
    const factory = useFactory();
    const services = await start();

    const python = await openPlayable(services, PF1);
    const numpy = await openPlayable(services, VS01);
    python.draft.update({ code: "python draft", hintsUsed: [] }, { immediate: true });
    numpy.draft.update({ code: "numpy draft", hintsUsed: [] }, { immediate: true });
    await Promise.all([python.draft.flush(), numpy.draft.flush()]);

    const rows = await draftRows(factory);
    expect(rows.map((row) => [row.activityId, row.code]).sort()).toEqual(
      [
        [PF1, "python draft"],
        [VS01, "numpy draft"],
      ].sort(),
    );
    python.session.dispose();
    numpy.session.dispose();
    await services.dispose();
  });
});

describe("Part A/D - the two courses never touch each other", () => {
  it("having finished all of CS116 opens only the first Python Foundations mission", async () => {
    const factory = useFactory();
    expect(CS116_ACTIVITIES.length).toBeGreaterThan(5);
    await seedPassed(factory, CS116_ACTIVITIES);
    const services = await start();

    expect(await lockedCode(services, PF1)).toBeNull();
    for (const locked of PF.slice(1)) expect(await lockedCode(services, locked), locked).toBe("ACTIVITY_LOCKED");
    await services.dispose();
  });

  it("having finished all of Python Foundations opens only the first CS116 mission", async () => {
    const factory = useFactory();
    await seedPassed(factory, PF);
    const services = await start();

    expect(await lockedCode(services, VS01)).toBeNull();
    expect(await lockedCode(services, VS02)).toBe("ACTIVITY_LOCKED");
    await services.dispose();
  });

  it("a Python Foundations pass changes no CS116 activity or concept progress", async () => {
    useFactory();
    const services = await start();
    const cs116Concepts = services.content
      .getConcepts()
      .map((concept) => concept.id)
      .filter((id) => !String(id).startsWith("python."));
    expect(cs116Concepts.length).toBeGreaterThan(0);
    const snapshot = () =>
      JSON.stringify([
        cs116Concepts.map((id) => services.learning.getConceptProgress(id)),
        CS116_ACTIVITIES.map((id) => services.learning.getActivityProgress(id as LearningActivityId)),
      ]);
    const before = snapshot();

    await passThrough(services, PF.slice(0, 3));

    expect(snapshot()).toBe(before);
    expect(services.learning.getConceptProgress("python.variables" as never).successfulAttemptCount).toBeGreaterThan(0);
    await services.dispose();
  });

  it("a CS116 pass changes no Python Foundations progress", async () => {
    useFactory();
    const services = await start();
    const before = JSON.stringify(PF.map((id) => services.learning.getActivityProgress(id as LearningActivityId)));

    const playable = await openPlayable(services, VS01);
    await submit(playable, true);

    expect(JSON.stringify(PF.map((id) => services.learning.getActivityProgress(id as LearningActivityId)))).toBe(before);
    expect(await lockedCode(services, PF2)).toBe("ACTIVITY_LOCKED");
    expect(await lockedCode(services, VS02)).toBeNull();
    await services.dispose();
  });

  it("legacy CS116 attempts keep their activity open, whatever Python Foundations has done", async () => {
    const factory = useFactory();
    const deep = CS116_ACTIVITIES[4]!;
    const store = new IndexedDbLearningPersistence(factory);
    await store.importAttemptIfAbsent(makeAttempt("legacy.1", deep, { passed: false }), "cloud-import");
    await store.close();

    const services = await start();
    expect(await lockedCode(services, deep)).toBeNull();
    await passThrough(services, PF.slice(0, 2));
    expect(await lockedCode(services, deep)).toBeNull();
    await services.dispose();
  });
});

describe("Part D - M7 practice isolation", () => {
  it("Python Foundations work touches only the learning and meta databases, never the practice store", async () => {
    const factory = useFactory();
    const services = await start();
    await passThrough(services, PF.slice(0, 2));
    const playable = await openPlayable(services, PF3);
    playable.draft.update({ code: "wip", hintsUsed: [] }, { immediate: true });
    await playable.draft.flush();
    playable.session.dispose();
    await services.dispose();

    const names = await databaseNames(factory);
    expect(names).toContain("python-learn-game");
    expect(names).toContain("python-learn-game-meta");
    expect(names.filter((name) => name.includes("practice"))).toEqual([]);
  });

  it("practice activity ids can never address a Python Foundations activity (and vice versa)", async () => {
    useFactory();
    const services = await start();

    for (const activityId of PF) {
      expect(activityId.startsWith("practice:")).toBe(false);
    }
    const refused = await services.createMissionSession("practice:ml-basics.pack:ex-1", { resumeDraft: false });
    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error("unreachable");
    expect(refused.error.code).toBe("ACTIVITY_NOT_FOUND");
    await services.dispose();
  });
});
