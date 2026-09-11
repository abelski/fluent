# End-to-end tests for the read cache (#24).
#
# Two things are pinned here, per cached endpoint:
#   (a) a WARM call issues only the statements its uncached, per-user parts need
#       — in particular the auth user lookup costs zero;
#   (b) a real admin/user write is visible on the very next request, without any
#       restart, because the committed SQL evicted the entry itself.
#
# If a loader is accidentally removed, (a) fails. If invalidation breaks,
# (b) fails. Both are real regressions — don't relax the numbers.

from contextlib import contextmanager
from datetime import date

import pytest
from jose import jwt
from sqlalchemy import event
from sqlmodel import Session, select

import cache
import database
from models import (
    Article,
    ConstitutionQuestion,
    GrammarSentence,
    NewsPost,
    PracticeCategory,
    PracticeQuestion,
    PracticeTest,
    SubcategoryMeta,
    User,
    Word,
    WordList,
    WordListItem,
)

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"


def _token(email: str, name: str = "User") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


ADMIN = _auth(_token("artyrbelski@gmail.com", "Artur"))
USER = _auth(_token("test_user@example.com", "Test User"))


@contextmanager
def _statements():
    """Capture every SQL statement issued while the block runs."""
    seen: list[str] = []

    def _listener(conn, cursor, statement, parameters, context, executemany):
        seen.append(statement)

    event.listen(database.engine, "before_cursor_execute", _listener)
    try:
        yield seen
    finally:
        event.remove(database.engine, "before_cursor_execute", _listener)


def _touching(statements: list[str], table: str) -> list[str]:
    needle = f'"{table}"'
    return [s for s in statements if needle in s or f" {table} " in s or s.rstrip().endswith(f" {table}")]


@pytest.fixture
def db():
    with Session(database.engine) as s:
        yield s


def _make_user(db, email: str) -> User:
    user = db.exec(select(User).where(User.email == email)).first()
    if user is None:
        user = User(email=email, name=email)
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


# ── Articles / news ──────────────────────────────────────────────────────────

def test_footer_articles_warm_call_hits_no_database(client, db):
    db.add(Article(slug="cache-footer", title_ru="Ф", title_en="F", show_in_footer=True))
    db.commit()

    assert client.get("/api/footer-articles").status_code == 200
    with _statements() as sql:
        r = client.get("/api/footer-articles")
    assert r.status_code == 200
    assert sql == []                 # the Footer is on every page load — never a query


def test_articles_index_and_detail_warm_calls_hit_no_database(client, db):
    db.add(Article(slug="cache-detail", title_ru="Д", title_en="D", body_ru="тело", category="blog"))
    db.commit()

    client.get("/api/articles")
    client.get("/api/articles/cache-detail")
    with _statements() as sql:
        assert client.get("/api/articles").status_code == 200
        assert client.get("/api/articles/cache-detail").status_code == 200
    assert sql == []


def test_admin_article_edit_is_visible_on_the_next_request(client, db):
    db.add(Article(slug="cache-edit", title_ru="Старый", title_en="Old",
                   body_ru="старое тело", category="blog", show_in_footer=False))
    db.commit()

    assert client.get("/api/articles/cache-edit").json()["title_ru"] == "Старый"
    assert any(a["slug"] == "cache-edit" for a in client.get("/api/articles").json())
    client.get("/api/footer-articles")

    r = client.put("/api/admin/articles/cache-edit", headers=ADMIN, json={
        "slug": "cache-edit",
        "title_ru": "Новый",
        "title_en": "New",
        "body_ru": "новое тело",
        "body_en": "",
        "tags": "",
        "category": "blog",
        "published": True,
        "show_in_footer": True,
    })
    assert r.status_code == 200

    detail = client.get("/api/articles/cache-edit").json()
    assert detail["title_ru"] == "Новый"
    assert detail["body_ru"] == "новое тело"
    # moved into the footer: gone from the index, present in the footer list
    assert not any(a["slug"] == "cache-edit" for a in client.get("/api/articles").json())
    assert any(a["slug"] == "cache-edit" for a in client.get("/api/footer-articles").json())


