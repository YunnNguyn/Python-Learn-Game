import { useSyncExternalStore } from "react";

import type { ApplicationInitializationState } from "./application-services";
import { useApplicationServices } from "./ApplicationServicesContext";

/**
 * Startup status of the current service set: `pending`, `ready` or `failed`
 * (with the underlying error). It only observes; it never retries.
 */
export function useApplicationInitialization(): ApplicationInitializationState {
  const services = useApplicationServices();
  return useSyncExternalStore(
    (listener) => services.subscribeInitialization(listener),
    () => services.getInitializationState(),
    () => services.getInitializationState(),
  );
}
