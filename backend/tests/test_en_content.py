# #48b — EN twins for admin-authored content. See documentation/en-content.md.
#
# Covers: every builder serves the EN twin; no admin PATCH wipes an EN field it wasn't sent;
# apply_en_content fills only empty fields, is idempotent and fails on unknown keys; the verb
# key normalisation; and no Cyrillic in the committed en_content/*.json.

import json
import re
import sys
from pathlib import Path

from jose import jwt
import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

import cache
import database as _db
from grammar_service import (
    _generate_sentence_tasks, _generate_verb_case_tasks, _generate_verb_conjugation_tasks, _load_case_rules,
)
from models import (
    GrammarCaseRule, GrammarProgram, GrammarSentence, PracticeCategory, PracticeTest, Verb, WordList,
)

_BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND / "scripts"))
import apply_en_content as aec  # noqa: E402

for _m in (GrammarCaseRule, GrammarProgram, GrammarSentence, PracticeCategory, PracticeTest, Verb, WordList):
    _m.__table__.create(_db.engine, checkfirst=True)

ADMIN = {"Authorization": "Bearer " + jwt.encode(
    {"email": "artyrbelski@gmail.com", "name": "Artur", "picture": None},
    "fluent-local-secret-change-in-prod", algorithm="HS256")}

_CASE = 9480  # sentinel case_index — can't collide with real lesson data
_CYRILLIC = re.compile(r"[Ѐ-ӿ]")


def _add(*rows):
    with Session(_db.engine) as s:
        for r in rows:
            s.add(r)
        s.commit()
        for r in rows:
            s.refresh(r)
    cache.clear()
    return rows


# ── API builders serve the EN twin ───────────────────────────────────────────

class TestBuildersServeEn:
    def test_case_rule_dict(self):
        _add(GrammarCaseRule(case_index=_CASE, name_ru="Винительный", question="Кого? Что?", usage="у",
                             endings_sg="-ą", endings_pl="-us", transform="т", name_en="Accusative",
                             question_en="whom? what? (direct object)", usage_en="u", transform_en="t",
                             endings_sg_en="-ą", endings_pl_en="-us"))
        with Session(_db.engine) as s:
            rule = next(r for r in _load_case_rules(s) if r["case_index"] == _CASE)
        assert rule["question_en"] == "whom? what? (direct object)"
        assert {rule[k] for k in ("name_en", "usage_en", "transform_en", "endings_sg_en", "endings_pl_en")} == {
            "Accusative", "u", "t", "-ą", "-us"}

    def test_sentence_task(self):
        _add(GrammarSentence(case_index=_CASE + 1, display="Laima mato brol___.", answer_ending="į",
                             full_word="brolį", russian="Лайма видит брата.", english="Laima sees her brother."))
        with Session(_db.engine) as s:
            task = _generate_sentence_tasks([_CASE + 1], 1, s)[0]
        assert task["translation_ru"] == "Лайма видит брата."
        assert task["translation_en"] == "Laima sees her brother."

    def test_verb_tasks(self):
        # removed again at the end: other suites assume the shared DB's verb table is theirs
        (verb,) = _add(Verb(number=9480, infinitive="dìrbti", present_3p="dìrba", past_3p="dìrbo", translation_ru="работать",
                  translation_en="to work", programs=json.dumps(["t48b"]),
                  conjugations=json.dumps({"indicative_present": {
                      "aš": "dirbu", "tu": "dirbi", "jis, ji, jie, jos": "dirba", "mes": "dirbame", "jūs": "dirbate"}}),
                  case_governance=json.dumps([{"question": "ką?", "sentences": [{"lt": "Dirbu darbą.", "ru": "Я делаю работу."}]}])))
        try:
            with Session(_db.engine) as s:
                conj = _generate_verb_conjugation_tasks("indicative_present", 3, s, program_key="t48b")
                case = [t for t in _generate_verb_case_tasks(50, s) if t["verb_infinitive"] == "dìrbti"]
        finally:
            with Session(_db.engine) as s:
                s.delete(s.get(Verb, verb.id))
                s.commit()
            cache.clear()
        assert conj and all(t["translation_en"] == "to work" for t in conj)
        assert case and case[0]["translation_en"] == "to work"

    def test_category_builders(self, client):
        (cat,) = _add(PracticeCategory(name_ru="Кат", description_ru="Описание", description_en="Description"))
        public = next(c for c in client.get("/api/practice/categories", headers=ADMIN).json() if c["id"] == cat.id)
        admin = next(c for c in client.get("/api/admin/practice/categories", headers=ADMIN).json() if c["id"] == cat.id)
        client.post(f"/api/me/practice-categories/{cat.id}", headers=ADMIN)
        mine = next(c for c in client.get("/api/me/practice-categories", headers=ADMIN).json() if c["id"] == cat.id)
        assert public["description_en"] == admin["description_en"] == mine["description_en"] == "Description"

    def test_grammar_programs(self, client):
        _add(GrammarProgram(title="Программа 48b", description="Описание", description_en="Description"))
        p = next(p for p in client.get("/api/grammar-programs").json() if p["title"] == "Программа 48b")
        assert p["description_en"] == "Description"


