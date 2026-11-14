import unittest

from inventory import line_total, total_after_discount


class TestDiscountBoundary(unittest.TestCase):
    def test_exact_threshold_gets_discount(self):
        self.assertEqual(total_after_discount([(100.0, 1)], 10), 90.0)

    def test_just_above_threshold(self):
        self.assertEqual(total_after_discount([(100.01, 1)], 10), 90.01)

    def test_multiple_lines_exact_threshold(self):
        self.assertEqual(total_after_discount([(40.0, 1), (60.0, 1)], 25), 75.0)

    def test_zero_discount(self):
        self.assertEqual(total_after_discount([(100.0, 1)], 0), 100.0)

    def test_full_discount(self):
        self.assertEqual(total_after_discount([(100.0, 1)], 100), 0.0)

    def test_empty_cart(self):
        self.assertEqual(total_after_discount([], 10), 0.0)

    def test_invalid_quantity(self):
        with self.assertRaises(ValueError):
            line_total(10.0, -1)

    def test_invalid_price(self):
        with self.assertRaises(ValueError):
            line_total(-0.01, 1)


if __name__ == "__main__":
    unittest.main()
