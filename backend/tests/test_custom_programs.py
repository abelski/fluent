# Autotests for community (custom) program CRUD and enrollment behaviour.

from jose import jwt

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"

SUPERADMIN_EMAIL = "artyrbelski@gmail.com"


def make_token(email: str, name: str = "Test User") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _ensure_redactor(client, token: str) -> str:
    """Create the user and grant redactor role via superadmin. Returns user_id."""
    client.get("/api/me/quota", headers=auth(token))
    superadmin_token = make_token(SUPERADMIN_EMAIL, name="Artur")
    users = client.get("/api/admin/users", headers=auth(superadmin_token)).json()
    email = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])["email"]
    user_id = next(u["id"] for u in users if u["email"] == email)
    client.patch(f"/api/admin/users/{user_id}/set-redactor", json={"is_redactor": True}, headers=auth(superadmin_token))
    return user_id


SAMPLE_WORD_SETS = [
    {
        "title": "Приветствия",
        "words": [
            {"front": "labas", "back_ru": "привет", "back_en": "hello"},
            {"front": "ačiū", "back_ru": "спасибо", "back_en": "thank you"},
        ],
    }
]


# ── Create ────────────────────────────────────────────────────────────────────

def test_create_program_requires_redactor(client):
    token = make_token("plain_user_cp@example.com")
    client.get("/api/me/quota", headers=auth(token))
    r = client.post("/api/me/custom-programs", json={
        "title": "Test", "lang_ru": True, "lang_en": False, "word_sets": SAMPLE_WORD_SETS,
    }, headers=auth(token))
    assert r.status_code == 403


def test_create_program_success(client):
    token = make_token("redactor_create@example.com")
    _ensure_redactor(client, token)
    r = client.post("/api/me/custom-programs", json={
        "title": "My Program",
        "description": "A test program",
        "lang_ru": True,
        "lang_en": False,
        "word_sets": SAMPLE_WORD_SETS,
    }, headers=auth(token))
    assert r.status_code == 201
    data = r.json()
    assert data["title"] == "My Program"
    assert data["word_count"] == 2
    assert data["is_published"] is True


def test_create_program_requires_word_sets(client):
    token = make_token("redactor_nowords@example.com")
    _ensure_redactor(client, token)
    r = client.post("/api/me/custom-programs", json={
        "title": "Empty", "lang_ru": True, "lang_en": False, "word_sets": [],
    }, headers=auth(token))
    assert r.status_code == 422


# ── Auto-enroll creator ───────────────────────────────────────────────────────

def test_creator_is_auto_enrolled(client):
    token = make_token("redactor_autoenroll@example.com")
    _ensure_redactor(client, token)
    r = client.post("/api/me/custom-programs", json={
        "title": "Auto Enroll Test",
        "lang_ru": True,
        "lang_en": False,
        "word_sets": SAMPLE_WORD_SETS,
    }, headers=auth(token))
    assert r.status_code == 201
    program_id = r.json()["id"]

    enrollments = client.get("/api/me/custom-program-enrollments", headers=auth(token)).json()
    assert any(e["id"] == program_id for e in enrollments), \
        "Creator should be automatically enrolled in their own program"


def test_creator_program_appears_in_enrollments(client):
    """Enrollment response includes list_ids so the lists page can show word sets."""
    token = make_token("redactor_lists@example.com")
    _ensure_redactor(client, token)
    r = client.post("/api/me/custom-programs", json={
        "title": "Lists Page Test",
        "lang_ru": True,
        "lang_en": False,
        "word_sets": SAMPLE_WORD_SETS,
    }, headers=auth(token))
    assert r.status_code == 201
    program_id = r.json()["id"]

    enrollments = client.get("/api/me/custom-program-enrollments", headers=auth(token)).json()
    match = next((e for e in enrollments if e["id"] == program_id), None)
    assert match is not None
    assert len(match["list_ids"]) == 1


# ── Delete ────────────────────────────────────────────────────────────────────

