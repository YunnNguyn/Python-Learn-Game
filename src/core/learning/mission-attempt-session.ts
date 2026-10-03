import {
  AttemptRecordSchema,
  HintLevel,
  type AttemptRecord,
  type AttemptRecordId,
  type LearningActivity,
  type MissionInstance,
  type MissionTemplate,
} from "../domain";
import { RUNTIME_EXECUTION_STATUS } from "../runtime";
import {
  type MissionRunResult,
  type MissionSubmitResult,
  MissionEngine,
} from "../missions";

export interface MissionSubmitWithAttempt extends MissionSubmitResult {
  readonly attemptRecord: AttemptRecord;
}

export interface MissionAttemptSessionOptions {
  readonly now?: () => Date;
}

/**
 * Lightweight in-memory learning-evidence envelope for one loaded activity.
 * Persistence/mastery are intentionally deferred; every Submit still creates one immutable record.
 */
export class MissionAttemptSession {
  private readonly startedAt: string;
  private readonly now: () => Date;
  private readonly attemptRecords: AttemptRecord[] = [];
  private runCount = 0;
  private submissionIndex = 0;
  private runtimeErrorCount = 0;
  private disposed = false;

  constructor(
    readonly activity: LearningActivity,
    readonly template: MissionTemplate,
    readonly instance: MissionInstance,
    private readonly engine: MissionEngine,
    options: MissionAttemptSessionOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.startedAt = this.now().toISOString();
  }

  async run(code: string): Promise<MissionRunResult> {
    this.assertActive();
    const result = await this.engine.run(code);
    this.runCount += 1;
    if (result.execution.status !== RUNTIME_EXECUTION_STATUS.SUCCESS) {
      this.runtimeErrorCount += 1;
    }
    return result;
  }

  async submit(code: string): Promise<MissionSubmitWithAttempt> {
    this.assertActive();
    const runCountBeforeSubmit = this.runCount;
    const result = await this.engine.submit(code);
    this.submissionIndex += 1;
    if (result.execution.status !== RUNTIME_EXECUTION_STATUS.SUCCESS) {
      this.runtimeErrorCount += 1;
    }

    const attemptRecord = deepFreezeAttempt(
      AttemptRecordSchema.parse({
        id: `attempt:${this.instance.id}:${encodeURIComponent(
          this.startedAt,
        )}:${this.submissionIndex}` as AttemptRecordId,
        activityId: this.activity.id,
        missionTemplateId: this.template.id,
        missionTemplateVersion: this.template.version,
        seed: this.instance.seed,
        difficulty: this.instance.difficulty,
        conceptIds: [...this.instance.conceptIds],
        learningStage: this.activity.stage,
        startedAt: this.startedAt,
        submittedAt: this.now().toISOString(),
        passed: result.grading?.passed === true,
        submissionIndex: this.submissionIndex,
        runCountBeforeSubmit,
        hintsUsed: [] as HintLevel[],
        runtimeErrorCount: this.runtimeErrorCount,
        graderSummary: {
          executionStatus: result.execution.status,
          gradingAvailable: result.grading !== undefined,
          gradingPassed: result.grading?.passed ?? false,
          failedCategories:
            result.grading?.checks
              .filter((check) => !check.passed && check.category !== undefined)
              .map((check) => check.category!) ?? [],
        },
      }),
    );

    this.attemptRecords.push(attemptRecord);
    return { ...result, attemptRecord };
  }

  getAttempts(): readonly AttemptRecord[] {
    return [...this.attemptRecords];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.engine.dispose();
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error("MissionAttemptSession has been disposed.");
    }
  }
}

function deepFreezeAttempt(record: AttemptRecord): AttemptRecord {
  deepFreezeValue(record);
  return record;
}

function deepFreezeValue(value: unknown): void {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return;
  }

  for (const child of Object.values(value)) {
    deepFreezeValue(child);
  }
  Object.freeze(value);
}
