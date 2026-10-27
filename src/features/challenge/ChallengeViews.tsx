import type { ChangeEvent } from "react";
import { Link } from "react-router-dom";

import type { ChallengeSummary } from "../../app/services";
import type { ChallengePresentation } from "../../content/challenges/presentations";
import {
  buildHistoryRows,
  challengePath,
  describeReadError,
  directionLabel,
  formatBytes,
  metricLabel,
  type ChallengeHistory,
  type ChallengeNotice,
  type Loadable,
} from "./challenge-view-models";

/* Pure views: props in, markup out. Containers (ChallengeListPage / ChallengeDetailPage) only fetch. */

export const PRACTICE_NOT_EXAM_NOTE =
  "Đây là bài luyện tập, không phải kỳ thi bảo mật. Đáp án được đóng gói cùng ứng dụng và chạy hoàn toàn trong trình duyệt, nên một người rành kỹ thuật vẫn có thể tìm thấy nó. Hãy dùng thử thách này để học và tự đánh giá; không có bảng xếp hạng hay phần thưởng.";

export function ChallengeNoticeBox({ notice }: { readonly notice: ChallengeNotice }) {
  return (
    <div className={`practice-notice practice-notice--${notice.tone === "info" ? "success" : notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
      <strong>{notice.title}</strong>
      <p>{notice.detail}</p>
      {notice.issues !== undefined && notice.issues.length > 0 ? (
        <ol className="practice-issues__list" aria-label="Các lỗi cần sửa">
          {notice.issues.map((issue, index) => (
            <li key={`${index}:${issue.code}`}>
              <span className="practice-issues__message">{issue.message}</span>
              {issue.line !== undefined ? <span className="practice-issues__code"> (dòng {issue.line})</span> : null}
              {issue.examples !== undefined && issue.examples.length > 0 ? (
                <span className="challenge-issue__examples">
                  {" "}
                  Ví dụ: <code>{issue.examples.join(", ")}</code>
                </span>
              ) : null}
              <span className="practice-issues__code">{issue.code}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ listing

export function ChallengeListView({
  state,
  presentationOf,
}: {
  readonly state: { readonly challenges: readonly ChallengeSummary[] } | null;
  readonly presentationOf: (challengeId: string) => ChallengePresentation | undefined;
}) {
  if (state === null || state.challenges.length === 0) {
    return <p className="practice-empty">Chưa có thử thách nào.</p>;
  }
  return (
    <div className="learning-list">
      {state.challenges.map((challenge) => (
        <article className="learning-card" key={challenge.id}>
          <p className="learning-card__meta">
            {metricLabel(challenge.metric)} · {directionLabel(challenge.direction)}
          </p>
          <h2>{challenge.title}</h2>
          <p>{presentationOf(challenge.id)?.shortDescription ?? ""}</p>
          <div className="learning-card__links">
            <Link className="primary-action primary-action--link" to={challengePath(challenge.id)}>
              Mở thử thách
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}

export function ChallengeNotFoundView({ notice }: { readonly notice: ChallengeNotice }) {
  return (
    <>
      <ChallengeNoticeBox notice={notice} />
      <p>
        <Link className="secondary-action" to="/challenge">
          Về danh sách thử thách
        </Link>
      </p>
    </>
  );
}

// ------------------------------------------------------------------ detail

export function ChallengeBriefPanel({
  summary,
  presentation,
}: {
  readonly summary: ChallengeSummary;
  readonly presentation: ChallengePresentation;
}) {
  return (
    <>
      <section aria-labelledby="challenge-problem-title">
        <h2 id="challenge-problem-title">Đề bài</h2>
        {presentation.problem.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <p className="challenge-metric">
          <strong>Thang đo:</strong> {metricLabel(summary.metric)}. <strong>{directionLabel(summary.direction)}.</strong>
        </p>
        <ul>
          {presentation.hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="challenge-data-title">
        <h2 id="challenge-data-title">Dữ liệu</h2>
        <ul className="challenge-columns">
          {presentation.columns.map((column) => (
            <li key={column.name}>
              <code>{column.name}</code> — {column.description} <span className="practice-card__meta">({column.where})</span>
            </li>
          ))}
        </ul>
        <h3>Tải về</h3>
        <ul className="challenge-files">
          {presentation.files.map((file) => (
            <li key={file.filename}>
              <a className="secondary-action" href={file.url} download={file.filename}>
                Tải {file.filename}
              </a>{" "}
              <span className="practice-card__meta">{file.description}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="challenge-format-title">
        <h2 id="challenge-format-title">Định dạng bài nộp</h2>
        <p>
          Tệp CSV có đúng hai cột <code>{summary.idColumn}</code> và <code>{summary.targetColumn}</code> (thứ tự tùy ý, tên cột phân biệt hoa thường), mỗi đơn
          trong test.csv đúng một dòng, giá trị dự đoán là số. Tối đa {formatBytes(summary.limits.maxSubmissionBytes)}.
        </p>
        <pre className="challenge-example">{presentation.submissionExample}</pre>
      </section>
    </>
  );
}

export interface ChallengeSubmitPanelProps {
  readonly summary: ChallengeSummary;
  readonly text: string;
  readonly busy: boolean;
  readonly notice: ChallengeNotice | null;
  readonly onTextChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  readonly onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  readonly onLoadSample: () => void;
  readonly onSubmit: () => void;
}

export function ChallengeSubmitPanel(props: ChallengeSubmitPanelProps) {
  const { summary, text, busy, notice } = props;
  const canSubmit = !busy && text.trim() !== "";
  return (
    <section className="practice-import challenge-submit" aria-labelledby="challenge-submit-title" aria-busy={busy}>
      <h2 id="challenge-submit-title">Nộp bài</h2>
      <p>
        Chọn một tệp .csv (tối đa {formatBytes(summary.limits.maxSubmissionBytes)}) hoặc soạn trực tiếp ở ô bên dưới. Ô này chỉ để nhập CSV, không chạy
        Python.
      </p>
      <div className="practice-import__file">
        <label className="practice-import__label" htmlFor="challenge-file">
          Tải lên tệp CSV
        </label>
        <input id="challenge-file" type="file" accept=".csv,text/csv" onChange={props.onFileChange} disabled={busy} />
      </div>
      <label className="practice-import__label" htmlFor="challenge-editor">
        Nội dung bài nộp (CSV)
      </label>
      <textarea
        id="challenge-editor"
        className="practice-import__textarea challenge-submit__textarea"
        value={text}
        onChange={props.onTextChange}
        spellCheck={false}
        rows={12}
        placeholder={`${summary.idColumn},${summary.targetColumn}`}
        aria-describedby="challenge-editor-help"
        disabled={busy}
      />
      <p id="challenge-editor-help" className="practice-card__meta">
        Dòng đầu là tiêu đề cột. Dùng nút “Nạp bài nộp mẫu” để bắt đầu từ tệp mẫu rồi sửa các giá trị.
      </p>
      <div className="practice-import__actions">
        <button type="button" className="secondary-action" onClick={props.onLoadSample} disabled={busy}>
          Nạp bài nộp mẫu
        </button>
        <button type="button" className="primary-action" onClick={props.onSubmit} disabled={!canSubmit}>
          {busy ? "Đang chấm..." : "Nộp bài"}
        </button>
      </div>
      <div aria-live="polite" className="challenge-submit__result">
        {notice !== null ? <ChallengeNoticeBox notice={notice} /> : null}
      </div>
    </section>
  );
}

export function ChallengeHistoryPanel({
  summary,
  state,
}: {
  readonly summary: ChallengeSummary;
  readonly state: Loadable<ChallengeHistory>;
}) {
  return (
    <section aria-labelledby="challenge-history-title" className="challenge-history">
      <h2 id="challenge-history-title">Điểm của bạn</h2>
      {state.status === "loading" ? (
        <p role="status" aria-live="polite">
          Đang đọc lịch sử nộp bài...
        </p>
      ) : state.status === "error" ? (
        <ChallengeNoticeBox notice={describeReadError(state.error)} />
      ) : (
        <HistoryBody summary={summary} history={state.value} />
      )}
    </section>
  );
}

function HistoryBody({ summary, history }: { readonly summary: ChallengeSummary; readonly history: ChallengeHistory }) {
  const rows = buildHistoryRows(history);
  const best = rows.find((row) => row.isBest);
  return (
    <>
      <p className="challenge-best">
        {best === undefined ? (
          <>Chưa có bài nộp nào, nên chưa có điểm tốt nhất.</>
        ) : (
          <>
            Điểm tốt nhất: <strong>{best.scoreText}</strong> ({best.metric}, {directionLabel(summary.direction).toLowerCase()}) — {best.submittedAt}
          </>
        )}
      </p>
      <p className="practice-card__meta">
        Chỉ tính các bài nộp của phiên bản {summary.version} của thử thách. Với MAE, điểm thấp hơn là tốt hơn.
      </p>
      {rows.length === 0 ? null : (
        <>
          <h3>Lịch sử nộp bài ({rows.length})</h3>
          <ol className="challenge-history__list">
            {rows.map((row) => (
              <li key={row.id} className={row.isBest ? "challenge-history__row challenge-history__row--best" : "challenge-history__row"}>
                <span className="challenge-history__score">
                  {row.metric} {row.scoreText}
                </span>
                {row.isBest ? <span className="progress-pill progress-pill--complete">Tốt nhất</span> : null}
                <span className="practice-card__meta">
                  {row.submittedAt} · {row.rowCount} dòng
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}
