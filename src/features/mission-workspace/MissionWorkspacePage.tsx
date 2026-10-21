import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import {
  useApplicationServices,
  type CreateMissionSessionOptions,
  type CreateMissionSessionResult,
  type MissionDraftStatus,
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
import { isActiveSession, releaseSession, submitMission } from "./submit-mission";
import { GradingFeedback } from "./grading-feedback";
import { getMissionLessonGuide, getMissionQuickCheck } from "./mission-lesson-guides";

type WorkspaceOperation = "run" | "submit" | "reload" | null;
type RetryMode = "same" | "variant";
type MissionWorkspaceTab = "lesson" | "prompt" | "data" | "practice";

const SUBMIT_FAILURE_NOTICE =
  "Không thể lưu lần nộp này. Bằng chứng học tập có thể chưa được ghi lại đầy đủ; hãy thử nộp lại.";

const IDLE_DRAFT_STATUS: MissionDraftStatus = Object.freeze({ kind: "idle" });
const NO_DRAFT_SUBSCRIPTION = (_listener: () => void): (() => void) => () => undefined;

/**
 * What the learner is told about the draft - only what is true: "saved" appears
 * once the write has actually been stored, never when it was merely scheduled.
 */
function draftStatusText(status: MissionDraftStatus): string | null {
  switch (status.kind) {
    case "scheduled":
      return "Đang chờ lưu bản nháp...";
    case "saving":
      return "Đang lưu bản nháp...";
    case "saved":
      return "Đã lưu bản nháp.";
    case "failed":
      return "Chưa lưu được bản nháp. Mã của bạn vẫn còn trong trình soạn thảo; hãy tiếp tục làm bài hoặc sửa nhẹ để thử lưu lại.";
    default:
      return null;
  }
}

/**
 * What differs between the CS116 course workspace and the practice workspace
 * (PHASE-05-M7). Everything else - the Monaco editor, Run/Submit, hints, the
 * draft handle, output and grading panels - is the same code for both.
 */
export interface MissionWorkspaceProfile {
  readonly kind: "course" | "practice";
  /** Where the heading link and the error screen lead back to. */
  readonly backTo: string;
  readonly backLabel: string;
  /** Practice: replaces "Thực hành · <stage>" in the eyebrow. */
  readonly eyebrow?: string;
  /** Practice: the exercise brief shown on the "Đề bài" tab (course uses the mission objective). */
  readonly renderPrompt?: (session: MissionAttemptSession) => ReactNode;
  /** Practice: shown above the editor controls (for example the review-before-running notice). */
  readonly editorNotice?: ReactNode;
  /** Practice: shown after a Submit with its attempt (feedback, explanation, next exercise). */
  readonly renderOutcome?: (attempt: AttemptRecord) => ReactNode;
}

const COURSE_PROFILE: MissionWorkspaceProfile = Object.freeze({
  kind: "course",
  backTo: "/learn",
  backLabel: "Về lộ trình",
});

/** The CS116 mission route. Behavior is unchanged: it only supplies its session opener. */
export function MissionWorkspacePage() {
  const { missionId } = useParams();
  const routeId = missionId?.trim();
  const services = useApplicationServices();
  const openSession = useCallback(
    (options: CreateMissionSessionOptions) => services.createMissionSession(routeId ?? "", options),
    [routeId, services],
  );
  return <MissionWorkspace routeKey={routeId} openSession={openSession} profile={COURSE_PROFILE} />;
}

export interface MissionWorkspaceProps {
  /** Identifies the mission; a change reloads the workspace. Undefined/empty = no mission in the route. */
  readonly routeKey: string | undefined;
  /** MUST be stable (useCallback): a new identity reloads the workspace. */
  readonly openSession: (options: CreateMissionSessionOptions) => Promise<CreateMissionSessionResult>;
  readonly profile: MissionWorkspaceProfile;
}

export function MissionWorkspace({ routeKey: routeId, openSession, profile }: MissionWorkspaceProps) {
  const isPractice = profile.kind === "practice";
  const defaultTab: MissionWorkspaceTab = isPractice ? "prompt" : "lesson";
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
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MissionWorkspaceTab>(defaultTab);
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
    setDraftNotice(null);
    setActiveTab(defaultTab);
    setStopPending(false);
    setRuntimeActionNotice(null);
    setWorkspace(null);

    if (!routeId) {
      setLoadError({ code: "MISSION_ROUTE_MISSING", message: "Không xác định được bài thực hành cần mở." });
      setLoading(false);
      return () => undefined;
    }

    void openSession({ resumeDraft: true }).then((result) => {
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
  }, [routeId, openSession, loadRetryToken, defaultTab]);

  const session = bundle?.session ?? null;
  const isLocalRuntime = session?.template.runtime.id === CORE_RUNTIME_ID.LOCAL_PYTHON;
  const canInterrupt = session?.canInterrupt() === true;
  const executionActive = operation === "run" || operation === "submit";

  // The draft belongs to the session: its debounce timer, write ordering and
  // cleanup live in the service set (see mission-draft-scheduler.ts). The page
  // only reports the latest editor state - code and revealed hints as one
  // snapshot - and has no timer to cancel, so React effect cleanup/remount
  // (StrictMode) cannot drop or duplicate a save.
  const draft = bundle?.draft ?? null;
  useEffect(() => {
    if (!draft || !session || loading) return;
    draft.update({ code, hintsUsed: session.getRevealedHints().map((hint) => hint.level) });
  }, [code, draft, loading, revealedHints, session]);

  const subscribeDraft = useMemo(
    () => (draft ? (listener: () => void) => draft.subscribe(listener) : NO_DRAFT_SUBSCRIPTION),
    [draft],
  );
  const draftStatus = useSyncExternalStore(
    subscribeDraft,
    () => draft?.getStatus() ?? IDLE_DRAFT_STATUS,
    () => IDLE_DRAFT_STATUS,
  );

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
    setDraftNotice(next.resumedDraft ? "Đã khôi phục bản nháp và đề đang làm trước đó." : null);
    setRuntimeActionNotice(null);
    setStopPending(false);
    setWorkspace(next.initialWorkspace ?? null);
    setLoading(false);
    setOperation(null);
    setActiveTab(defaultTab);
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
      if (result.attemptRecord.passed && isCurrent()) setDraftNotice(null);
      // The draft needs no handling here: a passed attempt discards it inside the
      // service set, in the same admitted operation that stored the attempt, and
      // the draft handle ignores every later change. A failed or cancelled Submit
      // leaves the draft untouched. This also holds for a completion that arrives
      // after the page left (the old "stale Submit" limit).
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
    // Code and hints are saved as one snapshot, now. Whether it is stored is
    // reported by the draft status below, not claimed here.
    draft?.update({ code, hintsUsed: hints.map((item) => item.level) }, { immediate: true });
    setDraftNotice("Gợi ý vừa mở sẽ xuất hiện trong bằng chứng lần nộp.");
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

    const result = await openSession(options);
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
    const localRuntimeUnavailable = !isPractice && loadError.code === "LOCAL_RUNTIME_UNAVAILABLE";
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
        <Link className="secondary-action mission-error-back-link" to={profile.backTo}>
          {isPractice ? profile.backLabel : "Về không gian học"}
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
  const lessonGuide = isPractice ? null : getMissionLessonGuide(session.activity.id);
  const quickCheck = isPractice ? null : getMissionQuickCheck(session.activity.id);

  return (
    <section className="page-card mission-workspace" aria-labelledby="mission-title">
      <div className="mission-heading-row">
        <div>
          <p className="eyebrow">
            {isPractice
              ? (profile.eyebrow ?? "Luyện tập")
              : `Thực hành · ${stageLabel(session.activity.stage)} · Biến thể #${bundle.variantIndex + 1}`}
          </p>
          <h1 id="mission-title">{session.activity.title}</h1>
        </div>
        <Link className="secondary-action mission-back-link" to={profile.backTo}>
          {profile.backLabel}
        </Link>
      </div>
      <p className="page-lead">
        Viết mã trực tiếp, dùng Chạy thử để khám phá và Nộp bài khi muốn chấm trên môi trường sạch.
      </p>
      {draftNotice ? <p className="mission-draft-notice">{draftNotice}</p> : null}
      {draftStatusText(draftStatus) ? (
        <p className="mission-draft-notice" role="status" aria-live="polite">
          {draftStatusText(draftStatus)}
        </p>
      ) : null}

      <nav className="mission-tab-nav" aria-label="Khu vực nội dung của nhiệm vụ">
        {isPractice ? null : (
          <button className={tabClassName(activeTab === "lesson")} type="button" onClick={() => setActiveTab("lesson")}>Bài học</button>
        )}
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

          {profile.editorNotice ?? null}

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
                {isPractice ? null : (
                  <button className="primary-action" type="button" onClick={() => void handleRetry("variant")}>Tạo đề mới</button>
                )}
              </div>
            </section>
          ) : null}

          {attempt && profile.renderOutcome ? profile.renderOutcome(attempt) : null}
        </>
      ) : null}

      {activeTab === "lesson" && !isPractice ? (
        <div className="mission-lesson-stack">
          <MissionLessonPanel guide={lessonGuide} />
          <MissionQuickCheck definition={quickCheck} activityId={session.activity.id} />
        </div>
      ) : null}

      {activeTab === "prompt" ? (
        <div className="mission-tab-content mission-tab-content--prompt">
          {profile.renderPrompt ? (
            profile.renderPrompt(session)
          ) : (
            <MissionObjectivePanel objective={session.activity.description ?? session.instance.learner.objective} context={session.instance.learner.context} />
          )}
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
