import { useId } from "react";

import type { GraderResult } from "../../../core/grading";
import {
  toGradingFeedbackModel,
  type GradingFeedbackItem,
} from "./grading-feedback-model";

export interface GradingFeedbackProps {
  readonly result: GraderResult;
}

export function GradingFeedback({ result }: GradingFeedbackProps) {
  const headingId = useId();
  const feedback = toGradingFeedbackModel(result);

  return (
    <section
      className={`grading-feedback grading-feedback--${
        feedback.passed ? "passed" : "failed"
      }`}
      aria-labelledby={headingId}
      aria-live="polite"
    >
      <p className="grading-feedback__status">
        {feedback.passed ? "Đạt" : "Cần chỉnh sửa"}
      </p>
      <h3 id={headingId}>{feedback.summary}</h3>

      {feedback.items.length > 0 ? (
        <ol className="grading-feedback__items">
          {feedback.items.map((item, index) => (
            <li
              className="grading-feedback__item"
              key={`${index}-${item.kind}`}
            >
              <FeedbackItem item={item} />
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function FeedbackItem({ item }: { readonly item: GradingFeedbackItem }) {
  return (
    <>
      <h4>{item.title}</h4>
      {item.detail ? (
        <p className="grading-feedback__detail">{item.detail}</p>
      ) : null}
      {item.cases !== undefined && item.cases.length > 0 ? (
        <ul className="grading-feedback__cases">
          {item.cases.map((entry, index) => (
            <li
              key={`${index}-${entry.label}`}
              className={`grading-feedback__case grading-feedback__case--${
                entry.passed ? "passed" : "failed"
              }`}
            >
              <span aria-hidden="true">{entry.passed ? "✓" : "✗"}</span>
              <span className="visually-hidden">{entry.passed ? "Đạt: " : "Chưa đạt: "}</span>
              {entry.label}
            </li>
          ))}
        </ul>
      ) : null}
      {item.expected !== undefined || item.actual !== undefined ? (
        <dl className="grading-feedback__metadata">
          {item.expected !== undefined ? (
            <div>
              <dt>Cần</dt>
              <dd>
                <code>{item.expected}</code>
              </dd>
            </div>
          ) : null}
          {item.actual !== undefined ? (
            <div>
              <dt>Hiện tại</dt>
              <dd>
                <code>{item.actual}</code>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </>
  );
}
