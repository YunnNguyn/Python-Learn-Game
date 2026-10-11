import {
  AttemptProvenanceUnreadableError,
  PersistenceUpgradeBlockedError,
  PersistenceUpgradeFailureReason,
} from "../core/persistence";

function describeStartupFailure(error: unknown): { readonly summary: string; readonly action: string } {
  if (error instanceof PersistenceUpgradeBlockedError) {
    if (error.reason === PersistenceUpgradeFailureReason.BLOCKED) {
      return {
        summary: "Dữ liệu học tập cần được nâng cấp nhưng đang bị một tab khác của ứng dụng giữ.",
        action: "Hãy đóng các tab khác của ứng dụng này rồi tải lại trang. Dữ liệu của bạn vẫn được giữ nguyên.",
      };
    }
    return {
      summary: "Dữ liệu trên trình duyệt này được tạo bởi một phiên bản ứng dụng mới hơn.",
      action: "Hãy tải lại trang để dùng phiên bản mới nhất. Dữ liệu của bạn vẫn được giữ nguyên.",
    };
  }
  if (error instanceof AttemptProvenanceUnreadableError) {
    return {
      summary: "Không đọc được nguồn gốc các lần nộp bài, nên chưa thể tính phần thưởng một cách an toàn.",
      action: "Dữ liệu của bạn không bị xóa. Hãy tải lại trang; nếu lỗi lặp lại, hãy báo lỗi.",
    };
  }
  return {
    summary: "Không khởi tạo được dữ liệu học tập cục bộ.",
    action: "Hãy tải lại trang để thử lại.",
  };
}

/**
 * Shown instead of the page content when startup failed. A failed service set is
 * never retried in place; reloading builds a fresh one.
 */
export function StartupFailurePanel({ error }: { readonly error: unknown }) {
  const { summary, action } = describeStartupFailure(error);
  return (
    <div className="app-error" role="alert">
      <div className="app-error__panel">
        <p className="eyebrow">Không thể khởi động</p>
        <h1>Ứng dụng chưa mở được dữ liệu học tập.</h1>
        <p>{summary}</p>
        <p>{action}</p>
        <button className="primary-action" type="button" onClick={() => window.location.reload()}>
          Tải lại trang
        </button>
      </div>
    </div>
  );
}
