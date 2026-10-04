import type { MissionInstance, MissionTemplate } from "../domain";
import {
  CORE_GRADER_ID,
  getDeclarativeObservationVariables,
  resolveDeclarativeGraderConfig,
  type GraderRegistry,
  type GraderResult,
} from "../grading";
import {
  RUNTIME_EXECUTION_STATUS,
  RuntimeVariableObservationsSchema,
  type RuntimeExecutionResult,
  type RuntimeLifecycleResult,
  type RuntimeManager,
} from "../runtime";
import { toGraderExecutionSnapshot } from "./grader-execution-adapter";

export interface MissionRunResult {
  readonly execution: RuntimeExecutionResult;
}

export interface MissionSubmitResult {
  readonly execution: RuntimeExecutionResult;
  readonly grading?: GraderResult;
}

interface CurrentMission {
  readonly templateId: MissionTemplate["id"];
  readonly templateVersion: number;
  readonly grader: MissionTemplate["grader"];
  readonly instance: MissionInstance;
}

export class MissionEngine {
  private currentMission: CurrentMission | null = null;
  private activeOperation: symbol | null = null;
  private disposed = false;

  constructor(
    private readonly runtimeManager: RuntimeManager,
    private readonly graderRegistry: GraderRegistry,
  ) {}

  async loadMission(
    template: MissionTemplate,
    instance: MissionInstance,
  ): Promise<RuntimeLifecycleResult> {
    if (this.disposed) {
      return lifecycleFailure(
        "MISSION_ENGINE_DISPOSED",
        "Mission Engine đã được hủy và không thể tải mission.",
      );
    }

    if (this.activeOperation !== null) {
      return lifecycleFailure(
        "MISSION_ENGINE_BUSY",
        "Mission Engine đang xử lý một thao tác khác.",
      );
    }

    if (instance.templateId !== template.id) {
      return lifecycleFailure(
        "MISSION_TEMPLATE_ID_MISMATCH",
        "MissionInstance không thuộc MissionTemplate được cung cấp.",
      );
    }

    if (instance.templateVersion !== template.version) {
      return lifecycleFailure(
        "MISSION_TEMPLATE_VERSION_MISMATCH",
        "MissionInstance không khớp phiên bản MissionTemplate được cung cấp.",
      );
    }

    const operation = Symbol("loadMission");
    this.activeOperation = operation;

    try {
      const initialization = await this.runtimeManager.initialize();
      if (!initialization.ok) {
        return initialization;
      }

      if (!this.isActive(operation)) {
        return lifecycleFailure(
          "MISSION_ENGINE_DISPOSED",
          "Mission Engine đã được hủy trong khi tải mission.",
        );
      }

      const preparation = await this.runtimeManager.prepareMission({
        runtimeConfig: template.runtime.config,
        setupData: instance.runtime?.setupData,
      });
      if (!preparation.ok) {
        return preparation;
      }

      if (!this.isActive(operation)) {
        return lifecycleFailure(
          "MISSION_ENGINE_DISPOSED",
          "Mission Engine đã được hủy trong khi tải mission.",
        );
      }

      this.currentMission = {
        templateId: template.id,
        templateVersion: template.version,
        grader: template.grader,
        instance,
      };

      return { ok: true };
    } finally {
      if (this.activeOperation === operation) {
        this.activeOperation = null;
      }
    }
  }

  async run(code: string): Promise<MissionRunResult> {
    if (this.disposed) {
      return {
        execution: executionFailure(
          "MISSION_ENGINE_DISPOSED",
          "Mission Engine đã được hủy và không thể chạy mã.",
        ),
      };
    }

    if (this.activeOperation !== null) {
      return {
        execution: executionFailure(
          "MISSION_ENGINE_BUSY",
          "Mission Engine đang xử lý một thao tác khác.",
        ),
      };
    }

    if (this.currentMission === null) {
      return {
        execution: executionFailure(
          "MISSION_NOT_READY",
          "Chưa có mission nào được tải thành công.",
        ),
      };
    }

    const operation = Symbol("run");
    this.activeOperation = operation;

    try {
      return {
        execution: await this.runtimeManager.run({ code }),
      };
    } finally {
      if (this.activeOperation === operation) {
        this.activeOperation = null;
      }
    }
  }

