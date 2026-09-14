# Autotests for the in-app inbox (#23).
#
# What these pin down, beyond "it returns rows":
#
#   * A user can only ever touch their own deliveries. Every action's SQL carries
#     `AND user_id = :uid`, so another user's ids must never appear in affected_ids —
#     which is also what makes Undo restore exactly what Delete removed.
#   * The read path costs Neon nothing when warm. `GET /me/inbox*` must issue ZERO
#     statements with a warm cache, and `/me/stats` must not have grown a query
#     (documentation/production-db-latency.md — each round trip is ~0.2-0.3s in prod).
#     Counted via `before_cursor_execute`, never wall-clock.
#   * Achievements grandfather on a user's first evaluation, so shipping this does
#     not flood 146 existing users, and never double-celebrate (ON CONFLICT RETURNING).
#   * The FK delete order holds under `enforce_foreign_keys()` (#21 — SQLite ignores
#     the FKs Postgres enforces, which is exactly how #172 shipped).
#
# Uses TestClient + in-memory SQLite (backend/conftest.py).

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from jose import jwt
from sqlalchemy import event
from sqlmodel import Session, select

import cache
import database
import inbox_service
import stripe_service
from conftest import enforce_foreign_keys
from models import (
    InboxDelivery,
    InboxMessage,
    MistakeReport,
    PreparedMessage,
    User,
    UserAchievement,
)

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"

SUPERADMIN_EMAIL = "artyrbelski@gmail.com"     # seeded by conftest with is_superadmin


