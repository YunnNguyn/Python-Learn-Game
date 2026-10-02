import {
  RUNTIME_EXECUTION_STATUS,
  type RuntimeExecutionRequest,
  type RuntimeExecutionResult,
  type RuntimeLifecycleResult,
  type RuntimeMissionPreparationRequest,
  type RuntimeSystemError,
} from "../runtime-contracts";
import type { RuntimeManager } from "../runtime-manager";
import {
  isRuntimeWorkerResponse,
  type RuntimeInitWorkerRequest,
} from "./worker-protocol";

type RuntimeState = "IDLE" | "INITIALIZING" | "READY" | "DISPOSED";

export interface RuntimeWorkerPort {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessageerror: ((event: unknown) => void) | null;
  postMessage(message: RuntimeInitWorkerRequest): void;
  terminate(): void;
}

export type RuntimeWorkerFactory = () => RuntimeWorkerPort;

interface PyodideRuntimeManagerOptions {
  readonly createWorker: RuntimeWorkerFactory;
  readonly indexURL: string;
}

interface PendingInitialization {
  readonly worker: RuntimeWorkerPort;
  readonly requestId: string;
  readonly promise: Promise<RuntimeLifecycleResult>;
  readonly resolve: (result: RuntimeLifecycleResult) => void;
}

const READY_RESULT: RuntimeLifecycleResult = { ok: true };

export class PyodideRuntimeManager implements RuntimeManager {
  private state: RuntimeState = "IDLE";
  private worker: RuntimeWorkerPort | null = null;
  private pendingInitialization: PendingInitialization | null = null;
  private nextRequestNumber = 0;

  constructor(private readonly options: PyodideRuntimeManagerOptions) {}

  initialize(): Promise<RuntimeLifecycleResult> {
    if (this.state === "DISPOSED") {
      return Promise.resolve(
        lifecycleFailure(
          "RUNTIME_DISPOSED",
          "Runtime manager đã được hủy và không thể khởi tạo lại.",
        ),
      );
    }

    if (this.state === "READY") {
      return Promise.resolve(READY_RESULT);
    }

    if (this.pendingInitialization !== null) {
      return this.pendingInitialization.promise;
    }

    let worker: RuntimeWorkerPort;
    try {
      worker = this.options.createWorker();
    } catch (error) {
      return Promise.resolve(
        lifecycleFailure(
          "WORKER_CREATE_FAILED",
          getErrorMessage(error, "Không thể tạo Python runtime worker."),
        ),
      );
    }

    const requestId = `runtime-${++this.nextRequestNumber}`;
    let resolveInitialization!: (result: RuntimeLifecycleResult) => void;
    const promise = new Promise<RuntimeLifecycleResult>((resolve) => {
      resolveInitialization = resolve;
    });

    this.worker = worker;
    this.state = "INITIALIZING";
    this.pendingInitialization = {
      worker,
      requestId,
      promise,
      resolve: resolveInitialization,
    };

    worker.onmessage = (event) => {
      if (!this.isCurrentInitialization(worker, requestId)) {
        return;
      }

      if (!isRuntimeWorkerResponse(event.data)) {
        return;
      }

      if (event.data.requestId !== requestId) {
        return;
      }

      if (event.data.type === "READY") {
        this.completeInitialization(worker, READY_RESULT, false);
        return;
      }

      this.completeInitialization(
        worker,
        {
          ok: false,
          error: event.data.error,
        },
        true,
      );
    };

    worker.onerror = (event) => {
      if (!this.isCurrentInitialization(worker, requestId)) {
        return;
      }

      this.completeInitialization(
        worker,
        lifecycleFailure(
          "WORKER_ERROR",
          getErrorMessage(event, "Python runtime worker gặp lỗi khi khởi tạo."),
        ),
        true,
      );
    };

    worker.onmessageerror = (event) => {
      if (!this.isCurrentInitialization(worker, requestId)) {
        return;
      }

      this.completeInitialization(
        worker,
        lifecycleFailure(
          "WORKER_MESSAGE_ERROR",
          getErrorMessage(
            event,
            "Không thể nhận dữ liệu khởi tạo từ Python runtime worker.",
          ),
        ),
        true,
      );
    };

    try {
      worker.postMessage({
        type: "RUNTIME_INIT",
        requestId,
        indexURL: this.options.indexURL,
      });
    } catch (error) {
      this.completeInitialization(
        worker,
        lifecycleFailure(
          "WORKER_MESSAGE_FAILED",
          getErrorMessage(error, "Không thể gửi yêu cầu khởi tạo runtime."),
        ),
        true,
      );
    }

    return promise;
  }

