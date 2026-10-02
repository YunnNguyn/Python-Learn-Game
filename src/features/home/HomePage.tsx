import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <section className="page-card" aria-labelledby="home-title">
      <p className="eyebrow">Học thực hành</p>
      <h1 id="home-title">Học Python cho ML/AI</h1>
      <p className="page-lead">Ứng dụng học thực hành đang được xây dựng.</p>

      <div className="status-block">
        <h2>Nội dung thực hành hướng tới</h2>
        <ul>
          <li>củng cố Python nền tảng cho xử lý dữ liệu;</li>
          <li>luyện NumPy và các thao tác thường dùng trong ML/AI;</li>
          <li>áp dụng kiến thức qua bài tập ngắn, có mục tiêu.</li>
        </ul>
      </div>

      <Link className="primary-action primary-action--link" to="/learn">
        Bắt đầu học
      </Link>
    </section>
  );
}
