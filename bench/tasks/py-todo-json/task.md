# Add JSON output to the todo CLI

Add a global `--json` flag to `todo.py`.

Required behavior:

- `python3 todo.py --json list` prints a JSON **array** of objects with exactly the keys `id` (integer), `text` (string) and `done` (boolean). Nothing else may be written to stdout.
- `python3 todo.py --json add "buy milk"` prints the created object as JSON with the same keys and persists it.
- Without `--json`, the existing human-readable output must not change.
- Successful commands exit with code `0`.
- Do not change the file format or the files under `tests/`.

Run the visible tests:

```bash
python3 -m unittest discover -s tests -t . -v
```
