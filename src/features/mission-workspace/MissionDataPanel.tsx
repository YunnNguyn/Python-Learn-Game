export type MissionPreviewData =
  | null
  | boolean
  | number
  | string
  | readonly MissionPreviewData[]
  | { readonly [key: string]: MissionPreviewData };

export interface MissionDataPanelProps {
  readonly data: MissionPreviewData;
}

export function MissionDataPanel({ data }: MissionDataPanelProps) {
  return (
    <section className="mission-panel" aria-labelledby="mission-data-title">
      <h2 id="mission-data-title">Dữ liệu</h2>
      <pre className="mission-data-preview">{JSON.stringify(data, null, 2)}</pre>
    </section>
  );
}
