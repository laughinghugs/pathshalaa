"""Google Sign-In verification and app-level session tokens.

Flow: the frontend obtains a Google ID token via Google Identity Services,
POSTs it to /api/auth/google. We verify it against Google (proving the user
really owns that Google account — this doubles as signup, since there's no
separate registration step) and mint our own signed, expiring session token
so later requests don't need to re-verify against Google every time.

The Google account's stable `sub` claim is used as the teacher's identity
throughout the app (e.g. to scope handwriting calibration samples) — no
separate teacher_id concept needed.
"""

from __future__ import annotations

from dataclasses import dataclass

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.config import get_settings

SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60  # 7 days
SESSION_SALT = "pathshalaa-session"


@dataclass
class GoogleUser:
    sub: str
    email: str
    name: str


class InvalidGoogleToken(Exception):
    """Raised when a Google ID token fails verification."""


class InvalidSession(Exception):
    """Raised when an app session token is missing, tampered with, or expired."""


def verify_google_id_token(token: str) -> GoogleUser:
    settings = get_settings()
    if not settings.google_client_id:
        raise InvalidGoogleToken("GOOGLE_CLIENT_ID is not configured on the server")

    try:
        claims = google_id_token.verify_oauth2_token(
            token, google_requests.Request(), settings.google_client_id
        )
    except ValueError as exc:
        raise InvalidGoogleToken(str(exc)) from exc

    if settings.google_allowed_domain and claims.get("hd") != settings.google_allowed_domain:
        raise InvalidGoogleToken("This Google account's domain is not permitted")

    return GoogleUser(
        sub=claims["sub"],
        email=claims.get("email", ""),
        name=claims.get("name") or claims.get("email", ""),
    )


def _serializer() -> URLSafeTimedSerializer:
    settings = get_settings()
    return URLSafeTimedSerializer(settings.secret_key, salt=SESSION_SALT)


def create_session_token(user: GoogleUser) -> str:
    return _serializer().dumps({"sub": user.sub, "email": user.email, "name": user.name})


def decode_session_token(token: str) -> GoogleUser:
    try:
        payload = _serializer().loads(token, max_age=SESSION_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired) as exc:
        raise InvalidSession(str(exc)) from exc

    return GoogleUser(sub=payload["sub"], email=payload["email"], name=payload["name"])
