import type { ConceptId } from "../domain";

import type { ConceptGraph } from "./concept-graph";

export function getDirectPrerequisites(
  graph: ConceptGraph,
  conceptId: ConceptId,
): readonly ConceptId[] | undefined {
  if (!graph.conceptIds.includes(conceptId)) {
    return undefined;
  }

  return [...(graph.prerequisitesByConcept.get(conceptId) ?? [])];
}

export function getAllPrerequisites(
  graph: ConceptGraph,
  conceptId: ConceptId,
): readonly ConceptId[] | undefined {
  if (!graph.conceptIds.includes(conceptId)) {
    return undefined;
  }

  const discovered = new Set<ConceptId>([conceptId]);
  const queue: ConceptId[] = [conceptId];
  const prerequisites: ConceptId[] = [];
  let cursor = 0;

  while (cursor < queue.length) {
    const currentId = queue[cursor];
    cursor += 1;

    for (const prerequisiteId of graph.prerequisitesByConcept.get(currentId) ?? []) {
      if (discovered.has(prerequisiteId)) {
        continue;
      }

      discovered.add(prerequisiteId);
      prerequisites.push(prerequisiteId);
      queue.push(prerequisiteId);
    }
  }

  return prerequisites;
}
