# Autotests for the word audio prototype (#38): GET /api/audio.
#
# Uses TestClient + in-memory SQLite (configured in backend/conftest.py). `_generate`
# (the real ElevenLabs call) is monkeypatched everywhere so no test ever spends a real
# credit; the real call itself was verified manually (see documentation/audio.md).

import json

import pytest
from jose import jwt
from sqlmodel import Session, select

import database
import routers.audio as audio
from models import User

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"

ADMIN_EMAIL = "artyrbelski@gmail.com"


def make_token(email: str, name: str = "Test User") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _user(client, email: str) -> str:
    """Ensure the user row exists (auto-created on first authed call). Returns user id."""
    client.get("/api/me/quota", headers=auth(make_token(email)))
    with Session(database.engine) as s:
        return s.exec(select(User).where(User.email == email)).first().id


def _make_premium(client, email: str) -> str:
    user_id = _user(client, email)
    with Session(database.engine) as s:
        user = s.get(User, user_id)
        user.is_premium = True
        user.premium_until = None  # None = no expiry
        s.add(user)
        s.commit()
    return user_id


@pytest.fixture(autouse=True)
def _audio_env(tmp_path, monkeypatch):
    """Every test gets its own disk cache dir and a fake (but present) API key."""
    monkeypatch.setenv("AUDIO_CACHE_DIR", str(tmp_path))
    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-key")
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "test-voice")
    audio._mem_clear()
    yield
    audio._mem_clear()


# ── Auth / permission gate ───────────────────────────────────────────────────

def test_401_no_token(client):
    r = client.get("/api/audio", params={"text": "labas"})
    assert r.status_code == 401


def test_403_free_user(client):
    email = "audio_free@example.com"
    token = make_token(email)
    _user(client, email)
    r = client.get("/api/audio", params={"text": "labas"}, headers=auth(token))
    assert r.status_code == 403


def test_admin_allowed(client, monkeypatch):
    monkeypatch.setattr(audio, "_generate", lambda text: b"ADMINBYTES")
    token = make_token(ADMIN_EMAIL, name="Artur")
    r = client.get("/api/audio", params={"text": "rytas"}, headers=auth(token))
    assert r.status_code == 200
    assert r.content == b"ADMINBYTES"


# ── Configuration ────────────────────────────────────────────────────────────

def test_503_when_key_unset(client, monkeypatch):
    monkeypatch.setenv("AUDIO_TTS", "elevenlabs")
    monkeypatch.delenv("ELEVENLABS_API_KEY", raising=False)
    email = "audio_premium_nokey@example.com"
    token = make_token(email)
    _make_premium(client, email)
    r = client.get("/api/audio", params={"text": "labas"}, headers=auth(token))
    assert r.status_code == 503


# ── Cache: miss then hit ─────────────────────────────────────────────────────

def test_premium_miss_generates_writes_cache_then_hits(client, monkeypatch):
    calls: list[str] = []

    def fake_generate(text: str) -> bytes:
        calls.append(text)
        return b"FAKEMP3BYTES"

    monkeypatch.setattr(audio, "_generate", fake_generate)

    email = "audio_premium_miss@example.com"
    token = make_token(email)
    _make_premium(client, email)

    r1 = client.get("/api/audio", params={"text": "labas"}, headers=auth(token))
    assert r1.status_code == 200
    assert r1.headers["content-type"].startswith("audio/mpeg")
    assert r1.content == b"FAKEMP3BYTES"
    assert calls == ["labas"]

    cache_path = audio._cache_path("labas")
    assert cache_path.exists()
    assert cache_path.read_bytes() == b"FAKEMP3BYTES"

    # Second request for the same text is a cache hit — _generate is not called again.
    r2 = client.get("/api/audio", params={"text": "labas"}, headers=auth(token))
    assert r2.status_code == 200
    assert r2.content == b"FAKEMP3BYTES"
    assert calls == ["labas"]


# ── ElevenLabs failure ────────────────────────────────────────────────────────

