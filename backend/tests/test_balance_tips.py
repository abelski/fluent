"""#57 — balance tips: rule, copy, two-phase send, race guard, opt-out, admin switch.

The in-memory SQLite DB is shared with every other test file, so leftover users from
other tests can be flagged too. Tests that call `send_balance_tips` narrow
`find_flagged` to this file's users (the real query still runs); rule tests filter
`find_flagged`'s result the same way.
"""
from datetime import datetime, timedelta

import pytest
from jose import jwt
from sqlmodel import Session, select

import balance_service
import scheduler
from conftest import _test_engine, enforce_foreign_keys
from email_templates import build_premium_upsell
from models import (
    AppSetting, BalanceTip, BalanceTipOptOut, GrammarLessonResult, InboxDelivery, InboxMessage,
    PracticeExamResult, User, UserPhraseProgress, UserWordProgress,
)

_P = "bal57-"
ADMIN = {"Authorization": "Bearer " + jwt.encode(
    {"email": "artyrbelski@gmail.com", "name": "x", "picture": None},
    "fluent-local-secret-change-in-prod", algorithm="HS256")}


def _now() -> datetime:
    return datetime.utcnow()


def _auth(uid: str) -> dict:
    token = jwt.encode({"email": f"{uid}@example.com", "name": "x", "picture": None},
                       "fluent-local-secret-change-in-prod", algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


def _wipe() -> None:
    with Session(_test_engine) as s:
        uids = [u.id for u in s.exec(select(User).where(User.id.like(f"{_P}%"))).all()]
        for model in (UserWordProgress, UserPhraseProgress, GrammarLessonResult, PracticeExamResult,
                      BalanceTip, BalanceTipOptOut):
            for row in s.exec(select(model).where(model.user_id.in_(uids))).all():
                s.delete(row)
        for d in s.exec(select(InboxDelivery).where(InboxDelivery.user_id.in_(uids))).all():
            s.delete(d)
        for m in s.exec(select(InboxMessage).where(InboxMessage.source == "balance")).all():
            s.delete(m)
        for uid in uids:
            s.delete(s.get(User, uid))
        for row in s.exec(select(AppSetting).where(AppSetting.key == "auto_send_balance_tips")).all():
            s.delete(row)
        s.commit()


@pytest.fixture(autouse=True)
def _clean():
    _wipe()
    yield
    _wipe()


@pytest.fixture
def only_mine(monkeypatch):
    real = balance_service.find_flagged
    monkeypatch.setattr(balance_service, "find_flagged",
                        lambda s, now: [f for f in real(s, now) if f["user_id"].startswith(_P)])


def _user(name: str, *, known=0, words_recent=0, phrases=0, grammar=0, practice=0,
          lang="ru", consent=True, premium=False, admin=False) -> str:
    """Seed a user. `known` words are old (outside the window); `words_recent` are 'learning'
    words seen today (1 point each); `phrases` stage-1 phrases today; `grammar` passed lessons."""
    uid = _P + name
    now, old = _now(), _now() - timedelta(days=60)
    with Session(_test_engine) as s:
        s.add(User(id=uid, email=f"{uid}@example.com", name=name, lang=lang, email_consent=consent,
                   is_premium=premium, is_admin=admin))
        for i in range(known):
            s.add(UserWordProgress(user_id=uid, word_id=50000 + i, status="known", last_seen=old))
        for i in range(words_recent):
            s.add(UserWordProgress(user_id=uid, word_id=60000 + i, status="learning", last_seen=now))
        for i in range(phrases):
            s.add(UserPhraseProgress(user_id=uid, phrase_id=50000 + i, lesson_stage=1, last_seen=now))
        for i in range(grammar):
            s.add(GrammarLessonResult(user_id=uid, lesson_id=900 + i, score=5, total=5, passed=True,
                                      created_at=now))
        for i in range(practice):
            s.add(PracticeExamResult(user_id=uid, test_id=900 + i, score=5, total=5, created_at=now))
        s.commit()
    return uid


def _flagged() -> dict:
    with Session(_test_engine) as s:
        return {f["user_id"]: f["reasons"] for f in balance_service.find_flagged(s, _now())
                if f["user_id"].startswith(_P)}


def _send() -> dict:
    with Session(_test_engine) as s:
        return balance_service.send_balance_tips(s, _now())


def _tips(uid: str) -> list[BalanceTip]:
    with Session(_test_engine) as s:
        return s.exec(select(BalanceTip).where(BalanceTip.user_id == uid)).all()


def _inbox(uid: str) -> list[InboxMessage]:
    with Session(_test_engine) as s:
        return s.exec(select(InboxMessage).join(InboxDelivery, InboxDelivery.message_id == InboxMessage.id)
                      .where(InboxDelivery.user_id == uid)).all()


def _mail_to(spy, uid):
    return [m for m in spy if m[0] == f"{uid}@example.com"]


# ── Rule ─────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("args,expected", [
    ((10, 5, 0, 151), ["grammar"]),
    ((10, 5, 0, 150), []),
    ((10, 0, 5, 151), ["phrases"]),
    ((10, 0, 5, 150), []),
    ((0, 5, 5, 0), ["words"]),
    ((0, 5, 5, 500), ["words"]),
    ((0, 0, 5, 151), ["phrases", "words"]),
    ((10, 0, 0, 151), ["grammar", "phrases"]),
    ((10, 3, 5, 999), []),
])
def test_balance_reasons_table(args, expected):
    assert balance_service.balance_reasons(*args) == expected