def test_admin_news_creation_is_visible_on_the_next_request(client):
    before = client.get("/api/news").json()
    assert client.post("/api/admin/news", headers=ADMIN, json={
        "title_ru": "Новость", "title_en": "News", "body_ru": "", "body_en": "", "published": True,
    }).status_code == 200
    after = client.get("/api/news").json()
    assert len(after) == len(before) + 1
    assert after[0]["title_ru"] == "Новость"


def test_news_warm_call_hits_no_database(client):
    client.get("/api/news")
    with _statements() as sql:
        assert client.get("/api/news").status_code == 200
    assert sql == []


# ── Word lists ───────────────────────────────────────────────────────────────

def _enriched_list(db, title: str, subcategory: str, words: list[str]) -> int:
    """A published list whose words are all enrichment-settled, so `_list_words`
    is allowed to cache it."""
    if db.exec(select(SubcategoryMeta).where(SubcategoryMeta.key == subcategory)).first() is None:
        db.add(SubcategoryMeta(key=subcategory, name_ru=subcategory, name_en=subcategory,
                               status="published"))
    wl = WordList(title=title, is_public=True, subcategory=subcategory)
    db.add(wl)
    db.commit()
    db.refresh(wl)
    for i, lt in enumerate(words):
        w = Word(lithuanian=lt, translation_en=lt, translation_ru=lt, part_of_speech="noun")
        db.add(w)
        db.commit()
        db.refresh(w)
        db.add(WordListItem(word_list_id=wl.id, word_id=w.id, position=i))
    db.commit()
    return wl.id


def test_lists_and_list_detail_warm_calls_only_pay_for_per_user_data(client, db):
    list_id = _enriched_list(db, "Cache List", "cache_sub", ["vienas", "du"])

    client.get("/api/lists", headers=USER)
    client.get(f"/api/lists/{list_id}", headers=USER)

    with _statements() as sql:
        assert client.get("/api/lists", headers=USER).status_code == 200
    # Only the custom-program enrollment lookup; auth, the catalogue, the
    # subcategory metadata and the word/star counts are all cached.
    assert len(sql) == 1, sql

    with _statements() as sql:
        assert client.get(f"/api/lists/{list_id}", headers=USER).status_code == 200
    # The list row itself plus this user's word progress. The words are cached.
    assert len(sql) == 2, sql
    assert _touching(sql, "word") == [], sql


def test_admin_word_edit_is_visible_in_the_list_on_the_next_request(client, db):
    list_id = _enriched_list(db, "Cache Word Edit", "cache_sub_edit", ["senas"])
    word_id = client.get(f"/api/lists/{list_id}").json()["words"][0]["id"]

    assert client.patch(f"/api/admin/content/words/{word_id}", headers=ADMIN, json={
        "lithuanian": "naujas", "translation_en": "new", "translation_ru": "новый",
        "hint": None, "accented": None, "star": 1,
    }).status_code == 200

    assert client.get(f"/api/lists/{list_id}").json()["words"][0]["lithuanian"] == "naujas"


def test_admin_subcategory_status_change_is_visible_in_lists(client, db):
    list_id = _enriched_list(db, "Cache Visibility", "cache_vis", ["matomas"])

    assert any(l["id"] == list_id for l in client.get("/api/lists", headers=USER).json())
    assert client.patch("/api/admin/subcategories/cache_vis/status", headers=ADMIN,
                        json={"status": "draft"}).status_code == 200
    assert not any(l["id"] == list_id for l in client.get("/api/lists", headers=USER).json())


def test_list_words_with_unsettled_enrichment_is_not_cached(client, db):
    """A word that hasn't been enrichment-resolved yet must keep hitting the DB,
    otherwise `lazy_enrich_words` would never get another chance to run."""
    wl = WordList(title="Unenriched", is_public=True, subcategory="cache_unenriched")
    db.add(SubcategoryMeta(key="cache_unenriched", status="published"))
    db.add(wl)
    db.commit()
    db.refresh(wl)
    for i, lt in enumerate(["neaiskus1", "neaiskus2", "neaiskus3"]):
        w = Word(lithuanian=lt, translation_en=lt, translation_ru=lt)   # part_of_speech is None
        db.add(w)
        db.commit()
        db.refresh(w)
        db.add(WordListItem(word_list_id=wl.id, word_id=w.id, position=i))
    db.commit()

    client.get(f"/api/lists/{wl.id}")
    with _statements() as sql:
        assert client.get(f"/api/lists/{wl.id}").status_code == 200
    assert _touching(sql, "word") != [], "unsettled list must not be served from cache"


