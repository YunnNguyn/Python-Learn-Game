import { useEffect, useRef, useState } from "react";

import type { JsonObject } from "../../core/domain";
import {
  DeclarativeGraderCheckType,
  GraderFailureCategory,
  type GraderResult,
} from "../../core/grading";
import type {
  RuntimeExecutionResult,
  RuntimeLifecycleResult,
  RuntimeManager,
} from "../../core/runtime";
import { createPyodideRuntimeManager } from "../../core/runtime/pyodide";
import { GradingFeedback } from "../mission-workspace";
import { LocalRuntimeDebugPanel } from "./LocalRuntimeDebugPanel";

type RuntimeProbeStatus = "IDLE" | "INITIALIZING" | "READY" | "ERROR";

const DEFAULT_SETUP_JSON = `{
  "values": [2, 5, 8],
  "threshold": 5,
  "metadata": {
    "label": "demo"
  }
}`;

// Dev-only: lets us exercise the Pyodide multi-package + workspace-staging path
// (the Data/ML pivot) without walking the whole linear curriculum. Empty object
// means no packages/workspace, matching the original light-exercise behavior.
const DEFAULT_RUNTIME_CONFIG_JSON = `{
  "packages": ["pandas"],
  "workspace": {
    "datasets": [
      {
        "filename": "telemetry.csv",
        "content": "contact_id,distance,threat\\ncontact-1,38,1\\ncontact-2,77,4\\ncontact-3,51,3\\n"
      }
    ]
  }
}`;

interface FeedbackPreviewCase {
  readonly label: string;
  readonly result: GraderResult;
}

const FEEDBACK_PREVIEW_CASES: readonly FeedbackPreviewCase[] = [
  {
    label: "PASS",
    result: {
      passed: true,
      checks: [
        {
          type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
          passed: true,
          variable: "result",
        },
      ],
    },
  },
  {
    label: "RUNTIME_ERROR",
    result: {
      passed: false,
      checks: [
        {
          type: DeclarativeGraderCheckType.NO_EXCEPTION,
          passed: false,
          category: GraderFailureCategory.RUNTIME_ERROR,
          message: "RAW_RUNTIME_CHECK_MESSAGE_MUST_NOT_RENDER",
        },
      ],
      runtimeError: {
        type: "ValueError",
        message:
          "boom — thông báo dài để kiểm tra wrapping an toàn trên viewport hẹp và không làm tràn thẻ phản hồi.\nTraceback: RAW_RUNTIME_TRACE_MUST_NOT_RENDER",
      },
    },
  },
  {
    label: "MISSING_VARIABLE",
    result: {
      passed: false,
      checks: [
        {
          type: DeclarativeGraderCheckType.VARIABLE_EXISTS,
          passed: false,
          variable: "result",
          category: GraderFailureCategory.MISSING_VARIABLE,
        },
      ],
    },
  },
  {
    label: "TYPE_ERROR",
    result: {
      passed: false,
      checks: [
        {
          type: DeclarativeGraderCheckType.PYTHON_TYPE,
          passed: false,
          variable: "result",
          category: GraderFailureCategory.TYPE_ERROR,
          expected: "ndarray",
          actual: "list",
        },
      ],
    },
  },
  {
    label: "SHAPE_ERROR",
    result: {
      passed: false,
      checks: [
        {
          type: DeclarativeGraderCheckType.SHAPE,
          passed: false,
          variable: "result",
          category: GraderFailureCategory.SHAPE_ERROR,
          expected: [4, 1],
          actual: [4],
        },
      ],
    },
  },
  {
    label: "VALUE_ERROR",
    result: {
      passed: false,
      checks: [
        {
          type: DeclarativeGraderCheckType.EXACT_VALUES,
          passed: false,
          variable: "result",
          category: GraderFailureCategory.VALUE_ERROR,
          expected: [1, 2, 3, 4, 5],
          actual: [1, 2, 3, 9, 5],
          message: "RAW_VALUE_SECRET_MUST_NOT_RENDER",
        },
      ],
    },
  },
  {
    label: "MULTIPLE_FAILURES",
    result: {
      passed: false,
      checks: [
        {
          type: DeclarativeGraderCheckType.PYTHON_TYPE,
          passed: false,
          variable: "result",
          category: GraderFailureCategory.TYPE_ERROR,
          expected: "ndarray",
          actual: "list",
        },
        {
          type: DeclarativeGraderCheckType.SHAPE,
          passed: false,
          variable: "result",
          category: GraderFailureCategory.SHAPE_ERROR,
          expected: [4, 1],
          actual: [4],
        },
        {
          type: DeclarativeGraderCheckType.EXACT_VALUES,
          passed: false,
          variable: "result",
          category: GraderFailureCategory.VALUE_ERROR,
          expected: [1, 2, 3, 4, 5],
          actual: [1, 2, 3, 9, 5],
          message: "MULTI_VALUE_SECRET_MUST_NOT_RENDER",
        },
      ],
    },
  },
];

