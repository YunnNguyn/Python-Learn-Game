import Editor from "@monaco-editor/react";

import "./monaco-config";

export interface PythonEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly readOnly?: boolean;
}

export function PythonEditor({
  value,
  onChange,
  readOnly = false,
}: PythonEditorProps) {
  return (
    <div className="python-editor">
      <Editor
        height="100%"
        language="python"
        loading={<div className="python-editor__loading">Đang tải trình soạn thảo...</div>}
        onChange={(nextValue) => onChange(nextValue ?? "")}
        options={{
          ariaLabel: "Trình soạn thảo Python",
          automaticLayout: true,
          fontSize: 15,
          insertSpaces: true,
          lineNumbers: "on",
          minimap: { enabled: false },
          readOnly,
          scrollBeyondLastLine: false,
          tabSize: 4,
          wordWrap: "off",
        }}
        theme="vs-dark"
        value={value}
      />
    </div>
  );
}
