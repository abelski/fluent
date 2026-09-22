# Autotests for word audio (#38 prototype → #39 production): GET /api/audio.
#
# Uses TestClient + in-memory SQLite (configured in backend/conftest.py). `_generate` (or the
# httpx layer under it) is monkeypatched everywhere, and the conftest guard unsets the real
# Azure env, so no test can ever bill Azure. The real call is verified manually
# (see documentation/audio.md).

import json
import threading
from datetime import datetime, timedelta

import httpx
import pytest
from jose import jwt
from sqlmodel import Session, delete, select

import database
import routers.audio as audio
from models import AudioClip, User, Word

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"

ADMIN_EMAIL = "artyrbelski@gmail.com"

# Real `Word` rows the tests may synthesize (A2-8): the miss path 404s anything else.
WORDS = ["labas", "rytas", "vakaras", "siųsti", "jaũsti", "namas", "diena"]
ARCHIVED = "senas"


def make_token(email: str, name: str = "Test User") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _user(client, email: str) -> str:
    """Ensure the user row exists (auto-created on first authed call). Returns user id."""
    client.get("/api/me/quota", headers=auth(make_token(email)))
    with Session(database.engine) as s:
        return s.exec(select(User).where(User.email == email)).first().id


def _make_premium(client, email: str) -> dict:
    """Make `email` a Premium user; returns its auth headers."""
    user_id = _user(client, email)
    with Session(database.engine) as s:
        user = s.get(User, user_id)
        user.is_premium = True
        user.premium_until = None  # None = no expiry
        s.add(user)
        s.commit()
    return auth(make_token(email))


def _clips() -> list[AudioClip]:
    with Session(database.engine) as s:
        return list(s.exec(select(AudioClip)).all())


def _store(text: str, data: bytes, created_at: datetime | None = None) -> None:
    """Pre-insert the clip the endpoint would store for `text`."""
    spoken = audio.spoken_text(text)
    with Session(database.engine) as s:
        clip = AudioClip(key=audio._clip_key(spoken), spoken_text=spoken, data=data)
        if created_at is not None:
            clip.created_at = created_at
        s.add(clip)
        s.commit()


@pytest.fixture(autouse=True)
def _audio_env(monkeypatch):
    """A fake (but present) Azure env, empty memory + `audio_clip`, and seeded words."""
    monkeypatch.setenv("AZURE_SPEECH_KEY", "test-key")
    monkeypatch.setenv("AZURE_SPEECH_REGION", "testregion")
    monkeypatch.setattr(audio, "_cap_alerted_month", None)
    audio._mem_clear()
    with Session(database.engine) as s:
        s.exec(delete(AudioClip))
        words = [Word(lithuanian=t, translation_en="x", translation_ru="x") for t in WORDS]
        words.append(Word(lithuanian=ARCHIVED, translation_en="x", translation_ru="x", archived=True))
        s.add_all(words)
        s.commit()
        ids = [w.id for w in words]
    yield
    audio._mem_clear()
    with Session(database.engine) as s:
        s.exec(delete(AudioClip))
        s.exec(delete(Word).where(Word.id.in_(ids)))
        s.commit()


@pytest.fixture
def gen_calls(monkeypatch) -> list[str]:
    """Mock `_generate`; returns the list of spoken texts it was called with."""
    calls: list[str] = []

    def fake(spoken: str) -> bytes:
        calls.append(spoken)
        return f"MP3-{spoken}".encode()

    monkeypatch.setattr(audio, "_generate", fake)
    return calls


# ── Auth / permission gate ───────────────────────────────────────────────────

def test_401_no_token(client):
    assert client.get("/api/audio", params={"text": "labas"}).status_code == 401


def test_403_free_user(client, gen_calls):
    _user(client, "audio_free@example.com")
    r = client.get("/api/audio", params={"text": "labas"}, headers=auth(make_token("audio_free@example.com")))
    assert r.status_code == 403
    assert gen_calls == []


def test_304_still_requires_premium(client):
    _user(client, "etag_free@test.com")
    r = client.get("/api/audio", params={"text": "labas"},
                   headers={**auth(make_token("etag_free@test.com")), "If-None-Match": '"x"'})
    assert r.status_code == 403


def test_admin_allowed(client, gen_calls):
    r = client.get("/api/audio", params={"text": "rytas"}, headers=auth(make_token(ADMIN_EMAIL, name="Artur")))
    assert r.status_code == 200
    assert r.content == b"MP3-rytas"


