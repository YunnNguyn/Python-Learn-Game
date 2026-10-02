import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/editor/editor.api.js";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import "monaco-editor/languages/definitions/python/register.js";

type MonacoEnvironment = {
  readonly getWorker: () => Worker;
};

const runtimeGlobal = globalThis as typeof globalThis & {
  MonacoEnvironment?: MonacoEnvironment;
};

runtimeGlobal.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });
