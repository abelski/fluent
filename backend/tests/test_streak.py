# Regression test for issue #141: studying phrases via a personal phrase list
# (UserCustomPhraseProgress) silently didn't count toward the daily streak or
# the 28-day activity calendar, because /me/stats and /me/activity-calendar
# only ever queried the older, admin-program UserPhraseProgress table.
# See temp_files/triage/implemented/IMPLEMENTED-issue-141-phrases-not-counted-streak.md

from datetime import date

from jose import jwt

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"


def make_token(email: str, name: str = "Test User") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _create_list_with_phrase(client, token) -> int:
    lid = client.post("/api/me/phrase-lists", json={"title": "Streak test", "difficulty": 1}, headers=auth(token)).json()["id"]
    client.post(f"/api/me/phrase-lists/{lid}/phrases", json={"text": "Labas", "translation": "Привет"}, headers=auth(token))
    return lid


def _make_premium(client, email: str) -> None:
    from sqlmodel import Session, select
    import database
    from models import User
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))
    with Session(database.engine) as s:
        user = s.exec(select(User).where(User.email == email)).first()
        user.is_premium = True
        user.premium_until = None
        s.add(user)
        s.commit()


def test_custom_phrase_progress_counts_toward_streak(client):
    email = "streak_custom_phrase@example.com"
    _make_premium(client, email)
    token = make_token(email)

    lid = _create_list_with_phrase(client, token)
    study = client.get(f"/api/me/phrase-lists/{lid}/study", headers=auth(token)).json()
    pid = study["phrases"][0]["id"]

    # Before studying, today shouldn't be in the streak yet
    stats_before = client.get("/api/me/stats", headers=auth(token)).json()
    assert stats_before["streak"] == 0

    r = client.post(f"/api/me/phrase-lists/phrases/{pid}/progress",
                    json={"quality": 5, "stage_completed": 0}, headers=auth(token))
    assert r.status_code == 200

    stats_after = client.get("/api/me/stats", headers=auth(token)).json()
    assert stats_after["streak"] >= 1


def test_custom_phrase_progress_appears_in_activity_calendar(client):
    email = "calendar_custom_phrase@example.com"
    _make_premium(client, email)
    token = make_token(email)

    lid = _create_list_with_phrase(client, token)
    study = client.get(f"/api/me/phrase-lists/{lid}/study", headers=auth(token)).json()
    pid = study["phrases"][0]["id"]

    client.post(f"/api/me/phrase-lists/phrases/{pid}/progress",
                json={"quality": 5, "stage_completed": 0}, headers=auth(token))

    calendar = client.get("/api/me/activity-calendar", headers=auth(token)).json()
    today = date.today().isoformat()
    assert today in calendar["dates"]
