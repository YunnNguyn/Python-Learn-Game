import { z } from "zod";

import { RuntimeVariableObservationsSchema } from "../runtime-observations";

export const LOCAL_PYTHON_PROTOCOL_VERSION = 2;

export const LocalPythonHealthSchema = z.strictObject({
  ok: z.literal(true),
  service: z.literal("python-learn-runtime"),
  protocolVersion: z.literal(LOCAL_PYTHON_PROTOCOL_VERSION),
  pythonVersion: z.string(),
  pythonExecutable: z.string(),
  pid: z.number().int().positive(),
});

export type LocalPythonHealth = z.infer<typeof LocalPythonHealthSchema>;

export const LocalPythonSessionCreatedSchema = z.strictObject({
  sessionId: z.string().min(1),
});

const LocalPythonWorkspaceFileSchema = z.strictObject({
  filename: z.string().min(1),
  relativePath: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  description: z.string().optional(),
  extension: z.string().optional(),
  category: z.string().optional(),
});

const LocalPythonWorkspaceSchema = z.strictObject({
  datasets: z.array(LocalPythonWorkspaceFileSchema),
  artifacts: z.array(LocalPythonWorkspaceFileSchema),
});

export const LocalPythonLifecycleResponseSchema = z.discriminatedUnion("ok", [
  z.strictObject({
    ok: z.literal(true),
    workspace: LocalPythonWorkspaceSchema.optional(),
  }),
  z.strictObject({
    ok: z.literal(false),
    error: z.strictObject({
      code: z.string().optional(),
      message: z.string(),
    }),
  }),
]);

const LocalPythonExecutionBaseSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  workspace: LocalPythonWorkspaceSchema.optional(),
});

export const LocalPythonExecutionResponseSchema = z.discriminatedUnion("status", [
  LocalPythonExecutionBaseSchema.extend({
    status: z.literal("SUCCESS"),
    serialized: RuntimeVariableObservationsSchema.optional(),
  }).strict(),
  LocalPythonExecutionBaseSchema.extend({
    status: z.literal("PYTHON_EXCEPTION"),
    exception: z.strictObject({
      type: z.string().optional(),
      message: z.string(),
      traceback: z.string().optional(),
    }),
    serialized: RuntimeVariableObservationsSchema.optional(),
  }).strict(),
  LocalPythonExecutionBaseSchema.extend({
    status: z.literal("RUNTIME_ERROR"),
    error: z.strictObject({
      code: z.string().optional(),
      message: z.string(),
    }),
  }).strict(),
  LocalPythonExecutionBaseSchema.extend({
    status: z.literal("TIMEOUT"),
    error: z
      .strictObject({
        code: z.string().optional(),
        message: z.string(),
      })
      .optional(),
  }).strict(),
]);
