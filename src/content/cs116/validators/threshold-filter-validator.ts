import { z } from "zod";

import type { MissionInstance } from "../../../core/domain";
import type {
  MissionInstanceValidationIssue,
  MissionInstanceValidationResult,
  MissionInstanceValidator,
} from "../../../core/missions";

export const THRESHOLD_FILTER_VALIDATION_CODE = {
  INVALID_DATA: "THRESHOLD_FILTER_INVALID_DATA",
  EMPTY_SELECTION: "THRESHOLD_FILTER_EMPTY_SELECTION",
  UNIVERSAL_SELECTION: "THRESHOLD_FILTER_UNIVERSAL_SELECTION",
} as const;

const learnerDataSchema = z.object({
  entityIds: z.array(z.string()),
  values: z.array(z.number().finite()),
  threshold: z.number().finite(),
  comparison: z.enum(["GT", "GTE"]),
});

const gradingDataSchema = z.object({
  expectedEntityIds: z.array(z.string()),
});

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function issue(
  code: (typeof THRESHOLD_FILTER_VALIDATION_CODE)[keyof typeof THRESHOLD_FILTER_VALIDATION_CODE],
  message: string,
): MissionInstanceValidationIssue {
  return { code, message };
}

function result(
  issues: readonly MissionInstanceValidationIssue[],
): MissionInstanceValidationResult {
  return {
    valid: issues.length === 0,
    issues: [...issues],
  };
}

function invalidData(): MissionInstanceValidationResult {
  return result([
    issue(
      THRESHOLD_FILTER_VALIDATION_CODE.INVALID_DATA,
      "Threshold Filter instance data is missing, malformed, or internally inconsistent.",
    ),
  ]);
}

function validateThresholdFilterInstance(
  instance: MissionInstance,
): MissionInstanceValidationResult {
  const learnerData = learnerDataSchema.safeParse(instance.learner.data);
  const gradingData = gradingDataSchema.safeParse(instance.grading?.data);

  if (!learnerData.success || !gradingData.success) {
    return invalidData();
  }

  const { entityIds, values } = learnerData.data;
  const { expectedEntityIds } = gradingData.data;

  const entityIdSet = new Set(entityIds);
  const consistent =
    entityIds.length >= 2 &&
    values.length === entityIds.length &&
    hasUniqueValues(entityIds) &&
    hasUniqueValues(expectedEntityIds) &&
    expectedEntityIds.every((entityId) => entityIdSet.has(entityId));

  if (!consistent) {
    return invalidData();
  }

  if (expectedEntityIds.length === 0) {
    return result([
      issue(
        THRESHOLD_FILTER_VALIDATION_CODE.EMPTY_SELECTION,
        "Threshold Filter candidate selects no entities.",
      ),
    ]);
  }

  if (expectedEntityIds.length === entityIds.length) {
    return result([
      issue(
        THRESHOLD_FILTER_VALIDATION_CODE.UNIVERSAL_SELECTION,
        "Threshold Filter candidate selects every entity.",
      ),
    ]);
  }

  return result([]);
}

export const thresholdFilterInstanceValidator: MissionInstanceValidator = {
  validate: validateThresholdFilterInstance,
};
