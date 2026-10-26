import type { ContentRegistry } from "../core/content";
import {
  HintLevel,
  MasteryState,
  type AttemptRecord,
  type ConceptId,
  type CourseId,
  type LearningActivityId,
} from "../core/domain";
import { deriveConceptProgress } from "../core/learning";
import { PYTHON_FOUNDATIONS_IDS } from "../content/python-foundations/ids";
import { getCourseActivityIds, type ActivityProgressReader } from "./learning-path";
import { deriveActivityVariantSeed } from "./services/application-services";

/**
 * Course completion / graduation view-model (PHASE-09 / M11).
 *
 * Everything here is DERIVED from the attempts that are already stored. Nothing is persisted, no
 * certificate / badge / score exists, and nothing is guessed:
 *
 *  - COMPLETED  <=> every activity of the course has at least one passed attempt (hints allowed).
 *                  26/27 is IN_PROGRESS. A failed attempt made after completion never revokes it
 *                  (a pass is never un-recorded), because completion only looks at passes.
 *  - Capstone evidence is a separate, narrower statement about ONE activity: INDEPENDENT means that
 *    activity was passed at least once without opening H3/H4; WITH_SUPPORT means it was passed but
 *    only with H3/H4; NONE means it has not been passed. It is never presented as course mastery.
 *  - Retention counts only the concepts whose mastery the existing mastery rule derives as RETAINED
 *    (a RETENTION-stage pass, or a REVIEW-stage pass at least 24h after the first success). Attempts
 *    made on the same day can never produce it.
 *
 * Course-scoped: only the attempts of the course's own activities are read, so another course's
 * history (CS116) cannot change anything shown for this one. A course without a capstone spec is
 * still given a completion status; it just has no capstone block.
 */

export const CourseGraduationStatus = {
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
} as const;
export type CourseGraduationStatus =
  (typeof CourseGraduationStatus)[keyof typeof CourseGraduationStatus];

export const CapstoneEvidence = {
  NONE: "NONE",
  WITH_SUPPORT: "WITH_SUPPORT",
  INDEPENDENT: "INDEPENDENT",
} as const;
export type CapstoneEvidence = (typeof CapstoneEvidence)[keyof typeof CapstoneEvidence];

export interface CourseCapstoneSpec {
  readonly courseId: CourseId;
  readonly capstoneActivityId: LearningActivityId;
}

/** The explicit course -> capstone registry. A course that is not listed has no capstone block. */
export const COURSE_CAPSTONE_SPECS: readonly CourseCapstoneSpec[] = Object.freeze([
  Object.freeze({
    courseId: PYTHON_FOUNDATIONS_IDS.course as CourseId,
    capstoneActivityId: PYTHON_FOUNDATIONS_IDS.activityPf27 as LearningActivityId,
  }),
]);

export interface CapstoneSummary {
  readonly activityId: LearningActivityId;
  readonly title: string;
  readonly attemptCount: number;
  readonly passedAttemptCount: number;
  readonly passed: boolean;
  readonly evidence: CapstoneEvidence;
  readonly lastPassedAt?: string;
  /** Smallest variant index whose seed no stored capstone attempt has used. Always valid. */
  readonly freshVariantIndex: number;
}

export interface CourseGraduation {
  readonly courseId: CourseId;
  readonly status: CourseGraduationStatus;
  readonly completedCount: number;
  readonly totalCount: number;
  readonly remainingActivityIds: readonly LearningActivityId[];
  /** When the last activity got its first pass; only when COMPLETED and every timestamp is valid. */
  readonly completedAt?: string;
  readonly capstone: CapstoneSummary | null;
  readonly retention: {
    readonly retainedConceptCount: number;
    readonly conceptCount: number;
  };
}

export interface GraduationReader extends ActivityProgressReader {
  getAttempts(): readonly AttemptRecord[];
}

const HIGH_LEVEL_HINTS = new Set<HintLevel>([HintLevel.H3, HintLevel.H4]);

export function getCapstoneSpec(
  courseId: CourseId,
  specs: readonly CourseCapstoneSpec[] = COURSE_CAPSTONE_SPECS,
): CourseCapstoneSpec | undefined {
  return specs.find((spec) => spec.courseId === courseId);
}

