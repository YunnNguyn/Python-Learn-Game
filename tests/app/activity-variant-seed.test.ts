import { describe, expect, it } from "vitest";

import { deriveActivityVariantSeed } from "../../src/app/services";
import type { LearningActivityId } from "../../src/core/domain";

describe("activity variant seed", () => {
  it("is deterministic and changes only when the variant index changes", () => {
    const id = "activity.test" as LearningActivityId;
    expect(deriveActivityVariantSeed(id, 2, 0)).toBe(
      deriveActivityVariantSeed(id, 2, 0),
    );
    expect(deriveActivityVariantSeed(id, 2, 1)).not.toBe(
      deriveActivityVariantSeed(id, 2, 0),
    );
  });

  it("rejects invalid variant indexes", () => {
    expect(() => deriveActivityVariantSeed("activity.test" as LearningActivityId, 1, -1)).toThrow();
  });
});
