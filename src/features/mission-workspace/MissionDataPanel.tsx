import type { JsonObject, JsonValue } from "../../core/domain";

import { MissionValuePreview } from "./MissionValuePreview";

export type MissionPreviewData = JsonValue;

export interface MissionDataPanelProps {
  readonly data: MissionPreviewData;
}

export function MissionDataPanel({ data }: MissionDataPanelProps) {
  const entries = getTopLevelEntries(data);

  return (
    <section className="mission-panel" aria-labelledby="mission-data-title">
      <h2 id="mission-data-title">Dữ liệu đầu vào</h2>
      <p className="mission-panel__secondary mission-panel__hint">
        Các biến dưới đây đã được nạp sẵn và có thể dùng trực tiếp trong mã Python.
      </p>

      {entries.length > 0 ? (
        <div className="mission-data-list">
          {entries.map(([name, value]) => (
            <section className="mission-data-entry" key={name}>
              <h3 className="mission-data-entry__name">{name}</h3>
              <MissionValuePreview className="mission-data-preview" value={value} />
            </section>
          ))}
        </div>
      ) : (
        <MissionValuePreview className="mission-data-preview" value={data} />
      )}
    </section>
  );
}

function getTopLevelEntries(data: MissionPreviewData): readonly [string, JsonValue][] {
  if (!isJsonObject(data)) {
    return [];
  }

  return Object.entries(data);
}

function isJsonObject(value: MissionPreviewData): value is JsonObject {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}
