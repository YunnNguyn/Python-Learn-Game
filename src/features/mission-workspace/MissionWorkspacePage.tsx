import { useState } from "react";
import { useParams } from "react-router-dom";

import { PythonEditor } from "./PythonEditor";

const DEFAULT_EDITOR_TEXT = "# Viết mã Python tại đây\n";

export function MissionWorkspacePage() {
  const { missionId } = useParams();
  const routeId = missionId?.trim();
  const [code, setCode] = useState(DEFAULT_EDITOR_TEXT);

  return (
    <section className="page-card mission-workspace" aria-labelledby="mission-title">
      <p className="eyebrow">Thực hành</p>
      <h1 id="mission-title">Không gian thực hành</h1>
      <p className="page-lead">
        {routeId
          ? "Soạn thảo mã Python trực tiếp trong không gian thực hành."
          : "Không xác định được bài thực hành cần mở."}
      </p>
      {routeId ? <PythonEditor value={code} onChange={setCode} /> : null}
    </section>
  );
}