  prepareMission(
    _request: RuntimeMissionPreparationRequest,
  ): Promise<RuntimeLifecycleResult> {
    return Promise.resolve(
      lifecycleFailure(
        "NOT_IMPLEMENTED",
        "prepareMission chưa được triển khai trong PR.2.",
      ),
    );
  }

  run(_request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    return Promise.resolve(notImplementedExecutionResult("run"));
  }

  submit(_request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    return Promise.resolve(notImplementedExecutionResult("submit"));
  }

  dispose(): void {
    if (this.state === "DISPOSED") {
      return;
    }

    const pending = this.pendingInitialization;
    const worker = this.worker;

    this.state = "DISPOSED";
    this.pendingInitialization = null;
    this.worker = null;

    if (worker !== null) {
      clearWorkerListeners(worker);
      worker.terminate();
    }

    pending?.resolve(
      lifecycleFailure(
        "RUNTIME_DISPOSED",
        "Runtime manager đã được hủy trong khi đang khởi tạo.",
      ),
    );
  }

  private isCurrentInitialization(
    worker: RuntimeWorkerPort,
    requestId: string,
  ): boolean {
    return (
      this.state === "INITIALIZING" &&
      this.worker === worker &&
      this.pendingInitialization?.worker === worker &&
      this.pendingInitialization.requestId === requestId
    );
  }

  private completeInitialization(
    worker: RuntimeWorkerPort,
    result: RuntimeLifecycleResult,
    discardWorker: boolean,
  ): void {
    const pending = this.pendingInitialization;
    if (
      pending === null ||
      pending.worker !== worker ||
      this.worker !== worker ||
      this.state !== "INITIALIZING"
    ) {
      return;
    }

    this.pendingInitialization = null;
    clearWorkerListeners(worker);

    if (discardWorker) {
      worker.terminate();
      this.worker = null;
      this.state = "IDLE";
    } else {
      this.state = "READY";
    }

    pending.resolve(result);
  }
}

class BrowserRuntimeWorkerPort implements RuntimeWorkerPort {
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessageerror: ((event: unknown) => void) | null = null;

  private readonly worker = new Worker(
    new URL("./pyodide-runtime.worker.ts", import.meta.url),
    { type: "module" },
  );

  constructor() {
    this.worker.onmessage = (event) => this.onmessage?.(event);
    this.worker.onerror = (event) => this.onerror?.(event);
    this.worker.onmessageerror = (event) => this.onmessageerror?.(event);
  }

  postMessage(message: RuntimeInitWorkerRequest): void {
    this.worker.postMessage(message);
  }

  terminate(): void {
    this.worker.terminate();
  }
}

export function createPyodideRuntimeManager(): RuntimeManager {
  return new PyodideRuntimeManager({
    createWorker: () => new BrowserRuntimeWorkerPort(),
    indexURL: resolvePyodideIndexURL(),
  });
}

function resolvePyodideIndexURL(): string {
  const applicationBaseURL = new URL(
    import.meta.env.BASE_URL,
    globalThis.location.href,
  );

  return new URL("assets/pyodide/", applicationBaseURL).href;
}

function clearWorkerListeners(worker: RuntimeWorkerPort): void {
  worker.onmessage = null;
  worker.onerror = null;
  worker.onmessageerror = null;
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

function notImplementedExecutionResult(
  operation: "run" | "submit",
): RuntimeExecutionResult {
  return {
    status: RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR,
    stdout: "",
    stderr: "",
    error: {
      code: "NOT_IMPLEMENTED",
      message: `${operation} chưa được triển khai trong PR.2.`,
    },
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim().length > 0
  ) {
    return error.message;
  }

  return fallback;
}
