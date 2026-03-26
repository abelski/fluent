# Autotests for program enrollment endpoints (subcategory-based).
# Uses the shared TestClient + in-memory SQLite from conftest.py.
# Requires conftest.py to seed a SubcategoryMeta row with key="test_program".

from jose import jwt

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"

PROGRAM_KEY = "test_program"
MISSING_KEY = "nonexistent_program_xyz"


def make_token(email: str) -> str:
    return jwt.encode(
        {"email": email, "name": "Test User", "picture": None},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── GET /api/me/programs ─────────────────────────────────────────────────────

def test_get_programs_requires_auth(client):
    r = client.get("/api/me/programs")
    assert r.status_code == 401


def test_get_programs_empty_initially(client):
    token = make_token("programs_empty@example.com")
    r = client.get("/api/me/programs", headers=auth_headers(token))
    assert r.status_code == 200
    assert r.json() == []


# ── POST /api/me/programs ────────────────────────────────────────────────────

def test_enroll_requires_auth(client):
    r = client.post("/api/me/programs", json={"subcategory": PROGRAM_KEY})
    assert r.status_code == 401


def test_enroll_program(client):
    token = make_token("programs_enroll@example.com")
    headers = auth_headers(token)
    r = client.post("/api/me/programs", json={"subcategory": PROGRAM_KEY}, headers=headers)
    assert r.status_code == 201

    enrolled = client.get("/api/me/programs", headers=headers).json()
    assert PROGRAM_KEY in enrolled


def test_enroll_duplicate_returns_400(client):
    token = make_token("programs_dup@example.com")
    headers = auth_headers(token)
    client.post("/api/me/programs", json={"subcategory": PROGRAM_KEY}, headers=headers)
    r = client.post("/api/me/programs", json={"subcategory": PROGRAM_KEY}, headers=headers)
    assert r.status_code == 400
    assert "enrolled" in r.json()["detail"].lower()


def test_enroll_nonexistent_subcategory_returns_error(client):
    token = make_token("programs_nosubcat@example.com")
    r = client.post(
        "/api/me/programs",
        json={"subcategory": MISSING_KEY},
        headers=auth_headers(token),
    )
    assert r.status_code in (400, 404)


# ── DELETE /api/me/programs/{subcategory} ────────────────────────────────────

def test_unenroll_requires_auth(client):
    r = client.delete(f"/api/me/programs/{PROGRAM_KEY}")
    assert r.status_code == 401


def test_unenroll_not_enrolled_returns_404(client):
    token = make_token("programs_unenroll_missing@example.com")
    r = client.delete(f"/api/me/programs/{PROGRAM_KEY}", headers=auth_headers(token))
    assert r.status_code == 404


def test_unenroll_program(client):
    token = make_token("programs_unenroll@example.com")
    headers = auth_headers(token)
    client.post("/api/me/programs", json={"subcategory": PROGRAM_KEY}, headers=headers)

    r = client.delete(f"/api/me/programs/{PROGRAM_KEY}", headers=headers)
    assert r.status_code == 200

    enrolled = client.get("/api/me/programs", headers=headers).json()
    assert PROGRAM_KEY not in enrolled
