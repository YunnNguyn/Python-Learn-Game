import type { ExercisePackIssue } from "../../core/exercise-packs";

/** Validation findings, each with the JSON Pointer of the offending value. Text only. */
export function PracticeIssuesList({
  issues,
  heading = "Các lỗi cần sửa",
}: {
  readonly issues: readonly ExercisePackIssue[];
  readonly heading?: string;
}) {
  if (issues.length === 0) return null;
  return (
    <section className="practice-issues" aria-label={heading}>
      <h3>
        {heading} ({issues.length})
      </h3>
      <ol className="practice-issues__list">
        {issues.map((issue, index) => (
          <li key={`${index}:${issue.path}:${issue.code}`}>
            <code className="practice-issues__path">{issue.path === "" ? "(toàn bộ tài liệu)" : issue.path}</code>
            <span className="practice-issues__message">{issue.message}</span>
            <span className="practice-issues__code">{issue.code}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
