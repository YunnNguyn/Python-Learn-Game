import { describe, expect, it } from "vitest";

import { ContentRegistry } from "../../src/core/content";
import {
  MissionTemplateSchema,
  type MissionTemplate,
  type MissionTemplateId,
} from "../../src/core/domain";
import { resolveMissionTemplate } from "../../src/core/missions";
import { foundation1Fixtures } from "../fixtures/foundation1";

function createTemplate(
  id: string,
  version: number,
  changes: Partial<MissionTemplate> = {},
): MissionTemplate {
  return MissionTemplateSchema.parse({
    ...foundation1Fixtures.missionTemplate,
    ...changes,
    id,
    version,
  });
}

describe("resolveMissionTemplate", () => {
  it("returns the exact registered object for an exact ID and version match", () => {
    const registry = new ContentRegistry();
    const template = createTemplate("mission.template.exact", 2);
    registry.registerMissionTemplate(template);

    expect(resolveMissionTemplate(registry, template.id, 2)).toBe(template);
  });

  it("returns undefined for an unknown ID", () => {
    const registry = new ContentRegistry();
    const template = createTemplate("mission.template.known", 2);
    registry.registerMissionTemplate(template);

    expect(
      resolveMissionTemplate(
        registry,
        "mission.template.missing" as MissionTemplateId,
        2,
      ),
    ).toBeUndefined();
  });

  it("returns undefined when registered v2 is requested as v1", () => {
    const registry = new ContentRegistry();
    const template = createTemplate("mission.template.v2", 2);
    registry.registerMissionTemplate(template);

    expect(resolveMissionTemplate(registry, template.id, 1)).toBeUndefined();
  });

  it("returns undefined when registered v1 is requested as v2", () => {
    const registry = new ContentRegistry();
    const template = createTemplate("mission.template.v1", 1);
    registry.registerMissionTemplate(template);

    expect(resolveMissionTemplate(registry, template.id, 2)).toBeUndefined();
  });

  it("does not fall back to another template that happens to have the requested version", () => {
    const registry = new ContentRegistry();
    const requestedIdTemplate = createTemplate("mission.template.target", 3);
    const sameVersionTemplate = createTemplate("mission.template.other", 2);
    registry.registerMissionTemplate(requestedIdTemplate);
    registry.registerMissionTemplate(sameVersionTemplate);

    expect(
      resolveMissionTemplate(registry, requestedIdTemplate.id, 2),
    ).toBeUndefined();
  });

  it("keeps different IDs with the same version ID-specific", () => {
    const registry = new ContentRegistry();
    const alpha = createTemplate("mission.template.alpha", 4);
    const beta = createTemplate("mission.template.beta", 4);
    registry.registerMissionTemplate(alpha);
    registry.registerMissionTemplate(beta);

    expect(resolveMissionTemplate(registry, alpha.id, 4)).toBe(alpha);
    expect(resolveMissionTemplate(registry, beta.id, 4)).toBe(beta);
  });

  it("accepts version 1", () => {
    const registry = new ContentRegistry();
    const template = createTemplate("mission.template.first-version", 1);
    registry.registerMissionTemplate(template);

    expect(resolveMissionTemplate(registry, template.id, 1)).toBe(template);
  });

  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects invalid requested version %s", (version) => {
    const registry = new ContentRegistry();

    expect(() =>
      resolveMissionTemplate(
        registry,
        "mission.template.invalid-version" as MissionTemplateId,
        version,
      ),
    ).toThrowError(
      new RangeError(
        "MissionTemplate version must be a finite positive safe integer.",
      ),
    );
  });

  it("does not mutate the registered template or registry", () => {
    const registry = new ContentRegistry();
    const template = createTemplate("mission.template.immutable-check", 5);
    registry.registerMissionTemplate(template);
    const templateBefore = structuredClone(template);
    const registryBefore = registry.getMissionTemplates();

    expect(resolveMissionTemplate(registry, template.id, 5)).toBe(template);
    expect(template).toEqual(templateBefore);
    expect(registry.getMissionTemplates()).toEqual(registryBefore);
    expect(registry.getMissionTemplates()[0]).toBe(template);
  });

  it("resolves multiple distinct IDs independently", () => {
    const registry = new ContentRegistry();
    const first = createTemplate("mission.template.first", 1);
    const second = createTemplate("mission.template.second", 7);
    const third = createTemplate("mission.template.third", 12);
    registry.registerMissionTemplate(first);
    registry.registerMissionTemplate(second);
    registry.registerMissionTemplate(third);

    expect(resolveMissionTemplate(registry, first.id, 1)).toBe(first);
    expect(resolveMissionTemplate(registry, second.id, 7)).toBe(second);
    expect(resolveMissionTemplate(registry, third.id, 12)).toBe(third);
  });

  it("returns undefined for an empty registry", () => {
    expect(
      resolveMissionTemplate(
        new ContentRegistry(),
        "mission.template.empty" as MissionTemplateId,
        1,
      ),
    ).toBeUndefined();
  });

  it("ignores template semantic contents when ID and version match", () => {
    const registry = new ContentRegistry();
    const template = createTemplate("mission.template.semantic-agnostic", 9, {
      conceptIds: [],
      generator: { id: "generator.unrelated" as MissionTemplate["generator"]["id"] },
      grader: { id: "grader.unrelated" as MissionTemplate["grader"]["id"] },
      runtime: { id: "runtime.unrelated" as MissionTemplate["runtime"]["id"] },
      restrictions: { arbitrary: [1, "two", true] },
    });
    registry.registerMissionTemplate(template);

    expect(resolveMissionTemplate(registry, template.id, 9)).toBe(template);
  });
});