def test_find_flagged_boundaries_and_activity():
    g151 = _user("g151", known=151, phrases=3)          # words 0 too (known words are old)
    g150 = _user("g150", known=150, words_recent=1, phrases=3)
    words0 = _user("words0", grammar=1)
    fine = _user("fine", known=200, words_recent=2, phrases=2, grammar=1)
    idle = _user("idle", known=500)                     # 0 points in window
    practice_only = _user("practice", practice=3)       # practice excluded from the balance
    flagged = _flagged()
    assert flagged[g151] == ["grammar", "words"]
    assert g150 not in flagged
    assert flagged[words0] == ["words"]
    assert fine not in flagged
    assert idle not in flagged
    assert practice_only not in flagged


def test_opt_out_excluded():
    uid = _user("optout", grammar=1)
    with Session(_test_engine) as s:
        s.add(BalanceTipOptOut(user_id=uid))
        s.commit()
    assert uid not in _flagged()


@pytest.mark.parametrize("days_ago,expect_sent", [(13, False), (14, True)])
def test_cooldown_on_sent_on(days_ago, expect_sent, only_mine):
    uid = _user(f"cool{days_ago}", grammar=1)
    with Session(_test_engine) as s:
        s.add(BalanceTip(user_id=uid, sent_on=_now().date() - timedelta(days=days_ago), reasons="words"))
        s.commit()
    _send()
    assert len(_tips(uid)) == (2 if expect_sent else 1)


# ── Send ─────────────────────────────────────────────────────────────────────

def test_one_message_for_multiple_reasons_cta_order(only_mine, _email_spy, _telegram_spy):
    uid2 = _user("multi", known=151, words_recent=4)    # grammar 0 + phrases 0
    result = _send()
    msgs = _inbox(uid2)
    assert len(msgs) == 1
    m = msgs[0]
    assert m.source == "balance" and m.kind == "info"
    assert m.title_ru == "Пара направлений ждёт вас"
    assert m.title_en == "A couple of directions are waiting for you"
    assert m.cta_url == "/dashboard/grammar"
    assert (m.cta_label_ru, m.cta_label_en) == ("К грамматике", "Go to grammar")
    assert "За 14 дней: слова 100%, фразы 0%, грамматика 0%." in m.body_ru
    assert "https://fluent.lt/dashboard/articles/how-to-learn-lithuanian-order/" in m.body_en
    assert "https://fluent.lt/dashboard/settings/?tab=other" in m.body_ru
    assert "Open grammar" not in m.body_en                # inbox has the CTA button instead
    tip = _tips(uid2)[0]
    assert (tip.reasons, tip.words_pct, tip.phrases_pct, tip.grammar_pct) == ("grammar,phrases", 100, 0, 0)
    assert tip.emailed is True
    assert result["inbox"] == 1 and result["email"] == 1
    assert _telegram_spy == ["⚖️ Balance tips: inbox=1 email=1 failed=0"]


