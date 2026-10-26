import {
  CapstoneEvidence,
  CourseGraduationStatus,
  type CourseGraduation,
} from "../../app/course-graduation";
import {
  CourseReviewState,
  type CourseReview,
  type CourseReviewItem,
} from "../../app/course-review";
import type { LearningActivityId } from "../../core/domain";

/**
 * Presentation model of the course completion summary and the review panel (PHASE-09 / M11).
 * Pure text + links: every sentence says what the stored attempts actually show, and keeps three
 * different things apart - COMPLETING a course (every activity passed once, hints allowed), the
 * CAPSTONE evidence (one activity, with or without H3/H4) and RETAINED concepts (the existing
 * 24h mastery rule). None of them is a certificate or a score.
 */

export interface CompletionSummaryModel {
  readonly headline: string;
  readonly progressLine: string;
  readonly completedAtLine: string | null;
  readonly meaningLine: string;
  readonly capstoneLine: string | null;
  readonly retentionLine: string;
}

export function formatCompletionDate(iso: string | undefined): string | null {
  if (iso === undefined) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleString("vi-VN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function toCompletionSummary(graduation: CourseGraduation): CompletionSummaryModel {
  const completed = graduation.status === CourseGraduationStatus.COMPLETED;
  const when = formatCompletionDate(graduation.completedAt);
  const { capstone, retention } = graduation;

  let capstoneLine: string | null = null;
  if (capstone !== null) {
    switch (capstone.evidence) {
      case CapstoneEvidence.INDEPENDENT:
        capstoneLine = `Capstone “${capstone.title}”: có ít nhất một lần đạt không mở gợi ý mức cao (H3/H4). Đây là bằng chứng tự làm cho riêng capstone này, không phải điểm số của cả khóa.`;
        break;
      case CapstoneEvidence.WITH_SUPPORT:
        capstoneLine = `Capstone “${capstone.title}”: đã đạt, nhưng các lần đạt đều có dùng gợi ý H3/H4. Làm lại với một đề mới và không mở H3/H4 để có bằng chứng tự làm cho capstone này.`;
        break;
      case CapstoneEvidence.NONE:
        capstoneLine = `Capstone “${capstone.title}” chưa có lần đạt nào.`;
        break;
    }
  }

  return {
    headline: completed ? "Bạn đã hoàn thành khóa học" : "Khóa học chưa hoàn thành",
    progressLine: completed
      ? `Đã đạt ${graduation.completedCount}/${graduation.totalCount} hoạt động (gợi ý vẫn được tính là đạt).`
      : `Đã đạt ${graduation.completedCount}/${graduation.totalCount} hoạt động.`,
    completedAtLine: completed && when !== null ? `Hoàn thành lúc ${when}.` : null,
    meaningLine:
      "Hoàn thành khóa nghĩa là mọi hoạt động đã đạt ít nhất một lần. Đó chưa phải là thành thạo hay ghi nhớ lâu dài, và một lần nộp chưa đạt sau này không làm mất trạng thái này.",
    capstoneLine,
    retentionLine:
      retention.retainedConceptCount === 0
        ? "Chưa có khái niệm nào có bằng chứng ghi nhớ. Bằng chứng này chỉ xuất hiện khi bạn làm lại một bài ôn tập đạt sau ít nhất 24 giờ kể từ lần đạt đầu tiên của khái niệm."
        : `${retention.retainedConceptCount}/${retention.conceptCount} khái niệm đã có bằng chứng ghi nhớ (theo quy tắc ôn tập đạt sau ≥ 24 giờ).`,
  };
}

/** The line shown on the course page while the course is not complete (for example 26/27). */
export function toProgressStatusLine(graduation: CourseGraduation): string | null {
  if (graduation.status === CourseGraduationStatus.COMPLETED || graduation.totalCount === 0) return null;
  const remaining = graduation.totalCount - graduation.completedCount;
  const capstoneId = graduation.capstone?.activityId;
  if (capstoneId !== undefined && graduation.remainingActivityIds.length === 1 && graduation.remainingActivityIds[0] === capstoneId) {
    return `Đã đạt ${graduation.completedCount}/${graduation.totalCount} hoạt động. Khóa chỉ hoàn thành khi bạn đạt nốt capstone “${graduation.capstone!.title}”.`;
  }
  return `Đã đạt ${graduation.completedCount}/${graduation.totalCount} hoạt động; còn ${remaining} hoạt động chưa đạt.`;
}

export function missionVariantPath(activityId: LearningActivityId, variantIndex: number): string {
  return `/mission/${activityId}?variant=${variantIndex}`;
}

/** Where a review item leads: RECENT_FAILURE continues the activity, the rest open a fresh variant. */
export function reviewItemPath(item: CourseReviewItem): string {
  if (item.reason === "RECENT_FAILURE" || item.freshVariantIndex === null) {
    return `/activity/${item.activityId}`;
  }
  return missionVariantPath(item.activityId, item.freshVariantIndex);
}

export function reviewItemActionLabel(item: CourseReviewItem): string {
  if (item.reason === "RECENT_FAILURE" || item.freshVariantIndex === null) return "Làm lại";
  return "Ôn lại với đề mới";
}

export function reviewEmptyMessage(review: CourseReview): string | null {
  switch (review.state) {
    case CourseReviewState.ITEMS:
      return null;
    case CourseReviewState.NO_ATTEMPTS:
      return "Chưa có lần nộp nào trong khóa này nên chưa có gì để ôn. Hãy nộp bài đầu tiên.";
    case CourseReviewState.NOTHING_DUE:
      return "Hiện chưa có phần nào cần ôn gấp: không có lần nộp chưa đạt gần đây, khái niệm yếu hay khái niệm lâu chưa luyện.";
    case CourseReviewState.NO_ELIGIBLE_ACTIVITY:
      return "Có phần cần ôn, nhưng chưa có hoạt động nào đang mở để ôn lại. Hãy tiếp tục theo lộ trình để mở thêm.";
  }
}

/** A short label for the variant a stored seed refers to ("Đề #3"), or null for a custom seed. */
export function variantLabelOfSeed(seed: string): string | null {
  const match = /:variant:(\d+)$/.exec(seed);
  if (match === null) return null;
  const index = Number.parseInt(match[1]!, 10);
  return Number.isSafeInteger(index) ? `Đề #${index + 1}` : null;
}

/** Parses the `?variant=N` query value; anything but a non-negative safe integer is ignored. */
export function parseVariantParam(value: string | null): number | undefined {
  if (value === null || !/^\d{1,6}$/.test(value)) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
