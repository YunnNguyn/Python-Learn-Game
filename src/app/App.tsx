import { RouterProvider } from "react-router-dom";

import { AppErrorBoundary } from "./AppErrorBoundary";
import { appRouter } from "./router";
import {
  ApplicationServicesProvider,
  createApplicationServices,
} from "./services";
import "./app.css";

const applicationServices = createApplicationServices();

export function App() {
  return (
    <AppErrorBoundary>
      <ApplicationServicesProvider services={applicationServices}>
        <RouterProvider router={appRouter} />
      </ApplicationServicesProvider>
    </AppErrorBoundary>
  );
}
