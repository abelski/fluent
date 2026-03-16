# Google OAuth 2.0 authentication flow and JWT issuance.
#
# Flow:
#   1. Browser visits GET /api/auth/google  → redirected to Google consent screen
#   2. Google calls GET /api/auth/callback?code=...  → exchange code for tokens,
#      fetch user profile, upsert DB row, issue our own JWT
#   3. Browser is redirected to /dashboard?token=<jwt>  → frontend stores token
#      in localStorage and uses it for all subsequent API calls

import os
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import RedirectResponse
from jose import jwt, JWTError
from sqlmodel import Session, select

from database import get_session
from models import User

router = APIRouter()


def try_get_user(authorization: str | None, session: Session) -> User | None:
    """Like require_user but returns None instead of raising on missing/invalid token.

    Used by endpoints where auth is optional (e.g. study session for anonymous users).
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        email = payload.get("email")
        if not email:
            return None
    except JWTError:
        return None
    return session.exec(select(User).where(User.email == email)).first()


def require_user(authorization: str | None, session: Session) -> User:
    """Validate the Authorization header, decode JWT, and return the User.

    Auto-creates the DB row on first use so tokens issued before the user
    record existed (edge case during re-deployments) still work.
    Raises HTTP 401 if the token is missing or invalid.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        email = payload["email"]
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = session.exec(select(User).where(User.email == email)).first()
    if not user:
        user = User(
            email=email,
            name=payload.get("name", email),
            picture=payload.get("picture"),
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    return user

# OAuth credentials and redirect URI come from environment variables so they
# can differ between local dev and production without code changes.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
_jwt_secret = os.getenv("JWT_SECRET")
if not _jwt_secret:
    if os.getenv("APP_ENV") == "production":
        raise RuntimeError("JWT_SECRET must be set in production (APP_ENV=production)")
    _jwt_secret = "change-me-in-development"
JWT_SECRET = _jwt_secret
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 30  # Token stays valid for 30 days before the user must re-login


def create_jwt(email: str, name: str, picture: Optional[str]) -> str:
    """Encode user identity into a signed JWT that the frontend stores in localStorage."""
    payload = {
        "email": email,
        "name": name,
        "picture": picture,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


@router.get("/google")
def google_login():
    """Redirect the browser to Google's OAuth consent screen."""
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
    }
    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return RedirectResponse(url)


@router.get("/callback")
async def google_callback(code: str, session: Session = Depends(get_session)):
    """Handle the OAuth callback from Google.

    Exchanges the authorization code for an access token, fetches the user's
    Google profile, upserts their DB record, then redirects to the frontend
    dashboard with our own JWT appended as a query parameter.
    """
    async with httpx.AsyncClient() as client:
        # Step 1: exchange the one-time code for a Google access token
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )
        token_data = token_resp.json()

        if "access_token" not in token_data:
            raise HTTPException(status_code=400, detail="Failed to get access token")

        # Step 2: use the access token to fetch the user's Google profile
        user_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        google_user = user_resp.json()

    email = google_user["email"]
    name = google_user.get("name", "")
    picture = google_user.get("picture")

    # Upsert user record so _require_user can find them.
    # Update name/picture in case the user changed their Google profile.
    user = session.exec(select(User).where(User.email == email)).first()
    if user:
        user.name = name
        user.picture = picture
    else:
        user = User(email=email, name=name, picture=picture)
        session.add(user)
    session.commit()

    # Issue our own JWT and pass it to the frontend via query param.
    # The frontend (api.ts) picks it up on load and stores it in localStorage.
    token = create_jwt(email=email, name=name, picture=picture)
    return RedirectResponse(f"{FRONTEND_URL}/dashboard?token={token}")


@router.get("/me")
def get_me(authorization: Optional[str] = Header(None)):
    """Return the current user's profile decoded from their JWT.

    Used by the frontend to display the user's name and avatar without
    making a separate DB query.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")

    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return {
            "email": payload["email"],
            "name": payload["name"],
            "picture": payload.get("picture"),
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
