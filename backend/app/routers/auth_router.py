from fastapi import APIRouter, HTTPException, status

from app.google_auth import InvalidGoogleToken, create_session_token, verify_google_id_token
from app.schemas import GoogleLoginRequest, LoginResponse

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
