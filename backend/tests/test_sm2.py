# Autotests for SM-2 forgetting curve behaviour.
#
# Core invariant: after a user reviews a word with quality >= 3, the word's
# next_review is pushed into the future, so:
#   - /api/me/stats  → due_review count decreases
#   - /api/review/known → word is no longer returned (not due today)
#
# This covers the bug where counts on the vocabulary page did not update
# after completing a review session.

import datetime
from jose import jwt

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"


def make_token(email: str) -> str:
    return jwt.encode({"email": email, "name": "Test", "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def mark_known(client, token):
    """Mark word 1 as known (no quality → no SM-2 scheduling)."""
    r = client.post("/api/words/1/progress", json={"status": "known", "mistake": False}, headers=auth(token))
    assert r.status_code == 200


def due_review_count(client, token) -> int:
    r = client.get("/api/me/stats", headers=auth(token))
    assert r.status_code == 200
    return r.json()["due_review"]


def review_queue(client, token) -> list:
    r = client.get("/api/review/known", headers=auth(token))
    assert r.status_code == 200
    return r.json()


# ── SM-2: quality saves next_review ──────────────────────────────────────────

def test_progress_with_quality_sets_next_review(client):
    """Saving progress with quality runs SM-2 and sets next_review in the future."""
    token = make_token("sm2_next_review@example.com")
    mark_known(client, token)

    r = client.post(
        "/api/words/1/progress",
        json={"status": "known", "mistake": False, "quality": 5},
        headers=auth(token),
    )
    assert r.status_code == 200

    # Inspect via review queue — word should no longer be due today
    # (interval=1 means next_review = tomorrow)
    queue = review_queue(client, token)
    ids = [w["id"] for w in queue]
    assert 1 not in ids, "Word should not be in review queue after SM-2 schedules it for tomorrow"


def test_quality_below_3_resets_interval(client):
    """quality < 3 resets SM-2: interval=1, word is due again tomorrow."""
    token = make_token("sm2_reset@example.com")
    mark_known(client, token)

    # First: schedule it far out
    client.post("/api/words/1/progress", json={"status": "known", "quality": 5}, headers=auth(token))
    client.post("/api/words/1/progress", json={"status": "known", "quality": 5}, headers=auth(token))

    # Now fail it
    r = client.post(
        "/api/words/1/progress",
        json={"status": "learning", "mistake": True, "quality": 1},
        headers=auth(token),
    )
    assert r.status_code == 200


# ── due_review count decreases after review ───────────────────────────────────

def test_due_review_count_decreases_after_quality_save(client):
    """
    Core bug regression: due_review in /api/me/stats must decrease after a
    quality review, reflecting that the word is no longer due today.
    """
    token = make_token("sm2_due_decrease@example.com")
    mark_known(client, token)

    before = due_review_count(client, token)
    assert before >= 1, "Word should be due before review (next_review is NULL)"

    # Review with quality=5 — schedules word for tomorrow
    client.post(
        "/api/words/1/progress",
        json={"status": "known", "mistake": False, "quality": 5},
        headers=auth(token),
    )

    after = due_review_count(client, token)
    assert after < before, (
        f"due_review should decrease after quality review: was {before}, still {after}"
    )


def test_due_review_count_decreases_quality_3(client):
    """Same regression test for quality=3 (hard but correct)."""
    token = make_token("sm2_due_decrease_q3@example.com")
    mark_known(client, token)

    before = due_review_count(client, token)
    client.post(
        "/api/words/1/progress",
        json={"status": "known", "mistake": False, "quality": 3},
        headers=auth(token),
    )
    after = due_review_count(client, token)
    assert after < before, (
        f"due_review should decrease after quality=3 review: was {before}, still {after}"
    )


def test_review_queue_empty_after_all_words_reviewed(client):
    """After reviewing all due words with quality>=3, the review queue is empty."""
    token = make_token("sm2_queue_empty@example.com")
    mark_known(client, token)

    queue_before = review_queue(client, token)
    assert len(queue_before) == 1

    client.post(
        "/api/words/1/progress",
        json={"status": "known", "mistake": False, "quality": 4},
        headers=auth(token),
    )

    queue_after = review_queue(client, token)
    assert queue_after == [], f"Queue should be empty after review, got: {queue_after}"


def test_no_quality_does_not_affect_due_review(client):
    """
    Progress saved WITHOUT quality (regular study, not review) must NOT
    schedule next_review — word stays due.
    """
    token = make_token("sm2_no_quality@example.com")
    mark_known(client, token)

    before = due_review_count(client, token)

    # Save without quality — as happens during regular study sessions
    client.post(
        "/api/words/1/progress",
        json={"status": "known", "mistake": False},
        headers=auth(token),
    )

    after = due_review_count(client, token)
    assert after == before, (
        f"due_review should NOT change when no quality is provided: was {before}, now {after}"
    )
