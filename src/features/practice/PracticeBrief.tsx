import { Link } from "react-router-dom";

import type { PracticeExerciseDetail } from "../../app/services";
import { MissionRichText } from "../mission-workspace/MissionRichText";
import { practiceExercisePath, practicePackPath } from "./practice-route";
import { difficultyLabel, kindLabel } from "./practice-view-models";

/** Splits authored text into paragraphs; every line is rendered as plain text. */
function Paragraphs({ text }: { readonly text: string }) {
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter((part) => part.length > 0);
  return (
    <>
      {paragraphs.map((paragraph, index) => (
        <p key={`${index}:${paragraph.slice(0, 24)}`}>
          <MissionRichText text={paragraph} />
        </p>
      ))}
    </>
  );
}

/** The "Đề bài" tab of a practice exercise. */
export function PracticeBriefPanel({ detail }: { readonly detail: PracticeExerciseDetail }) {
  return (
    <section className="mission-panel practice-brief" aria-labelledby="practice-brief-title">
      <h2 id="practice-brief-title">{detail.title}</h2>
      <p className="practice-card__meta">
        <span className="progress-pill">{kindLabel(detail.kind)}</span>{" "}
        <span className="progress-pill">{difficultyLabel(detail.difficulty)}</span>{" "}
        <span className="progress-pill">Pack: {detail.packTitle}</span>
      </p>
      {detail.symptom !== undefined ? (
        <div className="practice-brief__symptom">
          <h3>Triệu chứng</h3>
          <Paragraphs text={detail.symptom} />
        </div>
      ) : null}
      <Paragraphs text={detail.instructions} />
      {detail.datasets.length > 0 ? (
        <>
          <h3>File dữ liệu</h3>
          <ul>
            {detail.datasets.map((dataset) => (
              <li key={dataset.filename}>
                <code>{dataset.filename}</code>
                {dataset.description !== undefined ? ` - ${dataset.description}` : ""}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="practice-security-note" role="note">
        Bài này đến từ pack bạn đã nhập. Hãy đọc mã khởi đầu trước khi bấm Chạy thử hoặc Nộp bài: mã Python chạy trong
        trình duyệt này và không phải là sandbox bảo mật hoàn chỉnh.
      </p>
    </section>
  );
}

/** Shown under the attempt summary after a Submit. */
export function PracticeOutcomePanel({
  detail,
  attempt,
}: {
  readonly detail: PracticeExerciseDetail;
  readonly attempt: { readonly passed: boolean };
}) {
  const feedback = attempt.passed ? detail.feedback.onPass : detail.feedback.onFail;
  return (
    <section className="practice-outcome" aria-label="Kết quả luyện tập">
      {feedback !== undefined ? <Paragraphs text={feedback} /> : null}
      {attempt.passed ? (
        <>
          {detail.explanation !== undefined ? (
            <div className="practice-outcome__block">
              <h3>Giải thích</h3>
              <Paragraphs text={detail.explanation} />
            </div>
          ) : null}
          {detail.referenceSolution !== undefined ? (
            <details className="practice-outcome__block">
              <summary>Xem lời giải tham khảo của tác giả pack</summary>
              <pre className="mission-code-sample">{detail.referenceSolution}</pre>
              <p className="mission-panel__secondary">Đây chỉ là văn bản để đọc; ứng dụng không chạy lời giải này.</p>
            </details>
          ) : null}
          <div className="practice-outcome__nav">
            {detail.nextExerciseId !== null ? (
              <Link className="primary-action primary-action--link" to={practiceExercisePath(detail.packId, detail.nextExerciseId)}>
                Bài tiếp theo
              </Link>
            ) : null}
            <Link className="secondary-action" to={practicePackPath(detail.packId)}>
              Về danh sách bài của pack
            </Link>
          </div>
        </>
      ) : null}
    </section>
  );
}
