import type { ChallengeIssue, ChallengeMetric } from "../../core/challenge";
import type {
  ChallengeReadError,
  ChallengeSubmission,
  ChallengeSummary,
  SubmitChallengeOutcome,
} from "../../app/services";

/*
 * Pure view-models of the Challenge screens: Vietnamese wording and presentation rules,
 * with no React, services or storage, so they are tested directly.
 */

export interface ChallengeNotice {
  readonly tone: "success" | "error" | "info";
  readonly title: string;
  readonly detail: string;
  /** Validation issues of a rejected submission, shown as a list. */
  readonly issues?: readonly ChallengeIssue[];
}

export type Loadable<T> =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: ChallengeReadError }
  | { readonly status: "ready"; readonly value: T };

export interface ChallengeHistory {
  readonly submissions: readonly ChallengeSubmission[];
  readonly best: ChallengeSubmission | null;
}

export function metricLabel(metric: ChallengeMetric): string {
  return metric === "mae" ? "MAE (sai số tuyệt đối trung bình)" : "Accuracy (độ chính xác)";
}

export function directionLabel(direction: ChallengeSummary["direction"]): string {
  return direction === "lower-is-better" ? "Càng thấp càng tốt" : "Càng cao càng tốt";
}

export function formatScore(metric: ChallengeMetric, score: number): string {
  return metric === "mae" ? score.toFixed(3) : `${(score * 100).toFixed(1)}%`;
}

/** "2026-10-27 10:00 UTC": explicit and independent of the viewer's locale and time zone. */
export function formatSubmittedAt(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
}

export function describeReadError(error: ChallengeReadError): ChallengeNotice {
  const title =
    error.code === "NOT_FOUND"
      ? "Không tìm thấy thử thách"
      : error.code === "CORRUPT"
        ? "Dữ liệu bài nộp bị hỏng"
        : error.code === "UPGRADE_BLOCKED"
          ? "Kho dữ liệu đang bị chặn"
          : error.code === "RETIRED"
            ? "Phiên dữ liệu đã đóng"
            : "Không dùng được kho lưu trữ";
  return { tone: "error", title, detail: error.message };
}

export function describeSubmitOutcome(outcome: SubmitChallengeOutcome, summary: ChallengeSummary): ChallengeNotice {
  switch (outcome.status) {
    case "saved":
      return {
        tone: "success",
        title: "Đã chấm và lưu bài nộp",
        detail: `Điểm ${summary.metric.toUpperCase()}: ${formatScore(outcome.submission.metric, outcome.submission.score)} (${directionLabel(summary.direction).toLowerCase()}), trên ${outcome.submission.rowCount} dòng.`,
      };
    case "rejected":
      return {
        tone: "error",
        title: "Bài nộp chưa hợp lệ, chưa được chấm điểm",
        detail: "Hãy sửa các lỗi dưới đây rồi nộp lại. Bài nộp lỗi không được lưu.",
        issues: outcome.issues,
      };
    case "storage-unavailable":
      return { tone: "error", title: "Bài nộp CHƯA được lưu", detail: outcome.message };
    case "upgrade-blocked":
      return { tone: "error", title: "Bài nộp CHƯA được lưu", detail: outcome.message };
    case "not-found":
    case "retired":
      return { tone: "error", title: "Không thể nộp bài", detail: outcome.message };
  }
}

export interface HistoryRow {
  readonly id: string;
  readonly submittedAt: string;
  readonly metric: string;
  readonly scoreText: string;
  readonly rowCount: number;
  readonly isBest: boolean;
}

/** Keeps the service's order (newest first); marks the service's best record. */
export function buildHistoryRows(history: ChallengeHistory): HistoryRow[] {
  return history.submissions.map((submission) => ({
    id: submission.id,
    submittedAt: formatSubmittedAt(submission.submittedAt),
    metric: submission.metric.toUpperCase(),
    scoreText: formatScore(submission.metric, submission.score),
    rowCount: submission.rowCount,
    isBest: history.best !== null && history.best.id === submission.id,
  }));
}

/** Null when the file may be read; otherwise why not. Runs BEFORE the file is read. */
export function validateUploadFile(file: { readonly name: string; readonly size: number }, maxBytes: number): ChallengeNotice | null {
  if (!/\.csv$/i.test(file.name)) {
    return { tone: "error", title: "Chỉ nhận tệp .csv", detail: "Hãy chọn một tệp có đuôi .csv." };
  }
  if (file.size > maxBytes) {
    return {
      tone: "error",
      title: "Tệp quá lớn",
      detail: `Bài nộp tối đa ${formatBytes(maxBytes)}; tệp này là ${formatBytes(file.size)}.`,
    };
  }
  return null;
}

export function challengePath(challengeId: string): string {
  return `/challenge/${encodeURIComponent(challengeId)}`;
}
