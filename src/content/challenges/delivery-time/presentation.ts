import type { ChallengePresentation } from "../presentation";

const base = `${import.meta.env.BASE_URL}challenges/delivery-time/v1/`;

export const DELIVERY_TIME_PRESENTATION: ChallengePresentation = {
  id: "delivery-time",
  shortDescription:
    "Dự đoán số phút giao hàng của 12 đơn mới từ khoảng cách, mức độ kẹt xe và số món hàng. Bài hồi quy nhỏ, hợp để thực hành sau khi học xong Python cơ bản.",
  problem: [
    "Một cửa hàng muốn báo trước cho khách đơn hàng sẽ đến sau bao nhiêu phút. Bạn có dữ liệu của 40 đơn đã giao (train.csv, có kèm thời gian giao thật) và 12 đơn mới (test.csv, chưa có đáp án).",
    "Nhiệm vụ: với mỗi đơn trong test.csv, dự đoán delivery_minutes (số phút, có thể là số thập phân), rồi nộp một tệp CSV gồm đúng hai cột order_id và delivery_minutes.",
    "Điểm là MAE (sai số tuyệt đối trung bình): trung bình của |dự đoán − thực tế| trên 12 đơn. MAE càng thấp càng tốt; 0 là hoàn hảo.",
  ],
  columns: [
    { name: "order_id", description: "Mã đơn hàng, là chuỗi (ví dụ ORD041). Giữ nguyên, không đổi thành số.", where: "train, test, bài nộp" },
    { name: "distance_km", description: "Khoảng cách giao hàng, tính bằng km.", where: "train, test" },
    { name: "traffic_level", description: "Mức độ giao thông: 0 thông thoáng, 1 đông vừa, 2 kẹt xe.", where: "train, test" },
    { name: "items_count", description: "Số món hàng trong đơn.", where: "train, test" },
    { name: "delivery_minutes", description: "Thời gian giao thực tế (phút). Đây là cột cần dự đoán.", where: "chỉ có trong train; là cột dự đoán trong bài nộp" },
  ],
  files: [
    { filename: "train.csv", url: `${base}train.csv`, description: "40 đơn đã giao, có cột delivery_minutes." },
    { filename: "test.csv", url: `${base}test.csv`, description: "12 đơn cần dự đoán, không có delivery_minutes." },
    { filename: "sample_submission.csv", url: `${base}sample_submission.csv`, description: "Bài nộp mẫu đúng định dạng (mọi đơn cùng một giá trị)." },
  ],
  sampleSubmissionUrl: `${base}sample_submission.csv`,
  submissionExample: "order_id,delivery_minutes\nORD041,35.4\nORD042,35.4\nORD043,35.4\n...",
  hints: [
    "Thử bắt đầu bằng trung bình của delivery_minutes trong train (đó chính là bài nộp mẫu), rồi xem các cột khác giúp giảm sai số thế nào.",
    "Bạn có thể tính dự đoán bằng Python (Pyodide trong phần Luyện tập, hoặc môi trường riêng), rồi dán kết quả vào ô soạn thảo bên dưới.",
  ],
};
