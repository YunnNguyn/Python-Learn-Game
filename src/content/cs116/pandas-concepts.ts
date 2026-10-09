import {
  ConceptSchema,
  ConceptSource,
  KnowledgeClassification,
  type Concept,
} from "../../core/domain";

export const CS116_PANDAS_CONCEPTS: readonly Concept[] = [
  ConceptSchema.parse({
    id: "pandas.dataframe",
    title: "pandas DataFrame",
    classification: KnowledgeClassification.MUST_UNDERSTAND,
    source: ConceptSource.CS116,
    prerequisites: [],
  }),
  ConceptSchema.parse({
    id: "pandas.series",
    title: "pandas Series",
    classification: KnowledgeClassification.MUST_UNDERSTAND,
    source: ConceptSource.CS116,
    prerequisites: ["pandas.dataframe"],
  }),
  ConceptSchema.parse({
    id: "pandas.column_select",
    title: "Select DataFrame Columns",
    classification: KnowledgeClassification.MUST_RECALL,
    source: ConceptSource.CS116,
    prerequisites: ["pandas.dataframe", "pandas.series"],
  }),
  ConceptSchema.parse({
    id: "pandas.boolean_filter",
    title: "Filter DataFrame Rows",
    classification: KnowledgeClassification.MUST_RECALL,
    source: ConceptSource.CS116,
    prerequisites: ["pandas.dataframe", "pandas.column_select"],
  }),
];
