import { PracticeIssuesList } from "./PracticeIssuesList";
import {
  difficultyLabel,
  formatBytes,
  kindLabel,
  type PackPreview,
} from "./practice-view-models";

/** The review step before installation: what the pack contains and what running it means. */
export function PracticePackPreview({ preview }: { readonly preview: PackPreview }) {
  return (
    <section className="practice-preview" aria-label="Xem lại pack trước khi cài đặt">
      <h3>{preview.title}</h3>
      <p className="practice-preview__meta">
        <code>{preview.packId}</code> · phiên bản {preview.version} · chủ đề {preview.topic}
        {preview.author !== undefined ? ` · tác giả ${preview.author}` : ""}
      </p>
      <p>{preview.description}</p>
      <ul className="practice-preview__facts">
        <li>{preview.exercises.length} bài tập</li>
        <li>
          Thư viện Python:{" "}
          {preview.packages.length > 0 ? preview.packages.join(", ") : "chỉ thư viện chuẩn của Python"}
        </li>
        <li>
          {preview.datasetCount > 0
            ? `${preview.datasetCount} file dữ liệu (${formatBytes(preview.datasetBytes)})`
            : "Không có file dữ liệu"}
        </li>
      </ul>
      <ol className="practice-preview__exercises">
        {preview.exercises.map((exercise) => (
          <li key={exercise.id}>
            <strong>{exercise.title}</strong>{" "}
            <span className="progress-pill">{kindLabel(exercise.kind)}</span>{" "}
            <span className="progress-pill">{difficultyLabel(exercise.difficulty)}</span>
          </li>
        ))}
      </ol>
      <PracticeIssuesList issues={preview.warnings} heading="Lưu ý" />
      <p className="practice-security-note" role="note">
        Pack được nhập từ máy của bạn và chỉ chứa dữ liệu, không tự chạy gì khi cài đặt. Mã Python trong pack chỉ chạy
        khi bạn bấm Chạy thử hoặc Nộp bài, bên trong trình duyệt này, cùng nguồn (origin) với ứng dụng và không phải
        là sandbox bảo mật hoàn chỉnh. Chỉ cài pack do chính bạn tạo hoặc bạn tin tưởng, và hãy đọc mã khởi đầu trước
        khi chạy.
      </p>
    </section>
  );
}
