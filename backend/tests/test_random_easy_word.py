# #44 — GET /api/words/random-easy feeds the lists-page mascot bubble
# ("labas = hello"). Only non-archived star-1 words may come back.

from sqlmodel import Session

import database
from models import Word


def test_random_easy_returns_only_active_star1_words(client):
    with Session(database.engine) as s:
        s.add(Word(lithuanian="rew_ok", translation_en="ok_en", translation_ru="ok_ru", star=1))
        s.add(Word(lithuanian="rew_hard", translation_en="h", translation_ru="h", star=2))
        s.add(Word(lithuanian="rew_arch", translation_en="a", translation_ru="a", star=1, archived=True))
        s.commit()

    seen = set()
    for _ in range(40):
        r = client.get("/api/words/random-easy")
        assert r.status_code == 200
        body = r.json()
        assert set(body) == {"lithuanian", "translation_en", "translation_ru"}
        seen.add(body["lithuanian"])

    assert "rew_hard" not in seen
    assert "rew_arch" not in seen