@pytest.mark.parametrize("seed,cta", [
    (dict(known=151, words_recent=1, phrases=1), "/dashboard/grammar"),
    (dict(known=151, words_recent=1, grammar=1), "/dashboard/phrases"),
    (dict(phrases=1, grammar=1), "/dashboard/lists"),
])
def test_cta_follows_first_reason(seed, cta, only_mine):
    uid = _user("cta", **seed)
    _send()
    assert _inbox(uid)[0].cta_url == cta


def test_email_copy_by_lang_and_upsell(only_mine, _email_spy):
    ru = _user("ru", grammar=3, phrases=1, lang="ru")               # words 0 → one reason
    en = _user("en", grammar=3, phrases=1, lang="en")
    xx = _user("xx", grammar=3, phrases=1, lang="de")
    prem = _user("prem", grammar=3, phrases=1, lang="en", premium=True)
    adm = _user("adm", grammar=3, phrases=1, lang="en", admin=True)
    _send()
    (_, subj_ru, body_ru), = _mail_to(_email_spy, ru)
    (_, subj_en, body_en), = _mail_to(_email_spy, en)
    (_, subj_xx, body_xx), = _mail_to(_email_spy, xx)
    assert subj_ru == "Не забывайте про слова"
    assert subj_en == "Don't forget words"
    assert subj_xx == subj_ru and body_xx == body_ru
    # 3 lessons × 5 = 15, 1 phrase = 1 → 94% / 6%
    assert "За 14 дней: слова 0%, фразы 6%, грамматика 94%." in body_ru
    assert "Last 14 days: words 0%, phrases 6%, grammar 94%." in body_en
    assert "Открыть слова: https://fluent.lt/dashboard/lists/" in body_ru
    assert "Open words: https://fluent.lt/dashboard/lists/" in body_en
    assert build_premium_upsell("ru", "generic") in body_ru
    assert build_premium_upsell("en", "generic") in body_en
    (_, _, body_prem), = _mail_to(_email_spy, prem)
    assert build_premium_upsell("en", "generic") not in body_prem
    assert len(_mail_to(_email_spy, adm)) == 1
    assert _inbox(prem) and _inbox(adm)


def test_one_reason_subject_per_direction():
    for reason, ru, en in (("grammar", "Не забывайте про грамматику", "Don't forget grammar"),
                           ("phrases", "Не забывайте про фразы", "Don't forget phrases")):
        pts = {"words": 1, "phrases": 1, "grammar": 1}
        assert balance_service.build_copy("ru", [reason], pts)["subject"] == ru
        assert balance_service.build_copy("en", [reason], pts)["subject"] == en


def test_email_only_with_consent(only_mine, _email_spy):
    uid = _user("noconsent", grammar=1, consent=False)
    _send()
    assert _inbox(uid)
    assert _mail_to(_email_spy, uid) == []
    assert _tips(uid)[0].emailed is False


def test_smtp_failure_keeps_inbox_and_claim(only_mine, monkeypatch):
    import email_service

    def boom(to, subject, body):
        raise RuntimeError("smtp down")
    monkeypatch.setattr(email_service, "send_email", boom)
    uid = _user("smtpfail", grammar=1)
    result = _send()
    assert result["failed"] == 1
    assert _inbox(uid)
    tips = _tips(uid)
    assert len(tips) == 1 and tips[0].emailed is False
    _send()                                               # claim is durable: no resend
    assert len(_tips(uid)) == 1


def test_second_run_same_day_no_duplicate(only_mine, _email_spy):
    uid = _user("twice", grammar=1)
    _send()
    _send()
    assert len(_tips(uid)) == 1 and len(_inbox(uid)) == 1 and len(_mail_to(_email_spy, uid)) == 1


