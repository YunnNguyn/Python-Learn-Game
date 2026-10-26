import { RouterProvider } from "react-router-dom";

import { AppErrorBoundary } from "./AppErrorBoundary";
import { appRouter } from "./router";
import {
  ApplicationServicesProvider,
  PracticeServicesProvider,
  createApplicationServices,
  createPracticeServices,
} from "./services";
import "./app.css";

const applicationServices = createApplicationServices();
// A separate service set with its own storage: imported Exercise Packs and their practice progress.
const practiceServices = createPracticeServices();

export function App() {
  return (
    <AppErrorBoundary>
      <ApplicationServicesProvider services={applicationServices}>
        <PracticeServicesProvider services={practiceServices}>
          <RouterProvider router={appRouter} />
        </PracticeServicesProvider>
      </ApplicationServicesProvider>
    </AppErrorBoundary>
  );
}
