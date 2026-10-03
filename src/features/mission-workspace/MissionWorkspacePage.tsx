import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useApplicationServices } from "../../app/services";
import type { AttemptRecord } from "../../core/domain";
import type { GraderResult } from "../../core/grading";
import type { MissionAttemptSession } from "../../core/learning";
import {
  RUNTIME_EXECUTION_STATUS,
  type RuntimeExecutionResult,
} from "../../core/runtime";
import { MissionControls } from "./MissionControls";
import { MissionDataPanel } from "./MissionDataPanel";
import { MissionObjectivePanel } from "./MissionObjectivePanel";
import { MissionOutputPanel } from "./MissionOutputPanel";
import { PythonEditor } from "./PythonEditor";
import { GradingFeedback } from "./grading-feedback";

type WorkspaceOperation = "run" | "submit" | null;

export function MissionWorkspacePage() {
  const { missionId } = useParams();
  const routeId = missionId?.trim();
  const services = useApplicationServices();
  const [session, setSession] = useState<MissionAttemptSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [operation, setOperation] = useState<WorkspaceOperation>(null);
  const operationRef = useRef<WorkspaceOperation>(null);
  const [execution, setExecution] = useState<RuntimeExecutionResult | null>(null);
  const [grading, setGrading] = useState<GraderResult | null>(null);
  const [attempt, setAttempt] = useState<AttemptRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdSession: MissionAttemptSession | null = null;

    setSession(null);
    setLoadError(null);
    setLoading(true);
    setExecution(null);
    setGrading(null);
    setAttempt(null);

    if (!routeId) {
      setLoadError("Không xác định được bài thực hành cần mở.");
      setLoading(false);
      return () => undefined;
    }

    void services.createMissionSession(routeId).then((result) => {
      if (cancelled) {
        if (result.ok) result.value.session.dispose();
        return;
      }

      if (!result.ok) {
        setLoadError(result.error.message);
        setLoading(false);
        return;
      }

      createdSession = result.value.session;
      setSession(createdSession);
      setCode(createdSession.instance.learner.starterCode ?? "# Viết mã Python tại đây\n");
      setLoading(false);
    });

    return () => {
      cancelled = true;
      createdSession?.dispose();
    };
  }, [routeId, services]);

  const runtimeNote = useMemo(() => {
    if (loading) return "Đang khởi động Python và chuẩn bị NumPy cho nhiệm vụ...";
    if (operation === "run") return "Đang chạy mã trong trạng thái thực nghiệm...";
    if (operation === "submit") return "Đang chạy Submit sạch và chấm bài...";
    return "Chạy thử giữ trạng thái thực nghiệm; Nộp bài luôn dùng baseline sạch để chấm.";
  }, [loading, operation]);

  async function handleRun() {
    if (!session || operationRef.current !== null) return;
    operationRef.current = "run";
    setOperation("run");
    setGrading(null);
    setAttempt(null);
    try {
      const result = await session.run(code);
      setExecution(result.execution);
    } finally {
      operationRef.current = null;
      setOperation(null);
    }
  }

  async function handleSubmit() {
    if (!session || operationRef.current !== null) return;
    operationRef.current = "submit";
    setOperation("submit");
    try {
      const result = await session.submit(code);
      setExecution(result.execution);
      setGrading(result.grading ?? null);
      setAttempt(result.attemptRecord);
    } finally {
      operationRef.current = null;
      setOperation(null);
    }
  }

  if (loadError) {
    return (
      <section className="page-card" aria-labelledby="mission-title">
        <p className="eyebrow">Thực hành</p>
        <h1 id="mission-title">Không thể mở nhiệm vụ</h1>
        <p className="page-lead">{loadError}</p>
        <Link className="primary-action primary-action--link" to="/learn">
          Về không gian học
        </Link>
      </section>
    );
  }

  if (loading || session === null) {
    return (
      <section className="page-card mission-loading" aria-labelledby="mission-title" aria-live="polite">
        <p className="eyebrow">Thực hành</p>
        <h1 id="mission-title">Đang chuẩn bị nhiệm vụ</h1>
        <p className="page-lead">
          Đang khởi động Python và tải NumPy. Lần mở đầu tiên có thể mất vài giây.
        </p>
        <div className="mission-loading__bar" aria-hidden="true" />
      </section>
    );
  }

  const data = session.instance.learner.data ?? {};
  const executionError = execution ? formatExecutionError(execution) : null;

  return (
    <section className="page-card mission-workspace" aria-labelledby="mission-title">
      <p className="eyebrow">Thực hành · {session.activity.stage}</p>
      <h1 id="mission-title">{session.activity.title}</h1>
      <p className="page-lead">
        Viết mã trực tiếp, dùng Chạy thử để khám phá và Nộp bài khi muốn chấm trên môi trường sạch.
      </p>

      <div className="mission-workspace__main">
        <div className="mission-workspace__info">
          <MissionObjectivePanel
            objective={
              session.activity.description ?? session.instance.learner.objective
            }
            context={session.instance.learner.context}
          />
          <MissionDataPanel data={data} />
        </div>

        <section className="mission-editor-region" aria-labelledby="mission-editor-title">
          <h2 id="mission-editor-title">Trình soạn thảo</h2>
          <PythonEditor value={code} onChange={setCode} readOnly={operation !== null} />
        </section>
      </div>

      <MissionControls
        runDisabled={operation !== null}
        submitDisabled={operation !== null}
        onRun={() => void handleRun()}
        onSubmit={() => void handleSubmit()}
        note={runtimeNote}
      />

      {execution ? (
        <MissionOutputPanel
          status={execution.status}
          stdout={execution.stdout}
          stderr={execution.stderr}
          error={executionError}
        />
      ) : null}

      {grading ? (
        <section className="mission-grading-region" aria-labelledby="mission-grading-title">
          <h2 id="mission-grading-title">Phản hồi chấm bài</h2>
          <GradingFeedback result={grading} />
        </section>
      ) : null}

      {attempt ? (
        <section className="mission-attempt-evidence" aria-live="polite">
          <strong>Đã ghi nhận lần nộp #{attempt.submissionIndex}.</strong>{" "}
          {attempt.passed ? "Kết quả đạt yêu cầu." : "Kết quả chưa đạt; bạn có thể sửa và nộp lại."}
        </section>
      ) : null}
    </section>
  );
}

function formatExecutionError(execution: RuntimeExecutionResult): string | null {
  if (execution.status === RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION) {
    return [execution.exception.type, execution.exception.message]
      .filter(Boolean)
      .join(": ");
  }
  if (execution.status === RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR) {
    return execution.error.message;
  }
  if (execution.status === RUNTIME_EXECUTION_STATUS.TIMEOUT) {
    return execution.error?.message ?? "Mã chạy quá thời gian cho phép.";
  }
  return null;
}