def make_token(email: str, name: str = "Inbox User") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(email: str) -> dict:
    return {"Authorization": f"Bearer {make_token(email)}"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _user_id(client, email: str) -> str:
    """Ensure the user row exists (auto-created on first authed call). Returns its id."""
    client.get("/api/me/quota", headers=auth(email))
    with Session(database.engine) as s:
        return s.exec(select(User).where(User.email == email)).first().id


def _update_user(user_id: str, **fields) -> None:
    with Session(database.engine) as s:
        u = s.get(User, user_id)
        for key, value in fields.items():
            setattr(u, key, value)
        s.add(u)
        s.commit()


def _seed(user_ids, *, title="Hello", body="Body text", kind="info", source="admin",
          created_at=None, read=False, deleted=False, cta_url=None) -> int:
    """Insert one message + one delivery per user id. Returns the message id."""
    with Session(database.engine) as s:
        msg = InboxMessage(
            kind=kind, source=source,
            title_ru=f"{title} RU", title_en=f"{title} EN",
            body_ru=f"{body} RU", body_en=f"{body} EN",
            cta_url=cta_url,
            cta_label_ru="Открыть" if cta_url else None,
            cta_label_en="Open" if cta_url else None,
            created_at=created_at or _utcnow(),
        )
        s.add(msg)
        s.flush()
        for uid in user_ids:
            s.add(InboxDelivery(
                message_id=msg.id, user_id=uid,
                created_at=created_at or _utcnow(),
                read_at=_utcnow() if read else None,
                deleted_at=_utcnow() if deleted else None,
            ))
        s.commit()
        return msg.id


def _delivery_id(user_id: str, message_id: int) -> int:
    with Session(database.engine) as s:
        return s.exec(
            select(InboxDelivery.id).where(
                InboxDelivery.user_id == user_id, InboxDelivery.message_id == message_id
            )
        ).first()


def _delivery(delivery_id: int) -> InboxDelivery:
    with Session(database.engine) as s:
        return s.get(InboxDelivery, delivery_id)


def _delivery_count(user_id: str) -> int:
    with Session(database.engine) as s:
        return len(s.exec(select(InboxDelivery.id).where(InboxDelivery.user_id == user_id)).all())


def _act(client, email: str, action: str, ids=None, all_=None):
    payload: dict = {"action": action}
    if ids is not None:
        payload["ids"] = ids
    if all_ is not None:
        payload["all"] = all_
    return client.post("/api/me/inbox/actions", json=payload, headers=auth(email))


@contextmanager
def _count_statements():
    """Count SQL statements issued against `database.engine` inside the block.

    Same technique as test_verb_lookup.py: a listener, not wall-clock — the point is
    the number of Neon round trips, which timing on SQLite cannot show.
    """
    count = [0]

    def _listener(conn, cursor, statement, parameters, context, executemany):
        count[0] += 1

    event.listen(database.engine, "before_cursor_execute", _listener)
    try:
        yield lambda: count[0]
    finally:
        event.remove(database.engine, "before_cursor_execute", _listener)


# ── List ─────────────────────────────────────────────────────────────────────

def test_list_is_newest_first_with_snippets_and_no_full_bodies(client):
    email = "inbox-list@example.com"
    uid = _user_id(client, email)
    old = _utcnow() - timedelta(days=2)
    _seed([uid], title="Old", body="x" * 300, created_at=old)
    _seed([uid], title="New", body="Short body")

    body = client.get("/api/me/inbox", headers=auth(email)).json()
    titles = [i["title_en"] for i in body["items"]]
    assert titles == ["New EN", "Old EN"]
    assert body["unread"] == 2
    assert body["has_more"] is False

    first = body["items"][0]
    assert first["snippet_en"] == "Short body EN"
    assert first["read"] is False
    assert "body_en" not in first and "body_ru" not in first
    # Long bodies are truncated to the snippet budget, never shipped whole.
    assert len(body["items"][1]["snippet_en"]) <= inbox_service.SNIPPET_CHARS + 1


def test_brand_new_user_gets_an_empty_inbox_not_an_error(client):
    # Issue #175: a zero-delivery user's dropdown looked blank because the
    # frontend didn't distinguish "empty" from "failed" — the backend side of
    # that was already correct, this pins it down.
    body = client.get("/api/me/inbox", headers=auth("inbox-brand-new@example.com")).json()
    assert body == {"items": [], "has_more": False, "unread": 0}


def test_limit_offset_and_has_more_boundaries(client):
    email = "inbox-paging@example.com"
    uid = _user_id(client, email)
    for i in range(5):
        _seed([uid], title=f"M{i}", created_at=_utcnow() - timedelta(minutes=10 - i))

    page1 = client.get("/api/me/inbox?limit=2&offset=0", headers=auth(email)).json()
    assert [i["title_en"] for i in page1["items"]] == ["M4 EN", "M3 EN"]
    assert page1["has_more"] is True

    page3 = client.get("/api/me/inbox?limit=2&offset=4", headers=auth(email)).json()
    assert [i["title_en"] for i in page3["items"]] == ["M0 EN"]
    assert page3["has_more"] is False

    past_end = client.get("/api/me/inbox?limit=2&offset=99", headers=auth(email)).json()
    assert past_end["items"] == [] and past_end["has_more"] is False


@pytest.mark.parametrize("qs", ["limit=0", "limit=51", "limit=abc", "offset=-1"])
def test_bad_limit_or_offset_is_422(client, qs):
    assert client.get(f"/api/me/inbox?{qs}", headers=auth("inbox-422@example.com")).status_code == 422


def test_deleted_rows_are_hidden_from_the_list_and_the_count(client):
    email = "inbox-hidden@example.com"
    uid = _user_id(client, email)
    _seed([uid], title="Visible")
    _seed([uid], title="Gone", deleted=True)

    body = client.get("/api/me/inbox", headers=auth(email)).json()
    assert [i["title_en"] for i in body["items"]] == ["Visible EN"]
    assert body["unread"] == 1
    assert client.get("/api/me/inbox/unread-count", headers=auth(email)).json() == {"unread": 1}


# ── Detail ───────────────────────────────────────────────────────────────────

def test_detail_returns_full_content(client):
    email = "inbox-detail@example.com"
    uid = _user_id(client, email)
    mid = _seed([uid], title="Full", body="Everything", kind="offer", cta_url="/pricing")
    did = _delivery_id(uid, mid)

    item = client.get(f"/api/me/inbox/{did}", headers=auth(email)).json()["item"]
    assert item["body_en"] == "Everything EN"
    assert item["kind"] == "offer"
    assert item["cta_url"] == "/pricing"
    assert item["cta_label_en"] == "Open"
    assert item["read"] is False


def test_detail_404s_for_another_users_id_and_for_a_deleted_row(client):
    mine = "inbox-detail-mine@example.com"
    theirs = "inbox-detail-theirs@example.com"
    my_id, their_id = _user_id(client, mine), _user_id(client, theirs)
    their_mid = _seed([their_id], title="Theirs")
    my_deleted = _seed([my_id], title="Deleted", deleted=True)

    assert client.get(f"/api/me/inbox/{_delivery_id(their_id, their_mid)}", headers=auth(mine)).status_code == 404
    assert client.get(f"/api/me/inbox/{_delivery_id(my_id, my_deleted)}", headers=auth(mine)).status_code == 404


# ── Actions ──────────────────────────────────────────────────────────────────

def test_read_marks_only_unread_rows_and_reports_unread(client):
    email = "inbox-read@example.com"
    uid = _user_id(client, email)
    unread_id = _delivery_id(uid, _seed([uid], title="A"))
    already_read = _delivery_id(uid, _seed([uid], title="B", read=True))

    body = _act(client, email, "read", ids=[unread_id, already_read]).json()
    assert body["affected_ids"] == [unread_id]      # a read row fails the precondition
    assert body["unread"] == 0
    assert _delivery(unread_id).read_at is not None


def test_delete_then_undelete_restores_read_state_and_position(client):
    email = "inbox-undo@example.com"
    uid = _user_id(client, email)
    first = _delivery_id(uid, _seed([uid], title="First", created_at=_utcnow() - timedelta(hours=2)))
    middle = _delivery_id(uid, _seed([uid], title="Middle", read=True, created_at=_utcnow() - timedelta(hours=1)))
    _seed([uid], title="Last")

    deleted = _act(client, email, "delete", ids=[middle]).json()
    assert deleted["affected_ids"] == [middle]
    ids_now = [i["id"] for i in client.get("/api/me/inbox", headers=auth(email)).json()["items"]]
    assert middle not in ids_now

    # Deleting an already-deleted row affects nothing — so a second Undo can't resurrect it twice.
    assert _act(client, email, "delete", ids=[middle]).json()["affected_ids"] == []

    restored = _act(client, email, "undelete", ids=deleted["affected_ids"]).json()
    assert restored["affected_ids"] == [middle]
    items = client.get("/api/me/inbox", headers=auth(email)).json()["items"]
    assert [i["title_en"] for i in items] == ["Last EN", "Middle EN", "First EN"]
    assert next(i for i in items if i["id"] == middle)["read"] is True
    assert first in [i["id"] for i in items]


def test_another_users_ids_are_never_affected(client):
    mine = "inbox-scope-mine@example.com"
    theirs = "inbox-scope-theirs@example.com"
    my_id, their_id = _user_id(client, mine), _user_id(client, theirs)
    their_delivery = _delivery_id(their_id, _seed([their_id], title="Theirs"))
    my_delivery = _delivery_id(my_id, _seed([my_id], title="Mine"))

    body = _act(client, mine, "read", ids=[my_delivery, their_delivery]).json()
    assert body["affected_ids"] == [my_delivery]
    assert _delivery(their_delivery).read_at is None


def test_mark_all_as_read_touches_only_the_callers_unread_rows(client):
    mine = "inbox-all-mine@example.com"
    theirs = "inbox-all-theirs@example.com"
    my_id, their_id = _user_id(client, mine), _user_id(client, theirs)
    shared = _seed([my_id, their_id], title="Broadcast")
    mine_only = _seed([my_id], title="Mine")

    body = _act(client, mine, "read", all_=True).json()
    assert set(body["affected_ids"]) == {_delivery_id(my_id, shared), _delivery_id(my_id, mine_only)}
    assert body["unread"] == 0
    assert _delivery(_delivery_id(their_id, shared)).read_at is None
    assert client.get("/api/me/inbox/unread-count", headers=auth(theirs)).json()["unread"] == 1


@pytest.mark.parametrize("payload", [
    {"action": "burn", "ids": [1]},                 # unknown action
    {"action": "read", "ids": [1], "all": True},    # both
    {"action": "read"},                             # neither
    {"action": "delete", "all": True},              # all with a non-read action
    {"action": "undelete", "all": True},
    {"action": "read", "ids": []},                  # below the id range
    {"action": "read", "ids": list(range(501))},    # above the id range
])
def test_action_validation_is_422(client, payload):
    resp = client.post("/api/me/inbox/actions", json=payload, headers=auth("inbox-bad@example.com"))
    assert resp.status_code == 422


# ── Purge job ────────────────────────────────────────────────────────────────

def test_purge_hard_deletes_only_rows_soft_deleted_over_24h_ago(client):
    from scheduler import purge_deleted_inbox_deliveries

    email = "inbox-purge@example.com"
    uid = _user_id(client, email)
    stale = _delivery_id(uid, _seed([uid], title="Stale", deleted=True))
    fresh = _delivery_id(uid, _seed([uid], title="Fresh", deleted=True))
    alive = _delivery_id(uid, _seed([uid], title="Alive"))
    with Session(database.engine) as s:
        row = s.get(InboxDelivery, stale)
        row.deleted_at = _utcnow() - timedelta(hours=25)
        s.add(row)
        s.commit()

    purge_deleted_inbox_deliveries()

    assert _delivery(stale) is None
    assert _delivery(fresh) is not None      # still inside the Undo window's grace day
    assert _delivery(alive) is not None


# ── Auth ─────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("method,path", [
    ("get", "/api/me/inbox"),
    ("get", "/api/me/inbox/unread-count"),
    ("get", "/api/me/inbox/1"),
    ("post", "/api/me/inbox/actions"),
])
def test_unauthenticated_is_401(client, method, path):
    call = getattr(client, method)
    resp = call(path, json={"action": "read", "all": True}) if method == "post" else call(path)
    assert resp.status_code == 401


