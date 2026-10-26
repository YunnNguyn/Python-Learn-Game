import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { usePracticeServices, type PracticePackDetail } from "../../app/services";
import { NotFoundPage } from "../../app/pages/NotFoundPage";
import { PracticePackView, type Loadable } from "./PracticeCatalogView";
import { parsePracticeRoute } from "./practice-route";

/** `/practice/:packId` */
export function PracticePackPage() {
  const route = parsePracticeRoute(useParams());
  if (!route.ok) return <NotFoundPage />;
  return <LoadedPackPage packId={route.packId} />;
}

function LoadedPackPage({ packId }: { readonly packId: string }) {
  const services = usePracticeServices();
  const [state, setState] = useState<Loadable<PracticePackDetail>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void services.getPack(packId).then((result) => {
      if (cancelled) return;
      setState(result.ok ? { status: "ready", value: result.value } : { status: "error", error: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [services, packId]);

  return <PracticePackView packId={packId} state={state} />;
}
