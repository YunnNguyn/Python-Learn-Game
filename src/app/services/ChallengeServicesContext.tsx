import { createContext, useContext, type ReactNode } from "react";

import type { ChallengeServices } from "./challenge-services";

const ChallengeServicesContext = createContext<ChallengeServices | null>(null);

export function ChallengeServicesProvider({
  services,
  children,
}: {
  readonly services: ChallengeServices;
  readonly children: ReactNode;
}) {
  return <ChallengeServicesContext.Provider value={services}>{children}</ChallengeServicesContext.Provider>;
}

export function useChallengeServices(): ChallengeServices {
  const services = useContext(ChallengeServicesContext);
  if (services === null) {
    throw new Error("ChallengeServicesProvider is missing.");
  }
  return services;
}
