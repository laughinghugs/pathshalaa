"""Storage for organisations, users, invites, and usage/audit logs.

Same lightweight approach as app/calibration.py — plain SQL, no ORM. Backed
by SQLite locally and Postgres in production (see app/db.py). This is the
multi-tenancy source of truth: which organisation a user belongs to, their
role, and their trial state.
"""

from datetime import datetime, timezone
from pathlib import Path

from app.db import IS_POSTGRES, connect

DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "rbac.db"

DEMO_ORG_NAME = "Demo"
DEMO_ORG_TRIAL_DAYS = 15

_PK = "id SERIAL PRIMARY KEY" if IS_POSTGRES else "id INTEGER PRIMARY KEY AUTOINCREMENT"


def get_connection():
    return connect(DB_PATH)


def create_schema() -> None:
    with get_connection() as conn:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS organisations (
                {_PK},
                name TEXT NOT NULL,
                subscription_tier TEXT NOT NULL DEFAULT 'trial',
                seats_allowed INTEGER,
                is_demo INTEGER NOT NULL DEFAULT 0,
                trial_days INTEGER,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS users (
                {_PK},
                email TEXT NOT NULL UNIQUE,
                google_sub TEXT UNIQUE,
                role TEXT NOT NULL DEFAULT 'user',
                organisation_id INTEGER REFERENCES organisations(id),
                trial_expires_at TEXT,
                data_deleted INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS invites (
                {_PK},
                email TEXT NOT NULL,
                organisation_id INTEGER NOT NULL REFERENCES organisations(id),
                role TEXT NOT NULL DEFAULT 'user',
                created_at TEXT NOT NULL,
                used_at TEXT
            )
            """
        )
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS deletion_audit_log (
                {_PK},
                user_id INTEGER NOT NULL,
                email TEXT NOT NULL,
                deleted_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS usage_events (
                {_PK},
                user_id INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )


def seed_demo_org_if_missing() -> None:
    with get_connection() as conn:
        existing_demo = conn.execute(
            "SELECT id FROM organisations WHERE is_demo = 1 LIMIT 1"
        ).fetchone()
        if existing_demo is None:
            conn.execute(
                """
                INSERT INTO organisations (name, subscription_tier, seats_allowed, is_demo, trial_days, created_at)
                VALUES (?, 'trial', NULL, 1, ?, ?)
                """,
                (DEMO_ORG_NAME, DEMO_ORG_TRIAL_DAYS, _now_iso()),
            )


def init_db() -> None:
    create_schema()
    seed_demo_org_if_missing()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
