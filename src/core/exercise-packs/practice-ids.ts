import type {
  ConceptId,
  HintSetId,
  LearningActivityId,
  MissionGeneratorId,
  MissionTemplateId,
} from "../domain";
import { EXERCISE_PACK_LIMITS } from "./exercise-pack-limits";

/*
 * Identifier namespaces of imported practice content (PHASE-05-M7).
 *
 * Every identifier an imported exercise produces lives in the `practice` namespace
 * and is derived ONLY from the pack id and exercise id, whose grammar
 * (`[a-z][a-z0-9]*([.-][a-z0-9]+)*`) cannot contain ":". So the encoding is
 * unambiguous and parseable, and no pack - whatever it names itself - can produce an
 * identifier equal to a CS116 one (CS116 ids never start with `practice`). Practice
 * data also lives in a database of its own, so even an equal string could not meet
 * a CS116 record; the namespace keeps that true if records are ever exported.
 */

const PACK_OR_EXERCISE_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

export const PRACTICE_ACTIVITY_PREFIX = "practice:";
/** A mission generator id that is never registered anywhere: practice instances are built directly. */
export const PRACTICE_STATIC_GENERATOR_ID = "practice.static" as MissionGeneratorId;

export function isPracticeSegment(value: string): boolean {
  return value.length <= EXERCISE_PACK_LIMITS.maxIdLength && PACK_OR_EXERCISE_ID.test(value);
}

function assertSegments(packId: string, exerciseId?: string): void {
  if (!isPracticeSegment(packId) || (exerciseId !== undefined && !isPracticeSegment(exerciseId))) {
    throw new RangeError("Invalid practice pack or exercise identifier.");
  }
}

/** `practice:<packId>:<exerciseId>` - also the LearningActivity id and the key of its draft. */
export function practiceActivityId(packId: string, exerciseId: string): LearningActivityId {
  assertSegments(packId, exerciseId);
  return `${PRACTICE_ACTIVITY_PREFIX}${packId}:${exerciseId}` as LearningActivityId;
}

export function parsePracticeActivityId(
  activityId: string,
): { readonly packId: string; readonly exerciseId: string } | null {
  if (!activityId.startsWith(PRACTICE_ACTIVITY_PREFIX)) return null;
  const parts = activityId.slice(PRACTICE_ACTIVITY_PREFIX.length).split(":");
  if (parts.length !== 2) return null;
  const [packId, exerciseId] = parts as [string, string];
  return isPracticeSegment(packId) && isPracticeSegment(exerciseId) ? { packId, exerciseId } : null;
}

export function practiceTemplateId(packId: string, exerciseId: string): MissionTemplateId {
  assertSegments(packId, exerciseId);
  return `practice.template:${packId}:${exerciseId}` as MissionTemplateId;
}

/** One concept per pack: it only labels attempts; practice has no mastery model. */
export function practiceConceptId(packId: string): ConceptId {
  assertSegments(packId);
  return `practice.concept:${packId}` as ConceptId;
}

export function practiceHintSetId(packId: string, exerciseId: string): HintSetId {
  assertSegments(packId, exerciseId);
  return `practice.hints:${packId}:${exerciseId}` as HintSetId;
}

/**
 * The variant seed. It encodes the revision so a revised exercise never reuses the
 * seed (and therefore never the draft / instance id) of an earlier revision.
 */
export function practiceSeed(packId: string, exerciseId: string, revision: number): string {
  assertSegments(packId, exerciseId);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new RangeError("Invalid exercise revision.");
  return `practice:${packId}:${exerciseId}:r${revision}`;
}
