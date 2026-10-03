import { MissionRichText } from "./MissionRichText";

export interface MissionObjectivePanelProps {
  readonly objective: string;
  readonly context?: string;
}

export function MissionObjectivePanel({
  objective,
  context,
}: MissionObjectivePanelProps) {
  const steps = splitInstructionSteps(context);

  return (
    <section className="mission-panel" aria-labelledby="mission-objective-title">
      <h2 id="mission-objective-title">Yêu cầu bài</h2>
      <p className="mission-summary"><MissionRichText text={objective} /></p>

      {steps.length > 0 ? (
        <>
          <h3 className="mission-panel__subheading">Bạn cần làm</h3>
          <ol className="mission-instruction-list">
            {steps.map((step, index) => (
              <li key={`${index}-${step}`}><MissionRichText text={step} /></li>
            ))}
          </ol>
        </>
      ) : context ? (
        <p className="mission-panel__secondary"><MissionRichText text={context} /></p>
      ) : null}
    </section>
  );
}

function splitInstructionSteps(context: string | undefined): string[] {
  if (!context) return [];

  return context
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
