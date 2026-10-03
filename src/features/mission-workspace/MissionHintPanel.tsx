import { HintLevel } from "../../core/domain";
import type { RevealedHint } from "../../core/hints";
import { MissionRichText } from "./MissionRichText";

export interface MissionHintPanelProps {
  readonly hints: readonly RevealedHint[];
  readonly remainingCount: number;
  readonly disabled?: boolean;
  readonly onReveal: () => void;
}

export function MissionHintPanel({
  hints,
  remainingCount,
  disabled = false,
  onReveal,
}: MissionHintPanelProps) {
  return (
    <section className="mission-panel mission-hint-panel" aria-labelledby="mission-hint-title">
      <div className="mission-hint-panel__header">
        <div>
          <h2 id="mission-hint-title">Gợi ý</h2>
          <p className="mission-panel__secondary mission-panel__hint">
            Mở dần từ khái niệm đến pseudocode. Gợi ý đã dùng sẽ được ghi vào lần Nộp bài.
          </p>
        </div>
        <button
          className="mission-hint-button"
          type="button"
          disabled={disabled || remainingCount === 0}
          onClick={onReveal}
        >
          {remainingCount > 0 ? `Mở gợi ý tiếp theo (${remainingCount})` : "Đã mở hết gợi ý"}
        </button>
      </div>

      {hints.length > 0 ? (
        <ol className="mission-hint-list">
          {hints.map((hint) => (
            <li className="mission-hint-item" key={hint.level}>
              <p className="mission-hint-item__label">
                {hint.level} · {hintLevelLabel(hint.level)}
              </p>
              <p><MissionRichText text={hint.text} /></p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mission-hint-empty">Chưa dùng gợi ý nào.</p>
      )}
    </section>
  );
}

function hintLevelLabel(level: HintLevel): string {
  switch (level) {
    case HintLevel.H1:
      return "Khái niệm";
    case HintLevel.H2:
      return "Chiến lược";
    case HintLevel.H3:
      return "API / cú pháp";
    case HintLevel.H4:
      return "Pseudocode";
  }
}
