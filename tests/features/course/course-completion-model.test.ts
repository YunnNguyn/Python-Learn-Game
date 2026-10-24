import { describe, expect, it } from "vitest";

import {
  CapstoneEvidence,
  CourseGraduationStatus,
  type CourseGraduation,
} from "../../../src/app/course-graduation";
import {
  CourseReviewReason,
  CourseReviewState,
  type CourseReview,
  type CourseReviewItem,
} from "../../../src/app/course-review";
import type { ConceptId, CourseId, LearningActivityId } from "../../../src/core/domain";
import {
  formatCompletionDate,
  missionVariantPath,
  parseVariantParam,
  reviewEmptyMessage,
  reviewItemActionLabel,
  reviewItemPath,
  toCompletionSummary,
  toProgressStatusLine,
  variantLabelOfSeed,
} from "../../../src/features/course/course-completion-model";

/**
 * PHASE-09 / M11 - the wording of the completion summary and of the review panel. These strings are
 * what keeps three different statements apart: COMPLETING a course, CAPSTONE evidence and RETAINED
 * concepts. A regression here would make the UI claim more than the stored attempts show.
 */

const course = "python-foundations" as CourseId;
const pf27 = "python-foundations.pf27" as LearningActivityId;

function graduation(overrides: Partial<CourseGraduation> & { evidence?: CapstoneEvidence } = {}): CourseGraduation {
  const { evidence = CapstoneEvidence.INDEPENDENT, ...rest } = overrides;
  return {
    courseId: course,
    status: CourseGraduationStatus.COMPLETED,
    completedCount: 27,
    totalCount: 27,
    remainingActivityIds: [],
    completedAt: "2026-10-05T10:30:00.000Z",
    capstone: {
      activityId: pf27,
      title: "PF-27 — Capstone",
      attemptCount: 2,
      passedAttemptCount: 1,
      passed: evidence !== CapstoneEvidence.NONE,
      evidence,
      freshVariantIndex: 1,
    },
    retention: { retainedConceptCount: 0, conceptCount: 40 },
    ...rest,
  };
}

const item = (overrides: Partial<CourseReviewItem> = {}): CourseReviewItem => ({
  activityId: "python-foundations.pf10" as LearningActivityId,
  activityTitle: "PF-10",
  conceptId: "python.comprehensions" as ConceptId,
  conceptTitle: "Comprehension",
  reason: CourseReviewReason.WEAK,
  why: "x",
  priority: 80,
  freshVariantIndex: 2,
  ...overrides,
});

describe("completion summary wording (M11)", () => {
  it("27/27 says completed, that hints count, and that this is neither mastery nor retention", () => {
    const model = toCompletionSummary(graduation());
    expect(model.headline).toBe("Bạn đã hoàn thành khóa học");
    expect(model.progressLine).toContain("27/27");
    expect(model.progressLine).toMatch(/gợi ý vẫn được tính là đạt/);
    expect(model.meaningLine).toMatch(/chưa phải là thành thạo hay ghi nhớ/);
    expect(model.meaningLine).toMatch(/không làm mất trạng thái này/);
    expect(model.completedAtLine).toMatch(/^Hoàn thành lúc /);
  });

  it("capstone evidence is worded per case and is always about the capstone only", () => {
    const independent = toCompletionSummary(graduation({ evidence: CapstoneEvidence.INDEPENDENT })).capstoneLine!;
    expect(independent).toMatch(/không mở gợi ý mức cao \(H3\/H4\)/);
    expect(independent).toMatch(/riêng capstone này, không phải điểm số của cả khóa/);

    const supported = toCompletionSummary(graduation({ evidence: CapstoneEvidence.WITH_SUPPORT })).capstoneLine!;
    expect(supported).toMatch(/có dùng gợi ý H3\/H4/);
    expect(supported).toMatch(/đề mới/);
    expect(supported).not.toMatch(/đã có bằng chứng tự làm/);

    expect(toCompletionSummary(graduation({ evidence: CapstoneEvidence.NONE })).capstoneLine).toMatch(/chưa có lần đạt/);
    expect(toCompletionSummary(graduation({ capstone: null })).capstoneLine).toBeNull();
  });

  it("retention is 'none yet' unless the mastery rule produced RETAINED concepts, and explains the 24h rule", () => {
    const none = toCompletionSummary(graduation()).retentionLine;
    expect(none).toMatch(/Chưa có khái niệm nào có bằng chứng ghi nhớ/);
    expect(none).toMatch(/24 giờ/);
    const some = toCompletionSummary(graduation({ retention: { retainedConceptCount: 3, conceptCount: 40 } })).retentionLine;
    expect(some).toContain("3/40");
    expect(some).not.toMatch(/Chưa có/);
  });

  it("26/27 is a progress line (never 'completed') and names the capstone as the only missing piece", () => {
    const view = graduation({
      status: CourseGraduationStatus.IN_PROGRESS,
      completedCount: 26,
      remainingActivityIds: [pf27],
      completedAt: undefined,
    });
    const line = toProgressStatusLine(view)!;
    expect(line).toContain("26/27");
    expect(line).toMatch(/chỉ hoàn thành khi bạn đạt nốt capstone/);
    expect(toCompletionSummary(view).headline).toBe("Khóa học chưa hoàn thành");
    expect(toCompletionSummary(view).completedAtLine).toBeNull();

    const many = toProgressStatusLine(
      graduation({
        status: CourseGraduationStatus.IN_PROGRESS,
        completedCount: 20,
        remainingActivityIds: ["a", "b", "c", "d", "e", "f", "g"] as LearningActivityId[],
      }),
    )!;
    expect(many).toContain("còn 7 hoạt động");
    expect(toProgressStatusLine(graduation())).toBeNull();
  });

  it("formats dates and tolerates garbage", () => {
    expect(formatCompletionDate("2026-10-05T10:30:00.000Z")).toMatch(/2026/);
    expect(formatCompletionDate("not a date")).toBeNull();
    expect(formatCompletionDate(undefined)).toBeNull();
  });
});

