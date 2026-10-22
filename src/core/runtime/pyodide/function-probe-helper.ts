import type { PyodideInterface } from "pyodide";
import type { PyProxy } from "pyodide/ffi";

import {
  FunctionProbeObservationSchema,
  type FunctionProbeObservation,
  type FunctionProbeSpec,
} from "../function-probes";

/**
 * Python-side helper executed inside Pyodide to call learner-defined functions
 * (PHASE-07 / M9 behavioral grading).
 *
 * Kept free of any Worker/DOM code so the Worker and the tests run the SAME source in a
 * real Pyodide instance (see `runFunctionProbes`).
 *
 * Safety properties, by construction:
 *  - It receives DATA only (function names + typed-JSON arguments). It never evaluates
 *    text, never imports a module named by data, and never sees an expected value.
 *  - Arguments are rebuilt from the data for every call, so a function that mutates its
 *    input cannot affect the next case.
 *  - Each call is isolated: any exception (even SystemExit) becomes a per-case record
 *    and the remaining cases still run. The learner's print output is discarded.
 *  - Results are normalized to typed JSON (tuple/set/ndarray wrappers); anything else
 *    is reported as "unsupported" instead of being guessed at.
 *  - The learner program is NOT re-executed: the functions already exist in the
 *    namespace the Submit produced.
 *
 * Timeouts and cancellation are the existing ones: probes run inside the same Submit
 * request, so the runtime manager's execution deadline and `interrupt()` cover them.
 */
export const FUNCTION_PROBE_HELPER_SOURCE = `
import contextlib
import json
import math
import sys

_JS_SAFE_INTEGER = 9007199254740991
_MAX_NODES = 20000
_MAX_DEPTH = 24
_MAX_MESSAGE = 200
_DTYPES = ("bool", "int8", "int16", "int32", "int64", "uint8", "uint16", "uint32", "uint64", "float32", "float64")

class _Unsupported(Exception):
    pass

class _Sink:
    def write(self, text):
        return len(text)

    def flush(self):
        pass

def _numpy():
    np = sys.modules.get("numpy")
    if np is None:
        try:
            import numpy as np
        except Exception:
            raise _Unsupported("NumPy chưa được nạp trong môi trường này")
    return np

def _decode(value, depth=0):
    if depth > _MAX_DEPTH:
        raise _Unsupported("tham số lồng quá sâu")
    if value is None or isinstance(value, (bool, str, int, float)):
        return value
    if isinstance(value, list):
        return [_decode(item, depth + 1) for item in value]
    if isinstance(value, dict):
        if "$tuple" in value:
            return tuple(_decode(item, depth + 1) for item in value["$tuple"])
        if "$set" in value:
            return set(_decode(item, depth + 1) for item in value["$set"])
        if "$float" in value:
            return float(value["$float"])
        if "$ndarray" in value:
            np = _numpy()
            dtype = value.get("dtype")
            array = np.array(value["$ndarray"], dtype=dtype) if dtype else np.array(value["$ndarray"])
            shape = value.get("shape")
            if shape is not None:
                array = array.reshape(tuple(shape))
            return array
        return {key: _decode(item, depth + 1) for key, item in value.items()}
    raise _Unsupported("kiểu tham số không được hỗ trợ")

def _encode(value, state, depth=0):
    state["nodes"] += 1
    if state["nodes"] > _MAX_NODES:
        raise _Unsupported("kết quả quá lớn")
    if depth > _MAX_DEPTH:
        raise _Unsupported("kết quả lồng quá sâu")
    np = sys.modules.get("numpy")
    if value is None or isinstance(value, (bool, str)):
        return value
    if np is not None and isinstance(value, np.generic):
        if isinstance(value, np.bool_):
            return bool(value)
        if isinstance(value, np.integer):
            return _encode(int(value), state, depth)
        if isinstance(value, np.floating):
            return _encode(float(value), state, depth)
        raise _Unsupported("kiểu số của NumPy này chưa được hỗ trợ")
    if isinstance(value, int):
        if abs(value) > _JS_SAFE_INTEGER:
            raise _Unsupported("số nguyên quá lớn để so sánh")
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise _Unsupported("số thực không hữu hạn (NaN hoặc vô cực)")
        return value
    if isinstance(value, list):
        return [_encode(item, state, depth + 1) for item in value]
    if isinstance(value, tuple):
        return {"$tuple": [_encode(item, state, depth + 1) for item in value]}
    if isinstance(value, (set, frozenset)):
        items = [_encode(item, state, depth + 1) for item in value]
        items.sort(key=lambda item: json.dumps(item, sort_keys=True))
        return {"$set": items}
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise _Unsupported("khóa của dict phải là chuỗi")
            if key.startswith("$"):
                raise _Unsupported("khóa của dict không được bắt đầu bằng $")
            result[key] = _encode(item, state, depth + 1)
        return result
    if np is not None and isinstance(value, np.ndarray):
        dtype = str(value.dtype)
        if dtype not in _DTYPES:
            raise _Unsupported("dtype " + dtype + " chưa được hỗ trợ")
        state["nodes"] += int(value.size)
        if state["nodes"] > _MAX_NODES:
            raise _Unsupported("kết quả quá lớn")
        if value.dtype.kind == "f" and not bool(np.isfinite(value).all()):
            raise _Unsupported("mảng chứa NaN hoặc vô cực")
        return {"$ndarray": value.tolist(), "dtype": dtype, "shape": [int(d) for d in value.shape]}
    raise _Unsupported("kiểu " + type(value).__name__ + " chưa được hỗ trợ trong kiểm tra hàm")

def _fingerprint(args, kwargs):
    try:
        state = {"nodes": 0}
        return json.dumps(
            [[_encode(a, state) for a in args], {k: _encode(kwargs[k], state) for k in sorted(kwargs)}],
            sort_keys=True,
        )
    except Exception:
        return "unencodable"

def _first_line(text):
    for line in str(text).splitlines():
        if line.strip():
            return line.strip()[:_MAX_MESSAGE]
    return ""

def _probe_case(fn, case, sink):
    check_args = bool(case.get("checkArgsUnchanged"))
    try:
        args = [_decode(item) for item in case.get("args", [])]
        kwargs = {key: _decode(item) for key, item in case.get("kwargs", {}).items()}
        before = _fingerprint(args, kwargs) if check_args else None
    except Exception as problem:
        reason = str(problem) if isinstance(problem, _Unsupported) else "tham số kiểm tra không dùng được"
        return {"outcome": "unsupported", "pythonType": "n/a", "reason": reason}

    try:
        with contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
            result = fn(*args, **kwargs)
    except BaseException as error:
        try:
            message = _first_line(error)
        except BaseException:
            message = ""
        observed = {
            "outcome": "raised",
            "exceptionType": type(error).__name__,
            "exceptionMro": [c.__name__ for c in type(error).__mro__ if c is not object][:8],
            "message": message,
        }
    else:
        try:
            observed = {
                "outcome": "returned",
                "pythonType": type(result).__name__,
                "value": _encode(result, {"nodes": 0}),
            }
        except _Unsupported as problem:
            observed = {"outcome": "unsupported", "pythonType": type(result).__name__, "reason": str(problem)}
        except Exception:
            observed = {
                "outcome": "unsupported",
                "pythonType": type(result).__name__,
                "reason": "không thể chuẩn hóa kết quả",
            }

    if check_args:
        observed["argsMutated"] = _fingerprint(args, kwargs) != before
    return observed

def __probe_run(scope, spec_json):
    specs = json.loads(spec_json)
    sink = _Sink()
    functions = []
    for spec in specs:
        name = spec["function"]
        if name not in scope:
            functions.append({"function": name, "status": "MISSING", "cases": []})
            continue
        fn = scope[name]
        if not callable(fn):
            functions.append({"function": name, "status": "NOT_CALLABLE", "cases": []})
            continue
        functions.append({
            "function": name,
            "status": "OK",
            "cases": [_probe_case(fn, case, sink) for case in spec["cases"]],
        })
    return json.dumps({"functions": functions}, allow_nan=False, separators=(",", ":"))
`;

