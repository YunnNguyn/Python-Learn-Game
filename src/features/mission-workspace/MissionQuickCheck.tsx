import { useEffect, useState } from "react";

import type { MissionQuickCheckDefinition } from "./mission-lesson-guides";

export interface MissionQuickCheckProps {
  readonly definition: MissionQuickCheckDefinition | null;
  readonly activityId: string;
}

export function MissionQuickCheck({ definition, activityId }: MissionQuickCheckProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setSelected(null);
    setChecked(false);
  }, [activityId]);

  if (!definition) return null;

  const correct = checked && selected === definition.correctOptionIndex;

  return (
    <section className="mission-panel mission-quick-check" aria-labelledby="mission-quick-check-title">
      <p className="learning-card__meta">Tự kiểm tra trước khi làm</p>
      <h2 id="mission-quick-check-title">Bạn đã nắm ý chính chưa?</h2>
      <p className="mission-summary">{definition.question}</p>

      <div className="mission-quick-check__options" role="radiogroup" aria-label={definition.question}>
        {definition.options.map((option, index) => (
          <label
            className={`mission-quick-check__option ${
              checked && index === definition.correctOptionIndex
                ? "mission-quick-check__option--correct"
                : checked && selected === index
                  ? "mission-quick-check__option--wrong"
                  : ""
            }`}
            key={option}
          >
            <input
              type="radio"
              name={`quick-check-${activityId}`}
              value={index}
              checked={selected === index}
              disabled={checked}
              onChange={() => setSelected(index)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>

      {!checked ? (
        <button
          className="secondary-action secondary-action--button"
          type="button"
          disabled={selected === null}
          onClick={() => setChecked(true)}
        >
          Kiểm tra đáp án
        </button>
      ) : (
        <div className={`mission-quick-check__feedback ${correct ? "is-correct" : "is-wrong"}`} aria-live="polite">
          <strong>{correct ? "Đúng rồi." : "Chưa đúng."}</strong>
          <p>{definition.explanation}</p>
          {!correct ? (
            <button
              className="secondary-action secondary-action--button"
              type="button"
              onClick={() => {
                setSelected(null);
                setChecked(false);
              }}
            >
              Thử lại
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
