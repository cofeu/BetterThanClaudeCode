import sqlite3
import unittest

from db import find_user, init_db, search_users


class TestSqlInjection(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        init_db(self.conn)

    def tearDown(self):
        self.conn.close()

    def test_find_user_with_apostrophe(self):
        self.assertEqual(find_user(self.conn, "O'Brien"), (3, "O'Brien"))

    def test_injection_does_not_return_unrelated_rows(self):
        self.assertIsNone(find_user(self.conn, "' OR '1'='1"))
        self.assertIsNone(find_user(self.conn, "alice' OR '1'='1"))

    def test_injection_does_not_drop_the_table(self):
        self.assertIsNone(find_user(self.conn, "'; DROP TABLE users; --"))
        self.assertEqual(find_user(self.conn, "alice"), (1, "alice"))

    def test_search_with_apostrophe(self):
        self.assertEqual(search_users(self.conn, "O'Br"), [(3, "O'Brien")])

    def test_search_injection_is_literal(self):
        self.assertEqual(search_users(self.conn, "' OR '1'='1"), [])

    def test_search_injection_cannot_add_rows(self):
        self.assertEqual(
            search_users(self.conn, "x' UNION SELECT 99, 'injected' --"),
            [],
        )


if __name__ == "__main__":
    unittest.main()
