# Autotests for the one-off word-audio announcement email (#39):
# backend/scripts/send_audio_announcement.py.
#
# `email_service.send_email` is already a spy via the conftest guard (`_email_spy`), and the
# ledger path points at tmp_path, so nothing is ever mailed and the real ledger is untouched.
# The shared SQLite DB also holds other test files' users (all consented by default), so the
# assertions look at this file's own users.

import uuid

import pytest
from sqlmodel import Session, func, select

import database
import email_service
from models import PreparedMessage, User
from scripts import send_audio_announcement as announce


def _mk(email_consent=True, lang="ru", premium=False, admin=False) -> User:
    with Session(database.engine) as s:
        u = User(
            email=f"announce_{uuid.uuid4().hex[:8]}@example.com", name="Ann", lang=lang,
            email_consent=email_consent, is_premium=premium, is_admin=admin,
        )
        s.add(u)
        s.commit()
        s.refresh(u)
        return u


def _ledger_ids(path) -> list[str]:
    return path.read_text(encoding="utf-8").splitlines() if path.exists() else []


def _to(spy, email) -> list[tuple[str, str, str]]:
    return [m for m in spy if m[0] == email]


@pytest.fixture
def ledger(tmp_path):
    return tmp_path / "announcements" / "audio.sent"


def _run(ledger, send=True):
    return announce.run(send=send, ledger=ledger, pause=0, out=lambda *a: None)


def test_only_consented_users_are_mailed(ledger, _email_spy):
    yes, no = _mk(email_consent=True), _mk(email_consent=False)
    _run(ledger)
    assert len(_to(_email_spy, yes.email)) == 1
    assert _to(_email_spy, no.email) == []
    assert no.id not in _ledger_ids(ledger)


def test_dry_run_sends_nothing_and_writes_nothing(ledger, _email_spy):
    _mk()
    lines: list[str] = []
    counts = announce.run(send=False, ledger=ledger, pause=0, out=lines.append)
    assert _email_spy == []
    assert not ledger.exists() and not ledger.parent.exists()
    assert counts["recipients"] >= 1
    printed = "\n".join(lines)
    # One sample per variant: RU/EN × free/premium.
    for variant in ("RU / free", "RU / premium", "EN / free", "EN / premium"):
        assert variant in printed


def test_send_appends_one_ledger_line_per_send_and_never_touches_prepared_message(ledger, _email_spy):
    u = _mk()
    with Session(database.engine) as s:
        before = s.exec(select(func.count()).select_from(PreparedMessage)).one()
    counts = _run(ledger)
    ids = _ledger_ids(ledger)
    assert u.id in ids
    assert len(ids) == len(_email_spy) == counts["sent"]
    with Session(database.engine) as s:
        assert s.exec(select(func.count()).select_from(PreparedMessage)).one() == before


def test_a_rerun_skips_users_already_in_the_ledger(ledger, _email_spy):
    u = _mk()
    _run(ledger)
    first = len(_email_spy)
    counts = _run(ledger)
    assert len(_email_spy) == first  # nobody mailed twice
    assert counts["sent"] == 0 and counts["skipped"] >= 1
    assert _ledger_ids(ledger).count(u.id) == 1


def test_consent_withdrawn_mid_run_is_respected(ledger, _email_spy, monkeypatch):
    first, second = _mk(), _mk()
    sent: list[str] = []

    def send(to, subject, body):
        sent.append(to)
        if to == first.email:  # while the run is going, `second` opts out (another session)
            with Session(database.engine) as s:
                row = s.get(User, second.id)
                row.email_consent = False
                s.add(row)
                s.commit()

    monkeypatch.setattr(email_service, "send_email", send)
    _run(ledger)
    assert first.email in sent
    assert second.email not in sent
    assert second.id not in _ledger_ids(ledger)


def test_smtp_failure_writes_no_ledger_line_and_a_rerun_retries(ledger, _email_spy, monkeypatch):
    u = _mk()

    def flaky(to, subject, body):
        if to == u.email:
            raise RuntimeError("SMTP down")
        _email_spy.append((to, subject, body))

    monkeypatch.setattr(email_service, "send_email", flaky)
    counts = _run(ledger)
    assert counts["failed"] == 1
    assert u.id not in _ledger_ids(ledger)

    monkeypatch.setattr(email_service, "send_email", lambda to, subject, body: _email_spy.append((to, subject, body)))
    counts = _run(ledger)
    assert counts["sent"] == 1  # only the one that failed
    assert u.id in _ledger_ids(ledger)


def test_language_and_premium_variant(ledger, _email_spy):
    ru_free = _mk(lang="ru")
    en_free = _mk(lang="en")
    ru_premium = _mk(lang="ru", premium=True)
    en_admin = _mk(lang="en", admin=True)
    _run(ledger)

    [(_, subj, body)] = _to(_email_spy, ru_free.email)
    assert "произношение" in body and announce.PRICING_URL in body
    [(_, subj, body)] = _to(_email_spy, en_free.email)
    assert "pronounce" in body and announce.PRICING_URL in body
    for user in (ru_premium, en_admin):
        [(_, subj, body)] = _to(_email_spy, user.email)
        assert "/pricing" not in body
    assert "Premium" in _to(_email_spy, ru_premium.email)[0][2]
    assert "already on for you" in _to(_email_spy, en_admin.email)[0][2]
    # Every variant ends with the opt-out lines and links the article.
    for user in (ru_free, en_free, ru_premium, en_admin):
        body = _to(_email_spy, user.email)[0][2]
        assert announce.SETTINGS_URL in body and "unsubscribe" in body
        assert announce.ARTICLE_URL in body