def test_list_detail_status_does_not_leak_between_users(client, db):
    """`/lists/{id}` mutates the cached word dicts to add a per-user `status`;
    every read is a deepcopy, so user A's statuses can't reach user B."""
    list_id = _enriched_list(db, "Cache Leak", "cache_leak", ["vienas"])
    _make_user(db, "cache_leak_a@example.com")
    _make_user(db, "cache_leak_b@example.com")
    a = _auth(_token("cache_leak_a@example.com"))
    b = _auth(_token("cache_leak_b@example.com"))

    word_id = client.get(f"/api/lists/{list_id}").json()["words"][0]["id"]
    assert client.post(f"/api/words/{word_id}/progress", headers=a,
                       json={"status": "known"}).status_code == 200

    assert client.get(f"/api/lists/{list_id}", headers=a).json()["words"][0]["status"] == "known"
    assert client.get(f"/api/lists/{list_id}", headers=b).json()["words"][0]["status"] == "new"


def test_lists_progress_warm_call_only_pays_for_per_user_data(client, db):
    list_id = _enriched_list(db, "Cache Progress", "cache_prog", ["vienas", "du"])
    _make_user(db, "cache_prog@example.com")
    headers = _auth(_token("cache_prog@example.com"))
    assert client.post("/api/me/programs", headers=headers,
                       json={"subcategory": "cache_prog"}).status_code == 201

    client.get("/api/me/lists-progress", headers=headers)
    with _statements() as sql:
        r = client.get("/api/me/lists-progress", headers=headers)
    assert r.status_code == 200
    assert str(list_id) in {str(k) for k in r.json()}
    # Custom-program enrollments + this user's word progress. Enrollment keys,
    # the catalogue and the list contents are cached.
    assert len(sql) == 2, sql


# ── Enrollment ───────────────────────────────────────────────────────────────

def test_enroll_and_unenroll_are_visible_on_the_next_request(client, db):
    _make_user(db, "cache_enroll@example.com")
    headers = _auth(_token("cache_enroll@example.com"))
    db.add(SubcategoryMeta(key="cache_enroll_prog", status="published"))
    db.commit()

    assert "cache_enroll_prog" not in client.get("/api/me/programs", headers=headers).json()
    assert client.post("/api/me/programs", headers=headers,
                       json={"subcategory": "cache_enroll_prog"}).status_code == 201
    assert "cache_enroll_prog" in client.get("/api/me/programs", headers=headers).json()
    assert client.delete("/api/me/programs/cache_enroll_prog", headers=headers).status_code == 200
    assert "cache_enroll_prog" not in client.get("/api/me/programs", headers=headers).json()


def test_one_users_enrollment_does_not_evict_anothers(client, db):
    _make_user(db, "cache_iso_a@example.com")
    _make_user(db, "cache_iso_b@example.com")
    a = _auth(_token("cache_iso_a@example.com"))
    b = _auth(_token("cache_iso_b@example.com"))
    db.add(SubcategoryMeta(key="cache_iso_prog", status="published"))
    db.commit()

    client.get("/api/me/programs", headers=b)             # warm B
    assert client.post("/api/me/programs", headers=a,
                       json={"subcategory": "cache_iso_prog"}).status_code == 201

    with _statements() as sql:
        assert client.get("/api/me/programs", headers=b).status_code == 200
    assert sql == [], "user A's enrollment must not evict user B's entry"


# ── Quota / auth user ────────────────────────────────────────────────────────

def test_quota_warm_call_hits_no_database_at_all(client, db):
    _make_user(db, "cache_quota@example.com")
    headers = _auth(_token("cache_quota@example.com"))

    client.get("/api/me/quota", headers=headers)
    with _statements() as sql:
        assert client.get("/api/me/quota", headers=headers).status_code == 200
    assert sql == [], "auth lookup and today's session row are both cached"