# ── Admin writes never wipe an EN field they weren't sent ─────────────────────

class TestAdminWritesKeepEn:
    def test_sentence_level_toggle_keeps_english(self, client):
        (s,) = _add(GrammarSentence(case_index=_CASE + 2, display="Laima mato brol___.", answer_ending="į",
                                    full_word="brolį", russian="Лайма видит брата.", english="Laima sees her brother."))
        # exactly what toggleSentenceLevel sends: no `english`
        r = client.patch(f"/api/admin/grammar/sentences/{s.id}", headers=ADMIN, json={
            "display": s.display, "answer_ending": "į", "full_word": "brolį", "russian": s.russian,
            "use_in_basic": False, "use_in_advanced": True, "use_in_practice": True})
        assert r.status_code == 200
        with Session(_db.engine) as db:
            assert db.get(GrammarSentence, s.id).english == "Laima sees her brother."
        # sent explicitly: stripped; empty clears it
        body = {"display": s.display, "answer_ending": "į", "full_word": "brolį", "russian": s.russian}
        client.patch(f"/api/admin/grammar/sentences/{s.id}", headers=ADMIN, json={**body, "english": "  New.  "})
        with Session(_db.engine) as db:
            assert db.get(GrammarSentence, s.id).english == "New."
        client.patch(f"/api/admin/grammar/sentences/{s.id}", headers=ADMIN, json={**body, "english": "  "})
        with Session(_db.engine) as db:
            assert db.get(GrammarSentence, s.id).english is None

    def test_program_patch_keeps_description_en(self, client):
        (p,) = _add(GrammarProgram(title="P48b-2", description="Описание", description_en="Description"))
        r = client.patch(f"/api/admin/grammar/programs/{p.id}", headers=ADMIN, json={"title": "P48b-2", "description": "Новое"})
        assert r.status_code == 200
        with Session(_db.engine) as db:
            assert db.get(GrammarProgram, p.id).description_en == "Description"

    def test_category_patch_keeps_description_en(self, client):
        (c,) = _add(PracticeCategory(name_ru="Кат2", description_ru="Описание", description_en="Description"))
        client.patch(f"/api/admin/practice/categories/{c.id}", headers=ADMIN, json={"name_ru": "Кат2 new"})
        with Session(_db.engine) as db:
            assert db.get(PracticeCategory, c.id).description_en == "Description"
        client.patch(f"/api/admin/practice/categories/{c.id}", headers=ADMIN, json={"description_en": ""})
        with Session(_db.engine) as db:
            assert db.get(PracticeCategory, c.id).description_en is None

    def test_rule_patch_keeps_en_fields(self, client):
        (r,) = _add(GrammarCaseRule(case_index=_CASE + 3, name_ru="Р", question="Q", usage="U", endings_sg="-a",
                                    endings_pl="-os", transform="T", question_en="whom?"))
        body = {"name_ru": "Р", "question": "Q2", "usage": "U", "endings_sg": "-a", "endings_pl": "-os", "transform": "T"}
        assert client.patch(f"/api/admin/grammar/rules/{r.id}", headers=ADMIN, json=body).status_code == 200
        with Session(_db.engine) as db:
            assert db.get(GrammarCaseRule, r.id).question_en == "whom?"

    def test_word_list_meta_patch_keeps_title_en(self, client):
        (wl,) = _add(WordList(title="Labai skanu!", title_en="Very tasty!", is_public=True, subcategory="t48b"))
        client.patch(f"/api/admin/content/word-lists/{wl.id}/meta", headers=ADMIN, json={"title_ru": "Labai skanu!"})
        with Session(_db.engine) as db:
            assert db.get(WordList, wl.id).title_en == "Very tasty!"


# ── apply_en_content ─────────────────────────────────────────────────────────

