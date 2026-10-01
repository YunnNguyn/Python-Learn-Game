import { describe, expect, it } from "vitest";

import { ContentRegistry } from "../../src/core/content";
import {
  buildConceptGraph,
  getAllPrerequisites,
  getDirectPrerequisites,
} from "../../src/core/concepts";
import {
  ConceptSchema,
  ConceptSource,
  KnowledgeClassification,
  type Concept,
  type ConceptId,
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

describe("concept dependency queries", () => {
  it("returns undefined for an unknown source concept", () => {
    const graph = createGraph([createConcept("concept.a")]);
    const unknownId = createConcept("concept.unknown").id;

    expect(getDirectPrerequisites(graph, unknownId)).toBeUndefined();
    expect(getAllPrerequisites(graph, unknownId)).toBeUndefined();
  });

  it("returns empty arrays for a known root concept", () => {
    const conceptA = createConcept("concept.a");
    const graph = createGraph([conceptA]);

    expect(getDirectPrerequisites(graph, conceptA.id)).toEqual([]);
    expect(getAllPrerequisites(graph, conceptA.id)).toEqual([]);
  });

  it("preserves authored order and duplicate references for direct prerequisites", () => {
    const conceptB = createConcept("concept.b");
    const conceptC = createConcept("concept.c");
    const conceptA = createConcept("concept.a", [
      "concept.c",
      "concept.b",
      "concept.c",
    ]);
    const graph = createGraph([conceptA, conceptB, conceptC]);

    expect(getDirectPrerequisites(graph, conceptA.id)).toEqual([
      conceptC.id,
      conceptB.id,
      conceptC.id,
    ]);
  });

  it("returns a caller-owned direct prerequisite snapshot", () => {
    const conceptB = createConcept("concept.b");
    const conceptA = createConcept("concept.a", ["concept.b"]);
    const graph = createGraph([conceptA, conceptB]);
    const stored = graph.prerequisitesByConcept.get(conceptA.id);
    const result = getDirectPrerequisites(graph, conceptA.id);

    expect(result).toEqual([conceptB.id]);
    expect(result).not.toBe(stored);

    (result as ConceptId[]).push(conceptA.id);

    expect(graph.prerequisitesByConcept.get(conceptA.id)).toEqual([conceptB.id]);
    expect(getDirectPrerequisites(graph, conceptA.id)).toEqual([conceptB.id]);
  });

  it("returns one-level prerequisites in authored order", () => {
    const conceptB = createConcept("concept.b");
    const conceptC = createConcept("concept.c");
    const conceptA = createConcept("concept.a", ["concept.b", "concept.c"]);
    const graph = createGraph([conceptA, conceptB, conceptC]);

    expect(getAllPrerequisites(graph, conceptA.id)).toEqual([
      conceptB.id,
      conceptC.id,
    ]);
  });

  it("uses deterministic breadth-first nearest-first traversal", () => {
    const conceptD = createConcept("concept.d");
    const conceptE = createConcept("concept.e");
    const conceptB = createConcept("concept.b", ["concept.d"]);
    const conceptC = createConcept("concept.c", ["concept.e"]);
    const conceptA = createConcept("concept.a", ["concept.b", "concept.c"]);
    const graph = createGraph([conceptA, conceptB, conceptC, conceptD, conceptE]);

    expect(getAllPrerequisites(graph, conceptA.id)).toEqual([
      conceptB.id,
      conceptC.id,
      conceptD.id,
      conceptE.id,
    ]);
  });

  it("preserves authored order within each breadth-first frontier", () => {
    const conceptD = createConcept("concept.d");
    const conceptE = createConcept("concept.e");
    const conceptF = createConcept("concept.f");
    const conceptC = createConcept("concept.c", ["concept.e", "concept.d"]);
    const conceptB = createConcept("concept.b", ["concept.f"]);
    const conceptA = createConcept("concept.a", ["concept.c", "concept.b"]);
    const graph = createGraph([
      conceptA,
      conceptB,
      conceptC,
      conceptD,
      conceptE,
      conceptF,
    ]);

    expect(getAllPrerequisites(graph, conceptA.id)).toEqual([
      conceptC.id,
      conceptB.id,
      conceptE.id,
      conceptD.id,
      conceptF.id,
    ]);
  });

  it("returns a shared prerequisite once", () => {
    const conceptD = createConcept("concept.d");
    const conceptB = createConcept("concept.b", ["concept.d"]);
    const conceptC = createConcept("concept.c", ["concept.d"]);
    const conceptA = createConcept("concept.a", ["concept.b", "concept.c"]);
    const graph = createGraph([conceptA, conceptB, conceptC, conceptD]);

    expect(getAllPrerequisites(graph, conceptA.id)).toEqual([
      conceptB.id,
      conceptC.id,
      conceptD.id,
    ]);
  });

  it("keeps the position established by first breadth-first discovery", () => {
    const conceptF = createConcept("concept.f");
    const conceptD = createConcept("concept.d", ["concept.f"]);
    const conceptE = createConcept("concept.e", ["concept.f"]);
    const conceptB = createConcept("concept.b", ["concept.d", "concept.e"]);
    const conceptC = createConcept("concept.c", ["concept.f"]);
    const conceptA = createConcept("concept.a", ["concept.b", "concept.c"]);
    const graph = createGraph([
      conceptA,
      conceptB,
      conceptC,
      conceptD,
      conceptE,
      conceptF,
    ]);

    expect(getAllPrerequisites(graph, conceptA.id)).toEqual([
      conceptB.id,
      conceptC.id,
      conceptD.id,
      conceptE.id,
      conceptF.id,
    ]);
  });

  it("terminates safely on a two-node cycle and excludes the source", () => {
    const conceptA = createConcept("concept.a", ["concept.b"]);
    const conceptB = createConcept("concept.b", ["concept.a"]);
    const graph = createGraph([conceptA, conceptB]);

    expect(getAllPrerequisites(graph, conceptA.id)).toEqual([conceptB.id]);
    expect(getAllPrerequisites(graph, conceptB.id)).toEqual([conceptA.id]);
  });

  it("terminates safely on a three-node cycle and excludes the source", () => {
    const conceptA = createConcept("concept.a", ["concept.b"]);
    const conceptB = createConcept("concept.b", ["concept.c"]);
    const conceptC = createConcept("concept.c", ["concept.a"]);
    const graph = createGraph([conceptA, conceptB, conceptC]);

    expect(getAllPrerequisites(graph, conceptA.id)).toEqual([
      conceptB.id,
      conceptC.id,
    ]);
  });

  it("preserves a self-edge directly while excluding it from transitive results", () => {
    const conceptA = createConcept("concept.a", ["concept.a"]);
    const graph = createGraph([conceptA]);

    expect(getDirectPrerequisites(graph, conceptA.id)).toEqual([conceptA.id]);
    expect(getAllPrerequisites(graph, conceptA.id)).toEqual([]);
  });

  it("treats dangling prerequisite IDs as terminal declared prerequisites", () => {
    const conceptA = createConcept("concept.a", ["concept.missing"]);
    const missingId = conceptA.prerequisites[0]!;
    const graph = createGraph([conceptA]);

    expect(getDirectPrerequisites(graph, conceptA.id)).toEqual([missingId]);
    expect(getAllPrerequisites(graph, conceptA.id)).toEqual([missingId]);
  });

  it("preserves BFS ordering across valid and dangling prerequisites", () => {
    const conceptC = createConcept("concept.c");
    const conceptB = createConcept("concept.b", ["concept.c"]);
    const conceptA = createConcept("concept.a", [
      "concept.b",
      "concept.missing",
    ]);
    const missingId = conceptA.prerequisites[1]!;
    const graph = createGraph([conceptA, conceptB, conceptC]);

    expect(getAllPrerequisites(graph, conceptA.id)).toEqual([
      conceptB.id,
      missingId,
      conceptC.id,
    ]);
  });

  it("deduplicates duplicate direct edges in transitive traversal and continues once", () => {
    const conceptC = createConcept("concept.c");
    const conceptB = createConcept("concept.b", ["concept.c"]);
    const conceptA = createConcept("concept.a", ["concept.b", "concept.b"]);
    const graph = createGraph([conceptA, conceptB, conceptC]);

    expect(getDirectPrerequisites(graph, conceptA.id)).toEqual([
      conceptB.id,
      conceptB.id,
    ]);
    expect(getAllPrerequisites(graph, conceptA.id)).toEqual([
      conceptB.id,
      conceptC.id,
    ]);
  });

  it("returns caller-owned transitive snapshots", () => {
    const conceptC = createConcept("concept.c");
    const conceptB = createConcept("concept.b", ["concept.c"]);
    const conceptA = createConcept("concept.a", ["concept.b"]);
    const graph = createGraph([conceptA, conceptB, conceptC]);
    const result = getAllPrerequisites(graph, conceptA.id);

    expect(result).toEqual([conceptB.id, conceptC.id]);

    (result as ConceptId[]).push(conceptA.id);

    expect(getAllPrerequisites(graph, conceptA.id)).toEqual([
      conceptB.id,
      conceptC.id,
    ]);
    expect(graph.prerequisitesByConcept.get(conceptA.id)).toEqual([conceptB.id]);
    expect(graph.prerequisitesByConcept.get(conceptB.id)).toEqual([conceptC.id]);
  });

  it("does not mutate graph nodes, adjacency, or stored prerequisite arrays", () => {
    const conceptD = createConcept("concept.d");
    const conceptB = createConcept("concept.b", ["concept.d"]);
    const conceptC = createConcept("concept.c", ["concept.d"]);
    const conceptA = createConcept("concept.a", [
      "concept.b",
      "concept.c",
      "concept.missing",
    ]);
    const graph = createGraph([conceptA, conceptB, conceptC, conceptD]);
    const conceptIdsBefore = [...graph.conceptIds];
    const adjacencyBefore = graph.conceptIds.map((conceptId) => [
      conceptId,
      [...(graph.prerequisitesByConcept.get(conceptId) ?? [])],
    ] as const);

    getDirectPrerequisites(graph, conceptA.id);
    getAllPrerequisites(graph, conceptA.id);
    getAllPrerequisites(graph, conceptB.id);

    expect(graph.conceptIds).toEqual(conceptIdsBefore);
    expect(
      graph.conceptIds.map((conceptId) => [
        conceptId,
        graph.prerequisitesByConcept.get(conceptId),
      ]),
    ).toEqual(adjacencyBefore);
  });

  it("requires only a ConceptGraph built from Concepts without presentation hierarchy", () => {
    const conceptRoot = createConcept("concept.root");
    const conceptLeaf = createConcept("concept.leaf", ["concept.root"]);
    const graph = createGraph([conceptRoot, conceptLeaf]);

    expect(getDirectPrerequisites(graph, conceptLeaf.id)).toEqual([
      conceptRoot.id,
    ]);
    expect(getAllPrerequisites(graph, conceptLeaf.id)).toEqual([
      conceptRoot.id,
    ]);
  });
});
