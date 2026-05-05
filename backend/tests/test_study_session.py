# Autotests for list study session word ordering.
#
# Key invariant: known words that are due for review (next_review IS NULL or <= today)
# must appear before not-due known words in the study session response.
# This ensures that studying a list actually counts toward the "слов нужно освежить" metric.

from jose import jwt

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"


def make_token(email: str) -> str:
    return jwt.encode({"email": email, "name": "Test", "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def post_progress(client, token, word_id: int, status: str, quality: int | None = None):
    body: dict = {"status": status, "mistake": False}
    if quality is not None:
        body["quality"] = quality
    r = client.post(f"/api/words/{word_id}/progress", json=body, headers=auth(token))
    assert r.status_code == 200


def get_study_words(client, token) -> list:
    r = client.get("/api/lists/1/study?star_level=3", headers=auth(token))
    assert r.status_code == 200
    return r.json()["words"]


# ── Ordering: due known words appear before not-due known words ───────────────

def test_due_known_words_appear_before_not_due(client):
    """
    When the list contains:
      - word 2: known, no next_review (NULL = always due)
      - word 3: known, scheduled far in future (not due today)
    Word 2 should appear in the study session and before word 3.
    """
    token = make_token("study_ordering@example.com")

    # Word 2: mark known WITHOUT quality → next_review stays NULL (always due)
    post_progress(client, token, word_id=2, status="known")

    # Word 3: mark known WITH quality=5 twice → interval grows, next_review = future
    post_progress(client, token, word_id=3, status="known", quality=5)
    post_progress(client, token, word_id=3, status="known", quality=5)

    words = get_study_words(client, token)
    ids = [w["id"] for w in words]

    assert 2 in ids, "Due known word (word 2, next_review NULL) must appear in study session"
    assert 3 in ids, "Not-due known word (word 3, next_review future) must appear in study session"

    # Due word must come before not-due word
    idx_due = ids.index(2)
    idx_not_due = ids.index(3)
    assert idx_due < idx_not_due, (
        f"Due known word (id=2) should appear before not-due known word (id=3), "
        f"but positions were {idx_due} and {idx_not_due}"
    )


def test_new_words_appear_before_review_words(client):
    """New words (status='new') must appear before known/learning words in the session."""
    token = make_token("study_new_before_review@example.com")

    # Mark word 1 as known (due — no quality)
    post_progress(client, token, word_id=1, status="known")
    # Word 2 stays new for this user

    words = get_study_words(client, token)
    ids = [w["id"] for w in words]
    statuses = {w["id"]: w["status"] for w in words}

    # All new words should precede all review (known/learning) words
    new_positions = [i for i, w in enumerate(words) if w["status"] == "new"]
    review_positions = [i for i, w in enumerate(words) if w["status"] in ("known", "learning")]

    if new_positions and review_positions:
        assert max(new_positions) < min(review_positions), (
            f"New words at positions {new_positions} should all come before "
            f"review words at positions {review_positions}. Word ids: {ids}, statuses: {statuses}"
        )