describe("review panel wording and links (M11)", () => {
  it("a recent failure resumes the activity page; every other reason opens a fresh variant of the mission", () => {
    expect(reviewItemPath(item({ reason: CourseReviewReason.RECENT_FAILURE }))).toBe(
      "/activity/python-foundations.pf10",
    );
    expect(reviewItemPath(item())).toBe("/mission/python-foundations.pf10?variant=2");
    expect(reviewItemPath(item({ reason: CourseReviewReason.RETENTION_CHECK, freshVariantIndex: 0 }))).toBe(
      "/mission/python-foundations.pf10?variant=0",
    );
    expect(reviewItemPath(item({ freshVariantIndex: null }))).toBe("/activity/python-foundations.pf10");
    expect(reviewItemActionLabel(item())).toBe("Ôn lại với đề mới");
    expect(reviewItemActionLabel(item({ reason: CourseReviewReason.RECENT_FAILURE }))).toBe("Làm lại");
  });

  it("each empty state has its own honest Vietnamese message; ITEMS has none", () => {
    const review = (state: CourseReview["state"]): CourseReview => ({ courseId: course, state, items: [], ignoredAttemptCount: 0 });
    expect(reviewEmptyMessage(review(CourseReviewState.ITEMS))).toBeNull();
    const messages = [CourseReviewState.NO_ATTEMPTS, CourseReviewState.NOTHING_DUE, CourseReviewState.NO_ELIGIBLE_ACTIVITY].map(
      (state) => reviewEmptyMessage(review(state))!,
    );
    expect(new Set(messages).size).toBe(3);
    for (const message of messages) expect(message.length).toBeGreaterThan(30);
    expect(messages[1]).not.toMatch(/ghi nhớ|thành thạo/);
  });
});

describe("variant helpers (M11)", () => {
  it("builds the mission path and parses ?variant= strictly", () => {
    expect(missionVariantPath(pf27, 3)).toBe("/mission/python-foundations.pf27?variant=3");
    expect(parseVariantParam("0")).toBe(0);
    expect(parseVariantParam("12")).toBe(12);
    for (const bad of [null, "", "-1", "1.5", "abc", "1e3", "01x", " 2", "9999999", "0x10"]) {
      expect(parseVariantParam(bad as string | null), String(bad)).toBeUndefined();
    }
  });

  it("labels a stored seed by its variant and says nothing for a custom seed", () => {
    expect(variantLabelOfSeed("play:python-foundations.pf27:v1:variant:0")).toBe("Đề #1");
    expect(variantLabelOfSeed("play:python-foundations.pf27:v1:variant:6")).toBe("Đề #7");
    expect(variantLabelOfSeed("custom-seed")).toBeNull();
  });
});
