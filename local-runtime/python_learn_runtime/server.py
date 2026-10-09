from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import threading
import uuid
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from pathlib import PurePosixPath, PureWindowsPath
from typing import Any
from urllib.parse import urlparse

from . import PROTOCOL_VERSION, SERVICE_NAME

MAX_DATASETS = 50
MAX_ARTIFACTS = 100
DATASET_KEYS = frozenset({"filename", "content", "description"})
ARTIFACT_CATEGORIES = {
    "csv": "csv",
    "png": "image",
    "jpg": "image",
    "jpeg": "image",
    "json": "json",
    "txt": "text",
    "pkl": "model",
    "joblib": "model",
}


@dataclass
class SessionState:
    session_id: str
    workspace: Path
    runtime_config: dict[str, Any] = field(default_factory=dict)
    setup_data: dict[str, Any] = field(default_factory=dict)
    datasets: list[dict[str, str]] = field(default_factory=list)
    active_process: subprocess.Popen[str] | None = None
    interrupted: bool = False
    lock: threading.Lock = field(default_factory=threading.Lock)


class RuntimeState:
    def __init__(self, workspace_root: Path) -> None:
        self.workspace_root = workspace_root
        self.workspace_root.mkdir(parents=True, exist_ok=True)
        self.sessions: dict[str, SessionState] = {}
        self.lock = threading.Lock()

    def create_session(self) -> SessionState:
        session_id = uuid.uuid4().hex
        workspace = self.workspace_root / session_id
        workspace.mkdir(parents=True, exist_ok=True)
        (workspace / "main.py").write_text("", encoding="utf-8")
        (workspace / "data").mkdir()
        (workspace / "artifacts").mkdir()
        session = SessionState(session_id=session_id, workspace=workspace)
        with self.lock:
            self.sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> SessionState | None:
        with self.lock:
            return self.sessions.get(session_id)

    def delete_session(self, session_id: str) -> bool:
        with self.lock:
            session = self.sessions.pop(session_id, None)
        if session is None:
            return False
        with session.lock:
            if session.active_process is not None:
                terminate_process_tree(session.active_process)
        shutil.rmtree(session.workspace, ignore_errors=True)
        return True


