import { useParams } from "react-router-dom";

export function MissionWorkspacePage() {
  const { missionId } = useParams();
  const routeId = missionId?.trim();

  return (
    <section className="page-card" aria-labelledby="mission-title">
      <p className="eyebrow">Thực hành</p>
      <h1 id="mission-title">Không gian thực hành</h1>
      <p className="page-lead">
        {routeId
          ? "Trình soạn thảo và môi trường chạy Python sẽ được bổ sung ở các bước tiếp theo."
          : "Không xác định được bài thực hành cần mở."}
      </p>
    </section>
  );
}
