export interface MissionObjectivePanelProps {
  readonly objective: string;
  readonly context?: string;
}

export function MissionObjectivePanel({
  objective,
  context,
}: MissionObjectivePanelProps) {
  return (
    <section className="mission-panel" aria-labelledby="mission-objective-title">
      <h2 id="mission-objective-title">Mục tiêu</h2>
      <p>{objective}</p>
      {context ? <p className="mission-panel__secondary">{context}</p> : null}
    </section>
  );
}