def test_race_unique_guard(monkeypatch, _email_spy):
    """Another instance claims the user between our flagged query and our insert."""
    uid = _user("race", grammar=1)
    real = balance_service.find_flagged

    def racing(session, now):
        flagged = [f for f in real(session, now) if f["user_id"] == uid]
        session.add(BalanceTip(user_id=uid, sent_on=now.date(), reasons="words"))
        session.flush()
        return flagged
    monkeypatch.setattr(balance_service, "find_flagged", racing)
    result = _send()
    assert result["inbox"] == 0
    assert len(_tips(uid)) == 1
    assert _inbox(uid) == []
    assert _mail_to(_email_spy, uid) == []


def test_print_email_bodies_for_review(capsys):
    """Run with -s to read the full copy before turning the admin switch on."""
    from email_templates import append_premium_upsell
    pts = {"words": 40, "phrases": 0, "grammar": 0}
    for lang in ("ru", "en"):
        c = balance_service.build_copy(lang, ["grammar", "phrases"], pts)
        for premium in (False, True):
            with capsys.disabled():
                print(f"\n===== {lang} premium={premium} =====\nSubject: {c['subject']}\n")
                print(append_premium_upsell(c["email_body"], premium, lang, "generic"))
    c = balance_service.build_copy("en", ["words"], {"words": 0, "phrases": 1, "grammar": 5})
    assert c["subject"] == "Don't forget words"


# ── Scheduler switch ─────────────────────────────────────────────────────────

def test_job_off_by_default(only_mine, _email_spy):
    uid = _user("switchoff", grammar=1)
    scheduler.send_balance_tips_job()
    assert _tips(uid) == [] and _inbox(uid) == [] and _mail_to(_email_spy, uid) == []


def test_job_runs_when_switch_on(only_mine, client):
    uid = _user("switchon", grammar=1)
    body = {"auto_send_inactive_emails": True, "auto_send_weekly_rewards": True,
            "auto_send_balance_tips": True}
    assert client.patch("/api/admin/settings/auto-send", json=body, headers=ADMIN).status_code == 200
    scheduler.send_balance_tips_job()
    assert len(_tips(uid)) == 1


# ── Endpoints ────────────────────────────────────────────────────────────────

def test_admin_auto_send_default_false(client):
    r = client.get("/api/admin/settings/auto-send", headers=ADMIN)
    assert r.status_code == 200
    assert r.json()["auto_send_balance_tips"] is False


def test_settings_round_trip(client):
    uid = _user("settings")
    h = _auth(uid)
    assert client.get("/api/me/settings", headers=h).json()["balance_tips"] is True
    base = {"words_per_session": 10, "new_words_ratio": 0.5, "lang": "ru"}
    r = client.patch("/api/me/settings", json={**base, "balance_tips": False}, headers=h)
    assert r.status_code == 200 and r.json()["balance_tips"] is False
    assert client.get("/api/me/settings", headers=h).json()["balance_tips"] is False
    assert uid not in _flagged()                          # opt-out row written
    r = client.patch("/api/me/settings", json=base, headers=h)       # omitted → unchanged
    assert r.json()["balance_tips"] is False
    assert client.get("/api/me/settings", headers=h).json()["balance_tips"] is False
    r = client.patch("/api/me/settings", json={**base, "balance_tips": True}, headers=h)
    assert r.json()["balance_tips"] is True
    r = client.patch("/api/me/settings", json=base, headers=h)
    assert r.json()["balance_tips"] is True


def test_user_delete_removes_balance_rows(client):
    uid = _user("delete")
    with Session(_test_engine) as s:
        s.add(BalanceTip(user_id=uid, sent_on=_now().date(), reasons="words"))
        s.add(BalanceTipOptOut(user_id=uid))
        s.commit()
    with enforce_foreign_keys():
        assert client.delete(f"/api/admin/users/{uid}", headers=ADMIN).status_code == 200
    assert _tips(uid) == []
    with Session(_test_engine) as s:
        assert s.get(BalanceTipOptOut, uid) is None
        assert s.get(User, uid) is None
