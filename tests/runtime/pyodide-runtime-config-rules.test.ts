import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  ALLOWED_RUNTIME_CONFIG_KEY_NAMES,
  ALLOWED_RUNTIME_PACKAGE_NAMES,
  isAllowedRuntimeConfigKey,
  isAllowedRuntimePackage,
  isSimpleDatasetFilename,
} from "../../src/core/runtime/pyodide/runtime-config-rules";

/**
 * PHASE-05-M7.0 Task B.
 *
 * 1. The shared rules are exactly the rules the Worker has always enforced
 *    (frozen expectations written out literally, NOT derived from the module).
 * 2. The Worker, driven through its message protocol with a fake Pyodide,
 *    accepts and rejects exactly the same configurations as before the
 *    extraction. These worker-level assertions are characterization tests:
 *    they were run against the pre-extraction Worker (HEAD 62e6cb7) as well.
 */

const fake = vi.hoisted(() => {
  class FakeProxy {
    destroyed = false;
    destroy(): void {
      this.destroyed = true;
    }
  }
  return {
    FakeProxy,
    loadPackageCalls: [] as unknown[],
    runPythonSources: [] as string[],
    globalsSet: [] as Array<[string, unknown]>,
    loadPackageError: null as Error | null,
  };
});

vi.mock("pyodide", () => ({
  loadPyodide: async () => {
    const pyodide = {
      ffi: { PyProxy: fake.FakeProxy },
      globals: {
        set(name: string, value: unknown) {
          fake.globalsSet.push([name, value]);
        },
        delete() {
          return undefined;
        },
      },
      async loadPackage(packages: unknown) {
        fake.loadPackageCalls.push(packages);
        if (fake.loadPackageError !== null) throw fake.loadPackageError;
      },
      runPython(source: string) {
        fake.runPythonSources.push(source);
        if (source.includes("__runtime_setup_key.isidentifier")) return true;
        if (source.includes("__runtime_setup_json")) return new fake.FakeProxy();
        return undefined;
      },
    };
    return pyodide;
  },
}));

type Posted = { type: string; requestId: string; error?: { code?: string; message: string } };

const posted: Posted[] = [];
let sequence = 0;

function send(message: Record<string, unknown>): void {
  const scope = globalThis as unknown as { onmessage: ((e: { data: unknown }) => void) | null };
  scope.onmessage?.({ data: message });
}

async function reply(requestId: string): Promise<Posted> {
  return vi.waitFor(() => {
    const found = posted.find((m) => m.requestId === requestId);
    if (found === undefined) throw new Error(`no reply for ${requestId}`);
    return found;
  });
}

async function prepare(runtimeConfig: unknown, setupData?: unknown): Promise<Posted> {
  const requestId = `prepare-${++sequence}`;
  send({ type: "MISSION_PREPARE", requestId, runtimeConfig, setupData });
  return reply(requestId);
}

function resetFakes(): void {
  fake.loadPackageCalls.length = 0;
  fake.runPythonSources.length = 0;
  fake.globalsSet.length = 0;
  fake.loadPackageError = null;
}

