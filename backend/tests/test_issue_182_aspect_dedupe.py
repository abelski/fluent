# Issue #182 — list 168 "Medicina" gave the imperfective/perfective pairs
# (sveikti/pasveikti, sveiksta/pasveiksta, sveiko/pasveiko) identical translations,
# so `_dedupe_by_translation` dropped one twin of every pair from each session and the
# aspect contrast was never trained. The prod data now carries aspect-distinct
# translations; this pins that they all survive dedupe, and that one collision
# would drop a twin again.
from routers.words import _dedupe_by_translation

LIST_168 = [
    {"id": 5451, "translation_ru": "выздоравливать", "translation_en": "be recovering, get better (gradually)"},
    {"id": 5447, "translation_ru": "выздороветь", "translation_en": "recover (fully), get well"},
    {"id": 5452, "translation_ru": "выздоравливает", "translation_en": "is recovering, is getting better"},
    {"id": 5448, "translation_ru": "выздоравливает (полностью) / выздоровеет", "translation_en": "recovers (fully), gets well"},
    {"id": 5453, "translation_ru": "выздоравливал/выздоравливала", "translation_en": "was recovering, was getting better"},
    {"id": 5449, "translation_ru": "выздоровел/выздоровела", "translation_en": "recovered (fully), got well"},
]


def test_all_aspect_forms_survive_dedupe():
    assert {w["id"] for w in _dedupe_by_translation(LIST_168)} == {w["id"] for w in LIST_168}


def test_shared_en_translation_drops_a_twin():
    words = [dict(w) for w in LIST_168]
    words[0]["translation_en"] = words[1]["translation_en"]  # sveikti collides with pasveikti again
    assert len(_dedupe_by_translation(words)) == 5
