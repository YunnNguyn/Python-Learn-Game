import { createContext, useContext, type ReactNode } from "react";

import type { PracticeServices } from "./practice-services";

const PracticeServicesContext = createContext<PracticeServices | null>(null);

export function PracticeServicesProvider({
  services,
  children,
}: {
  readonly services: PracticeServices;
  readonly children: ReactNode;
}) {
  return <PracticeServicesContext.Provider value={services}>{children}</PracticeServicesContext.Provider>;
}

export function usePracticeServices(): PracticeServices {
  const services = useContext(PracticeServicesContext);
  if (services === null) {
    throw new Error("PracticeServicesProvider is missing.");
  }
  return services;
}
