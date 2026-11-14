# Discount boundary bug

`total_after_discount` applies the discount only when the subtotal is strictly greater than `100.00`.

Business rule: orders with a subtotal of **exactly 100.00** must also receive the discount.

Fix the bug without changing the public API or the files under `tests/`.

Run the visible tests:

```bash
python3 -m unittest discover -s tests -t . -v
```
