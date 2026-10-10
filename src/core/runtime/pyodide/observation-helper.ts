/**
 * Python-side helper executed inside Pyodide to observe learner variables.
 *
 * Kept in its own module (no Pyodide import) so tests can run the exact
 * production source in a real Pyodide instance.
 *
 * Contract: `__runtime_collect(scope, names)` returns a JSON string
 * `{"variables": {name: {pythonType, isNdarray, shape?, value?}}}`.
 * `shape` is generic (ndarray, pandas Series/DataFrame, any object exposing a
 * valid `.shape`) and is omitted whenever it is missing or invalid.
 */
export const OBSERVATION_HELPER_SOURCE = `
import itertools
import json
import math
import operator

_JS_SAFE_INTEGER = 9007199254740991
_MAX_SHAPE_RANK = 32

def __runtime_json_safe(value, ancestors):
    if value is None or isinstance(value, (bool, str)):
        return True, value

    if isinstance(value, int):
        if abs(value) > _JS_SAFE_INTEGER:
            return False, None
        return True, value

    if isinstance(value, float):
        if not math.isfinite(value):
            return False, None
        return True, value

    if isinstance(value, (list, tuple)):
        identity = id(value)
        if identity in ancestors:
            return False, None
        ancestors.add(identity)
        normalized = []
        try:
            for item in value:
                ok, converted = __runtime_json_safe(item, ancestors)
                if not ok:
                    return False, None
                normalized.append(converted)
            return True, normalized
        finally:
            ancestors.discard(identity)

    if isinstance(value, dict):
        identity = id(value)
        if identity in ancestors:
            return False, None
        ancestors.add(identity)
        normalized = {}
        try:
            for key, item in value.items():
                if not isinstance(key, str):
                    return False, None
                ok, converted = __runtime_json_safe(item, ancestors)
                if not ok:
                    return False, None
                normalized[key] = converted
            return True, normalized
        finally:
            ancestors.discard(identity)

    return False, None

def __runtime_shape(value):
    try:
        raw_shape = getattr(value, "shape", None)
        if raw_shape is None or isinstance(raw_shape, (str, bytes)):
            return None

        dimensions = []
        for dimension in itertools.islice(iter(raw_shape), _MAX_SHAPE_RANK + 1):
            if isinstance(dimension, bool):
                return None
            index = operator.index(dimension)
            if index < 0 or index > _JS_SAFE_INTEGER:
                return None
            dimensions.append(int(index))

        if len(dimensions) > _MAX_SHAPE_RANK:
            return None
        return dimensions
    except Exception:
        return None

def __runtime_collect(scope, names):
    variables = {}
    for name in names:
        if name not in scope:
            continue

        value = scope[name]
        value_type = type(value)
        is_ndarray = (
            value_type.__module__ == "numpy"
            and value_type.__name__ == "ndarray"
        )
        observed = {
            "pythonType": value_type.__name__,
            "isNdarray": is_ndarray,
        }

        shape = __runtime_shape(value)
        if shape is not None:
            observed["shape"] = shape

        candidate = value
        if is_ndarray:
            try:
                candidate = value.tolist()
            except Exception:
                candidate = value

        try:
            ok, normalized = __runtime_json_safe(candidate, set())
            if ok:
                observed["value"] = normalized
        except Exception:
            pass

        variables[name] = observed

    return json.dumps(
        {"variables": variables},
        allow_nan=False,
        separators=(",", ":"),
    )
`;

export function buildObservationExpression(
  observeVariables: readonly string[],
): string {
  return `(lambda __runtime_ns: (exec(${JSON.stringify(
    OBSERVATION_HELPER_SOURCE,
  )}, __runtime_ns), __runtime_ns["__runtime_collect"](globals(), ${JSON.stringify(
    observeVariables,
  )}))[1])({})`;
}