def _fresh_db_from_sources() -> Session:
    """A private SQLite DB holding exactly one row per source key (RU only, EN empty)."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    s = Session(engine)
    s.add(PracticeCategory(id=1, name_ru="Конституция", description_ru="Подготовка"))
    s.add(PracticeCategory(id=2, name_ru="Чтение", name_en="Skaitymas"))
    for e in json.loads((_BACKEND / "data/constitution/program_data.json").read_text(encoding="utf-8")):
        s.add(PracticeTest(category_id=1, sort_order=e["sort_order"], title_ru=e["title_ru"], description_ru=e["description_ru"]))
    for e in aec._literal(_BACKEND / "routers/grammar.py", "_SEED_PROGRAMS") + aec._literal(_BACKEND / "scripts/seed_verbs_grammar.py", "PROGRAMS"):
        s.add(GrammarProgram(title=e["title"], description=e["description"]))
    rules = aec._literal(_BACKEND / "scripts/seed_numbers_grammar.py", "CASE_RULES") + aec._json("grammar_case_rules.json")
    for e in rules:
        s.add(GrammarCaseRule(case_index=e["case_index"], name_ru="р", question="в", usage="у", endings_sg="-", endings_pl="-", transform="т"))
    for ci, d, ending, fw, ru, _en in aec._literal(_BACKEND / "scripts/seed_numbers_grammar.py", "SENTENCES"):
        s.add(GrammarSentence(case_index=ci, display=d, answer_ending=ending, full_word=fw, russian=ru))
    for e in aec._json("grammar_sentences.json"):
        s.add(GrammarSentence(case_index=e["case_index"], display=e["display"], answer_ending="x", full_word="x", russian=e["russian"]))
    for e in aec._json("word_lists.json"):
        s.add(WordList(title=e["title"], subcategory=e["subcategory"], description="описание"))
    from verb_translations_en import TRANSLATIONS
    n = 0
    for inf in TRANSLATIONS:
        if aec.verb_key(inf) == "rengti":
            continue
        n += 1
        s.add(Verb(number=n, infinitive=inf, present_3p="-", past_3p="-", translation_ru="перевод"))
    for e in aec._json("verbs.json"):
        n += 1
        s.add(Verb(number=n, infinitive="reñgti", present_3p="-", past_3p="-", translation_ru=e["translation_ru"]))
    s.commit()
    return s


class TestApplyEnContent:
    def test_fills_only_empty_fields_and_is_idempotent(self, tmp_path):
        s = _fresh_db_from_sources()
        kept = s.exec(select(GrammarProgram)).first()
        kept.description_en = "Admin wrote this"
        s.add(kept); s.commit()

        dry = aec.run(s, apply=False, review_path=tmp_path / "review.html")
        assert (tmp_path / "review.html").exists()
        assert s.exec(select(Verb).where(Verb.translation_en != None)).first() is None  # noqa: E711 — dry run wrote nothing
        assert dry["grammar_program"] == 3 and dry["practice_category (rename)"] == 1

        applied = aec.run(s, apply=True, review_path=None)
        assert applied == dry
        s.refresh(kept)
        assert kept.description_en == "Admin wrote this"
        assert s.get(PracticeCategory, 2).name_en == "Reading"
        assert s.exec(select(GrammarSentence).where(GrammarSentence.english == None)).first() is None  # noqa: E711

        assert aec.run(s, apply=True, review_path=None) == {}

    def test_unknown_key_fails_loudly(self, monkeypatch):
        s = _fresh_db_from_sources()
        real = aec._json
        monkeypatch.setattr(aec, "_json", lambda name: real(name) + (
            [{"subcategory": "nope", "title": "No such list", "title_en": "x"}] if name == "word_lists.json" else []))
        with pytest.raises(aec.UnmatchedKeys, match="No such list"):
            aec.run(s, apply=True, review_path=None)
        assert s.exec(select(Verb).where(Verb.translation_en != None)).first() is None  # noqa: E711 — nothing written


class TestVerbKey:
    def test_strips_stress_keeps_lithuanian_letters(self):
        assert aec.verb_key("dìrbti") == "dirbti"
        assert aec.verb_key("reñgti") == "rengti"
        assert aec.verb_key("atsimiñti") == "atsiminti"
        assert aec.verb_key("bū́ti") == "būti"
        assert aec.verb_key("šaũkti") == "šaukti"
        assert aec.verb_key("ką́sti") == "ką́sti".replace("́", "") and "ą" in aec.verb_key("ką́sti")

    def test_rengti_is_split_by_translation_ru(self):
        s = _fresh_db_from_sources()
        aec.run(s, apply=True, review_path=None)
        got = {v.translation_ru: v.translation_en for v in s.exec(select(Verb)).all() if aec.verb_key(v.infinitive) == "rengti"}
        assert got == {"готовить": "to prepare", "одевать, раздевать": "to dress, to undress"}


def test_no_cyrillic_in_en_content():
    for path in sorted((_BACKEND / "data/en_content").glob("*.json")):
        for row in json.loads(path.read_text(encoding="utf-8")):
            for k, v in row.items():
                if (k.endswith("_en") or k == "english") and v:
                    assert not _CYRILLIC.search(v), f"{path.name}: {k}={v!r}"


def test_no_cyrillic_in_seed_en():
    seed = _BACKEND / "scripts/seed_numbers_grammar.py"
    values = [en for *_, en in aec._literal(seed, "SENTENCES")]
    values += [v for r in aec._literal(seed, "CASE_RULES") for k, v in r.items() if k.endswith("_en")]
    values += [e["description_en"] for e in json.loads((_BACKEND / "data/constitution/program_data.json").read_text(encoding="utf-8"))]
    values += [p["description_en"] for p in aec._literal(_BACKEND / "routers/grammar.py", "_SEED_PROGRAMS")]
    values += [p["description_en"] for p in aec._literal(_BACKEND / "scripts/seed_verbs_grammar.py", "PROGRAMS")]
    assert values and all(v and not _CYRILLIC.search(v) for v in values)
