"""Demo-org signup, trial validity, expiry cleanup, and the owner upgrade path.

Kept separate from app/rbac/ on purpose: RBAC (who's allowed to do what) is
expected to stay stable, while this module (whether a given user's access is
still valid, and what happens when it lapses) will keep changing as real
subscription tiers, billing providers, and seat limits get added.
"""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status

from app.calibration import delete_calibration_samples_for_teacher
from app.config import get_settings
from app.google_auth import GoogleUser
from app.rbac import models
from app.rbac.dependencies import get_current_app_user
from app.rbac.models import DEVELOPER, OWNER, USER, Invite, User

logger = logging.getLogger("pathshalaa.billing")

TRIAL_EXPIRED_ERROR = "trial_expired"


def _emails_from_setting(value: str) -> set[str]:
    return {email.strip().lower() for email in value.split(",") if email.strip()}


def _new_signup_assignment(google_user: GoogleUser) -> tuple[dict, Optional[Invite]]:
    """Decides role/org/trial for an email with no existing User row.

    Returns (create_user kwargs, the invite to mark used afterward — or
    None). Pulled out of resolve_or_create_user so the create-then-retry
    logic there doesn't have to duplicate this decision on a race retry.
    """
    settings = get_settings()
    email_lower = google_user.email.lower()

    if email_lower in _emails_from_setting(settings.owner_emails):
        return {"role": OWNER, "organisation_id": None, "trial_expires_at": None}, None

    if email_lower in _emails_from_setting(settings.developer_emails):
        return {"role": DEVELOPER, "organisation_id": None, "trial_expires_at": None}, None

    invite = models.get_pending_invite_by_email(google_user.email)
    if invite:
        return (
            {"role": invite.role, "organisation_id": invite.organisation_id, "trial_expires_at": None},
            invite,
        )

    demo_org = models.get_demo_organisation()
    trial_days = demo_org.trial_days or 0
    trial_expires_at = datetime.now(timezone.utc) + timedelta(days=trial_days)
    return (
        {"role": USER, "organisation_id": demo_org.id, "trial_expires_at": trial_expires_at},
        None,
    )


def resolve_or_create_user(google_user: GoogleUser) -> User:
    """Loads the app User row for a signed-in Google account, creating it on
    first sight.

    Order matters:
      1. Already provisioned (by sub, then by email) -> return as-is. This
         is what stops trial-cycling: an email that already has a User row
         (even a data_deleted one from a lapsed trial) never gets a second
         Demo assignment or a reset trial_expires_at.
      2. Configured owner/developer email -> bootstrap that role, no org.
      3. A school admin's pre-created invite matches this email -> attach to
         that invite's organisation/role, no trial.
      4. Otherwise -> brand-new signup with no invite: Demo org, "user" role,
         trial_expires_at = now + Demo.trial_days.

    The frontend fires several authenticated calls back-to-back right after
    login (e.g. /auth/me and /calibration/status), so two requests can both
    see "no user yet" for the same brand-new account and race to create it.
    Only one INSERT can win (email/google_sub are UNIQUE) — the loser
    re-reads and returns the winner's row instead of erroring the request.
    """
    existing = models.get_user_by_google_sub(google_user.sub)
    if existing:
        return existing

    existing = models.get_user_by_email(google_user.email)
    if existing:
        if not existing.google_sub:
            models.set_google_sub(existing.id, google_user.sub)
            existing.google_sub = google_user.sub
        return existing

    create_kwargs, invite = _new_signup_assignment(google_user)
    try:
        user = models.create_user(email=google_user.email, google_sub=google_user.sub, **create_kwargs)
    except sqlite3.IntegrityError:
        winner = models.get_user_by_google_sub(google_user.sub) or models.get_user_by_email(google_user.email)
        if winner is None:
            raise
        return winner

    if invite:
        models.mark_invite_used(invite.id)
    return user


def check_trial_status(user: User = Depends(get_current_app_user)) -> User:
    if user.role == OWNER:
        return user
    if user.trial_expires_at is None:
        return user
    if user.trial_expires_at > datetime.now(timezone.utc):
        return user

    trial_days = None
    if user.organisation_id:
        org = models.get_organisation(user.organisation_id)
        trial_days = org.trial_days if org else None

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "error": TRIAL_EXPIRED_ERROR,
            "message": (
                f"Your {trial_days}-day trial has ended. Contact us to continue using AI Teaching Board."
                if trial_days
                else "Your trial has ended. Contact us to continue using AI Teaching Board."
            ),
        },
    )


def run_expiry_cleanup() -> int:
    """Wipes content for demo users whose trial has lapsed; keeps the User row.

    Returns the number of users cleaned up. Safe to call repeatedly — once
    data_deleted is set, list_expired_undeleted_demo_users() won't surface
    that user again.
    """
    expired_users = models.list_expired_undeleted_demo_users()
    for user in expired_users:
        delete_calibration_samples_for_teacher(user.google_sub) if user.google_sub else None
        models.mark_data_deleted(user.id)
        models.log_deletion(user.id, user.email)
        logger.info("Deleted trial data for user_id=%s email=%s", user.id, user.email)
    return len(expired_users)


def upgrade_user(user_id: int, target_organisation_id: int) -> User:
    """Owner-only: moves a user to a real (paying) organisation and clears their trial."""
    if models.get_organisation(target_organisation_id) is None:
        raise ValueError(f"Organisation {target_organisation_id} does not exist")
    if models.get_user_by_id(user_id) is None:
        raise ValueError(f"User {user_id} does not exist")
    return models.set_user_organisation(user_id, target_organisation_id, trial_expires_at=None)


_scheduler = None


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.cron import CronTrigger

    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(run_expiry_cleanup, CronTrigger(hour=2, minute=0), id="trial_expiry_cleanup")
    _scheduler.start()


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
