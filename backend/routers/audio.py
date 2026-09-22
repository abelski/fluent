# Word audio prototype (#38, local only — see documentation/audio.md).
#
# Lazy, per-word text-to-speech via ElevenLabs. Clips are cached on local disk
# (backend/.audio_cache/, gitignored) rather than in the DB: local dev's DATABASE_URL
# points at the production Neon DB, so a new table here would be created in production
# the moment the local server boots. Premium/admin only, per the study session gate.

import asyncio
import hashlib
import json
import logging
import os
import re
import threading
import time
import unicodedata
from collections import OrderedDict
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import Response
from sqlmodel import Session

from auth import require_user
from database import get_session
from quota import is_premium_active

# A child of uvicorn's logger so the hit/miss timing lines actually print: the app never
# configures logging, and a plain getLogger(__name__) drops INFO. ponytail: prototype-only.
logger = logging.getLogger("uvicorn.error.audio")

router = APIRouter()

_DEFAULT_CACHE_DIR = Path(__file__).resolve().parent.parent / ".audio_cache"
_SEPARATOR_RE = re.compile(r"[,/]")
# Stress marks some entries carry in the plain text ("jaũsti", "nãmas"): grave, acute, tilde.
# They are not Lithuanian letters, and ElevenLabs mispronounces them ("jaũsti" should sound
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


_ELEVENLABS_MODEL = "eleven_v3"
# Engine: Azure `lt-LT-LeonasNeural` by default — the user picked it over ElevenLabs after
# ElevenLabs read "jausti" as «джаусти» (English j); Azure's native lt-LT voice says «яусти».
# Locally it goes through `edge-tts` (same voice, no key, unofficial endpoint — prototype only);
# production must call the official Azure Speech API on a *paid* S0 key (see audio.md).
# AUDIO_TTS=elevenlabs switches back for comparison.
_AZURE_VOICE = "lt-LT-LeonasNeural"


def _provider() -> str:
    return os.getenv("AUDIO_TTS", "azure")


def _voice_tag() -> str:
    if _provider() == "elevenlabs":
        return f"elevenlabs:{os.getenv('ELEVENLABS_VOICE_ID', '')}"
    return f"azure:{_AZURE_VOICE}"

# ponytail: one global lock serializes every generation across all words/users;
# fine for a single local prototype user, switch to per-text locks if concurrent
# users make it a bottleneck.
_GENERATION_LOCK = threading.Lock()

# In-memory LRU in front of the disk cache. The disk stands in for the production DB (Neon),
# so every disk read here is what would be Neon network transfer there. Capped by *bytes*,
# not entries — memory (512 MB on Render) is the real constraint. See documentation/audio.md.
_MEM_MAX_BYTES = int(os.getenv("AUDIO_MEM_MAX_BYTES", str(50 * 1024 * 1024)))
_mem: "OrderedDict[str, bytes]" = OrderedDict()
_mem_bytes = 0
_mem_lock = threading.Lock()


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


def _cache_dir() -> Path:
    return Path(os.getenv("AUDIO_CACHE_DIR", str(_DEFAULT_CACHE_DIR)))


def _cache_path(text: str) -> Path:
    # Keyed on what is *spoken*, not what is displayed: "jaũsti" and "jausti" share one clip,
    # and a fix to spoken_text() automatically misses the old (wrongly spoken) clip.
    # The engine+voice is part of the key, so switching engines never serves the other one's clip.
    digest = hashlib.sha1(f"{_voice_tag()}|{spoken_text(text)}".encode("utf-8")).hexdigest()
    return _cache_dir() / f"{digest}.mp3"


def spoken_text(text: str) -> str:
    """Turn a `word.lithuanian` entry into what should be spoken.

    `parseForms()` (frontend/lib/assembleTiles.ts) splits multi-form entries like
    "vyras / moteris" or "esu, būnu" on `,`/`/`. Those separators must become a
    spoken pause, not a literal comma-or-slash character, so they're normalized to ", ".
    """
    text = _respell(_strip_stress_marks(text))
    parts = [p.strip() for p in _SEPARATOR_RE.split(text) if p.strip()]
    return ", ".join(parts) if parts else text.strip()


