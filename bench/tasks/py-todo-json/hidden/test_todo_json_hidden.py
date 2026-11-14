import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run_cli(args, todo_file):
    env = {**os.environ, "TODO_FILE": str(todo_file)}
    return subprocess.run(
        [sys.executable, str(ROOT / "todo.py"), *args],
        capture_output=True,
        text=True,
        env=env,
    )


class TestJsonOutput(unittest.TestCase):
    def test_json_list_schema(self):
        with tempfile.TemporaryDirectory() as tmp:
            todo_file = Path(tmp) / "todos.json"
            self.assertEqual(run_cli(["add", "first"], todo_file).returncode, 0)
            self.assertEqual(run_cli(["add", "second"], todo_file).returncode, 0)

            result = run_cli(["--json", "list"], todo_file)
            self.assertEqual(result.returncode, 0, result.stderr)
            data = json.loads(result.stdout)
            self.assertEqual(
                data,
                [
                    {"id": 1, "text": "first", "done": False},
                    {"id": 2, "text": "second", "done": False},
                ],
            )

    def test_json_add_returns_object(self):
        with tempfile.TemporaryDirectory() as tmp:
            todo_file = Path(tmp) / "todos.json"
            result = run_cli(["--json", "add", "ship it"], todo_file)
            self.assertEqual(result.returncode, 0, result.stderr)
            created = json.loads(result.stdout)
            self.assertEqual(created, {"id": 1, "text": "ship it", "done": False})

            listed = json.loads(run_cli(["--json", "list"], todo_file).stdout)
            self.assertEqual(listed, [created])

    def test_json_stdout_is_only_json(self):
        with tempfile.TemporaryDirectory() as tmp:
            todo_file = Path(tmp) / "todos.json"
            run_cli(["add", "one"], todo_file)
            result = run_cli(["--json", "list"], todo_file)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertNotIn("1. [", result.stdout)
            self.assertEqual(result.stderr, "")
            json.loads(result.stdout)

    def test_human_output_unchanged(self):
        with tempfile.TemporaryDirectory() as tmp:
            todo_file = Path(tmp) / "todos.json"
            run_cli(["add", "one"], todo_file)
            result = run_cli(["list"], todo_file)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("1. [ ] one", result.stdout)


if __name__ == "__main__":
    unittest.main()
