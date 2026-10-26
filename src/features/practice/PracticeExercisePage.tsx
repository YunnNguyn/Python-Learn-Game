import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import {
  usePracticeServices,
  type CreateMissionSessionOptions,
  type PracticeExerciseDetail,
} from "../../app/services";
import { NotFoundPage } from "../../app/pages/NotFoundPage";
import { MissionObjectivePanel } from "../mission-workspace/MissionObjectivePanel";
import { MissionWorkspace, type MissionWorkspaceProfile } from "../mission-workspace/MissionWorkspacePage";
import { PracticeBriefPanel, PracticeOutcomePanel } from "./PracticeBrief";
import { parsePracticeRoute, practicePackPath } from "./practice-route";

/** `/practice/:packId/:exerciseId`: the existing mission workspace, opened on an imported exercise. */
export function PracticeExercisePage() {
  const route = parsePracticeRoute(useParams());
  if (!route.ok || route.exerciseId === undefined) return <NotFoundPage />;
  return <LoadedExercisePage packId={route.packId} exerciseId={route.exerciseId} />;
}

function LoadedExercisePage({ packId, exerciseId }: { readonly packId: string; readonly exerciseId: string }) {
  const services = usePracticeServices();
  const [detail, setDetail] = useState<PracticeExerciseDetail | null>(null);

  // The brief/feedback text. The session itself is opened by the workspace; if the
  // pack or exercise is missing the workspace shows that failure.
  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    void services.getExercise(packId, exerciseId).then((result) => {
      if (!cancelled && result.ok) setDetail(result.value);
    });
    return () => {
      cancelled = true;
    };
  }, [services, packId, exerciseId]);

  // Stable identity: a new function would reload the workspace.
  const openSession = useCallback(
    (options: CreateMissionSessionOptions) =>
      services.createExerciseSession(packId, exerciseId, {
        ...(options.resumeDraft !== undefined ? { resumeDraft: options.resumeDraft } : {}),
        ...(options.resetCode !== undefined ? { resetCode: options.resetCode } : {}),
      }),
    [services, packId, exerciseId],
  );

  const profile = useMemo<MissionWorkspaceProfile>(
    () => ({
      kind: "practice",
      backTo: practicePackPath(packId),
      backLabel: "Về danh sách bài",
      eyebrow: `Luyện tập${detail ? ` · ${detail.packTitle}` : ""}`,
      renderPrompt: (session) =>
        detail ? (
          <PracticeBriefPanel detail={detail} />
        ) : (
          <MissionObjectivePanel
            objective={session.activity.title}
            context={session.instance.learner.context}
          />
        ),
      renderOutcome: (attempt) => (detail ? <PracticeOutcomePanel detail={detail} attempt={attempt} /> : null),
    }),
    [detail, packId],
  );

  return <MissionWorkspace routeKey={`${packId}/${exerciseId}`} openSession={openSession} profile={profile} />;
}
