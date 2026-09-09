# Verb principal forms during study (feature #20)

Verbs show `infinitive – present 3p – past 3p` (e.g. `duoti – duoda – davė`) inside the
study/quiz session, **as TAK's speech-bubble text** (see "Where the line is (and isn't) shown"
below) rather than as text inside the card. Data lives on `Word` (`part_of_speech`,
`verb_present_3p`, `verb_past_3p`, Alembic revision `a7b8c9d0e1f2`), is resolved by
`backend/verb_lookup.py`, and is rendered by `getVerbForms()` in
`frontend/app/dashboard/components/QuizSession.tsx`.

## Gotchas found while building/validating this

**The curated `Verb` table stores *stressed* infinitives.** `Verb.infinitive` comes from the
textbook PDF extraction and looks like `kalbė́ti` / `riñkti`, while `Word.lithuanian` is always
plain (`kalbėti`). A literal `Verb.infinitive == Word.lithuanian` comparison therefore matched only
19 of ~3900 words — the curated source that the design says must take priority was effectively
dead. `match_curated_verb()` now folds both sides through `_strip_accent_marks()` (backed by a
process-lifetime index of the ~365-row table, invalidated by row count so tests that seed extra
verbs still see them). After the fix the same scan matched 519 words.

**The curated forms must be stripped before display.** `present_3p`/`past_3p` carry the same
textbook stress marks (`kal̃ba`, `kalbė́jo`). The app never shows stress marks to users
(issue #116, `frontend/tests/issue-116-verbs-no-stress-marks.spec.ts`) and this line renders right
next to the plain infinitive, so `curated_verb_forms()` strips them in one shared place used by
both the live enrichment path and `backend/scripts/backfill_verb_forms.py`.

**Wiktionary has no conjugation API.** The REST `/page/definition/` endpoint used by the extension
returns glosses only, so `wiktionary_verb_forms()` scrapes the rendered
`/api/rest_v1/page/html/{word}` page (headword line first, inflection-table cells as a fallback).
This is fragile by design: any markup change silently degrades to "no forms found", never an error.
Every caller wraps it best-effort, and it must never block word creation.

**Tests must never hit Wiktionary.** `backend/conftest.py` autouse-stubs
`verb_lookup.wiktionary_verb_forms` **and** `verb_lookup._wiktionary_pos_set` to a miss for the
whole suite (same rationale as the existing Telegram / `_wiktionary_lookup` stubs); the curated
half still runs for real. `backend/tests/test_verb_lookup.py` restores the real functions for
their own scope, with `httpx.get`/`httpx.Client` mocked, to exercise the parsers.

**Wiktionary homonyms poison the scrape unless guarded — found via live user testing, not a
review.** `arti` means "near" (adverb) in this app's vocabulary, but Wiktionary's page for `arti`
*also* has a verb section — "arti" is a homonym meaning "to plow" as a verb. The scraper doesn't
know which sense a given `Word` row means, so an early version confidently attached the "to plow"
conjugation (`aria`/`arė`) to the "near" word. Same bug, same root cause, hit `stotis` ("station",
a noun) via the unrelated reflexive verb `stotis` ("to become"/"to stand up"). Fix: before trusting
a scraped verb section, `enrich_verb_forms()` now calls `_wiktionary_pos_set()` (the JSON
`/page/definition/` endpoint, not the HTML page) and only proceeds if it lists **only** `"verb"`
for that headword — anything else (including a lookup failure, conservatively) either skips or,
better, defers to a caller-supplied `part_of_speech` that already know's the word's real sense.

**The app already had a part-of-speech tagging scheme, hiding in `Word.hint` — also found via live
testing.** Independent of this feature, hundreds of curriculum words already carry a POS tag as
free text in `hint`: `veiksmažodis`/`глагол` (verb, LT/RU depending on when the word was seeded),
`daiktavardis` (noun), `būdvardis` (adjective), `prieveiksmis` (adverb), `skaitvardis` (numeral,
already special-cased elsewhere for the digit display), `prielinksnis`/`įvardis`/`jungtukas`/
`dalelytė`, plus `šalis`/`tauta` (country/nation category tags, mapped to `noun`). None of this was
found during planning — it surfaced only once a real hint-tagged verb (`keltis`, hint `глагол`)
showed no forms in testing. `verb_lookup.part_of_speech_from_hint()` maps these values; the
backfill script passes the result into `enrich_verb_forms()` as the known `part_of_speech`, which:
(a) skips the network entirely for ~1900 already-confirmed non-verbs, persisting that POS so future
runs don't re-derive it, and (b) trusts a hint-confirmed verb's scraped forms even when Wiktionary
lists the same headword under another part of speech too — the app's own tagging of *this specific
word row* outranks a generic homonym-ambiguity guard built for words with no such signal.

## Backfill status

`backend/scripts/backfill_verb_forms.py` (`--dry-run`, `--limit N`) is safe to re-run — it only
looks at rows with `part_of_speech IS NULL`, and non-verb hint matches are persisted (not just
verbs), so re-runs get cheaper over time. It now: (1) tries the curated table, (2) for a miss,
checks `Word.hint` — a confirmed non-verb is tagged and skipped with no network call, an unhinted
multi-word phrase is skipped as "never a single verb", (3) otherwise calls `enrich_verb_forms()`
(curated already tried; homonym-guarded Wiktionary scrape for the rest). Two network calls
(pos-check + scrape) per non-curated attempt, both politely rate-limited, so a full run over
thousands of words is a background job measured in hours, not minutes — run it detached and poll
`select count(*) from word where archived=false and part_of_speech is null` rather than waiting on
it synchronously.

## Where the line is (and isn't) shown

`getVerbForms()`'s output starts with `word.lithuanian`, which on some stages is exactly the answer
being elicited. `showVerbForms` in `QuizSession.tsx` is true immediately on stage 1 (flashcard),
stage 2 (forward MCQ) and stage `3s` (syllable gap-fill), and on stages `2r` / `2a` / `3` only
*after* the user has answered (`answerState` is no longer `'unanswered'`/`'empty'`).

**Display location: TAK's speech bubble, not the card.** The first implementation put the line
inside the card next to the part-of-speech hint; the second put it in a second bubble beside TAK.
Both were revised after user feedback — the shipped version replaces the text of TAK's *existing*
single bubble (the one that normally says `Prisimeni?`/`Pagalvok!`) with the forms, via
`PageMascot`'s new `forcePhrase` prop (see the component library doc). Without `forcePhrase`, the
bubble's own mood-reaction system (`Puiku!`, `Hmm…`, …) wins the instant mood moves off neutral —
which happens on essentially every answer — so the forms would vanish right when the `2r`/`2a`/`3`
stages need to reveal them. `forcePhrase` pins the bubble text while leaving TAK's pose to keep
following mood as normal.

`frontend/tests/verb-principal-forms.spec.ts` guards both the timing (before/after answering) and,
via `PageMascot`'s new `phraseTestId` prop, the shown text itself — the "not visible before
answering" assertions are the anti-spoiler regression guard.
