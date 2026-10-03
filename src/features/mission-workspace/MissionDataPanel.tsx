import type { JsonValue } from "../../core/domain";

export type MissionPreviewData = JsonValue;

export interface MissionDataPanelProps {
  readonly data: MissionPreviewData;
}

export function MissionDataPanel({ data }: MissionDataPanelProps) {
  return (
    <section className="mission-panel" aria-labelledby="mission-data-title">
      <h2 id="mission-data-title">Dữ liệu đầu vào</h2>
      <pre className="mission-data-preview">{JSON.stringify(data, null, 2)}</pre>
    </section>
  );
}
