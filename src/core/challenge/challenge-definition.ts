import { z } from "zod";

import { ChallengeIssueCode, type ChallengeIssue } from "./challenge-issues";

/*
 * Challenge definition (M13.1). A definition describes HOW a submission is checked and
 * scored; the solution CSV is passed to `scoreSubmission` separately.
 *
 * v1 deliberately supports two metrics only. Compatibility is enforced here:
 * MAE needs numeric predictions, Accuracy needs categorical ones.
 */

export const CHALLENGE_METRICS = ["mae", "accuracy"] as const;
export type ChallengeMetric = (typeof CHALLENGE_METRICS)[number];

export const CHALLENGE_TARGET_TYPES = ["numeric", "categorical"] as const;
export type ChallengeTargetType = (typeof CHALLENGE_TARGET_TYPES)[number];

/** Absolute ceilings; a definition may only be stricter. They also bound the (trusted) solution file. */
export const CHALLENGE_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  maxRows: 200_000,
} as const;

const columnName = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value), {
    message: "no surrounding whitespace or control characters",
  });

export const ChallengeDefinitionSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
    version: z.string().min(1).max(64),
    title: z.string().trim().min(1).max(200),
    metric: z.enum(CHALLENGE_METRICS),
    idColumn: columnName,
    targetColumn: columnName,
    targetType: z.enum(CHALLENGE_TARGET_TYPES),
    limits: z.strictObject({
      maxSubmissionBytes: z.number().int().min(1).max(CHALLENGE_LIMITS.maxBytes),
      maxRows: z.number().int().min(1).max(CHALLENGE_LIMITS.maxRows),
    }),
  })
  .superRefine((definition, context) => {
    if (definition.idColumn === definition.targetColumn) {
      context.addIssue({ code: "custom", path: ["targetColumn"], message: "idColumn and targetColumn must differ" });
    }
    const required: ChallengeTargetType = definition.metric === "mae" ? "numeric" : "categorical";
    if (definition.targetType !== required) {
      context.addIssue({ code: "custom", path: ["targetType"], message: `${definition.metric} requires ${required}` });
    }
  });

export type ChallengeDefinition = z.infer<typeof ChallengeDefinitionSchema>;

export type ParseChallengeDefinitionResult =
  | { readonly ok: true; readonly definition: ChallengeDefinition }
  | { readonly ok: false; readonly issues: readonly ChallengeIssue[] };

export function parseChallengeDefinition(input: unknown): ParseChallengeDefinitionResult {
  const parsed = ChallengeDefinitionSchema.safeParse(input);
  if (parsed.success) return { ok: true, definition: parsed.data };

  const issues: ChallengeIssue[] = [];
  const seen = new Set<string>();
  for (const issue of parsed.error.issues) {
    const path = issue.path.map(String).join(".") || "(root)";
    const isMismatch = issue.code === "custom" && path === "targetType";
    const code = isMismatch ? ChallengeIssueCode.METRIC_TARGET_MISMATCH : ChallengeIssueCode.INVALID_DEFINITION;
    const key = `${code}:${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({
      code,
      message: isMismatch
        ? "Kiểu dự đoán không phù hợp với thang đo: MAE cần số, Accuracy cần nhãn phân loại."
        : `Định nghĩa thử thách không hợp lệ tại "${path}".`,
    });
  }
  return { ok: false, issues };
}

/** Which direction is better; used to pick a best score. */
export function metricDirection(metric: ChallengeMetric): "lower-is-better" | "higher-is-better" {
  return metric === "mae" ? "lower-is-better" : "higher-is-better";
}
