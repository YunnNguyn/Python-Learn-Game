import { Link } from "react-router-dom";

import {
  CourseGraduationStatus,
  type CourseGraduation,
} from "../../app/course-graduation";
import type { AttemptRecord } from "../../core/domain";
import {
  missionVariantPath,
  toCompletionSummary,
  toProgressStatusLine,
  variantLabelOfSeed,
} from "./course-completion-model";

export interface CourseCompletionSummaryProps {
  readonly graduation: CourseGraduation;
  /** The capstone's stored attempts, oldest first (only used for the evidence list). */
  readonly capstoneAttempts: readonly AttemptRecord[];
  readonly reviewHref?: string;
}

/**
 * Completion summary of one course (PHASE-09 / M11). A derived view of stored attempts: no
 * certificate, no badge, no score. 26/27 renders a plain progress line; 27/27 renders the summary
 * with links to the review panel, a fresh capstone variant and the capstone's attempt evidence.
 */
export function CourseCompletionSummary({
  graduation,
  capstoneAttempts,
  reviewHref = "#course-review-section",
}: CourseCompletionSummaryProps) {
  // Only courses that declare a capstone get the summary; the others keep their earlier behavior.
  if (graduation.capstone === null) return null;
  if (graduation.status !== CourseGraduationStatus.COMPLETED) {
    const line = toProgressStatusLine(graduation);
    return line === null ? null : (
      <p className="course-progress-status" data-testid="course-progress-status">
        {line}
      </p>
    );
  }

  const model = toCompletionSummary(graduation);
  const capstone = graduation.capstone;
  const recent = [...capstoneAttempts].reverse().slice(0, 8);

  return (
    <section
      className="course-completion"
      id="course-completion"
      aria-labelledby="course-completion-title"
      data-testid="course-completion"
      tabIndex={-1}
    >
      <p className="learning-card__meta">Tổng kết khóa học</p>
      <h2 id="course-completion-title">{model.headline}</h2>
      <p>{model.progressLine}</p>
      {model.completedAtLine ? <p>{model.completedAtLine}</p> : null}
      <p className="course-completion__note">{model.meaningLine}</p>
      {model.capstoneLine ? (
        <p data-testid="course-capstone-evidence" data-evidence={capstone?.evidence}>
          {model.capstoneLine}
        </p>
      ) : null}
      <p data-testid="course-retention">{model.retentionLine}</p>

      <div className="learning-card__links course-completion__actions">
        <a className="secondary-action" href={reviewHref} data-testid="course-completion-review">
          Xem ôn tập đề xuất
        </a>
        {capstone ? (
          <Link
            className="primary-action primary-action--link"
            to={missionVariantPath(capstone.activityId, capstone.freshVariantIndex)}
            data-testid="course-capstone-retry"
          >
            Làm lại capstone với đề mới
          </Link>
        ) : null}
      </div>

      {capstone ? (
        <details className="course-completion__evidence" data-testid="course-capstone-attempts">
          <summary>Xem bằng chứng capstone ({capstone.attemptCount} lần nộp)</summary>
          {recent.length === 0 ? (
            <p>Chưa có lần nộp capstone nào.</p>
          ) : (
            <table>
              <caption className="visually-hidden">Các lần nộp capstone gần nhất</caption>
              <thead>
                <tr>
                  <th scope="col">Thời điểm</th>
                  <th scope="col">Đề</th>
                  <th scope="col">Kết quả</th>
                  <th scope="col">Gợi ý</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((attempt) => (
                  <tr key={attempt.id}>
                    <td>{shortTime(attempt.submittedAt)}</td>
                    <td>{variantLabelOfSeed(attempt.seed) ?? "Đề tùy chỉnh"}</td>
                    <td>{attempt.passed ? "Đạt" : "Chưa đạt"}</td>
                    <td>{attempt.hintsUsed.length > 0 ? attempt.hintsUsed.join(", ") : "Không"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </details>
      ) : null}
    </section>
  );
}

function shortTime(iso: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms)
    ? new Date(ms).toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : iso;
}