def test_generate_error_returns_502_and_caches_nothing(client, monkeypatch):
    def boom(text: str) -> bytes:
        raise RuntimeError("elevenlabs down")

    monkeypatch.setattr(audio, "_generate", boom)

    email = "audio_premium_error@example.com"
    token = make_token(email)
    _make_premium(client, email)

    r = client.get("/api/audio", params={"text": "vakaras"}, headers=auth(token))
    assert r.status_code == 502
    assert not audio._cache_path("vakaras").exists()


# ── spoken_text ───────────────────────────────────────────────────────────────

def test_spoken_text_normalizes_separators():
    assert audio.spoken_text("vyras / moteris") == "vyras, moteris"
    assert audio.spoken_text("esu, būnu") == "esu, būnu"
    assert audio.spoken_text("labas") == "labas"
    assert audio.spoken_text("  rytas  ") == "rytas"


# ── In-memory layer in front of the disk (disk = stand-in for the production DB) ──

def test_memory_serves_repeat_even_without_the_disk_file(client, monkeypatch, tmp_path):
    _make_premium(client, "mem@test.com")
    token = make_token("mem@test.com")
    monkeypatch.setattr(audio, "_generate", lambda text: b"MP3-labas")

    assert client.get("/api/audio", params={"text": "labas"}, headers=auth(token)).content == b"MP3-labas"
    for f in tmp_path.glob("*.mp3"):
        f.unlink()  # nothing left on "the DB" side

    r = client.get("/api/audio", params={"text": "labas"}, headers=auth(token))
    assert r.status_code == 200 and r.content == b"MP3-labas"  # came from memory


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


def test_cache_key_follows_the_spoken_text():
    assert audio._cache_path("jaũsti") == audio._cache_path("jausti")
    assert audio._cache_path("jausti") != audio._cache_path("jaustis")


def test_cache_key_includes_engine_and_voice(monkeypatch):
    monkeypatch.setenv("AUDIO_TTS", "azure")
    azure = audio._cache_path("jausti")
    monkeypatch.setenv("AUDIO_TTS", "elevenlabs")
    assert audio._cache_path("jausti") != azure  # switching engines never serves the other's clip


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
    before = audio._cache_path("siųsti")
    _fixes(monkeypatch, tmp_path, {"siųsti": "sjūsti"})
    assert audio._cache_path("siųsti") != before


def test_the_shipped_config_is_valid():
    data = json.loads(audio._PRONUNCIATION_FILE.read_text(encoding="utf-8"))
    for fix in data["fixes"]:
        assert fix["from"].strip() and fix["to"].strip(), fix


def test_etag_revalidation_returns_304_until_the_spoken_text_changes(client, monkeypatch, tmp_path):
    _make_premium(client, "etag@test.com")
    h = auth(make_token("etag@test.com"))
    _fixes(monkeypatch, tmp_path, {})
    monkeypatch.setattr(audio, "_generate", lambda text: f"MP3-{audio.spoken_text(text)}".encode())

    r1 = client.get("/api/audio", params={"text": "siųsti"}, headers=h)
    etag = r1.headers["etag"]
    assert r1.headers["cache-control"] == "private, no-cache"

    r2 = client.get("/api/audio", params={"text": "siųsti"}, headers={**h, "If-None-Match": etag})
    assert r2.status_code == 304 and r2.content == b""

    _fixes(monkeypatch, tmp_path, {"siųsti": "sjūsti"})  # a fix lands
    r3 = client.get("/api/audio", params={"text": "siųsti"}, headers={**h, "If-None-Match": etag})
    assert r3.status_code == 200 and r3.content == "MP3-sjūsti".encode()


def test_304_still_requires_premium(client):
    _user(client, "etag_free@test.com")
    r = client.get("/api/audio", params={"text": "labas"},
                   headers={**auth(make_token("etag_free@test.com")), "If-None-Match": '"x"'})
    assert r.status_code == 403
