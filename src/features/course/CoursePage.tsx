import { useParams } from "react-router-dom";

export function CoursePage() {
  const { courseId } = useParams();
  const routeId = courseId?.trim();

  return (
    <section className="page-card" aria-labelledby="course-title">
      <p className="eyebrow">Khóa học</p>
      <h1 id="course-title">Không gian khóa học</h1>
      <p className="page-lead">
        {routeId
          ? "Nội dung của khóa học sẽ được hiển thị tại đây khi dữ liệu học tập được kết nối."
          : "Không xác định được khóa học cần mở."}
      </p>
    </section>
  );
}
