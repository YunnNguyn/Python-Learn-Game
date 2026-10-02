import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="page-card" aria-labelledby="not-found-title">
      <p className="eyebrow">404</p>
      <h1 id="not-found-title">Không tìm thấy trang</h1>
      <p className="page-lead">Địa chỉ này chưa tồn tại trong ứng dụng.</p>
      <Link className="primary-action primary-action--link" to="/">
        Về trang chủ
      </Link>
    </section>
  );
}
