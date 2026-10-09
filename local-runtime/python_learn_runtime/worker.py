from __future__ import annotations

import argparse
import json
import math
import traceback
from pathlib import Path
from typing import Any


_JS_SAFE_INTEGER = 9007199254740991


def _json_value(value: Any) -> Any:
    # Mirror the Pyodide observation contract: values that are not strict
    # JSON / JS-safe (NaN, ±inf, integers beyond 2**53-1) are not serialized,
    # so the observation omits `value` instead of emitting invalid JSON.
    if value is None or isinstance(value, (bool, str)):
        return value

    if isinstance(value, int):
        if abs(value) > _JS_SAFE_INTEGER:
            raise ValueError("Integer exceeds the JavaScript safe range")
        return value

    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("Non-finite float is not JSON serializable")
        return value

    if isinstance(value, tuple):
        return [_json_value(item) for item in value]

    if isinstance(value, list):
        return [_json_value(item) for item in value]

    if isinstance(value, dict):
        converted: dict[str, Any] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise TypeError("Only string-keyed dictionaries are JSON serializable")
            converted[key] = _json_value(item)
        return converted

    tolist = getattr(value, "tolist", None)
    if callable(tolist):
        return _json_value(tolist())

    item = getattr(value, "item", None)
    if callable(item):
        return _json_value(item())

    raise TypeError(f"Unsupported value type: {type(value).__name__}")


def _shape(value: Any) -> list[int] | None:
    shape = getattr(value, "shape", None)
    if shape is None:
        return None
    try:
        dims = [int(item) for item in tuple(shape)]
    except (TypeError, ValueError):
        return None
    if any(item < 0 for item in dims):
        return None
    return dims


def _is_ndarray(value: Any) -> bool:
    value_type = type(value)
    return value_type.__name__ == "ndarray" and value_type.__module__.startswith("numpy")


def observe(namespace: dict[str, Any], variable_names: list[str]) -> dict[str, Any]:
    variables: dict[str, Any] = {}
    for name in variable_names:
        if name not in namespace:
            continue
        value = namespace[name]
        observed: dict[str, Any] = {
            "pythonType": type(value).__name__,
            "isNdarray": _is_ndarray(value),
        }
        shape = _shape(value)
        if shape is not None:
            observed["shape"] = shape
        try:
            observed["value"] = _json_value(value)
        except (TypeError, ValueError, OverflowError):
            pass
        variables[name] = observed
    return {"variables": variables}


def run_request(request: dict[str, Any], result_path: Path) -> int:
    setup_data = request.get("setupData") or {}
    source_path_value = request.get("sourcePath")
    code = request.get("code")
    observe_variables = request.get("observeVariables") or []

    if not isinstance(setup_data, dict):
        raise TypeError("setupData must be an object")
    if source_path_value is not None:
        if not isinstance(source_path_value, str):
            raise TypeError("sourcePath must be a string")
        source_path = Path(source_path_value)
        code = source_path.read_text(encoding="utf-8")
        source_name = source_path.name
    else:
        source_name = "main.py"
    if not isinstance(code, str):
        raise TypeError("code must be a string")
    if not isinstance(observe_variables, list) or not all(isinstance(item, str) for item in observe_variables):
        raise TypeError("observeVariables must be a list of strings")

    namespace: dict[str, Any] = {"__name__": "__main__"}
    namespace.update(setup_data)

    try:
        compiled = compile(code, source_name, "exec")
        exec(compiled, namespace, namespace)
    except BaseException as error:  # noqa: BLE001 - learner code may raise any Python exception
        result = {
            "status": "PYTHON_EXCEPTION",
            "exception": {
                "type": type(error).__name__,
                "message": str(error),
                "traceback": traceback.format_exc(),
            },
            "serialized": observe(namespace, observe_variables),
        }
        result_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        return 1

    result = {
        "status": "SUCCESS",
        "serialized": observe(namespace, observe_variables),
    }
    result_path.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", required=True)
    parser.add_argument("--result", required=True)
    args = parser.parse_args()

    request_path = Path(args.request)
    result_path = Path(args.result)
    request = json.loads(request_path.read_text(encoding="utf-8"))
    return run_request(request, result_path)


if __name__ == "__main__":
    raise SystemExit(main())
