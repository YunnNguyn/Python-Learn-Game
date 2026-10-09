from __future__ import annotations

import json
import tempfile
import threading
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from python_learn_runtime.server import (
    RuntimeRequestHandler,
    RuntimeState,
    scan_artifacts,
    stage_datasets,
    validate_dataset_definitions,
)


class RuntimeServerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.workspace_root = Path(self.tempdir.name) / "workspaces"
        self.runtime_state = RuntimeState(self.workspace_root)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), RuntimeRequestHandler)
        self.server.runtime_state = self.runtime_state  # type: ignore[attr-defined]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address[:2]
        self.base_url = f"http://{host}:{port}"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.tempdir.cleanup()

    def request(
        self,
        method: str,
        path: str,
        payload: dict[str, object] | None = None,
        timeout: float = 10,
    ) -> tuple[int, dict[str, object]]:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = Request(
            f"{self.base_url}{path}",
            data=body,
            method=method,
            headers={"Content-Type": "application/json"} if body is not None else {},
        )
        try:
            with urlopen(request, timeout=timeout) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            try:
                return error.code, json.loads(error.read().decode("utf-8"))
            finally:
                error.close()

    def create_session(self) -> tuple[str, Path]:
        status, payload = self.request("POST", "/sessions", {})
        self.assertEqual(status, 201)
        session_id = str(payload["sessionId"])
        session = self.runtime_state.get_session(session_id)
        self.assertIsNotNone(session)
        return session_id, session.workspace  # type: ignore[union-attr]

    def test_workspace_creation_and_disposal(self) -> None:
        session_id, workspace = self.create_session()

        self.assertTrue((workspace / "main.py").is_file())
        self.assertTrue((workspace / "data").is_dir())
        self.assertTrue((workspace / "artifacts").is_dir())

        status, payload = self.request("DELETE", f"/sessions/{session_id}")
        self.assertEqual(status, 200)
        self.assertEqual(payload, {"ok": True})
        self.assertFalse(workspace.exists())

    def test_dataset_staging_and_traversal_validation(self) -> None:
        session = self.runtime_state.create_session()
        session.datasets = validate_dataset_definitions(
            {
                "workspace": {
                    "datasets": [
                        {
                            "filename": "telemetry.csv",
                            "content": "contact_id,distance\ncontact-1,38\n",
                            "description": "fixture",
                        }
                    ]
                }
            }
        )

        metadata = stage_datasets(session)

        self.assertEqual(metadata[0]["relativePath"], "data/telemetry.csv")
        self.assertEqual(metadata[0]["bytes"], len("contact_id,distance\ncontact-1,38\n".encode("utf-8")))
        self.assertEqual(
            (session.workspace / "data" / "telemetry.csv").read_text(encoding="utf-8"),
            "contact_id,distance\ncontact-1,38\n",
        )
        for unsafe in ["../secret.csv", "..\\secret.csv", "C:\\secret.csv", "/tmp/secret.csv"]:
            with self.subTest(unsafe=unsafe):
                with self.assertRaises(ValueError):
                    validate_dataset_definitions(
                        {
                            "workspace": {
                                "datasets": [{"filename": unsafe, "content": "x"}]
                            }
                        }
                    )

    def test_artifact_scan_ignores_directories_and_paths_outside_artifacts(self) -> None:
        session = self.runtime_state.create_session()
        artifacts = session.workspace / "artifacts"
        (artifacts / "predictions.csv").write_text("id,pred\n1,0\n", encoding="utf-8")
        (artifacts / "notes.unknown").write_text("ok", encoding="utf-8")
        (artifacts / "nested").mkdir()
        outside = session.workspace / "outside.txt"
        outside.write_text("private", encoding="utf-8")
        link = artifacts / "outside-link.txt"
        try:
            link.symlink_to(outside)
        except OSError:
            link = None

        metadata = scan_artifacts(session)

        self.assertEqual(
            [item["filename"] for item in metadata],
            ["notes.unknown", "predictions.csv"],
        )
        self.assertEqual(metadata[0]["category"], "generic")
        self.assertEqual(metadata[1]["category"], "csv")
        self.assertEqual(metadata[1]["extension"], "csv")
        if link is not None:
            self.assertNotIn("outside-link.txt", [item["filename"] for item in metadata])

    def test_http_execution_reports_artifact_and_clears_stale_outputs(self) -> None:
        session_id, workspace = self.create_session()
        status, prepared = self.request(
            "POST",
            f"/sessions/{session_id}/prepare",
            {
                "runtimeConfig": {
                    "executionTimeoutSeconds": 10,
                    "workspace": {
                        "datasets": [
                            {
                                "filename": "telemetry.csv",
                                "content": "contact_id,distance\ncontact-1,38\n",
                                "description": "fixture",
                            }
                        ]
                    },
                },
                "setupData": {},
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(
            prepared["workspace"]["datasets"][0]["relativePath"],  # type: ignore[index]
            "data/telemetry.csv",
        )

        first_code = (
            "from pathlib import Path\n"
            "source = Path('data/telemetry.csv').read_text(encoding='utf-8')\n"
            "Path('artifacts/predictions.csv').write_text(source, encoding='utf-8')\n"
            "print('artifact-ready')\n"
        )
        status, first = self.request(
            "POST",
            f"/sessions/{session_id}/execute",
            {"kind": "RUN", "code": first_code, "observeVariables": []},
        )
        self.assertEqual(status, 200)
        self.assertEqual(first["status"], "SUCCESS")
        self.assertIn("artifact-ready", str(first["stdout"]))
        artifact = first["workspace"]["artifacts"][0]  # type: ignore[index]
        self.assertEqual(artifact["filename"], "predictions.csv")
        self.assertEqual(artifact["relativePath"], "artifacts/predictions.csv")
        self.assertEqual(artifact["category"], "csv")
        self.assertGreater(artifact["bytes"], 0)
        self.assertEqual((workspace / "main.py").read_text(encoding="utf-8"), first_code)

        status, second = self.request(
            "POST",
            f"/sessions/{session_id}/execute",
            {"kind": "SUBMIT", "code": "print('fresh-run')\n", "observeVariables": []},
        )
        self.assertEqual(status, 200)
        self.assertEqual(second["status"], "SUCCESS")
        self.assertEqual(second["workspace"]["artifacts"], [])  # type: ignore[index]
        self.assertFalse((workspace / "artifacts" / "predictions.csv").exists())

    def test_http_rejects_dataset_traversal(self) -> None:
        session_id, _ = self.create_session()
        status, payload = self.request(
            "POST",
            f"/sessions/{session_id}/prepare",
            {
                "runtimeConfig": {
                    "workspace": {
                        "datasets": [
                            {"filename": "../escape.csv", "content": "forbidden"}
                        ]
                    }
                },
                "setupData": {},
            },
        )

        self.assertEqual(status, 400)
        self.assertEqual(payload["error"]["code"], "INVALID_DATASETS")  # type: ignore[index]

    def test_interrupt_then_next_run_recovers(self) -> None:
        session_id, _ = self.create_session()
        status, _ = self.request(
            "POST",
            f"/sessions/{session_id}/prepare",
            {"runtimeConfig": {"executionTimeoutSeconds": 30}, "setupData": {}},
        )
        self.assertEqual(status, 200)

        with ThreadPoolExecutor(max_workers=1) as executor:
            pending = executor.submit(
                self.request,
                "POST",
                f"/sessions/{session_id}/execute",
                {
                    "kind": "RUN",
                    "code": "import time\nprint('start', flush=True)\ntime.sleep(20)\nprint('done')\n",
                    "observeVariables": [],
                },
                30,
            )

            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                session = self.runtime_state.get_session(session_id)
                if session is not None:
                    with session.lock:
                        if session.active_process is not None:
                            break
                time.sleep(0.02)
            else:
                self.fail("Python process did not become active in time.")

            stop_status, stop_payload = self.request(
                "POST", f"/sessions/{session_id}/interrupt", {}
            )
            self.assertEqual(stop_status, 200)
            self.assertEqual(stop_payload, {"ok": True})
            execution_status, interrupted = pending.result(timeout=10)

        self.assertEqual(execution_status, 200)
        self.assertEqual(interrupted["status"], "RUNTIME_ERROR")
        self.assertEqual(interrupted["error"]["code"], "EXECUTION_INTERRUPTED")  # type: ignore[index]
        self.assertNotIn("done", str(interrupted["stdout"]))

        status, recovered = self.request(
            "POST",
            f"/sessions/{session_id}/execute",
            {"kind": "RUN", "code": "print('recovered')\n", "observeVariables": []},
        )
        self.assertEqual(status, 200)
        self.assertEqual(recovered["status"], "SUCCESS")
        self.assertIn("recovered", str(recovered["stdout"]))

    def test_timeout_then_next_run_recovers(self) -> None:
        session_id, _ = self.create_session()
        status, _ = self.request(
            "POST",
            f"/sessions/{session_id}/prepare",
            {"runtimeConfig": {"executionTimeoutSeconds": 1}, "setupData": {}},
        )
        self.assertEqual(status, 200)

        status, timed_out = self.request(
            "POST",
            f"/sessions/{session_id}/execute",
            {
                "kind": "RUN",
                "code": "import time\ntime.sleep(5)\nprint('too-late')\n",
                "observeVariables": [],
            },
            timeout=10,
        )
        self.assertEqual(status, 200)
        self.assertEqual(timed_out["status"], "TIMEOUT")
        self.assertEqual(timed_out["error"]["code"], "EXECUTION_TIMEOUT")  # type: ignore[index]
        self.assertNotIn("too-late", str(timed_out["stdout"]))

        status, recovered = self.request(
            "POST",
            f"/sessions/{session_id}/execute",
            {"kind": "RUN", "code": "print('after-timeout')\n", "observeVariables": []},
        )
        self.assertEqual(status, 200)
        self.assertEqual(recovered["status"], "SUCCESS")
        self.assertIn("after-timeout", str(recovered["stdout"]))


if __name__ == "__main__":
    unittest.main()
