import { Link } from "react-router-dom";

import { useApplicationServices } from "../../app/services";

export function LearnPage() {
  const { content } = useApplicationServices();
  const courses = content.getCourses();

  return (
    <section className="page-card learning-page" aria-labelledby="learn-title">
      <p className="eyebrow">Không gian học</p>
      <h1 id="learn-title">Bắt đầu học Python cho ML/AI</h1>
      <p className="page-lead">
        Học theo lộ trình thực hành. Mỗi hoạt động sẽ đưa bạn từ dữ liệu thật vào
        trình soạn thảo Python và chấm kết quả trực tiếp trong trình duyệt.
      </p>

      <div className="learning-list" aria-label="Khóa học hiện có">
        {courses.map((course) => (
          <article className="learning-card" key={course.id}>
            <p className="learning-card__meta">Khóa học</p>
            <h2>{course.title}</h2>
            {course.description ? <p>{course.description}</p> : null}
            <Link className="primary-action primary-action--link" to={`/course/${course.id}`}>
              Mở khóa học
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
