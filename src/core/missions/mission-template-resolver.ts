import { ContentRegistry } from "../content";
import type { MissionTemplate, MissionTemplateId } from "../domain";

const INVALID_VERSION_MESSAGE =
  "MissionTemplate version must be a finite positive safe integer.";

function assertValidVersion(version: number): void {
  if (!Number.isFinite(version) || !Number.isSafeInteger(version) || version < 1) {
    throw new RangeError(INVALID_VERSION_MESSAGE);
  }
}

export function resolveMissionTemplate(
  registry: ContentRegistry,
  templateId: MissionTemplateId,
  version: number,
): MissionTemplate | undefined {
  assertValidVersion(version);

  const template = registry.getMissionTemplate(templateId);
  return template?.version === version ? template : undefined;
}
