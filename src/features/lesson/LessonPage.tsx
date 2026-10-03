import { Link, useParams } from "react-router-dom";

import { useApplicationServices, useLearningProgress } from "../../app/services";
import type { LessonId } from "../../core/domain";
import { activityStatusLabel } from "../progress";

export function LessonPage() {
  const { lessonId } = useParams();
  const { content } = useApplicationServices();
  const { learning } = useLearningProgress();
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
          if (!activity) return null;
          const progress = learning.getActivityProgress(activity.id);
          return (
            <article className="learning-card" key={activity.id}>
              <div className="learning-card__heading-row">
                <p className="learning-card__meta">Hoạt động {index + 1}</p>
                <span className={`progress-pill ${progress.completed ? "progress-pill--complete" : ""}`}>
                  {activityStatusLabel(learning, activity.id)}
                </span>
              </div>
              <h2>{activity.title}</h2>
              {activity.description ? <p>{activity.description}</p> : null}
              <p className="learning-card__stage">
                {progress.attemptCount > 0
                  ? `${progress.attemptCount} lần nộp · ${progress.successfulAttemptCount} lần đạt`
                  : "Chưa có lần nộp nào."}
              </p>
              <Link className="primary-action primary-action--link" to={`/activity/${activity.id}`}>
                {progress.attemptCount > 0 ? "Tiếp tục" : "Xem hoạt động"}
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
