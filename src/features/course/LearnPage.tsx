import { Link } from "react-router-dom";

import {
  useApplicationServices,
  useLearningProgress,
  useMetaProgression,
} from "../../app/services";
import { ReviewReason, type LearningActivityId } from "../../core/domain";
import { getNextStudyActivity } from "../../app/learning-path";
import {
  InventoryItemId,
  inventoryItemLabel,
} from "../../core/meta-progression";
import { getCourseCompletion } from "../progress";

export function LearnPage() {
  const { content } = useApplicationServices();
  const { learning, snapshot } = useLearningProgress();
  const { snapshot: metaSnapshot } = useMetaProgression();
  const courses = content.getCourses();
  const reviewRecommendations = snapshot.ready
    ? learning.getReviewRecommendations(content.getConcepts(), content.getActivities())
    : [];
  const uniqueReviews = deduplicateActivityRecommendations(reviewRecommendations).slice(0, 3);
  const nextStudy = snapshot.ready ? getNextStudyActivity(content, learning) : null;
  const todayAction = resolveTodayAction(uniqueReviews, nextStudy);

  return (
    <section className="page-card learning-page" aria-labelledby="learn-title">
      <p className="eyebrow">Không gian học</p>
      <h1 id="learn-title">Bắt đầu học Python cho ML/AI</h1>
      <p className="page-lead">
        Học theo lộ trình thực hành. Mỗi lần Nộp bài được lưu cục bộ để theo dõi tiến độ,
        gợi ý phần cần ôn và giữ lịch sử học ngay cả khi bạn đóng trình duyệt.
      </p>

      {todayAction ? (
        <section className="today-study-card" aria-labelledby="today-study-title">
          <div>
            <p className="learning-card__meta">Hôm nay nên học gì?</p>
            <h2 id="today-study-title">{todayAction.title}</h2>
            <p>{todayAction.description}</p>
          </div>
          <Link className="primary-action primary-action--link" to={`/activity/${todayAction.activityId}`}>
            {todayAction.cta}
          </Link>
        </section>
      ) : null}

      <section className="meta-summary-card" aria-labelledby="meta-summary-title">
        <div className="meta-summary-card__header">
          <div>
            <p className="learning-card__meta">Phần thưởng học tập</p>
            <h2 id="meta-summary-title">Xưởng robot</h2>
            <p>
              KPI hôm nay: {metaSnapshot.dailyGoalsCompleted}/{metaSnapshot.dailyGoalsTotal}.
              Vật liệu nhận từ việc học được dùng riêng cho hệ thống phụ.
            </p>
          </div>
          <Link className="secondary-action" to="/workshop">
            Mở xưởng
          </Link>
        </div>
        <div className="meta-summary-inventory">
          {Object.values(InventoryItemId).map((itemId) => (
            <span key={itemId}>
              <strong>{metaSnapshot.inventory[itemId]}</strong> {inventoryItemLabel(itemId)}
            </span>
          ))}
        </div>
      </section>

      {uniqueReviews.length > 0 ? (
        <section className="review-recommendations" aria-labelledby="review-title">
          <div>
            <p className="learning-card__meta">Ôn tập đề xuất</p>
            <h2 id="review-title">Nên xem lại trước khi đi tiếp</h2>
          </div>
          <div className="review-recommendations__list">
            {uniqueReviews.map((recommendation) => {
              const activity = recommendation.activityId
                ? content.getActivity(recommendation.activityId)
                : undefined;
              const concept = content.getConcept(recommendation.conceptId);
              if (!activity) return null;
              return (
                <article className="review-recommendation" key={`${recommendation.conceptId}-${activity.id}`}>
                  <div>
                    <strong>{concept?.title ?? recommendation.conceptId}</strong>
                    <p>{reviewReasonLabel(recommendation.reason)}</p>
                  </div>
                  <Link className="secondary-action" to={`/activity/${activity.id}`}>
                    Ôn lại
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="learning-list" aria-label="Khóa học hiện có">
        {courses.map((course) => {
          const progress = getCourseCompletion(content, learning, course);
          return (
            <article className="learning-card" key={course.id}>
              <div className="learning-card__heading-row">
                <p className="learning-card__meta">Khóa học</p>
                <span className="progress-pill">
                  {progress.total === 0
                    ? "Chưa có hoạt động"
                    : `${progress.completed}/${progress.total} hoàn thành`}
                </span>
              </div>
              <h2>{course.title}</h2>
              {course.description ? <p>{course.description}</p> : null}
              <Link className="primary-action primary-action--link" to={`/course/${course.id}`}>
                Mở khóa học
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function deduplicateActivityRecommendations<T extends { readonly activityId?: LearningActivityId }>(
  recommendations: readonly T[],
): readonly T[] {
  const seen = new Set<LearningActivityId>();
  return recommendations.filter((recommendation) => {
    if (!recommendation.activityId || seen.has(recommendation.activityId)) return false;
    seen.add(recommendation.activityId);
    return true;
  });
}

function reviewReasonLabel(reason: ReviewReason): string {
  switch (reason) {
    case ReviewReason.RECENT_FAILURE:
      return "Bạn vừa có một lần nộp chưa đạt ở nhóm khái niệm này.";
    case ReviewReason.WEAK:
      return "Có bằng chứng học tập nhưng chưa có lần nộp đạt.";
    case ReviewReason.STALE:
      return "Khái niệm này đã lâu chưa được luyện lại.";
    case ReviewReason.DEPENDENCY:
      return "Đây là kiến thức nền đang yếu so với phần bạn đã học.";
  }
}

interface TodayAction {
  readonly activityId: LearningActivityId;
  readonly title: string;
  readonly description: string;
  readonly cta: string;
}

function resolveTodayAction(
  reviews: readonly { readonly activityId?: LearningActivityId; readonly reason: ReviewReason }[],
  nextStudy: ReturnType<typeof getNextStudyActivity>,
): TodayAction | null {
  const urgentReview = reviews.find(
    (item) =>
      item.activityId !== undefined &&
      (item.reason === ReviewReason.RECENT_FAILURE || item.reason === ReviewReason.WEAK),
  );

  if (urgentReview?.activityId) {
    return {
      activityId: urgentReview.activityId,
      title: "Ôn lại phần vừa vướng trước khi đi tiếp",
      description: reviewReasonLabel(urgentReview.reason),
      cta: "Ôn ngay",
    };
  }

  if (!nextStudy) return null;
  switch (nextStudy.reason) {
    case "CONTINUE":
      return {
        activityId: nextStudy.activityId,
        title: "Tiếp tục hoạt động đang làm",
        description: "Bạn đã có lần nộp ở hoạt động này. Tiếp tục từ tiến độ hiện tại để hoàn thành nó.",
        cta: "Tiếp tục",
      };
    case "NEXT":
      return {
        activityId: nextStudy.activityId,
        title: "Hoạt động tiếp theo đã sẵn sàng",
        description: "Đi theo thứ tự lộ trình để kiến thức mới xuất hiện sau khi phần nền đã được luyện xong.",
        cta: "Học tiếp",
      };
    case "COMPLETE_REVIEW":
      return {
        activityId: nextStudy.activityId,
        title: "Lộ trình hiện tại đã hoàn thành",
        description: "Bạn có thể dùng bài ôn tập cuối để củng cố lại toàn bộ lát cắt NumPy.",
        cta: "Ôn tập",
      };
  }
}
