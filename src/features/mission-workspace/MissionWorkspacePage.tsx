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
  CORE_RUNTIME_ID,
  type RuntimeExecutionResult,
  type RuntimeSystemError,
  type RuntimeWorkspaceInfo,
} from "../../core/runtime";
import { MissionControls } from "./MissionControls";
import { MissionDataPanel } from "./MissionDataPanel";
import { MissionHintPanel } from "./MissionHintPanel";
import { MissionLessonPanel } from "./MissionLessonPanel";
import { MissionQuickCheck } from "./MissionQuickCheck";
import { MissionObjectivePanel } from "./MissionObjectivePanel";
import { MissionOutputPanel } from "./MissionOutputPanel";
import { PythonEditor } from "./PythonEditor";
import {
  isActiveSession,
  releaseSession,
  shouldDeleteDraftAfterSubmit,
  submitMission,
} from "./submit-mission";
import { GradingFeedback } from "./grading-feedback";
import { getMissionLessonGuide, getMissionQuickCheck } from "./mission-lesson-guides";

type WorkspaceOperation = "run" | "submit" | "reload" | null;
type RetryMode = "same" | "variant";
type MissionWorkspaceTab = "lesson" | "prompt" | "data" | "practice";

const SUBMIT_FAILURE_NOTICE =
  "Không thể lưu lần nộp này. Bằng chứng học tập có thể chưa được ghi lại đầy đủ; hãy thử nộp lại.";

