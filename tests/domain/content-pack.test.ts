import { describe, expect, it } from "vitest";

import {
  ContentPackManifestSchema,
  type ContentPackId,
  type ContentPackManifest,
  type CourseId,
} from "../../src/core/domain";

describe("ContentPackManifestSchema", () => {
  const minimalManifest = {
    id: "pack.test",
    version: "1.0.0",
    schemaVersion: 1,
    title: "Test pack",
    courseIds: [],
    dependencies: [],
  };

  it("parses a minimal manifest", () => {
    expect(ContentPackManifestSchema.parse(minimalManifest)).toEqual(
      minimalManifest,
    );
  });

  it("parses a full manifest and preserves supplied reference order", () => {
    const parsed = ContentPackManifestSchema.parse({
      id: "pack.full",
      version: "2026.09",
      schemaVersion: 2,
      title: "Full neutral pack",
      description: "Neutral fixture",
      courseIds: ["course.first", "course.second", "course.first"],
      dependencies: ["pack.dep-b", "pack.dep-a", "pack.dep-b"],
    });

    expect(parsed.courseIds).toEqual([
      "course.first",
      "course.second",
      "course.first",
    ]);
    expect(parsed.dependencies).toEqual([
      "pack.dep-b",
      "pack.dep-a",
      "pack.dep-b",
    ]);
  });

  it.each(["1.0.0", "2026.09", "v1"])(
    "accepts non-blank pack version %s without SemVer enforcement",
    (version) => {
      expect(
        ContentPackManifestSchema.safeParse({ ...minimalManifest, version })
          .success,
      ).toBe(true);
    },
  );

  it.each([1, 2])("accepts schemaVersion %d", (schemaVersion) => {
    expect(
      ContentPackManifestSchema.safeParse({
        ...minimalManifest,
        schemaVersion,
      }).success,
    ).toBe(true);
  });

  it("preserves branded ID types in the inferred manifest", () => {
    const manifest = ContentPackManifestSchema.parse({
      ...minimalManifest,
      courseIds: ["course.typed"],
      dependencies: ["pack.typed-dependency"],
    });

    const typedManifest: ContentPackManifest = manifest;
    const packId: ContentPackManifest["id"] = typedManifest.id;
    const courseId: ContentPackManifest["courseIds"][number] =
      typedManifest.courseIds[0]!;
    const dependencyId: ContentPackManifest["dependencies"][number] =
      typedManifest.dependencies[0]!;

    expect([packId, courseId, dependencyId]).toEqual([
      "pack.test",
      "course.typed",
      "pack.typed-dependency",
    ]);
  });

  it("keeps ContentPackId and CourseId brands incompatible", () => {
    const packId = "pack.test" as ContentPackId;
    const courseId = "course.test" as CourseId;

    // @ts-expect-error ContentPackId cannot substitute for CourseId.
    const invalidCourseId: CourseId = packId;

    // @ts-expect-error CourseId cannot substitute for ContentPackId.
    const invalidPackId: ContentPackId = courseId;

    expect([invalidCourseId, invalidPackId]).toEqual([packId, courseId]);
  });

  it("allows unresolved, duplicate, and self dependency references locally", () => {
    const parsed = ContentPackManifestSchema.parse({
      ...minimalManifest,
      id: "pack.unresolved",
      courseIds: [
        "course.does.not.exist",
        "course.does.not.exist",
      ],
      dependencies: [
        "pack.does.not.exist",
        "pack.unresolved",
        "pack.does.not.exist",
      ],
    });

    expect(parsed.courseIds).toEqual([
      "course.does.not.exist",
      "course.does.not.exist",
    ]);
    expect(parsed.dependencies).toEqual([
      "pack.does.not.exist",
      "pack.unresolved",
      "pack.does.not.exist",
    ]);
  });

  it.each([
    ["missing id", { ...minimalManifest, id: undefined }],
    ["blank id", { ...minimalManifest, id: "   " }],
    ["missing version", { ...minimalManifest, version: undefined }],
    ["blank version", { ...minimalManifest, version: "   " }],
    ["schemaVersion zero", { ...minimalManifest, schemaVersion: 0 }],
    ["negative schemaVersion", { ...minimalManifest, schemaVersion: -1 }],
    ["fractional schemaVersion", { ...minimalManifest, schemaVersion: 1.5 }],
    ["NaN schemaVersion", { ...minimalManifest, schemaVersion: Number.NaN }],
    [
      "infinite schemaVersion",
      { ...minimalManifest, schemaVersion: Number.POSITIVE_INFINITY },
    ],
    ["blank title", { ...minimalManifest, title: "" }],
    ["courseIds not an array", { ...minimalManifest, courseIds: "course.test" }],
    ["invalid CourseId element", { ...minimalManifest, courseIds: [" "] }],
    [
      "dependencies not an array",
      { ...minimalManifest, dependencies: "pack.dependency" },
    ],
    [
      "invalid ContentPackId dependency",
      { ...minimalManifest, dependencies: [""] },
    ],
    ["unexpected property", { ...minimalManifest, metadata: {} }],
    [
      "misspelled schemaVersion",
      {
        id: "pack.test",
        version: "1.0.0",
        schemaVerison: 1,
        title: "Test pack",
        courseIds: [],
        dependencies: [],
      },
    ],
  ])("rejects %s", (_caseName, input) => {
    expect(ContentPackManifestSchema.safeParse(input).success).toBe(false);
  });
});