def _generate(text: str) -> bytes:
    """Synthesize `text` with the configured engine. Raises on any failure."""
    if _provider() == "elevenlabs":
        return _generate_elevenlabs(text)
    return _generate_azure_edge(text)


def _generate_azure_edge(text: str) -> bytes:
    import edge_tts  # local-prototype dependency only, deliberately not in requirements.txt

    async def run() -> bytes:
        audio = bytearray()
        async for chunk in edge_tts.Communicate(spoken_text(text), _AZURE_VOICE).stream():
            if chunk["type"] == "audio":
                audio += chunk["data"]
        return bytes(audio)

    data = asyncio.run(run())  # sync endpoint → runs in FastAPI's threadpool, no loop there
    if not data:
        raise RuntimeError("edge-tts returned no audio")
    return data


def _generate_elevenlabs(text: str) -> bytes:
    """Call ElevenLabs TTS for `text`. Raises on any non-2xx or network error."""
    api_key = os.getenv("ELEVENLABS_API_KEY")
    voice_id = os.getenv("ELEVENLABS_VOICE_ID")
    resp = httpx.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
        params={"output_format": "mp3_22050_32"},
        headers={"xi-api-key": api_key},
        json={"text": spoken_text(text), "model_id": _ELEVENLABS_MODEL, "language_code": "lt"},
        timeout=60.0,
    )
    resp.raise_for_status()
    return resp.content


@router.get("/audio")
def get_audio(
    text: str = Query(..., min_length=1),
    authorization: str | None = Header(None),
    if_none_match: str | None = Header(None),
    session: Session = Depends(get_session),
):
    user = require_user(authorization, session)
    if not (user.is_admin or is_premium_active(user)):
        raise HTTPException(status_code=403, detail="Audio is available on Premium.")

    if _provider() == "elevenlabs" and not os.getenv("ELEVENLABS_API_KEY"):
        raise HTTPException(status_code=503, detail="Audio is not configured.")

    cache_path = _cache_path(text)
    key = cache_path.name
    # The URL is the display text but the clip follows the *spoken* text, which a pronunciation
    # fix changes. So the browser keeps the clip but revalidates every time (no-cache): the ETag
    # is the cache key, a match costs an empty 304 and no clip read, a fix is heard immediately.
    etag = f'"{cache_path.stem}"'
    resp_headers = {"Cache-Control": "private, no-cache", "ETag": etag}
    if if_none_match == etag:
        return Response(status_code=304, headers=resp_headers)
    start = time.monotonic()

    def served(data: bytes, source: str) -> Response:
        logger.info(
            "audio %-10s chars=%d ms=%d | mem: %d clips, %.1f MB",
            source, len(text), int((time.monotonic() - start) * 1000), len(_mem), _mem_bytes / 1048576,
        )
        return Response(content=data, media_type="audio/mpeg", headers=resp_headers)

    data = _mem_get(key)
    if data is not None:
        return served(data, "mem")

    if cache_path.exists():
        data = cache_path.read_bytes()  # in production: one Neon read
        _mem_put(key, data)
        return served(data, "disk")

    with _GENERATION_LOCK:
        # Re-check inside the lock: a prefetch and a click on the same word (or two
        # concurrent prefetches) must not both pay for generation.
        if cache_path.exists():
            data = cache_path.read_bytes()
            _mem_put(key, data)
            return served(data, "disk")

        try:
            data = _generate(text)
        except Exception:
            logger.warning("audio error chars=%d ms=%d", len(text), int((time.monotonic() - start) * 1000))
            raise HTTPException(status_code=502, detail="Audio generation failed.")

        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_bytes(data)
        _mem_put(key, data)

    return served(data, _provider())
