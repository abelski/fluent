# Word audio (#38 prototype → #39 production, see documentation/audio.md).
#
# Lazy, per-word text-to-speech via the official Azure Speech REST API (paid S0 key,
# voice lt-LT-LeonasNeural). Each clip is generated once ever and stored in the DB
# (`audio_clip`), with a byte-capped in-memory LRU in front. Premium/admin only.
#
# Only the text of an existing, non-archived `Word` is ever synthesized, and monthly
# char/byte caps are the hard stop on the Azure bill and on DB storage.

import hashlib
import json
import logging
import os
import re
import threading
import time
import unicodedata
from collections import OrderedDict
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlmodel import Session, select

import telegram_service
from auth import require_user
from database import get_session
from models import AudioClip, Word, _utcnow
from quota import is_premium_active

# A child of uvicorn's logger so the hit/miss timing lines actually print: the app never
# configures logging, and a plain getLogger(__name__) drops INFO.
# Never log the Azure key: no request headers, no request/response objects.
logger = logging.getLogger("uvicorn.error.audio")

router = APIRouter()

_SEPARATOR_RE = re.compile(r"[,/]")
# Stress marks some entries carry in the plain text ("jaũsti", "nãmas"): grave, acute, tilde.
# They are not Lithuanian letters, and TTS engines mispronounce them ("jaũsti" should sound
# like "яусти"). Real Lithuanian diacritics are different code points and survive:
# ogonek ą ę į ų (U+0328), caron č š ž (U+030C), dot ė (U+0307), macron ū (U+0304).
_STRESS_MARKS = {"\u0300", "\u0301", "\u0303"}


def _strip_stress_marks(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text)
    return unicodedata.normalize("NFC", "".join(ch for ch in decomposed if ch not in _STRESS_MARKS))


# Pronunciation fixes live in a config file, not in code (see documentation/audio.md).
# Re-read whenever its mtime changes, so an edit applies on the next request without a restart.
_PRONUNCIATION_FILE = Path(__file__).resolve().parent.parent / "data" / "pronunciation.json"
_respell_loaded: tuple[float, dict[str, str]] = (-1.0, {})


def _respell_map() -> dict[str, str]:
    global _respell_loaded
    try:
        mtime = _PRONUNCIATION_FILE.stat().st_mtime
    except FileNotFoundError:
        return {}
    if mtime != _respell_loaded[0]:
        fixes = json.loads(_PRONUNCIATION_FILE.read_text(encoding="utf-8"))["fixes"]
        # Keys normalized the way the text is at match time: stress marks gone, lower-case.
        _respell_loaded = (mtime, {_strip_stress_marks(f["from"]).lower(): f["to"] for f in fixes})
    return _respell_loaded[1]


def _respell(text: str) -> str:
    """Apply the pronunciation fixes: longest key first, one pass, case-insensitive."""
    fixes = _respell_map()
    if not fixes:
        return text
    pattern = "|".join(re.escape(k) for k in sorted(fixes, key=len, reverse=True))
    return re.sub(pattern, lambda m: fixes[m.group(0).lower()], text, flags=re.IGNORECASE)


# Azure's native lt-LT voice: the user picked it over ElevenLabs, which read "jausti" as
# «джаусти» (English j); Leonas says «яусти». Paid S0 key only — commercial use of prebuilt
# neural voices is explicit on the paid tier (see audio.md).
_AZURE_VOICE = "lt-LT-LeonasNeural"
_AZURE_TIMEOUT = 10.0  # typical is ~1s

# ponytail: one global lock serializes every generation across all words/users;
# fine at a handful of Premium users with one generation per word ever, switch to
# per-text locks if concurrent misses make it a bottleneck.
_GENERATION_LOCK = threading.Lock()
_LOCK_TIMEOUT = 10.0
# At most 4 requests in flight or waiting for the lock; a 5th gets an immediate 503 instead
# of pinning one of FastAPI's 40 sync threads (A2-5).
_GENERATION_SLOTS = threading.BoundedSemaphore(4)

# In-memory LRU in front of the DB: every DB read is Neon network transfer. Capped by
# *bytes*, not entries — memory (512 MB on Render) is the real constraint.
_MEM_MAX_BYTES = int(os.getenv("AUDIO_MEM_MAX_BYTES", str(50 * 1024 * 1024)))
_mem: "OrderedDict[str, bytes]" = OrderedDict()
_mem_bytes = 0
_mem_lock = threading.Lock()

