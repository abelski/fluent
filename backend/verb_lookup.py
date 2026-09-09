"""Best-effort lookup of a Lithuanian verb's principal forms.

Given an infinitive (e.g. `suprasti`), resolve the two other principal forms —
3rd-person present (`supranta`) and 3rd-person past simple (`suprato`) — so the
study/quiz session can show `suprasti – supranta – suprato`.

Two sources, in priority order:

1. The curated `Verb` table (~365 textbook verbs, hand-verified, no network).
2. English Wiktionary's rendered HTML page for the word.

Source 2 is HTML scraping of an external, unversioned page structure. Wiktionary
does not expose conjugation data through any stable API (the REST
`/page/definition/` endpoint used in `routers/extension.py` returns glosses
only), so parsing the rendered page is the only option. Treat every parse here
as fragile by design: if Wiktionary restyles its verb headword line or its
`lt-conj-*` inflection tables, this quietly returns None and verbs simply stop
being enriched — that is expected degradation, not a bug. Nothing in this module
ever raises; callers use it as an optional bonus on top of word creation.
"""
from __future__ import annotations

import logging
import re
import unicodedata
from typing import Optional
from urllib.parse import quote

import httpx
from sqlmodel import Session, func, select

from models import Verb

logger = logging.getLogger(__name__)

# Duplicated (rather than imported) from routers/extension.py on purpose:
# routers/extension.py imports *this* module, so importing back from it would
# be a circular import. One constant is cheaper to duplicate than to refactor.
_WIKTIONARY_UA = "FluentLT-Extension/1.0 (+https://fluent.lt; contact@fluent.lt)"
_WIKTIONARY_TIMEOUT = 4.0

# Wiktionary's verb headword line, e.g.
#   <strong class="Latn headword" lang="lt">supràsti</strong>
#   (<i>third-person present tense</i> <b ...><a ... title="supranta">suprañta</a></b>,
#    <i>third-person past tense</i> <b ...><a ... title="suprato">suprãto</a></b>)
_HEADWORD_PRESENT_RE = re.compile(
    r"third-person present tense</i>(.{0,400}?)(?:,|</span>)", re.DOTALL | re.IGNORECASE
)
_HEADWORD_PAST_RE = re.compile(
    r"third-person past tense</i>(.{0,400}?)(?:\)|</span>)", re.DOTALL | re.IGNORECASE
)
# Inflection-table cells are tagged with a form-of class naming person/tense,
# e.g. class="Latn form-of lang-lt 3|s//p|pres-form-of".
_TABLE_CELL_RE_TEMPLATE = r'class="[^"]*\b3[^"]*\|{tense}-form-of"[^>]*>(.{{0,400}}?)</td>'
_TITLE_RE = re.compile(r'title="([^"]+)"')
_TAG_RE = re.compile(r"<[^>]+>")

_COMBINING_MARKS = "".join(
    chr(c) for c in (0x0300, 0x0301, 0x0303, 0x0308, 0x0304, 0x0330)
)


def _strip_accent_marks(text: str) -> str:
    """Drop Wiktionary's stress/tone marks (combining grave/acute/tilde) while
    keeping real Lithuanian letters (ą, č, ė, ų, ž, …) intact."""
    decomposed = unicodedata.normalize("NFD", text)
    kept = "".join(ch for ch in decomposed if ch not in _COMBINING_MARKS)
    return unicodedata.normalize("NFC", kept)


def _clean_form(fragment: str) -> Optional[str]:
    """Extract a single plain word form from an HTML fragment.

    Prefers the wiki link's `title` attribute — that is always the plain,
    unaccented page name (`supranta`), whereas the visible link text carries
    stress marks (`suprañta`) the rest of the app doesn't use.
    """
    title_match = _TITLE_RE.search(fragment)
    if title_match:
        candidate = title_match.group(1)
    else:
        candidate = _TAG_RE.sub("", fragment)
    candidate = _strip_accent_marks(candidate).strip()
    candidate = candidate.split()[0] if candidate.split() else ""
    if not candidate or len(candidate) > 60:
        return None
    # Guard against picking up markup leftovers / non-word text.
    if not re.fullmatch(r"[^\W\d_]+", candidate, re.UNICODE):
        return None
    return candidate


def _lithuanian_section(page_html: str) -> Optional[str]:
    """Slice out just the Lithuanian language section of a Wiktionary page."""
    start = page_html.find('<h2 id="Lithuanian"')
    if start == -1:
        return None
    next_h2 = page_html.find("<h2 ", start + 1)
    return page_html[start:next_h2] if next_h2 != -1 else page_html[start:]