# ── DB storage: miss → row, then memory, then DB ─────────────────────────────

def test_miss_inserts_a_row_and_a_repeat_comes_from_memory(client, gen_calls):
    h = _make_premium(client, "audio_miss@example.com")

    r1 = client.get("/api/audio", params={"text": "labas"}, headers=h)
    assert r1.status_code == 200
    assert r1.headers["content-type"].startswith("audio/mpeg")
    assert r1.content == b"MP3-labas"
    assert gen_calls == ["labas"]
    [clip] = _clips()
    assert clip.spoken_text == "labas" and clip.data == b"MP3-labas"
    assert clip.key == audio._clip_key("labas")

    with Session(database.engine) as s:  # gone from the DB → the repeat can only be memory
        s.exec(delete(AudioClip))
        s.commit()
    r2 = client.get("/api/audio", params={"text": "labas"}, headers=h)
    assert r2.status_code == 200 and r2.content == b"MP3-labas"
    assert gen_calls == ["labas"]


def test_after_a_memory_clear_the_repeat_comes_from_the_db(client, gen_calls):
    h = _make_premium(client, "audio_db@example.com")
    assert client.get("/api/audio", params={"text": "labas"}, headers=h).status_code == 200
    audio._mem_clear()

    r = client.get("/api/audio", params={"text": "labas"}, headers=h)
    assert r.status_code == 200 and r.content == b"MP3-labas"
    assert gen_calls == ["labas"]  # not generated again
    assert audio._mem_get(audio._clip_key("labas")) == b"MP3-labas"  # and back in memory


# ── Only real, non-archived words are synthesized ────────────────────────────

@pytest.mark.parametrize("text", ["notaword", ARCHIVED])
def test_unknown_or_archived_word_is_404_without_generating(client, gen_calls, text):
    h = _make_premium(client, "audio_404@example.com")
    r = client.get("/api/audio", params={"text": text}, headers=h)
    assert r.status_code == 404
    assert gen_calls == [] and _clips() == []


def test_text_longer_than_60_chars_is_422(client, gen_calls):
    h = _make_premium(client, "audio_len@example.com")
    assert client.get("/api/audio", params={"text": "a" * 61}, headers=h).status_code == 422
    assert gen_calls == []


# ── Missing Azure env: 503 on the miss path only (A2-12) ─────────────────────

def test_no_azure_env_a_miss_is_503(client, gen_calls, monkeypatch):
    h = _make_premium(client, "audio_nokey@example.com")
    monkeypatch.delenv("AZURE_SPEECH_KEY")
    assert client.get("/api/audio", params={"text": "labas"}, headers=h).status_code == 503
    monkeypatch.setenv("AZURE_SPEECH_KEY", "test-key")
    monkeypatch.delenv("AZURE_SPEECH_REGION")
    assert client.get("/api/audio", params={"text": "labas"}, headers=h).status_code == 503
    assert gen_calls == []


def test_no_azure_env_a_stored_clip_still_plays(client, gen_calls, monkeypatch):
    h = _make_premium(client, "audio_nokey_stored@example.com")
    _store("labas", b"STORED")
    monkeypatch.delenv("AZURE_SPEECH_KEY")
    monkeypatch.delenv("AZURE_SPEECH_REGION")
    r = client.get("/api/audio", params={"text": "labas"}, headers=h)
    assert r.status_code == 200 and r.content == b"STORED"
    assert gen_calls == []


# ── Concurrency guards (A1-2, A2-5) ──────────────────────────────────────────

def test_semaphore_full_is_an_immediate_503(client, gen_calls, monkeypatch):
    h = _make_premium(client, "audio_sem@example.com")
    slots = threading.BoundedSemaphore(1)
    monkeypatch.setattr(audio, "_GENERATION_SLOTS", slots)
    assert slots.acquire(blocking=False)  # every slot taken
    try:
        r = client.get("/api/audio", params={"text": "labas"}, headers=h)
    finally:
        slots.release()
    assert r.status_code == 503
    assert gen_calls == []


