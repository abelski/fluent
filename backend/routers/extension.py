# Chrome extension API — word translation + "Add to learn" for the browser
# extension (see extension/ at repo root). Reuses the personal-word-list
# conventions from routers/word_lists.py: a fresh Word row is always created
# when adding (never link an existing public Word), because deleting a
# personal list hard-deletes every Word in it (word_lists.py delete_my_word_list).
#
# Translation is free for any logged-in user (funnel); "Add to learn" is
# premium/admin only, matching _require_list_creator in word_lists.py.

import io
import json
import os
import re
import zipfile
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel
from sqlmodel import Session, func, select

from auth import require_user as _require_user
from database import get_session
from quota import is_premium_active
from models import User, Word, WordList, WordListItem
from routers.word_lists import _next_position, _get_owned_list

router = APIRouter()

FROM_INTERNET_TITLE = "From internet"

# backend/routers/extension.py -> backend/routers -> backend -> repo root -> extension/
_EXTENSION_DIR = Path(__file__).resolve().parent.parent.parent / "extension"

# Matches any Unicode letter (covers Lithuanian diacritics: ą č ę ė į š ų ū ž).
_LETTER_RE = re.compile(r"[^\W\d_]", re.UNICODE)

# Optional contact email for MyMemory's free API — passing it raises the
# anonymous daily quota. See https://mymemory.translated.net/doc/spec.php
_MYMEMORY_CONTACT_EMAIL = os.getenv("MYMEMORY_CONTACT_EMAIL")

# Module-level in-memory cache for MyMemory fallback lookups, keyed by
# "{word_lower}|{langpair}" so English and Russian lookups of the same word
# don't collide. Only successful lookups are cached (see _mymemory_cached) —
# caching a None could make a word permanently untranslatable until restart.
# Kept simple (single-process dict) since this is a low-volume funnel feature;
# cleared entirely once it grows past 2000 entries to bound memory use.
_TRANSLATION_CACHE: dict[str, str] = {}


def _mymemory_translate(word: str, langpair: str) -> Optional[str]:
    """Call the free MyMemory translation API. Returns None on any error, timeout,
    or when no real translation is found (module-level so tests can monkeypatch it)."""
    params = {"q": word, "langpair": langpair}
    if _MYMEMORY_CONTACT_EMAIL:
        params["de"] = _MYMEMORY_CONTACT_EMAIL
    try:
        resp = httpx.get("https://api.mymemory.translated.net/get", params=params, timeout=5.0)
        resp.raise_for_status()
        data = resp.json()
        translated = (data.get("responseData") or {}).get("translatedText")
        if not translated:
            return None
        translated = translated.strip()
        # MyMemory echoes the query back untranslated when it has no match.
        if not translated or translated.lower() == word.strip().lower():
            return None
        return translated
    except Exception:
        return None


def _validate_word(raw: str) -> str:
    word = raw.strip()
    if not word or len(word) > 80:
        raise HTTPException(status_code=422, detail="word must be 1-80 characters")
    if len(word.split()) > 4:
        raise HTTPException(status_code=422, detail="word must be at most 4 words")
    if not _LETTER_RE.search(word):
        raise HTTPException(status_code=422, detail="word must contain letters")
    return word


_VALID_LANGS = {"en", "ru", "both"}


def _mymemory_cached(word: str, word_key: str, langpair: str) -> Optional[str]:
    """MyMemory lookup with a per-langpair cache (see _TRANSLATION_CACHE above)."""
    cache_key = f"{word_key}|{langpair}"
    if cache_key in _TRANSLATION_CACHE:
        return _TRANSLATION_CACHE[cache_key]
    result = _mymemory_translate(word, langpair)
    if result is not None:
        if len(_TRANSLATION_CACHE) > 2000:
            _TRANSLATION_CACHE.clear()
        _TRANSLATION_CACHE[cache_key] = result
    return result


