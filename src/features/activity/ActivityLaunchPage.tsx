import { Link, useParams } from "react-router-dom";

import { useApplicationServices, useLearningProgress } from "../../app/services";
import { getActivityAccess } from "../../app/learning-path";
import {
  LearningActivityType,
  type LearningActivityId,
} from "../../core/domain";
import { activityStatusLabel, masteryLabel } from "../progress";

export function ActivityLaunchPage() {
  const { activityId } = useParams();
  const { content } = useApplicationServices();
  const { learning } = useLearningProgress();
  const activity = activityId
    ? content.getActivity(activityId as LearningActivityId)
    : undefined;

  if (activity === undefined) {
    return (
      <section className="page-card" aria-labelledby="activity-title">
        <p className="eyebrow">Hoạt động học</p>
        <h1 id="activity-title">Không tìm thấy hoạt động</h1>
        <Link className="primary-action primary-action--link" to="/learn">
          Về không gian học
        </Link>
      </section>
    );
  }

  const access = getActivityAccess(content, learning, activity.id);
  const executable =
    activity.type === LearningActivityType.CODE_MISSION ||
    activity.type === LearningActivityType.DEBUG_MISSION ||
    activity.type === LearningActivityType.BOSS_MISSION;
  const progress = learning.getActivityProgress(activity.id);

  if (!access.unlocked) {
    return (
      <section className="page-card activity-page" aria-labelledby="activity-title">
        <p className="eyebrow">Hoạt động học · Chưa mở</p>
        <h1 id="activity-title">{activity.title}</h1>
        {activity.description ? <p className="page-lead">{activity.description}</p> : null}
        <section className="activity-locked-panel" aria-label="Điều kiện mở khóa">
          <strong>🔒 Hoạt động này chưa được mở.</strong>
          <p>{access.reason}</p>
        </section>
        <Link className="primary-action primary-action--link" to="/learn">
          Về lộ trình hôm nay
        </Link>
      </section>
    );
  }
  const attempts = learning.getAttemptsByActivity(activity.id).slice(-5).reverse();

  return (
    <section className="page-card activity-page" aria-labelledby="activity-title">
      <div className="learning-card__heading-row">
        <p className="eyebrow">Hoạt động học</p>
        <span className={`progress-pill ${progress.completed ? "progress-pill--complete" : ""}`}>
          {activityStatusLabel(learning, activity.id)}
        </span>
      </div>
      <h1 id="activity-title">{activity.title}</h1>
      {activity.description ? <p className="page-lead">{activity.description}</p> : null}

      <section className="activity-progress-grid" aria-label="Tiến độ hoạt động">
        <article className="activity-progress-card">
          <span>Lần nộp</span>
          <strong>{progress.attemptCount}</strong>
        </article>
        <article className="activity-progress-card">
          <span>Lần đạt</span>
          <strong>{progress.successfulAttemptCount}</strong>
        </article>
        <article className="activity-progress-card">
          <span>Kết quả gần nhất</span>
          <strong>{progress.lastPassed === undefined ? "—" : progress.lastPassed ? "Đạt" : "Chưa đạt"}</strong>
        </article>
      </section>

      <section className="activity-concepts" aria-labelledby="activity-concepts-title">
        <h2 id="activity-concepts-title">Khái niệm đang luyện</h2>
        <div className="activity-concepts__list">
          {activity.conceptIds.map((conceptId) => {
            const concept = content.getConcept(conceptId);
            const conceptProgress = learning.getConceptProgress(conceptId);
            return (
              <div className="activity-concept-row" key={conceptId}>
                <span>{concept?.title ?? conceptId}</span>
                <strong>{masteryLabel(conceptProgress.mastery)}</strong>
              </div>
            );
          })}
        </div>
      </section>

      <div className="status-block">
        <p>
          Nhiệm vụ dùng seed có thể tái tạo. Bản nháp, gợi ý đã mở và lịch sử Nộp bài
          được lưu cục bộ để bạn có thể quay lại tiếp tục.
        </p>
        {executable ? (
          <Link className="primary-action primary-action--link" to={`/mission/${activity.id}`}>
            {progress.attemptCount > 0 ? "Tiếp tục thực hành" : "Bắt đầu thực hành"}
          </Link>
        ) : (
          <p>Loại hoạt động này chưa được nối vào workspace ở phiên bản hiện tại.</p>
        )}
      </div>

      {attempts.length > 0 ? (
        <section className="attempt-history" aria-labelledby="attempt-history-title">
          <h2 id="attempt-history-title">Lịch sử gần đây</h2>
          <div className="attempt-history__list">
            {attempts.map((attempt) => (
              <article className="attempt-history__item" key={attempt.id}>
                <div>
                  <strong className={attempt.passed ? "attempt-pass" : "attempt-fail"}>
                    {attempt.passed ? "Đạt" : "Chưa đạt"}
                  </strong>
                  <span>{formatAttemptTime(attempt.submittedAt)}</span>
                </div>
                <p>
                  {attempt.hintsUsed.length > 0
                    ? `Gợi ý: ${attempt.hintsUsed.join(", ")}`
                    : "Không dùng gợi ý"}
                  {` · Chạy thử trước Submit: ${attempt.runCountBeforeSubmit}`}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function formatAttemptTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
