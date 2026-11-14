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


class TestTodo(unittest.TestCase):
    def test_add_then_list(self):
        with tempfile.TemporaryDirectory() as tmp:
            todo_file = Path(tmp) / "todos.json"
            added = run_cli(["add", "buy milk"], todo_file)
            self.assertEqual(added.returncode, 0, added.stderr)
            self.assertIn("buy milk", added.stdout)

            listed = run_cli(["list"], todo_file)
            self.assertEqual(listed.returncode, 0, listed.stderr)
            self.assertIn("buy milk", listed.stdout)

    def test_empty_list(self):
        with tempfile.TemporaryDirectory() as tmp:
            todo_file = Path(tmp) / "todos.json"
            listed = run_cli(["list"], todo_file)
            self.assertEqual(listed.returncode, 0, listed.stderr)
            self.assertEqual(listed.stdout, "")


if __name__ == "__main__":
    unittest.main()
