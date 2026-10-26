import type { PracticeNotice } from "./practice-view-models";

export function PracticeNoticeBox({ notice }: { readonly notice: PracticeNotice }) {
  return (
    <div
      className={`practice-notice practice-notice--${notice.tone}`}
      role={notice.tone === "error" ? "alert" : "status"}
    >
      <strong>{notice.title}</strong>
      <p>{notice.detail}</p>
    </div>
  );
}
