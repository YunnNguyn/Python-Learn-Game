import { describe, expect, it } from "vitest";

import { ContentRegistry } from "../../src/core/content";
import { buildConceptGraph } from "../../src/core/concepts";
import {
  ConceptSchema,
  ConceptSource,
  KnowledgeClassification,
  type Concept,
} from "../../src/core/domain";

function createConcept(id: string, prerequisites: readonly string[] = []): Concept {
  return ConceptSchema.parse({
    id,
    title: `Concept ${id}`,
    classification: KnowledgeClassification.MUST_UNDERSTAND,
    source: ConceptSource.EXTRA,
    prerequisites,
  });
}

function registerConcepts(registry: ContentRegistry, concepts: readonly Concept[]): void {
  concepts.forEach((concept) => registry.registerConcept(concept));
}

describe("buildConceptGraph", () => {
  it("builds an empty graph from an empty registry", () => {
    const graph = buildConceptGraph(new ContentRegistry());

    expect(graph.conceptIds).toEqual([]);
    expect(graph.prerequisitesByConcept.size).toBe(0);
  });

  it("includes a zero-prerequisite concept as a graph node", () => {
    const registry = new ContentRegistry();
    const conceptA = createConcept("concept.a");
    registry.registerConcept(conceptA);

    const graph = buildConceptGraph(registry);

    expect(graph.conceptIds).toEqual([conceptA.id]);
    expect(graph.prerequisitesByConcept.get(conceptA.id)).toEqual([]);
  });

  it("builds direct concept-to-prerequisite adjacency only", () => {
    const registry = new ContentRegistry();
    const conceptA = createConcept("concept.a");
    const conceptB = createConcept("concept.b", ["concept.a"]);
    const conceptC = createConcept("concept.c", ["concept.a", "concept.b"]);
    registerConcepts(registry, [conceptA, conceptB, conceptC]);

    const graph = buildConceptGraph(registry);

    expect(graph.prerequisitesByConcept.get(conceptA.id)).toEqual([]);
    expect(graph.prerequisitesByConcept.get(conceptB.id)).toEqual([conceptA.id]);
    expect(graph.prerequisitesByConcept.get(conceptC.id)).toEqual([
      conceptA.id,
      conceptB.id,
    ]);
  });

  it("preserves ContentRegistry concept insertion order", () => {
    const registry = new ContentRegistry();
    const conceptC = createConcept("concept.c");
    const conceptA = createConcept("concept.a");
    const conceptB = createConcept("concept.b");
    registerConcepts(registry, [conceptC, conceptA, conceptB]);

    expect(buildConceptGraph(registry).conceptIds).toEqual([
      conceptC.id,
      conceptA.id,
      conceptB.id,
    ]);
  });

  it("preserves authored prerequisite order and duplicate references", () => {
    const registry = new ContentRegistry();
    const conceptA = createConcept("concept.a");
    const conceptB = createConcept("concept.b");
    const conceptC = createConcept("concept.c", [
      "concept.b",
      "concept.a",
      "concept.b",
    ]);
    registerConcepts(registry, [conceptA, conceptB, conceptC]);

    expect(buildConceptGraph(registry).prerequisitesByConcept.get(conceptC.id)).toEqual([
      conceptB.id,
      conceptA.id,
      conceptB.id,
    ]);
  });

  it("creates an adjacency entry for every registered concept", () => {
    const registry = new ContentRegistry();
    const concepts = [
      createConcept("concept.root"),
      createConcept("concept.middle", ["concept.root"]),
      createConcept("concept.leaf", ["concept.middle"]),
    ];
    registerConcepts(registry, concepts);

    const graph = buildConceptGraph(registry);

    expect(graph.prerequisitesByConcept.size).toBe(concepts.length);
    concepts.forEach((concept) => {
      expect(graph.prerequisitesByConcept.has(concept.id)).toBe(true);
    });
  });

  it("copies prerequisite arrays into the graph snapshot", () => {
    const registry = new ContentRegistry();
    const conceptA = createConcept("concept.a");
    const conceptB = createConcept("concept.b", ["concept.a"]);
    registerConcepts(registry, [conceptA, conceptB]);

    const graph = buildConceptGraph(registry);
    const graphPrerequisites = graph.prerequisitesByConcept.get(conceptB.id);

    conceptB.prerequisites.push(conceptB.id);

    expect(graphPrerequisites).toEqual([conceptA.id]);
    expect(graphPrerequisites).not.toBe(conceptB.prerequisites);
  });

  it("does not reject a two-node cycle during graph construction", () => {
    const registry = new ContentRegistry();
    const conceptA = createConcept("concept.a", ["concept.b"]);
    const conceptB = createConcept("concept.b", ["concept.a"]);
    registerConcepts(registry, [conceptA, conceptB]);

    const graph = buildConceptGraph(registry);

    expect(graph.prerequisitesByConcept.get(conceptA.id)).toEqual([conceptB.id]);
    expect(graph.prerequisitesByConcept.get(conceptB.id)).toEqual([conceptA.id]);
  });

  it("does not reject a self-cycle during graph construction", () => {
    const registry = new ContentRegistry();
    const conceptA = createConcept("concept.a", ["concept.a"]);
    registry.registerConcept(conceptA);

    expect(buildConceptGraph(registry).prerequisitesByConcept.get(conceptA.id)).toEqual([
      conceptA.id,
    ]);
  });

  it("preserves dangling declared prerequisites when validation was bypassed", () => {
    const registry = new ContentRegistry();
    const conceptA = createConcept("concept.a", ["concept.missing"]);
    registry.registerConcept(conceptA);

    expect(buildConceptGraph(registry).prerequisitesByConcept.get(conceptA.id)).toEqual(
      conceptA.prerequisites,
    );
  });

  it("requires only registered Concepts and no presentation hierarchy", () => {
    const registry = new ContentRegistry();
    const conceptA = createConcept("concept.a");
    const conceptB = createConcept("concept.b", ["concept.a"]);
    registerConcepts(registry, [conceptA, conceptB]);

    const graph = buildConceptGraph(registry);

    expect(graph.conceptIds).toEqual([conceptA.id, conceptB.id]);
    expect(graph.prerequisitesByConcept.get(conceptB.id)).toEqual([conceptA.id]);
  });
});