# The curated `Verb` table stores *stressed* infinitives ("kalbė́ti", "riñkti")
# because it was extracted from the textbook, while `Word.lithuanian` is always
# plain ("kalbėti"). A literal comparison therefore misses nearly every verb, so
# matching folds both sides through `_strip_accent_marks`. That needs the whole
# (static, ~365-row) table in memory; it is cached per process and invalidated by
# row count, which is enough for a table only ever changed by an import script,
# and keeps the cache from going stale under tests that seed extra verbs.
_curated_cache: Optional[tuple[int, dict[str, Verb]]] = None


def _curated_index(session: Session) -> dict[str, Verb]:
    global _curated_cache
    count = session.exec(select(func.count()).select_from(Verb)).one()
    if _curated_cache is None or _curated_cache[0] != count:
        index: dict[str, Verb] = {}
        for verb in session.exec(select(Verb)).all():
            key = _strip_accent_marks(verb.infinitive or "").strip().lower()
            if key:
                index.setdefault(key, verb)
        _curated_cache = (count, index)
    return _curated_cache[1]


def match_curated_verb(session: Session, lithuanian: str) -> Optional[Verb]:
    """Look the infinitive up in the curated textbook `Verb` table.

    Stress marks are ignored on both sides — see `_curated_index`.
    """
    word = (lithuanian or "").strip()
    if not word:
        return None
    exact = session.exec(
        select(Verb).where(func.lower(Verb.infinitive) == word.lower())
    ).first()
    if exact:
        return exact
    return _curated_index(session).get(_strip_accent_marks(word).lower())


def wiktionary_verb_forms(lithuanian: str) -> Optional[dict]:
    """Fetch the Wiktionary HTML page and parse the 3rd-person present/past forms.

    Returns `{"present_3p": ..., "past_3p": ...}` or None on any network error,
    missing Lithuanian section, missing verb entry, or unrecognised markup.
    """
    word = (lithuanian or "").strip()
    if not word or len(word.split()) != 1:
        return None
    try:
        resp = httpx.get(
            f"https://en.wiktionary.org/api/rest_v1/page/html/{quote(word)}",
            headers={"User-Agent": _WIKTIONARY_UA},
            timeout=_WIKTIONARY_TIMEOUT,
            follow_redirects=True,
        )
        resp.raise_for_status()
        page_html = resp.text
    except Exception:
        return None

    try:
        section = _lithuanian_section(page_html)
        if not section:
            return None

        # Preferred source: the verb headword line, which states both principal
        # forms in prose ("third-person present tense X, third-person past tense Y").
        present = past = None
        match = _HEADWORD_PRESENT_RE.search(section)
        if match:
            present = _clean_form(match.group(1))
        match = _HEADWORD_PAST_RE.search(section)
        if match:
            past = _clean_form(match.group(1))

        # Fallback: the conjugation inflection table's 3rd-person cells.
        if not present:
            match = re.search(
                _TABLE_CELL_RE_TEMPLATE.format(tense="pres"), section, re.DOTALL
            )
            if match:
                present = _clean_form(match.group(1))
        if not past:
            match = re.search(
                _TABLE_CELL_RE_TEMPLATE.format(tense="past"), section, re.DOTALL
            )
            if match:
                past = _clean_form(match.group(1))

        if not present or not past:
            return None
        return {"present_3p": present, "past_3p": past}
    except Exception:
        # Any structural surprise in the scraped HTML is a miss, never an error.
        return None


def curated_verb_forms(session: Session, lithuanian: str) -> Optional[dict]:
    """The curated table's principal forms, in the same shape as the Wiktionary
    lookup: `{"present_3p": ..., "past_3p": ...}` or None.

    The curated forms carry textbook stress marks ("kal̃ba", "kalbė́jo"); the app
    never shows those to users (issue #116) and this line sits right next to the
    plain `word.lithuanian`, so they are stripped here — one place, shared by the
    live enrichment path and the backfill script.
    """
    verb = match_curated_verb(session, lithuanian)
    if not verb or not verb.present_3p or not verb.past_3p:
        return None
    present = _strip_accent_marks(verb.present_3p).strip()
    past = _strip_accent_marks(verb.past_3p).strip()
    if not present or not past:
        return None
    return {"present_3p": present, "past_3p": past}


def _looks_like_verb(part_of_speech: Optional[str]) -> bool:
    return bool(part_of_speech) and "verb" in part_of_speech.lower()


