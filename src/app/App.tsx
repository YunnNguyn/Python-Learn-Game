import { RouterProvider } from "react-router-dom";

import { AppErrorBoundary } from "./AppErrorBoundary";
import { appRouter } from "./router";
import "./app.css";

export function App() {
  return (
    <AppErrorBoundary>
      <RouterProvider router={appRouter} />
    </AppErrorBoundary>
  );
}
