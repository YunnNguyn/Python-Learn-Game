import type {
  RuntimeExecutionRequest,
  RuntimeExecutionResult,
  RuntimeLifecycleResult,
  RuntimeMissionPreparationRequest,
} from "./runtime-contracts";

export interface RuntimeManager {
  initialize(): Promise<RuntimeLifecycleResult>;

  prepareMission(
    request: RuntimeMissionPreparationRequest,
  ): Promise<RuntimeLifecycleResult>;

  run(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult>;

  submit(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult>;

  dispose(): void;
}
