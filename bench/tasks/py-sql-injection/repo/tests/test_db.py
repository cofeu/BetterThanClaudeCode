import sqlite3
import unittest

from db import find_user, init_db, search_users


class TestDb(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        init_db(self.conn)

    def tearDown(self):
        self.conn.close()

    def test_find_existing_user(self):
        self.assertEqual(find_user(self.conn, "alice"), (1, "alice"))

    def test_find_missing_user(self):
        self.assertIsNone(find_user(self.conn, "nobody"))

    def test_search_matches_substring(self):
        self.assertEqual(search_users(self.conn, "o"), [(2, "bob"), (3, "O'Brien")])

    def test_search_no_match(self):
        self.assertEqual(search_users(self.conn, "zzz"), [])


if __name__ == "__main__":
    unittest.main()