/** The expression the Worker evaluates in the learner's namespace after a successful Submit. */
export function buildFunctionProbeExpression(specs: readonly FunctionProbeSpec[]): string {
  return `(lambda __probe_ns: (exec(${JSON.stringify(
    FUNCTION_PROBE_HELPER_SOURCE,
  )}, __probe_ns), __probe_ns["__probe_run"](globals(), ${JSON.stringify(
    JSON.stringify(specs),
  )}))[1])({})`;
}

/**
 * Runs the probes in `globals` (the namespace the learner program just populated) and
 * returns one validated observation per probe, in request order. Throws when the helper
 * itself misbehaves - never when a learner function does (that is a per-case result).
 */
export async function runFunctionProbes(
  pyodide: PyodideInterface,
  globals: PyProxy,
  specs: readonly FunctionProbeSpec[],
): Promise<readonly FunctionProbeObservation[]> {
  let serializedValue: unknown;
  try {
    serializedValue = await pyodide.runPythonAsync(buildFunctionProbeExpression(specs), { globals });
    if (typeof serializedValue !== "string") {
      throw new Error("Function probe helper returned a non-string payload.");
    }
    const parsed = JSON.parse(serializedValue) as { functions?: unknown };
    if (!Array.isArray(parsed.functions) || parsed.functions.length !== specs.length) {
      throw new Error("Function probe helper returned an unexpected payload.");
    }
    return parsed.functions.map((entry) => FunctionProbeObservationSchema.parse(entry));
  } finally {
    if (serializedValue instanceof pyodide.ffi.PyProxy) {
      serializedValue.destroy();
    }
  }
}
