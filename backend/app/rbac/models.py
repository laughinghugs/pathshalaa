"""Organisation/User/Invite records and the plain-SQL CRUD around them.

Kept free of any request/permission logic — see app/rbac/permissions.py and
app/rbac/dependencies.py for "who can do what", and app/billing/trial.py for
signup/trial rules built on top of these primitives.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from app.rbac.db import get_connection

OWNER = "owner"
DEVELOPER = "developer"
ADMIN = "admin"
USER = "user"
VALID_ROLES = {OWNER, DEVELOPER, ADMIN, USER}


@dataclass
class Organisation:
    id: int
    name: str
    subscription_tier: str
    seats_allowed: Optional[int]
    is_demo: bool
    trial_days: Optional[int]
    created_at: str


@dataclass
class User:
    id: int
    email: str
    google_sub: Optional[str]
    role: str
    organisation_id: Optional[int]
    trial_expires_at: Optional[datetime]
    data_deleted: bool
    created_at: str


@dataclass
class Invite:
    id: int
    email: str
    organisation_id: int
    role: str
    created_at: str
    used_at: Optional[str]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    return datetime.fromisoformat(value) if value else None


def _org_from_row(row) -> Organisation:
    return Organisation(
        id=row["id"],
        name=row["name"],
        subscription_tier=row["subscription_tier"],
        seats_allowed=row["seats_allowed"],
        is_demo=bool(row["is_demo"]),
        trial_days=row["trial_days"],
        created_at=row["created_at"],
    )


def _user_from_row(row) -> User:
    return User(
        id=row["id"],
        email=row["email"],
        google_sub=row["google_sub"],
        role=row["role"],
        organisation_id=row["organisation_id"],
        trial_expires_at=_parse_dt(row["trial_expires_at"]),
        data_deleted=bool(row["data_deleted"]),
        created_at=row["created_at"],
    )


def _invite_from_row(row) -> Invite:
    return Invite(
        id=row["id"],
        email=row["email"],
        organisation_id=row["organisation_id"],
        role=row["role"],
        created_at=row["created_at"],
        used_at=row["used_at"],
    )


# ---- Organisations ----------------------------------------------------


def get_organisation(organisation_id: int) -> Optional[Organisation]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM organisations WHERE id = ?", (organisation_id,)).fetchone()
    return _org_from_row(row) if row else None


def get_demo_organisation() -> Organisation:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM organisations WHERE is_demo = 1 LIMIT 1").fetchone()
    if row is None:
        raise RuntimeError("Demo organisation is not seeded — call rbac.db.init_db() on startup")
    return _org_from_row(row)


def create_organisation(
    name: str,
    subscription_tier: str = "standard",
    seats_allowed: Optional[int] = None,
    is_demo: bool = False,
    trial_days: Optional[int] = None,
) -> Organisation:
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO organisations (name, subscription_tier, seats_allowed, is_demo, trial_days, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (name, subscription_tier, seats_allowed, int(is_demo), trial_days, _now_iso()),
        )
        org_id = cursor.lastrowid
    return get_organisation(org_id)


def list_all_organisations() -> list[Organisation]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM organisations ORDER BY created_at").fetchall()
    return [_org_from_row(row) for row in rows]


def list_users_by_organisation(organisation_id: int) -> list[User]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM users WHERE organisation_id = ? ORDER BY created_at", (organisation_id,)
        ).fetchall()
    return [_user_from_row(row) for row in rows]


def count_active_users_in_organisation(organisation_id: int) -> int:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS count FROM users WHERE organisation_id = ? AND data_deleted = 0",
            (organisation_id,),
        ).fetchone()
    return row["count"]


# ---- Users --------------------------------------------------------------


def list_all_users() -> list[User]:
    """Every user who has ever signed in, across all organisations — owner-only view."""
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM users ORDER BY created_at").fetchall()
    return [_user_from_row(row) for row in rows]


def get_user_by_id(user_id: int) -> Optional[User]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _user_from_row(row) if row else None


def get_user_by_google_sub(google_sub: str) -> Optional[User]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE google_sub = ?", (google_sub,)).fetchone()
    return _user_from_row(row) if row else None


def get_user_by_email(email: str) -> Optional[User]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    return _user_from_row(row) if row else None


def create_user(
    email: str,
    google_sub: Optional[str],
    role: str,
    organisation_id: Optional[int],
    trial_expires_at: Optional[datetime],
) -> User:
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO users (email, google_sub, role, organisation_id, trial_expires_at, data_deleted, created_at)
            VALUES (?, ?, ?, ?, ?, 0, ?)
            """,
            (
                email,
                google_sub,
                role,
                organisation_id,
                trial_expires_at.isoformat() if trial_expires_at else None,
                _now_iso(),
            ),
        )
        user_id = cursor.lastrowid
    return get_user_by_id(user_id)