export function DebugPage() {
  const managerRef = useRef<RuntimeManager | null>(null);
  const mountedRef = useRef(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeProbeStatus>("IDLE");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [setupJson, setSetupJson] = useState(DEFAULT_SETUP_JSON);
  const [runtimeConfigJson, setRuntimeConfigJson] = useState(
    DEFAULT_RUNTIME_CONFIG_JSON,
  );
  const [preparePending, setPreparePending] = useState(false);
  const [prepareValidationError, setPrepareValidationError] =
    useState<string | null>(null);
  const [preparationResult, setPreparationResult] =
    useState<RuntimeLifecycleResult | null>(null);
  const [code, setCode] = useState('print("Hello from Pyodide")');
  const [observationVariable, setObservationVariable] = useState("answer");
  const [runPending, setRunPending] = useState(false);
  const [executionResult, setExecutionResult] =
    useState<RuntimeExecutionResult | null>(null);
  const [submitPending, setSubmitPending] = useState(false);
  const [submitResult, setSubmitResult] =
    useState<RuntimeExecutionResult | null>(null);

  const getRuntimeManager = (): RuntimeManager => {
    // Dev probe exercises Data/ML packages (pandas, etc.), whose first import
    // can exceed the default 5s deadline, so use the heavy-mission timeout here.
    managerRef.current ??= createPyodideRuntimeManager({
      executionTimeoutMs: 60_000,
    });
    return managerRef.current;
  };

  useEffect(() => {
    mountedRef.current = true;
    const manager = getRuntimeManager();

    return () => {
      mountedRef.current = false;
      manager.dispose();

      if (managerRef.current === manager) {
        managerRef.current = null;
      }
    };
  }, []);

  const initializeRuntime = async () => {
    setRuntimeError(null);
    setRuntimeStatus("INITIALIZING");

    const result = await getRuntimeManager().initialize();
    if (!mountedRef.current) {
      return;
    }

    if (result.ok) {
      setRuntimeStatus("READY");
      return;
    }

    setRuntimeError(result.error.message);
    setRuntimeStatus("ERROR");
  };

  const prepareRuntime = async () => {
    setPrepareValidationError(null);
    setPreparationResult(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(setupJson);
    } catch {
      setPrepareValidationError("Setup JSON không hợp lệ.");
      return;
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      setPrepareValidationError("Setup JSON phải có object ở cấp gốc.");
      return;
    }

    let parsedRuntimeConfig: unknown = undefined;
    const trimmedRuntimeConfig = runtimeConfigJson.trim();
    if (trimmedRuntimeConfig.length > 0) {
      try {
        parsedRuntimeConfig = JSON.parse(trimmedRuntimeConfig);
      } catch {
        setPrepareValidationError("Runtime config JSON không hợp lệ.");
        return;
      }
      if (
        typeof parsedRuntimeConfig !== "object" ||
        parsedRuntimeConfig === null ||
        Array.isArray(parsedRuntimeConfig)
      ) {
        setPrepareValidationError("Runtime config JSON phải có object ở cấp gốc.");
        return;
      }
    }

    setPreparePending(true);
    const result = await getRuntimeManager().prepareMission({
      setupData: parsed as JsonObject,
      ...(parsedRuntimeConfig === undefined
        ? {}
        : { runtimeConfig: parsedRuntimeConfig as JsonObject }),
    });
    if (!mountedRef.current) {
      return;
    }

    setPreparationResult(result);
    setPreparePending(false);
  };

  const runRuntimeTest = async () => {
    setExecutionResult(null);
    setRunPending(true);

    const result = await getRuntimeManager().run({ code });
    if (!mountedRef.current) {
      return;
    }

    setExecutionResult(result);
    setRunPending(false);
  };

  const submitRuntimeTest = async () => {
    setSubmitResult(null);
    setSubmitPending(true);

    const normalizedObservationVariable = observationVariable.trim();
    const result = await getRuntimeManager().submit({
      code,
      ...(normalizedObservationVariable.length === 0
        ? {}
        : { observeVariables: [normalizedObservationVariable] }),
    });
    if (!mountedRef.current) {
      return;
    }

    setSubmitResult(result);
    setSubmitPending(false);
  };

  return (
    <section className="page-card" aria-labelledby="debug-title">
      <p className="eyebrow">Development</p>
      <h1 id="debug-title">Công cụ phát triển</h1>
      <p className="page-lead">Các ranh giới tính năng và định tuyến đang hoạt động.</p>

      <LocalRuntimeDebugPanel />

      <section className="status-block debug-runtime-card" aria-label="Python runtime diagnostics">
        <section className="debug-runtime-section" aria-labelledby="runtime-probe-title">
          <h2 id="runtime-probe-title">Python Runtime</h2>
          <p>Kiểm tra việc khởi tạo Pyodide trong Web Worker.</p>
          <p>
            <strong>Trạng thái:</strong> {runtimeStatus}
          </p>
          <div className="debug-runtime-actions">
            <button
              className="primary-action"
              type="button"
              onClick={initializeRuntime}
              disabled={runtimeStatus === "INITIALIZING" || runtimeStatus === "READY"}
            >
              {runtimeStatus === "INITIALIZING"
                ? "Đang khởi tạo..."
                : "Khởi tạo runtime"}
            </button>
          </div>
          {runtimeError ? (
            <div className="debug-runtime-result" role="alert">
              {runtimeError}
            </div>
          ) : null}
        </section>

        <section className="debug-runtime-section" aria-labelledby="mission-setup-title">
          <h2 id="mission-setup-title">Mission Setup</h2>
          <div className="debug-runtime-field">
            <label htmlFor="runtime-setup-json">
              <strong>Setup JSON</strong>
            </label>
            <textarea
              className="debug-runtime-textarea"
              id="runtime-setup-json"
              rows={10}
              value={setupJson}
              onChange={(event) => setSetupJson(event.target.value)}
            />
          </div>
          <div className="debug-runtime-field">
            <label htmlFor="runtime-config-json">
              <strong>Runtime config JSON (packages + workspace)</strong>
            </label>
            <textarea
              className="debug-runtime-textarea"
              id="runtime-config-json"
              rows={10}
              value={runtimeConfigJson}
              onChange={(event) => setRuntimeConfigJson(event.target.value)}
            />
          </div>
          <div className="debug-runtime-actions">
            <button
              className="primary-action"
              type="button"
              onClick={prepareRuntime}
              disabled={
                runtimeStatus !== "READY" ||
                preparePending ||
                runPending ||
                submitPending
              }
            >
              {preparePending ? "Đang chuẩn bị..." : "Chuẩn bị môi trường"}
            </button>
          </div>
          {prepareValidationError || preparationResult ? (
            <div className="debug-runtime-result" aria-live="polite">
              <p>
                <strong>Kết quả chuẩn bị</strong>
              </p>
              {prepareValidationError ? (
                <p role="alert">{prepareValidationError}</p>
              ) : preparationResult?.ok ? (
                <p>SUCCESS</p>
              ) : preparationResult ? (
                <>
                  <p>{preparationResult.error.code || "RUNTIME_ERROR"}</p>
                  <p role="alert">{preparationResult.error.message}</p>
                </>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="debug-runtime-section" aria-labelledby="code-execution-title">
          <h2 id="code-execution-title">Code Execution</h2>
          <div className="debug-runtime-field">
            <label htmlFor="runtime-test-code">
              <strong>Mã Python kiểm tra</strong>
            </label>
            <textarea
              className="debug-runtime-textarea"
              id="runtime-test-code"
              rows={8}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </div>
          <div className="debug-runtime-field">
            <label htmlFor="runtime-observation-variable">
              <strong>Biến quan sát</strong>
            </label>
            <input
              id="runtime-observation-variable"
              type="text"
              value={observationVariable}
              onChange={(event) => setObservationVariable(event.target.value)}
            />
          </div>
          <div className="debug-runtime-actions">
            <button
              className="primary-action"
              type="button"
              onClick={runRuntimeTest}
              disabled={
                runtimeStatus !== "READY" ||
                runPending ||
                preparePending ||
                submitPending
              }
            >
              {runPending ? "Đang chạy..." : "Chạy test"}
            </button>
            <button
              className="primary-action"
              type="button"
              onClick={submitRuntimeTest}
              disabled={
                runtimeStatus !== "READY" ||
                submitPending ||
                runPending ||
                preparePending
              }
            >
              {submitPending ? "Đang Submit..." : "Submit test"}
            </button>
          </div>
          {executionResult ? (
            <div className="debug-runtime-result" aria-live="polite">
              <p>
                <strong>Kết quả:</strong> {executionResult.status}
              </p>
              <p>
                <strong>stdout</strong>
              </p>
              <pre className="debug-runtime-output">{executionResult.stdout}</pre>
              <p>
                <strong>stderr</strong>
              </p>
              <pre className="debug-runtime-output">{executionResult.stderr}</pre>
              {executionResult.status === "PYTHON_EXCEPTION" ? (
                <>
                  <p>
                    <strong>Python exception</strong>
                  </p>
                  <pre className="debug-runtime-output">
                    {[
                      executionResult.exception.type,
                      executionResult.exception.message,
                      executionResult.exception.traceback,
                    ]
                      .filter(Boolean)
                      .join("\n")}
                  </pre>
                </>
              ) : null}
              {executionResult.status === "RUNTIME_ERROR" ? (
                <p role="alert">
                  {executionResult.error.code
                    ? executionResult.error.code + ": "
                    : ""}
                  {executionResult.error.message}
                </p>
              ) : null}
            </div>
          ) : null}
          {submitResult ? (
            <div className="debug-runtime-result" aria-live="polite">
              <p>
                <strong>Kết quả Submit:</strong> {submitResult.status}
              </p>
              <p>
                <strong>stdout</strong>
              </p>
              <pre className="debug-runtime-output">{submitResult.stdout}</pre>
              <p>
                <strong>stderr</strong>
              </p>
              <pre className="debug-runtime-output">{submitResult.stderr}</pre>
              {(submitResult.status === "SUCCESS" ||
                submitResult.status === "PYTHON_EXCEPTION") &&
              submitResult.serialized !== undefined ? (
                <>
                  <p>
                    <strong>serialized observations</strong>
                  </p>
                  <pre className="debug-runtime-output">
                    {JSON.stringify(submitResult.serialized, null, 2)}
                  </pre>
                </>
              ) : null}
              {submitResult.workspace &&
              submitResult.workspace.artifacts.length > 0 ? (
                <>
                  <p>
                    <strong>artifacts</strong>
                  </p>
                  {submitResult.workspace.artifacts.map((artifact) => (
                    <div key={artifact.relativePath}>
                      <code>
                        {artifact.relativePath} ({artifact.bytes}b
                        {artifact.category ? ` · ${artifact.category}` : ""})
                      </code>
                      {artifact.dataUrl ? (
                        <img
                          src={artifact.dataUrl}
                          alt={artifact.filename}
                          style={{
                            maxWidth: 360,
                            display: "block",
                            marginTop: 4,
                            background: "#fff",
                          }}
                        />
                      ) : null}
                    </div>
                  ))}
                </>
              ) : null}
              {submitResult.status === "PYTHON_EXCEPTION" ? (
                <>
                  <p>
                    <strong>Python exception</strong>
                  </p>
                  <pre className="debug-runtime-output">
                    {[
                      submitResult.exception.type,
                      submitResult.exception.message,
                      submitResult.exception.traceback,
                    ]
                      .filter(Boolean)
                      .join("\n")}
                  </pre>
                </>
              ) : null}
              {submitResult.status === "RUNTIME_ERROR" ||
              submitResult.status === "TIMEOUT" ? (
                submitResult.error ? (
                  <p role="alert">
                    {submitResult.error.code
                      ? submitResult.error.code + ": "
                      : ""}
                    {submitResult.error.message}
                  </p>
                ) : null
              ) : null}
            </div>
          ) : null}
        </section>
      </section>

      <section
        className="status-block"
        aria-labelledby="grading-feedback-preview-title"
      >
        <h2 id="grading-feedback-preview-title">Structured Grading Feedback</h2>
        <p>
          Preview phát triển cho các trạng thái phản hồi có cấu trúc từ{" "}
          <code>GraderResult</code>.
        </p>
        <div className="grading-feedback-preview-grid">
          {FEEDBACK_PREVIEW_CASES.map((previewCase) => (
            <article
              className="grading-feedback-preview-case"
              key={previewCase.label}
            >
              <p className="grading-feedback-preview-case__label">
                {previewCase.label}
              </p>
              <GradingFeedback result={previewCase.result} />
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
