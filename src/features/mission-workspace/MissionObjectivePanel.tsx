import { Fragment, type ReactNode } from "react";

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
      <p className="mission-summary">{renderInlineCode(objective)}</p>

      {steps.length > 0 ? (
        <>
          <h3 className="mission-panel__subheading">Bạn cần làm</h3>
          <ol className="mission-instruction-list">
            {steps.map((step, index) => (
              <li key={`${index}-${step}`}>{renderInlineCode(step)}</li>
            ))}
          </ol>
        </>
      ) : context ? (
        <p className="mission-panel__secondary">{renderInlineCode(context)}</p>
      ) : null}
    </section>
  );
}

function splitInstructionSteps(context: string | undefined): string[] {
  if (!context) {
    return [];
  }

  return context
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function renderInlineCode(text: string): ReactNode {
  const segments = text.split(/(`[^`]+`)/g);

  return segments.map((segment, index) => {
    if (segment.startsWith("`") && segment.endsWith("`") && segment.length >= 2) {
      return (
        <code className="mission-inline-code" key={`${segment}-${index}`}>
          {segment.slice(1, -1)}
        </code>
      );
    }

    return <Fragment key={`${segment}-${index}`}>{segment}</Fragment>;
  });
}
