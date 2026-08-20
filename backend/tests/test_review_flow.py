# Autotests for feature #5 — review flow rework (backend half).
#
# Two server-side decisions are covered here, because both are business logic the
# client must never re-derive:
#   1. the `mature` flag (status "known" AND sm2_reps >= MATURE_WORD_REPS), which is
#      what makes a word open on the typing card instead of a flashcard;
#   2. session de-duplication of identical translations — no session endpoint may
#      return two words meaning the same thing, a dropped twin must be backfilled
#      rather than shrinking the session, and the twin that needs the work most wins.

from datetime import date, timedelta

from jose import jwt
from sqlmodel import Session, select

import database as _db
from constants import MATURE_WORD_REPS
from models import User, UserWordProgress, Word, WordList, WordListItem
from routers.words import _dedupe_by_translation, _translation_keys

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"


def make_token(email: str, name: str = "Test User") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _user_id(email: str) -> str:
    with Session(_db.engine) as s:
        user = s.exec(select(User).where(User.email == email)).first()
        assert user is not None, f"user {email} was not created"
        return user.id


def _seed_list(list_id: int, words: list[tuple[int, str, str, str]]) -> None:
    """Create a public list with the given (word_id, lithuanian, ru, en) rows."""
    with Session(_db.engine) as s:
        if s.get(WordList, list_id) is None:
            s.add(WordList(id=list_id, title=f"List {list_id}", is_public=True, subcategory="test_program"))
        for position, (word_id, lt, ru, en) in enumerate(words):
            if s.get(Word, word_id) is None:
                s.add(Word(id=word_id, lithuanian=lt, translation_ru=ru, translation_en=en))
                s.add(WordListItem(id=word_id, word_list_id=list_id, word_id=word_id, position=position))
        s.commit()


def _set_progress(email: str, word_id: int, **fields) -> None:
    """Upsert a UserWordProgress row directly — SM-2 internals are what's under test."""
    user_id = _user_id(email)
    with Session(_db.engine) as s:
        row = s.exec(
            select(UserWordProgress).where(
                UserWordProgress.user_id == user_id,
                UserWordProgress.word_id == word_id,
            )
        ).first()
        if row is None:
            row = UserWordProgress(user_id=user_id, word_id=word_id, status="new")
        for key, value in fields.items():
            setattr(row, key, value)
        s.add(row)
        s.commit()


def _set_size(client, headers, n: int) -> None:
    r = client.patch("/api/me/settings", json={"words_per_session": n, "new_words_ratio": 0.7}, headers=headers)
    assert r.status_code == 200


def _translations(words: list[dict]) -> list[str]:
    return [w["translation_ru"] for w in words]


# ── R1: the mature flag ──────────────────────────────────────────────────────

def test_mature_requires_known_status_and_enough_reps(client):
    email = "flow_mature_flag@example.com"
    headers = auth(make_token(email))
    _seed_list(9600, [
        (9601, "vienas9600", "один9600", "one9600"),
        (9602, "du9600", "два9600", "two9600"),
        (9603, "trys9600", "три9600", "three9600"),
        (9604, "keturi9600", "четыре9600", "four9600"),
    ])
    # Create the user row.
    client.get("/api/me/quota", headers=headers)

    _set_progress(email, 9601, status="known", sm2_reps=MATURE_WORD_REPS)       # mature
    _set_progress(email, 9602, status="known", sm2_reps=MATURE_WORD_REPS - 1)   # not enough reps
    _set_progress(email, 9603, status="learning", sm2_reps=MATURE_WORD_REPS + 5)  # wrong status
    # 9604 gets no progress row at all.

    r = client.get("/api/lists/9600/study?star_level=3&include_known=true", headers=headers)
    assert r.status_code == 200
    by_id = {w["id"]: w for w in r.json()["words"]}

    assert by_id[9601]["mature"] is True
    assert by_id[9602]["mature"] is False
    assert by_id[9603]["mature"] is False
    assert by_id[9604]["mature"] is False


def test_review_known_serves_the_mature_flag(client):
    email = "flow_mature_review@example.com"
    headers = auth(make_token(email))
    _seed_list(9610, [
        (9611, "vienas9610", "один9610", "one9610"),
        (9612, "du9610", "два9610", "two9610"),
    ])
    client.get("/api/me/quota", headers=headers)
    yesterday = date.today() - timedelta(days=1)
    _set_progress(email, 9611, status="known", sm2_reps=MATURE_WORD_REPS, next_review=yesterday)
    _set_progress(email, 9612, status="known", sm2_reps=0, next_review=yesterday)

    words = {w["id"]: w for w in client.get("/api/review/known", headers=headers).json()}
    assert words[9611]["mature"] is True
    assert words[9612]["mature"] is False


def test_anonymous_study_words_are_never_mature(client):
    _seed_list(9620, [(9621, "vienas9620", "один9620", "one9620")])
    r = client.get("/api/lists/9620/study?star_level=3")
    assert r.status_code == 200
    assert all(w["mature"] is False for w in r.json()["words"])


# ── R6.1: the collision key ──────────────────────────────────────────────────

def test_translation_keys_are_case_and_whitespace_insensitive():
    a = {"id": 1, "translation_ru": "Коллега", "translation_en": "colleague"}
    b = {"id": 2, "translation_ru": "  коллега  ", "translation_en": "colleague"}
    assert _translation_keys(a) & _translation_keys(b)


def test_translation_keys_keep_parentheses_distinct():
    """Issue #152 added qualifiers precisely so these two are distinguishable."""
    a = {"id": 1, "translation_ru": "коллега (по работе)", "translation_en": "colleague (at work)"}
    b = {"id": 2, "translation_ru": "коллега (по профессии)", "translation_en": "colleague (by trade)"}
    assert not (_translation_keys(a) & _translation_keys(b))


