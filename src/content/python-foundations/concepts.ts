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
  // M9 (PHASE-07)
  indexing: "python.indexing",
  slicing: "python.slicing",
  dicts: "python.dicts",
  tuplesSets: "python.tuples-sets",
  comprehensions: "python.comprehensions",
  reusableFunctions: "python.reusable-functions",
  exceptions: "python.exceptions",
  inputValidation: "python.input-validation",
  jsonRecords: "python.json-records",
  numpyArrays: "python.numpy-arrays",
  numpyIndexing: "python.numpy-indexing",
  numpyVectorization: "python.numpy-vectorization",
  numpyMasksAxis: "python.numpy-masks-axis",
  // M10 (PHASE-08)
  numpyBroadcasting: "python.numpy-broadcasting",
  numpyReductions: "python.numpy-reductions",
  numpyPreprocessing: "python.numpy-preprocessing",
  pandasFrames: "python.pandas-frames",
  pandasFiltering: "python.pandas-filtering",
  pandasMissing: "python.pandas-missing-values",
  pandasGroupby: "python.pandas-groupby",
  matplotlibCharts: "python.matplotlib-charts",
  chartDebugging: "python.chart-debugging",
  csvLoading: "python.csv-loading",
  dataPipeline: "python.data-pipeline",
  // M11 (PHASE-09)
  annotationQa: "python.annotation-qa",
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
  // --- M9: Collections & Intermediate Python ---
  concept(ID.indexing, "Chỉ số của list (dương và âm)", KnowledgeClassification.MUST_RECALL, [ID.lists]),
  concept(ID.slicing, "Cắt lát (slicing) với start, stop, step", KnowledgeClassification.MUST_RECALL, [ID.indexing]),
  concept(ID.dicts, "Dictionary: khóa và giá trị", KnowledgeClassification.MUST_RECALL, [ID.lists]),
  concept(ID.tuplesSets, "Tuple và set", KnowledgeClassification.MUST_UNDERSTAND, [ID.lists]),
  concept(ID.comprehensions, "List và dict comprehension", KnowledgeClassification.MUST_UNDERSTAND, [ID.loops, ID.dicts]),
  concept(ID.reusableFunctions, "Hàm dùng lại cho nhiều đầu vào", KnowledgeClassification.MUST_UNDERSTAND, [ID.functions, ID.loops]),
  concept(ID.exceptions, "Ngoại lệ: try / except và raise", KnowledgeClassification.MUST_UNDERSTAND, [ID.typeConversion, ID.ifElse]),
  concept(ID.inputValidation, "Kiểm tra và làm sạch dữ liệu đầu vào", KnowledgeClassification.MUST_UNDERSTAND, [ID.exceptions, ID.functions]),
  concept(ID.jsonRecords, "Đọc bản ghi dạng JSON thành bảng sạch", KnowledgeClassification.MUST_UNDERSTAND, [ID.dicts, ID.inputValidation, ID.comprehensions]),
  // --- M9: Introduction to NumPy ---
  concept(ID.numpyArrays, "ndarray: số chiều, shape và dtype", KnowledgeClassification.MUST_RECALL, [ID.lists]),
  concept(ID.numpyIndexing, "Chỉ số và cắt lát trên ndarray", KnowledgeClassification.MUST_RECALL, [ID.numpyArrays, ID.slicing]),
  concept(ID.numpyVectorization, "Vector hóa: phép toán theo từng phần tử", KnowledgeClassification.MUST_UNDERSTAND, [ID.numpyArrays]),
  concept(ID.numpyMasksAxis, "Mặt nạ Boolean và phép toán theo axis", KnowledgeClassification.MUST_UNDERSTAND, [ID.numpyVectorization, ID.numpyIndexing]),
  // --- M10: Data Science Toolkit ---
  concept(ID.numpyBroadcasting, "Broadcasting và shape của mảng", KnowledgeClassification.MUST_UNDERSTAND, [ID.numpyVectorization]),
  concept(ID.numpyReductions, "Phép gộp theo axis, keepdims và mặt nạ", KnowledgeClassification.MUST_UNDERSTAND, [ID.numpyMasksAxis, ID.numpyBroadcasting]),
  concept(ID.numpyPreprocessing, "Tiền xử lý ma trận đặc trưng bằng vector hóa", KnowledgeClassification.MUST_UNDERSTAND, [ID.numpyReductions]),
  concept(ID.pandasFrames, "DataFrame: cột, dtype, loc và iloc", KnowledgeClassification.MUST_RECALL, [ID.dicts, ID.numpyArrays]),
  concept(ID.pandasFiltering, "Lọc hàng và tạo cột tính toán trong pandas", KnowledgeClassification.MUST_UNDERSTAND, [ID.pandasFrames, ID.booleans]),
  concept(ID.pandasMissing, "Giá trị thiếu và chuyển đổi kiểu trong pandas", KnowledgeClassification.MUST_UNDERSTAND, [ID.pandasFrames, ID.typeConversion]),
  concept(ID.pandasGroupby, "groupby và tổng hợp theo nhóm", KnowledgeClassification.MUST_UNDERSTAND, [ID.pandasFiltering, ID.aggregation]),
  concept(ID.matplotlibCharts, "Vẽ biểu đồ đường, cột và phân tán bằng Matplotlib", KnowledgeClassification.MUST_UNDERSTAND, [ID.lists, ID.numpyArrays]),
  concept(ID.chartDebugging, "Phát hiện và sửa biểu đồ gây hiểu lầm", KnowledgeClassification.MUST_UNDERSTAND, [ID.matplotlibCharts, ID.pandasGroupby]),
  concept(ID.csvLoading, "Đọc CSV, kiểm tra cột và ghép bảng", KnowledgeClassification.MUST_UNDERSTAND, [ID.pandasMissing, ID.pandasGroupby]),
  concept(ID.dataPipeline, "Pipeline chuẩn bị dữ liệu từ thô đến ma trận sạch", KnowledgeClassification.MUST_UNDERSTAND, [ID.csvLoading, ID.numpyPreprocessing, ID.matplotlibCharts]),
  // --- M11: capstone ---
  concept(ID.annotationQa, "Kiểm tra annotation ảnh: hộp hợp lệ, chuẩn hóa tọa độ và phân bố lớp", KnowledgeClassification.MUST_UNDERSTAND, [ID.dataPipeline]),
];
