import { RUNTIME_EXECUTION_STATUS } from "../../core/runtime";

export interface MissionOutputPanelProps {
  readonly status?: string | null;
  readonly stdout?: string | null;
  readonly stderr?: string | null;
  readonly error?: string | null;
}

export function MissionOutputPanel({
  status = null,
  stdout = null,
  stderr = null,
  error = null,
}: MissionOutputPanelProps) {
  return (
    <section className="mission-results" aria-label="Kết quả chạy">
      <div className="mission-result-panel">
        <h2>Kết quả thực thi</h2>
        {status ? (
          <p className="mission-result-status">Trạng thái: {statusLabel(status)}</p>
        ) : null}
        <h3>stdout</h3>
        <pre className="mission-result-panel__content">
          {stdout && stdout.length > 0 ? stdout : "(trống)"}
        </pre>
        <h3>stderr</h3>
        <pre className="mission-result-panel__content">
          {stderr && stderr.length > 0 ? stderr : "(trống)"}
        </pre>
      </div>
      <div className="mission-result-panel mission-result-panel--error">
        <h2>Lỗi</h2>
        <pre className="mission-result-panel__content mission-result-panel__content--error">
          {error ?? "Không có lỗi."}
        </pre>
      </div>
    </section>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case RUNTIME_EXECUTION_STATUS.SUCCESS:
      return "Thành công";
    case RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION:
      return "Lỗi Python";
    case RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR:
      return "Lỗi môi trường chạy";
    case RUNTIME_EXECUTION_STATUS.TIMEOUT:
      return "Quá thời gian";
    default:
      return status;
  }
}