def test_admin_endpoints_are_superadmin_only(client):
    email = "inbox-not-admin@example.com"
    _user_id(client, email)
    payload = {"audience": "all", "title_ru": "т", "title_en": "t"}
    assert client.post("/api/admin/inbox", json=payload, headers=auth(email)).status_code == 403
    assert client.get("/api/admin/inbox", headers=auth(email)).status_code == 403
    assert client.delete("/api/admin/inbox/1", headers=auth(email)).status_code == 403


# ── Admin composer ───────────────────────────────────────────────────────────

def _admin_send(client, **overrides):
    payload = {"audience": "all", "kind": "info", "title_ru": "Заголовок", "title_en": "Title",
               "body_ru": "тело", "body_en": "body"}
    payload.update(overrides)
    return client.post("/api/admin/inbox", json=payload, headers=auth(SUPERADMIN_EMAIL))


@pytest.mark.parametrize("overrides", [
    {"title_ru": "   "},                                            # empty after strip
    {"title_en": ""},
    {"title_en": "x" * 121},                                        # over the length cap
    {"body_en": "x" * 4001},
    {"kind": "shouting"},
    {"cta_url": "javascript:alert(1)", "cta_label_ru": "a", "cta_label_en": "a"},
    {"cta_url": "//evil.example.com", "cta_label_ru": "a", "cta_label_en": "a"},
    {"cta_url": "https://evil.example.com", "cta_label_ru": "a", "cta_label_en": "a"},
    {"cta_label_ru": "Купить", "cta_label_en": "Buy"},              # labels with no url
    {"cta_url": "/pricing"},                                        # url with no labels
    {"audience": "everyone"},
    {"audience": "users", "user_ids": []},
    {"audience": "inactive"},                                       # missing inactive_days
    {"audience": "inactive", "inactive_days": 0},
    {"audience": "inactive", "inactive_days": 5000},
])
def test_admin_send_validation_is_422(client, overrides):
    assert _admin_send(client, **overrides).status_code == 422


