import { Link } from "react-router-dom";

import type { CourseReview } from "../../app/course-review";
import {
  reviewEmptyMessage,
  reviewItemActionLabel,
  reviewItemPath,
} from "./course-completion-model";

export interface CourseReviewPanelProps {
  readonly review: CourseReview;
  /** Unique heading id (the panel can appear next to another course's panel). */
  readonly headingId: string;
  /** The /learn page hides the panel when there is nothing to say; the course page explains why. */
  readonly hideWhenEmpty?: boolean;
  readonly courseTitle?: string;
}

/**
 * "Ôn tập đề xuất" (PHASE-09 / M11): at most three unlocked activities of ONE course, each with the
 * reason in plain Vietnamese. It never shows a locked activity or one from another course (see
 * `selectCourseReview`).
 */
export function CourseReviewPanel({
  review,
  headingId,
  hideWhenEmpty = false,
  courseTitle,
}: CourseReviewPanelProps) {
  const empty = reviewEmptyMessage(review);
  if (empty !== null && hideWhenEmpty) return null;

  return (
    <section
      className="review-recommendations"
      id={`${headingId}-section`}
      aria-labelledby={headingId}
      data-testid="course-review"
      tabIndex={-1}
    >
      <div>
        <p className="learning-card__meta">
          Ôn tập đề xuất{courseTitle ? ` · ${courseTitle}` : ""}
        </p>
        <h2 id={headingId}>Nên xem lại trước khi đi tiếp</h2>
      </div>
      {empty !== null ? (
        <p className="review-recommendations__empty">{empty}</p>
      ) : (
        <ul className="review-recommendations__list">
          {review.items.map((item) => (
            <li className="review-recommendation" key={item.activityId}>
              <div>
                <strong>{item.activityTitle}</strong>
                <p className="learning-card__meta">Khái niệm: {item.conceptTitle}</p>
                <p>{item.why}</p>
              </div>
              <Link className="secondary-action" to={reviewItemPath(item)}>
                {reviewItemActionLabel(item)}
                <span className="visually-hidden"> {item.activityTitle}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