def _wiktionary_pos_set(lithuanian: str) -> Optional[set[str]]:
    """All part-of-speech values Wiktionary lists under this word's Lithuanian
    entries, lowercased (e.g. `{"adverb", "verb"}` for the homonym "arti" —
    "near" vs. "to plow"). None on any lookup failure; callers should then
    fall back to whatever signal they already have rather than assume
    ambiguity from a missing result.

    Uses the JSON `/page/definition/` endpoint (glosses only, same one
    `routers/extension.py` uses for its own `part_of_speech` lookup) rather
    than the HTML page `wiktionary_verb_forms` scrapes — this only needs the
    list of senses, not their conjugation tables.
    """
    word = (lithuanian or "").strip()
    if not word:
        return None
    try:
        resp = httpx.get(
            f"https://en.wiktionary.org/api/rest_v1/page/definition/{quote(word)}",
            headers={"User-Agent": _WIKTIONARY_UA},
            timeout=_WIKTIONARY_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        pos: set[str] = set()
        for key_entries in [data.get("lt", []), *data.values()]:
            if not isinstance(key_entries, list):
                continue
            for entry in key_entries:
                if entry.get("language") != "Lithuanian":
                    continue
                value = entry.get("part_of_speech") or entry.get("partOfSpeech")
                if value:
                    pos.add(value.strip().lower())
        return pos or None
    except Exception:
        return None


# The app already hand-tags many words' part of speech via the free-text
# `Word.hint` field, predating this feature — Lithuanian and Russian labels
# both occur depending on when/how the word was added (curriculum seeding vs.
# admin entry). Recognizing these lets callers skip network calls entirely for
# already-confirmed non-verbs, and — more importantly — treat a "verb" hint as
# authoritative even when Wiktionary lists the same headword under another
# part of speech too (the "arti" homonym case above): the app's own data
# already tells us which sense this particular word row is.
_HINT_POS = {
    "veiksmažodis": "verb",
    "глагол": "verb",
    "daiktavardis": "noun",
    "būdvardis": "adjective",
    "prieveiksmis": "adverb",
    "skaitvardis": "numeral",
    "prielinksnis": "preposition",
    "įvardis": "pronoun",
    "jungtukas": "conjunction",
    "dalelytė": "particle",
    # Not grammatical POS labels per se, but every word tagged this way is a
    # proper noun (a country or nationality name) — grouping them under
    # "noun" is enough to skip the verb-lookup network call for them too.
    "šalis": "noun",
    "tauta": "noun",
}


def part_of_speech_from_hint(hint: Optional[str]) -> Optional[str]:
    """Map a known `Word.hint` value to a normalized part of speech, or None
    if the hint is unset or is free text (a grammatical note like "m./f.",
    not a POS tag)."""
    if not hint:
        return None
    return _HINT_POS.get(hint.strip().lower())


EMPTY_VERB_FIELDS = {
    "part_of_speech": None,
    "verb_present_3p": None,
    "verb_past_3p": None,
}


def enrich_verb_forms(
    session: Session, lithuanian: str, part_of_speech: Optional[str] = None
) -> dict:
    """Resolve `{part_of_speech, verb_present_3p, verb_past_3p}` for a word.

    Curated `Verb` table first (hand-verified), Wiktionary HTML fallback.
    Never raises — on any failure the verb fields come back None and the caller
    just stores a word without principal forms.
    """
    result = dict(EMPTY_VERB_FIELDS)
    result["part_of_speech"] = part_of_speech
    try:
        word = (lithuanian or "").strip()
        if not word:
            return result

        curated = curated_verb_forms(session, word)
        if curated:
            result["part_of_speech"] = "verb"
            result["verb_present_3p"] = curated["present_3p"]
            result["verb_past_3p"] = curated["past_3p"]
            return result

        # A known non-verb never needs the (slow) network call.
        if part_of_speech and not _looks_like_verb(part_of_speech):
            return result

        # Unless the caller already confirmed this word's actual sense is a
        # verb (e.g. from the app's own hint-based POS tagging), guard
        # against homonyms across parts of speech: don't trust a scraped verb
        # conjugation section if Wiktionary also lists a different part of
        # speech for the same headword — that page section may belong to an
        # unrelated word ("arti" = adverb "near" AND verb "to plow").
        if not _looks_like_verb(part_of_speech):
            pos_set = _wiktionary_pos_set(word)
            if pos_set is not None and pos_set != {"verb"}:
                return result

        forms = wiktionary_verb_forms(word)
        if forms:
            result["part_of_speech"] = "verb"
            result["verb_present_3p"] = forms["present_3p"]
            result["verb_past_3p"] = forms["past_3p"]
    except Exception:
        logger.warning("verb form enrichment failed for %r", lithuanian, exc_info=True)
        return dict(EMPTY_VERB_FIELDS, part_of_speech=part_of_speech)
    return result
