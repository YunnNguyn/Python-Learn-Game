import type { JsonObject } from "../domain";

import type { GraderExecutionSnapshot } from "./grader-execution-snapshot";
import type { GraderResult } from "./grader-result";

export interface GraderContext {
  readonly config?: JsonObject;
  readonly gradingData?: JsonObject;
  readonly execution: GraderExecutionSnapshot;
}

export interface Grader {
  grade(context: GraderContext): GraderResult;
}
