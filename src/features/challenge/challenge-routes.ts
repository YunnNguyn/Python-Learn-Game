import type { RouteObject } from "react-router-dom";

/*
 * Route table of the Challenge feature, kept out of router.tsx so route matching is testable in Node.
 * Every component is lazy: the shell pulls in the services and the private solution, so none of it
 * is part of the initial bundle.
 */
export const challengeRoute: RouteObject = {
  path: "challenge",
  lazy: async () => {
    const { ChallengeShell } = await import("./ChallengeShell");
    return { Component: ChallengeShell };
  },
  children: [
    {
      index: true,
      lazy: async () => {
        const { ChallengeListPage } = await import("./ChallengeListPage");
        return { Component: ChallengeListPage };
      },
    },
    {
      path: ":challengeId",
      lazy: async () => {
        const { ChallengeDetailPage } = await import("./ChallengeDetailPage");
        return { Component: ChallengeDetailPage };
      },
    },
  ],
};
