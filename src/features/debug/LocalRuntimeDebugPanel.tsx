import { useEffect, useRef, useState } from "react";

import type { RuntimeExecutionResult, RuntimeManager } from "../../core/runtime";
import { createLocalPythonRuntimeManager } from "../../core/runtime/local-python";

const DEFAULT_CODE = `import sys\nimport time\n\nprint("Python executable:", sys.executable)\nanswer = sum(values)\nprint("answer =", answer)\n`;

export function LocalRuntimeDebugPanel() {
  const managerRef = useRef<RuntimeManager | null>(null);
  const mountedRef = useRef(false);
  const [status, setStatus] = useState("IDLE");
  const [code, setCode] = useState(DEFAULT_CODE);
  const [execution, setExecution] = useState<RuntimeExecutionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const getManager = () => {
    managerRef.current ??= createLocalPythonRuntimeManager();
    return managerRef.current;
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      managerRef.current?.dispose();
      managerRef.current = null;
    };
  }, []);

  async function initialize() {
    setMessage(null);
    setExecution(null);
    setStatus("INITIALIZING");
    const manager = getManager();
    const result = await manager.initialize();
    if (!mountedRef.current) return;
    if (!result.ok) {
      setStatus("ERROR");
      setMessage(`${result.error.code ?? "RUNTIME_ERROR"}: ${result.error.message}`);
      return;
    }

    const prepared = await manager.prepareMission({
      runtimeConfig: { executionTimeoutSeconds: 300 },
      setupData: { values: [2, 5, 8] },
    });
    if (!mountedRef.current) return;
    if (!prepared.ok) {
      setStatus("ERROR");
      setMessage(`${prepared.error.code ?? "RUNTIME_ERROR"}: ${prepared.error.message}`);
      return;
    }
    setStatus("READY");
    setMessage("Đã kết nối Local Python runtime và chuẩn bị workspace test.");
  }

  async function run(kind: "run" | "submit") {
    setExecution(null);
    setMessage(null);
    setBusy(true);
    setStatus("RUNNING");
    const manager = getManager();
    const result =
      kind === "run"
        ? await manager.run({ code })
        : await manager.submit({ code, observeVariables: ["answer"] });
    if (!mountedRef.current) return;
    setExecution(result);
    setBusy(false);
    setStatus("READY");
  }

  async function stop() {
    const manager = getManager();
    if (!manager.interrupt) return;
    const result = await manager.interrupt();
    if (!mountedRef.current) return;
    setMessage(result.ok ? "Đã gửi lệnh dừng tiến trình Python." : result.error.message);
  }

  return (
    <section className="status-block debug-runtime-card" aria-labelledby="local-runtime-title">
      <section className="debug-runtime-section">
        <h2 id="local-runtime-title">Local Python Runtime</h2>
        <p>
          Chạy Python thật bằng subprocess trên máy local. Đây là runtime sẽ dùng cho pandas,
          scikit-learn và các bài train model sau này.
        </p>
        <p>
          <strong>Trạng thái:</strong> {status}
        </p>
        <div className="debug-runtime-actions">
          <button className="primary-action" type="button" onClick={() => void initialize()} disabled={busy}>
            Kết nối runtime
          </button>
          <button className="secondary-action secondary-action--button" type="button" onClick={() => void stop()} disabled={!busy}>
            Stop process
          </button>
        </div>
        {message ? <div className="debug-runtime-result">{message}</div> : null}
      </section>

      <section className="debug-runtime-section">
        <label htmlFor="local-runtime-code">
          <strong>Mã Python local test</strong>
        </label>
        <textarea
          className="debug-runtime-textarea"
          id="local-runtime-code"
          rows={10}
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <div className="debug-runtime-actions">
          <button className="primary-action" type="button" onClick={() => void run("run")} disabled={busy || status !== "READY"}>
            Run local
          </button>
          <button className="primary-action" type="button" onClick={() => void run("submit")} disabled={busy || status !== "READY"}>
            Submit + observe answer
          </button>
        </div>
      </section>

      {execution ? (
        <section className="debug-runtime-result" aria-live="polite">
          <p><strong>Kết quả:</strong> {execution.status}</p>
          <p><strong>stdout</strong></p>
          <pre className="debug-runtime-output">{execution.stdout || "(trống)"}</pre>
          <p><strong>stderr</strong></p>
          <pre className="debug-runtime-output">{execution.stderr || "(trống)"}</pre>
          {(execution.status === "SUCCESS" || execution.status === "PYTHON_EXCEPTION") && execution.serialized ? (
            <>
              <p><strong>observations</strong></p>
              <pre className="debug-runtime-output">{JSON.stringify(execution.serialized, null, 2)}</pre>
            </>
          ) : null}
          {execution.status === "PYTHON_EXCEPTION" ? (
            <pre className="debug-runtime-output">{execution.exception.traceback ?? execution.exception.message}</pre>
          ) : null}
          {execution.status === "RUNTIME_ERROR" || execution.status === "TIMEOUT" ? (
            <p role="alert">{execution.error?.message ?? "Runtime error"}</p>
          ) : null}
        </section>
      ) : null}

      <p className="debug-runtime-note">
        Development: chạy <code>local-runtime\\start-runtime.cmd</code> trước khi bấm Kết nối runtime.
      </p>
    </section>
  );
}
