# Autotests for bilingual phrase content (issues #148, #149).
#
# The database is the source of truth for phrase content — it is what the app
# serves and what the admin panel edits. These tests therefore exercise the
# admin API round-trip rather than any hardcoded Python data. The earlier
# version of this file asserted against literals in seed_phrases.py, which is
# exactly the drift problem those files caused: content edited in the admin
# panel never made it back, so the assertions described a file, not the app.

from jose import jwt

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"
SUPERADMIN_EMAIL = "artyrbelski@gmail.com"


def make_token(email: str, name: str = "Test User") -> str:
    return jwt.encode(
        {"email": email, "name": name, "picture": None},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _admin(client) -> dict:
    token = make_token(SUPERADMIN_EMAIL, name="Artur")
    client.get("/api/me/quota", headers=auth(token))
    return auth(token)


def _make_program(client, headers, title="Test program") -> int:
    r = client.post(
        "/api/admin/phrase-programs",
        json={"title": title, "title_en": f"{title} EN", "difficulty": 1, "is_public": True},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_phrase_can_be_created_with_both_translations(client):
    headers = _admin(client)
    pid = _make_program(client, headers, "Bilingual create")

    r = client.post(
        f"/api/admin/phrase-programs/{pid}/phrases",
        json={
            "text": "Labas rytas!",
            "translation": "Доброе утро!",
            "translation_en": "Good morning!",
            "position": 0,
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["translation_en"] == "Good morning!"


def test_chapter_titles_round_trip_through_the_admin_api(client):
    """Issue #149: chapter labels must be editable and stored per language."""
    headers = _admin(client)
    pid = _make_program(client, headers, "Chapter titles")

    created = client.post(
        f"/api/admin/phrase-programs/{pid}/phrases",
        json={
            "text": "Laba diena!",
            "translation": "Добрый день!",
            "translation_en": "Good afternoon!",
            "position": 0,
            "chapter": 1,
            "chapter_title": "Глава 1: Как вас зовут?",
            "chapter_title_en": "Chapter 1: What is your name?",
        },
        headers=headers,
    ).json()

    assert created["chapter"] == 1
    assert created["chapter_title"] == "Глава 1: Как вас зовут?"
    assert created["chapter_title_en"] == "Chapter 1: What is your name?"

    listed = client.get(f"/api/admin/phrase-programs/{pid}/phrases", headers=headers).json()
    assert listed[0]["chapter_title"] == "Глава 1: Как вас зовут?"
    assert listed[0]["chapter_title_en"] == "Chapter 1: What is your name?"


def test_editing_a_chapter_title_persists(client):
    headers = _admin(client)
    pid = _make_program(client, headers, "Chapter edit")
    phrase = client.post(
        f"/api/admin/phrase-programs/{pid}/phrases",
        json={
            "text": "Iki!", "translation": "Пока!", "translation_en": "Bye!",
            "position": 0, "chapter": 1,
            "chapter_title": "Старое название",
            "chapter_title_en": "Old title",
        },
        headers=headers,
    ).json()

    r = client.put(
        f"/api/admin/phrases/{phrase['id']}",
        json={
            "text": "Iki!", "translation": "Пока!", "translation_en": "Bye!",
            "position": 0,
            "chapter_title": "Новое название",
            "chapter_title_en": "New title",
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    assert r.json()["chapter_title"] == "Новое название"
    assert r.json()["chapter_title_en"] == "New title"


def test_update_without_chapter_fields_does_not_wipe_them(client):
    """An editor that omits the chapter fields must not clear a phrase's grouping."""
    headers = _admin(client)
    pid = _make_program(client, headers, "Chapter preserve")
    phrase = client.post(
        f"/api/admin/phrase-programs/{pid}/phrases",
        json={
            "text": "Ačiū!", "translation": "Спасибо!", "translation_en": "Thank you!",
            "position": 0, "chapter": 3,
            "chapter_title": "Глава 3", "chapter_title_en": "Chapter 3",
        },
        headers=headers,
    ).json()

    # Payload deliberately omits chapter / chapter_title / chapter_title_en
    r = client.put(
        f"/api/admin/phrases/{phrase['id']}",
        json={
            "text": "Ačiū!", "translation": "Спасибо большое!",
            "translation_en": "Thank you!", "position": 0,
        },
        headers=headers,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["translation"] == "Спасибо большое!"
    assert body["chapter"] == 3
    assert body["chapter_title"] == "Глава 3"
    assert body["chapter_title_en"] == "Chapter 3"


def test_public_phrase_payload_exposes_both_chapter_titles(client):
    """The learner-facing endpoint must carry both variants so the UI can choose."""
    headers = _admin(client)
    pid = _make_program(client, headers, "Public payload")
    client.post(
        f"/api/admin/phrase-programs/{pid}/phrases",
        json={
            "text": "Sveiki!", "translation": "Привет!", "translation_en": "Hello!",
            "position": 0, "chapter": 1,
            "chapter_title": "Глава 1", "chapter_title_en": "Chapter 1",
        },
        headers=headers,
    )

    r = client.get(f"/api/phrase-programs/{pid}")
    assert r.status_code == 200, r.text
    phrase = r.json()["phrases"][0]
    assert phrase["translation_en"] == "Hello!"
    assert phrase["chapter_title"] == "Глава 1"
    assert phrase["chapter_title_en"] == "Chapter 1"


def test_study_payload_includes_translation_tiles_for_both_languages(client):
    """Stage-1 assembly (both directions) needs shuffled tiles for the LT text
    and for each available translation, regardless of word count; only a
    genuinely absent translation (no translation_en set at all) yields None."""
    headers = _admin(client)
    pid = _make_program(client, headers, "Assembly tiles")

    client.post(
        f"/api/admin/phrase-programs/{pid}/phrases",
        json={
            "text": "Aš noriu juodos kavos dabar",
            "translation": "Я хочу чёрный кофе сейчас",
            "translation_en": "I want black coffee right now",
            "position": 0,
        },
        headers=headers,
    )
    client.post(
        f"/api/admin/phrase-programs/{pid}/phrases",
        json={"text": "Labas rytas!", "translation": "Доброе утро!", "position": 1},
        headers=headers,
    )

    # Enroll a learner and open a study session
    token = make_token("tiles_learner@example.com")
    client.get("/api/me/quota", headers=auth(token))
    assert client.post(f"/api/me/phrase-programs/{pid}", headers=auth(token)).status_code == 200

    phrases = client.get(f"/api/phrase-programs/{pid}/study", headers=auth(token)).json()["phrases"]
    by_text = {p["text"]: p for p in phrases}

    long_phrase = by_text["Aš noriu juodos kavos dabar"]
    for field, source in (
        ("word_tiles", "Aš noriu juodos kavos dabar"),
        ("translation_tiles", "Я хочу чёрный кофе сейчас"),
        ("translation_en_tiles", "I want black coffee right now"),
    ):
        assert sorted(long_phrase[field]) == sorted(source.split()), field

    # A 2-word phrase still gets tiles for both directions now
    short_phrase = by_text["Labas rytas!"]
    assert sorted(short_phrase["word_tiles"]) == sorted("Labas rytas!".split())
    assert sorted(short_phrase["translation_tiles"]) == sorted("Доброе утро!".split())
    assert short_phrase["translation_en_tiles"] is None  # no EN translation at all

    # The cross-program review endpoint must carry the same tile fields.
    # Record stage-0 progress so the phrase has a progress row, then force it due.
    long_id = long_phrase["id"]
    r = client.post(f"/api/phrases/{long_id}/progress",
                    json={"quality": 5, "stage_completed": 0}, headers=auth(token))
    assert r.status_code == 200

    import database
    from datetime import date
    from sqlmodel import Session, select
    from models import UserPhraseProgress
    with Session(database.engine) as s:
        prog = s.exec(select(UserPhraseProgress).where(UserPhraseProgress.phrase_id == long_id)).first()
        prog.next_review = date.today()
        s.add(prog)
        s.commit()

    review = client.get("/api/phrases/review", headers=auth(token)).json()["phrases"]
    review_phrase = next(p for p in review if p["id"] == long_id)
    assert sorted(review_phrase["translation_tiles"]) == sorted("Я хочу чёрный кофе сейчас".split())
    assert sorted(review_phrase["translation_en_tiles"]) == sorted("I want black coffee right now".split())
