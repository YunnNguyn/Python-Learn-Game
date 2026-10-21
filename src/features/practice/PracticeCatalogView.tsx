import { Link } from "react-router-dom";

import type {
  PracticeCatalog,
  PracticeExerciseSummary,
  PracticePackDetail,
  PracticePackSummary,
  PracticeReadError,
} from "../../app/services";
import { PracticeNoticeBox } from "./PracticeNoticeBox";
import { practiceExercisePath, practicePackPath } from "./practice-route";
import { describeReadError, difficultyLabel, kindLabel } from "./practice-view-models";

export type Loadable<T> =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly error: PracticeReadError }
  | { readonly status: "ready"; readonly value: T };

export function PracticeCatalogView({ state }: { readonly state: Loadable<PracticeCatalog> }) {
  return (
    <section className="practice-catalog" aria-labelledby="practice-catalog-title">
      <h2 id="practice-catalog-title">Pack đã cài đặt</h2>
      {state.status === "loading" ? (
        <p role="status" aria-live="polite">
          Đang đọc các pack đã cài đặt...
        </p>
      ) : state.status === "error" ? (
        <PracticeNoticeBox notice={describeReadError(state.error)} />
      ) : (
        <CatalogBody catalog={state.value} />
      )}
    </section>
  );
}

function CatalogBody({ catalog }: { readonly catalog: PracticeCatalog }) {
  if (catalog.packs.length === 0 && catalog.corrupt.length === 0 && catalog.unreadableCount === 0) {
    return (
      <p className="practice-empty">
        Chưa có pack nào. Hãy nhập một Exercise Pack ở trên để bắt đầu luyện tập.
      </p>
    );
  }
  return (
    <>
      <div className="learning-list">
        {catalog.packs.map((pack) => (
          <article className="learning-card" key={pack.packId}>
            <div className="learning-card__heading-row">
              <p className="learning-card__meta">{pack.topic}</p>
              <span
                className={
                  pack.progress.completed !== null &&
                  pack.progress.total > 0 &&
                  pack.progress.completed === pack.progress.total
                    ? "progress-pill progress-pill--complete"
                    : "progress-pill"
                }
              >
                {progressText(pack.progress)}
              </span>
            </div>
            <h3>{pack.title}</h3>
            <p>{pack.description}</p>
            <p className="practice-card__meta">
              <code>{pack.packId}</code> · phiên bản {pack.version} · {pack.exerciseCount} bài
            </p>
            <Link className="primary-action primary-action--link" to={practicePackPath(pack.packId)}>
              Mở pack
            </Link>
          </article>
        ))}
      </div>
      {catalog.corrupt.length > 0 ? (
        <PracticeNoticeBox
          notice={{
            tone: "error",
            title: "Có pack bị hỏng trong kho lưu trữ",
            detail: `Không thể mở: ${catalog.corrupt.map((pack) => pack.packId).join(", ")}. Các pack khác vẫn dùng được.`,
          }}
        />
      ) : null}
      {catalog.unreadableCount > 0 ? (
        <PracticeNoticeBox
          notice={{
            tone: "error",
            title: "Có bản ghi không đọc được",
            detail: `${catalog.unreadableCount} bản ghi pack trong kho lưu trữ không đọc được và bị bỏ qua.`,
          }}
        />
      ) : null}
    </>
  );
}

export function PracticePackView({
  packId,
  state,
}: {
  readonly packId: string;
  readonly state: Loadable<PracticePackDetail>;
}) {
  if (state.status === "loading") {
    return (
      <section className="page-card" aria-labelledby="practice-pack-title">
        <p className="eyebrow">Luyện tập</p>
        <h1 id="practice-pack-title">Đang mở pack</h1>
        <p role="status" aria-live="polite">
          Đang đọc pack <code>{packId}</code>...
        </p>
      </section>
    );
  }
  if (state.status === "error") {
    return (
      <section className="page-card" aria-labelledby="practice-pack-title">
        <p className="eyebrow">Luyện tập</p>
        <h1 id="practice-pack-title">Không thể mở pack</h1>
        <PracticeNoticeBox notice={describeReadError(state.error)} />
        <Link className="secondary-action mission-error-back-link" to="/practice">
          Về danh sách pack
        </Link>
      </section>
    );
  }
  const pack = state.value;
  return (
    <section className="page-card practice-page" aria-labelledby="practice-pack-title">
      <div className="mission-heading-row">
        <div>
          <p className="eyebrow">Luyện tập · {pack.topic}</p>
          <h1 id="practice-pack-title">{pack.title}</h1>
        </div>
        <Link className="secondary-action mission-back-link" to="/practice">
          Về danh sách pack
        </Link>
      </div>
      <p className="page-lead">{pack.description}</p>
      <p className="practice-card__meta">
        <code>{pack.packId}</code> · phiên bản {pack.version} · {progressText(pack.progress)}
      </p>
      {pack.learningObjectives.length > 0 ? (
        <section className="mission-panel" aria-labelledby="practice-objectives-title">
          <h2 id="practice-objectives-title">Mục tiêu học</h2>
          <ul>
            {pack.learningObjectives.map((objective) => (
              <li key={objective}>{objective}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {pack.prerequisites.length > 0 ? (
        <section className="mission-panel" aria-labelledby="practice-prereq-title">
          <h2 id="practice-prereq-title">Kiến thức cần có</h2>
          <ul>
            {pack.prerequisites.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="practice-exercises" aria-labelledby="practice-exercises-title">
        <h2 id="practice-exercises-title">Bài tập</h2>
        <ol className="practice-exercises__list">
          {pack.exercises.map((exercise) => (
            <ExerciseRow key={exercise.exerciseId} packId={pack.packId} exercise={exercise} />
          ))}
        </ol>
      </section>
    </section>
  );
}

function ExerciseRow({ packId, exercise }: { readonly packId: string; readonly exercise: PracticeExerciseSummary }) {
  return (
    <li className="review-recommendation">
      <div>
        <strong>{exercise.title}</strong>
        <p>
          <span className="progress-pill">{kindLabel(exercise.kind)}</span>{" "}
          <span className="progress-pill">{difficultyLabel(exercise.difficulty)}</span>{" "}
          <span className={exercise.completed === true ? "progress-pill progress-pill--complete" : "progress-pill"}>
            {exerciseStatusText(exercise)}
          </span>
        </p>
      </div>
      <Link className="secondary-action" to={practiceExercisePath(packId, exercise.exerciseId)}>
        {exercise.attemptCount !== null && exercise.attemptCount > 0 ? "Làm tiếp" : "Bắt đầu"}
      </Link>
    </li>
  );
}

/** Unknown progress is said to be unknown; it is never shown as "0 completed". */
function progressText(progress: PracticePackSummary["progress"]): string {
  return progress.completed === null
    ? "Không đọc được tiến độ"
    : `${progress.completed}/${progress.total} bài hoàn thành`;
}

function exerciseStatusText(exercise: PracticeExerciseSummary): string {
  if (exercise.completed === null || exercise.attemptCount === null) return "Không đọc được tiến độ";
  if (exercise.completed) return "Đã đạt";
  return exercise.attemptCount > 0 ? `Chưa đạt · ${exercise.attemptCount} lần nộp` : "Chưa làm";
}
