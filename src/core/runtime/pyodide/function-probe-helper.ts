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
 * M10 (PHASE-08) additions, same rules: pandas DataFrame / Series and Matplotlib Axes are
 * decoded from / encoded into the typed-JSON wrappers ("$dataframe", "$series", "$figure")
 * without ever evaluating text; figures a case creates are closed after the case so
 * nothing accumulates; and a "value" probe reads (never calls) a learner variable.
 *
 * Timeouts and cancellation are the existing ones: probes run inside the same Submit
 * request, so the runtime manager's execution deadline and `interrupt()` cover them.
 */
export const FUNCTION_PROBE_HELPER_SOURCE = `
import contextlib
import json
import math
import sys
import warnings

_JS_SAFE_INTEGER = 9007199254740991
_MAX_NODES = 20000
_MAX_DEPTH = 24
_MAX_MESSAGE = 200
_MAX_ROWS = 200
_MAX_COLS = 24
_MAX_SERIES = 8
_MAX_POINTS = 400
_TABLE_DTYPES = ("int64", "float64", "bool", "str", "object", "category")
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

def _pandas():
    pd = sys.modules.get("pandas")
    if pd is None:
        try:
            import pandas as pd
        except Exception:
            raise _Unsupported("pandas chưa được nạp trong môi trường này")
    return pd

def _decode_frame(payload, depth):
    pd = _pandas()
    columns = list(payload["columns"])
    data = [[_decode(cell, depth + 1) for cell in row] for row in payload["data"]]
    frame = pd.DataFrame(data, columns=columns, index=payload.get("index"))
    dtypes = payload.get("dtypes")
    if dtypes:
        frame = frame.astype(dict(dtypes))
    if "indexName" in payload:
        frame.index.name = payload["indexName"]
    return frame

def _decode_series(payload, depth):
    pd = _pandas()
    data = [_decode(cell, depth + 1) for cell in payload["data"]]
    series = pd.Series(data, index=payload.get("index"), name=payload.get("name"), dtype=payload.get("dtype") or None)
    return series

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
        if "$dataframe" in value:
            return _decode_frame(value["$dataframe"], depth)
        if "$series" in value:
            return _decode_series(value["$series"], depth)
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

def _cell(value, state):
    state["nodes"] += 1
    if state["nodes"] > _MAX_NODES:
        raise _Unsupported("bảng quá lớn")
    if value is None:
        return None
    pd = sys.modules.get("pandas")
    if pd is not None and (value is pd.NA or value is pd.NaT):
        return None
    np = sys.modules.get("numpy")
    if np is not None and isinstance(value, np.generic):
        if isinstance(value, np.bool_):
            return bool(value)
        if isinstance(value, np.integer):
            value = int(value)
        elif isinstance(value, np.floating):
            value = float(value)
        else:
            raise _Unsupported("ô kiểu " + type(value).__name__ + " chưa được hỗ trợ")
    if isinstance(value, (bool, str)):
        return value
    if isinstance(value, int):
        if abs(value) > _JS_SAFE_INTEGER:
            raise _Unsupported("số nguyên quá lớn để so sánh")
        return value
    if isinstance(value, float):
        if math.isnan(value):
            return None
        if math.isinf(value):
            raise _Unsupported("bảng chứa giá trị vô cực")
        return value
    raise _Unsupported("ô kiểu " + type(value).__name__ + " chưa được hỗ trợ")

def _dtype_name(dtype):
    name = str(dtype)
    if name not in _TABLE_DTYPES:
        raise _Unsupported("dtype " + name + " chưa được hỗ trợ (dùng int64, float64, bool, str, object hoặc category)")
    return name

def _index_labels(index, state):
    pd = sys.modules.get("pandas")
    if isinstance(index, pd.MultiIndex):
        raise _Unsupported("index nhiều cấp (MultiIndex) chưa được hỗ trợ; hãy dùng reset_index()")
    return [_cell(label, state) for label in index.tolist()]

def _index_name(index):
    name = index.name
    if name is None or isinstance(name, str):
        return name
    raise _Unsupported("tên index phải là chuỗi")

def _encode_frame(frame, state):
    if frame.shape[0] > _MAX_ROWS or frame.shape[1] > _MAX_COLS:
        raise _Unsupported("bảng quá lớn (tối đa " + str(_MAX_ROWS) + " hàng, " + str(_MAX_COLS) + " cột)")
    columns = list(frame.columns)
    if not all(isinstance(name, str) for name in columns):
        raise _Unsupported("tên cột phải là chuỗi")
    if len(set(columns)) != len(columns):
        raise _Unsupported("DataFrame có tên cột trùng nhau")
    dtypes = {name: _dtype_name(frame.dtypes.iloc[position]) for position, name in enumerate(columns)}
    index = _index_labels(frame.index, state)
    data = [[_cell(cell, state) for cell in row] for row in frame.itertuples(index=False, name=None)]
    return {"$dataframe": {"columns": columns, "data": data, "index": index, "indexName": _index_name(frame.index), "dtypes": dtypes}}

def _encode_series(series, state):
    if series.shape[0] > _MAX_ROWS:
        raise _Unsupported("Series quá dài (tối đa " + str(_MAX_ROWS) + " phần tử)")
    name = series.name
    if name is not None and not isinstance(name, str):
        raise _Unsupported("tên Series phải là chuỗi")
    return {"$series": {
        "data": [_cell(cell, state) for cell in series.tolist()],
        "index": _index_labels(series.index, state),
        "name": name,
        "dtype": _dtype_name(series.dtype),
    }}

def _axis_value(value):
    np = sys.modules.get("numpy")
    if np is not None and isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, bool):
        raise _Unsupported("trục dữ liệu chứa giá trị bool")
    if isinstance(value, (int, float)):
        if isinstance(value, float) and not math.isfinite(value):
            raise _Unsupported("dữ liệu biểu đồ chứa NaN hoặc vô cực")
        return value
    if isinstance(value, str):
        return value
    raise _Unsupported("dữ liệu trục kiểu " + type(value).__name__ + " chưa được hỗ trợ")

def _plain_label(label):
    if label is None or not isinstance(label, str) or label.startswith("_"):
        return None
    return label

def _encode_axes(ax):
    import matplotlib.category as mcat
    import matplotlib.container as mcont
    try:
        ax.figure.canvas.draw()
    except Exception:
        pass
    series = []
    for line in ax.lines:
        xs = line.get_xdata(orig=True)
        ys = line.get_ydata(orig=True)
        if len(xs) > _MAX_POINTS:
            raise _Unsupported("biểu đồ có quá nhiều điểm (tối đa " + str(_MAX_POINTS) + ")")
        series.append({"kind": "line", "x": [_axis_value(v) for v in xs], "y": [_axis_value(v) for v in ys], "label": _plain_label(line.get_label())})
    categorical = isinstance(ax.xaxis.get_major_formatter(), mcat.StrCategoryFormatter)
    def x_label(position):
        if categorical:
            return str(ax.xaxis.get_major_formatter()(position))
        return _axis_value(float(position))
    for container in ax.containers:
        if not isinstance(container, mcont.BarContainer):
            continue
        if getattr(container, "orientation", "vertical") == "horizontal":
            raise _Unsupported("biểu đồ thanh ngang (barh) chưa được hỗ trợ")
        patches = list(container.patches)
        if len(patches) > _MAX_POINTS:
            raise _Unsupported("biểu đồ có quá nhiều điểm (tối đa " + str(_MAX_POINTS) + ")")
        series.append({
            "kind": "bar",
            "x": [x_label(patch.get_x() + patch.get_width() / 2.0) for patch in patches],
            "y": [_axis_value(float(patch.get_height())) for patch in patches],
            "label": _plain_label(container.get_label()),
        })
    for collection in ax.collections:
        if type(collection).__name__ != "PathCollection":
            continue
        offsets = collection.get_offsets()
        if len(offsets) > _MAX_POINTS:
            raise _Unsupported("biểu đồ có quá nhiều điểm (tối đa " + str(_MAX_POINTS) + ")")
        series.append({
            "kind": "scatter",
            "x": [x_label(point[0]) for point in offsets],
            "y": [_axis_value(float(point[1])) for point in offsets],
            "label": _plain_label(collection.get_label()),
        })
    if len(series) > _MAX_SERIES:
        raise _Unsupported("biểu đồ có quá nhiều nhóm dữ liệu (tối đa " + str(_MAX_SERIES) + ")")
    legend = ax.get_legend()
    return {"$figure": {
        "title": ax.get_title(),
        "xlabel": ax.get_xlabel(),
        "ylabel": ax.get_ylabel(),
        "legend": [text.get_text() for text in legend.get_texts()] if legend is not None else [],
        "series": series,
    }}

def _encode_figure_object(value):
    axes = list(value.axes)
    if len(axes) == 0:
        raise _Unsupported("Figure chưa có Axes nào")
    if len(axes) > 1:
        raise _Unsupported("Figure có nhiều Axes; hãy trả về đúng một Axes")
    return _encode_axes(axes[0])

def _close_figures():
    plt = sys.modules.get("matplotlib.pyplot")
    if plt is not None:
        try:
            plt.close("all")
        except Exception:
            pass

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
    pd = sys.modules.get("pandas")
    if pd is not None:
        if isinstance(value, pd.DataFrame):
            return _encode_frame(value, state)
        if isinstance(value, pd.Series):
            return _encode_series(value, state)
    mpl = sys.modules.get("matplotlib")
    if mpl is not None:
        import matplotlib.axes as maxes
        import matplotlib.figure as mfigure
        if isinstance(value, maxes.Axes):
            return _encode_axes(value)
        if isinstance(value, mfigure.Figure):
            return _encode_figure_object(value)
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
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                encoded = _encode(result, {"nodes": 0})
            observed = {
                "outcome": "returned",
                "pythonType": type(result).__name__,
                "value": encoded,
            }
        except _Unsupported as problem:
            observed = {"outcome": "unsupported", "pythonType": type(result).__name__, "reason": str(problem)}
        except Exception:
            observed = {
                "outcome": "unsupported",
                "pythonType": type(result).__name__,
                "reason": "không thể chuẩn hóa kết quả",
            }

    _close_figures()
    if check_args:
        observed["argsMutated"] = _fingerprint(args, kwargs) != before
    return observed

def _probe_value(scope, name):
    value = scope[name]
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            encoded = _encode(value, {"nodes": 0})
        observed = {"outcome": "returned", "pythonType": type(value).__name__, "value": encoded}
    except _Unsupported as problem:
        observed = {"outcome": "unsupported", "pythonType": type(value).__name__, "reason": str(problem)}
    except Exception:
        observed = {"outcome": "unsupported", "pythonType": type(value).__name__, "reason": "không thể chuẩn hóa giá trị"}
    _close_figures()
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
        if spec.get("mode") == "value":
            functions.append({"function": name, "status": "OK", "cases": [_probe_value(scope, name)]})
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
