import unittest

from inventory import total_after_discount


class TestInventory(unittest.TestCase):
    def test_no_discount_below_threshold(self):
        self.assertEqual(total_after_discount([(10.0, 2)], 10), 20.0)

    def test_discount_above_threshold(self):
        self.assertEqual(total_after_discount([(60.0, 2)], 10), 108.0)

    def test_rejects_invalid_discount(self):
        with self.assertRaises(ValueError):
            total_after_discount([(10.0, 1)], 101)


if __name__ == "__main__":
    unittest.main()