  async submit(code: string): Promise<MissionSubmitResult> {
    if (this.disposed) {
      return {
        execution: executionFailure(
          "MISSION_ENGINE_DISPOSED",
          "Mission Engine đã được hủy và không thể nộp mã.",
        ),
      };
    }

    if (this.activeOperation !== null) {
      return {
        execution: executionFailure(
          "MISSION_ENGINE_BUSY",
          "Mission Engine đang xử lý một thao tác khác.",
        ),
      };
    }

    if (this.currentMission === null) {
      return {
        execution: executionFailure(
          "MISSION_NOT_READY",
          "Chưa có mission nào được tải thành công.",
        ),
      };
    }

    const operation = Symbol("submit");
    this.activeOperation = operation;

    try {
      const grader = this.graderRegistry.getGrader(this.currentMission.grader.id);
      if (grader === undefined) {
        return {
          execution: executionFailure(
            "GRADER_NOT_FOUND",
            "Không tìm thấy grader đã cấu hình cho mission.",
          ),
        };
      }

      if (this.currentMission.grader.id !== CORE_GRADER_ID.DECLARATIVE) {
        return {
          execution: executionFailure(
            "GRADER_INTEGRATION_UNSUPPORTED",
            "Mission Engine chưa hỗ trợ lập kế hoạch quan sát cho grader này.",
          ),
        };
      }

      const authoredGraderConfig = this.currentMission.grader.config;
      let graderConfig;
      let observeVariables: readonly string[];
      try {
        if (authoredGraderConfig === undefined) {
          throw new Error("Declarative grader config is required.");
        }
        graderConfig = resolveDeclarativeGraderConfig(
          authoredGraderConfig,
          this.currentMission.instance.grading?.data,
        );
        observeVariables = getDeclarativeObservationVariables(graderConfig);
      } catch {
        return {
          execution: executionFailure(
            "INVALID_GRADER_CONFIG",
            "Cấu hình declarative grader không hợp lệ.",
          ),
        };
      }

      const execution = await this.runtimeManager.submit({
        code,
        observeVariables,
      });

      let observations;
      if (
        execution.status === RUNTIME_EXECUTION_STATUS.SUCCESS ||
        execution.status === RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION
      ) {
        const parsed = RuntimeVariableObservationsSchema.safeParse(
          execution.serialized,
        );
        if (!parsed.success) {
          return {
            execution: executionFailure(
              "INVALID_RUNTIME_OBSERVATIONS",
              "Runtime không trả về payload quan sát biến hợp lệ.",
              execution.stdout,
              execution.stderr,
            ),
          };
        }
        observations = parsed.data;
      }

      const graderExecution = toGraderExecutionSnapshot(
        execution,
        observations,
      );

      try {
        const grading = grader.grade({
          config: graderConfig,
          gradingData: this.currentMission.instance.grading?.data,
          execution: graderExecution,
        });

        return {
          execution,
          grading,
        };
      } catch {
        return {
          execution: executionFailure(
            "GRADER_EXECUTION_FAILED",
            "Grader không thể đánh giá kết quả Submit.",
            execution.stdout,
            execution.stderr,
          ),
        };
      }
    } finally {
      if (this.activeOperation === operation) {
        this.activeOperation = null;
      }
    }
  }

  canInterrupt(): boolean {
    return !this.disposed && typeof this.runtimeManager.interrupt === "function";
  }

  async interrupt(): Promise<RuntimeLifecycleResult> {
    if (this.disposed) {
      return lifecycleFailure(
        "MISSION_ENGINE_DISPOSED",
        "Mission Engine đã được hủy và không thể dừng tiến trình.",
      );
    }

    if (this.runtimeManager.interrupt === undefined) {
      return lifecycleFailure(
        "RUNTIME_INTERRUPT_UNSUPPORTED",
        "Runtime hiện tại không hỗ trợ dừng tiến trình đang chạy.",
      );
    }

    return this.runtimeManager.interrupt();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.currentMission = null;
    this.activeOperation = null;
    this.runtimeManager.dispose();
  }

  private isActive(operation: symbol): boolean {
    return !this.disposed && this.activeOperation === operation;
  }
}

function lifecycleFailure(
  code: string,
  message: string,
): RuntimeLifecycleResult {
  return {
    ok: false,
    error: { code, message },
  };
}

function executionFailure(
  code: string,
  message: string,
  stdout = "",
  stderr = "",
): RuntimeExecutionResult {
  return {
    status: RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR,
    stdout,
    stderr,
    error: { code, message },
  };
}
