# Unit tests for backend/cache.py (#24) — the tag semantics and the automatic
# invalidation driven by SQLAlchemy Session events. Everything here runs against
# the SQLite test engine from conftest.

import pytest
from sqlalchemy import delete, text, update
from sqlmodel import Session, select

import cache
import database
from models import DailyStudySession, NewsPost, User


@pytest.fixture
def session():
    with Session(database.engine) as s:
        yield s


def _load(box, value):
    """A loader that records how many times it actually ran."""
    def loader():
        box.append(1)
        return value
    return loader


# ── basics ───────────────────────────────────────────────────────────────────

def test_miss_then_hit():
    calls = []
    first = cache.get_or_load(("k",), _load(calls, {"a": 1}), tags={"news_post"})
    second = cache.get_or_load(("k",), _load(calls, {"a": 2}), tags={"news_post"})
    assert first == {"a": 1}
    assert second == {"a": 1}          # served from cache, loader not re-run
    assert len(calls) == 1


def test_reads_are_deepcopied():
    cache.get_or_load(("k",), lambda: {"words": [{"id": 1}]}, tags={"word"})
    got = cache.get_or_load(("k",), lambda: None, tags={"word"})
    got["words"][0]["status"] = "known"     # callers mutate results (e.g. /lists/{id})
    again = cache.get_or_load(("k",), lambda: None, tags={"word"})
    assert "status" not in again["words"][0]


def test_store_if_false_is_not_stored():
    calls = []
    cache.get_or_load(("k",), _load(calls, [1]), tags={"word"}, store_if=lambda v: False)
    cache.get_or_load(("k",), _load(calls, [1]), tags={"word"}, store_if=lambda v: False)
    assert len(calls) == 2


def test_ttl_expiry_reloads(monkeypatch):
    clock = [1000.0]
    monkeypatch.setattr(cache, "_now", lambda: clock[0])
    calls = []
    cache.get_or_load(("k",), _load(calls, 1), tags={"word"}, ttl=60)
    clock[0] += 59
    cache.get_or_load(("k",), _load(calls, 1), tags={"word"}, ttl=60)
    assert len(calls) == 1
    clock[0] += 2
    cache.get_or_load(("k",), _load(calls, 1), tags={"word"}, ttl=60)
    assert len(calls) == 2


def test_size_cap_drops_entries():
    for i in range(cache.MAX_ENTRIES + 5):
        cache.get_or_load(("cap", i), lambda: i, tags={"word"})
    assert len(cache._store) <= cache.MAX_ENTRIES


# ── ORM writes evict by table / pk / user ────────────────────────────────────

def _seed_user(session, email) -> User:
    user = User(email=email, name=email)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_orm_insert_evicts_table_tag(session):
    calls = []
    cache.get_or_load(("news",), _load(calls, ["old"]), tags={"news_post"})
    session.add(NewsPost(title_ru="t", title_en="t"))
    session.commit()
    cache.get_or_load(("news",), _load(calls, ["new"]), tags={"news_post"})
    assert len(calls) == 2


def test_orm_update_evicts_pk_tag_only_for_that_row(session):
    a = _seed_user(session, "cache_a@example.com")
    b = _seed_user(session, "cache_b@example.com")
    calls = []
    cache.get_or_load(("u", a.id), _load(calls, "a"), tags={f"user:pk={a.id}"})
    cache.get_or_load(("u", b.id), _load(calls, "b"), tags={f"user:pk={b.id}"})
    assert len(calls) == 2

    a.name = "renamed"
    session.commit()

    cache.get_or_load(("u", b.id), _load(calls, "b"), tags={f"user:pk={b.id}"})
    assert len(calls) == 2                      # B untouched
    cache.get_or_load(("u", a.id), _load(calls, "a2"), tags={f"user:pk={a.id}"})
    assert len(calls) == 3                      # A reloaded


def test_orm_write_evicts_only_that_users_user_tag(session):
    a = _seed_user(session, "cache_u1@example.com")
    b = _seed_user(session, "cache_u2@example.com")
    calls = []
    cache.get_or_load(("q", a.id), _load(calls, 1), tags={f"daily_study_session:user={a.id}"})
    cache.get_or_load(("q", b.id), _load(calls, 1), tags={f"daily_study_session:user={b.id}"})

    from datetime import date
    session.add(DailyStudySession(user_id=a.id, study_date=date.today(), session_count=1))
    session.commit()

    cache.get_or_load(("q", b.id), _load(calls, 1), tags={f"daily_study_session:user={b.id}"})
    assert len(calls) == 2                      # user B's entry survived
    cache.get_or_load(("q", a.id), _load(calls, 1), tags={f"daily_study_session:user={a.id}"})
    assert len(calls) == 3


def test_row_event_table_tag_does_not_evict_scoped_entries(session):
    """A single-row flush emits a bare table tag, which must not blow away
    per-user entries for unrelated users."""
    user = _seed_user(session, "cache_scoped@example.com")
    calls = []
    cache.get_or_load(("scoped",), _load(calls, 1), tags={f"daily_study_session:user=other"})

    from datetime import date
    session.add(DailyStudySession(user_id=user.id, study_date=date.today(), session_count=1))
    session.commit()

    cache.get_or_load(("scoped",), _load(calls, 1), tags={"daily_study_session:user=other"})
    assert len(calls) == 1


def test_orm_delete_evicts(session):
    post = NewsPost(title_ru="d", title_en="d")
    session.add(post)
    session.commit()
    calls = []
    cache.get_or_load(("news",), _load(calls, ["x"]), tags={"news_post"})
    session.delete(post)
    session.commit()
    cache.get_or_load(("news",), _load(calls, ["y"]), tags={"news_post"})
    assert len(calls) == 2


