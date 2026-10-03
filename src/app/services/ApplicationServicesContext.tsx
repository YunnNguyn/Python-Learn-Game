import { createContext, useContext, type ReactNode } from "react";

import type { ApplicationServices } from "./application-services";

const ApplicationServicesContext = createContext<ApplicationServices | null>(null);

export function ApplicationServicesProvider({
  services,
  children,
}: {
  readonly services: ApplicationServices;
  readonly children: ReactNode;
}) {
  return (
    <ApplicationServicesContext.Provider value={services}>
      {children}
    </ApplicationServicesContext.Provider>
  );
}

export function useApplicationServices(): ApplicationServices {
  const services = useContext(ApplicationServicesContext);
  if (services === null) {
    throw new Error("ApplicationServicesProvider is missing.");
  }
  return services;
}
