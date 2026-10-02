import { useParams } from "react-router-dom";

export function LessonPage() {
  const { lessonId } = useParams();
  const routeId = lessonId?.trim();

  return (
    <section className="page-card" aria-labelledby="lesson-title">
      <p className="eyebrow">Bài học</p>
      <h1 id="lesson-title">Bài học</h1>
      <p className="page-lead">
        {routeId
          ? "Danh sách hoạt động và nội dung bài học sẽ được hiển thị tại đây."
          : "Không xác định được bài học cần mở."}
      </p>
    </section>
  );
}