def test_admin_send_with_zero_recipients_is_422(client):
    resp = _admin_send(client, audience="users", user_ids=["no-such-user-id"])
    assert resp.status_code == 422


def test_dry_run_counts_without_writing(client):
    email = "inbox-dry@example.com"
    uid = _user_id(client, email)
    before = _delivery_count(uid)
    resp = _admin_send(client, audience="users", user_ids=[uid], dry_run=True)
    assert resp.json() == {"recipients": 1}
    assert _delivery_count(uid) == before
    with Session(database.engine) as s:
        assert s.exec(select(InboxMessage).where(InboxMessage.title_en == "Title")).first() is None


def test_audiences_resolve_to_exactly_the_right_users(client):
    premium = _user_id(client, "inbox-aud-premium@example.com")
    expired = _user_id(client, "inbox-aud-expired@example.com")
    free = _user_id(client, "inbox-aud-free@example.com")
    idle = _user_id(client, "inbox-aud-idle@example.com")
    _update_user(premium, is_premium=True, premium_until=_utcnow() + timedelta(days=30), last_login=_utcnow())
    # is_premium=True but lapsed — must count as free, mirroring quota.is_premium_active.
    _update_user(expired, is_premium=True, premium_until=_utcnow() - timedelta(days=1), last_login=_utcnow())
    _update_user(free, is_premium=False, last_login=_utcnow())
    _update_user(idle, is_premium=False, last_login=_utcnow() - timedelta(days=90))

    def recipients_of(**kw) -> set:
        resp = _admin_send(client, **kw)
        assert resp.status_code == 200, resp.text
        mid = resp.json()["message_id"]
        with Session(database.engine) as s:
            return set(s.exec(select(InboxDelivery.user_id).where(InboxDelivery.message_id == mid)).all())

    premium_ids = recipients_of(audience="premium")
    assert premium in premium_ids
    assert expired not in premium_ids and free not in premium_ids

    free_ids = recipients_of(audience="free")
    assert {expired, free} <= free_ids
    assert premium not in free_ids

    idle_ids = recipients_of(audience="inactive", inactive_days=30)
    assert idle in idle_ids
    assert free not in idle_ids

    assert recipients_of(audience="users", user_ids=[premium, free]) == {premium, free}

    all_ids = recipients_of(audience="all")
    assert {premium, expired, free, idle} <= all_ids


