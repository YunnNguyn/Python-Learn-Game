import type { MissionGeneratorId } from "../../../core/domain";
import type { MissionInstanceValidator } from "../../../core/missions";
import { CS116_GENERATOR_ID } from "../generators";
import { hostileContactInstanceValidator } from "./hostile-contact-validator";
import { thresholdFilterInstanceValidator } from "./threshold-filter-validator";

export function getCs116MissionInstanceValidator(
  generatorId: MissionGeneratorId,
): MissionInstanceValidator | undefined {
  switch (generatorId) {
    case CS116_GENERATOR_ID.THRESHOLD_FILTER:
      return thresholdFilterInstanceValidator;
    case CS116_GENERATOR_ID.HOSTILE_CONTACT:
      return hostileContactInstanceValidator;
    default:
      return undefined;
  }
}