def test_starting_a_session_updates_sessions_today_immediately(client, db):
    list_id = _enriched_list(db, "Cache Quota List", "cache_quota_list", ["vienas", "du", "trys"])
    _make_user(db, "cache_quota2@example.com")
    headers = _auth(_token("cache_quota2@example.com"))

    assert client.get("/api/me/quota", headers=headers).json()["sessions_today"] == 0
    assert client.get(f"/api/lists/{list_id}/study", headers=headers).status_code == 200
    assert client.get("/api/me/quota", headers=headers).json()["sessions_today"] == 1


def test_one_users_session_does_not_evict_anothers_quota(client, db):
    list_id = _enriched_list(db, "Cache Quota Iso", "cache_quota_iso", ["vienas", "du", "trys"])
    _make_user(db, "cache_q_a@example.com")
    _make_user(db, "cache_q_b@example.com")
    a = _auth(_token("cache_q_a@example.com"))
    b = _auth(_token("cache_q_b@example.com"))

    client.get("/api/me/quota", headers=b)                # warm B
    assert client.get(f"/api/lists/{list_id}/study", headers=a).status_code == 200

    with _statements() as sql:
        assert client.get("/api/me/quota", headers=b).status_code == 200
    assert sql == []


def test_admin_premium_grant_is_visible_on_the_next_request(client, db):
    user = _make_user(db, "cache_premium@example.com")
    headers = _auth(_token("cache_premium@example.com"))

    assert client.get("/api/me/quota", headers=headers).json()["premium_active"] is False
    assert client.patch(f"/api/admin/users/{user.id}/premium", headers=ADMIN,
                        json={"is_premium": True, "premium_until": None}).status_code == 200
    quota = client.get("/api/me/quota", headers=headers).json()
    assert quota["premium_active"] is True
    assert quota["daily_limit"] is None


def test_admin_flag_change_is_visible_on_the_next_request(client, db):
    user = _make_user(db, "cache_admin_flag@example.com")
    headers = _auth(_token("cache_admin_flag@example.com"))

    assert client.get("/api/me/quota", headers=headers).json()["is_admin"] is False
    assert client.get("/api/admin/users", headers=headers).status_code == 403

    assert client.patch(f"/api/admin/users/{user.id}/set-admin", headers=ADMIN,
                        json={"is_admin": True}).status_code == 200

    assert client.get("/api/me/quota", headers=headers).json()["is_admin"] is True
    assert client.get("/api/admin/users", headers=headers).status_code == 200

    # ...and revoking it locks them straight back out.
    assert client.patch(f"/api/admin/users/{user.id}/set-admin", headers=ADMIN,
                        json={"is_admin": False}).status_code == 200
    assert client.get("/api/admin/users", headers=headers).status_code == 403


def test_patch_me_settings_persists_through_the_merged_user(client, db):
    """The cached user is rebuilt and merged with load=False; it must still behave
    like a normal session-attached row, so writing to it reaches the database."""
    _make_user(db, "cache_settings@example.com")
    headers = _auth(_token("cache_settings@example.com"))

    client.get("/api/me/settings", headers=headers)       # warm the user entry
    r = client.patch("/api/me/settings", headers=headers, json={
        "words_per_session": 17,
        "new_words_ratio": 0.4,
        "lesson_mode": "quick",
        "use_question_timer": True,
        "question_timer_seconds": 9,
        "email_consent": False,
        "lang": "ru",
    })
    assert r.status_code == 200
    assert r.json()["words_per_session"] == 17

    assert client.get("/api/me/settings", headers=headers).json()["words_per_session"] == 17
    db.expire_all()
    assert db.exec(
        select(User).where(User.email == "cache_settings@example.com")
    ).first().words_per_session == 17


# ── Grammar ──────────────────────────────────────────────────────────────────

