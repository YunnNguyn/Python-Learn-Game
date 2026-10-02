export interface MissionOutputPanelProps {
  readonly output?: string | null;
  readonly error?: string | null;
}

export function MissionOutputPanel({
  output = null,
  error = null,
}: MissionOutputPanelProps) {
  return (
    <section className="mission-results" aria-label="Kết quả chạy">
      <div className="mission-result-panel">
        <h2>Kết quả</h2>
        <pre className="mission-result-panel__content">
          {output ?? "Chưa có kết quả chạy."}
        </pre>
      </div>
      <div className="mission-result-panel mission-result-panel--error">
        <h2>Lỗi</h2>
        <pre className="mission-result-panel__content">
          {error ?? "Không có lỗi."}
        </pre>
      </div>
    </section>
  );
}
