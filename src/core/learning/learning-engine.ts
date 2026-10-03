import {
  type AttemptRecord,
  type Concept,
  type ConceptId,
  type LearningActivity,
  type LearningActivityId,
} from "../domain";
import type { LearningPersistence } from "../persistence";
import { deriveConceptProgress, type ConceptProgress } from "./mastery";
import { selectReviewRecommendations, type ReviewRecommendation } from "./review-selection";

export interface ActivityProgress {
  readonly activityId: LearningActivityId;
  readonly attemptCount: number;
  readonly successfulAttemptCount: number;
  readonly completed: boolean;
  readonly lastAttemptAt?: string;
  readonly lastPassed?: boolean;
}

export interface LearningSnapshot {
  readonly revision: number;
  readonly ready: boolean;
  readonly attemptCount: number;
  readonly lastAttemptAt?: string;
}

type Listener = () => void;

export class LearningEngine {
  private attempts: AttemptRecord[] = [];
  private readonly listeners = new Set<Listener>();
  private initializePromise: Promise<void> | null = null;
  private revision = 0;
  private readyState = false;
  private snapshot: LearningSnapshot = Object.freeze({
    revision: 0,
    ready: false,
    attemptCount: 0,
  });

  constructor(
    private readonly persistence: LearningPersistence,
    private readonly now: () => Date = () => new Date(),
  ) {}

  initialize(): Promise<void> {
    this.initializePromise ??= this.loadInitialAttempts();
    return this.initializePromise;
  }

  async recordAttempt(record: AttemptRecord): Promise<void> {
    await this.initialize();
    await this.persistence.addAttempt(record);
    this.attempts.push(record);
    this.attempts.sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
    this.publish();
  }

  async clearAttempts(): Promise<void> {
    await this.initialize();
    await this.persistence.clearAttempts();
    this.attempts = [];
    this.publish();
  }

  getAttempts(): readonly AttemptRecord[] {
    return [...this.attempts];
  }

  getAttemptsByActivity(activityId: LearningActivityId): readonly AttemptRecord[] {
    return this.attempts.filter((attempt) => attempt.activityId === activityId);
  }

  getActivityProgress(activityId: LearningActivityId): ActivityProgress {
    const attempts = this.getAttemptsByActivity(activityId);
    const successes = attempts.filter((attempt) => attempt.passed);
    const lastAttempt = attempts.at(-1);
    return {
      activityId,
      attemptCount: attempts.length,
      successfulAttemptCount: successes.length,
      completed: successes.length > 0,
      ...(lastAttempt
        ? { lastAttemptAt: lastAttempt.submittedAt, lastPassed: lastAttempt.passed }
        : {}),
    };
  }

  getConceptProgress(conceptId: ConceptId): ConceptProgress {
    return deriveConceptProgress(conceptId, this.attempts);
  }

  getReviewRecommendations(
    concepts: readonly Concept[],
    activities: readonly LearningActivity[],
  ): readonly ReviewRecommendation[] {
    const progressByConcept = new Map<ConceptId, ConceptProgress>();
    const latestAttemptPassedByConcept = new Map<ConceptId, boolean | undefined>();

    for (const concept of concepts) {
      progressByConcept.set(concept.id, this.getConceptProgress(concept.id));
      const latest = [...this.attempts]
        .reverse()
        .find((attempt) => attempt.conceptIds.includes(concept.id));
      latestAttemptPassedByConcept.set(concept.id, latest?.passed);
    }

    return selectReviewRecommendations({
      concepts,
      activities,
      progressByConcept,
      latestAttemptPassedByConcept,
      now: this.now(),
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): LearningSnapshot {
    return this.snapshot;
  }

  private async loadInitialAttempts(): Promise<void> {
    this.attempts = [...(await this.persistence.getAttempts())].sort((left, right) =>
      left.submittedAt.localeCompare(right.submittedAt),
    );
    this.readyState = true;
    this.publish();
  }

  private publish(): void {
    this.revision += 1;
    const lastAttempt = this.attempts.at(-1);
    this.snapshot = Object.freeze({
      revision: this.revision,
      ready: this.readyState,
      attemptCount: this.attempts.length,
      ...(lastAttempt ? { lastAttemptAt: lastAttempt.submittedAt } : {}),
    });
    for (const listener of this.listeners) listener();
  }
}