# ── Core / textual DML evicts the whole table family ─────────────────────────

def test_core_update_evicts_all_tag_variants(session):
    user = _seed_user(session, "cache_core@example.com")
    calls = []
    cache.get_or_load(("a",), _load(calls, 1), tags={"user"})
    cache.get_or_load(("b",), _load(calls, 1), tags={f"user:pk={user.id}"})
    cache.get_or_load(("c",), _load(calls, 1), tags={"user:pk=someone-else"})
    assert len(calls) == 3

    session.exec(update(User).where(User.email == user.email).values(name="bulk"))
    session.commit()

    for key in (("a",), ("b",), ("c",)):
        cache.get_or_load(key, _load(calls, 1), tags={"user"})
    assert len(calls) == 6


def test_core_delete_evicts_all_tag_variants(session):
    post = NewsPost(title_ru="cd", title_en="cd")
    session.add(post)
    session.commit()
    calls = []
    cache.get_or_load(("n",), _load(calls, 1), tags={"news_post"})
    cache.get_or_load(("n2",), _load(calls, 1), tags={"news_post:pk=999"})
    session.exec(delete(NewsPost).where(NewsPost.id == post.id))
    session.commit()
    cache.get_or_load(("n",), _load(calls, 1), tags={"news_post"})
    cache.get_or_load(("n2",), _load(calls, 1), tags={"news_post:pk=999"})
    assert len(calls) == 4


def test_text_dml_evicts_all_tag_variants(session):
    calls = []
    cache.get_or_load(("t1",), _load(calls, 1), tags={"news_post"})
    cache.get_or_load(("t2",), _load(calls, 1), tags={"news_post:pk=1"})
    session.exec(text("UPDATE news_post SET published = 1 WHERE id = -1"))
    session.commit()
    cache.get_or_load(("t1",), _load(calls, 1), tags={"news_post"})
    cache.get_or_load(("t2",), _load(calls, 1), tags={"news_post:pk=1"})
    assert len(calls) == 4


def test_text_select_evicts_nothing(session):
    calls = []
    cache.get_or_load(("t1",), _load(calls, 1), tags={"news_post"})
    session.exec(text("SELECT count(*) FROM news_post"))
    session.commit()
    cache.get_or_load(("t1",), _load(calls, 1), tags={"news_post"})
    assert len(calls) == 1


def test_cache_tags_option_narrows_eviction(session):
    calls = []
    cache.get_or_load(("mine",), _load(calls, 1), tags={"news_post:pk=1"})
    cache.get_or_load(("theirs",), _load(calls, 1), tags={"news_post:pk=2"})
    session.exec(
        update(NewsPost).where(NewsPost.id == 1).values(published=True)
        .execution_options(cache_tags={"news_post:pk=1"})
    )
    session.commit()
    cache.get_or_load(("theirs",), _load(calls, 1), tags={"news_post:pk=2"})
    assert len(calls) == 2                      # narrowed: untouched
    cache.get_or_load(("mine",), _load(calls, 1), tags={"news_post:pk=1"})
    assert len(calls) == 3


# ── commit boundary + stale-refill guard ─────────────────────────────────────

def test_rollback_evicts_nothing(session):
    calls = []
    cache.get_or_load(("news",), _load(calls, 1), tags={"news_post"})
    session.add(NewsPost(title_ru="rb", title_en="rb"))
    session.flush()
    session.rollback()
    cache.get_or_load(("news",), _load(calls, 1), tags={"news_post"})
    assert len(calls) == 1


def test_uncommitted_flush_does_not_evict(session):
    calls = []
    cache.get_or_load(("news",), _load(calls, 1), tags={"news_post"})
    session.add(NewsPost(title_ru="pending", title_en="pending"))
    session.flush()
    cache.get_or_load(("news",), _load(calls, 1), tags={"news_post"})
    assert len(calls) == 1                      # still cached until the commit lands
    session.rollback()


def test_write_during_loader_is_not_stored(session):
    """The classic stale-refill race: the loader read pre-commit rows, a writer
    committed while it ran, so the result must be served but never stored."""
    calls = []

    def racing_loader():
        calls.append(1)
        session.add(NewsPost(title_ru="race", title_en="race"))
        session.commit()
        return "stale"

    assert cache.get_or_load(("news",), racing_loader, tags={"news_post"}) == "stale"
    cache.get_or_load(("news",), _load(calls, "fresh"), tags={"news_post"})
    assert len(calls) == 2


def test_clear_drops_everything():
    calls = []
    cache.get_or_load(("k",), _load(calls, 1), tags={"word"})
    cache.clear()
    cache.get_or_load(("k",), _load(calls, 1), tags={"word"})
    assert len(calls) == 2


def test_evict_after_commit_applies_on_commit(session):
    calls = []
    cache.get_or_load(("manual",), _load(calls, 1), tags={"app_setting"})
    cache.evict_after_commit(session, "app_setting")
    cache.get_or_load(("manual",), _load(calls, 1), tags={"app_setting"})
    assert len(calls) == 1                      # not yet — commit hasn't happened
    session.commit()
    cache.get_or_load(("manual",), _load(calls, 1), tags={"app_setting"})
    assert len(calls) == 2


def test_callable_tags_receive_the_value(session):
    user = _seed_user(session, "cache_cb@example.com")
    calls = []
    cache.get_or_load(
        ("user_by_email", user.email),
        _load(calls, {"id": user.id}),
        tags=lambda v: {f"user:pk={v['id']}"},
    )
    user.name = "changed"
    session.commit()
    cache.get_or_load(
        ("user_by_email", user.email),
        _load(calls, {"id": user.id}),
        tags=lambda v: {f"user:pk={v['id']}"},
    )
    assert len(calls) == 2
