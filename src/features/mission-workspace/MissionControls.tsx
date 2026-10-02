export interface MissionControlsProps {
  readonly runDisabled?: boolean;
  readonly submitDisabled?: boolean;
  readonly onRun?: () => void;
  readonly onSubmit?: () => void;
}

export function MissionControls({
  runDisabled = false,
  submitDisabled = false,
  onRun,
  onSubmit,
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
        >
          Chạy thử
        </button>
        <button
          className="mission-action-button mission-action-button--submit"
          type="button"
          disabled={submitDisabled}
          onClick={onSubmit}
          aria-describedby="mission-runtime-note"
        >
          Nộp bài
        </button>
      </div>
      <p id="mission-runtime-note" className="mission-controls__note">
        Trình chạy Python sẽ được kết nối ở bước tiếp theo.
      </p>
    </section>
  );
}
