import { Link } from "react-router-dom";

import {
  useApplicationServices,
  useLearningProgress,
  useMetaProgression,
} from "../../app/services";
import type { Course } from "../../core/domain";
import {
  CourseGraduationStatus,
  getCourseGraduation,
  type CourseGraduation,
} from "../../app/course-graduation";
import {
  CourseReviewReason,
  selectCourseReview,
  type CourseReviewItem,
} from "../../app/course-review";
import {
  getNextStudyActivity,
  resolveActiveCourse,
} from "../../app/learning-path";
import {
  InventoryItemId,
  inventoryItemLabel,
} from "../../core/meta-progression";
import { getCourseCompletion } from "../progress";
import { getCourseContinue } from "./course-continue-model";
import { CourseReviewPanel } from "./CourseReviewPanel";
import { missionVariantPath, reviewItemPath } from "./course-completion-model";

export function LearnPage() {
  const { content } = useApplicationServices();
  const { learning, snapshot } = useLearningProgress();
  const { snapshot: metaSnapshot } = useMetaProgression();
  const courses = content.getCourses();
  // The Today card recommends ONE step, so it needs a course: the course of the latest
  // submission (derived from stored attempts, nothing new is saved), else the first course.
  const activeCourse = snapshot.ready ? resolveActiveCourse(content, learning) : undefined;
  const nextStudy =
    snapshot.ready && activeCourse ? getNextStudyActivity(content, learning, activeCourse.id) : null;
  // Review is scoped to that same course and to unlocked activities (PHASE-09 / M11).
  const review =
    snapshot.ready && activeCourse
      ? selectCourseReview({ content, reader: learning, courseId: activeCourse.id, now: new Date() })
      : null;
  const activeGraduation =
    snapshot.ready && activeCourse ? getCourseGraduation(content, learning, activeCourse.id) : null;
  const todayAction = resolveTodayAction({
    urgentReview: review?.items.find((item) => item.reason === CourseReviewReason.RECENT_FAILURE),
    nextStudy,
    graduation: activeGraduation,
    course: activeCourse,
  });

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
            <p className="learning-card__meta">
              Hôm nay nên học gì?
              {todayAction.courseTitle ? ` · ${todayAction.courseTitle}` : ""}
            </p>
            <h2 id="today-study-title">{todayAction.title}</h2>
            <p>{todayAction.description}</p>
          </div>
          <Link
            className="primary-action primary-action--link"
            to={todayAction.to}
            data-testid="today-action"
          >
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

      {review ? (
        <CourseReviewPanel
          review={review}
          headingId="review-title"
          hideWhenEmpty
          courseTitle={activeCourse?.title}
        />
      ) : null}

      <div className="learning-list" aria-label="Khóa học hiện có">
        {courses.map((course) => {
          const progress = getCourseCompletion(content, learning, course);
          const graduation = snapshot.ready ? getCourseGraduation(content, learning, course.id) : null;
          const finishedWithCapstone =
            graduation !== null &&
            graduation.status === CourseGraduationStatus.COMPLETED &&
            graduation.capstone !== null;
          const resume =
            snapshot.ready && !finishedWithCapstone ? getCourseContinue(content, learning, course.id) : null;
          return (
            <article className="learning-card" key={course.id} data-course-id={course.id}>
              <div className="learning-card__heading-row">
                <p className="learning-card__meta">Khóa học</p>
                <span
                  className={`progress-pill${finishedWithCapstone ? " progress-pill--complete" : ""}`}
                >
                  {progress.total === 0
                    ? "Chưa có hoạt động"
                    : `${progress.completed}/${progress.total} hoàn thành`}
                </span>
              </div>
              <h2>{course.title}</h2>
              {course.description ? <p>{course.description}</p> : null}
              <div className="learning-card__links">
                {finishedWithCapstone && graduation?.capstone ? (
                  <>
                    <Link
                      className="primary-action primary-action--link"
                      to={`/course/${course.id}#course-completion`}
                      data-testid="course-completed-cta"
                    >
                      Xem tổng kết khóa học
                    </Link>
                    <Link
                      className="secondary-action"
                      to={`/course/${course.id}#course-review-section`}
                      data-testid="course-completed-review"
                    >
                      Ôn tập đề xuất
                    </Link>
                    <Link
                      className="secondary-action"
                      to={missionVariantPath(
                        graduation.capstone.activityId,
                        graduation.capstone.freshVariantIndex,
                      )}
                      data-testid="course-completed-retry"
                    >
                      Làm lại capstone với đề mới
                    </Link>
                  </>
                ) : (
                  <>
                    {resume ? (
                      <Link
                        className="primary-action primary-action--link"
                        to={`/activity/${resume.activityId}`}
                        data-testid="course-continue"
                      >
                        {resume.label}
                      </Link>
                    ) : null}
                    <Link
                      className={resume ? "secondary-action" : "primary-action primary-action--link"}
                      to={`/course/${course.id}`}
                    >
                      Mở khóa học
                    </Link>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

interface TodayAction {
  readonly to: string;
  readonly title: string;
  readonly description: string;
  readonly cta: string;
  /** The course the recommended step belongs to, so the card never hides which course it means. */
  readonly courseTitle?: string;
}

function resolveTodayAction(input: {
  readonly urgentReview: CourseReviewItem | undefined;
  readonly nextStudy: ReturnType<typeof getNextStudyActivity>;
  readonly graduation: CourseGraduation | null;
  readonly course: Course | undefined;
}): TodayAction | null {
  const { urgentReview, nextStudy, graduation, course } = input;
  const courseTitle = course?.title;

  // Only a recent FAILURE interrupts the path. A concept that is merely "not yet solid" stays in
  // the review panel: it must not turn "Học tiếp" into "Ôn ngay" right after a successful Submit.
  if (urgentReview) {
    return {
      to: reviewItemPath(urgentReview),
      title: "Ôn lại phần vừa vướng trước khi đi tiếp",
      description: urgentReview.why,
      cta: "Ôn ngay",
      courseTitle,
    };
  }

  if (!nextStudy) return null;
  switch (nextStudy.reason) {
    case "CONTINUE":
      return {
        to: `/activity/${nextStudy.activityId}`,
        title: "Tiếp tục hoạt động đang làm",
        description: "Bạn đã có lần nộp ở hoạt động này. Tiếp tục từ tiến độ hiện tại để hoàn thành nó.",
        cta: "Tiếp tục",
        courseTitle,
      };
    case "NEXT":
      return {
        to: `/activity/${nextStudy.activityId}`,
        title: "Hoạt động tiếp theo đã sẵn sàng",
        description: "Đi theo thứ tự lộ trình để kiến thức mới xuất hiện sau khi phần nền đã được luyện xong.",
        cta: "Học tiếp",
        courseTitle,
      };
    case "COMPLETE_REVIEW":
      if (
        course !== undefined &&
        graduation !== null &&
        graduation.status === CourseGraduationStatus.COMPLETED &&
        graduation.capstone !== null
      ) {
        return {
          to: `/course/${course.id}#course-completion`,
          title: "Bạn đã hoàn thành khóa học",
          description:
            "Xem tổng kết, phần ôn tập đề xuất hoặc làm lại capstone với một đề mới. Hoàn thành khóa chưa có nghĩa là đã ghi nhớ lâu dài.",
          cta: "Xem tổng kết khóa học",
          courseTitle,
        };
      }
      return {
        to: `/activity/${nextStudy.activityId}`,
        title: "Lộ trình hiện tại đã hoàn thành",
        description: "Bạn có thể dùng bài ôn tập cuối của khóa này để củng cố lại những gì đã học.",
        cta: "Ôn tập",
        courseTitle,
      };
  }
}
