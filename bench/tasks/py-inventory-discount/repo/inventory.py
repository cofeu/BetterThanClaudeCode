from __future__ import annotations


def line_total(price: float, quantity: int) -> float:
    if price < 0:
        raise ValueError("price must be non-negative")
    if quantity < 0:
        raise ValueError("quantity must be non-negative")
    return round(price * quantity, 2)


def total_after_discount(items, discount_percent: float) -> float:
    if not 0 <= discount_percent <= 100:
        raise ValueError("discount_percent must be between 0 and 100")

    subtotal = sum(line_total(price, quantity) for price, quantity in items)
    if subtotal > 100:
        return round(subtotal * (1 - discount_percent / 100), 2)
    return round(subtotal, 2)
