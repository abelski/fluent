# JWT utilities and OAuth credential configuration.
# These are pure helpers with no FastAPI router — the router lives in routers/auth.py.

import os
from datetime import datetime, timedelta
from typing import Optional

from jose import jwt

# OAuth credentials come from environment variables so they differ between
# local dev and production without code changes.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 30  # Token stays valid for 30 days before the user must re-login


def create_jwt(email: str, name: str, picture: Optional[str]) -> str:
    """Encode user identity into a signed JWT that the frontend stores in localStorage."""
    payload = {
        "email": email,
        "name": name,
        "picture": picture,
        "exp": datetime.utcnow() + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
