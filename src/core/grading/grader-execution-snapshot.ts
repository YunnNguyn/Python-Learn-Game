import type { JsonValue } from "../domain";

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
}