export function getCourseGraduation(
  content: ContentRegistry,
  reader: GraduationReader,
  courseId: CourseId,
  specs: readonly CourseCapstoneSpec[] = COURSE_CAPSTONE_SPECS,
): CourseGraduation | null {
  if (content.getCourse(courseId) === undefined) return null;

  const activityIds = getCourseActivityIds(content, courseId);
  const inCourse = new Set<LearningActivityId>(activityIds);
  const attempts = reader.getAttempts().filter((attempt) => inCourse.has(attempt.activityId));

  const remaining: LearningActivityId[] = [];
  let completedCount = 0;
  for (const activityId of activityIds) {
    if (reader.getActivityProgress(activityId).completed) completedCount += 1;
    else remaining.push(activityId);
  }
  const totalCount = activityIds.length;
  const status =
    totalCount > 0 && remaining.length === 0
      ? CourseGraduationStatus.COMPLETED
      : CourseGraduationStatus.IN_PROGRESS;

  const conceptIds = new Set<ConceptId>();
  for (const activityId of activityIds) {
    for (const conceptId of content.getActivity(activityId)?.conceptIds ?? []) {
      conceptIds.add(conceptId);
    }
  }
  let retained = 0;
  for (const conceptId of conceptIds) {
    if (deriveConceptProgress(conceptId, attempts).mastery === MasteryState.RETAINED) retained += 1;
  }

  const spec = getCapstoneSpec(courseId, specs);
  return {
    courseId,
    status,
    completedCount,
    totalCount,
    remainingActivityIds: remaining,
    ...(status === CourseGraduationStatus.COMPLETED
      ? optional("completedAt", completionTime(activityIds, attempts))
      : {}),
    capstone:
      spec !== undefined && inCourse.has(spec.capstoneActivityId)
        ? summarizeCapstone(content, spec.capstoneActivityId, attempts)
        : null,
    retention: { retainedConceptCount: retained, conceptCount: conceptIds.size },
  };
}

function summarizeCapstone(
  content: ContentRegistry,
  activityId: LearningActivityId,
  courseAttempts: readonly AttemptRecord[],
): CapstoneSummary {
  const attempts = courseAttempts.filter((attempt) => attempt.activityId === activityId);
  const passes = attempts.filter((attempt) => attempt.passed);
  const independent = passes.some(
    (attempt) => !attempt.hintsUsed.some((hint) => HIGH_LEVEL_HINTS.has(hint)),
  );
  const evidence =
    passes.length === 0
      ? CapstoneEvidence.NONE
      : independent
        ? CapstoneEvidence.INDEPENDENT
        : CapstoneEvidence.WITH_SUPPORT;

  const activity = content.getActivity(activityId);
  const template =
    activity !== undefined && "missionTemplateId" in activity
      ? content.getMissionTemplate(activity.missionTemplateId)
      : undefined;
  const lastPassedAt = passes.at(-1)?.submittedAt;

  return {
    activityId,
    title: activity?.title ?? activityId,
    attemptCount: attempts.length,
    passedAttemptCount: passes.length,
    passed: passes.length > 0,
    evidence,
    ...(lastPassedAt !== undefined ? { lastPassedAt } : {}),
    freshVariantIndex: findFreshVariantIndex(activityId, template?.version ?? 1, attempts),
  };
}

/** The smallest variant whose derived seed was never used by a stored attempt of this activity. */
export function findFreshVariantIndex(
  activityId: LearningActivityId,
  templateVersion: number,
  attempts: readonly Pick<AttemptRecord, "seed">[],
): number {
  const used = new Set(attempts.map((attempt) => attempt.seed));
  for (let index = 0; index <= attempts.length; index += 1) {
    if (!used.has(deriveActivityVariantSeed(activityId, templateVersion, index))) return index;
  }
  return attempts.length + 1;
}

function completionTime(
  activityIds: readonly LearningActivityId[],
  attempts: readonly AttemptRecord[],
): string | undefined {
  let latest: { ms: number; iso: string } | undefined;
  for (const activityId of activityIds) {
    const firstPass = attempts
      .filter((attempt) => attempt.activityId === activityId && attempt.passed)
      .map((attempt) => ({ ms: Date.parse(attempt.submittedAt), iso: attempt.submittedAt }))
      .filter((entry) => Number.isFinite(entry.ms))
      .sort((left, right) => left.ms - right.ms)[0];
    if (firstPass === undefined) return undefined;
    if (latest === undefined || firstPass.ms > latest.ms) latest = firstPass;
  }
  return latest?.iso;
}

function optional<Key extends string>(
  key: Key,
  value: string | undefined,
): { readonly [K in Key]?: string } {
  return value === undefined ? {} : ({ [key]: value } as { readonly [K in Key]?: string });
}
