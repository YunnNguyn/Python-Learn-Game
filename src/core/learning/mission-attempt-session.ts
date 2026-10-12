import {
  AttemptRecordSchema,
  type AttemptRecord,
  type AttemptRecordId,
  type LearningActivity,
  type MissionInstance,
  type MissionTemplate,
} from "../domain";
import { HintEngine, type RevealedHint } from "../hints";
import { RUNTIME_EXECUTION_STATUS } from "../runtime";
import {
  type MissionRunResult,
  type MissionSubmitResult,
  MissionEngine,
} from "../missions";

export interface MissionSubmitWithAttempt extends MissionSubmitResult {
  readonly attemptRecord: AttemptRecord;
}

export const MISSION_SUBMIT_CANCELLED = "MISSION_SUBMIT_CANCELLED";

/**
 * Thrown by `MissionAttemptSession.submit()` when the session was disposed
 * while the Submit was still waiting for the runtime/grading. It is a
 * cancellation, NOT learner work: no AttemptRecord exists and the persistence
 * callback was never invoked. Callers should treat it as benign.
 */
export class MissionSubmitCancelledError extends Error {
  readonly code = MISSION_SUBMIT_CANCELLED;

  constructor(options?: { readonly cause?: unknown }) {
    super("Mission Submit was cancelled because the session was disposed before grading finished.");
    this.name = "MissionSubmitCancelledError";
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export function isMissionSubmitCancelledError(
  error: unknown,
): error is MissionSubmitCancelledError {
  return error instanceof MissionSubmitCancelledError;
}

export interface MissionAttemptSessionOptions {
  readonly now?: () => Date;
  readonly hintEngine?: HintEngine;
  readonly onAttemptRecord?: (record: AttemptRecord) => void | Promise<void>;
}

/**
 * Session-local Run/Submit evidence coordinator for one loaded activity.
 * Every Submit creates one immutable AttemptRecord and may forward it to durable learning storage.
 */
export class MissionAttemptSession {
  private readonly startedAt: string;
  private readonly now: () => Date;
  private readonly attemptRecords: AttemptRecord[] = [];
  private readonly hintEngine: HintEngine;
  private readonly onAttemptRecord?: (record: AttemptRecord) => void | Promise<void>;
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
    this.hintEngine = options.hintEngine ?? new HintEngine(null);
    this.onAttemptRecord = options.onAttemptRecord;
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
    let result: MissionSubmitResult;
    try {
      result = await this.engine.submit(code);
    } catch (error) {
      // Grading rejected. After dispose() that is a consequence of the
      // cancellation, not a learner or application failure; while the session is
      // active the original error is preserved untouched. Only the grading await
      // is inside this try: persistence errors below are never reinterpreted.
      if (this.disposed) throw new MissionSubmitCancelledError({ cause: error });
      throw error;
    }

    // Cancellation boundary. dispose() terminates the runtime, which resolves a
    // pending Submit with a RUNTIME_DISPOSED failure result (or, for a runtime
    // that cannot abort, a late genuine result). Neither is learner work, so a
    // session disposed while grading was pending records nothing. This check
    // and the onAttemptRecord call below are separated only by synchronous code,
    // so once persistence starts, a later dispose() cannot cancel it.
    if (this.disposed) {
      throw new MissionSubmitCancelledError();
    }

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
        hintsUsed: [...this.hintEngine.getUsedLevels()],
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
    await this.onAttemptRecord?.(attemptRecord);
    return { ...result, attemptRecord };
  }

  getAttempts(): readonly AttemptRecord[] {
    return [...this.attemptRecords];
  }

  revealNextHint(): RevealedHint | null {
    this.assertActive();
    return this.hintEngine.revealNext();
  }

  getRevealedHints(): readonly RevealedHint[] {
    return this.hintEngine.getRevealed();
  }

  getRemainingHintCount(): number {
    return this.hintEngine.getRemainingCount();
  }

  hasHints(): boolean {
    return this.hintEngine.hasHints();
  }

  canInterrupt(): boolean {
    return !this.disposed && this.engine.canInterrupt();
  }

  interrupt() {
    this.assertActive();
    return this.engine.interrupt();
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