def set_google_sub(user_id: int, google_sub: str) -> None:
    with get_connection() as conn:
        conn.execute("UPDATE users SET google_sub = ? WHERE id = ?", (google_sub, user_id))


def set_user_organisation(
    user_id: int, organisation_id: int, trial_expires_at: Optional[datetime]
) -> User:
    with get_connection() as conn:
        conn.execute(
            "UPDATE users SET organisation_id = ?, trial_expires_at = ? WHERE id = ?",
            (organisation_id, trial_expires_at.isoformat() if trial_expires_at else None, user_id),
        )
    return get_user_by_id(user_id)


def set_user_role(user_id: int, role: str) -> User:
    """Changes a user's role.

    Owner/developer are org-less by data-model convention (see the User
    table's organisation_id docs), so moving *into* either role clears
    organisation_id and trial_expires_at rather than leaving a stale org
    reference behind. Moving into admin/user leaves organisation_id as-is —
    use set_user_organisation (the owner's assign/upgrade path) to attach
    them to an org afterward.
    """
    with get_connection() as conn:
        if role in (OWNER, DEVELOPER):
            conn.execute(
                "UPDATE users SET role = ?, organisation_id = NULL, trial_expires_at = NULL WHERE id = ?",
                (role, user_id),
            )
        else:
            conn.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
    return get_user_by_id(user_id)


def list_expired_undeleted_demo_users() -> list[User]:
    """Users in a demo org whose trial has passed and whose data hasn't been wiped yet."""
    now = _now_iso()
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT u.* FROM users u
            JOIN organisations o ON o.id = u.organisation_id
            WHERE o.is_demo = 1 AND u.data_deleted = 0
              AND u.trial_expires_at IS NOT NULL AND u.trial_expires_at < ?
            """,
            (now,),
        ).fetchall()
    return [_user_from_row(row) for row in rows]


def mark_data_deleted(user_id: int) -> None:
    with get_connection() as conn:
        conn.execute("UPDATE users SET data_deleted = 1 WHERE id = ?", (user_id,))


# ---- Invites --------------------------------------------------------------


def list_all_pending_invites() -> list[Invite]:
    """Every not-yet-used invite, across all organisations — owner-only view."""
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM invites WHERE used_at IS NULL ORDER BY created_at").fetchall()
    return [_invite_from_row(row) for row in rows]


def get_pending_invite_by_email(email: str) -> Optional[Invite]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM invites WHERE email = ? AND used_at IS NULL ORDER BY created_at LIMIT 1",
            (email,),
        ).fetchone()
    return _invite_from_row(row) if row else None


def get_invite_by_id(invite_id: int) -> Optional[Invite]:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM invites WHERE id = ?", (invite_id,)).fetchone()
    return _invite_from_row(row) if row else None


def list_pending_invites_by_organisation(organisation_id: int) -> list[Invite]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM invites WHERE organisation_id = ? AND used_at IS NULL ORDER BY created_at",
            (organisation_id,),
        ).fetchall()
    return [_invite_from_row(row) for row in rows]


def count_pending_invites(organisation_id: int) -> int:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS count FROM invites WHERE organisation_id = ? AND used_at IS NULL",
            (organisation_id,),
        ).fetchone()
    return row["count"]


def create_invite(email: str, organisation_id: int, role: str = USER) -> Invite:
    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO invites (email, organisation_id, role, created_at, used_at) VALUES (?, ?, ?, ?, NULL)",
            (email, organisation_id, role, _now_iso()),
        )
        invite_id = cursor.lastrowid
    return get_invite_by_id(invite_id)


def mark_invite_used(invite_id: int) -> None:
    with get_connection() as conn:
        conn.execute("UPDATE invites SET used_at = ? WHERE id = ?", (_now_iso(), invite_id))


def delete_invite(invite_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM invites WHERE id = ?", (invite_id,))


# ---- Deletion audit log -----------------------------------------------


def log_deletion(user_id: int, email: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO deletion_audit_log (user_id, email, deleted_at) VALUES (?, ?, ?)",
            (user_id, email, _now_iso()),
        )


# ---- Usage events -----------------------------------------------------


def log_usage_event(user_id: int, event_type: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO usage_events (user_id, event_type, created_at) VALUES (?, ?, ?)",
            (user_id, event_type, _now_iso()),
        )


def count_usage_events(user_id: int) -> int:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS count FROM usage_events WHERE user_id = ?", (user_id,)
        ).fetchone()
    return row["count"]
