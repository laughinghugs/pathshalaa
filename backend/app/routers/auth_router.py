from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.google_auth import InvalidGoogleToken, create_session_token, verify_google_id_token
from app.rbac.dependencies import get_current_app_user
from app.rbac.models import User
from app.schemas import GoogleLoginRequest, LoginResponse, MeResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/google", response_model=LoginResponse)
def google_login(payload: GoogleLoginRequest) -> LoginResponse:
    """Verifies a Google Sign-In ID token and returns an app session token.

    There's no separate signup step — the first successful sign-in for a
    Google account is effectively its signup.
    """
    try:
        user = verify_google_id_token(payload.id_token)
    except InvalidGoogleToken as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    token = create_session_token(user)
    return LoginResponse(token=token, name=user.name, email=user.email)


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_app_user)) -> MeResponse:
    """Role/organisation/trial info for the signed-in user.

    Resolves (and, on first call after sign-in, creates) the app-level User
    row via get_current_app_user — see app/billing/trial.py for the
    Demo-org / invite-matching logic behind that.
    """
    days_remaining = None
    if user.trial_expires_at:
        days_remaining = max((user.trial_expires_at - datetime.now(timezone.utc)).days, 0)

    return MeResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        organisation_id=user.organisation_id,
        trial_expires_at=user.trial_expires_at.isoformat() if user.trial_expires_at else None,
        trial_days_remaining=days_remaining,
    )
