import { useEffect, useRef, useState } from "react";

import type { RuntimeManager } from "../../core/runtime";
import { createPyodideRuntimeManager } from "../../core/runtime/pyodide";

type RuntimeProbeStatus = "IDLE" | "INITIALIZING" | "READY" | "ERROR";

export function DebugPage() {
  const managerRef = useRef<RuntimeManager | null>(null);
  const mountedRef = useRef(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeProbeStatus>("IDLE");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

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

  return (
    <section className="page-card" aria-labelledby="debug-title">
      <p className="eyebrow">Development</p>
      <h1 id="debug-title">Công cụ phát triển</h1>
      <p className="page-lead">Các ranh giới tính năng và định tuyến đang hoạt động.</p>

      <section className="status-block" aria-labelledby="runtime-probe-title">
        <h2 id="runtime-probe-title">Python Runtime</h2>
        <p>Kiểm tra việc khởi tạo Pyodide trong Web Worker.</p>
        <p>
          <strong>Trạng thái:</strong> {runtimeStatus}
        </p>
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
        {runtimeError ? <p role="alert">{runtimeError}</p> : null}
      </section>
    </section>
  );
}
