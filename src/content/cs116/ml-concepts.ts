import {
  ConceptSchema,
  ConceptSource,
  KnowledgeClassification,
  type Concept,
} from "../../core/domain";

// World 3 — ML Pipeline concepts. The pipeline stages and the train/test/valid
// split are CS116-confirmed (Bài 3 — "Machine Learning Pipeline", with the
// train:test:valid = 7:2:1 split and the train → fit → evaluate flow). Linear
// Regression is listed as a CS116 model (Bài 8). The specific scikit-learn API
// (train_test_split, .fit, .predict, .score) is treated as Supplementary /
// ML Foundation per the curriculum source-of-truth rule, and is labelled as
// such in the lesson text rather than attributed to CS116 lecture ownership.
export const CS116_ML_CONCEPTS: readonly Concept[] = [
  ConceptSchema.parse({
    id: "ml.pipeline",
    title: "ML Pipeline cơ bản",
    description:
      "Luồng end-to-end: dữ liệu → X/y → chia train/test → huấn luyện → dự đoán → đánh giá.",
    classification: KnowledgeClassification.MUST_UNDERSTAND,
    source: ConceptSource.CS116,
    prerequisites: ["pandas.dataframe"],
    tags: ["ml", "pipeline"],
  }),
  ConceptSchema.parse({
    id: "ml.train_test_split",
    title: "Chia train/test",
    description:
      "Tách dữ liệu thành tập huấn luyện và tập kiểm tra để đánh giá mô hình trên dữ liệu chưa thấy.",
    classification: KnowledgeClassification.MUST_UNDERSTAND,
    source: ConceptSource.CS116,
    prerequisites: ["ml.pipeline"],
    tags: ["ml", "validation"],
  }),
  ConceptSchema.parse({
    id: "ml.linear_regression",
    title: "Hồi quy tuyến tính (Linear Regression)",
    description:
      "Mô hình tuyến tính học hệ số và hệ số chặn để dự đoán giá trị liên tục; đánh giá bằng R².",
    classification: KnowledgeClassification.MUST_UNDERSTAND,
    source: ConceptSource.CS116,
    prerequisites: ["ml.train_test_split"],
    tags: ["ml", "model", "regression"],
  }),
  ConceptSchema.parse({
    id: "ml.train_val_test_split",
    title: "Train / Validation / Test (7:2:1)",
    description:
      "CS116 Bài 3 chia dữ liệu theo tỉ lệ 7:2:1 — train để huấn luyện, validation để chọn mô hình/hyperparameter, test chỉ dùng để báo cáo cuối (không được dùng để tune).",
    classification: KnowledgeClassification.MUST_UNDERSTAND,
    source: ConceptSource.CS116,
    prerequisites: ["ml.train_test_split"],
    tags: ["ml", "validation", "cs116.bai3"],
  }),
  ConceptSchema.parse({
    id: "ml.overfit_underfit",
    title: "Overfit / Underfit",
    description:
      "CS116 Bài 3: so sánh điểm trên train với điểm trên test để chẩn đoán mô hình. Train đẹp mà test tụt mạnh = overfit; cả hai đều thấp = underfit; cả hai đều cao và gần nhau = mô hình tổng quát hóa tốt.",
    classification: KnowledgeClassification.MUST_UNDERSTAND,
    source: ConceptSource.CS116,
    prerequisites: ["ml.train_test_split", "ml.linear_regression"],
    tags: ["ml", "diagnostics", "cs116.bai3"],
  }),
];
