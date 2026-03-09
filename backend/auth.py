import os
from datetime import datetime, timedelta
from urllib.parse import urlencode
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import RedirectResponse
from jose import jwt, JWTError

router = APIRouter()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_DAYS = 30


def create_jwt(email: str, name: str, picture: Optional[str]) -> str:
    payload = {
        "email": email,
        "name": name,
        "picture": picture,
        "exp": datetime.utcnow() + timedelta(days=JWT_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


@router.get("/google")
def google_login():
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
async def google_callback(code: str):
    async with httpx.AsyncClient() as client:
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

        user_resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
        google_user = user_resp.json()

    token = create_jwt(
        email=google_user["email"],
        name=google_user.get("name", ""),
        picture=google_user.get("picture"),
    )
    return RedirectResponse(f"{FRONTEND_URL}/en/dashboard?token={token}")


@router.get("/me")
def get_me(authorization: Optional[str] = Header(None)):
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
