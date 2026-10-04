import {
  RUNTIME_EXECUTION_STATUS,
  type RuntimeExecutionResult,
} from "../../core/runtime";

export interface MissionOutputPanelProps {
  readonly execution: RuntimeExecutionResult;
}

export function MissionOutputPanel({ execution }: MissionOutputPanelProps) {
  const status = execution.status;
  const stdout = execution.stdout;
  const stderr = execution.stderr;
  const errorInsight = getExecutionInsight(execution);

  return (
    <section className="mission-results" aria-label="Kết quả chạy">
      <div className="mission-result-panel">
        <h2>Kết quả thực thi</h2>
        <p className="mission-result-status">Trạng thái: {statusLabel(status)}</p>

        <h3>stdout</h3>
        <pre className="mission-result-panel__content">{stdout.length > 0 ? stdout : "(trống)"}</pre>

        <h3>stderr</h3>
        <pre className="mission-result-panel__content">{stderr.length > 0 ? stderr : "(trống)"}</pre>
      </div>

      <div className="mission-result-panel mission-result-panel--error">
        <h2>Lỗi</h2>
        {errorInsight ? (
          <div className="mission-error-block">
            <div className="mission-error-summary">
              <p className="mission-error-summary__title">{errorInsight.title}</p>
              {errorInsight.summary ? <p className="mission-error-summary__body">{errorInsight.summary}</p> : null}
              <div className="mission-error-meta">
                {errorInsight.lineNumber !== null ? (
                  <span className="mission-error-chip">Dòng nghi lỗi: {errorInsight.lineNumber}</span>
                ) : null}
                {errorInsight.exceptionType ? (
                  <span className="mission-error-chip">Loại lỗi: {errorInsight.exceptionType}</span>
                ) : null}
              </div>
            </div>

            {errorInsight.raw ? (
              <details className="mission-error-details">
                <summary>Xem traceback / chi tiết đầy đủ</summary>
                <pre className="mission-result-panel__content mission-result-panel__content--error">
                  {errorInsight.raw}
                </pre>
              </details>
            ) : null}
          </div>
        ) : (
          <pre className="mission-result-panel__content mission-result-panel__content--error">
            Không có lỗi.
          </pre>
        )}
      </div>
    </section>
  );
}

interface ExecutionInsight {
  readonly title: string;
  readonly summary: string | null;
  readonly lineNumber: number | null;
  readonly exceptionType: string | null;
  readonly raw: string | null;
}

function getExecutionInsight(execution: RuntimeExecutionResult): ExecutionInsight | null {
  switch (execution.status) {
    case RUNTIME_EXECUTION_STATUS.SUCCESS:
      return null;
    case RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION: {
      const type = execution.exception.type?.trim() || "PythonError";
      const raw = execution.exception.traceback?.trim() || execution.exception.message?.trim() || "";
      return {
        title: "Mã Python gặp lỗi khi chạy.",
        summary: extractTerminalExceptionMessage(raw || execution.exception.message, type),
        lineNumber: extractPythonLineNumber(raw || execution.exception.message),
        exceptionType: type,
        raw: raw || execution.exception.message || null,
      };
    }
    case RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR:
      return {
        title: "Môi trường chạy gặp sự cố.",
        summary: execution.error.message,
        lineNumber: null,
        exceptionType: execution.error.code ?? null,
        raw: execution.error.message,
      };
    case RUNTIME_EXECUTION_STATUS.TIMEOUT:
      return {
        title: "Mã chạy quá thời gian cho phép.",
        summary: execution.error?.message ?? "Hãy kiểm tra vòng lặp, điều kiện dừng hoặc phép tính quá lớn.",
        lineNumber: null,
        exceptionType: execution.error?.code ?? null,
        raw: execution.error?.message ?? null,
      };
    default:
      return null;
  }
}

function extractPythonLineNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const matches = [...raw.matchAll(/line\s+(\d+)/gi)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]?.[1];
  const parsed = last ? Number.parseInt(last, 10) : Number.NaN;
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function extractTerminalExceptionMessage(message: string | undefined, type: string): string | null {
  if (!message) return null;
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const prefix = `${type}:`;
  const terminal = [...lines].reverse().find((line) => line.startsWith(prefix));
  if (terminal) return terminal.slice(prefix.length).trim();
  return lines.length > 0 ? lines[lines.length - 1] ?? null : null;
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
