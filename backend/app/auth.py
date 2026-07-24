from fastapi import Header, HTTPException, status

from app.google_auth import GoogleUser, InvalidSession, decode_session_token


def get_current_user(authorization: str = Header(default="")) -> GoogleUser:
    """Resolves the signed-in teacher from the app session token.

    The token is issued by POST /api/auth/google after verifying a Google
    Sign-In credential — see app/google_auth.py.
    """
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing credentials")

    try:
        return decode_session_token(token)
    except InvalidSession as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        ) from exc