# `YYYY-MM` of the last monthly-cap Telegram alert. In-process only: a restart may re-send once.
_cap_alerted_month: str | None = None


def _mem_get(key: str) -> bytes | None:
    with _mem_lock:
        data = _mem.get(key)
        if data is not None:
            _mem.move_to_end(key)
        return data


def _mem_put(key: str, data: bytes) -> None:
    global _mem_bytes
    with _mem_lock:
        if key in _mem:
            return
        _mem[key] = data
        _mem_bytes += len(data)
        while _mem_bytes > _MEM_MAX_BYTES and _mem:
            _, evicted = _mem.popitem(last=False)
            _mem_bytes -= len(evicted)


def _mem_clear() -> None:
    """Tests only."""
    global _mem_bytes
    with _mem_lock:
        _mem.clear()
        _mem_bytes = 0


def spoken_text(text: str) -> str:
    """Turn a `word.lithuanian` entry into what should be spoken.

    `parseForms()` (frontend/lib/assembleTiles.ts) splits multi-form entries like
    "vyras / moteris" or "esu, būnu" on `,`/`/`. Those separators must become a
    spoken pause, not a literal comma-or-slash character, so they're normalized to ", ".
    """
    text = _respell(_strip_stress_marks(text))
    parts = [p.strip() for p in _SEPARATOR_RE.split(text) if p.strip()]
    return ", ".join(parts) if parts else text.strip()


def _clip_key(spoken: str) -> str:
    # Keyed on what is *spoken*, not what is displayed: "jaũsti" and "jausti" share one clip,
    # and a fix to spoken_text() automatically misses the old (wrongly spoken) clip.
    # The engine+voice is part of the key, so a voice change never serves the old clip.
    return hashlib.sha1(f"azure:{_AZURE_VOICE}|{spoken}".encode("utf-8")).hexdigest()


def _ssml(spoken: str) -> str:
    # escape() covers &<> — enough for element content, so no SSML injection.
    return (
        f"<speak version='1.0' xml:lang='lt-LT'><voice name='{_AZURE_VOICE}'>"
        f"{escape(spoken)}</voice></speak>"
    )


class _GenerationFailed(Exception):
    def __init__(self, status: int | None):
        self.status = status


def _generate(spoken: str) -> bytes:
    """Synthesize `spoken` with Azure. Accepts only HTTP 200 + a non-empty audio/* body (A1-5)."""
    region = os.getenv("AZURE_SPEECH_REGION")
    try:
        resp = httpx.post(
            f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1",
            content=_ssml(spoken).encode("utf-8"),
            headers={
                "Ocp-Apim-Subscription-Key": os.getenv("AZURE_SPEECH_KEY", ""),
                "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
                "User-Agent": "fluent",
            },
            timeout=_AZURE_TIMEOUT,
        )
    except httpx.HTTPError:
        raise _GenerationFailed(None)
    if resp.status_code != 200 or not resp.content or not resp.headers.get("content-type", "").startswith("audio/"):
        raise _GenerationFailed(resp.status_code)
    return resp.content


def _month_start() -> datetime:
    return _utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _cap_reached(session: Session, spoken: str) -> bool:
    """Monthly hard stop for the Azure bill (chars) and DB storage (bytes), read at call time.

    ponytail: LENGTH(spoken_text) approximates billed characters; per-request SSML overhead is
    ignored. The cap is a safety net, not an invoice.
    """
    global _cap_alerted_month
    char_cap = int(os.getenv("AUDIO_MONTHLY_CHAR_CAP", "200000"))
    byte_cap = int(os.getenv("AUDIO_MONTHLY_BYTE_CAP", str(50 * 1024 * 1024)))
    chars, nbytes = session.exec(
        select(
            func.coalesce(func.sum(func.length(AudioClip.spoken_text)), 0),
            func.coalesce(func.sum(func.length(AudioClip.data)), 0),
        ).where(AudioClip.created_at >= _month_start())
    ).one()
    if chars + len(spoken) <= char_cap and nbytes < byte_cap:
        return False
    month = _utcnow().strftime("%Y-%m")
    if _cap_alerted_month != month:
        _cap_alerted_month = month
        telegram_service.send_telegram(
            f"audio monthly cap reached: chars {chars}/{char_cap}, bytes {nbytes}/{byte_cap}"
        )
    return True