def test_admin_history_reports_recipient_and_read_counts(client):
    a = _user_id(client, "inbox-hist-a@example.com")
    b = _user_id(client, "inbox-hist-b@example.com")
    mid = _admin_send(client, audience="users", user_ids=[a, b], title_en="Historic").json()["message_id"]
    _act(client, "inbox-hist-a@example.com", "read", ids=[_delivery_id(a, mid)])

    row = next(r for r in client.get("/api/admin/inbox", headers=auth(SUPERADMIN_EMAIL)).json() if r["id"] == mid)
    assert row["recipients"] == 2
    assert row["read"] == 1
    assert row["audience"] == "users:2"
    assert "body_en" not in row       # history never carries bodies


def test_retract_removes_the_message_for_recipients(client):
    email = "inbox-retract@example.com"
    uid = _user_id(client, email)
    with enforce_foreign_keys():
        mid = _admin_send(client, audience="users", user_ids=[uid], title_en="Retract me").json()["message_id"]
        assert client.get("/api/me/inbox/unread-count", headers=auth(email)).json()["unread"] >= 1
        assert client.delete(f"/api/admin/inbox/{mid}", headers=auth(SUPERADMIN_EMAIL)).status_code == 200

    with Session(database.engine) as s:
        assert s.get(InboxMessage, mid) is None
        assert s.exec(select(InboxDelivery).where(InboxDelivery.message_id == mid)).first() is None
    titles = [i["title_en"] for i in client.get("/api/me/inbox", headers=auth(email)).json()["items"]]
    assert "Retract me" not in titles
    assert client.delete(f"/api/admin/inbox/{mid}", headers=auth(SUPERADMIN_EMAIL)).status_code == 404


# ── Achievements ─────────────────────────────────────────────────────────────

def _award(user_id: str, **stats) -> int:
    base = {"known": 0, "streak": 0, "grammar_lessons_passed": 0,
            "practice_exams_completed": 0, "phrases_learned": 0}
    base.update(stats)
    with Session(database.engine) as s:
        return inbox_service.award_achievements(s, s.get(User, user_id), base)


def _keys(user_id: str) -> set:
    with Session(database.engine) as s:
        return set(s.exec(select(UserAchievement.key).where(UserAchievement.user_id == user_id)).all())


def test_first_evaluation_grandfathers_silently(client):
    uid = _user_id(client, "inbox-ach-old@example.com")
    assert _award(uid, known=300, streak=40, grammar_lessons_passed=2) == 0
    assert _delivery_count(uid) == 0
    assert {"_init", "streak:7", "streak:30", "words:100", "words:250", "grammar:first"} <= _keys(uid)


def test_crossing_a_milestone_creates_exactly_one_message_once(client):
    email = "inbox-ach-new@example.com"
    uid = _user_id(client, email)
    assert _award(uid) == 0                       # grandfathering pass, nothing reached
    assert _keys(uid) == {"_init"}

    assert _award(uid, streak=7) == 1
    assert _delivery_count(uid) == 1
    assert _award(uid, streak=7) == 0             # repeat call celebrates nothing
    assert _delivery_count(uid) == 1

    item = client.get("/api/me/inbox", headers=auth(email)).json()["items"][0]
    assert item["kind"] == "celebration" and item["source"] == "achievement"
    assert "7" in item["title_en"]