export function MissionWorkspacePage() {
  const { missionId } = useParams();
  const routeId = missionId?.trim();
  const services = useApplicationServices();
  const sessionRef = useRef<MissionAttemptSession | null>(null);
  const [bundle, setBundle] = useState<PlayableMissionSession | null>(null);
  const [loadError, setLoadError] = useState<RuntimeSystemError | null>(null);
  const [loadRetryToken, setLoadRetryToken] = useState(0);
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
  const [activeTab, setActiveTab] = useState<MissionWorkspaceTab>("lesson");
  const [stopPending, setStopPending] = useState(false);
  const [runtimeActionNotice, setRuntimeActionNotice] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<RuntimeWorkspaceInfo | null>(null);

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
    setActiveTab("lesson");
    setStopPending(false);
    setRuntimeActionNotice(null);
    setWorkspace(null);

    if (!routeId) {
      setLoadError({ code: "MISSION_ROUTE_MISSING", message: "Không xác định được bài thực hành cần mở." });
      setLoading(false);
      return () => undefined;
    }

    void services.createMissionSession(routeId, { resumeDraft: true }).then((result) => {
      if (cancelled) {
        if (result.ok) result.value.session.dispose();
        return;
      }

      if (!result.ok) {
        setLoadError(result.error);
        setLoading(false);
        return;
      }

      sessionRef.current?.dispose();
      sessionRef.current = result.value.session;
      applyPlayableSession(result.value);
    });

    return () => {
      cancelled = true;
      // Also invalidates every in-flight handler's isCurrent() check.
      releaseSession(sessionRef);
    };
  }, [routeId, services, loadRetryToken]);

  const session = bundle?.session ?? null;
  const isLocalRuntime = session?.template.runtime.id === CORE_RUNTIME_ID.LOCAL_PYTHON;
  const canInterrupt = session?.canInterrupt() === true;
  const executionActive = operation === "run" || operation === "submit";

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
    if (isLocalRuntime) {
      if (stopPending) return "Đang yêu cầu Local Python dừng tiến trình con...";
      if (operation === "run") return "Đang chạy main.py bằng Python cài trên máy của bạn. Có thể dừng tiến trình nếu cần.";
      if (operation === "submit") return "Đang chạy Submit bằng Local Python, quan sát biến và chấm trên môi trường sạch.";
      return "Local Python dùng tài nguyên máy thật. Run và Submit chạy trong child process riêng; Stop không làm tắt ứng dụng.";
    }
    if (operation === "run") return "Đang chạy mã trong trạng thái thực nghiệm...";
    if (operation === "submit") return "Đang chạy Submit sạch, chấm bài và lưu bằng chứng học tập...";
    return "Chạy thử dùng để khám phá; Nộp bài luôn chấm trên baseline sạch và lưu tiến độ.";
  }, [isLocalRuntime, loading, operation, stopPending]);

  useEffect(() => {
    if (activeTab !== "practice" || !session) return;

    const handleShortcut = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Escape" && executionActive && canInterrupt) {
        event.preventDefault();
        void handleStop();
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter") return;
      event.preventDefault();
      if (operationRef.current !== null) return;
      if (event.shiftKey) {
        void handleSubmit();
      } else {
        void handleRun();
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [activeTab, canInterrupt, code, executionActive, session, stopPending]);

  function applyPlayableSession(next: PlayableMissionSession) {
    setBundle(next);
    setCode(next.initialCode);
    setRevealedHints(next.session.getRevealedHints());
    setExecution(null);
    setGrading(null);
    setAttempt(null);
    setDraftSuppressed(false);
    setDraftNotice(next.resumedDraft ? "Đã khôi phục bản nháp và đề đang làm trước đó." : null);
    setRuntimeActionNotice(null);
    setStopPending(false);
    setWorkspace(next.initialWorkspace ?? null);
    setLoading(false);
    setOperation(null);
    setActiveTab("lesson");
    operationRef.current = null;
  }

  async function handleRun() {
    if (!session || operationRef.current !== null) return;
    operationRef.current = "run";
    setOperation("run");
    setGrading(null);
    setAttempt(null);
    setRuntimeActionNotice(null);
    try {
      const result = await session.run(code);
      setExecution(result.execution);
      if (result.execution.workspace !== undefined) {
        setWorkspace(result.execution.workspace);
      }
    } finally {
      operationRef.current = null;
      setOperation(null);
      setStopPending(false);
    }
  }

  async function handleSubmit() {
    if (!session || operationRef.current !== null) return;
    const submittingSession = session;
    // False once this session was disposed or replaced (unmount, retry, route
    // change). Then the page state belongs to someone else: a stale Submit must
    // not update it, and must not reset the operation lock of a newer session.
    const isCurrent = () => isActiveSession(sessionRef, submittingSession);
    operationRef.current = "submit";
    setOperation("submit");
    setRuntimeActionNotice(null);
    try {
      // submitMission never rejects, so `void handleSubmit()` cannot leak an
      // unhandled rejection from here.
      const outcome = await submitMission(submittingSession, code);
      if (outcome.kind === "cancelled") return;
      if (outcome.kind === "failed") {
        console.error("Mission submit failed.", outcome.error);
        if (isCurrent()) setRuntimeActionNotice(SUBMIT_FAILURE_NOTICE);
        return;
      }

      const { result } = outcome;
      if (isCurrent()) {
        setExecution(result.execution);
        if (result.execution.workspace !== undefined) {
          setWorkspace(result.execution.workspace);
        }
        setGrading(result.grading ?? null);
        setAttempt(result.attemptRecord);
      }
      if (result.attemptRecord.passed && isCurrent()) {
        setDraftSuppressed(true);
        setDraftNotice(null);
      }
      // Only the live session may clean up its draft, bound to the original
      // services. A stale completion (page left mid-persist, retry, reopen) must
      // not delete a draft saved by a newer session; the attempt itself is
      // already saved and is never cancelled.
      // KNOWN LIMITS (M5, draft ownership/versioning): (1) a passed mission left
      // mid-persist keeps its old draft, which a later open may resume; (2) a
      // draft save/delete already issued before navigation is not versioned, so
      // ordering against a newer session's draft relies on IndexedDB's
      // per-store transaction order only.
      if (shouldDeleteDraftAfterSubmit(outcome, isCurrent())) {
        try {
          await services.deleteMissionDraft(submittingSession.activity.id);
        } catch (error) {
          // The attempt itself is already saved; a stale draft is not worth an error banner.
          console.warn("Could not delete the mission draft after a passed submit.", error);
        }
      }
    } finally {
      if (isCurrent()) {
        operationRef.current = null;
        setOperation(null);
        setStopPending(false);
      }
    }
  }

  async function handleStop() {
    if (!session || !session.canInterrupt() || !executionActive || stopPending) return;
    setStopPending(true);
    const result = await session.interrupt();
    setRuntimeActionNotice(
      result.ok
        ? "Đã gửi lệnh dừng tiến trình Python. Đang chờ worker kết thúc sạch."
        : `${result.error.code ?? "RUNTIME_ERROR"}: ${result.error.message}`,
    );
    if (!result.ok) setStopPending(false);
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
    setRuntimeActionNotice(null);
    const previousSeed = session.instance.seed;
    const previousVariantIndex = bundle.variantIndex;

    releaseSession(sessionRef);

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
      setLoadError(result.error);
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
    const localRuntimeUnavailable = loadError.code === "LOCAL_RUNTIME_UNAVAILABLE";
    return (
      <section className="page-card" aria-labelledby="mission-title">
        <p className="eyebrow">Thực hành</p>
        <h1 id="mission-title">Không thể mở nhiệm vụ</h1>
        <p className="page-lead">{loadError.message}</p>
        {localRuntimeUnavailable ? (
          <section className="mission-runtime-recovery" aria-labelledby="mission-runtime-recovery-title">
            <h2 id="mission-runtime-recovery-title">Local Python chưa chạy</h2>
            <p>
              Mở một terminal tại project và chạy dịch vụ local trước. Dịch vụ chỉ bind vào máy của bạn và sẽ dùng cho các bài Data/ML cần CPU, RAM hoặc GPU thật.
            </p>
            <pre className="mission-code-sample">local-runtime\start-runtime.cmd</pre>
            <button
              className="primary-action"
              type="button"
              onClick={() => setLoadRetryToken((value) => value + 1)}
            >
              Thử kết nối lại
            </button>
          </section>
        ) : null}
        <Link className="secondary-action mission-error-back-link" to="/learn">
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
          Đang chuẩn bị Python runtime, dữ liệu nhiệm vụ và khôi phục tiến độ nếu có. Lần mở đầu tiên có thể mất vài giây.
        </p>
        <div className="mission-loading__bar" aria-hidden="true" />
      </section>
    );
  }

  const data = session.instance.learner.data ?? {};
  const lessonGuide = getMissionLessonGuide(session.activity.id);
  const quickCheck = getMissionQuickCheck(session.activity.id);

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

      <nav className="mission-tab-nav" aria-label="Khu vực nội dung của nhiệm vụ">
        <button className={tabClassName(activeTab === "lesson")} type="button" onClick={() => setActiveTab("lesson")}>Bài học</button>
        <button className={tabClassName(activeTab === "prompt")} type="button" onClick={() => setActiveTab("prompt")}>Đề bài</button>
        <button className={tabClassName(activeTab === "data")} type="button" onClick={() => setActiveTab("data")}>Dữ liệu</button>
        <button className={tabClassName(activeTab === "practice")} type="button" onClick={() => setActiveTab("practice")}>Làm bài</button>
      </nav>

      {activeTab === "practice" ? (
        <>
          <section className="mission-runtime-strip" aria-label="Python runtime">
            <div>
              <span className={`mission-runtime-badge ${isLocalRuntime ? "mission-runtime-badge--local" : ""}`}>
                {isLocalRuntime ? "Local Python" : "Pyodide"}
              </span>
              <strong>{isLocalRuntime ? "main.py · tài nguyên máy thật" : "Python trong trình duyệt"}</strong>
            </div>
            <span className="mission-runtime-state">
              {stopPending ? "STOPPING" : executionActive ? "RUNNING" : "READY"}
            </span>
          </section>

          {workspace !== null ? (
            <section className="mission-workspace-files" aria-label="Mission workspace">
              <div className="mission-workspace-files__group">
                <h2>Dữ liệu</h2>
                {(workspace?.datasets.length ?? 0) > 0 ? (
                  <ul className="mission-workspace-files__list">
                    {workspace!.datasets.map((file) => (
                      <li key={file.relativePath}>
                        <div>
                          <strong>{file.filename}</strong>
                          <code>{file.relativePath}</code>
                        </div>
                        <span>{formatWorkspaceBytes(file.bytes)}</span>
                        {file.description ? <p>{file.description}</p> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mission-workspace-files__empty">Bài này không có dataset được chuẩn bị sẵn.</p>
                )}
              </div>

              <div className="mission-workspace-files__group">
                <h2>File đầu ra</h2>
                {(workspace?.artifacts.length ?? 0) > 0 ? (
                  <ul className="mission-workspace-files__list">
                    {workspace!.artifacts.map((file) => (
                      <li key={file.relativePath}>
                        <div>
                          <strong>{file.filename}</strong>
                          <code>{file.relativePath}</code>
                        </div>
                        <span>
                          {formatWorkspaceBytes(file.bytes)}
                          {file.category ? ` · ${file.category}` : ""}
                          {file.extension ? ` · .${file.extension}` : ""}
                        </span>
                        {file.dataUrl ? (
                          <img
                            className="mission-workspace-files__image"
                            src={file.dataUrl}
                            alt={`Kết quả ${file.filename}`}
                            loading="lazy"
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mission-workspace-files__empty">Chưa có file trong artifacts/ từ lần chạy hiện tại.</p>
                )}
              </div>
            </section>
          ) : null}

          {runtimeActionNotice ? <p className="mission-runtime-notice">{runtimeActionNotice}</p> : null}

          <MissionControls
            runDisabled={operation !== null}
            submitDisabled={operation !== null}
            stopVisible={canInterrupt}
            stopDisabled={!executionActive || stopPending}
            stopPending={stopPending}
            onRun={() => void handleRun()}
            onSubmit={() => void handleSubmit()}
            onStop={() => void handleStop()}
            note={runtimeNote}
          />

          <div className="mission-workspace__main mission-workspace__main--practice">
            <section className="mission-editor-region" aria-labelledby="mission-editor-title">
              <div className="mission-editor-heading">
                <h2 id="mission-editor-title">main.py</h2>
                {isLocalRuntime ? <span>Local workspace</span> : null}
              </div>
              <PythonEditor value={code} onChange={setCode} readOnly={operation !== null} />
            </section>
          </div>

          {execution ? <MissionOutputPanel execution={execution} /> : null}

          {grading ? (
            <section className="mission-grading-region" aria-labelledby="mission-grading-title">
              <h2 id="mission-grading-title">Phản hồi chấm bài</h2>
              <GradingFeedback result={grading} />
            </section>
          ) : null}

          {session.hasHints() ? (
            <MissionHintPanel
              hints={revealedHints}
              remainingCount={session.getRemainingHintCount()}
              disabled={operation !== null}
              onReveal={handleRevealHint}
            />
          ) : null}

          {attempt ? (
            <section className="mission-attempt-evidence" aria-live="polite">
              <div>
                <strong>Đã lưu lần nộp #{attempt.submissionIndex}.</strong>{" "}
                {attempt.passed ? "Kết quả đạt yêu cầu." : "Kết quả chưa đạt; bạn có thể sửa và nộp lại."}
                {attempt.hintsUsed.length > 0 ? ` Gợi ý đã dùng: ${attempt.hintsUsed.join(", ")}.` : " Không dùng gợi ý."}
              </div>
              <div className="mission-retry-actions">
                <button className="secondary-action secondary-action--button" type="button" onClick={() => void handleRetry("same")}>Làm lại cùng đề</button>
                <button className="primary-action" type="button" onClick={() => void handleRetry("variant")}>Tạo đề mới</button>
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      {activeTab === "lesson" ? (
        <div className="mission-lesson-stack">
          <MissionLessonPanel guide={lessonGuide} />
          <MissionQuickCheck definition={quickCheck} activityId={session.activity.id} />
        </div>
      ) : null}

      {activeTab === "prompt" ? (
        <div className="mission-tab-content mission-tab-content--prompt">
          <MissionObjectivePanel objective={session.activity.description ?? session.instance.learner.objective} context={session.instance.learner.context} />
        </div>
      ) : null}

      {activeTab === "data" ? (
        <div className="mission-tab-content mission-tab-content--data">
          <MissionDataPanel data={data} />
        </div>
      ) : null}
    </section>
  );
}

function tabClassName(active: boolean): string {
  return active ? "mission-tab-button mission-tab-button--active" : "mission-tab-button";
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

function formatWorkspaceBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