def test_busy_lock_is_a_503_without_generating(client, gen_calls, monkeypatch):
    h = _make_premium(client, "audio_lock@example.com")
    monkeypatch.setattr(audio, "_LOCK_TIMEOUT", 0.1)
    slots = threading.BoundedSemaphore(4)
    monkeypatch.setattr(audio, "_GENERATION_SLOTS", slots)
    assert audio._GENERATION_LOCK.acquire(blocking=False)
    try:
        r = client.get("/api/audio", params={"text": "labas"}, headers=h)
    finally:
        audio._GENERATION_LOCK.release()
    assert r.status_code == 503
    assert gen_calls == []
    # The slot was given back (a leaked one would be a 5th-request 503 forever).
    assert all(slots.acquire(blocking=False) for _ in range(4))


def test_no_open_transaction_while_generating(client, monkeypatch):
    h = _make_premium(client, "audio_tx@example.com")
    sessions: list[Session] = []

    def recording_session():
        with Session(database.engine) as s:
            sessions.append(s)
            yield s

    monkeypatch.setitem(client.app.dependency_overrides, database.get_session, recording_session)
    seen: list[bool] = []

    def fake(spoken: str) -> bytes:
        seen.append(sessions[-1].in_transaction())
        return b"MP3"

    monkeypatch.setattr(audio, "_generate", fake)
    assert client.get("/api/audio", params={"text": "labas"}, headers=h).status_code == 200
    assert seen == [False]


def test_a_concurrent_insert_of_the_same_key_is_not_an_error(client, monkeypatch):
    """Another process stores the same clip between the re-check and our insert (A2-4)."""
    h = _make_premium(client, "audio_dup@example.com")

    def fake(spoken: str) -> bytes:
        _store("labas", b"OTHER")
        return b"OURS"

    monkeypatch.setattr(audio, "_generate", fake)
    r = client.get("/api/audio", params={"text": "labas"}, headers=h)
    assert r.status_code == 200 and r.content == b"OURS"
    [clip] = _clips()
    assert clip.data == b"OTHER"


# ── Azure response validation (A1-5) ─────────────────────────────────────────

def _fake_post(monkeypatch, response: httpx.Response | Exception) -> list[dict]:
    calls: list[dict] = []

    def post(url, **kwargs):
        calls.append({"url": url, **kwargs})
        if isinstance(response, Exception):
            raise response
        return response

    monkeypatch.setattr(audio.httpx, "post", post)
    return calls


@pytest.mark.parametrize("response", [
    httpx.Response(500, content=b"err", headers={"content-type": "audio/mpeg"}),
    httpx.Response(200, content=b"", headers={"content-type": "audio/mpeg"}),
    httpx.Response(200, content=b"<html/>", headers={"content-type": "text/html"}),
    httpx.ConnectTimeout("timed out"),
])
def test_bad_azure_response_is_502_and_stores_nothing(client, monkeypatch, response):
    h = _make_premium(client, "audio_502@example.com")
    _fake_post(monkeypatch, response)
    r = client.get("/api/audio", params={"text": "vakaras"}, headers=h)
    assert r.status_code == 502
    assert _clips() == []
    assert audio._mem_get(audio._clip_key("vakaras")) is None


def test_azure_request_shape(client, monkeypatch):
    h = _make_premium(client, "audio_req@example.com")
    calls = _fake_post(monkeypatch, httpx.Response(200, content=b"ID3", headers={"content-type": "audio/mpeg"}))
    r = client.get("/api/audio", params={"text": "jaũsti"}, headers=h)
    assert r.status_code == 200 and r.content == b"ID3"
    [call] = calls
    assert call["url"] == "https://testregion.tts.speech.microsoft.com/cognitiveservices/v1"
    assert call["headers"]["Ocp-Apim-Subscription-Key"] == "test-key"
    assert call["headers"]["X-Microsoft-OutputFormat"] == "audio-24khz-48kbitrate-mono-mp3"
    assert call["content"].decode() == audio._ssml("jausti")  # stress mark stripped
    assert call["timeout"] == 10.0


def test_ssml_escapes_markup():
    ssml = audio._ssml("a & <b>x</b>")
    assert "a &amp; &lt;b&gt;x&lt;/b&gt;" in ssml
    assert "<b>" not in ssml
    assert ssml.startswith("<speak version='1.0' xml:lang='lt-LT'><voice name='lt-LT-LeonasNeural'>")


# ── Monthly caps (A2-2) ──────────────────────────────────────────────────────