def test_translation_keys_do_not_cross_languages():
    a = {"id": 1, "translation_ru": "same", "translation_en": "different"}
    b = {"id": 2, "translation_ru": "other", "translation_en": "same"}
    assert not (_translation_keys(a) & _translation_keys(b))


def test_dedupe_keeps_the_neediest_twin():
    """new < learning < known, then fewer reviews, then lowest id."""
    known = {"id": 1, "status": "known", "translation_ru": "дом", "translation_en": "house"}
    learning = {"id": 2, "status": "learning", "translation_ru": "дом", "translation_en": "house"}
    new = {"id": 3, "status": "new", "translation_ru": "дом", "translation_en": "house"}
    kept = _dedupe_by_translation([known, learning, new])
    assert [w["id"] for w in kept] == [3]


def test_dedupe_preserves_caller_ordering_of_survivors():
    words = [
        {"id": 1, "status": "known", "translation_ru": "дом", "translation_en": "house"},
        {"id": 2, "status": "known", "translation_ru": "кот", "translation_en": "cat"},
        {"id": 3, "status": "new", "translation_ru": "дом", "translation_en": "house"},
    ]
    kept = _dedupe_by_translation(words)
    # id 3 beats id 1 on status rank, but the survivors keep the caller's order.
    assert [w["id"] for w in kept] == [2, 3]


def test_dedupe_keeps_words_without_translations():
    words = [
        {"id": 1, "status": "new", "translation_ru": "", "translation_en": ""},
        {"id": 2, "status": "new", "translation_ru": "", "translation_en": ""},
    ]
    assert len(_dedupe_by_translation(words)) == 2


# ── R6.1: no endpoint may serve two words with one translation ───────────────

TWIN_RU = "говорить9700"
TWIN_EN = "to speak9700"


def _seed_twins_and_fillers(list_id: int, base: int) -> None:
    _seed_list(list_id, [
        (base + 1, f"kalbeti{base}", TWIN_RU, TWIN_EN),
        (base + 2, f"sakyti{base}", TWIN_RU, TWIN_EN),
        (base + 3, f"namas{base}", f"дом{base}", f"house{base}"),
        (base + 4, f"katinas{base}", f"кот{base}", f"cat{base}"),
        (base + 5, f"suo{base}", f"собака{base}", f"dog{base}"),
    ])


def test_study_session_never_serves_two_words_with_one_translation(client):
    email = "flow_dedupe_study@example.com"
    headers = auth(make_token(email))
    _seed_twins_and_fillers(9700, 9700)
    client.get("/api/me/quota", headers=headers)

    words = client.get("/api/lists/9700/study?star_level=3", headers=headers).json()["words"]
    served = [w["id"] for w in words if w["id"] in (9701, 9702)]
    assert len(served) == 1, served
    assert len(_translations(words)) == len(set(_translations(words)))


def test_review_endpoints_never_serve_two_words_with_one_translation(client):
    email = "flow_dedupe_review@example.com"
    headers = auth(make_token(email))
    _seed_twins_and_fillers(9710, 9710)
    client.get("/api/me/quota", headers=headers)

    yesterday = date.today() - timedelta(days=1)
    tomorrow = date.today() + timedelta(days=1)
    for word_id in range(9711, 9716):
        _set_progress(email, word_id, status="known", sm2_reps=1, next_review=yesterday, mistake_count=2)

    for url in ("/api/review/known", "/api/review/known/random", "/api/review/mistakes"):
        words = client.get(url, headers=headers).json()
        served = [w["id"] for w in words if w["id"] in (9711, 9712)]
        assert len(served) == 1, (url, served)
        assert len(_translations(words)) == len(set(_translations(words))), url

    # /review/known/upcoming draws from the future-scheduled pool instead.
    for word_id in range(9711, 9716):
        _set_progress(email, word_id, next_review=tomorrow)
    words = client.get("/api/review/known/upcoming", headers=headers).json()
    served = [w["id"] for w in words if w["id"] in (9711, 9712)]
    assert len(served) == 1, served
    assert len(_translations(words)) == len(set(_translations(words)))


def test_dropped_twin_is_backfilled_so_the_session_stays_full(client):
    """A collision must cost the learner a *twin*, never a session slot."""
    email = "flow_dedupe_backfill@example.com"
    headers = auth(make_token(email))
    _seed_twins_and_fillers(9720, 9720)
    client.get("/api/me/quota", headers=headers)
    _set_size(client, headers, 3)

    yesterday = date.today() - timedelta(days=1)
    # The twins sort first, so a naive "truncate then de-duplicate" would return 2.
    for offset, word_id in enumerate(range(9721, 9726)):
        _set_progress(email, word_id, status="known", sm2_reps=1,
                      next_review=yesterday - timedelta(days=10 - offset))

    words = client.get("/api/review/known", headers=headers).json()
    assert len(words) == 3, [w["id"] for w in words]
    assert len(_translations(words)) == 3


def test_tiebreak_keeps_the_twin_with_fewer_reviews(client):
    email = "flow_dedupe_tiebreak@example.com"
    headers = auth(make_token(email))
    _seed_twins_and_fillers(9730, 9730)
    client.get("/api/me/quota", headers=headers)

    yesterday = date.today() - timedelta(days=1)
    # 9731 sorts first by next_review, but 9732 has been reviewed far less.
    _set_progress(email, 9731, status="known", sm2_reps=1, review_count=9, next_review=yesterday - timedelta(days=5))
    _set_progress(email, 9732, status="known", sm2_reps=1, review_count=1, next_review=yesterday)

    ids = [w["id"] for w in client.get("/api/review/known", headers=headers).json()]
    assert 9732 in ids
    assert 9731 not in ids
