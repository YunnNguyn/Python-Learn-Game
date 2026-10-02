import { useParams } from "react-router-dom";

export function ActivityLaunchPage() {
  const { activityId } = useParams();
  const routeId = activityId?.trim();

  return (
    <section className="page-card" aria-labelledby="activity-title">
      <p className="eyebrow">Hoạt động học</p>
      <h1 id="activity-title">Bắt đầu hoạt động</h1>
      <p className="page-lead">
        {routeId
          ? "Nội dung và cách bắt đầu hoạt động sẽ được hiển thị tại đây. Mỗi hoạt động có thể có hình thức thực hành khác nhau."
          : "Không xác định được hoạt động cần mở."}
      </p>
    </section>
  );
}
