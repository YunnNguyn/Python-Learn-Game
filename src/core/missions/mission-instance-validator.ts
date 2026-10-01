import type { MissionInstance } from "../domain";

export interface MissionInstanceValidationIssue {
  readonly code: string;
  readonly message: string;
}

export interface MissionInstanceValidationResult {
  readonly valid: boolean;
  readonly issues: readonly MissionInstanceValidationIssue[];
}

export interface MissionInstanceValidator {
  validate(instance: MissionInstance): MissionInstanceValidationResult;
}
