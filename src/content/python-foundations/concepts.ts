import {
  ConceptSchema,
  ConceptSource,
  KnowledgeClassification,
  type Concept,
} from "../../core/domain";

const concept = (
  id: string,
  title: string,
  classification: KnowledgeClassification,
  prerequisites: readonly string[],
): Concept =>
  ConceptSchema.parse({
    id,
    title,
    classification,
    source: ConceptSource.EXTRA,
    prerequisites: [...prerequisites],
  });

export const PYTHON_FOUNDATIONS_CONCEPT_IDS = {
  variables: "python.variables",
  numericTypes: "python.numeric-types",
  booleans: "python.booleans",
  ifElse: "python.if-else",
  typeConversion: "python.type-conversion",
  lists: "python.lists",
  loops: "python.loops",
  functions: "python.functions",
  aggregation: "python.aggregation",
} as const;

const ID = PYTHON_FOUNDATIONS_CONCEPT_IDS;

export const PYTHON_FOUNDATIONS_CONCEPTS: readonly Concept[] = [
  concept(ID.variables, "Biến và phép gán", KnowledgeClassification.MUST_RECALL, []),
  concept(ID.numericTypes, "Số nguyên, số thực và phép tính", KnowledgeClassification.MUST_RECALL, [ID.variables]),
  concept(ID.booleans, "Biểu thức Boolean và so sánh", KnowledgeClassification.MUST_RECALL, [ID.numericTypes]),
  concept(ID.ifElse, "Rẽ nhánh if / elif / else", KnowledgeClassification.MUST_RECALL, [ID.booleans]),
  concept(ID.typeConversion, "Chuyển đổi kiểu dữ liệu", KnowledgeClassification.MUST_UNDERSTAND, [ID.numericTypes]),
  concept(ID.lists, "List", KnowledgeClassification.MUST_RECALL, [ID.variables]),
  concept(ID.loops, "Vòng lặp for", KnowledgeClassification.MUST_RECALL, [ID.lists, ID.ifElse]),
  concept(ID.functions, "Hàm và giá trị trả về", KnowledgeClassification.MUST_RECALL, [ID.variables]),
  concept(ID.aggregation, "Tổng hợp số liệu (tổng, đếm, trung bình)", KnowledgeClassification.MUST_UNDERSTAND, [ID.lists, ID.numericTypes]),
];
