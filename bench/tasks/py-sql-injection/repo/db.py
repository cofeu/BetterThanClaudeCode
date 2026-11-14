from __future__ import annotations

import sqlite3


def init_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS users ("
        "id INTEGER PRIMARY KEY, "
        "name TEXT NOT NULL UNIQUE"
        ")"
    )
    conn.executemany(
        "INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)",
        [(1, "alice"), (2, "bob"), (3, "O'Brien")],
    )
    conn.commit()


def find_user(conn: sqlite3.Connection, name: str):
    cursor = conn.execute(f"SELECT id, name FROM users WHERE name = '{name}'")
    return cursor.fetchone()


def search_users(conn: sqlite3.Connection, term: str):
    cursor = conn.execute(
        f"SELECT id, name FROM users WHERE name LIKE '%{term}%' ORDER BY id"
    )
    return cursor.fetchall()
