export interface MissionControlsProps {
  readonly runDisabled?: boolean;
  readonly submitDisabled?: boolean;
  readonly stopVisible?: boolean;
  readonly stopDisabled?: boolean;
  readonly stopPending?: boolean;
  readonly onRun?: () => void;
  readonly onSubmit?: () => void;
  readonly onStop?: () => void;
  readonly note?: string;
}

export function MissionControls({
  runDisabled = false,
  submitDisabled = false,
  stopVisible = false,
  stopDisabled = true,
  stopPending = false,
  onRun,
  onSubmit,
  onStop,
  note = "Chạy thử giữ trạng thái thực nghiệm; Nộp bài luôn chấm trên môi trường sạch.",
}: MissionControlsProps) {
  return (
    <section className="mission-controls" aria-labelledby="mission-actions-title">
      <h2 id="mission-actions-title" className="visually-hidden">
        Thao tác
      </h2>
      <div className="mission-controls__actions">
        <button
          className="mission-action-button"
          type="button"
          disabled={runDisabled}
          onClick={onRun}
          aria-describedby="mission-runtime-note"
          aria-keyshortcuts="Control+Enter Meta+Enter"
        >
          Chạy thử <kbd className="mission-shortcut">Ctrl/⌘ + Enter</kbd>
        </button>
        <button
          className="mission-action-button mission-action-button--submit"
          type="button"
          disabled={submitDisabled}
          onClick={onSubmit}
          aria-describedby="mission-runtime-note"
          aria-keyshortcuts="Control+Shift+Enter Meta+Shift+Enter"
        >
          Nộp bài <kbd className="mission-shortcut">Ctrl/⌘ + Shift + Enter</kbd>
        </button>
        {stopVisible ? (
          <button
            className="mission-action-button mission-action-button--stop"
            type="button"
            disabled={stopDisabled}
            onClick={onStop}
            aria-describedby="mission-runtime-note"
          >
            {stopPending ? "Đang dừng..." : "Dừng tiến trình"}
          </button>
        ) : null}
      </div>
      <p id="mission-runtime-note" className="mission-controls__note">
        {note}
      </p>
    </section>
  );
}