describe("shared Pyodide runtime config rules (literal expectations)", () => {
  it("lists exactly the packages the Worker has always allowed", () => {
    expect([...ALLOWED_RUNTIME_PACKAGE_NAMES]).toEqual([
      "numpy",
      "pandas",
      "matplotlib",
      "pillow",
      "scipy",
      "scikit-learn",
      "opencv-python",
    ]);
    expect(Object.isFrozen(ALLOWED_RUNTIME_PACKAGE_NAMES)).toBe(true);
  });

  it("lists exactly the config keys the Worker has always allowed", () => {
    expect([...ALLOWED_RUNTIME_CONFIG_KEY_NAMES]).toEqual(["packages", "workspace"]);
    expect(Object.isFrozen(ALLOWED_RUNTIME_CONFIG_KEY_NAMES)).toBe(true);
  });

  it("package check is case-insensitive and exact (no new packages)", () => {
    for (const name of ["numpy", "NumPy", "PANDAS", "Scikit-Learn", "opencv-python", "Pillow"]) {
      expect(isAllowedRuntimePackage(name)).toBe(true);
    }
    for (const name of [
      "requests",
      "torch",
      "tensorflow",
      "micropip",
      "sklearn",
      "opencv",
      "PIL",
      "numpy ",
      " numpy",
      "numpy2",
      "num py",
      "",
      "__proto__",
      "constructor",
      "toString",
    ]) {
      expect(isAllowedRuntimePackage(name)).toBe(false);
    }
  });

  it("config key check accepts only packages and workspace", () => {
    expect(isAllowedRuntimeConfigKey("packages")).toBe(true);
    expect(isAllowedRuntimeConfigKey("workspace")).toBe(true);
    for (const key of ["Packages", "pythonPath", "env", "localPython", "core.local_python", "", "__proto__", "constructor"]) {
      expect(isAllowedRuntimeConfigKey(key)).toBe(false);
    }
  });

  it("dataset filename rule is exactly /^[A-Za-z0-9._-]+$/", () => {
    for (const name of ["a.csv", "A_b-c.1.txt", "0", ".", "..", ".hidden", "x".repeat(300)]) {
      expect(isSimpleDatasetFilename(name)).toBe(true);
    }
    for (const name of [
      "",
      "a b",
      "dir/a.csv",
      "dir\\a.csv",
      "../a",
      "a/..",
      "a\n",
      "a\u0000b",
      "é.csv",
      "a:b",
      "a*",
      "a;b",
      "a$b",
    ]) {
      expect(isSimpleDatasetFilename(name)).toBe(false);
    }
  });

  it("the regex is stateless across repeated calls", () => {
    for (let i = 0; i < 5; i++) expect(isSimpleDatasetFilename("same.csv")).toBe(true);
  });
});

