# SQL injection in the user repository

`db.py` builds SQL with f-strings, so user input changes the query structure.

Required behavior:

- `find_user(conn, name)` must look up the exact name and return `(id, name)` or `None`.
- `search_users(conn, term)` must return users whose name contains `term`, ordered by `id`.
- User input must be treated as data, never as SQL. Names containing apostrophes must work, and input such as `' OR '1'='1` must not return unrelated rows or run extra statements.
- Keep the public functions and their return types the same.
- Do not change the files under `tests/`.

Run the visible tests:

```bash
python3 -m unittest discover -s tests -t . -v
```
