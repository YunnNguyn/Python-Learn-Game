import { useEffect, useSyncExternalStore } from "react";

import { useApplicationServices } from "./ApplicationServicesContext";

export function useMetaProgression() {
  const services = useApplicationServices();
  const snapshot = useSyncExternalStore(
    (listener) => services.metaProgression.subscribe(listener),
    () => services.metaProgression.getSnapshot(),
    () => services.metaProgression.getSnapshot(),
  );

  useEffect(() => {
    void services.initialize();
  }, [services]);

  return {
    metaProgression: services.metaProgression,
    snapshot,
  };
}