def test_non_premium_achievements_carry_the_premium_cta_and_premium_users_do_not(client):
    free_email, prem_email = "inbox-ach-free@example.com", "inbox-ach-prem@example.com"
    free_id, prem_id = _user_id(client, free_email), _user_id(client, prem_email)
    _update_user(prem_id, is_premium=True, premium_until=None)
    _award(free_id), _award(prem_id)
    _award(free_id, grammar_lessons_passed=1)
    _award(prem_id, grammar_lessons_passed=1)

    def cta(email):
        items = client.get("/api/me/inbox", headers=auth(email)).json()["items"]
        return client.get(f"/api/me/inbox/{items[0]['id']}", headers=auth(email)).json()["item"]["cta_url"]

    assert cta(free_email) == "/pricing"
    assert cta(prem_email) is None


def test_word_milestones_stop_before_the_cefr_thresholds(client):
    """500/1000/2000 are CEFR levels; celebrating them as word counts too would double-send."""
    uid = _user_id(client, "inbox-ach-words@example.com")
    _award(uid)
    _award(uid, known=600)
    assert _keys(uid) >= {"words:100", "words:250", "cefr:A1"}
    assert not any(k.startswith("words:5") for k in _keys(uid))


def test_stats_response_carries_new_inbox_messages(client):
    email = "inbox-stats-key@example.com"
    _user_id(client, email)
    body = client.get("/api/me/stats", headers=auth(email)).json()
    assert body["new_inbox_messages"] == 0


# ── Mirrors of existing flows ────────────────────────────────────────────────

def test_report_status_reaches_a_user_without_email_consent(client):
    email = "inbox-report@example.com"
    uid = _user_id(client, email)
    _update_user(uid, email_consent=False)
    with Session(database.engine) as s:
        report = MistakeReport(user_id=uid, description="wrong translation of 'namas'")
        s.add(report)
        s.commit()
        report_id = report.id

    assert client.patch(f"/api/admin/reports/{report_id}/resolve", headers=auth(SUPERADMIN_EMAIL)).status_code == 200

    items = client.get("/api/me/inbox", headers=auth(email)).json()["items"]
    assert items[0]["source"] == "report"
    full = client.get(f"/api/me/inbox/{items[0]['id']}", headers=auth(email)).json()["item"]
    assert "namas" in full["body_en"]


def test_sending_a_reward_message_also_lands_in_the_inbox(client):
    email = "inbox-reward@example.com"
    uid = _user_id(client, email)
    with Session(database.engine) as s:
        msg = PreparedMessage(user_id=uid, user_email=email, user_name="R", user_lang="ru",
                              subject="s", body="b", status="draft", message_type="reward")
        s.add(msg)
        s.commit()
        msg_id = msg.id

    with patch("email_service.send_email"):
        assert client.post(f"/api/admin/messages/{msg_id}/send", headers=auth(SUPERADMIN_EMAIL)).status_code == 200

    items = client.get("/api/me/inbox", headers=auth(email)).json()["items"]
    assert items[0]["source"] == "leaderboard"
    assert items[0]["kind"] == "celebration"


def test_set_premium_welcomes_only_on_an_inactive_to_active_transition(client):
    email = "inbox-setprem@example.com"
    uid = _user_id(client, email)
    until = (_utcnow() + timedelta(days=30)).isoformat()

    client.patch(f"/api/admin/users/{uid}/premium", json={"is_premium": True, "premium_until": until},
                 headers=auth(SUPERADMIN_EMAIL))
    assert _delivery_count(uid) == 1

    later = (_utcnow() + timedelta(days=60)).isoformat()
    client.patch(f"/api/admin/users/{uid}/premium", json={"is_premium": True, "premium_until": later},
                 headers=auth(SUPERADMIN_EMAIL))
    assert _delivery_count(uid) == 1      # already active — no second welcome


def _checkout_event(customer_id: str) -> dict:
    return {
        "id": "evt_inbox_1",
        "type": "checkout.session.completed",
        "data": {"object": {"customer": customer_id, "subscription": None,
                            "amount_total": 500, "currency": "eur"}},
    }


def test_checkout_webhook_creates_the_premium_welcome(client, monkeypatch):
    email = "inbox-checkout@example.com"
    uid = _user_id(client, email)
    _update_user(uid, stripe_customer_id="cus_inbox_ok")
    monkeypatch.setattr(stripe_service, "verify_event", lambda payload, sig: _checkout_event("cus_inbox_ok"))

    resp = client.post("/api/billing/webhook", content=b"{}", headers={"Stripe-Signature": "t=1,v1=x"})
    assert resp.status_code == 200

    items = client.get("/api/me/inbox", headers=auth(email)).json()["items"]
    assert items[0]["source"] == "premium"


