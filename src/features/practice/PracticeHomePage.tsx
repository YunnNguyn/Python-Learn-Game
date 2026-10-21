import { useCallback, useEffect, useState } from "react";

import { usePracticeServices, type PracticeCatalog } from "../../app/services";
import { PracticeCatalogView, type Loadable } from "./PracticeCatalogView";
import { PracticeImportPanel } from "./PracticeImportPanel";

/** `/practice`: import packs and browse the installed ones. */
export function PracticeHomePage() {
  const services = usePracticeServices();
  const [state, setState] = useState<Loadable<PracticeCatalog>>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void services.listPacks().then((result) => {
      if (cancelled) return;
      setState(result.ok ? { status: "ready", value: result.value } : { status: "error", error: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [services, reloadToken]);

  const handleInstalled = useCallback(() => setReloadToken((value) => value + 1), []);

  return (
    <section className="page-card learning-page practice-page" aria-labelledby="practice-title">
      <p className="eyebrow">Luyện tập</p>
      <h1 id="practice-title">Bài luyện tập từ Exercise Pack</h1>
      <p className="page-lead">
        Nhập bộ bài tập (do bạn hoặc một công cụ khác tạo ra) và luyện ngay trong trình soạn thảo Python. Tiến độ luyện
        tập được lưu riêng trên thiết bị này, không ảnh hưởng đến lộ trình CS116 hay phần thưởng của robot.
      </p>
      <PracticeImportPanel onInstalled={handleInstalled} />
      <PracticeCatalogView state={state} />
    </section>
  );
}
