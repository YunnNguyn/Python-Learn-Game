import { useEffect, useSyncExternalStore } from "react";

import { useApplicationServices } from "./ApplicationServicesContext";

export function useLearningProgress() {
  const services = useApplicationServices();
  const snapshot = useSyncExternalStore(
    (listener) => services.learning.subscribe(listener),
    () => services.learning.getSnapshot(),
    () => services.learning.getSnapshot(),
  );

  useEffect(() => {
    void services.learning.initialize();
  }, [services]);

  return {
    learning: services.learning,
    snapshot,
  };
}
