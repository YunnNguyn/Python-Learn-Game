import { useState } from "react";
import { useParams } from "react-router-dom";

import { MissionControls } from "./MissionControls";
import { MissionDataPanel, type MissionPreviewData } from "./MissionDataPanel";
import { MissionObjectivePanel } from "./MissionObjectivePanel";
import { MissionOutputPanel } from "./MissionOutputPanel";
import { PythonEditor } from "./PythonEditor";

const DEFAULT_EDITOR_TEXT = "# Viết mã Python tại đây\n";
const PREVIEW_OBJECTIVE =
  "Hoàn thành yêu cầu của bài thực hành bằng mã Python.";
const PREVIEW_CONTEXT =
  "Nội dung minh họa tạm thời để kiểm tra bố cục không gian thực hành.";
const PREVIEW_SETUP_DATA: MissionPreviewData = {
  note: "Dữ liệu bài tập sẽ được kết nối ở bước tích hợp mission.",
  sample: [2, 4, 8],
};

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
          ? "Đọc yêu cầu, xem dữ liệu và soạn thảo mã Python trong cùng một không gian."
          : "Không xác định được bài thực hành cần mở."}
      </p>
      {routeId ? (
        <>
          <div className="mission-workspace__main">
            <div className="mission-workspace__info">
              <MissionObjectivePanel
                objective={PREVIEW_OBJECTIVE}
                context={PREVIEW_CONTEXT}
              />
              <MissionDataPanel data={PREVIEW_SETUP_DATA} />
            </div>

            <section
              className="mission-editor-region"
              aria-labelledby="mission-editor-title"
            >
              <h2 id="mission-editor-title">Trình soạn thảo</h2>
              <PythonEditor value={code} onChange={setCode} />
            </section>
          </div>

          <MissionControls runDisabled submitDisabled />
          <MissionOutputPanel />
        </>
      ) : null}
    </section>
  );
}
