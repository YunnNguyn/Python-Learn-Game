import { z } from "zod";

import type { MissionInstance } from "../../../core/domain";

export interface HostileContactReferenceResult {
  readonly contacts: readonly (readonly [number, number])[];
  readonly shape: readonly [number, 2];
  readonly ndim: 2;
  readonly distanceColumn: readonly number[];
  readonly threatColumn: readonly number[];
  readonly mask: readonly boolean[];
  readonly expectedEntityIds: readonly string[];
}

const learnerDataSchema = z.object({
  entityIds: z.array(z.string().min(1)).min(1),
  contacts: z.array(z.array(z.number().finite()).length(2)).min(1),
  distanceLimit: z.number().finite(),
  threatThreshold: z.number().finite(),
});

export function solveHostileContactReference(
  instance: MissionInstance,
): HostileContactReferenceResult {
  const { entityIds, contacts, distanceLimit, threatThreshold } =
    learnerDataSchema.parse(instance.learner.data);

  if (entityIds.length !== contacts.length) {
    throw new TypeError(
      "Hostile Contact reference solver requires entityIds and contacts with equal lengths.",
    );
  }
  if (new Set(entityIds).size !== entityIds.length) {
    throw new TypeError(
      "Hostile Contact reference solver requires unique entityIds.",
    );
  }

  const normalizedContacts = contacts.map(
    (row) => [row[0]!, row[1]!] as const,
  );
  const distanceColumn = normalizedContacts.map((row) => row[0]);
  const threatColumn = normalizedContacts.map((row) => row[1]);
  const mask = normalizedContacts.map(
    (row) => row[0] <= distanceLimit && row[1] >= threatThreshold,
  );
  const expectedEntityIds = entityIds.filter((_, index) => mask[index]);

  return {
    contacts: normalizedContacts,
    shape: [normalizedContacts.length, 2],
    ndim: 2,
    distanceColumn,
    threatColumn,
    mask,
    expectedEntityIds,
  };
}