def test_checkout_webhook_still_returns_200_and_grants_premium_when_the_inbox_write_fails(client, monkeypatch):
    """The welcome runs after the entitlement commit precisely so this can't cost a paying
    user their Premium (and make Stripe retry the event forever)."""
    email = "inbox-checkout-boom@example.com"
    uid = _user_id(client, email)
    _update_user(uid, stripe_customer_id="cus_inbox_boom")
    monkeypatch.setattr(stripe_service, "verify_event", lambda payload, sig: _checkout_event("cus_inbox_boom"))

    def _boom(session, user):
        raise RuntimeError("inbox is down")

    monkeypatch.setattr(inbox_service, "notify_premium_welcome", _boom)
    resp = client.post("/api/billing/webhook", content=b"{}", headers={"Stripe-Signature": "t=1,v1=x"})

    assert resp.status_code == 200
    with Session(database.engine) as s:
        assert s.get(User, uid).is_premium is True
    assert _delivery_count(uid) == 0


# ── User deletion (FK order, #21) ────────────────────────────────────────────

def test_deleting_a_user_with_deliveries_and_achievements_succeeds(client):
    email = "inbox-delete-me@example.com"
    uid = _user_id(client, email)
    _seed([uid], title="Bye")
    _award(uid, streak=7)

    with enforce_foreign_keys():
        resp = client.delete(f"/api/admin/users/{uid}", headers=auth(SUPERADMIN_EMAIL))
    assert resp.status_code == 200
    with Session(database.engine) as s:
        assert s.get(User, uid) is None
        assert s.exec(select(InboxDelivery).where(InboxDelivery.user_id == uid)).first() is None
        assert s.exec(select(UserAchievement).where(UserAchievement.user_id == uid)).first() is None


# ── Neon round-trip guards ───────────────────────────────────────────────────

def test_warm_reads_issue_no_statements(client):
    email = "inbox-warm@example.com"
    uid = _user_id(client, email)
    for i in range(3):
        _seed([uid], title=f"W{i}", created_at=_utcnow() - timedelta(minutes=i))
    did = _delivery_id(uid, _seed([uid], title="Detail"))

    # Warm-up pass populates the auth, delivery-row and message-content caches.
    client.get("/api/me/inbox/unread-count", headers=auth(email))
    client.get("/api/me/inbox?limit=2&offset=0", headers=auth(email))
    client.get("/api/me/inbox?limit=2&offset=2", headers=auth(email))
    client.get(f"/api/me/inbox/{did}", headers=auth(email))

    with _count_statements() as count:
        client.get("/api/me/inbox/unread-count", headers=auth(email))
        client.get("/api/me/inbox?limit=2&offset=0", headers=auth(email))
        client.get("/api/me/inbox?limit=2&offset=2", headers=auth(email))
        client.get(f"/api/me/inbox/{did}", headers=auth(email))
    assert count() == 0


def test_an_action_costs_one_write_plus_at_most_one_reload(client):
    email = "inbox-action-cost@example.com"
    uid = _user_id(client, email)
    did = _delivery_id(uid, _seed([uid], title="Cost"))
    client.get("/api/me/inbox", headers=auth(email))     # warm rows + message content

    with _count_statements() as count:
        _act(client, email, "read", ids=[did])
    assert count() <= 2

    with _count_statements() as count:
        client.get("/api/me/inbox", headers=auth(email))
    assert count() == 0          # the action's reload already refilled the cache


def test_stats_costs_nothing_extra_once_achievements_are_warm(client):
    email = "inbox-stats-cost@example.com"
    _user_id(client, email)
    client.get("/api/me/stats", headers=auth(email))       # grandfathering pass + warm-up
    client.get("/api/me/stats", headers=auth(email))

    with _count_statements() as count:
        client.get("/api/me/stats", headers=auth(email))
    with_achievements = count()

    cache.clear()
    client.get("/api/me/stats", headers=auth(email))
    with patch.object(inbox_service, "award_achievements", lambda session, user, stats: 0):
        with _count_statements() as count:
            client.get("/api/me/stats", headers=auth(email))
        without = count()
    assert with_achievements == without