describe("Pyodide Worker enforces the same rules (fake Pyodide, message protocol)", () => {
  beforeAll(async () => {
    (globalThis as unknown as { postMessage: (m: Posted) => void }).postMessage = (m) => {
      posted.push(m);
    };
    await import("../../src/core/runtime/pyodide/pyodide-runtime.worker");
    send({ type: "RUNTIME_INIT", requestId: "init-1", indexURL: "http://local.test/pyodide/" });
    expect((await reply("init-1")).type).toBe("READY");
  });

  it("prepares a mission without runtimeConfig and loads no package", async () => {
    resetFakes();
    expect((await prepare(undefined)).type).toBe("MISSION_PREPARED");
    expect((await prepare({})).type).toBe("MISSION_PREPARED");
    expect(fake.loadPackageCalls).toEqual([]);
  });

  it("loads exactly the requested, de-duplicated allowed packages, names as written", async () => {
    resetFakes();
    const result = await prepare({ packages: ["numpy", "Pandas", "numpy"] });
    expect(result.type).toBe("MISSION_PREPARED");
    expect(fake.loadPackageCalls).toEqual([["numpy", "Pandas"]]);
  });

  it("loads nothing for an empty package list", async () => {
    resetFakes();
    expect((await prepare({ packages: [] })).type).toBe("MISSION_PREPARED");
    expect(fake.loadPackageCalls).toEqual([]);
  });

  it("accepts every allowed package", async () => {
    for (const name of ALLOWED_RUNTIME_PACKAGE_NAMES) {
      resetFakes();
      expect((await prepare({ packages: [name] })).type).toBe("MISSION_PREPARED");
      expect(fake.loadPackageCalls).toEqual([[name]]);
    }
  });

  it("rejects unsupported packages before loading anything", async () => {
    resetFakes();
    const result = await prepare({ packages: ["numpy", "requests", "torch"] });
    expect(result.type).toBe("RUNTIME_ERROR");
    expect(result.error?.code).toBe("UNSUPPORTED_RUNTIME_PACKAGE");
    expect(result.error?.message).toContain("requests, torch");
    expect(result.error?.message).not.toContain("numpy");
    expect(fake.loadPackageCalls).toEqual([]);
  });

  it("rejects unknown runtimeConfig keys, naming the first offender", async () => {
    resetFakes();
    const result = await prepare({ packages: ["numpy"], env: {}, other: 1 });
    expect(result.type).toBe("RUNTIME_ERROR");
    expect(result.error?.code).toBe("UNSUPPORTED_RUNTIME_CONFIG");
    expect(result.error?.message).toContain("env");
    expect(fake.loadPackageCalls).toEqual([]);
  });

  it("rejects malformed package lists", async () => {
    for (const packages of ["numpy", [1], [""], ["  "], [null]]) {
      resetFakes();
      const result = await prepare({ packages });
      expect(result.error?.code).toBe("INVALID_RUNTIME_CONFIG");
      expect(fake.loadPackageCalls).toEqual([]);
    }
  });

  it("reports a package load failure with its own code", async () => {
    resetFakes();
    fake.loadPackageError = new Error("network down");
    const result = await prepare({ packages: ["numpy"] });
    expect(result.error?.code).toBe("RUNTIME_PACKAGE_LOAD_FAILED");
    expect(result.error?.message).toBe("network down");
  });

  // Characterization: "." and ".." satisfy the Worker's rule today (see the note on
  // isSimpleDatasetFilename). M7.0 must not change that; a stricter validator may.
  it("stages datasets with simple file names", async () => {
    resetFakes();
    const result = await prepare({
      workspace: { datasets: [{ filename: "Data_1-a.csv", content: "x,y\n1,2\n" }, { filename: "..", content: "" }] },
    });
    expect(result.type).toBe("MISSION_PREPARED");
    const staged = fake.globalsSet.find(([name]) => name === "__mission_datasets_json");
    expect(JSON.parse(staged?.[1] as string)).toEqual([
      { filename: "Data_1-a.csv", content: "x,y\n1,2\n" },
      { filename: "..", content: "" },
    ]);
  });

  it("rejects dataset file names outside the rule, before touching the workspace", async () => {
    for (const filename of ["", "a b.csv", "dir/a.csv", "..\\a", "é.csv", "a\n"]) {
      resetFakes();
      const result = await prepare({ workspace: { datasets: [{ filename, content: "" }] } });
      expect(result.type).toBe("RUNTIME_ERROR");
      expect(result.error?.code).toBe("INVALID_DATASETS");
      expect(result.error?.message).toContain("Tên dataset không hợp lệ");
      expect(fake.globalsSet.some(([name]) => name === "__mission_datasets_json")).toBe(false);
    }
  });

  it("rejects malformed workspace and dataset entries", async () => {
    resetFakes();
    expect((await prepare({ workspace: [] })).error?.code).toBe("INVALID_RUNTIME_CONFIG");
    expect((await prepare({ workspace: { datasets: "x" } })).error?.code).toBe("INVALID_RUNTIME_CONFIG");
    expect((await prepare({ workspace: { datasets: [{ filename: "a" }] } })).error?.code).toBe("INVALID_DATASETS");
    expect((await prepare({ workspace: { datasets: [null] } })).error?.code).toBe("INVALID_DATASETS");
  });

  it("applies the same rules on the Submit path (no package load before rejection)", async () => {
    resetFakes();
    const bad = `submit-${++sequence}`;
    send({ type: "SUBMIT_CODE", requestId: bad, code: "x = 1", runtimeConfig: { packages: ["requests"] } });
    const rejected = await reply(bad);
    expect(rejected.type).toBe("SUBMIT_RESULT");
    expect(JSON.stringify(rejected)).toContain("UNSUPPORTED_RUNTIME_PACKAGE");
    expect(fake.loadPackageCalls).toEqual([]);

    const badName = `submit-${++sequence}`;
    send({
      type: "SUBMIT_CODE",
      requestId: badName,
      code: "x = 1",
      runtimeConfig: { workspace: { datasets: [{ filename: "a/b", content: "" }] } },
    });
    expect(JSON.stringify(await reply(badName))).toContain("INVALID_DATASETS");
  });
});
