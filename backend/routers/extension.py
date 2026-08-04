# Chrome extension API — word translation + "Add to learn" for the browser
# extension (see extension/ at repo root). Reuses the personal-word-list
# conventions from routers/word_lists.py: a fresh Word row is always created
# when adding (never link an existing public Word), because deleting a
# personal list hard-deletes every Word in it (word_lists.py delete_my_word_list).
#
# Translation is free for any logged-in user (funnel); "Add to learn" is
# premium/admin only, matching _require_list_creator in word_lists.py.

import html
import io
import json
import os
import re
import zipfile
from pathlib import Path
from typing import Optional
from urllib.parse import quote

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

# Module-level in-memory cache for translation fallback lookups, keyed by
# "{word_lower}|{langpair}" so English and Russian lookups of the same word
# don't collide. Only successful lookups are cached (see _translate_cached) —
# caching a None could make a word permanently untranslatable until restart.
# Kept simple (single-process dict) since this is a low-volume funnel feature;
# cleared entirely once it grows past 2000 entries to bound memory use.
_TRANSLATION_CACHE: dict[str, str] = {}


def _mymemory_translate(word: str, langpair: str) -> Optional[str]:
    """Call the free MyMemory translation API. Returns None on any error, timeout,
    or when no real translation is found (module-level so tests can monkeypatch it).

    Retries once on a genuine transient network failure (httpx.RequestError —
    connection errors, timeouts) since those are worth a second try; an actual
    HTTP error response (raise_for_status) or a malformed JSON body is not
    retried — those indicate a real problem with the request/response, not a
    blip, so failing fast (as before) is still correct."""
    params = {"q": word, "langpair": langpair}
    if _MYMEMORY_CONTACT_EMAIL:
        params["de"] = _MYMEMORY_CONTACT_EMAIL
    attempts = 2
    for attempt in range(attempts):
        try:
            resp = httpx.get("https://api.mymemory.translated.net/get", params=params, timeout=5.0)
        except httpx.RequestError:
            if attempt + 1 < attempts:
                continue
            return None
        try:
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
    return None


def _google_free_translate(word: str, langpair: str) -> Optional[str]:
    """Fallback translator using Google Translate's free, keyless, unofficial
    endpoint (the same one the `googletrans` PyPI package and similar tools
    scrape — NOT the paid Cloud Translation API, which needs an API key/billing).
    This endpoint is undocumented and could break or get rate-limited without
    notice, which is exactly why it's a fallback and not the primary path:
    _translate_with_fallback only reaches this after MyMemory has already
    failed or returned something invalid for the target script.

    `langpair` matches the "lt|en"/"lt|ru" style used elsewhere in this file
    and is split into Google's `sl`/`tl` params. Returns None on any error,
    timeout, malformed response, or an untranslated echo of the input."""
    try:
        sl, tl = langpair.split("|")
        resp = httpx.get(
            "https://translate.googleapis.com/translate_a/single",
            params={"client": "gtx", "sl": sl, "tl": tl, "dt": "t", "q": word},
            timeout=5.0,
        )
        resp.raise_for_status()
        data = resp.json()
        # Shape: [[[seg0_translated, seg0_original, ...], [seg1...], ...], ...]
        translated = "".join(seg[0] for seg in data[0] if seg and seg[0])
        translated = translated.strip()
        if not translated or translated.lower() == word.strip().lower():
            return None
        return translated
    except Exception:
        return None


# Cheap sanity check for the "wrong script entirely" failure mode (e.g.
# MyMemory returning the English word "fail" as a Russian translation).
# Lithuanian and English share the Latin alphabet, so there's no equivalent
# cheap check for "|en" — a plausible-looking Latin string could still be a
# bad translation, but that's a quality problem this check isn't meant to
# catch, only the "obviously wrong script" one.
_CYRILLIC_RE = re.compile(r"[Ѐ-ӿ]")