@router.get("/extension/translate")
def translate_word(
    word: str,
    lang: str = "en",
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Translate a Lithuanian word/short phrase: DB lookup first, MyMemory fallback.

    `lang` ("en" | "ru" | "both") picks which language(s) the MyMemory fallback
    fetches; a DB hit is unaffected since Word rows already carry both."""
    _require_user(authorization, session)
    word = _validate_word(word)
    if lang not in _VALID_LANGS:
        raise HTTPException(status_code=422, detail="lang must be 'en', 'ru', or 'both'")

    db_word = session.exec(
        select(Word)
        .join(WordListItem, WordListItem.word_id == Word.id)
        .join(WordList, WordList.id == WordListItem.word_list_id)
        .where(
            func.lower(Word.lithuanian) == word.lower(),
            Word.archived == False,  # noqa: E712
            WordList.is_public == True,  # noqa: E712
            WordList.archived == False,  # noqa: E712
        )
        .order_by(Word.star.asc())
    ).first()
    if db_word:
        return {
            "word": db_word.lithuanian,
            "translation_en": db_word.translation_en,
            "translation_ru": db_word.translation_ru,
            "source": "db",
        }

    word_key = word.lower()
    translation_en = _mymemory_cached(word, word_key, "lt|en") if lang in ("en", "both") else None
    translation_ru = _mymemory_cached(word, word_key, "lt|ru") if lang in ("ru", "both") else None

    if translation_en is None and translation_ru is None:
        raise HTTPException(status_code=404, detail="No translation found")
    return {
        "word": word,
        "translation_en": translation_en,
        "translation_ru": translation_ru,
        "source": "mymemory",
    }


class ExtensionWordCreate(BaseModel):
    lithuanian: str
    # Both optional so a lang="ru"-only translate result (translation_en null)
    # can still be added — at least one of the two must be non-empty.
    translation: Optional[str] = None
    translation_ru: Optional[str] = None
    # Target personal list; None = the auto-created "From internet" list.
    list_id: Optional[int] = None


@router.post("/extension/words")
def add_extension_word(
    body: ExtensionWordCreate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Add a word to the user's auto-created "From internet" personal list (premium/admin only)."""
    user: User = _require_user(authorization, session)
    if not (user.is_admin or is_premium_active(user)):
        raise HTTPException(status_code=403, detail="Adding words is available on Premium.")

    lithuanian = _validate_word(body.lithuanian)
    translation = (body.translation or "").strip()
    translation_ru = (body.translation_ru or "").strip()
    if not translation and not translation_ru:
        raise HTTPException(status_code=422, detail="translation or translation_ru is required")
    if len(translation) > 200:
        raise HTTPException(status_code=422, detail="translation must be at most 200 characters")
    if len(translation_ru) > 200:
        raise HTTPException(status_code=422, detail="translation_ru must be at most 200 characters")
    # Mirror whichever one is present so both Word columns are populated,
    # matching the personal-word convention in routers/word_lists.py.
    translation = translation or translation_ru
    translation_ru = translation_ru or translation

    if body.list_id is not None:
        # Explicit target list — must be an owned, private, non-archived
        # personal list (same rule as the dedicated word-lists endpoints).
        wl = _get_owned_list(body.list_id, user, session)
    else:
        wl = session.exec(
            select(WordList).where(
                WordList.created_by == user.id,
                WordList.is_public == False,  # noqa: E712
                WordList.archived == False,  # noqa: E712
                WordList.title == FROM_INTERNET_TITLE,
            )
        ).first()
        if not wl:
            wl = WordList(
                title=FROM_INTERNET_TITLE,
                is_public=False,
                created_by=user.id,
                difficulty="easy",
            )
            session.add(wl)
            session.commit()
            session.refresh(wl)

    existing = session.exec(
        select(Word)
        .join(WordListItem, WordListItem.word_id == Word.id)
        .where(
            WordListItem.word_list_id == wl.id,
            func.lower(Word.lithuanian) == lithuanian.lower(),
        )
    ).first()
    if existing:
        return {"id": existing.id, "list_id": wl.id, "already_added": True}

    word = Word(
        lithuanian=lithuanian,
        translation_en=translation,
        translation_ru=translation_ru,
        star=1,
    )
    session.add(word)
    session.commit()
    session.refresh(word)
    session.add(WordListItem(
        word_list_id=wl.id, word_id=word.id, position=_next_position(wl.id, session),
    ))
    session.commit()
    return {"id": word.id, "list_id": wl.id, "already_added": False}


# ── Installation info + download ─────────────────────────────────────────────
# Public (no auth) — these only serve installation metadata/files, nothing
# user-specific or sensitive, so the in-app "Chrome extension" page can call
# them without the visitor being logged in.

def _read_manifest_version() -> str:
    manifest_path = _EXTENSION_DIR / "manifest.json"
    if not manifest_path.is_file():
        raise HTTPException(status_code=404, detail="Extension not found")
    manifest = json.loads(manifest_path.read_text())
    return manifest.get("version", "0.0.0")


@router.get("/extension/info")
def extension_info():
    """Current extension version, read live from extension/manifest.json."""
    return {"version": _read_manifest_version()}


@router.get("/extension/download")
def extension_download():
    """Zip of the whole extension/ folder for load-unpacked installation.

    Built fresh per request — the folder is tiny (a few KB), so there's no
    need to cache it on disk. Entries are rooted under a single
    "fluent-extension/" folder so unzipping doesn't scatter files."""
    if not _EXTENSION_DIR.is_dir():
        raise HTTPException(status_code=404, detail="Extension not found")
    version = _read_manifest_version()

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(_EXTENSION_DIR.rglob("*")):
            if path.is_dir():
                continue
            relative = path.relative_to(_EXTENSION_DIR)
            # Skip README.md and any dotfiles (e.g. .DS_Store) at any depth.
            if path.name == "README.md" or any(part.startswith(".") for part in relative.parts):
                continue
            zf.write(path, arcname=str(Path("fluent-extension") / relative))
    zip_bytes = buffer.getvalue()

    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="fluent-extension-{version}.zip"',
        },
    )
