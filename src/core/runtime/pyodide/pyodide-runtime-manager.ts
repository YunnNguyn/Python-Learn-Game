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
  type RuntimeWorkerRequest,
} from "./worker-protocol";

type RuntimeState =
  | "IDLE"
  | "INITIALIZING"
  | "READY"
  | "RECOVERING"
  | "DISPOSED";

export interface RuntimeWorkerPort {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessageerror: ((event: unknown) => void) | null;
  postMessage(message: RuntimeWorkerRequest): void;
  terminate(): void;
}

export type RuntimeWorkerFactory = () => RuntimeWorkerPort;

export interface PyodideRuntimeManagerOptions {
  readonly createWorker: RuntimeWorkerFactory;
  readonly indexURL: string;
  readonly executionTimeoutMs?: number;
}

interface PendingInitialization {
  readonly worker: RuntimeWorkerPort;
  readonly requestId: string;
  readonly recovery: boolean;
  readonly promise: Promise<RuntimeLifecycleResult>;
  readonly resolve: (result: RuntimeLifecycleResult) => void;
}

type RuntimeExecutionKind = "RUN" | "SUBMIT";

interface PendingExecution {
  readonly worker: RuntimeWorkerPort;
  readonly requestId: string;
  readonly kind: RuntimeExecutionKind;
  readonly promise: Promise<RuntimeExecutionResult>;
  readonly resolve: (result: RuntimeExecutionResult) => void;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
}

interface PendingPreparation {
  readonly worker: RuntimeWorkerPort;
  readonly requestId: string;
  readonly purpose: "CALLER" | "RESTORE";
  readonly snapshot: RuntimeMissionPreparationRequest;
  readonly promise: Promise<RuntimeLifecycleResult>;
  readonly resolve: (result: RuntimeLifecycleResult) => void;
}

const READY_RESULT: RuntimeLifecycleResult = { ok: true };
const DEFAULT_EXECUTION_TIMEOUT_MS = 5_000;

interface PendingTimeoutRecovery {
  readonly promise: Promise<RuntimeLifecycleResult>;
  readonly resolveLifecycle: (result: RuntimeLifecycleResult) => void;
  readonly resolveExecution: (result: RuntimeExecutionResult) => void;
}

export class PyodideRuntimeManager implements RuntimeManager {
  private state: RuntimeState = "IDLE";
  private worker: RuntimeWorkerPort | null = null;
  private pendingInitialization: PendingInitialization | null = null;
  private pendingPreparation: PendingPreparation | null = null;
  private pendingExecution: PendingExecution | null = null;
  private pendingTimeoutRecovery: PendingTimeoutRecovery | null = null;
  private lastSuccessfulPreparation:
    | RuntimeMissionPreparationRequest
    | undefined;
  private environmentLost = false;
  private nextRequestNumber = 0;
  private readonly executionTimeoutMs: number;

  constructor(private readonly options: PyodideRuntimeManagerOptions) {
    this.executionTimeoutMs =
      options.executionTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS;
    assertValidExecutionTimeout(this.executionTimeoutMs);
  }

  initialize(): Promise<RuntimeLifecycleResult> {
    if (this.state === "DISPOSED") {
      return Promise.resolve(
        lifecycleFailure(
          "RUNTIME_DISPOSED",
          "Runtime manager đã được hủy và không thể khởi tạo lại.",
        ),
      );
    }

    if (this.pendingTimeoutRecovery !== null) {
      return this.pendingTimeoutRecovery.promise;
    }

    if (this.state === "READY") {
      return Promise.resolve(READY_RESULT);
    }

    if (this.pendingInitialization !== null) {
      return this.pendingInitialization.promise;
    }

    return this.startInitialization(false);
  }