def test_char_cap_stops_new_words_without_calling_azure(client, gen_calls, monkeypatch, _telegram_spy):
    h = _make_premium(client, "audio_charcap@example.com")
    _store("labas", b"12345")  # 5 chars this month
    monkeypatch.setenv("AUDIO_MONTHLY_CHAR_CAP", "9")  # 5 + len("rytas") = 10 > 9
    r = client.get("/api/audio", params={"text": "rytas"}, headers=h)
    assert r.status_code == 503 and r.json()["detail"] == "Audio limit reached."
    assert gen_calls == []
    monkeypatch.setenv("AUDIO_MONTHLY_CHAR_CAP", "10")  # exactly at the cap is still allowed
    assert client.get("/api/audio", params={"text": "rytas"}, headers=h).status_code == 200


def test_byte_cap_stops_new_words_without_calling_azure(client, gen_calls, monkeypatch):
    h = _make_premium(client, "audio_bytecap@example.com")
    _store("labas", b"0123456789")
    monkeypatch.setenv("AUDIO_MONTHLY_BYTE_CAP", "10")
    r = client.get("/api/audio", params={"text": "rytas"}, headers=h)
    assert r.status_code == 503
    assert gen_calls == []


def test_stored_clips_are_served_past_the_caps(client, gen_calls, monkeypatch):
    h = _make_premium(client, "audio_capstored@example.com")
    _store("labas", b"STORED")
    monkeypatch.setenv("AUDIO_MONTHLY_CHAR_CAP", "0")
    monkeypatch.setenv("AUDIO_MONTHLY_BYTE_CAP", "0")
    r1 = client.get("/api/audio", params={"text": "labas"}, headers=h)
    assert r1.status_code == 200 and r1.content == b"STORED"
    r2 = client.get("/api/audio", params={"text": "labas"}, headers={**h, "If-None-Match": r1.headers["etag"]})
    assert r2.status_code == 304
    assert gen_calls == []


def test_last_months_clips_do_not_count(client, gen_calls, monkeypatch):
    h = _make_premium(client, "audio_capmonth@example.com")
    last_month = (audio._month_start() - timedelta(days=1)).replace(day=15)
    _store("labas", b"x" * 100, created_at=last_month)
    monkeypatch.setenv("AUDIO_MONTHLY_CHAR_CAP", "5")
    monkeypatch.setenv("AUDIO_MONTHLY_BYTE_CAP", "50")
    assert client.get("/api/audio", params={"text": "rytas"}, headers=h).status_code == 200
    assert gen_calls == ["rytas"]


def test_cap_alert_fires_once_per_month(client, gen_calls, monkeypatch, _telegram_spy):
    h = _make_premium(client, "audio_capalert@example.com")
    monkeypatch.setenv("AUDIO_MONTHLY_CHAR_CAP", "1")
    for text in ["labas", "rytas", "labas"]:
        assert client.get("/api/audio", params={"text": text}, headers=h).status_code == 503
    alerts = [m for m in _telegram_spy if "audio monthly cap" in m]
    assert len(alerts) == 1 and "chars 0/1" in alerts[0]

    monkeypatch.setattr(audio, "_cap_alerted_month", "1999-01")  # a new month
    assert client.get("/api/audio", params={"text": "rytas"}, headers=h).status_code == 503
    assert len([m for m in _telegram_spy if "audio monthly cap" in m]) == 2
    assert gen_calls == []


# ── spoken_text ───────────────────────────────────────────────────────────────

def test_spoken_text_normalizes_separators():
    assert audio.spoken_text("vyras / moteris") == "vyras, moteris"
    assert audio.spoken_text("esu, būnu") == "esu, būnu"
    assert audio.spoken_text("labas") == "labas"
    assert audio.spoken_text("  rytas  ") == "rytas"


def test_memory_cap_evicts_least_recently_used(monkeypatch):
    monkeypatch.setattr(audio, "_MEM_MAX_BYTES", 10)
    audio._mem_put("a", b"12345")
    audio._mem_put("b", b"12345")
    assert audio._mem_get("a") == b"12345"  # touch "a" so "b" is now the oldest
    audio._mem_put("c", b"12345")            # 15 bytes > 10 → evict the oldest ("b")
    assert audio._mem_get("b") is None
    assert audio._mem_get("a") == b"12345" and audio._mem_get("c") == b"12345"
    assert audio._mem_bytes == 10


# ── Stress marks in the display text ("jaũsti") must not reach the TTS ──

