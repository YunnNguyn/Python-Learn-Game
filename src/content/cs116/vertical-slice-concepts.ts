import {
  ConceptSchema,
  ConceptSource,
  KnowledgeClassification,
  type Concept,
} from "../../core/domain";

export const CS116_VERTICAL_SLICE_CONCEPTS: readonly Concept[] = [
  ConceptSchema.parse({
    id: "numpy.array",
    title: "Create NumPy Arrays",
    classification: KnowledgeClassification.MUST_RECALL,
    source: ConceptSource.CS116,
    prerequisites: [],
  }),
  ConceptSchema.parse({
    id: "numpy.shape",
    title: "Array Shape",
    classification: KnowledgeClassification.MUST_RECALL,
    source: ConceptSource.CS116,
    prerequisites: ["numpy.array"],
  }),
  ConceptSchema.parse({
    id: "numpy.ndim",
    title: "Array Dimensionality",
    classification: KnowledgeClassification.MUST_RECALL,
    source: ConceptSource.CS116,
    prerequisites: ["numpy.array"],
  }),
  ConceptSchema.parse({
    id: "numpy.index.column",
    title: "Column Indexing",
    classification: KnowledgeClassification.MUST_RECALL,
    source: ConceptSource.CS116,
    prerequisites: ["numpy.array"],
  }),
  ConceptSchema.parse({
    id: "numpy.compare",
    title: "Array Comparisons",
    classification: KnowledgeClassification.MUST_UNDERSTAND,
    source: ConceptSource.CS116,
    prerequisites: ["numpy.array"],
  }),
  ConceptSchema.parse({
    id: "numpy.boolean_mask",
    title: "Boolean Masks",
    classification: KnowledgeClassification.MUST_RECALL,
    source: ConceptSource.CS116,
    prerequisites: ["numpy.compare"],
  }),
  ConceptSchema.parse({
    id: "numpy.logical_and",
    title: "Combine Conditions with AND",
    classification: KnowledgeClassification.MUST_UNDERSTAND,
    source: ConceptSource.CS116,
    prerequisites: ["numpy.compare"],
  }),
];
