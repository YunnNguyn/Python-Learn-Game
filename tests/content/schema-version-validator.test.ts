import { describe, expect, it } from "vitest";

import {
  ContentDefinitionKind,
  UnsupportedSchemaVersionIssueCode,
  validateSchemaVersions,
  type ContentDefinitionSet,
  type ContentSchemaSupport,
} from "../../src/core/content";
import {
  ContentPackManifestSchema,
  MissionTemplateSchema,
} from "../../src/core/domain";
import { foundation1Fixtures } from "../fixtures/foundation1";

function createPack(
  id: string,
  schemaVersion: number,
  version: string = foundation1Fixtures.contentPackManifest.version,
) {
  return ContentPackManifestSchema.parse({
    ...foundation1Fixtures.contentPackManifest,
    id,
    version,
    schemaVersion,
  });
}

describe("validateSchemaVersions", () => {
  it("returns no issues for empty definitions", () => {
    expect(
      validateSchemaVersions({}, { supportedSchemaVersions: [1] }),
    ).toEqual([]);
  });

  it("accepts a supported pack schema version", () => {
    const pack = createPack("pack.supported", 1);

    expect(
      validateSchemaVersions(
        { packs: [pack] },
        { supportedSchemaVersions: [1] },
      ),
    ).toEqual([]);
  });

  it("accepts multiple explicitly supported schema versions", () => {
    const packV1 = createPack("pack.schema-1", 1);
    const packV2 = createPack("pack.schema-2", 2);

    expect(
      validateSchemaVersions(
        { packs: [packV1, packV2] },
        { supportedSchemaVersions: [1, 2] },
      ),
    ).toEqual([]);
  });

  it("reports an unsupported schema version with deterministic issue data", () => {
    const pack = createPack("pack.unsupported", 3);

    expect(
      validateSchemaVersions(
        { packs: [pack] },
        { supportedSchemaVersions: [1, 2] },
      ),
    ).toEqual([
      {
        code: UnsupportedSchemaVersionIssueCode.UNSUPPORTED_SCHEMA_VERSION,
        sourceKind: ContentDefinitionKind.PACK,
        sourceId: "pack.unsupported",
        sourceIndex: 0,
        schemaVersion: 3,
        supportedSchemaVersions: [1, 2],
        message:
          'Unsupported content schema version 3 for PACK "pack.unsupported"; supported schema versions: 1, 2.',
      },
    ]);
  });

  it("reports every pack when the support set is empty", () => {
    const packA = createPack("pack.a", 1);
    const packB = createPack("pack.b", 2);

    const issues = validateSchemaVersions(
      { packs: [packA, packB] },
      { supportedSchemaVersions: [] },
    );

    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.sourceIndex)).toEqual([0, 1]);
    expect(issues[0]?.supportedSchemaVersions).toEqual([]);
    expect(issues[0]?.message).toContain("supported schema versions: none.");
  });

  it("treats duplicate supported policy values as harmless membership entries", () => {
    const pack = createPack("pack.duplicate-support", 1);

    expect(
      validateSchemaVersions(
        { packs: [pack] },
        { supportedSchemaVersions: [1, 1, 2] },
      ),
    ).toEqual([]);
  });

  it("does not infer a supported range between listed versions", () => {
    const pack = createPack("pack.gap", 2);

    expect(
      validateSchemaVersions(
        { packs: [pack] },
        { supportedSchemaVersions: [1, 3] },
      ),
    ).toMatchObject([
      {
        schemaVersion: 2,
        code: UnsupportedSchemaVersionIssueCode.UNSUPPORTED_SCHEMA_VERSION,
      },
    ]);
  });

  it("does not automatically support older schema versions", () => {
    const pack = createPack("pack.older", 1);

    expect(
      validateSchemaVersions(
        { packs: [pack] },
        { supportedSchemaVersions: [3] },
      ),
    ).toMatchObject([
      {
        schemaVersion: 1,
        code: UnsupportedSchemaVersionIssueCode.UNSUPPORTED_SCHEMA_VERSION,
      },
    ]);
  });

  it("uses the same unsupported issue for a future schema version", () => {
    const pack = createPack("pack.future", 2);

    expect(
      validateSchemaVersions(
        { packs: [pack] },
        { supportedSchemaVersions: [1] },
      ),
    ).toMatchObject([
      {
        schemaVersion: 2,
        code: UnsupportedSchemaVersionIssueCode.UNSUPPORTED_SCHEMA_VERSION,
      },
    ]);
  });

  it("preserves pack input order for multiple unsupported occurrences", () => {
    const packs = [
      createPack("pack.first", 4),
      createPack("pack.supported", 1),
      createPack("pack.third", 3),
    ];

    const issues = validateSchemaVersions(
      { packs },
      { supportedSchemaVersions: [1] },
    );

    expect(
      issues.map(({ sourceId, sourceIndex, schemaVersion }) => ({
        sourceId,
        sourceIndex,
        schemaVersion,
      })),
    ).toEqual([
      { sourceId: "pack.first", sourceIndex: 0, schemaVersion: 4 },
      { sourceId: "pack.third", sourceIndex: 2, schemaVersion: 3 },
    ]);
  });

  it("validates duplicate pack-ID occurrences independently", () => {
    const supported = createPack("pack.same", 1);
    const unsupported = createPack("pack.same", 9);

    expect(
      validateSchemaVersions(
        { packs: [supported, unsupported] },
        { supportedSchemaVersions: [1] },
      ),
    ).toMatchObject([
      {
        sourceId: "pack.same",
        sourceIndex: 1,
        schemaVersion: 9,
      },
    ]);
  });

  it("ignores the ContentPack release-version string format", () => {
    const packs = [
      createPack("pack.semver-like", 1, "1.0.0"),
      createPack("pack.tag-like", 1, "v1"),
      createPack("pack.date-like", 1, "2026.09"),
    ];

    expect(
      validateSchemaVersions(
        { packs },
        { supportedSchemaVersions: [1] },
      ),
    ).toEqual([]);
  });

  it("does not inspect MissionTemplate version for schema compatibility", () => {
    const template = MissionTemplateSchema.parse({
      ...foundation1Fixtures.missionTemplate,
      version: 99,
    });

    expect(
      validateSchemaVersions(
        { missionTemplates: [template] },
        { supportedSchemaVersions: [] },
      ),
    ).toEqual([]);
  });

  it("does not mutate packs, pack objects, or the support-policy array", () => {
    const pack = createPack("pack.immutable", 3);
    const packs = [pack];
    const supportedSchemaVersions = [1, 2];
    const definitions: ContentDefinitionSet = { packs };
    const support: ContentSchemaSupport = { supportedSchemaVersions };
    const beforeDefinitions = JSON.parse(JSON.stringify(definitions));
    const beforeSupport = [...supportedSchemaVersions];

    const issues = validateSchemaVersions(definitions, support);

    expect(definitions).toEqual(beforeDefinitions);
    expect(definitions.packs).toBe(packs);
    expect(packs[0]).toBe(pack);
    expect(support.supportedSchemaVersions).toBe(supportedSchemaVersions);
    expect(supportedSchemaVersions).toEqual(beforeSupport);
    expect(issues[0]?.supportedSchemaVersions).not.toBe(supportedSchemaVersions);
  });
});
