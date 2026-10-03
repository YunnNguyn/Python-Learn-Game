import { describe, expect, it } from "vitest";

import {
  AttemptRecordSchema,
  Difficulty,
  LearningActivityType,
  LearningStage,
  type LearningActivity,
  type MissionInstance,
  type MissionTemplate,
} from "../../src/core/domain";
import type { GraderRegistry } from "../../src/core/grading";
import { MissionAttemptSession } from "../../src/core/learning";
import { MissionEngine } from "../../src/core/missions";
import type { RuntimeManager } from "../../src/core/runtime";

function createFixture() {
  const activity = {
    id: "activity.test",
    type: LearningActivityType.CODE_MISSION,
    title: "Test",
    conceptIds: ["concept.test"],
    stage: LearningStage.GUIDED,
    missionTemplateId: "template.test",
  } as unknown as LearningActivity;
  const template = {
    id: "template.test",
    version: 1,
    conceptIds: ["concept.test"],
    allowedStages: [LearningStage.GUIDED],
    generator: { id: "generator.test" },
    grader: { id: "core.declarative", config: { checks: [{ type: "NO_EXCEPTION" }] } },
    runtime: { id: "runtime.test" },
  } as unknown as MissionTemplate;
  const instance = {
    id: "instance.test",
    templateId: template.id,
    templateVersion: 1,
    seed: "seed",
    difficulty: Difficulty.EASY,
    conceptIds: template.conceptIds,
    learner: { objective: "Do it" },
  } as MissionInstance;

  return { activity, template, instance };
}

describe("Phase A AttemptRecord envelope", () => {
  it("creates exactly one frozen AttemptRecord for every submit", async () => {
    const { activity, template, instance } = createFixture();
    let submitCount = 0;
    const runtime = {
      initialize: async () => ({ ok: true } as const),
      prepareMission: async () => ({ ok: true } as const),
      run: async () => ({ status: "SUCCESS", stdout: "", stderr: "" } as const),
      submit: async () => {
        submitCount += 1;
        return {
          status: "SUCCESS",
          stdout: "",
          stderr: "",
          serialized: { variables: {} },
        } as const;
      },
      dispose() {},
    } satisfies RuntimeManager;
    const grader = {
      getGrader: () => ({
        grade: () => ({ passed: true, checks: [] }),
      }),
    } as unknown as GraderRegistry;
    const engine = new MissionEngine(runtime, grader);
    await engine.loadMission(template, instance);
    const times = [
      new Date("2026-10-03T10:00:00.000Z"),
      new Date("2026-10-03T10:01:00.000Z"),
      new Date("2026-10-03T10:02:00.000Z"),
    ];
    const session = new MissionAttemptSession(activity, template, instance, engine, {
      now: () => times.shift()!,
    });

    const first = await session.submit("pass");
    const second = await session.submit("pass again");

    expect(submitCount).toBe(2);
    expect(first.attemptRecord.submissionIndex).toBe(1);
    expect(second.attemptRecord.submissionIndex).toBe(2);
    expect(session.getAttempts()).toHaveLength(2);
    expect(AttemptRecordSchema.parse(first.attemptRecord)).toEqual(first.attemptRecord);
    expect(Object.isFrozen(first.attemptRecord)).toBe(true);
  });
});
