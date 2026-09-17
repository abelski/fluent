# Extension — current behavior

## Purpose
Backs the Fluent Chrome extension: looking up a Lithuanian word/short phrase
selected on any webpage (translation + best-effort dictionary enrichment: base
form, part of speech, grammar note, numbered senses, verb forms), and saving a
looked-up word into the student's personal vocabulary. Also serves the
extension's install metadata and a downloadable zip for the in-app install
page. Called by the browser extension's content script/popup over REST with
the student's normal JWT, plus two public (unauthenticated) endpoints for
installation info. The `/extension` dashboard-adjacent marketing page
(`frontend/app/extension/page.tsx`, at the top level, not under `/dashboard`)
is the human-facing install/usage guide that calls those two public endpoints.

Backed by: `backend/routers/extension.py`, `frontend/app/extension/page.tsx`.

## Scenarios

```gherkin
Scenario: Translation is free for any logged-in user
  Given a logged-in user (any tier) selects a word and GET /extension/translate
    is called with word + lang ("en" | "ru" | "both")
  Then a translation is returned regardless of premium status — this lookup is
    a funnel feature, not gated
  And an unauthenticated request is rejected with 401

Scenario: Word validation rejects unusable input before any lookup
  Given the word query param
  When it is empty, over 80 characters, more than 4 space-separated tokens, or
    contains no letters at all (checked against any Unicode letter, so
    Lithuanian diacritics count)
  Then the request is rejected with 422 before any DB or network call

Scenario: DB hit short-circuits external lookups
  Given the selected word matches a public, non-archived Word row
    case-insensitively (preferring the row with star=1, the curriculum "base
    form" convention, when several match)
  When translate_word runs
  Then the response's word/translation_en/translation_ru/source="db" come
    straight from that row and no MyMemory/Google/Wiktionary network call is
    made for the top-level translation
  And only the requested lang(s) are populated — an unrequested language comes
    back null even though the DB row stores both

Scenario: DB hit that is already the clean base form skips enrichment lookups
  Given the matched DB word's lithuanian text equals the query exactly
    (case-insensitive) and its star == 1
  When enrichment runs
  Then base_form/base_form_accented/part_of_speech/verb_present_3p/
    verb_past_3p are filled straight from that DB row's own stored columns,
    with no Wiktionary round trip at all
  And a DB match whose star != 1 (an inflected/multi-form entry) still goes
    through full Wiktionary/simplemma enrichment below

Scenario: No DB hit falls back to MyMemory, then Google's free endpoint
  Given no public Word row matches
  When the top-level translation is fetched for each requested language
  Then MyMemory is tried first (with one retry on a transient network error
    only, not on an HTTP error response); if it returns nothing, an echo of
    the input, or — for a Russian target — text with no Cyrillic characters at
    all, the free/unofficial Google Translate endpoint is tried next with the
    same echo check
  And a result failing the script check from both sources is discarded
    entirely rather than returned as a wrong-script translation
  And these calls and the enrichment lookup run concurrently in a thread pool,
    not sequentially, and the whole fallback lookup result is cached in-memory
    per (word, langpair) — the cache is cleared wholesale once it exceeds 2000
    entries, and only successful lookups are ever cached

Scenario: No translation found anywhere, but enrichment found a base form
  Given both the top-level en and ru lookups return nothing
  When enrichment (Wiktionary or simplemma) resolved a base/lemma form that
    itself has a translation
  Then the response degrades to that base form's translation
    (source="mymemory") instead of a hard 404, with the enrichment fields
    still attached so the client can show it's the base form's meaning

Scenario: No translation found anywhere and no fallback available
  Given neither the top-level lookup nor enrichment's own base-form
    translation produced anything
  Then the request is rejected with 404 "No translation found"

Scenario: Multi-word selections skip dictionary enrichment
  Given the selected text is more than one token
  Then Wiktionary/simplemma enrichment is skipped entirely (they are
    single-word dictionaries) and every enrichment field comes back null —
    only the top-level translation fields are populated

Scenario: Wiktionary "form of" entries resolve to their lemma
  Given the first Wiktionary definition for the word is a "form-of" entry
    (e.g. "locative plural of namas")
  Then base_form is set to the parsed lemma, grammar_note to the human
    description, and the lemma's own senses/translations/verb forms are
    looked up (concurrently, since only one of the two calls touches the DB
    session) rather than returning the inflected form's own (nonexistent)
    definitions
  And the lemma link text is always the plain unaccented form — Wiktionary
    page titles cannot carry Lithuanian stress marks — so base_form_accented
    only gets filled when that lemma also happens to be a public DB word

Scenario: Adding a word requires premium (or admin)
  Given a logged-in student who is neither an admin nor currently
    premium-active
  When POST /extension/words is called
  Then the request is rejected with 403 "Adding words is available on
    Premium."

Scenario: Adding a word validates translations
  Given translation and translation_ru are both blank after trimming
  Then the request is rejected with 422 "translation or translation_ru is
    required"
  And whichever of the two is present is mirrored into the other so the saved
    Word row always has both columns populated (matching the rest of the
    personal-word convention), each capped at 200 characters

Scenario: Adding a word defaults to the auto-created "From internet" list
  Given no list_id is provided
  When the student has no existing private "From internet" list of their own
  Then one is created on the fly (is_public=false, difficulty="easy") and used
    as the target
  And an explicit list_id is instead required to resolve to a list the
    student owns, that is private and non-archived — the same ownership rule
    used by the dedicated word-list endpoints

Scenario: Adding a word the student already has anywhere is a no-op
  Given the word (case-insensitive) already exists in ANY of the student's own
    personal lists, OR the student has any UserWordProgress row at all for a
    matching word (studied via some list they had access to, public
    curriculum included)
  When POST /extension/words is called, regardless of which list_id was
    requested
  Then no new Word/WordListItem row is created; the response reports
    already_added=true with a human-readable "location" naming where it
    already lives (falling back to "your vocabulary"/"«word»" phrasing when no
    nameable, visible list can be found for a progress-only match)
  And id/list_id are only included in that response when the duplicate
    happens to sit in the exact target list that was resolved — the client
    never dereferences those fields unconditionally

Scenario: A newly saved word gets best-effort verb forms
  Given the word is being newly created (not a duplicate)
  Then enrich_verb_forms is attempted for its principal parts; any failure
    there is caught and the word is still saved with empty verb fields rather
    than failing the save

Scenario: Extension install metadata is public
  Given no Authorization header at all
  When GET /extension/info or GET /extension/download is called
  Then both succeed anyway — version is read live from extension/manifest.json
    on every call (no caching), and the download endpoint zips the whole
    extension/ folder fresh per request, rooted under a single
    "fluent-extension/" folder, skipping README.md and dotfiles at any depth
  And a missing extension/ folder or manifest.json on disk yields 404
    "Extension not found" instead of a 500
```
