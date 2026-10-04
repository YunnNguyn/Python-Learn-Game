import { z } from "zod";

import type { MissionInstance } from "../../../core/domain";
import type {
  MissionInstanceValidationIssue,
  MissionInstanceValidationResult,
  MissionInstanceValidator,
} from "../../../core/missions";

export const HOSTILE_CONTACT_VALIDATION_CODE = {
  INVALID_DATA: "HOSTILE_CONTACT_INVALID_DATA",
  EMPTY_SELECTION: "HOSTILE_CONTACT_EMPTY_SELECTION",
  UNIVERSAL_SELECTION: "HOSTILE_CONTACT_UNIVERSAL_SELECTION",
} as const;

const learnerDataSchema = z.object({
  entityIds: z.array(z.string()),
  contacts: z.array(z.array(z.number().finite()).length(2)),
  distanceLimit: z.number().finite(),
  threatThreshold: z.number().finite(),
});

const gradingDataSchema = z.object({
  expectedEntityIds: z.array(z.string()),
});

function issue(
  code: (typeof HOSTILE_CONTACT_VALIDATION_CODE)[keyof typeof HOSTILE_CONTACT_VALIDATION_CODE],
  message: string,
): MissionInstanceValidationIssue {
  return { code, message };
}

function result(
  issues: readonly MissionInstanceValidationIssue[],
): MissionInstanceValidationResult {
  return { valid: issues.length === 0, issues: [...issues] };
}

function invalidData(): MissionInstanceValidationResult {
  return result([
    issue(
      HOSTILE_CONTACT_VALIDATION_CODE.INVALID_DATA,
      "Hostile Contact instance data is missing, malformed, or internally inconsistent.",
    ),
  ]);
}

export const hostileContactInstanceValidator: MissionInstanceValidator = {
  validate(instance) {
    const learnerData = learnerDataSchema.safeParse(instance.learner.data);
    const gradingData = gradingDataSchema.safeParse(instance.grading?.data);

    if (!learnerData.success || !gradingData.success) {
      return invalidData();
    }

    const { entityIds, contacts } = learnerData.data;
    const { expectedEntityIds } = gradingData.data;
    const entityIdSet = new Set(entityIds);
    const consistent =
      entityIds.length >= 3 &&
      contacts.length === entityIds.length &&
      new Set(entityIds).size === entityIds.length &&
      new Set(expectedEntityIds).size === expectedEntityIds.length &&
      expectedEntityIds.every((entityId) => entityIdSet.has(entityId));

    if (!consistent) {
      return invalidData();
    }

    if (expectedEntityIds.length === 0) {
      return result([
        issue(
          HOSTILE_CONTACT_VALIDATION_CODE.EMPTY_SELECTION,
          "Hostile Contact candidate selects no contacts.",
        ),
      ]);
    }

    if (expectedEntityIds.length === entityIds.length) {
      return result([
        issue(
          HOSTILE_CONTACT_VALIDATION_CODE.UNIVERSAL_SELECTION,
          "Hostile Contact candidate selects every contact.",
        ),
      ]);
    }

    return result([]);
  },
};