def _is_valid_translation(text: str, langpair: str) -> bool:
    if langpair.endswith("|ru"):
        return bool(_CYRILLIC_RE.search(text))
    return True


def _translate_with_fallback(word: str, langpair: str) -> Optional[str]:
    """MyMemory first; if it fails or returns a wrong-script result (the bug
    that motivated this function — MyMemory's lt->ru corpus is thin enough to
    sometimes return English text), retry via the free Google endpoint. A
    result that fails the script check from BOTH sources is discarded — a
    null field in the API response is strictly better than confidently
    labeling English text as a Russian translation."""
    primary = _mymemory_translate(word, langpair)
    if primary and _is_valid_translation(primary, langpair):
        return primary
    fallback = _google_free_translate(word, langpair)
    if fallback and _is_valid_translation(fallback, langpair):
        return fallback
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


def _translate_cached(word: str, word_key: str, langpair: str) -> Optional[str]:
    """Translation lookup (MyMemory + Google-free fallback, see
    _translate_with_fallback) with a per-langpair cache (see _TRANSLATION_CACHE above)."""
    cache_key = f"{word_key}|{langpair}"
    if cache_key in _TRANSLATION_CACHE:
        return _TRANSLATION_CACHE[cache_key]
    result = _translate_with_fallback(word, langpair)
    if result is not None:
        if len(_TRANSLATION_CACHE) > 2000:
            _TRANSLATION_CACHE.clear()
        _TRANSLATION_CACHE[cache_key] = result
    return result


