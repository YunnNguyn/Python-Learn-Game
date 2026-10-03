import { Link, useParams } from "react-router-dom";

import { useApplicationServices } from "../../app/services";
import type { LessonId } from "../../core/domain";

export function LessonPage() {
  const { lessonId } = useParams();
  const { content } = useApplicationServices();
  const lesson = lessonId ? content.getLesson(lessonId as LessonId) : undefined;

  if (lesson === undefined) {
    return (
      <section className="page-card" aria-labelledby="lesson-title">
        <p className="eyebrow">Bài học</p>
        <h1 id="lesson-title">Không tìm thấy bài học</h1>
        <Link className="primary-action primary-action--link" to="/learn">
          Về không gian học
        </Link>
      </section>
    );
  }

  return (
    <section className="page-card learning-page" aria-labelledby="lesson-title">
      <p className="eyebrow">Bài học</p>
      <h1 id="lesson-title">{lesson.title}</h1>
      {lesson.description ? <p className="page-lead">{lesson.description}</p> : null}

      <div className="learning-list">
        {lesson.activityIds.map((activityId, index) => {
          const activity = content.getActivity(activityId);
          return activity ? (
            <article className="learning-card" key={activity.id}>
              <p className="learning-card__meta">Hoạt động {index + 1}</p>
              <h2>{activity.title}</h2>
              {activity.description ? <p>{activity.description}</p> : null}
              <p className="learning-card__stage">Giai đoạn: {activity.stage}</p>
              <Link className="primary-action primary-action--link" to={`/activity/${activity.id}`}>
                Xem hoạt động
              </Link>
            </article>
          ) : null;
        })}
      </div>
    </section>
  );
}
