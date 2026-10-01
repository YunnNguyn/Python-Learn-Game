import type { GraderId } from "../domain";

import { gradeDeclaratively } from "./declarative-grader";
import type { Grader } from "./grader";
import type { GraderRegistry } from "./grader-registry";

export const CORE_GRADER_ID = {
  DECLARATIVE: "core.declarative" as GraderId,
} as const;

export const declarativeGrader: Grader = {
  grade({ config, execution }) {
    if (config === undefined) {
      throw new Error("Declarative grader requires grader config.");
    }

    return gradeDeclaratively(config, execution);
  },
};

export function registerCoreGraders(registry: GraderRegistry): void {
  registry.registerGrader(CORE_GRADER_ID.DECLARATIVE, declarativeGrader);
}
