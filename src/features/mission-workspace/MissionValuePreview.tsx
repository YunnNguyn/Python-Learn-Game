import type { ReactNode } from "react";

import type { JsonValue } from "../../core/domain";

export interface MissionValuePreviewProps {
  readonly value: JsonValue;
  readonly className?: string;
}

export function MissionValuePreview({ value, className }: MissionValuePreviewProps) {
  return <pre className={joinClassNames("mission-value-preview", className)}>{renderValue(value, 0)}</pre>;
}

function renderValue(value: JsonValue, depth: number): ReactNode {
  if (value === null) return <span className="mission-token mission-token--null">null</span>;

  if (typeof value === "number") {
    return <span className="mission-token mission-token--number">{String(value)}</span>;
  }

  if (typeof value === "boolean") {
    return <span className="mission-token mission-token--boolean">{String(value)}</span>;
  }

  if (typeof value === "string") {
    return <span className="mission-token mission-token--string">{JSON.stringify(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span>[]</span>;
    if (isMatrixLike(value)) {
      return renderMatrix(value as readonly Primitive[][], depth);
    }
    return renderArray(value, depth);
  }

  return renderObject(value, depth);
}

type Primitive = string | number | boolean | null;

function renderArray(value: readonly JsonValue[], depth: number): ReactNode {
  return (
    <>
      <span>[</span>
      {"\n"}
      {value.map((item, index) => (
        <span key={index}>
          {indent(depth + 1)}
          {renderValue(item, depth + 1)}
          {index < value.length - 1 ? "," : ""}
          {"\n"}
        </span>
      ))}
      {indent(depth)}
      <span>]</span>
    </>
  );
}

function renderObject(value: Record<string, JsonValue>, depth: number): ReactNode {
  const entries = Object.entries(value);
  if (entries.length === 0) return <span>{"{}"}</span>;

  return (
    <>
      <span>{"{"}</span>
      {"\n"}
      {entries.map(([key, nestedValue], index) => (
        <span key={key}>
          {indent(depth + 1)}
          <span className="mission-token mission-token--key">{JSON.stringify(key)}</span>
          <span>: </span>
          {renderValue(nestedValue, depth + 1)}
          {index < entries.length - 1 ? "," : ""}
          {"\n"}
        </span>
      ))}
      {indent(depth)}
      <span>{"}"}</span>
    </>
  );
}

function renderMatrix(matrix: readonly Primitive[][], depth: number): ReactNode {
  const rows = matrix.map((row) => row.map(formatPrimitive));
  const columnCount = Math.max(...rows.map((row) => row.length));
  const widths = Array.from({ length: columnCount }, (_, columnIndex) =>
    Math.max(...rows.map((row) => row[columnIndex]?.length ?? 0)),
  );

  return (
    <>
      <span>[</span>
      {"\n"}
      {rows.map((row, rowIndex) => (
        <span key={rowIndex}>
          {indent(depth + 1)}
          <span>[</span>
          {row.map((cell, columnIndex) => (
            <span key={columnIndex}>
              <span className={tokenClassForPrimitive(matrix[rowIndex]![columnIndex])}>{cell.padStart(widths[columnIndex] ?? cell.length)}</span>
              {columnIndex < row.length - 1 ? <span>, </span> : null}
            </span>
          ))}
          <span>]</span>
          {rowIndex < rows.length - 1 ? "," : ""}
          {"\n"}
        </span>
      ))}
      {indent(depth)}
      <span>]</span>
    </>
  );
}

function formatPrimitive(value: Primitive): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null) return "null";
  return String(value);
}

function tokenClassForPrimitive(value: Primitive): string {
  if (value === null) return "mission-token mission-token--null";
  if (typeof value === "string") return "mission-token mission-token--string";
  if (typeof value === "number") return "mission-token mission-token--number";
  return "mission-token mission-token--boolean";
}

function isMatrixLike(value: readonly JsonValue[]): boolean {
  if (value.length === 0) return false;
  return value.every(
    (row) =>
      Array.isArray(row) &&
      row.every(
        (cell) =>
          cell === null || typeof cell === "string" || typeof cell === "number" || typeof cell === "boolean",
      ),
  );
}

function indent(depth: number): string {
  return "  ".repeat(depth);
}

function joinClassNames(...parts: readonly (string | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
