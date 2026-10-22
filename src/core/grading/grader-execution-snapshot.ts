import type { JsonValue } from "../domain";
import type { FunctionProbeObservation } from "../runtime/function-probes";

export interface GraderObservedValue {
  readonly pythonType: string;
  readonly isNdarray: boolean;
  readonly shape?: readonly number[];
  readonly value?: JsonValue;
}

export interface GraderExecutionException {
  readonly type?: string;
  readonly message: string;
}

export interface GraderExecutionSnapshot {
  readonly variables: Readonly<Record<string, GraderObservedValue>>;
  readonly exception?: GraderExecutionException;
  /**
   * M9: what each requested function probe observed, in the order the config's
   * FUNCTION_CASES checks appear. Absent when no probe ran (no such check, or the
   * program raised before probing).
   */
  readonly functions?: readonly FunctionProbeObservation[];
}
