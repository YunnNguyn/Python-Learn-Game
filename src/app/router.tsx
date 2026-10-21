import { createBrowserRouter } from "react-router-dom";

import { ActivityLaunchPage } from "../features/activity";
import { CoursePage, LearnPage } from "../features/course";
import { DebugPage } from "../features/debug";
import { HomePage } from "../features/home";
import { LessonPage } from "../features/lesson";
import { PracticeHomePage, PracticePackPage } from "../features/practice";
import { SettingsPage } from "../features/settings";
import { RobotWorkshopPage } from "../features/workshop";
import { AppLayout } from "./AppLayout";
import { AboutPage } from "./pages/AboutPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export const appRouter = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: "learn",
        element: <LearnPage />,
      },
      {
        path: "course/:courseId",
        element: <CoursePage />,
      },
      {
        path: "lesson/:lessonId",
        element: <LessonPage />,
      },
      {
        path: "activity/:activityId",
        element: <ActivityLaunchPage />,
      },
      {
        path: "mission/:missionId",
        lazy: async () => {
          const { MissionWorkspacePage } = await import("../features/mission-workspace");

          return { Component: MissionWorkspacePage };
        },
      },
      {
        path: "practice",
        element: <PracticeHomePage />,
      },
      {
        path: "practice/:packId",
        element: <PracticePackPage />,
      },
      {
        path: "practice/:packId/:exerciseId",
        lazy: async () => {
          const { PracticeExercisePage } = await import("../features/practice/PracticeExercisePage");

          return { Component: PracticeExercisePage };
        },
      },
      {
        path: "workshop",
        element: <RobotWorkshopPage />,
      },
      {
        path: "settings",
        element: <SettingsPage />,
      },
      ...(import.meta.env.DEV
        ? [
            {
              path: "dev",
              element: <DebugPage />,
            },
          ]
        : []),
      {
        path: "about",
        element: <AboutPage />,
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
]);
