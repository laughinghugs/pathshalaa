"""Admin-facing org usage/invite management, and the owner-only upgrade path.

Every route here reads or writes organisation-scoped data, so every route
takes the OrgScope dependency and runs the target organisation id through
`scope.enforce(...)` before touching the database — an admin cannot see or
modify another organisation's users/invites by passing a different id, and
only "owner" (unrestricted scope) can act across organisations.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status

from app.billing.trial import upgrade_user
from app.rbac import models
from app.rbac.dependencies import OrgScope, get_org_scope, require_permission
from app.rbac.models import OWNER, VALID_ROLES, User
from app.schemas import (
    ChangeRoleRequest,
    CreateOrganisationRequest,
    InviteCreateRequest,
    InviteListItem,
    InviteResponse,
    OrganisationItem,
    OrgUsageResponse,
    PendingInviteItem,
    TeacherUsageItem,
    UpgradeUserRequest,
    UserListItem,
    UserSummary,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _resolve_target_org_id(
    requested_organisation_id: Optional[int], user: User, scope: OrgScope
) -> int:
    """Owners must say which org they mean; everyone else is pinned to their own."""
    if requested_organisation_id is None:
        if user.role == OWNER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="organisation_id is required for the owner role",
            )
        if user.organisation_id is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="You don't belong to an organisation")
        return user.organisation_id
    return scope.enforce(requested_organisation_id)


@router.get("/org", response_model=OrgUsageResponse)
def get_org_usage(
    organisation_id: Optional[int] = None,
    user: User = Depends(require_permission("view_org_usage")),
    scope: OrgScope = Depends(get_org_scope),
) -> OrgUsageResponse:
    target_org_id = _resolve_target_org_id(organisation_id, user, scope)
    org = models.get_organisation(target_org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Organisation not found")

    show_trial_detail = org.is_demo and user.role == OWNER
    now = datetime.now(timezone.utc)

    teachers = []
    for member in models.list_users_by_organisation(target_org_id):
        days_remaining = None
        trial_expires_at = None
        data_deleted = None
        if show_trial_detail:
            data_deleted = member.data_deleted
            if member.trial_expires_at:
                trial_expires_at = member.trial_expires_at.isoformat()
                days_remaining = max((member.trial_expires_at - now).days, 0)
        teachers.append(
            TeacherUsageItem(
                id=member.id,
                email=member.email,
                role=member.role,
                created_at=member.created_at,
                usage_event_count=models.count_usage_events(member.id),
                trial_expires_at=trial_expires_at,
                days_remaining=days_remaining,
                data_deleted=data_deleted,
            )
        )

    pending_invites = [
        PendingInviteItem(id=invite.id, email=invite.email, role=invite.role, created_at=invite.created_at)
        for invite in models.list_pending_invites_by_organisation(target_org_id)
    ]

    return OrgUsageResponse(
        organisation_id=org.id,
        organisation_name=org.name,
        subscription_tier=org.subscription_tier,
        is_demo=org.is_demo,
        seats_allowed=org.seats_allowed,
        seats_used=models.count_active_users_in_organisation(target_org_id),
        teachers=teachers,
        pending_invites=pending_invites,
    )


@router.post("/invites", response_model=InviteResponse, status_code=status.HTTP_201_CREATED)
def create_invite(
    payload: InviteCreateRequest,
    user: User = Depends(require_permission("manage_org_users")),
    scope: OrgScope = Depends(get_org_scope),
) -> InviteResponse:
    target_org_id = _resolve_target_org_id(payload.organisation_id, user, scope)
    org = models.get_organisation(target_org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Organisation not found")

    if org.seats_allowed is not None:
        seats_in_use = models.count_active_users_in_organisation(target_org_id) + models.count_pending_invites(
            target_org_id
        )
        if seats_in_use >= org.seats_allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Seat limit reached for this organisation")

    invite = models.create_invite(payload.email, target_org_id, payload.role)
    return InviteResponse(
        id=invite.id, email=invite.email, organisation_id=invite.organisation_id, role=invite.role,
        created_at=invite.created_at,
    )


@router.delete("/invites/{invite_id}")
def remove_invite(
    invite_id: int,
    user: User = Depends(require_permission("manage_org_users")),
    scope: OrgScope = Depends(get_org_scope),
) -> dict:
    invite = models.get_invite_by_id(invite_id)
    if invite is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if invite.used_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invite has already been used")

    scope.enforce(invite.organisation_id)
    models.delete_invite(invite_id)
    return {"deleted": True}


@router.post("/upgrade-user", response_model=UserSummary)
def upgrade_user_endpoint(
    payload: UpgradeUserRequest,
    _user: User = Depends(require_permission("upgrade_user")),
) -> UserSummary:
    """Owner-only. `require_permission("upgrade_user")` restricts this to
    "owner" as a side effect of the permissions map: it's the only role
    whose permission list contains the "*" wildcard.
    """
    try:
        updated = upgrade_user(payload.user_id, payload.target_organisation_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    return UserSummary(
        id=updated.id,
        email=updated.email,
        role=updated.role,
        organisation_id=updated.organisation_id,
        trial_expires_at=updated.trial_expires_at.isoformat() if updated.trial_expires_at else None,
    )


# ---- Owner-only: everyone who's used the app, across all organisations ----
#
# These routes ("manage_all_users") are deliberately unscoped by OrgScope —
# unlike everything above, they're meant to see/change across organisations,
# which the permissions map already restricts to "owner" (the only role
# holding the "*" wildcard) the same way "upgrade_user" does.


@router.get("/users", response_model=list[UserListItem])
def list_all_users(_user: User = Depends(require_permission("manage_all_users"))) -> list[UserListItem]:
    orgs_by_id = {org.id: org for org in models.list_all_organisations()}
    now = datetime.now(timezone.utc)

    items = []
    for member in models.list_all_users():
        org = orgs_by_id.get(member.organisation_id)
        days_remaining = None
        if member.trial_expires_at:
            days_remaining = max((member.trial_expires_at - now).days, 0)
        items.append(
            UserListItem(
                id=member.id,
                email=member.email,
                role=member.role,
                organisation_id=member.organisation_id,
                organisation_name=org.name if org else None,
                trial_expires_at=member.trial_expires_at.isoformat() if member.trial_expires_at else None,
                days_remaining=days_remaining,
                data_deleted=member.data_deleted,
                usage_event_count=models.count_usage_events(member.id),
                created_at=member.created_at,
            )
        )
    return items


@router.get("/invites", response_model=list[InviteListItem])
def list_all_invites(_user: User = Depends(require_permission("manage_all_users"))) -> list[InviteListItem]:
    orgs_by_id = {org.id: org for org in models.list_all_organisations()}
    items = []
    for invite in models.list_all_pending_invites():
        org = orgs_by_id.get(invite.organisation_id)
        items.append(
            InviteListItem(
                id=invite.id,
                email=invite.email,
                role=invite.role,
                organisation_id=invite.organisation_id,
                organisation_name=org.name if org else "(deleted organisation)",
                created_at=invite.created_at,
            )
        )
    return items


@router.get("/organisations", response_model=list[OrganisationItem])
def list_all_organisations(_user: User = Depends(require_permission("manage_all_users"))) -> list[OrganisationItem]:
    return [
        OrganisationItem(
            id=org.id,
            name=org.name,
            subscription_tier=org.subscription_tier,
            seats_allowed=org.seats_allowed,
            is_demo=org.is_demo,
            trial_days=org.trial_days,
            created_at=org.created_at,
            user_count=len(models.list_users_by_organisation(org.id)),
        )
        for org in models.list_all_organisations()
    ]


@router.post("/organisations", response_model=OrganisationItem, status_code=status.HTTP_201_CREATED)
def create_organisation(
    payload: CreateOrganisationRequest,
    _user: User = Depends(require_permission("manage_all_users")),
) -> OrganisationItem:
    org = models.create_organisation(
        name=payload.name,
        subscription_tier=payload.subscription_tier,
        seats_allowed=payload.seats_allowed,
        is_demo=payload.is_demo,
        trial_days=payload.trial_days,
    )
    return OrganisationItem(
        id=org.id,
        name=org.name,
        subscription_tier=org.subscription_tier,
        seats_allowed=org.seats_allowed,
        is_demo=org.is_demo,
        trial_days=org.trial_days,
        created_at=org.created_at,
        user_count=0,
    )


@router.post("/change-role", response_model=UserSummary)
def change_role(
    payload: ChangeRoleRequest,
    _user: User = Depends(require_permission("manage_all_users")),
) -> UserSummary:
    if payload.role not in VALID_ROLES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail=f"role must be one of {sorted(VALID_ROLES)}"
        )
    if models.get_user_by_id(payload.user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    updated = models.set_user_role(payload.user_id, payload.role)
    return UserSummary(
        id=updated.id,
        email=updated.email,
        role=updated.role,
        organisation_id=updated.organisation_id,
        trial_expires_at=updated.trial_expires_at.isoformat() if updated.trial_expires_at else None,
    )
