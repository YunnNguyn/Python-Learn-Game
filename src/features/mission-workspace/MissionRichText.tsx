import { Fragment, type ReactNode } from "react";

export function MissionRichText({ text }: { readonly text: string }): ReactNode {
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