class RuntimeRequestHandler(BaseHTTPRequestHandler):
    server_version = "PythonLearnRuntime/1.0"

    @property
    def runtime_state(self) -> RuntimeState:
        return self.server.runtime_state  # type: ignore[attr-defined]

    def log_message(self, format: str, *args: object) -> None:
        sys.stdout.write("[local-runtime] " + (format % args) + "\n")

    def do_OPTIONS(self) -> None:  # noqa: N802
        if not self._origin_allowed():
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_cors_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        if self.headers.get("Access-Control-Request-Private-Network") == "true":
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if not self._origin_allowed():
            self._json_response(HTTPStatus.FORBIDDEN, error_payload("ORIGIN_FORBIDDEN", "Origin không được phép."))
            return
        if self.path == "/health":
            self._json_response(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "service": SERVICE_NAME,
                    "protocolVersion": PROTOCOL_VERSION,
                    "pythonVersion": sys.version.split()[0],
                    "pythonExecutable": sys.executable,
                    "pid": os.getpid(),
                },
            )
            return
        self._json_response(HTTPStatus.NOT_FOUND, error_payload("NOT_FOUND", "Endpoint không tồn tại."))

    def do_POST(self) -> None:  # noqa: N802
        if not self._origin_allowed():
            self._json_response(HTTPStatus.FORBIDDEN, error_payload("ORIGIN_FORBIDDEN", "Origin không được phép."))
            return

        parts = [part for part in self.path.split("/") if part]
        if parts == ["sessions"]:
            session = self.runtime_state.create_session()
            self._json_response(HTTPStatus.CREATED, {"sessionId": session.session_id})
            return

        if len(parts) == 3 and parts[0] == "sessions":
            session = self.runtime_state.get_session(parts[1])
            if session is None:
                self._json_response(HTTPStatus.NOT_FOUND, error_payload("SESSION_NOT_FOUND", "Không tìm thấy runtime session."))
                return
            action = parts[2]
            if action == "prepare":
                self._prepare(session)
                return
            if action == "execute":
                self._execute(session)
                return
            if action == "interrupt":
                self._interrupt(session)
                return

        self._json_response(HTTPStatus.NOT_FOUND, error_payload("NOT_FOUND", "Endpoint không tồn tại."))

    def do_DELETE(self) -> None:  # noqa: N802
        if not self._origin_allowed():
            self._json_response(HTTPStatus.FORBIDDEN, error_payload("ORIGIN_FORBIDDEN", "Origin không được phép."))
            return
        parts = [part for part in self.path.split("/") if part]
        if len(parts) == 2 and parts[0] == "sessions":
            if self.runtime_state.delete_session(parts[1]):
                self._json_response(HTTPStatus.OK, {"ok": True})
            else:
                self._json_response(HTTPStatus.NOT_FOUND, error_payload("SESSION_NOT_FOUND", "Không tìm thấy runtime session."))
            return
        self._json_response(HTTPStatus.NOT_FOUND, error_payload("NOT_FOUND", "Endpoint không tồn tại."))

    def _prepare(self, session: SessionState) -> None:
        body = self._read_json_object()
        if body is None:
            return
        runtime_config = body.get("runtimeConfig", {})
        setup_data = body.get("setupData", {})
        if not isinstance(runtime_config, dict) or not isinstance(setup_data, dict):
            self._json_response(HTTPStatus.BAD_REQUEST, error_payload("INVALID_PREPARATION", "runtimeConfig và setupData phải là object."))
            return

        timeout = runtime_config.get("executionTimeoutSeconds", 300)
        if not isinstance(timeout, (int, float)) or isinstance(timeout, bool) or timeout < 1 or timeout > 3600:
            self._json_response(HTTPStatus.BAD_REQUEST, error_payload("INVALID_TIMEOUT", "executionTimeoutSeconds phải nằm trong 1..3600."))
            return

        try:
            datasets = validate_dataset_definitions(runtime_config)
        except ValueError as error:
            self._json_response(
                HTTPStatus.BAD_REQUEST,
                error_payload("INVALID_DATASETS", str(error)),
            )
            return

        with session.lock:
            if session.active_process is not None:
                self._json_response(HTTPStatus.CONFLICT, error_payload("RUNTIME_BUSY", "Runtime đang chạy một tiến trình Python."))
                return
            session.runtime_config = dict(runtime_config)
            session.setup_data = dict(setup_data)
            session.datasets = datasets
            session.interrupted = False
            try:
                stage_datasets(session)
                reset_artifacts(session)
            except OSError as error:
                self._json_response(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    error_payload(
                        "WORKSPACE_PREPARATION_FAILED",
                        f"Không thể chuẩn bị workspace: {error}",
                    ),
                )
                return
        self._json_response(
            HTTPStatus.OK,
            {"ok": True, "workspace": workspace_metadata(session)},
        )

    def _execute(self, session: SessionState) -> None:
        body = self._read_json_object()
        if body is None:
            return
        code = body.get("code")
        observe_variables = body.get("observeVariables", [])
        kind = body.get("kind")
        if kind not in {"RUN", "SUBMIT"} or not isinstance(code, str):
            self._json_response(HTTPStatus.BAD_REQUEST, error_payload("INVALID_EXECUTION", "kind/code không hợp lệ."))
            return
        if not isinstance(observe_variables, list) or not all(isinstance(item, str) for item in observe_variables):
            self._json_response(HTTPStatus.BAD_REQUEST, error_payload("INVALID_OBSERVATIONS", "observeVariables phải là danh sách string."))
            return

        worker_path = Path(__file__).with_name("worker.py")
        popen_kwargs: dict[str, Any] = {
            "cwd": str(session.workspace),
            "stdout": subprocess.PIPE,
            "stderr": subprocess.PIPE,
            "text": True,
            "encoding": "utf-8",
            "errors": "replace",
        }
        if os.name == "nt":
            popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            popen_kwargs["start_new_session"] = True

        # Force a non-interactive Matplotlib backend so learner code that calls
        # plt.show() does not block on a GUI window (which would hang until the
        # execution timeout). Learner code can still override MPLBACKEND.
        child_env = os.environ.copy()
        child_env.setdefault("MPLBACKEND", "Agg")
        popen_kwargs["env"] = child_env

        with session.lock:
            if session.active_process is not None:
                self._json_response(HTTPStatus.CONFLICT, error_payload("RUNTIME_BUSY", "Runtime đang chạy một tiến trình Python."))
                return
            session.interrupted = False
            try:
                stage_datasets(session)
                reset_artifacts(session)
                source_path = session.workspace / "main.py"
                source_path.write_text(code, encoding="utf-8")
                internal_dir = session.workspace / ".python-learn-runtime"
                internal_dir.mkdir(parents=True, exist_ok=True)
                token = uuid.uuid4().hex
                request_path = internal_dir / f"request-{token}.json"
                result_path = internal_dir / f"result-{token}.json"
                request_path.write_text(
                    json.dumps(
                        {
                            "kind": kind,
                            "code": code,
                            "sourcePath": str(source_path),
                            "observeVariables": observe_variables,
                            "setupData": session.setup_data,
                        },
                        ensure_ascii=False,
                    ),
                    encoding="utf-8",
                )
            except OSError as error:
                self._json_response(
                    HTTPStatus.INTERNAL_SERVER_ERROR,
                    error_payload(
                        "WORKSPACE_PREPARATION_FAILED",
                        f"Không thể làm mới workspace: {error}",
                    ),
                )
                return
            process = subprocess.Popen(
                [
                    sys.executable,
                    str(worker_path),
                    "--request",
                    str(request_path),
                    "--result",
                    str(result_path),
                ],
                **popen_kwargs,
            )
            session.active_process = process

        timeout = float(session.runtime_config.get("executionTimeoutSeconds", 300))
        timed_out = False
        try:
            stdout, stderr = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            terminate_process_tree(process)
            stdout, stderr = process.communicate()
        finally:
            with session.lock:
                interrupted = session.interrupted
                if session.active_process is process:
                    session.active_process = None
                session.interrupted = False

        if interrupted:
            self._json_response(
                HTTPStatus.OK,
                {
                    "status": "RUNTIME_ERROR",
                    "stdout": stdout,
                    "stderr": stderr,
                    "error": {
                        "code": "EXECUTION_INTERRUPTED",
                        "message": "Tiến trình Python đã được người dùng dừng.",
                    },
                    "workspace": workspace_metadata(session),
                },
            )
            return

        if timed_out:
            self._json_response(
                HTTPStatus.OK,
                {
                    "status": "TIMEOUT",
                    "stdout": stdout,
                    "stderr": stderr,
                    "error": {
                        "code": "EXECUTION_TIMEOUT",
                        "message": f"Tiến trình Python vượt quá giới hạn {timeout:g} giây.",
                    },
                    "workspace": workspace_metadata(session),
                },
            )
            return

        if not result_path.exists():
            self._json_response(
                HTTPStatus.OK,
                {
                    "status": "RUNTIME_ERROR",
                    "stdout": stdout,
                    "stderr": stderr,
                    "error": {
                        "code": "WORKER_CRASHED",
                        "message": f"Python worker kết thúc với exit code {process.returncode} nhưng không trả kết quả.",
                    },
                    "workspace": workspace_metadata(session),
                },
            )
            return

        try:
            worker_result = json.loads(result_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            self._json_response(
                HTTPStatus.OK,
                {
                    "status": "RUNTIME_ERROR",
                    "stdout": stdout,
                    "stderr": stderr,
                    "error": {
                        "code": "INVALID_WORKER_RESULT",
                        "message": "Không đọc được kết quả từ Python worker.",
                    },
                    "workspace": workspace_metadata(session),
                },
            )
            return

        worker_result["stdout"] = stdout
        worker_result["stderr"] = stderr
        worker_result["workspace"] = workspace_metadata(session)
        self._json_response(HTTPStatus.OK, worker_result)

    def _interrupt(self, session: SessionState) -> None:
        with session.lock:
            process = session.active_process
            if process is None:
                self._json_response(HTTPStatus.OK, {"ok": True})
                return
            session.interrupted = True
            terminate_process_tree(process)
        self._json_response(HTTPStatus.OK, {"ok": True})

    def _read_json_object(self) -> dict[str, Any] | None:
        length = int(self.headers.get("Content-Length", "0"))
        if length > 5_000_000:
            self._json_response(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, error_payload("REQUEST_TOO_LARGE", "Request quá lớn."))
            return None
        raw = self.rfile.read(length) if length > 0 else b"{}"
        try:
            value = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._json_response(HTTPStatus.BAD_REQUEST, error_payload("INVALID_JSON", "JSON body không hợp lệ."))
            return None
        if not isinstance(value, dict):
            self._json_response(HTTPStatus.BAD_REQUEST, error_payload("INVALID_JSON", "JSON body phải là object."))
            return None
        return value

    def _origin_allowed(self) -> bool:
        origin = self.headers.get("Origin")
        if origin is None:
            return True
        try:
            parsed = urlparse(origin)
        except ValueError:
            return False
        return parsed.scheme in {"http", "https"} and parsed.hostname in {"127.0.0.1", "localhost", "::1"}

    def _send_cors_headers(self) -> None:
        origin = self.headers.get("Origin")
        if origin and self._origin_allowed():
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def _json_response(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def error_payload(code: str, message: str) -> dict[str, Any]:
    return {"ok": False, "error": {"code": code, "message": message}}


def validate_dataset_definitions(runtime_config: dict[str, Any]) -> list[dict[str, str]]:
    workspace_config = runtime_config.get("workspace")
    if workspace_config is None:
        return []
    if not isinstance(workspace_config, dict):
        raise ValueError("runtimeConfig.workspace phải là object.")
    unknown_workspace_keys = set(workspace_config) - {"datasets"}
    if unknown_workspace_keys:
        names = ", ".join(sorted(unknown_workspace_keys))
        raise ValueError(f"workspace chứa field không hỗ trợ: {names}.")

    raw_datasets = workspace_config.get("datasets", [])
    if not isinstance(raw_datasets, list):
        raise ValueError("workspace.datasets phải là danh sách.")
    if len(raw_datasets) > MAX_DATASETS:
        raise ValueError(f"workspace.datasets chỉ được tối đa {MAX_DATASETS} file.")

    datasets: list[dict[str, str]] = []
    for index, raw in enumerate(raw_datasets):
        if not isinstance(raw, dict):
            raise ValueError(f"datasets[{index}] phải là object.")
        unknown_keys = set(raw) - DATASET_KEYS
        if unknown_keys:
            names = ", ".join(sorted(unknown_keys))
            raise ValueError(f"datasets[{index}] chứa field không hỗ trợ: {names}.")

        filename = raw.get("filename")
        content = raw.get("content")
        description = raw.get("description")
        if not isinstance(filename, str) or not filename:
            raise ValueError(f"datasets[{index}].filename phải là string không rỗng.")
        if not isinstance(content, str):
            raise ValueError(f"datasets[{index}].content phải là string.")
        if description is not None and not isinstance(description, str):
            raise ValueError(f"datasets[{index}].description phải là string.")
        if not is_safe_workspace_filename(filename):
            raise ValueError(
                f"datasets[{index}].filename phải là tên file tương đối đơn, không được chứa path."
            )

        entry = {"filename": filename, "content": content}
        if description is not None:
            entry["description"] = description
        datasets.append(entry)

    return datasets


def is_safe_workspace_filename(filename: str) -> bool:
    if filename in {".", ".."} or "\x00" in filename:
        return False
    if "/" in filename or "\\" in filename:
        return False
    if PurePosixPath(filename).is_absolute() or PureWindowsPath(filename).is_absolute():
        return False
    if ":" in filename:
        return False
    return True


def stage_datasets(session: SessionState) -> list[dict[str, Any]]:
    data_dir = session.workspace / "data"
    shutil.rmtree(data_dir, ignore_errors=True)
    data_dir.mkdir(parents=True, exist_ok=True)
    data_root = data_dir.resolve()
    metadata: list[dict[str, Any]] = []
    for dataset in session.datasets:
        destination = (data_dir / dataset["filename"]).resolve()
        if destination.parent != data_root:
            raise OSError("Dataset path thoát khỏi data/.")
        encoded = dataset["content"].encode("utf-8")
        destination.write_bytes(encoded)
        item: dict[str, Any] = {
            "filename": dataset["filename"],
            "relativePath": f"data/{dataset['filename']}",
            "bytes": len(encoded),
        }
        description = dataset.get("description")
        if description is not None:
            item["description"] = description
        metadata.append(item)
    return metadata


def reset_artifacts(session: SessionState) -> None:
    artifacts_dir = session.workspace / "artifacts"
    shutil.rmtree(artifacts_dir, ignore_errors=True)
    artifacts_dir.mkdir(parents=True, exist_ok=True)


def dataset_metadata(session: SessionState) -> list[dict[str, Any]]:
    metadata: list[dict[str, Any]] = []
    for dataset in session.datasets:
        encoded = dataset["content"].encode("utf-8")
        item: dict[str, Any] = {
            "filename": dataset["filename"],
            "relativePath": f"data/{dataset['filename']}",
            "bytes": len(encoded),
        }
        description = dataset.get("description")
        if description is not None:
            item["description"] = description
        metadata.append(item)
    return metadata


def scan_artifacts(session: SessionState) -> list[dict[str, Any]]:
    artifacts_dir = session.workspace / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    artifacts_root = artifacts_dir.resolve()
    metadata: list[dict[str, Any]] = []
    for entry in sorted(artifacts_dir.iterdir(), key=lambda item: item.name.casefold()):
        if len(metadata) >= MAX_ARTIFACTS:
            break
        try:
            resolved = entry.resolve()
            if resolved.parent != artifacts_root or not resolved.is_file():
                continue
            extension = resolved.suffix.lower().lstrip(".")
            metadata.append(
                {
                    "filename": entry.name,
                    "relativePath": f"artifacts/{entry.name}",
                    "bytes": resolved.stat().st_size,
                    "extension": extension,
                    "category": ARTIFACT_CATEGORIES.get(extension, "generic"),
                }
            )
        except OSError:
            continue
    return metadata


def workspace_metadata(session: SessionState) -> dict[str, Any]:
    return {
        "datasets": dataset_metadata(session),
        "artifacts": scan_artifacts(session),
    }


def terminate_process_tree(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    try:
        if os.name == "nt":
            taskkill = subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
            if taskkill.returncode == 0:
                return
            try:
                process.send_signal(signal.CTRL_BREAK_EVENT)
                process.wait(timeout=0.75)
                return
            except (OSError, ValueError, subprocess.TimeoutExpired):
                process.kill()
        else:
            os.killpg(os.getpgid(process.pid), signal.SIGTERM)
            try:
                process.wait(timeout=1.0)
            except subprocess.TimeoutExpired:
                os.killpg(os.getpgid(process.pid), signal.SIGKILL)
    except (ProcessLookupError, OSError):
        try:
            process.kill()
        except OSError:
            pass


def run_server(host: str, port: int, workspace_root: Path) -> None:
    runtime_state = RuntimeState(workspace_root)
    server = ThreadingHTTPServer((host, port), RuntimeRequestHandler)
    server.runtime_state = runtime_state  # type: ignore[attr-defined]
    print(f"Python Learn Runtime listening on http://{host}:{port}")
    print(f"Python: {sys.executable}")
    print(f"Workspace root: {workspace_root}")
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Python Learn Game local execution service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument(
        "--workspace-root",
        type=Path,
        default=Path(__file__).resolve().parents[1] / ".workspaces",
    )
    args = parser.parse_args()
    if args.host not in {"127.0.0.1", "localhost", "::1"}:
        parser.error("For safety, local runtime must bind to a loopback host.")
    run_server(args.host, args.port, args.workspace_root.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
