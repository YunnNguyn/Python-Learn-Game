import {
  ConceptSchema,
  ConceptSource,
  KnowledgeClassification,
  type Concept,
} from "../../core/domain";

export const CS116_DATA_SCIENCE_CONCEPTS: readonly Concept[] = [
  ConceptSchema.parse({
    id: "pandas.missing_values",
    title: "Missing Values trong pandas",
    description:
      "Nhận biết giá trị thiếu, đếm chúng và điền bằng fillna trước khi dùng dữ liệu.",
    classification: KnowledgeClassification.MUST_UNDERSTAND,
    // CS116 Bài 2B dạy fillna(value) trực tiếp trong phần pandas.
    source: ConceptSource.CS116,
    prerequisites: ["pandas.column_select"],
    tags: ["pandas", "data-cleaning"],
  }),
  ConceptSchema.parse({
    id: "pandas.groupby_aggregation",
    title: "groupby và aggregation",
    description:
      "Chia bảng thành nhóm theo khóa rồi tính thống kê tổng hợp cho từng nhóm.",
    classification: KnowledgeClassification.MUST_UNDERSTAND,
    source: ConceptSource.SUPPLEMENTARY_ML_FOUNDATION,
    prerequisites: ["pandas.column_select"],
    tags: ["pandas", "aggregation"],
  }),
  ConceptSchema.parse({
    id: "pandas.pivot_table",
    title: "pivot_table",
    description:
      "Tổ chức dữ liệu dài thành bảng tổng hợp hai chiều bằng index, columns, values và hàm aggregation.",
    classification: KnowledgeClassification.LOOKUP_OK,
    // CS116 Bài 2B dạy pivot và pivot_table(aggfunc=np.mean).
    source: ConceptSource.CS116,
    prerequisites: ["pandas.groupby_aggregation"],
    tags: ["pandas", "aggregation"],
  }),
  ConceptSchema.parse({
    id: "matplotlib.pyplot",
    title: "Matplotlib Figure / Axes",
    description:
      "Dùng Matplotlib để vẽ line/scatter plot, đặt nhãn, title và cấu hình biểu đồ.",
    classification: KnowledgeClassification.MUST_UNDERSTAND,
    // CS116 Bài 2B có hẳn phần "Trực quan hóa với Matplotlib" (plot, scatter, subplot, title/xlabel/ylabel).
    source: ConceptSource.CS116,
    prerequisites: ["pandas.dataframe"],
    tags: ["matplotlib", "visualization"],
  }),
  ConceptSchema.parse({
    id: "matplotlib.savefig",
    title: "Lưu biểu đồ thành artifact",
    description:
      "Ghi Figure ra thư mục artifacts của workspace bài để giữ đầu ra trực quan.",
    classification: KnowledgeClassification.MUST_RECALL,
    source: ConceptSource.SUPPLEMENTARY_ML_FOUNDATION,
    prerequisites: ["matplotlib.pyplot"],
    tags: ["matplotlib", "artifact"],
  }),
  ConceptSchema.parse({
    id: "pandas.merge",
    title: "Ghép bảng bằng merge",
    description:
      "Kết hợp hai bảng theo khóa chung và hiểu tác động của kiểu join lên số hàng kết quả.",
    classification: KnowledgeClassification.MUST_UNDERSTAND,
    source: ConceptSource.SUPPLEMENTARY_ML_FOUNDATION,
    prerequisites: ["pandas.dataframe"],
    tags: ["pandas", "join"],
  }),
  ConceptSchema.parse({
    id: "image.rgb_array",
    title: "Ảnh RGB dưới dạng NumPy array",
    description:
      "Hiểu ảnh RGB như tensor height × width × channels để kết nối xử lý ảnh với NumPy.",
    classification: KnowledgeClassification.MUST_UNDERSTAND,
    // CS116 Bài 2A: ảnh RGB = 3D tensor; Bài 2B: np.array(im).shape → (H, W, 3).
    source: ConceptSource.CS116,
    prerequisites: ["numpy.shape"],
    tags: ["image", "numpy"],
  }),
  ConceptSchema.parse({
    id: "pillow.image_io",
    title: "Đọc ảnh với Pillow",
    description:
      "Mở ảnh, chuẩn hóa mode RGB và chuyển sang ndarray để kiểm tra shape, channel và pixel.",
    classification: KnowledgeClassification.LOOKUP_OK,
    // CS116 Bài 2B: from PIL import Image; Image.open(...); np.array(im).
    source: ConceptSource.CS116,
    prerequisites: ["image.rgb_array"],
    tags: ["pillow", "image"],
  }),
  ConceptSchema.parse({
    id: "pillow.crop_resize",
    title: "Crop và resize ảnh",
    description:
      "Dùng crop/resize để biến đổi không gian ảnh rồi lưu kết quả thành artifact.",
    classification: KnowledgeClassification.LOOKUP_OK,
    source: ConceptSource.SUPPLEMENTARY_ML_FOUNDATION,
    prerequisites: ["pillow.image_io"],
    tags: ["pillow", "image", "artifact"],
  }),
  // NOTE: new concepts must be appended at the END — data-science-production-content.ts
  // destructures this array by index.
  ConceptSchema.parse({
    id: "pandas.new_column",
    title: "Tạo cột mới trong DataFrame",
    description:
      "Tạo cột mới từ phép tính trên các cột có sẵn — nền tảng của feature engineering.",
    classification: KnowledgeClassification.MUST_RECALL,
    // CS116 Bài 2B: stocks['value'] = stocks.close * stocks.volume.
    source: ConceptSource.CS116,
    prerequisites: ["pandas.column_select"],
    tags: ["pandas", "feature-engineering"],
  }),
];
