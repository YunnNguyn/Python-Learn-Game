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
    // Drive the single startup path (reward-safe snapshot first). A failure is
    // observable through useApplicationInitialization(), so it is not rethrown here.
    services.initialize().catch(() => undefined);
  }, [services]);

  return {
    learning: services.learning,
    snapshot,
  };
}
