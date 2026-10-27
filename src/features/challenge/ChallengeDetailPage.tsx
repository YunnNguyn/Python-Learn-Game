import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { useChallengeServices } from "../../app/services";
import { challengePresentation } from "../../content/challenges/presentations";
import {
  ChallengeBriefPanel,
  ChallengeHistoryPanel,
  ChallengeNotFoundView,
  ChallengeSubmitPanel,
  PRACTICE_NOT_EXAM_NOTE,
} from "./ChallengeViews";
import {
  describeReadError,
  describeSubmitOutcome,
  validateUploadFile,
  type ChallengeHistory,
  type ChallengeNotice,
  type Loadable,
} from "./challenge-view-models";

/** `/challenge/:challengeId`. Fetches and wires events; all markup lives in ChallengeViews. */
export function ChallengeDetailPage() {
  const { challengeId = "" } = useParams();
  const services = useChallengeServices();
  // The catalog is static and synchronous: the brief renders at once, only history is loaded.
  const lookup = useMemo(() => services.getChallenge(challengeId), [services, challengeId]);
  const presentation = challengePresentation(challengeId);

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ChallengeNotice | null>(null);
  const [history, setHistory] = useState<Loadable<ChallengeHistory>>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const submitting = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!lookup.ok) return;
    let cancelled = false;
    void Promise.all([services.listSubmissions(challengeId), services.getBest(challengeId)]).then(([list, best]) => {
      if (cancelled) return;
      if (!list.ok) setHistory({ status: "error", error: list.error });
      else if (!best.ok) setHistory({ status: "error", error: best.error });
      else setHistory({ status: "ready", value: { submissions: list.value, best: best.value } });
    });
    return () => {
      cancelled = true;
    };
  }, [services, challengeId, lookup.ok, reloadToken]);

  const handleTextChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
    setNotice(null);
  }, []);

  const maxBytes = lookup.ok ? lookup.value.limits.maxSubmissionBytes : 0;

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = ""; // choosing the same file again must fire again
      if (!file) return;
      const refusal = validateUploadFile(file, maxBytes);
      if (refusal !== null) {
        // Refused before reading: a wrong or huge file is never loaded into memory.
        setNotice(refusal);
        return;
      }
      try {
        const content = await file.text();
        if (!mounted.current) return;
        setText(content);
        setNotice({ tone: "info", title: "Đã nạp tệp", detail: `${file.name} đã được đưa vào ô soạn thảo. Kiểm tra rồi bấm “Nộp bài”.` });
      } catch {
        if (mounted.current) setNotice({ tone: "error", title: "Không đọc được tệp", detail: "Trình duyệt không cho đọc tệp này." });
      }
    },
    [maxBytes],
  );

  const handleLoadSample = useCallback(async () => {
    if (presentation === undefined) return;
    try {
      const response = await fetch(presentation.sampleSubmissionUrl);
      if (!response.ok) throw new Error(String(response.status));
      const content = await response.text();
      if (!mounted.current) return;
      setText(content);
      setNotice({ tone: "info", title: "Đã nạp bài nộp mẫu", detail: "Hãy sửa các giá trị dự đoán rồi bấm “Nộp bài”." });
    } catch {
      if (mounted.current) {
        setNotice({ tone: "error", title: "Không tải được bài nộp mẫu", detail: "Bạn có thể tải sample_submission.csv ở mục Dữ liệu rồi tải lên." });
      }
    }
  }, [presentation]);

  const handleSubmit = useCallback(async () => {
    if (!lookup.ok || submitting.current) return; // a second click while pending is ignored
    submitting.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await services.submit(challengeId, text);
      if (!mounted.current) return;
      setNotice(describeSubmitOutcome(outcome, lookup.value));
      if (outcome.status === "saved") setReloadToken((value) => value + 1);
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [services, challengeId, text, lookup]);

  if (!lookup.ok || presentation === undefined) {
    return (
      <section className="page-card learning-page practice-page challenge-page" aria-labelledby="challenge-title">
        <h1 id="challenge-title">Thử thách</h1>
        <ChallengeNotFoundView notice={describeReadError(lookup.ok ? { code: "NOT_FOUND", message: "Không tìm thấy thử thách này." } : lookup.error)} />
      </section>
    );
  }

  const summary = lookup.value;
  return (
    <section className="page-card learning-page practice-page challenge-page" aria-labelledby="challenge-title">
      <p className="eyebrow">
        <Link to="/challenge">Thử thách</Link> · phiên bản {summary.version}
      </p>
      <h1 id="challenge-title">{summary.title}</h1>
      <p className="practice-security-note">{PRACTICE_NOT_EXAM_NOTE}</p>
      <ChallengeBriefPanel summary={summary} presentation={presentation} />
      <ChallengeSubmitPanel
        summary={summary}
        text={text}
        busy={busy}
        notice={notice}
        onTextChange={handleTextChange}
        onFileChange={(event) => void handleFileChange(event)}
        onLoadSample={() => void handleLoadSample()}
        onSubmit={() => void handleSubmit()}
      />
      <ChallengeHistoryPanel summary={summary} state={history} />
    </section>
  );
}
