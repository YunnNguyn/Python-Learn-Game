import { describe, expect, it } from "vitest";

import { ContentRegistry } from "../../src/core/content";
import {
  buildConceptGraph,
  detectConceptCycles,
} from "../../src/core/concepts";
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

function createGraph(concepts: readonly Concept[]) {
  const registry = new ContentRegistry();
  concepts.forEach((concept) => registry.registerConcept(concept));
  return buildConceptGraph(registry);
}

describe("detectConceptCycles", () => {
  it("returns no cycles for an empty graph", () => {
    expect(detectConceptCycles(createGraph([]))).toEqual([]);
  });

  it("returns no cycles for a single root node", () => {
    expect(detectConceptCycles(createGraph([createConcept("concept.a")]))).toEqual([]);
  });

  it("returns no cycles for a simple DAG", () => {
    const graph = createGraph([
      createConcept("concept.a"),
      createConcept("concept.b", ["concept.a"]),
      createConcept("concept.c", ["concept.b"]),
    ]);

    expect(detectConceptCycles(graph)).toEqual([]);
  });

  it("detects a self-cycle", () => {
    const conceptA = createConcept("concept.a", ["concept.a"]);

    expect(detectConceptCycles(createGraph([conceptA]))).toEqual([
      { conceptIds: [conceptA.id] },
    ]);
  });

  it("detects a two-node cycle as one component", () => {
    const conceptA = createConcept("concept.a", ["concept.b"]);
    const conceptB = createConcept("concept.b", ["concept.a"]);

    expect(detectConceptCycles(createGraph([conceptA, conceptB]))).toEqual([
      { conceptIds: [conceptA.id, conceptB.id] },
    ]);
  });

  it("detects a three-node cycle as one component", () => {
    const conceptA = createConcept("concept.a", ["concept.b"]);
    const conceptB = createConcept("concept.b", ["concept.c"]);
    const conceptC = createConcept("concept.c", ["concept.a"]);

    expect(detectConceptCycles(createGraph([conceptA, conceptB, conceptC]))).toEqual([
      { conceptIds: [conceptA.id, conceptB.id, conceptC.id] },
    ]);
  });

  it("returns one SCC when a component contains multiple simple cycles", () => {
    const conceptA = createConcept("concept.a", ["concept.b"]);
    const conceptB = createConcept("concept.b", ["concept.a", "concept.c"]);
    const conceptC = createConcept("concept.c", ["concept.b"]);

    expect(detectConceptCycles(createGraph([conceptA, conceptB, conceptC]))).toEqual([
      { conceptIds: [conceptA.id, conceptB.id, conceptC.id] },
    ]);
  });

  it("detects all separate cyclic components", () => {
    const conceptA = createConcept("concept.a", ["concept.b"]);
    const conceptB = createConcept("concept.b", ["concept.a"]);
    const conceptC = createConcept("concept.c", ["concept.d"]);
    const conceptD = createConcept("concept.d", ["concept.e"]);
    const conceptE = createConcept("concept.e", ["concept.c"]);
    const conceptF = createConcept("concept.f");

    expect(
      detectConceptCycles(
        createGraph([conceptA, conceptB, conceptC, conceptD, conceptE, conceptF]),
      ),
    ).toEqual([
      { conceptIds: [conceptA.id, conceptB.id] },
      { conceptIds: [conceptC.id, conceptD.id, conceptE.id] },
    ]);
  });

  it("orders components by their earliest graph insertion position", () => {
    const conceptC = createConcept("concept.c", ["concept.d"]);
    const conceptA = createConcept("concept.a", ["concept.b"]);
    const conceptB = createConcept("concept.b", ["concept.a"]);
    const conceptD = createConcept("concept.d", ["concept.c"]);

    expect(
      detectConceptCycles(createGraph([conceptC, conceptA, conceptB, conceptD])),
    ).toEqual([
      { conceptIds: [conceptC.id, conceptD.id] },
      { conceptIds: [conceptA.id, conceptB.id] },
    ]);
  });

  it("orders members by graph insertion order instead of DFS completion order", () => {
    const conceptC = createConcept("concept.c", ["concept.a"]);
    const conceptA = createConcept("concept.a", ["concept.b"]);
    const conceptB = createConcept("concept.b", ["concept.c"]);

    expect(detectConceptCycles(createGraph([conceptC, conceptA, conceptB]))).toEqual([
      { conceptIds: [conceptC.id, conceptA.id, conceptB.id] },
    ]);
  });

  it("ignores dangling prerequisite IDs for cycle analysis", () => {
    const graph = createGraph([
      createConcept("concept.a", ["concept.missing"]),
    ]);

    expect(detectConceptCycles(graph)).toEqual([]);
  });

  it("ignores dangling edges while still detecting a real cycle", () => {
    const conceptA = createConcept("concept.a", [
      "concept.b",
      "concept.missing",
    ]);
    const conceptB = createConcept("concept.b", ["concept.a"]);

    expect(detectConceptCycles(createGraph([conceptA, conceptB]))).toEqual([
      { conceptIds: [conceptA.id, conceptB.id] },
    ]);
  });

  it("does not duplicate cycle output when adjacency contains duplicate edges", () => {
    const conceptA = createConcept("concept.a", ["concept.b", "concept.b"]);
    const conceptB = createConcept("concept.b", ["concept.a"]);

    expect(detectConceptCycles(createGraph([conceptA, conceptB]))).toEqual([
      { conceptIds: [conceptA.id, conceptB.id] },
    ]);
  });

  it("does not mutate graph nodes or adjacency", () => {
    const graph = createGraph([
      createConcept("concept.a", ["concept.b", "concept.missing"]),
      createConcept("concept.b", ["concept.a"]),
      createConcept("concept.c"),
    ]);
    const conceptIdsBefore = [...graph.conceptIds];
    const adjacencyBefore = graph.conceptIds.map((conceptId) => [
      conceptId,
      [...(graph.prerequisitesByConcept.get(conceptId) ?? [])],
    ] as const);

    detectConceptCycles(graph);

    expect(graph.conceptIds).toEqual(conceptIdsBefore);
    expect(
      graph.conceptIds.map((conceptId) => [
        conceptId,
        graph.prerequisitesByConcept.get(conceptId),
      ]),
    ).toEqual(adjacencyBefore);
  });
});
