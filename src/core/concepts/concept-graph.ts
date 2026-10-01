import type { ConceptId } from "../domain";
import type { ContentRegistry } from "../content";

export interface ConceptGraph {
  readonly conceptIds: readonly ConceptId[];
  readonly prerequisitesByConcept: ReadonlyMap<
    ConceptId,
    readonly ConceptId[]
  >;
}

export function buildConceptGraph(registry: ContentRegistry): ConceptGraph {
  const concepts = registry.getConcepts();
  const prerequisitesByConcept = new Map<ConceptId, readonly ConceptId[]>();

  for (const concept of concepts) {
    prerequisitesByConcept.set(concept.id, [...concept.prerequisites]);
  }

  return {
    conceptIds: concepts.map((concept) => concept.id),
    prerequisitesByConcept,
  };
}
