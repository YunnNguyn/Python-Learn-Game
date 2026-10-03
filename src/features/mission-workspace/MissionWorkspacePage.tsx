import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import {
  useApplicationServices,
  type CreateMissionSessionOptions,
  type PlayableMissionSession,
} from "../../app/services";
import { LearningStage, type AttemptRecord } from "../../core/domain";
import type { GraderResult } from "../../core/grading";
import type { RevealedHint } from "../../core/hints";
import type { MissionAttemptSession } from "../../core/learning";
import {
  RUNTIME_EXECUTION_STATUS,
  type RuntimeExecutionResult,
} from "../../core/runtime";
import { MissionControls } from "./MissionControls";
import { MissionDataPanel } from "./MissionDataPanel";
import { MissionHintPanel } from "./MissionHintPanel";
import { MissionObjectivePanel } from "./MissionObjectivePanel";
import { MissionOutputPanel } from "./MissionOutputPanel";
import { PythonEditor } from "./PythonEditor";
import { GradingFeedback } from "./grading-feedback";

type WorkspaceOperation = "run" | "submit" | "reload" | null;
type RetryMode = "same" | "variant";

export function MissionWorkspacePage() {
  const { missionId } = useParams();
  const routeId = missionId?.trim();
  const services = useApplicationServices();
  const sessionRef = useRef<MissionAttemptSession | null>(null);
  const [bundle, setBundle] = useState<PlayableMissionSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [operation, setOperation] = useState<WorkspaceOperation>(null);
  const operationRef = useRef<WorkspaceOperation>(null);
  const [execution, setExecution] = useState<RuntimeExecutionResult | null>(null);
  const [grading, setGrading] = useState<GraderResult | null>(null);
  const [attempt, setAttempt] = useState<AttemptRecord | null>(null);
  const [revealedHints, setRevealedHints] = useState<readonly RevealedHint[]>([]);
  const [draftSuppressed, setDraftSuppressed] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setBundle(null);
    setLoadError(null);
    setLoading(true);
    setExecution(null);
    setGrading(null);
    setAttempt(null);
    setRevealedHints([]);
    setDraftSuppressed(false);
    setDraftNotice(null);

    if (!routeId) {
      setLoadError("Không xác định được bài thực hành cần mở.");
      setLoading(false);
      return () => undefined;
    }

    void services.createMissionSession(routeId, { resumeDraft: true }).then((result) => {
      if (cancelled) {
        if (result.ok) result.value.session.dispose();
        return;
      }

      if (!result.ok) {
        setLoadError(result.error.message);
        setLoading(false);
        return;
      }

      sessionRef.current?.dispose();
      sessionRef.current = result.value.session;
      applyPlayableSession(result.value);
    });

    return () => {
      cancelled = true;
      sessionRef.current?.dispose();
      sessionRef.current = null;
    };
  }, [routeId, services]);

  const session = bundle?.session ?? null;

  useEffect(() => {
    if (!bundle || !session || draftSuppressed || loading) return;

    const timeout = window.setTimeout(() => {
      void services.saveMissionDraft({
        activityId: session.activity.id,
        seed: session.instance.seed,
        variantIndex: bundle.variantIndex,
        code,
        hintsUsed: session.getRevealedHints().map((hint) => hint.level),
      });
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [bundle, code, draftSuppressed, loading, revealedHints, services, session]);

  const runtimeNote = useMemo(() => {
    if (loading || operation === "reload") return "Đang chuẩn bị một môi trường Python sạch...";
    if (operation === "run") return "Đang chạy mã trong trạng thái thực nghiệm...";
    if (operation === "submit") return "Đang chạy Submit sạch, chấm bài và lưu bằng chứng học tập...";
    return "Chạy thử dùng để khám phá; Nộp bài luôn chấm trên baseline sạch và lưu tiến độ.";
  }, [loading, operation]);

  function applyPlayableSession(next: PlayableMissionSession) {
    setBundle(next);
    setCode(next.initialCode);
    setRevealedHints(next.session.getRevealedHints());
    setExecution(null);
    setGrading(null);
    setAttempt(null);
    setDraftSuppressed(false);
    setDraftNotice(next.resumedDraft ? "Đã khôi phục bản nháp và đề đang làm trước đó." : null);
    setLoading(false);
    setOperation(null);
    operationRef.current = null;
  }

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
      if (result.attemptRecord.passed) {
        setDraftSuppressed(true);
        setDraftNotice(null);
        await services.deleteMissionDraft(session.activity.id);
      }
    } finally {
      operationRef.current = null;
      setOperation(null);
    }
  }

  function handleRevealHint() {
    if (!session || !bundle || operationRef.current !== null) return;
    const hint = session.revealNextHint();
    if (!hint) return;
    const hints = session.getRevealedHints();
    setRevealedHints(hints);
    void services.saveMissionDraft({
      activityId: session.activity.id,
      seed: session.instance.seed,
      variantIndex: bundle.variantIndex,
      code,
      hintsUsed: hints.map((item) => item.level),
    });
    setDraftNotice("Gợi ý vừa mở đã được ghi vào bản nháp và sẽ xuất hiện trong bằng chứng lần nộp.");
  }

  async function handleRetry(mode: RetryMode) {
    if (!routeId || !bundle || !session || operationRef.current !== null) return;

    operationRef.current = "reload";
    setOperation("reload");
    setLoading(true);
    setLoadError(null);
    const previousSeed = session.instance.seed;
    const previousVariantIndex = bundle.variantIndex;

    session.dispose();
    sessionRef.current = null;

    const options: CreateMissionSessionOptions =
      mode === "same"
        ? {
            seed: previousSeed,
            variantIndex: previousVariantIndex,
            resumeDraft: false,
            resetCode: true,
          }
        : {
            variantIndex: previousVariantIndex + 1,
            resumeDraft: false,
            resetCode: true,
          };

    const result = await services.createMissionSession(routeId, options);
    if (!result.ok) {
      setLoadError(result.error.message);
      setBundle(null);
      setLoading(false);
      setOperation(null);
      operationRef.current = null;
      return;
    }

    sessionRef.current = result.value.session;
    applyPlayableSession(result.value);
    setDraftNotice(
      mode === "same"
        ? "Đã đặt lại cùng một đề về trạng thái ban đầu."
        : `Đã tạo biến thể mới #${result.value.variantIndex + 1} với dữ liệu khác.`,
    );
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

  if (loading || session === null || bundle === null) {
    return (
      <section className="page-card mission-loading" aria-labelledby="mission-title" aria-live="polite">
        <p className="eyebrow">Thực hành</p>
        <h1 id="mission-title">Đang chuẩn bị nhiệm vụ</h1>
        <p className="page-lead">
          Đang khởi động Python, tải NumPy và khôi phục tiến độ nếu có. Lần mở đầu tiên có thể mất vài giây.
        </p>
        <div className="mission-loading__bar" aria-hidden="true" />
      </section>
    );
  }

  const data = session.instance.learner.data ?? {};
  const executionError = execution ? formatExecutionError(execution) : null;

  return (
    <section className="page-card mission-workspace" aria-labelledby="mission-title">
      <div className="mission-heading-row">
        <div>
          <p className="eyebrow">
            Thực hành · {stageLabel(session.activity.stage)} · Biến thể #{bundle.variantIndex + 1}
          </p>
          <h1 id="mission-title">{session.activity.title}</h1>
        </div>
        <Link className="secondary-action mission-back-link" to="/learn">
          Về lộ trình
        </Link>
      </div>
      <p className="page-lead">
        Viết mã trực tiếp, dùng Chạy thử để khám phá và Nộp bài khi muốn chấm trên môi trường sạch.
      </p>
      {draftNotice ? <p className="mission-draft-notice">{draftNotice}</p> : null}

      <div className="mission-workspace__main">
        <div className="mission-workspace__info">
          <MissionObjectivePanel
            objective={session.activity.description ?? session.instance.learner.objective}
            context={session.instance.learner.context}
          />
          <MissionDataPanel data={data} />
        </div>

        <section className="mission-editor-region" aria-labelledby="mission-editor-title">
          <h2 id="mission-editor-title">Trình soạn thảo</h2>
          <PythonEditor value={code} onChange={setCode} readOnly={operation !== null} />
        </section>
      </div>

      {session.hasHints() ? (
        <MissionHintPanel
          hints={revealedHints}
          remainingCount={session.getRemainingHintCount()}
          disabled={operation !== null}
          onReveal={handleRevealHint}
        />
      ) : null}

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
          <div>
            <strong>Đã lưu lần nộp #{attempt.submissionIndex}.</strong>{" "}
            {attempt.passed ? "Kết quả đạt yêu cầu." : "Kết quả chưa đạt; bạn có thể sửa và nộp lại."}
            {attempt.hintsUsed.length > 0
              ? ` Gợi ý đã dùng: ${attempt.hintsUsed.join(", ")}.`
              : " Không dùng gợi ý."}
          </div>
          <div className="mission-retry-actions">
            <button
              className="secondary-action secondary-action--button"
              type="button"
              onClick={() => void handleRetry("same")}
            >
              Làm lại cùng đề
            </button>
            <button
              className="primary-action"
              type="button"
              onClick={() => void handleRetry("variant")}
            >
              Tạo đề mới
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function formatExecutionError(execution: RuntimeExecutionResult): string | null {
  if (execution.status === RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION) {
    const type = execution.exception.type?.trim() || "PythonError";
    const message = extractTerminalExceptionMessage(execution.exception.message, type);
    return message ? `${type}: ${message}` : type;
  }
  if (execution.status === RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR) {
    return execution.error.message;
  }
  if (execution.status === RUNTIME_EXECUTION_STATUS.TIMEOUT) {
    return execution.error?.message ?? "Mã chạy quá thời gian cho phép.";
  }
  return null;
}

function extractTerminalExceptionMessage(message: string | undefined, type: string): string | null {
  if (!message) return null;
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const prefix = `${type}:`;
  const terminal = [...lines].reverse().find((line) => line.startsWith(prefix));
  if (terminal) return terminal.slice(prefix.length).trim();
  return lines.length === 1 ? lines[0]! : null;
}

function stageLabel(stage: LearningStage): string {
  switch (stage) {
    case LearningStage.DISCOVER:
      return "Khám phá";
    case LearningStage.GUIDED:
      return "Có hướng dẫn";
    case LearningStage.INDEPENDENT:
      return "Tự làm";
    case LearningStage.TRANSFER:
      return "Vận dụng";
    case LearningStage.REVIEW:
      return "Ôn tập";
    case LearningStage.RETENTION:
      return "Ghi nhớ";
  }
}
