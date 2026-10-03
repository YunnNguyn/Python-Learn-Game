import { useState } from "react";

import { useApplicationServices, useLearningProgress } from "../../app/services";

export function SettingsPage() {
  const services = useApplicationServices();
  const { snapshot } = useLearningProgress();
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClearProgress() {
    const confirmed = window.confirm(
      "Xóa toàn bộ lịch sử Nộp bài và bản nháp đã lưu trên trình duyệt này? Hành động này không thể hoàn tác.",
    );
    if (!confirmed) return;

    setClearing(true);
    setMessage(null);
    try {
      await services.clearLearningData();
      setMessage("Đã xóa tiến độ và bản nháp cục bộ.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <section className="page-card settings-page" aria-labelledby="settings-title">
      <p className="eyebrow">Tùy chọn</p>
      <h1 id="settings-title">Cài đặt</h1>
      <p className="page-lead">
        Tiến độ học được lưu trên chính trình duyệt này. Không cần tài khoản hoặc backend ở phiên bản hiện tại.
      </p>

      <section className="settings-section" aria-labelledby="storage-title">
        <h2 id="storage-title">Dữ liệu học tập cục bộ</h2>
        <dl className="settings-stats">
          <div>
            <dt>Kho lưu trữ</dt>
            <dd>{services.getPersistenceKind() === "indexeddb" ? "IndexedDB" : "Bộ nhớ tạm"}</dd>
          </div>
          <div>
            <dt>Lần nộp đã lưu</dt>
            <dd>{snapshot.attemptCount}</dd>
          </div>
        </dl>
        <p>
          Mỗi lần Nộp bài được giữ như một bản ghi bất biến. Mastery và gợi ý ôn tập được tính lại từ lịch sử này.
        </p>
        <button
          className="danger-action"
          type="button"
          disabled={clearing}
          onClick={() => void handleClearProgress()}
        >
          {clearing ? "Đang xóa..." : "Xóa tiến độ cục bộ"}
        </button>
        {message ? <p className="settings-message" aria-live="polite">{message}</p> : null}
      </section>
    </section>
  );
}
