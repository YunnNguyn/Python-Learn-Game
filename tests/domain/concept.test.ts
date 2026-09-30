import { describe, expect, it } from "vitest";

import {
  ConceptSchema,
  ConceptSource,
  KnowledgeClassification,
  type Concept,
  type ConceptId,
  type CourseId,
} from "../../src/core/domain";

describe("ConceptSchema", () => {
  it("parses a minimal valid Concept with empty prerequisites", () => {
    const concept = ConceptSchema.parse({
      id: "test.root",
      title: "Root concept",
      classification: KnowledgeClassification.MUST_RECALL,
      source: ConceptSource.CS116,
      prerequisites: [],
    });

    const conceptId: ConceptId = concept.id;
    const typedConcept: Concept = concept;

    expect(conceptId).toBe("test.root");
    expect(typedConcept.prerequisites).toEqual([]);
  });

  it("parses a full Concept and preserves ConceptId output types", () => {
    const concept = ConceptSchema.parse({
      id: "test.child",
      title: "Child concept",
      description: "A focused schema fixture.",
      classification: KnowledgeClassification.MUST_UNDERSTAND,
      source: ConceptSource.SUPPLEMENTARY_ML_FOUNDATION,
      prerequisites: ["test.root", "does.not.exist"],
      tags: ["arrays", "shape"],
    });

    const id: ConceptId = concept.id;
    const prerequisite: ConceptId = concept.prerequisites[0]!;

    // @ts-expect-error ConceptId must not become another domain ID brand.
    const courseId: CourseId = concept.id;

    expect(id).toBe("test.child");
    expect(prerequisite).toBe("test.root");
    expect(courseId).toBe("test.child");
    expect(concept.prerequisites).toContain("does.not.exist");
  });

  it("keeps Concept fields branded in the public inferred type", () => {
    const rawId = "plain.string";

    // @ts-expect-error Plain strings are not valid ConceptId values without validation.
    const id: Concept["id"] = rawId;

    // @ts-expect-error Prerequisite entries are ConceptId, not unbranded strings.
    const prerequisite: Concept["prerequisites"][number] = rawId;

    expect(id).toBe(rawId);
    expect(prerequisite).toBe(rawId);
  });

  it.each([
    ["missing id", {
      title: "Missing id",
      classification: KnowledgeClassification.LOOKUP_OK,
      source: ConceptSource.EXTRA,
      prerequisites: [],
    }],
    ["empty id", {
      id: "",
      title: "Empty id",
      classification: KnowledgeClassification.LOOKUP_OK,
      source: ConceptSource.EXTRA,
      prerequisites: [],
    }],
    ["whitespace-only id", {
      id: "   ",
      title: "Whitespace id",
      classification: KnowledgeClassification.LOOKUP_OK,
      source: ConceptSource.EXTRA,
      prerequisites: [],
    }],
    ["empty title", {
      id: "test.empty-title",
      title: "",
      classification: KnowledgeClassification.LOOKUP_OK,
      source: ConceptSource.EXTRA,
      prerequisites: [],
    }],
    ["invalid classification", {
      id: "test.invalid-classification",
      title: "Invalid classification",
      classification: "SOMETIMES_RECALL",
      source: ConceptSource.EXTRA,
      prerequisites: [],
    }],
    ["invalid source", {
      id: "test.invalid-source",
      title: "Invalid source",
      classification: KnowledgeClassification.LOOKUP_OK,
      source: "OTHER_COURSE",
      prerequisites: [],
    }],
    ["prerequisites not an array", {
      id: "test.invalid-prerequisites",
      title: "Invalid prerequisites",
      classification: KnowledgeClassification.LOOKUP_OK,
      source: ConceptSource.EXTRA,
      prerequisites: "test.root",
    }],
    ["non-string prerequisite", {
      id: "test.invalid-prerequisite-entry",
      title: "Invalid prerequisite entry",
      classification: KnowledgeClassification.LOOKUP_OK,
      source: ConceptSource.EXTRA,
      prerequisites: [42],
    }],
    ["empty tag", {
      id: "test.invalid-tag",
      title: "Invalid tag",
      classification: KnowledgeClassification.LOOKUP_OK,
      source: ConceptSource.EXTRA,
      prerequisites: [],
      tags: ["valid", ""],
    }],
    ["whitespace-only tag", {
      id: "test.invalid-whitespace-tag",
      title: "Invalid whitespace tag",
      classification: KnowledgeClassification.LOOKUP_OK,
      source: ConceptSource.EXTRA,
      prerequisites: [],
      tags: ["   "],
    }],
    ["unexpected property", {
      id: "test.extra-field",
      title: "Extra field",
      classification: KnowledgeClassification.LOOKUP_OK,
      source: ConceptSource.EXTRA,
      prerequisites: [],
      unexpected: true,
    }],
  ])("rejects %s", (_caseName, input) => {
    expect(ConceptSchema.safeParse(input).success).toBe(false);
  });
});