def _insert_clip(session: Session, key: str, spoken: str, data: bytes) -> None:
    """`INSERT … ON CONFLICT DO NOTHING`: local dev and prod (or two Render instances during a
    deploy) share the DB but not the lock, so a concurrent insert of the same key is fine (A2-4)."""
    insert = pg_insert if session.get_bind().dialect.name == "postgresql" else sqlite_insert
    session.execute(
        insert(AudioClip.__table__)
        .values(key=key, spoken_text=spoken, data=data, created_at=_utcnow())
        .on_conflict_do_nothing(index_elements=["key"])
    )
    session.commit()


@router.get("/audio")
def get_audio(
    text: str = Query(..., min_length=1, max_length=60),
    authorization: str | None = Header(None),
    if_none_match: str | None = Header(None),
    session: Session = Depends(get_session),
):
    user = require_user(authorization, session)
    if not (user.is_admin or is_premium_active(user)):
        raise HTTPException(status_code=403, detail="Audio is available on Premium.")
    # Captured before any commit: expire_on_commit would otherwise re-SELECT it (A1-2).
    user_id = user.id

    spoken = spoken_text(text)
    key = _clip_key(spoken)
    # The URL is the display text but the clip follows the *spoken* text, which a pronunciation
    # fix changes. So the browser keeps the clip but revalidates every time (no-cache): the ETag
    # is the cache key, a match costs an empty 304 and no clip read, a fix is heard immediately.
    etag = f'"{key}"'
    resp_headers = {"Cache-Control": "private, no-cache", "ETag": etag}
    if if_none_match == etag:
        return Response(status_code=304, headers=resp_headers)
    start = time.monotonic()

    def served(data: bytes, source: str) -> Response:
        logger.info(
            "audio %-5s user=%s chars=%d ms=%d | mem: %d clips, %.1f MB",
            source, user_id, len(text), int((time.monotonic() - start) * 1000), len(_mem), _mem_bytes / 1048576,
        )
        return Response(content=data, media_type="audio/mpeg", headers=resp_headers)

    data = _mem_get(key)
    if data is not None:
        return served(data, "mem")

    clip = session.get(AudioClip, key)
    if clip is not None:
        _mem_put(key, clip.data)
        return served(clip.data, "db")

    # ── Miss ──
    # Only the text of a real, non-archived word is ever synthesized.
    word_exists = session.exec(
        select(Word.id).where(Word.lithuanian == text, Word.archived == False).limit(1)  # noqa: E712
    ).first()
    if word_exists is None:
        raise HTTPException(status_code=404, detail="Not a word.")
    # Checked here only, so stored clips keep playing without a key (A2-12).
    if not (os.getenv("AZURE_SPEECH_KEY") and os.getenv("AZURE_SPEECH_REGION")):
        raise HTTPException(status_code=503, detail="Audio is not configured.")

    # End the transaction: no pooled connection is held while waiting or generating (A1-2).
    session.commit()

    if not _GENERATION_SLOTS.acquire(blocking=False):
        raise HTTPException(status_code=503, detail="Audio is busy, try again.")
    try:
        if not _GENERATION_LOCK.acquire(timeout=_LOCK_TIMEOUT):
            raise HTTPException(status_code=503, detail="Audio is busy, try again.")
        try:
            # Re-check inside the lock: a prefetch and a click on the same word (or two
            # concurrent prefetches) must not both pay for generation.
            clip = session.get(AudioClip, key)
            if clip is not None:
                data = clip.data
                session.commit()
                _mem_put(key, data)
                return served(data, "db")
            capped = _cap_reached(session, spoken)
            session.commit()
            if capped:
                raise HTTPException(status_code=503, detail="Audio limit reached.")

            try:
                data = _generate(spoken)
            except Exception as e:  # anything else is a 502 too, never a 500; log the status only
                logger.warning(
                    "audio error status=%s user=%s chars=%d ms=%d",
                    getattr(e, "status", None), user_id, len(text), int((time.monotonic() - start) * 1000),
                )
                raise HTTPException(status_code=502, detail="Audio generation failed.")

            _insert_clip(session, key, spoken, data)
            _mem_put(key, data)
        finally:
            _GENERATION_LOCK.release()
    finally:
        _GENERATION_SLOTS.release()

    return served(data, "azure")
