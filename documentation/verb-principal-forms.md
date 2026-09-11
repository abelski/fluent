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

**The curated table has the exact same homonym risk, from a different angle — found while
verifying the lazy-load change against real data.** `enrich_verb_forms()` originally checked the
curated `Verb` table *before* a caller-supplied `part_of_speech`. This app's own vocabulary has two
separate `Word` rows both spelled `stotis` — one a noun ("station", hint `daiktavardis`), one a verb
("to stand up", hint `глагол`) — and the curated table separately has its own `stotis` entry for
the verb sense. Checking curated first meant the **noun** row got the **verb's** conjugation forms
attached every time, because the curated table has no way to know which of the app's two distinct
word rows is being asked about — only the hint does. Reproduced live against production data
(`lazy_enrich_word` on the still-unenriched noun row actually set `part_of_speech="verb"` before the
fix) before landing the fix: a hint-confirmed non-verb is now checked *first* in
`enrich_verb_forms()`, before the curated table is even queried. This is a distinct bug from the
Wiktionary-side homonym guard below — fixing one did not fix the other, since they're two separate
code paths that both consult `part_of_speech` at the wrong point relative to their own data source.
**Residual limitation, accepted:** a word with *no* hint at all (unenriched pre-existing vocabulary,
or a personal word added without one) that happens to share spelling with an unrelated curated verb
is still not protected — there is no signal to know it's the "wrong" sense. Only Wiktionary-sourced
enrichment for unhinted words gets the cross-part-of-speech ambiguity guard (below); the curated
table is still trusted unconditionally for anything not hint-confirmed non-verb.

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

**The ambiguity guard's exact-match check was itself too strict — found while checking real
verbs, not just the known-bad ones.** `_wiktionary_pos_set("valgyti")` ("to eat", an entirely
ordinary, unambiguous verb) returns `{"participle", "verb"}`, not `{"verb"}` alone — Wiktionary
documents a verb's own participle as a separate `Participle` entry under the same headword (its
`definition` field is a `form-of-definition` pointing straight back at `valgyti` itself, confirmed
by fetching the raw JSON). An exact `pos_set == {"verb"}` check would have silently blocked
`valgyti`, and likely many other ordinary verbs, from ever being enriched via Wiktionary at all —
the opposite failure mode from `arti`/`stotis` (false negative instead of false positive). Fixed by
excluding `"participle"` from what counts as a competing sense: `(pos_set - {"participle"}) !=
{"verb"}`. Re-verified against real Wiktionary afterward: `valgyti` now resolves correctly
(`valgo`/`valgė`) while `arti`/`stotis`-style genuine homonyms are still correctly blocked.

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

## Enrichment now happens lazily, at serve time — the batch script is a secondary tool

Originally this was populated purely by a standalone batch job
(`backend/scripts/backfill_verb_forms.py`) crawling the entire vocabulary table once. That job is a
`~1900`-non-verb-skip-fast + `~1500`-verb-lookup-slow split: the slow half is a rate-limited
Wiktionary crawl (up to 2 calls per word) measured in **hours**, and — worse — most of vocabulary is
never studied by any user, so a full pass spends most of its time enriching words nobody will ever
see, while genuinely-studied words wait behind the queue.

