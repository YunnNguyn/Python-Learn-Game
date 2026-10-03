import { useEffect, useRef, useState } from "react";

import type { JsonObject } from "../../core/domain";
import type {
  RuntimeExecutionResult,
  RuntimeLifecycleResult,
  RuntimeManager,
} from "../../core/runtime";
import { createPyodideRuntimeManager } from "../../core/runtime/pyodide";

type RuntimeProbeStatus = "IDLE" | "INITIALIZING" | "READY" | "ERROR";

const DEFAULT_SETUP_JSON = `{
  "values": [2, 5, 8],
  "threshold": 5,
  "metadata": {
    "label": "demo"
  }
}`;

export function DebugPage() {
  const managerRef = useRef<RuntimeManager | null>(null);
  const mountedRef = useRef(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeProbeStatus>("IDLE");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [setupJson, setSetupJson] = useState(DEFAULT_SETUP_JSON);
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
    managerRef.current ??= createPyodideRuntimeManager();
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

    setPreparePending(true);
    const result = await getRuntimeManager().prepareMission({
      setupData: parsed as JsonObject,
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
    </section>
  );
}
