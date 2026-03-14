# Autotests for review endpoints and mistake tracking.
# GET /api/review/known  — known words ordered oldest-first
# GET /api/review/mistakes — words with mistake_count > 0
# POST /api/words/{id}/progress with mistake=True increments mistake_count

from jose import jwt

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"


def make_token(email: str, name: str = "Test User") -> str:
    return jwt.encode(
        {"email": email, "name": name, "picture": None},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Auth guard ───────────────────────────────────────────────────────────────

def test_review_known_requires_auth(client):
    assert client.get("/api/review/known").status_code == 401


def test_review_mistakes_requires_auth(client):
    assert client.get("/api/review/mistakes").status_code == 401


# ── Progress — mistake flag ──────────────────────────────────────────────────

def test_progress_without_mistake_does_not_increment(client):
    token = make_token("review_no_mistake@example.com")
    headers = auth_headers(token)
    r = client.post("/api/words/1/progress", json={"status": "known", "mistake": False}, headers=headers)
    assert r.status_code == 200

    stats = client.get("/api/me/stats", headers=headers).json()
    assert stats["mistakes"] == 0


def test_progress_with_mistake_increments_count(client):
    token = make_token("review_with_mistake@example.com")
    headers = auth_headers(token)
    r = client.post("/api/words/1/progress", json={"status": "learning", "mistake": True}, headers=headers)
    assert r.status_code == 200

    stats = client.get("/api/me/stats", headers=headers).json()
    assert stats["mistakes"] >= 1


def test_progress_mistake_flag_is_optional(client):
    """Body without 'mistake' key should still be accepted (defaults to False)."""
    token = make_token("review_optional_mistake@example.com")
    r = client.post(
        "/api/words/1/progress",
        json={"status": "known"},
        headers=auth_headers(token),
    )
    assert r.status_code == 200


# ── review/known ─────────────────────────────────────────────────────────────

def test_review_known_returns_empty_when_no_known_words(client):
    token = make_token("review_known_empty@example.com")
    headers = auth_headers(token)
    # Exhaust quota check won't happen because... wait, quota IS applied.
    # We just call the endpoint with no known words yet.
    r = client.get("/api/review/known", headers=headers)
    # Quota is applied even on empty: 200 with empty list (first call within limit)
    assert r.status_code == 200
    assert r.json() == []


def test_review_known_returns_known_words(client):
    token = make_token("review_known_populated@example.com")
    headers = auth_headers(token)

    # Mark word as known
    client.post("/api/words/1/progress", json={"status": "known", "mistake": False}, headers=headers)

    # First session is within quota
    r = client.get("/api/review/known", headers=headers)
    assert r.status_code == 200
    words = r.json()
    assert len(words) == 1
    assert words[0]["id"] == 1
    assert words[0]["status"] == "known"
    assert "lithuanian" in words[0]
    assert "translation_ru" in words[0]


# ── review/mistakes ───────────────────────────────────────────────────────────

def test_review_mistakes_returns_empty_when_no_mistakes(client):
    token = make_token("review_mistakes_empty@example.com")
    headers = auth_headers(token)
    client.post("/api/words/1/progress", json={"status": "known", "mistake": False}, headers=headers)

    r = client.get("/api/review/mistakes", headers=headers)
    assert r.status_code == 200
    assert r.json() == []


def test_review_mistakes_returns_words_with_mistakes(client):
    token = make_token("review_mistakes_populated@example.com")
    headers = auth_headers(token)

    client.post("/api/words/1/progress", json={"status": "learning", "mistake": True}, headers=headers)

    r = client.get("/api/review/mistakes", headers=headers)
    assert r.status_code == 200
    words = r.json()
    assert len(words) == 1
    assert words[0]["id"] == 1
    assert "lithuanian" in words[0]


# ── Quota enforcement ─────────────────────────────────────────────────────────

def test_review_known_counts_against_daily_quota(client):
    token = make_token("review_quota_known@example.com")
    headers = auth_headers(token)

    # Mark word as known (no quota impact)
    client.post("/api/words/1/progress", json={"status": "known", "mistake": False}, headers=headers)

    # Exhaust remaining quota via study sessions
    quota = client.get("/api/me/quota", headers=headers).json()
    for _ in range(10 - quota["sessions_today"]):
        client.get("/api/lists/1/study", headers=headers)

    # Review should now be blocked
    r = client.get("/api/review/known", headers=headers)
    assert r.status_code == 429
    assert r.json()["detail"]["code"] == "daily_limit_reached"


def test_review_mistakes_counts_against_daily_quota(client):
    token = make_token("review_quota_mistakes@example.com")
    headers = auth_headers(token)

    client.post("/api/words/1/progress", json={"status": "learning", "mistake": True}, headers=headers)

    quota = client.get("/api/me/quota", headers=headers).json()
    for _ in range(10 - quota["sessions_today"]):
        client.get("/api/lists/1/study", headers=headers)

    r = client.get("/api/review/mistakes", headers=headers)
    assert r.status_code == 429
    assert r.json()["detail"]["code"] == "daily_limit_reached"


# ── clear_mistake resets count ───────────────────────────────────────────────

def test_clear_mistake_resets_count(client):
    token = make_token("clear_mistake@example.com")
    headers = auth_headers(token)

    # Record a mistake
    client.post("/api/words/1/progress", json={"status": "learning", "mistake": True}, headers=headers)
    assert client.get("/api/me/stats", headers=headers).json()["mistakes"] >= 1

    # Answer correctly with clear_mistake=True → count resets to 0
    client.post("/api/words/1/progress", json={"status": "known", "mistake": False, "clear_mistake": True}, headers=headers)
    assert client.get("/api/me/stats", headers=headers).json()["mistakes"] == 0


# ── Stats include mistakes count ─────────────────────────────────────────────

def test_stats_includes_mistakes_field(client):
    token = make_token("stats_with_mistakes@example.com")
    headers = auth_headers(token)

    r = client.get("/api/me/stats", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "mistakes" in data
    assert isinstance(data["mistakes"], int)
