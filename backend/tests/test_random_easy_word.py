# #44 — GET /api/words/random-easy feeds the lists-page mascot bubble
# ("labas = hello"). Only non-archived star-1 words may come back.
# #45 — and only words from a public, non-archived list: private user lists
# are personal (and their words often carry Russian in translation_en).

from sqlmodel import Session

import database
from models import Word, WordList, WordListItem


def test_random_easy_returns_only_public_active_star1_words(client):
    with Session(database.engine) as s:
        public = WordList(title="rew public", is_public=True)
        private = WordList(title="rew private", is_public=False)
        archived_list = WordList(title="rew archived list", is_public=True, archived=True)
        s.add_all([public, private, archived_list])
        s.flush()
        words = {
            "rew_ok": (Word(lithuanian="rew_ok", translation_en="ok_en", translation_ru="ok_ru", star=1), public),
            "rew_hard": (Word(lithuanian="rew_hard", translation_en="h", translation_ru="h", star=2), public),
            "rew_arch": (Word(lithuanian="rew_arch", translation_en="a", translation_ru="a", star=1, archived=True), public),
            "rew_private": (Word(lithuanian="rew_private", translation_en="п", translation_ru="п", star=1), private),
            "rew_in_archived_list": (Word(lithuanian="rew_in_archived_list", translation_en="x", translation_ru="x", star=1), archived_list),
            "rew_unlisted": (Word(lithuanian="rew_unlisted", translation_en="u", translation_ru="u", star=1), None),
        }
        for w, wl in words.values():
            s.add(w)
            s.flush()
            if wl:
                s.add(WordListItem(word_list_id=wl.id, word_id=w.id, position=0))
        s.commit()

    seen = set()
    for _ in range(60):
        r = client.get("/api/words/random-easy")
        assert r.status_code == 200
        body = r.json()
        assert set(body) == {"lithuanian", "translation_en", "translation_ru"}
        seen.add(body["lithuanian"])

    for bad in ("rew_hard", "rew_arch", "rew_private", "rew_in_archived_list", "rew_unlisted"):
        assert bad not in seen, bad
