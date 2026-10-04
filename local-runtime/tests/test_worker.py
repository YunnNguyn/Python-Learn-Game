from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from python_learn_runtime.worker import run_request


class WorkerTests(unittest.TestCase):
    def test_success_and_observations(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result_path = Path(tmp) / "result.json"
            exit_code = run_request(
                {
                    "setupData": {"values": [2, 5, 8]},
                    "code": "answer = sum(values)\nprint(answer)",
                    "observeVariables": ["answer"],
                },
                result_path,
            )
            self.assertEqual(exit_code, 0)
            result = json.loads(result_path.read_text(encoding="utf-8"))
            self.assertEqual(result["status"], "SUCCESS")
            self.assertEqual(result["serialized"]["variables"]["answer"]["pythonType"], "int")
            self.assertEqual(result["serialized"]["variables"]["answer"]["value"], 15)


    def test_source_path_executes_main_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source_path = root / "main.py"
            result_path = root / "result.json"
            source_path.write_text("answer = sum(values)\nprint(answer)\n", encoding="utf-8")

            exit_code = run_request(
                {
                    "setupData": {"values": [4, 6]},
                    "code": "raise RuntimeError('request code should not run')",
                    "sourcePath": str(source_path),
                    "observeVariables": ["answer"],
                },
                result_path,
            )

            self.assertEqual(exit_code, 0)
            result = json.loads(result_path.read_text(encoding="utf-8"))
            self.assertEqual(result["status"], "SUCCESS")
            self.assertEqual(result["serialized"]["variables"]["answer"]["value"], 10)

    def test_python_exception_keeps_traceback_line(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result_path = Path(tmp) / "result.json"
            exit_code = run_request(
                {
                    "setupData": {},
                    "code": "x = 1\nraise ValueError('boom')",
                    "observeVariables": ["x"],
                },
                result_path,
            )
            self.assertEqual(exit_code, 1)
            result = json.loads(result_path.read_text(encoding="utf-8"))
            self.assertEqual(result["status"], "PYTHON_EXCEPTION")
            self.assertEqual(result["exception"]["type"], "ValueError")
            self.assertIn('File "main.py", line 2', result["exception"]["traceback"])
            self.assertEqual(result["serialized"]["variables"]["x"]["value"], 1)


if __name__ == "__main__":
    unittest.main()
