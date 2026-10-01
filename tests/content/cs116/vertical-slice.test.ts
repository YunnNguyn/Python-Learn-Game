import { describe, expect, it } from "vitest";

import { ContentRegistry } from "../../../src/core/content";
import {
  buildConceptGraph,
  detectConceptCycles,
  getAllPrerequisites,
  getDirectPrerequisites,
} from "../../../src/core/concepts";
import {
  ConceptSchema,
  ConceptSource,
  KnowledgeClassification,
  LearningStage,
} from "../../../src/core/domain";
import {
  CS116_VERTICAL_SLICE_ACTIVITY_SKELETONS,
  CS116_VERTICAL_SLICE_CONCEPTS,
} from "../../../src/content/cs116";

const conceptIds = CS116_VERTICAL_SLICE_CONCEPTS.map((concept) => concept.id);
const skeletonIds = CS116_VERTICAL_SLICE_ACTIVITY_SKELETONS.map(
  (skeleton) => skeleton.id,
);

describe("CS116 NumPy vertical-slice content", () => {
  it("defines exactly the seven locked primary concepts in canonical order", () => {
    expect(conceptIds).toEqual([
      "numpy.array",
      "numpy.shape",
      "numpy.ndim",
      "numpy.index.column",
      "numpy.compare",
      "numpy.boolean_mask",
      "numpy.logical_and",
    ]);
    expect(new Set(conceptIds).size).toBe(7);
  });

  it("keeps every concept valid, sourced from CS116, and uniquely identified", () => {
    for (const concept of CS116_VERTICAL_SLICE_CONCEPTS) {
      expect(ConceptSchema.safeParse(concept).success).toBe(true);
      expect(concept.source).toBe(ConceptSource.CS116);
    }

    expect(new Set(conceptIds).size).toBe(CS116_VERTICAL_SLICE_CONCEPTS.length);
  });

  it("locks the F3.5 knowledge classifications", () => {
    expect(
      Object.fromEntries(
        CS116_VERTICAL_SLICE_CONCEPTS.map((concept) => [
          concept.id,
          concept.classification,
        ]),
      ),
    ).toEqual({
      "numpy.array": KnowledgeClassification.MUST_RECALL,
      "numpy.shape": KnowledgeClassification.MUST_RECALL,
      "numpy.ndim": KnowledgeClassification.MUST_RECALL,
      "numpy.index.column": KnowledgeClassification.MUST_RECALL,
      "numpy.compare": KnowledgeClassification.MUST_UNDERSTAND,
      "numpy.boolean_mask": KnowledgeClassification.MUST_RECALL,
      "numpy.logical_and": KnowledgeClassification.MUST_UNDERSTAND,
    });
  });

  it("registers all seven concepts into a fresh canonical ContentRegistry", () => {
    const registry = new ContentRegistry();
    CS116_VERTICAL_SLICE_CONCEPTS.forEach((concept) =>
      registry.registerConcept(concept),
    );

    expect(registry.getConcepts()).toEqual(CS116_VERTICAL_SLICE_CONCEPTS);
    for (const concept of CS116_VERTICAL_SLICE_CONCEPTS) {
      expect(registry.getConcept(concept.id)).toBe(concept);
    }
  });

  it("builds the exact minimal acyclic prerequisite graph", () => {
    const registry = new ContentRegistry();
    CS116_VERTICAL_SLICE_CONCEPTS.forEach((concept) =>
      registry.registerConcept(concept),
    );
    const graph = buildConceptGraph(registry);

    expect(graph.conceptIds).toEqual(conceptIds);
    expect(
      Object.fromEntries(
        graph.conceptIds.map((id) => [
          id,
          [...(graph.prerequisitesByConcept.get(id) ?? [])],
        ]),
      ),
    ).toEqual({
      "numpy.array": [],
      "numpy.shape": ["numpy.array"],
      "numpy.ndim": ["numpy.array"],
      "numpy.index.column": ["numpy.array"],
      "numpy.compare": ["numpy.array"],
      "numpy.boolean_mask": ["numpy.compare"],
      "numpy.logical_and": ["numpy.compare"],
    });
    expect(detectConceptCycles(graph)).toEqual([]);
  });

  it("answers representative dependency queries through the real graph APIs", () => {
    const registry = new ContentRegistry();
    CS116_VERTICAL_SLICE_CONCEPTS.forEach((concept) =>
      registry.registerConcept(concept),
    );
    const graph = buildConceptGraph(registry);
    const byId = Object.fromEntries(
      CS116_VERTICAL_SLICE_CONCEPTS.map((concept) => [concept.id, concept]),
    );

    expect(getDirectPrerequisites(graph, byId["numpy.shape"]!.id)).toEqual([
      byId["numpy.array"]!.id,
    ]);
    expect(getAllPrerequisites(graph, byId["numpy.boolean_mask"]!.id)).toEqual([
      byId["numpy.compare"]!.id,
      byId["numpy.array"]!.id,
    ]);
    expect(getAllPrerequisites(graph, byId["numpy.logical_and"]!.id)).toEqual([
      byId["numpy.compare"]!.id,
      byId["numpy.array"]!.id,
    ]);
  });

  it("defines exactly seven stable vertical-slice skeleton IDs and titles", () => {
    expect(skeletonIds).toEqual([
      "cs116.numpy.vs01",
      "cs116.numpy.vs02",
      "cs116.numpy.vs03",
      "cs116.numpy.vs04",
      "cs116.numpy.vs05",
      "cs116.numpy.vs06",
      "cs116.numpy.vs07",
    ]);
    expect(new Set(skeletonIds).size).toBe(7);
    expect(
      CS116_VERTICAL_SLICE_ACTIVITY_SKELETONS.map((skeleton) => skeleton.title),
    ).toEqual([
      "VS-01 — Boot Sensor Grid",
      "VS-02 — Diagnose Telemetry",
      "VS-03 — Extract Threat Channel",
      "VS-04 — Radar Filter",
      "VS-05 — Radar Filter Variant",
      "VS-06 — Hostile Contact",
      "VS-07 — Recall Packet",
    ]);
  });

  it("normalizes the seven stages while preserving the two source labels that matter", () => {
    expect(
      CS116_VERTICAL_SLICE_ACTIVITY_SKELETONS.map((skeleton) => skeleton.stage),
    ).toEqual([
      LearningStage.GUIDED,
      LearningStage.INDEPENDENT,
      LearningStage.INDEPENDENT,
      LearningStage.GUIDED,
      LearningStage.INDEPENDENT,
      LearningStage.TRANSFER,
      LearningStage.REVIEW,
    ]);
    expect(CS116_VERTICAL_SLICE_ACTIVITY_SKELETONS[0]!.sourceStageLabel).toBe(
      "Discover / Guided",
    );
    expect(CS116_VERTICAL_SLICE_ACTIVITY_SKELETONS[6]!.sourceStageLabel).toBe(
      "Mixed Review / retention preparation",
    );
  });

  it("maps every skeleton only to existing locked concepts with exact authored mappings", () => {
    const known = new Set(conceptIds);
    for (const skeleton of CS116_VERTICAL_SLICE_ACTIVITY_SKELETONS) {
      for (const conceptId of skeleton.conceptIds) {
        expect(known.has(conceptId)).toBe(true);
      }
    }

    expect(
      CS116_VERTICAL_SLICE_ACTIVITY_SKELETONS.map((skeleton) => [
        skeleton.id,
        [...skeleton.conceptIds],
      ]),
    ).toEqual([
      ["cs116.numpy.vs01", ["numpy.array", "numpy.shape", "numpy.ndim"]],
      ["cs116.numpy.vs02", ["numpy.shape", "numpy.ndim"]],
      ["cs116.numpy.vs03", ["numpy.index.column", "numpy.shape"]],
      ["cs116.numpy.vs04", ["numpy.compare", "numpy.boolean_mask"]],
      ["cs116.numpy.vs05", ["numpy.compare", "numpy.boolean_mask"]],
      [
        "cs116.numpy.vs06",
        [
          "numpy.index.column",
          "numpy.compare",
          "numpy.boolean_mask",
          "numpy.logical_and",
        ],
      ],
      ["cs116.numpy.vs07", conceptIds],
    ]);
  });
});