Per user request, enrichment now also happens **lazily, inline with serving a word**:
`verb_lookup.lazy_enrich_word()`/`lazy_enrich_words()` run right before a study/review queue is
returned (`backend/routers/words.py`'s `_list_words`, `_known_due_words`,
`get_review_known_upcoming`, `get_review_known_random`, `get_review_mistakes`; and
`word_lists.py`'s `/api/me/word-lists/{id}`), enriching only the words a real request is about to
show. Cheap paths (curated-table match, hint-confirmed non-verb) always run — pure DB reads, no
network. The slow Wiktionary path is capped by a per-request budget (`wiktionary_budget`, default
1 — a 1-element list shared across every word in that request/batch, decremented as it's spent)
**and** a wall-clock deadline (`_WIKTIONARY_BATCH_DEADLINE_SECONDS`, 4s — roughly one Wiktionary
timeout window), so a page that happens to surface many never-enriched words at once can't turn
into dozens of sequential HTTP calls, or unbounded latency, inside one request. Whatever neither
covers this time (budget or deadline already exhausted, so no network call was even attempted) is
simply retried the next time that word is served — that part costs nothing extra.

**Bug #173 fix (2026-09), part 1 — the eternal retry.** A word that a *live* Wiktionary attempt
actually ran for and still found nothing used to stay eternally retriable: `part_of_speech` was
left `NULL` forever, so every future view of that word paid for another lookup attempt,
indefinitely, for legal/constitutional or other niche vocabulary that will never resolve on
Wiktionary. Now, whenever a live attempt is made (budget and deadline both allowed it) and still
misses, a sentinel non-verb `part_of_speech = "unknown"` is persisted instead of `NULL`, so the
existing `part_of_speech is not None` skip-gate stops retrying that specific word after its first
real miss. A word that was *never* attempted (budget/deadline already exhausted before its turn)
is left untouched and retried on a later visit — marking one of those would permanently label a
word nobody ever looked up.

## Why a list page took ~20 seconds — it was never Wiktionary (bug #173)

Worth reading before optimising anything in this module again, because the obvious suspect was
the wrong one. Issue #173 reported ~20s to open a 56-word personal list. The triage pass blamed
the Wiktionary HTTP calls above — it is the only thing in the file that visibly does I/O. It was
measured and it was wrong: Wiktionary answers in 0.7–1.3s and contributed almost nothing. The
cost was **N+1 round trips to the remote Neon database**, from two places where nothing in the
source looks like I/O at all:

1. **`match_curated_verb()` ran two DB queries per word.** An exact `SELECT` on `Verb.infinitive`,
   plus a `SELECT COUNT(*)` inside `_curated_index()` to check whether the in-memory cache was
   stale — *per lookup*. The curated table is ~358 static rows that were already fully cached;
   only the freshness poll wasn't. On list 316 (56 words): 9.94s of exact queries + 10.00s of
   COUNTs ≈ the 20s reported. Fixed by building **both** indexes (exact lowercase infinitive and
   accent-stripped lowercase) from the one table scan, and validating the row count **once per
   `Session`** via `session.info` instead of once per lookup. A request is one session, so a
   56-word list costs one COUNT. Tests that seed extra verbs still see them, because they open a
   fresh `Session` after seeding — that is exactly why the invalidation is keyed to the session
   and not to a timer.
2. **`expire_on_commit` turned one commit into hundreds of SELECTs.** `lazy_enrich_words()`
   commits, and SQLAlchemy's default expires every `Word` object the caller is holding. The very
   next thing every caller does is serialize those same rows, so each attribute access silently
   re-`SELECT`ed its row one at a time: **42.98s for list 178's 241 words**, dwarfing the bug as
   originally reported. Fixed by turning `expire_on_commit` off around that single commit — the
   rows were just written *from* these objects, so their in-memory state already matches the DB.
   Note this got *worse* when the part-1 sentinel landed, because the sentinel makes the batch
   commit something on nearly every visit; a fix for one half of a performance bug can activate
   the other half.

Measured on the real database, `_list_words`: list 178 (241 words) **45.2s → 1.7s**; list 316
(the reported list, 56 words) **21.3s → 1.7s**. Over HTTP, `GET /api/lists/178` went from
exceeding a 60s timeout to 1.8–4.0s.

Both regressions are guarded by statement-counting tests in `backend/tests/test_verb_lookup.py`
(`test_lazy_enrich_words_query_count_does_not_scale_with_word_count` and
`test_lazy_enrich_words_commit_does_not_expire_caller_word_objects`), which count SQL via a
`before_cursor_execute` listener rather than asserting on wall-clock time. Both were confirmed to
fail against the pre-fix code. The general lesson: this app's database is remote (Neon, ~180ms per
round trip from a dev machine), so a per-row query in a request path costs seconds, not
milliseconds — count statements, don't eyeball the code for `requests.get`.

The standalone `backfill_verb_forms.py` (`--dry-run`, `--limit N`) still exists and is still safe to
run — it's useful for pre-warming the cheap paths across the whole table in one pass (curated
matches + hint-confirmed non-verbs, both free) or for an operator who wants full coverage
immediately rather than waiting for organic study traffic to reach every word. It is no longer load-
bearing for the feature to work.

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
