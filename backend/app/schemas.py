from typing import Any, Optional

from pydantic import BaseModel


class GoogleLoginRequest(BaseModel):
    id_token: str


class LoginResponse(BaseModel):
    token: str
    name: str
    email: str


class RecognizeResponse(BaseModel):
    # Already-validated AICommand dicts (see app/commands.py) — plain dicts
    # here rather than the AICommand union itself, since they're validated
    # and dumped upstream in recognize_router.py.
    commands: list[dict[str, Any]]


class GraphRequest(BaseModel):
    latex: str


class SolveRequest(BaseModel):
    latex: str
    # Only meaningful for periodic (trig) equations — ignored otherwise.
    # Both must be given together. A plain number ("6.283") or a LaTeX
    # expression ("\\pi", "2\\pi") — see solving.py's _parse_range_bound.
    range_min: Optional[str] = None
    range_max: Optional[str] = None
    range_min_inclusive: bool = True
    range_max_inclusive: bool = True


class SolveResponse(BaseModel):
    steps: list[str]
    is_differential: bool
    classification: str
    final_answer: str
    domain_note: Optional[str] = None


class CalibrationStatusResponse(BaseModel):
    sample_count: int


class CalibrationSampleResponse(BaseModel):
    id: int


class TeacherUsageItem(BaseModel):
    id: int
    email: str
    role: str
    created_at: str
    usage_event_count: int
    # Only populated for an owner looking at the Demo organisation.
    trial_expires_at: Optional[str] = None
    days_remaining: Optional[int] = None
    data_deleted: Optional[bool] = None


class PendingInviteItem(BaseModel):
    id: int
    email: str
    role: str
    created_at: str


class OrgUsageResponse(BaseModel):
    organisation_id: int
    organisation_name: str
    subscription_tier: str
    is_demo: bool
    seats_allowed: Optional[int]
    seats_used: int
    teachers: list[TeacherUsageItem]
    pending_invites: list[PendingInviteItem]


class InviteCreateRequest(BaseModel):
    email: str
    role: str = "user"
    # Required when the caller is an owner (who has no organisation of
    # their own); ignored for an admin, who can only invite into their own org.
    organisation_id: Optional[int] = None


class InviteResponse(BaseModel):
    id: int
    email: str
    organisation_id: int
    role: str
    created_at: str


class UpgradeUserRequest(BaseModel):
    user_id: int
    target_organisation_id: int


class UserSummary(BaseModel):
    id: int
    email: str
    role: str
    organisation_id: Optional[int]
    trial_expires_at: Optional[str]


class UserListItem(BaseModel):
    id: int
    email: str
    role: str
    organisation_id: Optional[int]
    organisation_name: Optional[str]
    trial_expires_at: Optional[str]
    days_remaining: Optional[int]
    data_deleted: bool
    usage_event_count: int
    created_at: str


class OrganisationItem(BaseModel):
    id: int
    name: str
    subscription_tier: str
    seats_allowed: Optional[int]
    is_demo: bool
    trial_days: Optional[int]
    created_at: str
    user_count: int


class CreateOrganisationRequest(BaseModel):
    name: str
    subscription_tier: str = "standard"
    seats_allowed: Optional[int] = None
    is_demo: bool = False
    trial_days: Optional[int] = None


class InviteListItem(BaseModel):
    id: int
    email: str
    role: str
    organisation_id: int
    organisation_name: str
    created_at: str


class ChangeRoleRequest(BaseModel):
    user_id: int
    role: str


class MeResponse(BaseModel):
    id: int
    email: str
    role: str
    organisation_id: Optional[int]
    trial_expires_at: Optional[str]
    trial_days_remaining: Optional[int]