def test_verb_lesson_tasks_warm_call_does_not_reread_the_verb_table(client, db):
    from models import Verb
    verb = Verb(number=9001, infinitive="kešuoti", present_3p="kešuoja", past_3p="kešavo",
                translation_ru="кэшировать",
                conjugations='{"indicative_present": {"aš": "kešuoju", "tu": "kešuoji"}}',
                programs='["sekmes"]')
    db.add(verb)
    db.commit()
    _make_user(db, "cache_verbs@example.com")
    headers = _auth(_token("cache_verbs@example.com"))

    try:
        assert client.get("/api/grammar/verb-lessons/200/tasks", headers=headers).status_code == 200
        with _statements() as sql:
            assert client.get("/api/grammar/verb-lessons/200/tasks", headers=headers).status_code == 200
        assert _touching(sql, "verb") == [], sql   # 1.3MB table, read once per change
    finally:
        # Shared in-memory DB: other suites assert on the exact verb catalogue.
        db.delete(verb)
        db.commit()


def test_admin_grammar_sentence_edit_is_visible_in_lesson_tasks(client, db):
    # Lesson 1 is the `basic` lesson for case 4 (see data/grammar/lessons.json).
    sentence = GrammarSentence(case_index=4, display="Laima mato brol___.", answer_ending="į",
                               full_word="brolį", russian="Лайма видит брата.")
    db.add(sentence)
    db.commit()
    db.refresh(sentence)

    client.get("/api/grammar/lessons/1/tasks")
    assert client.patch(f"/api/admin/grammar/sentences/{sentence.id}", headers=ADMIN, json={
        "display": "Laima mato brol___.",
        "answer_ending": "į",
        "full_word": "brolį",
        "russian": "ОБНОВЛЁННЫЙ ПЕРЕВОД",
        "use_in_basic": True,
        "use_in_advanced": True,
        "use_in_practice": True,
    }).status_code == 200

    tasks = client.get("/api/grammar/lessons/1/tasks").json()
    assert any(t.get("translation_ru") == "ОБНОВЛЁННЫЙ ПЕРЕВОД" for t in tasks), tasks


def test_admin_grammar_rule_status_change_is_visible_in_lessons(client, db):
    from models import GrammarCaseRule
    # Lesson 1 covers case 4 and is only visible to non-admins once that case is published.
    rule = db.exec(select(GrammarCaseRule).where(GrammarCaseRule.case_index == 4)).first()
    if rule is None:
        rule = GrammarCaseRule(case_index=4, name_ru="Винительный", question="Кого?",
                               usage="", endings_sg="", endings_pl="", transform="",
                               status="published")
        db.add(rule)
        db.commit()
        db.refresh(rule)
    original_status = rule.status
    rule.status = "published"
    db.commit()

    def _lesson_1_visible() -> bool:
        return any(l["id"] == 1 for l in client.get("/api/grammar/lessons").json())

    try:
        assert _lesson_1_visible()
        assert client.patch(f"/api/admin/grammar/rules/{rule.id}/status", headers=ADMIN,
                            json={"status": "draft"}).status_code == 200
        assert not _lesson_1_visible()
    finally:
        # Shared in-memory DB: leave the rule as we found it for other tests.
        rule.status = original_status
        db.commit()


def test_grammar_lessons_warm_call_hits_no_database(client):
    client.get("/api/grammar/lessons")
    with _statements() as sql:
        assert client.get("/api/grammar/lessons").status_code == 200
    assert sql == []


# ── Practice ─────────────────────────────────────────────────────────────────

def _practice_test(db, title: str, status: str = "published") -> tuple[int, int]:
    category = PracticeCategory(name_ru=f"Кат {title}", name_en=title)
    db.add(category)
    db.commit()
    db.refresh(category)
    test = PracticeTest(category_id=category.id, title_ru=title, status=status, question_count=1)
    db.add(test)
    db.commit()
    db.refresh(test)
    db.add(PracticeQuestion(test_id=test.id, question_ru="Вопрос?", option_a="a", option_b="b",
                            option_c="c", option_d="d", correct_option="a"))
    db.commit()
    return category.id, test.id


def test_practice_categories_warm_call_hits_no_database(client, db):
    _practice_test(db, "Cache Practice Warm")
    client.get("/api/practice/categories", headers=USER)
    with _statements() as sql:
        assert client.get("/api/practice/categories", headers=USER).status_code == 200
    assert sql == []