  private startInitialization(recovery: boolean): Promise<RuntimeLifecycleResult> {
    let worker: RuntimeWorkerPort;
    try {
      worker = this.options.createWorker();
    } catch (error) {
      if (recovery) {
        this.state = "IDLE";
        this.worker = null;
      }
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
    this.state = recovery ? "RECOVERING" : "INITIALIZING";
    this.pendingInitialization = {
      worker,
      requestId,
      recovery,
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

      if (event.data.type === "RUNTIME_ERROR") {
        this.completeInitialization(
          worker,
          {
            ok: false,
            error: event.data.error,
          },
          true,
        );
      }
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
    request: RuntimeMissionPreparationRequest,
  ): Promise<RuntimeLifecycleResult> {
    if (this.state === "DISPOSED") {
      return Promise.resolve(
        lifecycleFailure(
          "RUNTIME_DISPOSED",
          "Runtime manager đã được hủy và không thể chuẩn bị môi trường.",
        ),
      );
    }

    if (this.state === "RECOVERING") {
      return Promise.resolve(
        lifecycleFailure(
          "RUNTIME_RECOVERING",
          "Runtime đang khởi tạo Worker thay thế sau khi lần chạy trước hết thời gian.",
        ),
      );
    }

    if (this.state !== "READY" || this.worker === null) {
      return Promise.resolve(
        lifecycleFailure(
          "RUNTIME_NOT_READY",
          "Runtime chưa sẵn sàng. Hãy khởi tạo runtime trước khi chuẩn bị môi trường.",
        ),
      );
    }

    if (this.pendingExecution !== null || this.pendingPreparation !== null) {
      return Promise.resolve(
        lifecycleFailure(
          "RUNTIME_BUSY",
          "Runtime đang xử lý một thao tác Python khác.",
        ),
      );
    }

    const snapshot = snapshotPreparationRequest(request);
    return this.startPreparation(snapshot, "CALLER");
  }

  private startPreparation(
    snapshot: RuntimeMissionPreparationRequest,
    purpose: "CALLER" | "RESTORE",
  ): Promise<RuntimeLifecycleResult> {
    if (this.worker === null) {
      return Promise.resolve(
        lifecycleFailure(
          "RUNTIME_NOT_READY",
          "Runtime chưa sẵn sàng. Hãy khởi tạo runtime trước khi chuẩn bị môi trường.",
        ),
      );
    }

    const worker = this.worker;
    const requestId = "runtime-" + ++this.nextRequestNumber;
    let resolvePreparation!: (result: RuntimeLifecycleResult) => void;
    const promise = new Promise<RuntimeLifecycleResult>((resolve) => {
      resolvePreparation = resolve;
    });

    this.pendingPreparation = {
      worker,
      requestId,
      purpose,
      snapshot,
      promise,
      resolve: resolvePreparation,
    };

    worker.onmessage = (event) => {
      if (!this.isCurrentPreparation(worker, requestId)) {
        return;
      }

      if (!isRuntimeWorkerResponse(event.data)) {
        return;
      }

      if (event.data.requestId !== requestId) {
        return;
      }

      if (event.data.type === "MISSION_PREPARED") {
        this.completePreparation(worker, READY_RESULT, false);
        return;
      }

      if (event.data.type === "RUNTIME_ERROR") {
        this.completePreparation(
          worker,
          {
            ok: false,
            error: { ...event.data.error },
          },
          false,
        );
      }
    };

    worker.onerror = (event) => {
      if (!this.isCurrentPreparation(worker, requestId)) {
        return;
      }

      this.completePreparation(
        worker,
        lifecycleFailure(
          "WORKER_ERROR",
          getErrorMessage(
            event,
            "Python runtime worker gặp lỗi khi chuẩn bị môi trường.",
          ),
        ),
        purpose === "CALLER",
      );
    };

    worker.onmessageerror = (event) => {
      if (!this.isCurrentPreparation(worker, requestId)) {
        return;
      }

      this.completePreparation(
        worker,
        lifecycleFailure(
          "WORKER_MESSAGE_ERROR",
          getErrorMessage(
            event,
            "Không thể nhận kết quả chuẩn bị từ Python runtime worker.",
          ),
        ),
        purpose === "CALLER",
      );
    };

    try {
      worker.postMessage({
        type: "MISSION_PREPARE",
        requestId,
        runtimeConfig: snapshot.runtimeConfig,
        setupData: snapshot.setupData,
      });
    } catch (error) {
      this.completePreparation(
        worker,
        lifecycleFailure(
          "WORKER_MESSAGE_FAILED",
          getErrorMessage(
            error,
            "Không thể gửi yêu cầu chuẩn bị môi trường tới runtime.",
          ),
        ),
        purpose === "CALLER",
      );
    }

    return promise;
  }

  run(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    if (this.state === "DISPOSED") {
      return Promise.resolve(
        executionFailure(
          "RUNTIME_DISPOSED",
          "Runtime manager đã được hủy và không thể chạy mã.",
        ),
      );
    }

    if (this.state === "RECOVERING") {
      return Promise.resolve(
        executionFailure(
          "RUNTIME_RECOVERING",
          "Runtime đang khởi tạo Worker thay thế sau khi lần chạy trước hết thời gian.",
        ),
      );
    }

    if (this.state !== "READY" || this.worker === null) {
      return Promise.resolve(
        executionFailure(
          "RUNTIME_NOT_READY",
          "Runtime chưa sẵn sàng. Hãy khởi tạo runtime trước khi chạy mã.",
        ),
      );
    }

    if (this.environmentLost) {
      return Promise.resolve(
        executionFailure(
          "RUNTIME_ENVIRONMENT_LOST",
          "Môi trường mission đã mất sau khi Worker bị thay thế. Hãy chuẩn bị lại mission trước khi chạy mã.",
        ),
      );
    }

    if (this.pendingExecution !== null || this.pendingPreparation !== null) {
      return Promise.resolve(
        executionFailure(
          "RUNTIME_BUSY",
          "Runtime đang xử lý một thao tác Python khác.",
        ),
      );
    }

    return this.startExecution("RUN", request);
  }

  submit(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    if (this.state === "DISPOSED") {
      return Promise.resolve(
        executionFailure(
          "RUNTIME_DISPOSED",
          "Runtime manager đã được hủy và không thể nộp mã.",
        ),
      );
    }

    if (this.state === "RECOVERING") {
      return Promise.resolve(
        executionFailure(
          "RUNTIME_RECOVERING",
          "Runtime đang khởi tạo Worker thay thế sau khi lần chạy trước hết thời gian.",
        ),
      );
    }

    if (this.state !== "READY" || this.worker === null) {
      return Promise.resolve(
        executionFailure(
          "RUNTIME_NOT_READY",
          "Runtime chưa sẵn sàng. Hãy khởi tạo runtime trước khi nộp mã.",
        ),
      );
    }

    if (this.environmentLost) {
      return Promise.resolve(
        executionFailure(
          "RUNTIME_ENVIRONMENT_LOST",
          "Môi trường mission đã mất sau khi Worker bị thay thế. Hãy chuẩn bị lại mission trước khi nộp mã.",
        ),
      );
    }

    if (this.pendingExecution !== null || this.pendingPreparation !== null) {
      return Promise.resolve(
        executionFailure(
          "RUNTIME_BUSY",
          "Runtime đang xử lý một thao tác Python khác.",
        ),
      );
    }

    if (this.lastSuccessfulPreparation === undefined) {
      return Promise.resolve(
        executionFailure(
          "RUNTIME_MISSION_NOT_PREPARED",
          "Chưa có mission baseline được chuẩn bị thành công để Submit.",
        ),
      );
    }

    return this.startExecution(
      "SUBMIT",
      request,
      snapshotPreparationRequest(this.lastSuccessfulPreparation),
    );
  }

  private startExecution(
    kind: RuntimeExecutionKind,
    request: RuntimeExecutionRequest,
    preparation?: RuntimeMissionPreparationRequest,
  ): Promise<RuntimeExecutionResult> {
    if (this.worker === null) {
      return Promise.resolve(
        executionFailure(
          "RUNTIME_NOT_READY",
          "Runtime chưa sẵn sàng để thực thi mã.",
        ),
      );
    }

    const worker = this.worker;
    const requestId = "runtime-" + ++this.nextRequestNumber;
    let resolveExecution!: (result: RuntimeExecutionResult) => void;
    const promise = new Promise<RuntimeExecutionResult>((resolve) => {
      resolveExecution = resolve;
    });

    this.pendingExecution = {
      worker,
      requestId,
      kind,
      promise,
      resolve: resolveExecution,
      timeoutHandle: null,
    };

    worker.onmessage = (event) => {
      if (!this.isCurrentExecution(worker, requestId)) {
        return;
      }

      if (!isRuntimeWorkerResponse(event.data)) {
        return;
      }

      if (event.data.requestId !== requestId) {
        return;
      }

      if (
        (kind === "RUN" && event.data.type === "RUN_RESULT") ||
        (kind === "SUBMIT" && event.data.type === "SUBMIT_RESULT")
      ) {
        this.completeExecution(
          worker,
          copyExecutionResult(event.data.result),
          false,
        );
        return;
      }

      if (event.data.type === "RUNTIME_ERROR") {
        this.completeExecution(
          worker,
          executionFailure(event.data.error.code, event.data.error.message),
          true,
        );
      }
    };

    worker.onerror = (event) => {
      if (!this.isCurrentExecution(worker, requestId)) {
        return;
      }

      this.completeExecution(
        worker,
        executionFailure(
          "WORKER_ERROR",
          getErrorMessage(
            event,
            kind === "RUN"
              ? "Python runtime worker gặp lỗi khi chạy mã."
              : "Python runtime worker gặp lỗi khi nộp mã.",
          ),
        ),
        true,
      );
    };

    worker.onmessageerror = (event) => {
      if (!this.isCurrentExecution(worker, requestId)) {
        return;
      }

      this.completeExecution(
        worker,
        executionFailure(
          "WORKER_MESSAGE_ERROR",
          getErrorMessage(
            event,
            "Không thể nhận kết quả từ Python runtime worker.",
          ),
        ),
        true,
      );
    };

    try {
      if (kind === "RUN") {
        worker.postMessage({
          type: "RUN_CODE",
          requestId,
          code: request.code,
          ...(request.observeVariables === undefined
            ? {}
            : { observeVariables: [...request.observeVariables] }),
        });
      } else {
        worker.postMessage({
          type: "SUBMIT_CODE",
          requestId,
          code: request.code,
          ...(request.observeVariables === undefined
            ? {}
            : { observeVariables: [...request.observeVariables] }),
          runtimeConfig: preparation?.runtimeConfig,
          setupData: preparation?.setupData,
        });
      }

      const pending = this.pendingExecution;
      if (
        pending !== null &&
        pending.worker === worker &&
        pending.requestId === requestId
      ) {
        pending.timeoutHandle = setTimeout(() => {
          this.handleExecutionTimeout(worker, requestId);
        }, this.executionTimeoutMs);
      }
    } catch (error) {
      this.completeExecution(
        worker,
        executionFailure(
          "WORKER_MESSAGE_FAILED",
          getErrorMessage(error, "Không thể gửi mã tới Python runtime worker."),
        ),
        true,
      );
    }

    return promise;
  }

  dispose(): void {
    if (this.state === "DISPOSED") {
      return;
    }

    const pending = this.pendingInitialization;
    const pendingPreparation = this.pendingPreparation;
    const pendingExecution = this.pendingExecution;
    const pendingTimeoutRecovery = this.pendingTimeoutRecovery;
    const worker = this.worker;

    this.state = "DISPOSED";
    this.pendingInitialization = null;
    this.pendingPreparation = null;
    this.pendingExecution = null;
    this.pendingTimeoutRecovery = null;
    this.worker = null;
    this.lastSuccessfulPreparation = undefined;
    this.environmentLost = false;

    clearExecutionTimeout(pendingExecution);

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

    pendingExecution?.resolve(
      executionFailure(
        "RUNTIME_DISPOSED",
        pendingExecution.kind === "RUN"
          ? "Runtime manager đã được hủy trong khi đang chạy mã."
          : "Runtime manager đã được hủy trong khi đang nộp mã.",
      ),
    );

    pendingPreparation?.resolve(
      lifecycleFailure(
        "RUNTIME_DISPOSED",
        "Runtime manager đã được hủy trong khi đang chuẩn bị môi trường.",
      ),
    );

    pendingTimeoutRecovery?.resolveLifecycle(
      lifecycleFailure(
        "RUNTIME_DISPOSED",
        "Runtime manager đã được hủy trong khi đang khôi phục sau timeout.",
      ),
    );
    pendingTimeoutRecovery?.resolveExecution(
      executionFailure(
        "RUNTIME_DISPOSED",
        "Runtime manager đã được hủy trong khi đang khôi phục sau timeout.",
      ),
    );
  }

  private isCurrentInitialization(
    worker: RuntimeWorkerPort,
    requestId: string,
  ): boolean {
    return (
      (this.state === "INITIALIZING" || this.state === "RECOVERING") &&
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
      (this.state !== "INITIALIZING" && this.state !== "RECOVERING")
    ) {
      return;
    }

    this.pendingInitialization = null;
    clearWorkerListeners(worker);

    if (discardWorker) {
      worker.terminate();
      this.worker = null;
      this.state = "IDLE";
    } else if (!pending.recovery) {
      this.state = "READY";
    }

    pending.resolve(result);
  }

  private isCurrentExecution(
    worker: RuntimeWorkerPort,
    requestId: string,
  ): boolean {
    return (
      this.state === "READY" &&
      this.worker === worker &&
      this.pendingExecution?.worker === worker &&
      this.pendingExecution.requestId === requestId
    );
  }

  private isCurrentPreparation(
    worker: RuntimeWorkerPort,
    requestId: string,
  ): boolean {
    const pending = this.pendingPreparation;
    return (
      pending !== null &&
      (pending.purpose === "RESTORE"
        ? this.state === "RECOVERING"
        : this.state === "READY") &&
      this.worker === worker &&
      pending.worker === worker &&
      pending.requestId === requestId
    );
  }

  private completePreparation(
    worker: RuntimeWorkerPort,
    result: RuntimeLifecycleResult,
    discardWorker: boolean,
  ): void {
    const pending = this.pendingPreparation;
    if (
      pending === null ||
      pending.worker !== worker ||
      this.worker !== worker ||
      (pending.purpose === "RESTORE"
        ? this.state !== "RECOVERING"
        : this.state !== "READY")
    ) {
      return;
    }

    this.pendingPreparation = null;
    clearWorkerListeners(worker);

    if (result.ok) {
      this.environmentLost = false;
      if (pending.purpose === "CALLER") {
        this.lastSuccessfulPreparation = pending.snapshot;
      }
    }

    if (discardWorker) {
      worker.terminate();
      this.worker = null;
      this.state = "IDLE";
    }

    pending.resolve(result);
  }

  private completeExecution(
    worker: RuntimeWorkerPort,
    result: RuntimeExecutionResult,
    discardWorker: boolean,
  ): void {
    const pending = this.pendingExecution;
    if (
      pending === null ||
      pending.worker !== worker ||
      this.worker !== worker ||
      this.state !== "READY"
    ) {
      return;
    }

    this.pendingExecution = null;
    clearExecutionTimeout(pending);
    clearWorkerListeners(worker);

    if (discardWorker) {
      worker.terminate();
      this.worker = null;
      this.state = "IDLE";
    }

    pending.resolve(result);
  }

  private handleExecutionTimeout(
    worker: RuntimeWorkerPort,
    requestId: string,
  ): void {
    const pending = this.pendingExecution;
    if (
      pending === null ||
      pending.worker !== worker ||
      pending.requestId !== requestId ||
      this.worker !== worker ||
      this.state !== "READY"
    ) {
      return;
    }

    this.pendingExecution = null;
    clearExecutionTimeout(pending);
    clearWorkerListeners(worker);
    worker.terminate();
    this.worker = null;

    const restorationBaseline = this.lastSuccessfulPreparation;
    this.environmentLost = restorationBaseline !== undefined;
    this.state = "RECOVERING";

    let resolveRecovery!: (result: RuntimeLifecycleResult) => void;
    const recoveryPromise = new Promise<RuntimeLifecycleResult>((resolve) => {
      resolveRecovery = resolve;
    });
    const recovery: PendingTimeoutRecovery = {
      promise: recoveryPromise,
      resolveLifecycle: resolveRecovery,
      resolveExecution: pending.resolve,
    };
    this.pendingTimeoutRecovery = recovery;

    const replacementInitialization = this.startInitialization(true);
    void replacementInitialization.then((result) => {
      if (
        this.pendingTimeoutRecovery !== recovery ||
        this.state === "DISPOSED"
      ) {
        return;
      }

      if (!result.ok) {
        this.pendingTimeoutRecovery = null;
        recovery.resolveLifecycle(result);
        recovery.resolveExecution(
          timeoutExecutionResult(
            "EXECUTION_TIMEOUT_RECOVERY_FAILED",
            `Mã Python đã vượt quá giới hạn ${this.executionTimeoutMs} ms và Worker thay thế không thể khởi tạo: ${result.error.message}`,
          ),
        );
        return;
      }

      if (restorationBaseline === undefined) {
        this.state = "READY";
        this.environmentLost = false;
        this.pendingTimeoutRecovery = null;
        recovery.resolveLifecycle(READY_RESULT);
        recovery.resolveExecution(
          timeoutExecutionResult(
            "EXECUTION_TIMEOUT",
            `Mã Python đã vượt quá giới hạn ${this.executionTimeoutMs} ms. Worker đã được thay thế và runtime đã sẵn sàng lại.`,
          ),
        );
        return;
      }

      const restoration = this.startPreparation(
        restorationBaseline,
        "RESTORE",
      );
      void restoration.then((restoreResult) => {
        if (
          this.pendingTimeoutRecovery !== recovery ||
          this.state === "DISPOSED"
        ) {
          return;
        }

        this.pendingTimeoutRecovery = null;

        if (restoreResult.ok) {
          this.state = "READY";
          this.environmentLost = false;
          recovery.resolveLifecycle(READY_RESULT);
          recovery.resolveExecution(
            timeoutExecutionResult(
              "EXECUTION_TIMEOUT",
              `Mã Python đã vượt quá giới hạn ${this.executionTimeoutMs} ms. Worker đã được thay thế và runtime đã sẵn sàng lại.`,
            ),
          );
          return;
        }

        this.state = this.worker === null ? "IDLE" : "READY";
        this.environmentLost = true;
        const restoreFailureMessage =
          `Mã Python đã vượt quá giới hạn ${this.executionTimeoutMs} ms. ` +
          `Worker thay thế đã khởi tạo nhưng môi trường mission không thể khôi phục: ${restoreResult.error.message}`;
        recovery.resolveLifecycle(
          lifecycleFailure(
            "EXECUTION_TIMEOUT_RESTORE_FAILED",
            restoreFailureMessage,
          ),
        );
        recovery.resolveExecution(
          timeoutExecutionResult(
            "EXECUTION_TIMEOUT_RESTORE_FAILED",
            restoreFailureMessage,
          ),
        );
      });
    });
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

  postMessage(message: RuntimeWorkerRequest): void {
    this.worker.postMessage(message);
  }

  terminate(): void {
    this.worker.terminate();
  }
}

export interface CreatePyodideRuntimeManagerOptions {
  readonly executionTimeoutMs?: number;
}

export function createPyodideRuntimeManager(
  options: CreatePyodideRuntimeManagerOptions = {},
): RuntimeManager {
  return new PyodideRuntimeManager({
    createWorker: () => new BrowserRuntimeWorkerPort(),
    indexURL: resolvePyodideIndexURL(),
    executionTimeoutMs: options.executionTimeoutMs,
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

function clearExecutionTimeout(pending: PendingExecution | null): void {
  if (pending?.timeoutHandle !== null && pending?.timeoutHandle !== undefined) {
    clearTimeout(pending.timeoutHandle);
    pending.timeoutHandle = null;
  }
}

function snapshotPreparationRequest(
  request: RuntimeMissionPreparationRequest,
): RuntimeMissionPreparationRequest {
  return {
    runtimeConfig: cloneJsonValue(request.runtimeConfig),
    setupData: cloneJsonValue(request.setupData),
  };
}

function cloneJsonValue<T>(value: T | undefined): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as T;
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
  code: string | undefined,
  message: string,
): RuntimeExecutionResult {
  return {
    status: RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR,
    stdout: "",
    stderr: "",
    error: { code, message },
  };
}

function timeoutExecutionResult(
  code: string,
  message: string,
): RuntimeExecutionResult {
  return {
    status: RUNTIME_EXECUTION_STATUS.TIMEOUT,
    stdout: "",
    stderr: "",
    error: { code, message },
  };
}

function copyExecutionResult(
  result: RuntimeExecutionResult,
): RuntimeExecutionResult {
  if (result.status === RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION) {
    return {
      ...result,
      exception: { ...result.exception },
      ...(result.serialized === undefined
        ? {}
        : { serialized: cloneJsonValue(result.serialized) }),
    };
  }

  if (
    result.status === RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR ||
    result.status === RUNTIME_EXECUTION_STATUS.TIMEOUT
  ) {
    return result.error === undefined
      ? { ...result }
      : { ...result, error: { ...result.error } };
  }

  return {
    ...result,
    ...(result.serialized === undefined
      ? {}
      : { serialized: cloneJsonValue(result.serialized) }),
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

function assertValidExecutionTimeout(value: number): void {
  if (!Number.isFinite(value) || !Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(
      "executionTimeoutMs phải là một số nguyên dương hữu hạn và an toàn.",
    );
  }
}
