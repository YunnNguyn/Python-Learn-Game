import type { JsonObject } from "../../domain";
import {
  RUNTIME_EXECUTION_STATUS,
  type RuntimeExecutionRequest,
  type RuntimeExecutionResult,
  type RuntimeLifecycleResult,
  type RuntimeMissionPreparationRequest,
} from "../runtime-contracts";
import type { RuntimeManager } from "../runtime-manager";
import {
  LocalPythonExecutionResponseSchema,
  LocalPythonHealthSchema,
  LocalPythonLifecycleResponseSchema,
  LocalPythonSessionCreatedSchema,
} from "./local-python-protocol";

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (
  input: string,
  init?: {
    readonly method?: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: string;
  },
) => Promise<FetchResponseLike>;

export interface LocalPythonRuntimeManagerOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
}

type LocalRuntimeState = "IDLE" | "READY" | "DISPOSED";

const DEFAULT_LOCAL_RUNTIME_URL = "http://127.0.0.1:8765";

export class LocalPythonRuntimeManager implements RuntimeManager {
  private state: LocalRuntimeState = "IDLE";
  private sessionId: string | null = null;
  private initializationPromise: Promise<RuntimeLifecycleResult> | null = null;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: LocalPythonRuntimeManagerOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_LOCAL_RUNTIME_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch.bind(globalThis) as FetchLike);
  }

  initialize(): Promise<RuntimeLifecycleResult> {
    if (this.state === "DISPOSED") {
      return Promise.resolve(failure("RUNTIME_DISPOSED", "Local Python runtime đã được hủy."));
    }
    if (this.state === "READY" && this.sessionId !== null) {
      return Promise.resolve({ ok: true });
    }
    this.initializationPromise ??= this.initializeInternal().finally(() => {
      this.initializationPromise = null;
    });
    return this.initializationPromise;
  }

  private async initializeInternal(): Promise<RuntimeLifecycleResult> {
    try {
      const healthResponse = await this.fetchImpl(`${this.baseUrl}/health`);
      if (!healthResponse.ok) {
        return failure(
          "LOCAL_RUNTIME_UNAVAILABLE",
          `Local Python runtime không phản hồi health check (HTTP ${healthResponse.status}).`,
        );
      }
      const health = LocalPythonHealthSchema.safeParse(await healthResponse.json());
      if (!health.success) {
        return failure(
          "LOCAL_RUNTIME_PROTOCOL_MISMATCH",
          "Local Python runtime đang chạy nhưng protocol không tương thích với ứng dụng.",
        );
      }

      const sessionResponse = await this.fetchImpl(`${this.baseUrl}/sessions`, {
        method: "POST",
        headers: jsonHeaders(),
        body: "{}",
      });
      if (!sessionResponse.ok) {
        return failure(
          "LOCAL_RUNTIME_SESSION_FAILED",
          `Không thể tạo phiên chạy local (HTTP ${sessionResponse.status}).`,
        );
      }
      const session = LocalPythonSessionCreatedSchema.safeParse(await sessionResponse.json());
      if (!session.success) {
        return failure(
          "LOCAL_RUNTIME_PROTOCOL_MISMATCH",
          "Local Python runtime trả về session payload không hợp lệ.",
        );
      }

      this.sessionId = session.data.sessionId;
      this.state = "READY";
      return { ok: true };
    } catch (error) {
      return failure(
        "LOCAL_RUNTIME_UNAVAILABLE",
        getErrorMessage(
          error,
          "Không kết nối được Local Python runtime. Hãy chạy local-runtime\\start-runtime.cmd rồi thử lại.",
        ),
      );
    }
  }

  async prepareMission(request: RuntimeMissionPreparationRequest): Promise<RuntimeLifecycleResult> {
    const ready = this.requireReady();
    if (!ready.ok) return ready;

    try {
      const response = await this.fetchImpl(this.sessionUrl("prepare"), {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          runtimeConfig: request.runtimeConfig ?? {},
          setupData: request.setupData ?? {},
        }),
      });
      return await parseLifecycleResponse(response, "Không thể chuẩn bị Local Python workspace.");
    } catch (error) {
      return failure("LOCAL_RUNTIME_REQUEST_FAILED", getErrorMessage(error, "Không thể chuẩn bị Local Python workspace."));
    }
  }

  run(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    return this.execute("RUN", request);
  }

  submit(request: RuntimeExecutionRequest): Promise<RuntimeExecutionResult> {
    return this.execute("SUBMIT", request);
  }

  async interrupt(): Promise<RuntimeLifecycleResult> {
    const ready = this.requireReady();
    if (!ready.ok) return ready;

    try {
      const response = await this.fetchImpl(this.sessionUrl("interrupt"), {
        method: "POST",
        headers: jsonHeaders(),
        body: "{}",
      });
      return await parseLifecycleResponse(response, "Không thể dừng tiến trình Python đang chạy.");
    } catch (error) {
      return failure("LOCAL_RUNTIME_REQUEST_FAILED", getErrorMessage(error, "Không thể dừng tiến trình Python đang chạy."));
    }
  }

  dispose(): void {
    if (this.state === "DISPOSED") return;
    const sessionId = this.sessionId;
    this.state = "DISPOSED";
    this.sessionId = null;

    if (sessionId !== null) {
      void this.fetchImpl(`${this.baseUrl}/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
  }

  private async execute(
    kind: "RUN" | "SUBMIT",
    request: RuntimeExecutionRequest,
  ): Promise<RuntimeExecutionResult> {
    const ready = this.requireReady();
    if (!ready.ok) {
      return executionFailure(ready.error.code ?? "LOCAL_RUNTIME_NOT_READY", ready.error.message);
    }

    try {
      const response = await this.fetchImpl(this.sessionUrl("execute"), {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          kind,
          code: request.code,
          observeVariables: request.observeVariables ?? [],
        }),
      });

      if (!response.ok) {
        const parsed = LocalPythonLifecycleResponseSchema.safeParse(await safeJson(response));
        if (parsed.success && !parsed.data.ok) {
          return executionFailure(parsed.data.error.code ?? "LOCAL_RUNTIME_EXECUTION_FAILED", parsed.data.error.message);
        }
        return executionFailure(
          "LOCAL_RUNTIME_EXECUTION_FAILED",
          `Local Python runtime từ chối yêu cầu chạy mã (HTTP ${response.status}).`,
        );
      }

      const result = LocalPythonExecutionResponseSchema.safeParse(await response.json());
      if (!result.success) {
        return executionFailure(
          "LOCAL_RUNTIME_PROTOCOL_MISMATCH",
          "Local Python runtime trả về execution payload không hợp lệ.",
        );
      }
      const data = result.data;
      if (data.status === RUNTIME_EXECUTION_STATUS.SUCCESS) {
        const { serialized, ...rest } = data;
        return {
          ...rest,
          ...(serialized !== undefined
            ? { serialized: serialized as unknown as JsonObject }
            : {}),
        };
      }
      if (data.status === RUNTIME_EXECUTION_STATUS.PYTHON_EXCEPTION) {
        const { serialized, ...rest } = data;
        return {
          ...rest,
          ...(serialized !== undefined
            ? { serialized: serialized as unknown as JsonObject }
            : {}),
        };
      }
      return data;
    } catch (error) {
      return executionFailure(
        "LOCAL_RUNTIME_REQUEST_FAILED",
        getErrorMessage(error, "Mất kết nối với Local Python runtime trong khi chạy mã."),
      );
    }
  }

  private requireReady(): RuntimeLifecycleResult {
    if (this.state === "DISPOSED") {
      return failure("RUNTIME_DISPOSED", "Local Python runtime đã được hủy.");
    }
    if (this.state !== "READY" || this.sessionId === null) {
      return failure(
        "LOCAL_RUNTIME_NOT_READY",
        "Local Python runtime chưa sẵn sàng. Hãy initialize trước khi chạy.",
      );
    }
    return { ok: true };
  }

  private sessionUrl(action: string): string {
    return `${this.baseUrl}/sessions/${encodeURIComponent(this.sessionId!)}/${action}`;
  }
}

export function createLocalPythonRuntimeManager(
  options: LocalPythonRuntimeManagerOptions = {},
): RuntimeManager {
  return new LocalPythonRuntimeManager(options);
}

async function parseLifecycleResponse(
  response: FetchResponseLike,
  fallbackMessage: string,
): Promise<RuntimeLifecycleResult> {
  const parsed = LocalPythonLifecycleResponseSchema.safeParse(await safeJson(response));
  if (parsed.success) return parsed.data;
  if (response.ok) return { ok: true };
  return failure("LOCAL_RUNTIME_REQUEST_FAILED", fallbackMessage);
}

async function safeJson(response: FetchResponseLike): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function jsonHeaders(): Readonly<Record<string, string>> {
  return { "Content-Type": "application/json" };
}

function failure(code: string, message: string): RuntimeLifecycleResult {
  return { ok: false, error: { code, message } };
}

function executionFailure(code: string, message: string): RuntimeExecutionResult {
  return {
    status: RUNTIME_EXECUTION_STATUS.RUNTIME_ERROR,
    stdout: "",
    stderr: "",
    error: { code, message },
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}

export type LocalPythonRuntimeConfig = JsonObject & {
  readonly executionTimeoutSeconds?: number;
};
