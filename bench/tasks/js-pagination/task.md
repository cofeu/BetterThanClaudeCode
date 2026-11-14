# Pagination validation

`paginate(items, options)` already slices a list, but it accepts any `limit` and `offset`.

Required behavior:

- `limit` defaults to `10`; `offset` defaults to `0`.
- `limit` must be an integer from `1` to `100` inclusive. Anything else (including `0`, `101`, `1.5`, `"5"`) throws a `RangeError`.
- `offset` must be a non-negative integer. Anything else (including `-1` and `1.5`) throws a `RangeError`.
- `items` must be an array. Anything else throws a `TypeError`.
- The result keeps the shape `{ data, total, limit, offset }`, where `total` is the length of the full input list and `data` is the requested slice.
- An `offset` beyond the end of the list returns an empty `data` array, not an error.
- Do not mutate the input array or the files under `tests/`.

Run the visible tests:

```bash
node --test tests/
```
