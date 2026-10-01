import { z } from "zod";

import type { MissionInstance } from "../../../core/domain";

export interface ThresholdFilterReferenceResult {
  readonly expectedEntityIds: readonly string[];
}

const learnerDataSchema = z.object({
  entityIds: z.array(z.string().min(1)).min(1),
  values: z.array(z.number().finite()).min(1),
  threshold: z.number().finite(),
  comparison: z.enum(["GT", "GTE"]),
});

export function solveThresholdFilterReference(
  instance: MissionInstance,
): ThresholdFilterReferenceResult {
  const { entityIds, values, threshold, comparison } = learnerDataSchema.parse(
    instance.learner.data,
  );

  if (entityIds.length !== values.length) {
    throw new TypeError(
      "Threshold Filter reference solver requires entityIds and values with equal lengths.",
    );
  }

  if (new Set(entityIds).size !== entityIds.length) {
    throw new TypeError(
      "Threshold Filter reference solver requires unique entityIds.",
    );
  }

  const expectedEntityIds = entityIds.filter((_, index) => {
    const value = values[index]!;
    return comparison === "GT" ? value > threshold : value >= threshold;
  });

  return {
    expectedEntityIds: [...expectedEntityIds],
  };
}