def test_publishing_a_practice_test_updates_the_category_count(client, db):
    category_id, test_id = _practice_test(db, "Cache Publish", status="draft")

    def _count() -> int:
        rows = client.get("/api/practice/categories", headers=USER).json()
        return next(c["test_count"] for c in rows if c["id"] == category_id)

    assert _count() == 0
    assert client.patch(f"/api/admin/practice/tests/{test_id}", headers=ADMIN,
                        json={"status": "published"}).status_code == 200
    assert _count() == 1


def test_admin_question_edit_is_visible_in_the_exam_pool(client, db):
    _category_id, test_id = _practice_test(db, "Cache Exam")
    exam = client.get(f"/api/practice/tests/{test_id}/exam", headers=USER).json()
    question_id = exam["questions"][0]["id"]
    assert exam["questions"][0]["question_ru"] == "Вопрос?"

    assert client.patch(f"/api/admin/practice/questions/{question_id}", headers=ADMIN,
                        json={"question_ru": "Новый вопрос?"}).status_code == 200

    exam = client.get(f"/api/practice/tests/{test_id}/exam", headers=USER).json()
    assert exam["questions"][0]["question_ru"] == "Новый вопрос?"


def test_exam_warm_call_hits_no_database(client, db):
    _category_id, test_id = _practice_test(db, "Cache Exam Warm")
    client.get(f"/api/practice/tests/{test_id}/exam", headers=USER)
    with _statements() as sql:
        assert client.get(f"/api/practice/tests/{test_id}/exam", headers=USER).status_code == 200
    assert sql == []


def test_constitution_exam_warm_call_hits_no_database(client, db):
    db.add(ConstitutionQuestion(question_ru="К?", option_a="a", option_b="b", option_c="c",
                                option_d="d", correct_option="a"))
    db.commit()
    client.get("/api/practice/constitution/exam", headers=USER)
    with _statements() as sql:
        assert client.get("/api/practice/constitution/exam", headers=USER).status_code == 200
    assert sql == []


# ── Settings ─────────────────────────────────────────────────────────────────

def test_cefr_thresholds_are_cached_and_invalidated_by_the_admin_patch(client):
    levels = ["0", "A1", "A2", "B1", "B2", "C1", "C2"]
    body = [{"level": l, "threshold": 10 * (i + 1)} for i, l in enumerate(levels)]
    assert client.patch("/api/admin/settings/cefr-thresholds", headers=ADMIN, json=body).status_code == 200

    assert client.get("/api/admin/settings/cefr-thresholds").json()[0]["threshold"] == 10
    with _statements() as sql:
        assert client.get("/api/admin/settings/cefr-thresholds").status_code == 200
    assert sql == []

    body[0]["threshold"] = 99
    assert client.patch("/api/admin/settings/cefr-thresholds", headers=ADMIN, json=body).status_code == 200
    assert client.get("/api/admin/settings/cefr-thresholds").json()[0]["threshold"] == 99


# ── Phrases ──────────────────────────────────────────────────────────────────

def test_phrase_programs_warm_call_only_pays_for_per_user_data(client, db):
    from models import Phrase, PhraseProgram
    program = PhraseProgram(title="Кэш фразы", is_public=True)
    db.add(program)
    db.commit()
    db.refresh(program)
    db.add(Phrase(program_id=program.id, text="Labas", translation="Привет"))
    db.commit()
    _make_user(db, "cache_phrases@example.com")
    headers = _auth(_token("cache_phrases@example.com"))

    client.get("/api/phrase-programs", headers=headers)
    with _statements() as sql:
        assert client.get("/api/phrase-programs", headers=headers).status_code == 200
    assert sql == [], "not enrolled: nothing per-user left to read"

    client.get(f"/api/phrase-programs/{program.id}", headers=headers)
    with _statements() as sql:
        assert client.get(f"/api/phrase-programs/{program.id}", headers=headers).status_code == 200
    # Only the program row and this user's phrase progress; the phrases are cached.
    assert _touching(sql, "phrase") == [] or all(
        "user_phrase_progress" in s or "phrase_program" in s for s in _touching(sql, "phrase")
    ), sql