def _db_lookup(word: str, session: Session) -> Optional[Word]:
    """Find a public-list Word row matching `word` case-insensitively, preferring
    star=1 (base form) when the word appears in multiple lists. The is_public
    join means a private personal-list word (another user's) never matches —
    same guard as the original inline query this was extracted from."""
    return session.exec(
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


# ── Dictionary enrichment (base form, grammar, senses) ───────────────────────
# Wiktionary REST is the primary source (part of speech, "form of" grammar
# note, numbered senses); simplemma is a lightweight fallback that only
# produces a base form (for MyMemory/DB lookup) when Wiktionary has nothing.
# Verified against the live API (2026-08-04): Lithuanian entries are keyed
# "lt" (with a per-entry `language` field double-checked defensively below);
# a "form of" entry's HTML looks like:
#   <span class="form-of-definition ..."><a>locative</a> <a>plural</a> of
#     <span class="form-of-definition-link"><i class="Latn mention" lang="lt">
#       <a href="/wiki/namas#Lithuanian" title="namas">namas</a></i></span></span>
# Important correction vs. the original plan: the lemma link text/title is
# ALWAYS the plain (unaccented) form — Wiktionary page titles can't carry the
# stress-accent combining marks, so there is no "accented anchor text" to
# read here. `base_form_accented` therefore comes ONLY from the local DB's
# `Word.accented` column when the lemma happens to be a public-list word;
# otherwise it stays null and the client just renders the plain base form.

_WIKTIONARY_UA = "FluentLT-Extension/1.0 (+https://fluent.lt; contact@fluent.lt)"
_TAG_RE = re.compile(r"<[^>]+>")

# Module-level cache for parsed Wiktionary lookups, keyed by word_lower.
# Success-only (see _wiktionary_cached) and cleared past 500 entries — smaller
# cap than the translation cache since each entry holds more data (senses list).
_WIKTIONARY_CACHE: dict[str, dict] = {}


def _strip_tags(fragment: str) -> str:
    """HTML fragment -> plain text: drop tags, unescape entities, collapse whitespace."""
    text = _TAG_RE.sub("", fragment)
    text = html.unescape(text)
    return " ".join(text.split())


def _wiktionary_lookup(word: str) -> Optional[dict]:
    """Fetch and parse the first Lithuanian entry for `word` from the Wiktionary
    REST API. Returns None on any error, timeout, 404, or missing Lithuanian
    entry (module-level so tests can monkeypatch it, like _mymemory_translate).

    On success: {"part_of_speech": str | None, "senses": [str, ...],
                 "form_of": {"lemma": str, "description": str} | None}
    """
    try:
        resp = httpx.get(
            f"https://en.wiktionary.org/api/rest_v1/page/definition/{quote(word)}",
            headers={"User-Agent": _WIKTIONARY_UA},
            timeout=3.5,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception:
        return None

    # Lithuanian entries are filed under the "lt" key in every case observed,
    # but every entry is also checked against its own `language` field —
    # cheap defensive double-check in case Wiktionary ever files one elsewhere.
    entry = None
    for key_entries in [data.get("lt", []), *data.values()]:
        if not isinstance(key_entries, list):
            continue
        entry = next((e for e in key_entries if e.get("language") == "Lithuanian"), None)
        if entry:
            break
    if entry is None:
        return None

    definitions = entry.get("definitions") or []
    if not definitions:
        return None

    part_of_speech = entry.get("part_of_speech") or entry.get("partOfSpeech")
    first_html = definitions[0].get("definition", "")

    if "form-of-definition" in first_html:
        link_match = re.search(r'class="form-of-definition-link">(.*?)</span>', first_html, re.DOTALL)
        if not link_match:
            return None
        lemma = _strip_tags(link_match.group(1))
        if not lemma:
            return None
        return {
            "part_of_speech": part_of_speech,
            "senses": [],
            "form_of": {"lemma": lemma, "description": _strip_tags(first_html)},
        }

    senses = [text for d in definitions[:3] if (text := _strip_tags(d.get("definition", "")))]
    if not senses:
        return None
    return {"part_of_speech": part_of_speech, "senses": senses, "form_of": None}


def _wiktionary_cached(word: str) -> Optional[dict]:
    word_key = word.lower()
    if word_key in _WIKTIONARY_CACHE:
        return _WIKTIONARY_CACHE[word_key]
    result = _wiktionary_lookup(word)
    if result is not None:
        if len(_WIKTIONARY_CACHE) > 500:
            _WIKTIONARY_CACHE.clear()
        _WIKTIONARY_CACHE[word_key] = result
    return result


def _simplemma_lemma(word: str) -> Optional[str]:
    """Lemmatize via simplemma's Lithuanian dictionary (lazy import — only
    loads the small per-language data file when actually needed). Returns
    None on any error, or when simplemma just echoes the input back (i.e. it
    doesn't recognize the word as an inflected form of anything else)."""
    try:
        from simplemma import lemmatize
        lemma = lemmatize(word, lang="lt")
    except Exception:
        return None
    if not lemma or lemma.lower() == word.lower():
        return None
    return lemma


def _lemma_translations(
    lemma: str, lang: str, session: Session
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """(translation_en, translation_ru, accented) for a lemma: DB first (real
    Russian translation + accent marks), MyMemory fallback (English/Russian
    per `lang`, no accent — see the module note on why Wiktionary can't help)."""
    db_word = _db_lookup(lemma, session)
    if db_word:
        return db_word.translation_en, db_word.translation_ru, db_word.accented
    lemma_key = lemma.lower()
    translation_en = _translate_cached(lemma, lemma_key, "lt|en") if lang in ("en", "both") else None
    translation_ru = _translate_cached(lemma, lemma_key, "lt|ru") if lang in ("ru", "both") else None
    return translation_en, translation_ru, None


_EMPTY_ENRICHMENT = {
    "base_form": None,
    "base_form_accented": None,
    "part_of_speech": None,
    "grammar_note": None,
    "senses": None,
    "base_translation_en": None,
    "base_translation_ru": None,
}


def _enrich(word: str, lang: str, session: Session, db_word: Optional[Word] = None) -> dict:
    """Best-effort dictionary-style enrichment for the extension card: base
    form, part of speech, a grammar note for inflected forms, up to 3 numbered
    senses, and the base form's own translations. Every failure path returns
    an all-None dict so callers can merge it into the response unconditionally
    — enrichment is a bonus, never a reason to change or break the base reply.
    Multi-token selections are skipped entirely (Wiktionary/simplemma are
    single-word dictionaries). `db_word` is the caller's already-fetched
    `_db_lookup(word, session)` result, reused here to avoid a second query
    when the selected word turns out to already be the dictionary form."""
    if len(word.split()) != 1:
        return dict(_EMPTY_ENRICHMENT)

    entry = _wiktionary_cached(word)

    if entry is None:
        lemma = _simplemma_lemma(word)
        if not lemma:
            return dict(_EMPTY_ENRICHMENT)
        result = dict(_EMPTY_ENRICHMENT)
        result["base_form"] = lemma
        en, ru, accented = _lemma_translations(lemma, lang, session)
        result["base_translation_en"] = en
        result["base_translation_ru"] = ru
        result["base_form_accented"] = accented
        return result

    result = dict(_EMPTY_ENRICHMENT)
    result["part_of_speech"] = entry.get("part_of_speech")
    form_of = entry.get("form_of")

    if form_of is None:
        # The selected word is already the dictionary form.
        result["base_form"] = word
        senses = entry.get("senses") or []
        result["senses"] = senses[:3] if senses else None
        if db_word:
            result["base_form_accented"] = db_word.accented
        return result

    lemma = form_of["lemma"]
    result["base_form"] = lemma
    result["grammar_note"] = form_of["description"]

    lemma_entry = _wiktionary_cached(lemma)
    if lemma_entry:
        senses = lemma_entry.get("senses") or []
        result["senses"] = senses[:3] if senses else None

    en, ru, accented = _lemma_translations(lemma, lang, session)
    result["base_translation_en"] = en
    result["base_translation_ru"] = ru
    result["base_form_accented"] = accented
    return result


@router.get("/extension/translate")
def translate_word(
    word: str,
    lang: str = "en",
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Translate a Lithuanian word/short phrase: DB lookup first, MyMemory fallback.
    Also runs best-effort dictionary enrichment (base form / grammar / senses) —
    see _enrich — merged into the response as additional nullable fields that
    never change the meaning of the original word/translation_en/translation_ru/
    source fields, so existing extension installs keep working unmodified.

    `lang` ("en" | "ru" | "both") picks which language(s) the MyMemory fallback
    fetches; a DB hit is unaffected since Word rows already carry both."""
    _require_user(authorization, session)
    word = _validate_word(word)
    if lang not in _VALID_LANGS:
        raise HTTPException(status_code=422, detail="lang must be 'en', 'ru', or 'both'")

    db_word = _db_lookup(word, session)
    enrichment = _enrich(word, lang, session, db_word=db_word)

    if db_word:
        response = {
            "word": db_word.lithuanian,
            "translation_en": db_word.translation_en,
            "translation_ru": db_word.translation_ru,
            "source": "db",
        }
        response.update(enrichment)
        return response

    word_key = word.lower()
    translation_en = _translate_cached(word, word_key, "lt|en") if lang in ("en", "both") else None
    translation_ru = _translate_cached(word, word_key, "lt|ru") if lang in ("ru", "both") else None

    if translation_en is None and translation_ru is None:
        # 404-softening: the exact selected form has no translation of its own,
        # but enrichment found a translatable dictionary form — degrade to
        # that instead of a hard 404 (still useful; the client shows it's the
        # base form's translation via the enrichment fields).
        base_en = enrichment.get("base_translation_en")
        base_ru = enrichment.get("base_translation_ru")
        if base_en is not None or base_ru is not None:
            response = {
                "word": word,
                "translation_en": base_en,
                "translation_ru": base_ru,
                "source": "mymemory",
            }
            response.update(enrichment)
            return response
        raise HTTPException(status_code=404, detail="No translation found")

    response = {
        "word": word,
        "translation_en": translation_en,
        "translation_ru": translation_ru,
        "source": "mymemory",
    }
    response.update(enrichment)
    return response


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
