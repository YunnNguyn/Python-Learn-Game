import type { ConceptId } from "../domain";

import type { ConceptGraph } from "./concept-graph";

export interface ConceptCycleComponent {
  readonly conceptIds: readonly ConceptId[];
}

export function detectConceptCycles(
  graph: ConceptGraph,
): readonly ConceptCycleComponent[] {
  const graphNodes = new Set(graph.conceptIds);
  const orderByConcept = new Map(
    graph.conceptIds.map((conceptId, index) => [conceptId, index] as const),
  );
  const indexByConcept = new Map<ConceptId, number>();
  const lowLinkByConcept = new Map<ConceptId, number>();
  const stack: ConceptId[] = [];
  const onStack = new Set<ConceptId>();
  const components: ConceptId[][] = [];
  let nextIndex = 0;

  const visit = (conceptId: ConceptId): void => {
    const conceptIndex = nextIndex;
    nextIndex += 1;
    indexByConcept.set(conceptId, conceptIndex);
    lowLinkByConcept.set(conceptId, conceptIndex);
    stack.push(conceptId);
    onStack.add(conceptId);

    for (const prerequisiteId of graph.prerequisitesByConcept.get(conceptId) ?? []) {
      if (!graphNodes.has(prerequisiteId)) {
        continue;
      }

      if (!indexByConcept.has(prerequisiteId)) {
        visit(prerequisiteId);
        lowLinkByConcept.set(
          conceptId,
          Math.min(
            lowLinkByConcept.get(conceptId)!,
            lowLinkByConcept.get(prerequisiteId)!,
          ),
        );
      } else if (onStack.has(prerequisiteId)) {
        lowLinkByConcept.set(
          conceptId,
          Math.min(
            lowLinkByConcept.get(conceptId)!,
            indexByConcept.get(prerequisiteId)!,
          ),
        );
      }
    }

    if (lowLinkByConcept.get(conceptId) !== indexByConcept.get(conceptId)) {
      return;
    }

    const component: ConceptId[] = [];
    while (stack.length > 0) {
      const memberId = stack.pop()!;
      onStack.delete(memberId);
      component.push(memberId);

      if (memberId === conceptId) {
        break;
      }
    }
    components.push(component);
  };

  for (const conceptId of graph.conceptIds) {
    if (!indexByConcept.has(conceptId)) {
      visit(conceptId);
    }
  }

  return components
    .filter((component) => {
      if (component.length > 1) {
        return true;
      }

      const [conceptId] = component;
      return graph.prerequisitesByConcept
        .get(conceptId)
        ?.includes(conceptId) ?? false;
    })
    .map((component) => ({
      conceptIds: [...component].sort(
        (left, right) => orderByConcept.get(left)! - orderByConcept.get(right)!,
      ),
    }))
    .sort(
      (left, right) =>
        orderByConcept.get(left.conceptIds[0]!)! -
        orderByConcept.get(right.conceptIds[0]!)!,
    );
}
