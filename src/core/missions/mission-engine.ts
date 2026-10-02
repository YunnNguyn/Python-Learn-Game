import type { MissionInstance, MissionTemplate } from "../domain";
import {
  RUNTIME_EXECUTION_STATUS,
  type RuntimeExecutionResult,
  type RuntimeLifecycleResult,
  type RuntimeManager,
} from "../runtime";

export interface MissionRunResult {
  readonly execution: RuntimeExecutionResult;
}

export interface MissionSubmitResult {
  readonly execution: RuntimeExecutionResult;
}

interface CurrentMission {
  readonly templateId: MissionTemplate["id"];
  readonly templateVersion: number;
  readonly instance: MissionInstance;
}

export class MissionEngine {
  private currentMission: CurrentMission | null = null;
  private activeOperation: symbol | null = null;
  private disposed = false;

  constructor(private readonly runtimeManager: RuntimeManager) {}

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
      return {
        execution: await this.runtimeManager.submit({ code }),
      };
    } finally {
      if (this.activeOperation === operation) {
        this.activeOperation = null;
      }
    }
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
): RuntimeExecutionResult {
  return {
    status: RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR,
    stdout: "",
    stderr: "",
    error: { code, message },
  };
}
