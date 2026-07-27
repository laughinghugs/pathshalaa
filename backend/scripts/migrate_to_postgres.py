"""One-off, re-runnable script: copies local SQLite data
(backend/data/rbac.db, backend/data/calibration.db) into the Postgres
database at DATABASE_URL.

Usage (from backend/):
    DATABASE_URL=postgresql://... python scripts/migrate_to_postgres.py

Safe to re-run: inserts use ON CONFLICT (id) DO NOTHING, and each table's
serial sequence is reset to MAX(id) afterward so future app-driven inserts
don't collide with migrated ids.
"""

import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import db as app_db  # noqa: E402

if not app_db.IS_POSTGRES:
    raise SystemExit(
        "DATABASE_URL is not set — this script only targets Postgres. "
        "Set DATABASE_URL to the Render Postgres connection string and re-run."
    )

import psycopg  # noqa: E402
from psycopg.rows import dict_row  # noqa: E402

from app import calibration  # noqa: E402
from app.rbac import db as rbac_db  # noqa: E402

RBAC_TABLES = [
    ("organisations", ["id", "name", "subscription_tier", "seats_allowed", "is_demo", "trial_days", "created_at"]),
    (
        "users",
        ["id", "email", "google_sub", "role", "organisation_id", "trial_expires_at", "data_deleted", "created_at"],
    ),
    ("invites", ["id", "email", "organisation_id", "role", "created_at", "used_at"]),
    ("deletion_audit_log", ["id", "user_id", "email", "deleted_at"]),
    ("usage_events", ["id", "user_id", "event_type", "created_at"]),
]

CALIBRATION_TABLES = [
    ("calibration_samples", ["id", "teacher_id", "label", "image_data", "mime_type", "source", "created_at"]),
]


def _copy_table(sqlite_path: Path, pg_conn, table: str, columns: list) -> int:
    if not sqlite_path.exists():
        return 0
    sqlite_conn = sqlite3.connect(sqlite_path)
    sqlite_conn.row_factory = sqlite3.Row
    try:
        rows = sqlite_conn.execute(f"SELECT {', '.join(columns)} FROM {table}").fetchall()
    finally:
        sqlite_conn.close()

    col_list = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    for row in rows:
        values = tuple(row[c] for c in columns)
        pg_conn.execute(
            f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING",
            values,
        )

    if rows:
        pg_conn.execute(
            f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
            f"(SELECT COALESCE(MAX(id), 1) FROM {table}))"
        )
    return len(rows)


def _redact(url: str) -> str:
    # postgresql://user:password@host/db -> postgresql://user:***@host/db
    if "@" not in url or "://" not in url:
        return url
    scheme, rest = url.split("://", 1)
    creds, host = rest.split("@", 1)
    user = creds.split(":", 1)[0]
    return f"{scheme}://{user}:***@{host}"


def main() -> None:
    print(f"Target: {_redact(app_db.DATABASE_URL)}")

    rbac_db.create_schema()
    calibration.init_db()

    with psycopg.connect(app_db.DATABASE_URL, row_factory=dict_row) as pg_conn:
        total = 0
        for table, columns in [*RBAC_TABLES, *CALIBRATION_TABLES]:
            sqlite_path = calibration.DB_PATH if table == "calibration_samples" else rbac_db.DB_PATH
            n = _copy_table(sqlite_path, pg_conn, table, columns)
            print(f"  {table}: {n} rows")
            total += n
        pg_conn.commit()

    print(f"Done — {total} rows copied (existing ids skipped on re-run).")


if __name__ == "__main__":
    main()
