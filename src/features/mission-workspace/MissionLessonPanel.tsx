import type { MissionLessonGuide } from "./mission-lesson-guides";

export interface MissionLessonPanelProps {
  readonly guide: MissionLessonGuide | null;
}

export function MissionLessonPanel({ guide }: MissionLessonPanelProps) {
  if (!guide) {
    return (
      <section className="mission-panel mission-lesson-panel" aria-labelledby="mission-lesson-title">
        <h2 id="mission-lesson-title">Bài học nhanh</h2>
        <p className="mission-panel__secondary">
          Bài này chưa có thẻ hướng dẫn riêng. Hãy đọc phần đề bài và dữ liệu để tự triển khai lời giải.
        </p>
      </section>
    );
  }

  return (
    <section className="mission-panel mission-lesson-panel" aria-labelledby="mission-lesson-title">
      <h2 id="mission-lesson-title">{guide.title}</h2>
      <p className="mission-summary">{guide.summary}</p>

      <div className="mission-lesson-panel__library">
        <span className="mission-panel__subheading">Thư viện / công cụ chính</span>
        <p>
          <strong>{guide.library}</strong>
        </p>
        <div className="mission-method-list">
          {guide.methods.map((method) => (
            <code className="mission-inline-code" key={method}>
              {method}
            </code>
          ))}
        </div>
      </div>

      {guide.newTopics.length > 0 ? (
        <section className="mission-lesson-section" aria-labelledby="mission-lesson-new-topics-title">
          <h3 id="mission-lesson-new-topics-title" className="mission-panel__subheading">
            Cú pháp / ý tưởng mới trong bài này
          </h3>
          <div className="mission-lesson-grid">
            {guide.newTopics.map((topic) => (
              <article className="mission-lesson-card" key={topic.label}>
                <h4>{topic.label}</h4>
                <p>{topic.explanation}</p>
                {topic.syntax ? <pre className="mission-code-sample">{topic.syntax}</pre> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {guide.reviewTopics && guide.reviewTopics.length > 0 ? (
        <section className="mission-lesson-section" aria-labelledby="mission-lesson-review-topics-title">
          <h3 id="mission-lesson-review-topics-title" className="mission-panel__subheading">
            Phần ôn lại (đã học trước đó)
          </h3>
          <div className="mission-lesson-grid">
            {guide.reviewTopics.map((topic) => (
              <article className="mission-lesson-card mission-lesson-card--review" key={topic.label}>
                <h4>{topic.label}</h4>
                <p>{topic.explanation}</p>
                {topic.syntax ? <pre className="mission-code-sample">{topic.syntax}</pre> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mission-lesson-section" aria-labelledby="mission-lesson-workflow-title">
        <h3 id="mission-lesson-workflow-title" className="mission-panel__subheading">
          Cách làm gợi ý
        </h3>
        <ol className="mission-instruction-list">
          {guide.workflow.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      {guide.commonMistakes && guide.commonMistakes.length > 0 ? (
        <section className="mission-lesson-section" aria-labelledby="mission-lesson-mistakes-title">
          <h3 id="mission-lesson-mistakes-title" className="mission-panel__subheading">
            Lỗi hay gặp
          </h3>
          <ul className="mission-bullet-list">
            {guide.commonMistakes.map((mistake) => (
              <li key={mistake}>{mistake}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
