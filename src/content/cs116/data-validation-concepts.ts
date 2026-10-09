import {
  ConceptSchema,
  ConceptSource,
  KnowledgeClassification,
  type Concept,
} from "../../core/domain";

// World 4 — Data Validation & EDA concepts. Slide audit (Bài 4) confirms CS116
// coverage of outlier, dropna, drop_duplicates, set_index. Pandas isna() /
// isnull() were introduced in Bài 2B. Schema/dtype check is treated as
// Supplementary / ML Foundation when not explicitly confirmed by CS116.
export const CS116_DATA_VALIDATION_CONCEPTS: readonly Concept[] = [
  ConceptSchema.parse({
    id: "pandas.isna",
    title: "Phát hiện missing values với isna()",
    description:
      "pandas.DataFrame.isna() / isnull() trả về mặt nạ boolean đánh dấu các ô thiếu; cộng dồn theo cột bằng .sum() để biết mỗi cột thiếu bao nhiêu.",
    classification: KnowledgeClassification.MUST_UNDERSTAND,
    source: ConceptSource.CS116,
    prerequisites: ["pandas.dataframe"],
    tags: ["pandas", "data-validation", "cs116.bai2b"],
  }),
  ConceptSchema.parse({
    id: "pandas.dropna",
    title: "Loại bỏ hàng thiếu dữ liệu (dropna)",
    description:
      "CS116 Bài 4: dropna() loại bỏ các hàng (hoặc cột) có missing values. Dùng khi lượng mất dữ liệu nhỏ và việc bỏ đi không gây lệch mẫu nghiêm trọng.",
    classification: KnowledgeClassification.MUST_UNDERSTAND,
    source: ConceptSource.CS116,
    prerequisites: ["pandas.isna"],
    tags: ["pandas", "data-cleaning", "cs116.bai4"],
  }),
  ConceptSchema.parse({
    id: "pandas.drop_duplicates",
    title: "Loại bỏ hàng trùng (drop_duplicates)",
    description:
      "CS116 Bài 4: drop_duplicates() giữ lại hàng xuất hiện lần đầu và bỏ các hàng trùng khớp sau đó. Bước này ngăn mô hình bị lệch bởi dữ liệu đếm nhiều lần.",
    classification: KnowledgeClassification.MUST_UNDERSTAND,
    source: ConceptSource.CS116,
    prerequisites: ["pandas.dataframe"],
    tags: ["pandas", "data-cleaning", "cs116.bai4"],
  }),
  ConceptSchema.parse({
    id: "stats.outlier_iqr",
    title: "Phát hiện outlier bằng IQR",
    description:
      "CS116 Bài 4: outlier là giá trị nằm ngoài [Q1 − 1.5·IQR, Q3 + 1.5·IQR] với IQR = Q3 − Q1. Tiêu chí này không giả định phân phối chuẩn, hoạt động tốt trên dữ liệu lệch.",
    classification: KnowledgeClassification.MUST_UNDERSTAND,
    source: ConceptSource.CS116,
    prerequisites: ["pandas.dataframe"],
    tags: ["statistics", "data-validation", "cs116.bai4"],
  }),
];
