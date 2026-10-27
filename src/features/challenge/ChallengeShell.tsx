import { Outlet } from "react-router-dom";

import { ChallengeServicesProvider } from "../../app/services";
import { challengeServices } from "./challenge-runtime";

/** Layout of every `/challenge/...` route: provides the Challenge services. */
export function ChallengeShell() {
  return (
    <ChallengeServicesProvider services={challengeServices}>
      <Outlet />
    </ChallengeServicesProvider>
  );
}
