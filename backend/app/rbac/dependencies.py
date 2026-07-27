"""FastAPI dependencies for RBAC and organisation-scoping.

Two distinct concerns, kept as two distinct dependencies (per the module
docstring in app/billing/trial.py):
  - require_permission(...): "is this role allowed to call this route at all".
  - get_org_scope(...): "which organisation_id(s) may this request's queries
    touch". Trial validity is a separate concern again — see
    app/billing/trial.py's check_trial_status.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, status

from app.auth import get_current_user
from app.google_auth import GoogleUser
from app.rbac.models import User
from app.rbac.permissions import has_permission


def get_current_app_user(google_user: GoogleUser = Depends(get_current_user)) -> User:
    """Resolves the app-level User row (role, organisation, trial state) for
    the signed-in Google account, creating it on first sight.

    Creation (invite-matching / demo-org fallback / trial assignment) is a
    billing concern, not an RBAC one — delegated to app.billing.trial so this
    module stays focused on permission and org-scope checks. Imported inside
    the function to avoid a module-level import cycle (billing depends on
    rbac's models/db, not the other way around).
    """
    from app.billing.trial import resolve_or_create_user

    return resolve_or_create_user(google_user)


def require_permission(permission: str):
    """Dependency factory: 403s unless the current user's role grants `permission`."""

    def check(user: User = Depends(get_current_app_user)) -> User:
        if not has_permission(user.role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your role does not have permission to do this.",
            )
        return user

    return check


@dataclass
class OrgScope:
    """The organisation_id a request's queries must be filtered to.

    `organisation_id is None` means unrestricted (owner only) — every other
    role is pinned to their own organisation. Callers must route any
    tenant-scoped query through `enforce()` (or use `organisation_id`
    directly when listing "my org's data") rather than trusting a
    caller-supplied org id, so cross-tenant access is rejected at the query
    layer instead of merely being hidden in the UI.
    """

    organisation_id: Optional[int]

    def enforce(self, target_organisation_id: int) -> int:
        if self.organisation_id is not None and self.organisation_id != target_organisation_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot access another organisation's data.",
            )
        return target_organisation_id


def get_org_scope(user: User = Depends(get_current_app_user)) -> OrgScope:
    if user.role == "owner":
        return OrgScope(organisation_id=None)
    return OrgScope(organisation_id=user.organisation_id)
