import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { usePracticeServices } from "../../app/services";
import {
  EXERCISE_PACK_LIMITS,
  type ValidateExercisePackResult,
} from "../../core/exercise-packs";
import { PracticeIssuesList } from "./PracticeIssuesList";
import { PracticeNoticeBox } from "./PracticeNoticeBox";
import { PracticePackPreview } from "./PracticePackPreview";
import {
  describeInstallOutcome,
  formatBytes,
  previewPack,
  type PracticeNotice,
} from "./practice-view-models";

interface Checked {
  readonly text: string;
  readonly result: ValidateExercisePackResult;
}

/**
 * Import from a local file or pasted JSON: check first, review, then install.
 * Nothing is installed, stored or executed by choosing a file or checking it.
 */
export function PracticeImportPanel({ onInstalled }: { readonly onInstalled: () => void }) {
  const services = usePracticeServices();
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<Checked | null>(null);
  const [notice, setNotice] = useState<PracticeNotice | null>(null);
  const [installIssues, setInstallIssues] = useState<ValidateExercisePackResult | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function check(source: string) {
    setNotice(null);
    setInstallIssues(null);
    setChecked({ text: source, result: services.validatePack(source) });
  }

  function handleTextChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setText(event.target.value);
    setChecked(null);
    setInstallIssues(null);
    setNotice(null);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // choosing the same file again must fire again
    if (!file) return;
    setChecked(null);
    setInstallIssues(null);
    if (file.size > EXERCISE_PACK_LIMITS.maxPackBytes) {
      // Refused before reading: a huge file is never loaded into memory.
      setText("");
      setNotice({
        tone: "error",
        title: "File quá lớn",
        detail: `Pack tối đa ${formatBytes(EXERCISE_PACK_LIMITS.maxPackBytes)}; file này là ${formatBytes(file.size)}.`,
      });
      return;
    }
    let content: string;
    try {
      content = await file.text();
    } catch {
      if (mounted.current) {
        setNotice({ tone: "error", title: "Không đọc được file", detail: "Trình duyệt không cho đọc file này." });
      }
      return;
    }
    if (!mounted.current) return;
    setText(content);
    check(content);
  }

  async function handleInstall() {
    if (busy || checked === null || !checked.result.ok || checked.text !== text) return;
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await services.installPack(checked.text);
      if (!mounted.current) return;
      setNotice(describeInstallOutcome(outcome));
      setInstallIssues(outcome.status === "rejected" ? { ok: false, issues: outcome.issues } : null);
      if (outcome.status === "installed" || outcome.status === "already-installed") {
        setText("");
        setChecked(null);
        onInstalled();
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const result = checked?.result ?? null;
  const upToDate = checked !== null && checked.text === text;
  const canInstall = upToDate && result?.ok === true && !busy;

  return (
    <section className="practice-import" aria-labelledby="practice-import-title">
      <h2 id="practice-import-title">Nhập Exercise Pack</h2>
      <p>
        Chọn file <code>.json</code> trên máy của bạn hoặc dán nội dung JSON. Pack được kiểm tra đầy đủ trước khi cài
        và chỉ lưu trong trình duyệt này.
      </p>

      <div className="practice-import__file">
        <label className="secondary-action secondary-action--button" htmlFor="practice-pack-file">
          Chọn file pack (.json)
        </label>
        <input
          id="practice-pack-file"
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept=".json,application/json"
          onChange={(event) => void handleFile(event)}
        />
      </div>

      <label className="practice-import__label" htmlFor="practice-pack-text">
        Hoặc dán JSON của pack
      </label>
      <textarea
        id="practice-pack-text"
        className="practice-import__textarea"
        value={text}
        onChange={handleTextChange}
        spellCheck={false}
        rows={8}
        placeholder='{ "format": "python-learn-game.exercise-pack", "schemaVersion": 1, ... }'
      />

      <div className="practice-import__actions">
        <button
          className="secondary-action secondary-action--button"
          type="button"
          disabled={busy || text.trim() === ""}
          onClick={() => check(text)}
        >
          Kiểm tra pack
        </button>
        <button className="primary-action" type="button" disabled={!canInstall} onClick={() => void handleInstall()}>
          {busy ? "Đang cài đặt..." : "Cài đặt pack"}
        </button>
      </div>

      {notice ? <PracticeNoticeBox notice={notice} /> : null}
      {installIssues && !installIssues.ok ? <PracticeIssuesList issues={installIssues.issues} /> : null}

      {upToDate && result ? (
        result.ok ? (
          <PracticePackPreview preview={previewPack(result.pack, result.warnings)} />
        ) : (
          <>
            <PracticeNoticeBox
              notice={{
                tone: "error",
                title: "Pack không hợp lệ",
                detail: "Không có gì được lưu. Sửa các lỗi bên dưới rồi kiểm tra lại.",
              }}
            />
            <PracticeIssuesList issues={result.issues} />
          </>
        )
      ) : null}
    </section>
  );
}