def test_admin_send_costs_the_same_for_3_and_30_recipients(client):
    few = [_user_id(client, f"inbox-bulk-few-{i}@example.com") for i in range(3)]
    many = [_user_id(client, f"inbox-bulk-many-{i}@example.com") for i in range(30)]
    _admin_send(client, audience="users", user_ids=few)     # warm the superadmin auth cache

    with _count_statements() as count:
        _admin_send(client, audience="users", user_ids=few)
    small = count()
    with _count_statements() as count:
        _admin_send(client, audience="users", user_ids=many)
    big = count()
    assert small == big


# ── Cache correctness ────────────────────────────────────────────────────────

def test_a_send_shows_up_in_the_recipients_next_read(client):
    email = "inbox-cache-send@example.com"
    uid = _user_id(client, email)
    assert client.get("/api/me/inbox/unread-count", headers=auth(email)).json()["unread"] == 0

    _admin_send(client, audience="users", user_ids=[uid], title_en="Fresh")
    assert client.get("/api/me/inbox/unread-count", headers=auth(email)).json()["unread"] == 1
    assert client.get("/api/me/inbox", headers=auth(email)).json()["items"][0]["title_en"] == "Fresh"


def test_a_send_only_evicts_its_own_recipients(client):
    mine = "inbox-cache-narrow-mine@example.com"
    other = "inbox-cache-narrow-other@example.com"
    my_id = _user_id(client, mine)
    _user_id(client, other)
    client.get("/api/me/inbox/unread-count", headers=auth(other))    # warm the bystander

    _admin_send(client, audience="users", user_ids=[my_id], title_en="Only mine")
    with _count_statements() as count:
        assert client.get("/api/me/inbox/unread-count", headers=auth(other)).json()["unread"] == 0
    assert count() == 0          # the bystander's cached inbox survived


def test_a_rolled_back_send_leaves_no_phantom_in_the_cache(client):
    email = "inbox-cache-rollback@example.com"
    uid = _user_id(client, email)
    client.get("/api/me/inbox/unread-count", headers=auth(email))

    with Session(database.engine) as s:
        inbox_service.send(s, [uid], kind="info", source="admin",
                           title_ru="Фантом", title_en="Phantom")
        s.rollback()

    assert client.get("/api/me/inbox/unread-count", headers=auth(email)).json()["unread"] == 0
    cache.clear()
    assert client.get("/api/me/inbox/unread-count", headers=auth(email)).json()["unread"] == 0


def test_an_expired_ttl_reloads_from_the_db(client, monkeypatch):
    email = "inbox-cache-ttl@example.com"
    uid = _user_id(client, email)
    client.get("/api/me/inbox/unread-count", headers=auth(email))

    # Write straight through a raw connection so no Session listener can evict.
    with database.engine.connect() as conn:
        conn.exec_driver_sql(
            "INSERT INTO inbox_message (kind, source, title_ru, title_en, body_ru, body_en, created_at)"
            " VALUES ('info', 'admin', 'т', 't', '', '', CURRENT_TIMESTAMP)"
        )
        msg_id = conn.exec_driver_sql("SELECT max(id) FROM inbox_message").scalar()
        conn.exec_driver_sql(
            "INSERT INTO inbox_delivery (message_id, user_id, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
            (msg_id, uid),
        )
        conn.commit()

    assert client.get("/api/me/inbox/unread-count", headers=auth(email)).json()["unread"] == 0

    base = cache._now()
    monkeypatch.setattr(cache, "_now", lambda: base + inbox_service.DELIVERIES_TTL + 1)
    assert client.get("/api/me/inbox/unread-count", headers=auth(email)).json()["unread"] == 1


def test_actions_on_another_users_ids_change_nothing_even_when_warm(client):
    mine = "inbox-cache-cross-mine@example.com"
    theirs = "inbox-cache-cross-theirs@example.com"
    _user_id(client, mine)
    their_id = _user_id(client, theirs)
    their_delivery = _delivery_id(their_id, _seed([their_id], title="Theirs"))
    client.get("/api/me/inbox/unread-count", headers=auth(theirs))    # warm

    assert _act(client, mine, "delete", ids=[their_delivery]).json()["affected_ids"] == []
    assert client.get("/api/me/inbox/unread-count", headers=auth(theirs)).json()["unread"] == 1
    assert _delivery(their_delivery).deleted_at is None
