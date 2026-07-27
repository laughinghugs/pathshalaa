"""Backend-agnostic SQL connection helper.

Uses Postgres when DATABASE_URL is set (Render production); otherwise falls
back to a local SQLite file. Existing call sites (app/rbac/db.py,
app/rbac/models.py, app/calibration.py) write "?"-style SQLite placeholders
— connect()'s Postgres wrapper rewrites them to "%s" so those call sites
don't need per-query changes.
"""

import sqlite3
from pathlib import Path

from app.config import get_settings

DATABASE_URL = get_settings().database_url
IS_POSTGRES = bool(DATABASE_URL)

if IS_POSTGRES:
    import psycopg
    from psycopg.rows import dict_row

    IntegrityError = psycopg.errors.UniqueViolation
else:
    IntegrityError = sqlite3.IntegrityError


class _PgCursor:
    def __init__(self, cursor):
        self._cursor = cursor

    def fetchone(self):
        return self._cursor.fetchone()

    def fetchall(self):
        return self._cursor.fetchall()

    @property
    def rowcount(self):
        return self._cursor.rowcount

    @property
    def lastrowid(self):
        raise AttributeError("Postgres cursors have no lastrowid — use app.db.insert_returning_id")


class _PgConnection:
    """Wraps a psycopg connection so call sites written for sqlite3 (which
    supports `conn.execute(...)` directly and "?" placeholders) work
    unchanged."""

    def __init__(self, conn):
        self._conn = conn

    def execute(self, sql, params=()):
        cursor = self._conn.cursor()
        cursor.execute(sql.replace("?", "%s"), params)
        return _PgCursor(cursor)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        try:
            if exc_type is None:
                self._conn.commit()
            else:
                self._conn.rollback()
        finally:
            self._conn.close()


def connect(sqlite_path: Path):
    if IS_POSTGRES:
        return _PgConnection(psycopg.connect(DATABASE_URL, row_factory=dict_row))
    sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(sqlite_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def insert_returning_id(conn, sql: str, params=()) -> int:
    """Runs an INSERT and returns the new row's id, on either backend."""
    if IS_POSTGRES:
        row = conn.execute(sql + " RETURNING id", params).fetchone()
        return row["id"]
    return conn.execute(sql, params).lastrowid
