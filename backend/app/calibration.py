"""Per-teacher handwriting calibration samples.

This is plain prompt-level few-shot conditioning, not model fine-tuning:
we store a handful of (image, correct LaTeX) pairs per teacher — collected
during onboarding and whenever a teacher corrects a misread result — and
inject them as few-shot examples ahead of the new image at recognition time
(see app/llm/*_provider.py). A single SQLite table is enough for this; no
need for a heavier schema or ORM at MVP scale.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from app.db import IS_POSTGRES, connect, insert_returning_id

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "calibration.db"

ONBOARDING_SOURCE = "onboarding"
CORRECTION_SOURCE = "correction"

_PK = "id SERIAL PRIMARY KEY" if IS_POSTGRES else "id INTEGER PRIMARY KEY AUTOINCREMENT"
_BLOB_TYPE = "BYTEA" if IS_POSTGRES else "BLOB"


@dataclass
class CalibrationSample:
    id: int
    teacher_id: str
    label: str
    image_bytes: bytes
    mime_type: str
    source: str
    created_at: str


def _get_connection():
    return connect(DB_PATH)


def init_db() -> None:
    with _get_connection() as conn:
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS calibration_samples (
                {_PK},
                teacher_id TEXT NOT NULL,
                label TEXT NOT NULL,
                image_data {_BLOB_TYPE} NOT NULL,
                mime_type TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'onboarding',
                created_at TEXT NOT NULL
            )
            """
        )


def store_calibration_sample(
    teacher_id: str,
    label: str,
    image_bytes: bytes,
    mime_type: str,
    source: str = ONBOARDING_SOURCE,
) -> int:
    """Stores a single (image, label) sample for a teacher and returns its id."""
    with _get_connection() as conn:
        return insert_returning_id(
            conn,
            """
            INSERT INTO calibration_samples (teacher_id, label, image_data, mime_type, source, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (teacher_id, label, image_bytes, mime_type, source, datetime.now(timezone.utc).isoformat()),
        )


def store_correction(teacher_id: str, image_bytes: bytes, mime_type: str, corrected_label: str) -> int:
    """Stores a teacher's correction to a misread equation as a calibration sample.

    Tagged with source="correction" so it can be told apart from onboarding
    samples later (e.g. to prioritize one over the other).
    """
    return store_calibration_sample(
        teacher_id, corrected_label, image_bytes, mime_type, source=CORRECTION_SOURCE
    )


def get_calibration_samples(teacher_id: str, limit: int = 4) -> list[CalibrationSample]:
    """Returns up to `limit` stored samples for a teacher, in random order.

    Random order is a deliberately simple selection strategy for MVP — swap
    in something smarter (e.g. similarity to the new image) later without
    changing this function's signature.
    """
    with _get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, teacher_id, label, image_data, mime_type, source, created_at
            FROM calibration_samples
            WHERE teacher_id = ?
            ORDER BY RANDOM()
            LIMIT ?
            """,
            (teacher_id, limit),
        ).fetchall()

    return [
        CalibrationSample(
            id=row["id"],
            teacher_id=row["teacher_id"],
            label=row["label"],
            image_bytes=row["image_data"],
            mime_type=row["mime_type"],
            source=row["source"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


def delete_calibration_samples_for_teacher(teacher_id: str) -> int:
    """Deletes all stored samples (onboarding + corrections) for a teacher.

    Used by the trial-expiry cleanup job (app/billing/trial.py) to wipe a
    demo user's content once their trial lapses. Returns the number of rows
    deleted.
    """
    with _get_connection() as conn:
        cursor = conn.execute("DELETE FROM calibration_samples WHERE teacher_id = ?", (teacher_id,))
        return cursor.rowcount


def count_calibration_samples(teacher_id: str) -> int:
    with _get_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS count FROM calibration_samples WHERE teacher_id = ?",
            (teacher_id,),
        ).fetchone()
    return row["count"]
