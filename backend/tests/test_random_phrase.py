# #46 — GET /api/phrases/random feeds the phrases-page mascot bubble
# ("Labas rytas! = Good morning!"). Only phrases from a public program may come back.

from sqlmodel import Session

import database
from models import Phrase, PhraseProgram


def test_random_phrase_returns_only_public_program_phrases(client):
    with Session(database.engine) as s:
        public = PhraseProgram(title="rp public", is_public=True)
        private = PhraseProgram(title="rp private", is_public=False)
        s.add_all([public, private])
        s.flush()
        s.add(Phrase(program_id=public.id, text="rp_ok", translation="ок", translation_en="ok"))
        s.add(Phrase(program_id=private.id, text="rp_private", translation="п", translation_en="p"))
        s.commit()

    seen = set()
    for _ in range(40):
        r = client.get("/api/phrases/random")
        assert r.status_code == 200
        body = r.json()
        assert set(body) == {"text", "translation", "translation_en"}
        seen.add(body["text"])

    assert "rp_ok" in seen
    assert "rp_private" not in seen