def test_delete_own_program(client):
    token = make_token("redactor_delete@example.com")
    _ensure_redactor(client, token)
    r = client.post("/api/me/custom-programs", json={
        "title": "To Delete",
        "lang_ru": True,
        "lang_en": False,
        "word_sets": SAMPLE_WORD_SETS,
    }, headers=auth(token))
    assert r.status_code == 201
    program_id = r.json()["id"]

    r = client.delete(f"/api/me/custom-programs/{program_id}", headers=auth(token))
    assert r.status_code == 204

    # Should no longer appear in community list
    community = client.get("/api/programs/community", headers=auth(token)).json()
    assert not any(p["id"] == program_id for p in community)


def test_delete_cleans_up_enrollments(client):
    """Deleting a program removes the creator's enrollment too."""
    token = make_token("redactor_cleanup@example.com")
    _ensure_redactor(client, token)
    r = client.post("/api/me/custom-programs", json={
        "title": "Cleanup Test",
        "lang_ru": True,
        "lang_en": False,
        "word_sets": SAMPLE_WORD_SETS,
    }, headers=auth(token))
    program_id = r.json()["id"]

    client.delete(f"/api/me/custom-programs/{program_id}", headers=auth(token))

    enrollments = client.get("/api/me/custom-program-enrollments", headers=auth(token)).json()
    assert not any(e["id"] == program_id for e in enrollments)


def test_delete_other_user_program_forbidden(client):
    token_a = make_token("redactor_a@example.com")
    token_b = make_token("redactor_b@example.com")
    _ensure_redactor(client, token_a)
    _ensure_redactor(client, token_b)

    r = client.post("/api/me/custom-programs", json={
        "title": "A's Program",
        "lang_ru": True,
        "lang_en": False,
        "word_sets": SAMPLE_WORD_SETS,
    }, headers=auth(token_a))
    program_id = r.json()["id"]

    r = client.delete(f"/api/me/custom-programs/{program_id}", headers=auth(token_b))
    assert r.status_code == 403


def test_word_lists_endpoint_includes_custom_program_lists(client):
    """GET /api/lists must include the private word lists from enrolled custom programs."""
    token = make_token("redactor_lists_api@example.com")
    _ensure_redactor(client, token)
    client.post("/api/me/custom-programs", json={
        "title": "Lists API Test",
        "lang_ru": True,
        "lang_en": False,
        "word_sets": SAMPLE_WORD_SETS,
    }, headers=auth(token))

    lists = client.get("/api/lists", headers=auth(token)).json()
    list_titles = [l["title"] for l in lists]
    assert "Приветствия" in list_titles, "Custom program word set should appear in /api/lists"


def test_lists_progress_includes_custom_program_lists(client):
    """GET /api/me/lists-progress must return progress for custom program word lists."""
    token = make_token("redactor_progress@example.com")
    _ensure_redactor(client, token)
    r = client.post("/api/me/custom-programs", json={
        "title": "Progress Test",
        "lang_ru": True,
        "lang_en": False,
        "word_sets": SAMPLE_WORD_SETS,
    }, headers=auth(token))
    assert r.status_code == 201
    list_ids = r.json()["list_ids"]
    assert len(list_ids) == 1
    wl_id = list_ids[0]

    progress = client.get("/api/me/lists-progress", headers=auth(token)).json()
    assert str(wl_id) in progress or wl_id in progress, \
        "Custom program word list must appear in lists-progress"


def test_superadmin_can_delete_any_program(client):
    token_a = make_token("redactor_victim@example.com")
    _ensure_redactor(client, token_a)

    r = client.post("/api/me/custom-programs", json={
        "title": "Victim Program",
        "lang_ru": True,
        "lang_en": False,
        "word_sets": SAMPLE_WORD_SETS,
    }, headers=auth(token_a))
    program_id = r.json()["id"]

    superadmin_token = make_token(SUPERADMIN_EMAIL, name="Artur")
    r = client.delete(f"/api/me/custom-programs/{program_id}", headers=auth(superadmin_token))
    assert r.status_code == 204