def test_spoken_text_strips_stress_marks_but_keeps_lithuanian_letters():
    assert audio.spoken_text("jaũsti") == "jausti"
    assert audio.spoken_text("nãmas / nãmai") == "namas, namai"
    assert audio.spoken_text("kélias, kelià") == "kelias, kelia"
    # ą č ę ė į š ų ū ž are real letters, not stress marks: untouched.
    assert audio.spoken_text("ąčęėįšųūž ĄČĘĖĮŠŲŪŽ") == "ąčęėįšųūž ĄČĘĖĮŠŲŪŽ"


def _key(text: str) -> str:
    return audio._clip_key(audio.spoken_text(text))


def test_cache_key_follows_the_spoken_text():
    assert _key("jaũsti") == _key("jausti")
    assert _key("jausti") != _key("jaustis")


def test_cache_key_includes_the_voice(monkeypatch):
    before = _key("jausti")
    monkeypatch.setattr(audio, "_AZURE_VOICE", "lt-LT-OnaNeural")
    assert _key("jausti") != before  # a voice change never serves the old voice's clip


# ── Pronunciation fixes (backend/data/pronunciation.json) ──

def _fixes(monkeypatch, tmp_path, fixes: dict[str, str]) -> None:
    """Point the config at a temp file holding `fixes`. A new path forces a reload."""
    path = tmp_path / f"pronunciation-{len(list(tmp_path.glob('pronunciation-*')))}.json"
    path.write_text(json.dumps({"fixes": [{"from": k, "to": v} for k, v in fixes.items()]}), encoding="utf-8")
    monkeypatch.setattr(audio, "_PRONUNCIATION_FILE", path)
    monkeypatch.setattr(audio, "_respell_loaded", (-1.0, {}))


def test_respell_applies_case_insensitively_and_inside_longer_words(monkeypatch, tmp_path):
    _fixes(monkeypatch, tmp_path, {"siųsti": "sjūsti"})
    assert audio.spoken_text("siųsti") == "sjūsti"
    assert audio.spoken_text("Siųsti") == "sjūsti"
    assert audio.spoken_text("išsiųsti") == "išsjūsti"
    assert audio.spoken_text("sių̃sti / siųsti") == "sjūsti, sjūsti"  # after stress marks go
    assert audio.spoken_text("labas") == "labas"


def test_config_keys_are_normalized(monkeypatch, tmp_path):
    # An upper-case or stress-marked "from" still matches (and never KeyErrors at match time).
    _fixes(monkeypatch, tmp_path, {"Jaũsti": "jausti-fixed"})
    assert audio.spoken_text("jausti") == "jausti-fixed"


def test_missing_config_means_no_fixes(monkeypatch, tmp_path):
    monkeypatch.setattr(audio, "_PRONUNCIATION_FILE", tmp_path / "nope.json")
    assert audio.spoken_text("siųsti") == "siųsti"


def test_respell_changes_the_cache_key_so_a_fix_regenerates(monkeypatch, tmp_path):
    _fixes(monkeypatch, tmp_path, {})
    before = _key("siųsti")
    _fixes(monkeypatch, tmp_path, {"siųsti": "sjūsti"})
    assert _key("siųsti") != before


def test_the_shipped_config_is_valid():
    data = json.loads(audio._PRONUNCIATION_FILE.read_text(encoding="utf-8"))
    for fix in data["fixes"]:
        assert fix["from"].strip() and fix["to"].strip(), fix


def test_etag_revalidation_returns_304_until_the_spoken_text_changes(client, gen_calls, monkeypatch, tmp_path):
    h = _make_premium(client, "etag@test.com")
    _fixes(monkeypatch, tmp_path, {})

    r1 = client.get("/api/audio", params={"text": "siųsti"}, headers=h)
    etag = r1.headers["etag"]
    assert r1.headers["cache-control"] == "private, no-cache"

    r2 = client.get("/api/audio", params={"text": "siųsti"}, headers={**h, "If-None-Match": etag})
    assert r2.status_code == 304 and r2.content == b""

    _fixes(monkeypatch, tmp_path, {"siųsti": "sjūsti"})  # a fix lands
    r3 = client.get("/api/audio", params={"text": "siųsti"}, headers={**h, "If-None-Match": etag})
    assert r3.status_code == 200 and r3.content == "MP3-sjūsti".encode()
