import { Link, useParams } from "react-router-dom";

import { useApplicationServices, useLearningProgress } from "../../app/services";
import type { CourseId } from "../../core/domain";
import { getLessonCompletion, getWorldCompletion } from "../progress";
import { getCourseContinue } from "./course-continue-model";

export function CoursePage() {
  const { courseId } = useParams();
  const { content } = useApplicationServices();
  const { learning, snapshot } = useLearningProgress();
  const course = courseId ? content.getCourse(courseId as CourseId) : undefined;

  const resume =
    course !== undefined && snapshot.ready ? getCourseContinue(content, learning, course.id) : null;

  if (course === undefined) {
    return (
      <section className="page-card" aria-labelledby="course-title">
        <p className="eyebrow">Khóa học</p>
        <h1 id="course-title">Không tìm thấy khóa học</h1>
        <p className="page-lead">Đường dẫn này không trỏ tới nội dung học đã đăng ký.</p>
        <Link className="primary-action primary-action--link" to="/learn">
          Về không gian học
        </Link>
      </section>
    );
  }

  return (
    <section className="page-card learning-page" aria-labelledby="course-title">
      <p className="eyebrow">Khóa học</p>
      <h1 id="course-title">{course.title}</h1>
      {course.description ? <p className="page-lead">{course.description}</p> : null}

      {resume ? (
        <section className="today-study-card" aria-labelledby="course-continue-title">
          <div>
            <p className="learning-card__meta">Bước tiếp theo trong khóa này</p>
            <h2 id="course-continue-title">{resume.activityTitle}</h2>
          </div>
          <Link
            className="primary-action primary-action--link"
            to={`/activity/${resume.activityId}`}
            data-testid="course-continue"
          >
            {resume.label}
          </Link>
        </section>
      ) : null}

      <div className="learning-list">
        {course.worldIds.map((worldId) => {
          const world = content.getWorld(worldId);
          if (!world) return null;
          const progress = getWorldCompletion(content, learning, world);
          return (
            <article className="learning-card" key={world.id}>
              <div className="learning-card__heading-row">
                <p className="learning-card__meta">Chủ đề</p>
                <span className="progress-pill">{progress.completed}/{progress.total} hoàn thành</span>
              </div>
              <h2>{world.title}</h2>
              {world.description ? <p>{world.description}</p> : null}
              <div className="learning-card__links">
                {world.lessonIds.map((lessonId) => {
                  const lesson = content.getLesson(lessonId);
                  if (!lesson) return null;
                  const lessonProgress = getLessonCompletion(learning, lesson);
                  return (
                    <Link className="secondary-action" key={lesson.id} to={`/lesson/${lesson.id}`}>
                      {lesson.title} · {lessonProgress.completed}/{lessonProgress.total}
                    </Link>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
