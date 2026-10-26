import { useState } from "react";

import {
  useApplicationServices,
  useLearningProgress,
  useMetaProgression,
} from "../../app/services";

export function SettingsPage() {
  const services = useApplicationServices();
  const { snapshot } = useLearningProgress();
  const { snapshot: metaSnapshot } = useMetaProgression();
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleClearProgress() {
    const confirmed = window.confirm(
      "Xóa toàn bộ lịch sử Nộp bài, bản nháp, vật liệu và tiến độ Xưởng robot trên trình duyệt này? Hành động này không thể hoàn tác.",
    );
    if (!confirmed) return;

    setClearing(true);
    setMessage(null);
    try {
      await services.clearLearningData();
      setMessage("Đã xóa toàn bộ dữ liệu học tập và phần thưởng cục bộ.");
    } catch (error) {
      // Observed (never an unhandled rejection), e.g. storage failure or a
      // retiring service set (PHASE-04C.3D.5).
      console.error("Clearing local learning data failed.", error);
      setMessage("Không thể xóa dữ liệu học tập lúc này. Hãy tải lại trang rồi thử lại.");
    } finally {
      setClearing(false);
    }
  }

  return (
    <section className="page-card settings-page" aria-labelledby="settings-title">
      <p className="eyebrow">Tùy chọn</p>
      <h1 id="settings-title">Cài đặt</h1>
      <p className="page-lead">
        Tiến độ học và meta progression được lưu trên chính trình duyệt này. Không cần tài khoản hoặc backend ở phiên bản hiện tại.
      </p>

      <section className="settings-section" aria-labelledby="storage-title">
        <h2 id="storage-title">Dữ liệu cục bộ</h2>
        <dl className="settings-stats">
          <div>
            <dt>Kho học tập</dt>
            <dd>{services.getPersistenceKind() === "indexeddb" ? "IndexedDB" : "Bộ nhớ tạm"}</dd>
          </div>
          <div>
            <dt>Kho phần thưởng</dt>
            <dd>
              {services.getMetaProgressionPersistenceKind() === "indexeddb"
                ? "IndexedDB"
                : "Bộ nhớ tạm"}
            </dd>
          </div>
          <div>
            <dt>Lần nộp đã lưu</dt>
            <dd>{snapshot.attemptCount}</dd>
          </div>
          <div>
            <dt>Bộ phận robot đã chế tạo</dt>
            <dd>{metaSnapshot.builtRobotPartIds.length}</dd>
          </div>
        </dl>
        <p>
          AttemptRecord vẫn là bằng chứng học tập gốc. Phần thưởng được suy ra và lưu riêng,
          nên Robot Workshop không tham gia vào chấm bài hoặc mastery.
        </p>
        <button
          className="danger-action"
          type="button"
          disabled={clearing}
          onClick={() => void handleClearProgress()}
        >
          {clearing ? "Đang xóa..." : "Xóa toàn bộ dữ liệu cục bộ"}
        </button>
        {message ? <p className="settings-message" aria-live="polite">{message}</p> : null}
      </section>
    </section>
  );
}
