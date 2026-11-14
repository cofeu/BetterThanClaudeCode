# Async cache concurrency

`createCache` caches resolved values, but concurrent `get()` calls for the same key each call the loader.

Required behavior:

- N concurrent `get()` calls for the same key must call the loader **once** and share the result.
- Different keys must still load independently.
- A rejected load must **not** be cached; a later `get()` must retry.
- Do not change the exported API or the files under `tests/`.

Run the visible tests:

```bash
node --test tests/
```
