---
kind: feature
status: done
iteration: 1
max_iterations: 30
suggested_model: opus
suggested_effort: high
confirmed_model: opus
confirmed_effort: high
---

# Show verb principal forms (infinitive – present – past) during study

## Context

User feedback (RU): when studying a verb infinitive like `suprasti` (понимать), it would help to
also see the two other principal forms nearby, e.g. `suprasti – supranta – suprato`.

Current state (confirmed via codebase exploration):
- `Word` (`backend/models.py:84-95`) has no part-of-speech or verb-form fields — only
  `lithuanian`, `translation_en/ru`, `hint`, `star`, `accented`.
- A separate, unrelated `Verb` table (`backend/models.py:580-598`, curated ~365-verb textbook
  dataset for grammar exercises) already has exactly this shape: `infinitive`, `present_3p`,
  `past_3p`. It has no FK to `Word` and only covers a fixed curated list, not arbitrary vocabulary.
- Schema changes now go through **Alembic** (`backend/migrations/versions/`, current head
  `d5e6f7a8b9c0`); the legacy `backend/migrations_legacy/` scripts are dead. Precedent for adding
  columns to `verb` is `d4e5f6a7b8c9_add_freq_rank_theme_to_verb.py`.
- `backend/routers/extension.py` already does a Wiktionary lookup (`_wiktionary_lookup`,
  lines 254-309) against the REST **definition** endpoint to get `part_of_speech` for the Chrome
  extension's word-enrichment flow — but that endpoint returns glosses only, no conjugation data.
  Getting `present_3p`/`past_3p` requires a second lookup against the **HTML** page
  (`/api/rest_v1/page/html/{word}`) and parsing the Lithuanian inflection table.
- `add_my_word` / `bulk_add_my_words` (`backend/routers/word_lists.py:348-407`) both create plain
  `Word` rows (`lithuanian`, `translation_en/ru`, `star=1`) with no enrichment — personal-list words
  *are* `Word` rows, so they flow through the same study/quiz pipeline as curriculum words.
- Study-session rendering is centralized in `frontend/app/dashboard/components/QuizSession.tsx`.
  The `Word` interface (lines 21-35) is the single canonical type re-used by `frontend/lib/api.ts`.
  There's already a precedent for a conditional per-word display line — the `hint === 'skaitvardis'`
  digit special-case (`getDigit`, lines 90-93) — rendered at 6 sites across the different quiz
  stages (flashcard, MCQ, assemble, type, mistake-gap-fill, done-screen), all following the same
  `{word.hint && !digit && <p ...>}` pattern.
- User's explicit answers (via clarifying questions): show forms **only in the study/quiz
  session** (not list/vocabulary pages); populate via **Wiktionary lookup**; detect verbs via a new
  **`part_of_speech`** field on `Word`.

`suggested_model`/`suggested_effort` rationale: mostly a well-patterned Alembic + response-field
addition, but the new Wiktionary HTML inflection-table parser is genuinely novel/fragile (no
existing code to mirror) — `opus` at `high` effort to get that scraper right the first time.

## Goals

- For verb words, show the three principal forms (infinitive – present 3rd person – past 3rd
  person) near the translation during study/quiz sessions, e.g. `suprasti – supranta – suprato`.
- Auto-populate `part_of_speech` and the two conjugated forms for verbs:
  - Existing curriculum words: one-off backfill script, preferring the curated `Verb` table
    (accurate, no network calls) and falling back to a new Wiktionary inflection-table lookup for
    verbs not in that table.
  - New words added one-at-a-time via the app (`add_my_word`) or the Chrome extension: best-effort
    synchronous lookup at creation time (curated table first, Wiktionary fallback), non-blocking on
    failure.

## Non-Goals

- No display of verb forms outside the study/quiz session (not on `/dashboard/lists/[id]` row view
  or `/dashboard/vocabulary`) — per the user's explicit choice.
- No enrichment during `bulk_add_my_words` (pasting many words at once) — synchronous per-word
  Wiktionary calls would multiply request latency unacceptably for a bulk paste; bulk-added verbs
  simply won't show forms until a future backfill run. Documented as a known gap, not silently
  fixed.
- No UI for manually editing/correcting a word's `part_of_speech` or verb forms (out of scope; can
  follow up if lookup accuracy proves to be an issue).
- Not extending this to other parts of speech (noun cases, adjective forms, etc.) — verbs only, per
  the feedback.

## Requirements

- A verb word must show all three forms together only when all three are known (infinitive is
  always `word.lithuanian`; skip the display entirely if either conjugated form is missing/null —
  never show a partial/broken triple).
- Lookup failures (network error, word not found, ambiguous entry) must never block word creation —
  wrap in try/except, leave fields `null`, log and move on.
- The curated `Verb` table match must be tried first and take priority over a Wiktionary result
  whenever it matches, since it's hand-verified.
- The verb-forms line must never reveal the answer before the user has had a chance to produce it
  themselves: on stage 1 (flashcard) and stage 2 (forward MCQ) the Lithuanian word is already the
  prompt, so it shows immediately; on stage `3s` (syllable gap-fill) the word is already visible
  except one syllable, so it shows immediately too. On stage `2r` (reverse MCQ — select the
  Lithuanian word from options), stage `2a` (assemble the Lithuanian word from tiles), and stage
  `3` (type the Lithuanian word), `word.lithuanian` (the line's first segment) *is* the answer being
  elicited — there it only appears once `answerState` leaves `'unanswered'`/`'empty'` (i.e. after
  the user has submitted/selected and the correct answer is already revealed on screen), never
  before. (Found via user testing during implementation: an earlier, more conservative version of
  this rule hid the line entirely on those three stages, which the user flagged as unwanted once
  they'd already answered — revealed-after-answer is correct, hidden-before-answer is correct;
  hidden-forever-on-those-stages was overcorrecting.)

### Standing constraints
- All validation must be server-side (never frontend-only).
- If this plan touches markup, styling, or a component: read
  `documentation/design system/Component Library (as-built).html` and
  `documentation/IMPLEMENTATION.md` first, use named design tokens (never a raw Tailwind step), and
  run `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change. **N/A for
  the shared shell/parity spec** — this only touches the internal quiz-card markup in
  `QuizSession.tsx`, which is not one of the 5 top-nav `PageShell` pages tracked by that spec; still
  mirror the existing sibling `hint`/`digit` line's classes rather than inventing new colors.
- Add autotest coverage for the new feature and run the relevant suite(s) as part of Validation.

## Implementation

- [x] 1. `backend/migrations/versions/<new>_add_verb_forms_to_word.py` — new Alembic revision
      (`down_revision = 'd5e6f7a8b9c0'`) adding nullable columns to `word`:
      `part_of_speech` (String), `verb_present_3p` (String), `verb_past_3p` (String). Mirror
      `d4e5f6a7b8c9_add_freq_rank_theme_to_verb.py`'s `upgrade`/`downgrade` shape.
- [x] 2. `backend/models.py` — add the same three `Optional[str] = None` fields to `Word`
      (~line 84-95), next to `hint`/`accented`.
- [x] 3. New helper module `backend/verb_lookup.py`:
      - `match_curated_verb(session, lithuanian: str) -> Optional[Verb]` — `select(Verb).where(Verb.infinitive == lithuanian)`.
      - `wiktionary_verb_forms(lithuanian: str) -> Optional[dict]` — fetch
        `https://en.wiktionary.org/api/rest_v1/page/html/{word}`, parse the Lithuanian
        conjugation/inflection table (look for the "present" and "past (simple)" rows, take the
        3rd-person singular — Lithuanian tables label this `jis/ji`), return
        `{"present_3p": ..., "past_3p": ...}` or `None` on any parse failure. Reuse
        `_wiktionary_lookup`'s existing UA header / timeout / Lithuanian-language filtering
        conventions from `extension.py` rather than duplicating them from scratch — extract that
        shared bit if easy, otherwise duplicate minimally.
      - `enrich_verb_forms(session, lithuanian: str, part_of_speech: str | None) -> dict` —
        orchestrates: if `part_of_speech` looks like a verb (or unknown — try anyway and only keep
        the result if a match is found), try curated table first, then Wiktionary; returns a dict
        of the three fields (or all-`None`) plus resolved `part_of_speech`. Never raises.
- [x] 4. `backend/routers/extension.py` — extend `_enrich()` (~lines 372-439) to call
      `enrich_verb_forms` when `part_of_speech` indicates a verb, adding `verb_present_3p` /
      `verb_past_3p` to the enrichment dict already returned to the extension UI, and persist them
      when the extension's "save word" endpoint creates the `Word` row.
- [x] 5. `backend/routers/word_lists.py` — in `add_my_word` (~line 348), after building the `Word`,
      call `enrich_verb_forms` best-effort (try/except around the whole call) and set the three
      fields before commit. Leave `bulk_add_my_words` unchanged (see Non-Goals).
- [x] 6. `backend/routers/words.py` — add `part_of_speech`, `verb_present_3p`, `verb_past_3p` to the
      per-word response dict at all 4 study-session-serving sites (~195-202, 573-579, 750-756,
      1290-1296), matching how `accented`/`hint` are already included there.
- [x] 7. `backend/routers/word_lists.py` — add the same three fields to the `/api/me/word-lists/{id}`
      response builder so personal-list study sessions carry them too.
- [x] 8. `backend/scripts/backfill_verb_forms.py` — one-off script: iterate all non-archived `Word`
      rows missing `part_of_speech`, run `enrich_verb_forms` (curated table first, Wiktionary
      fallback with a short sleep between external calls to be a polite API consumer), commit in
      batches, log a summary count (verbs found / forms filled / lookup misses).
- [x] 9. `frontend/app/dashboard/components/QuizSession.tsx` — extend the `Word` interface
      (lines 21-35) with `part_of_speech?: string | null`, `verb_present_3p?: string | null`,
      `verb_past_3p?: string | null`. Add a `getVerbForms(word): string | null` helper (mirroring
      `getDigit`) that returns `` `${word.lithuanian} – ${word.verb_present_3p} – ${word.verb_past_3p}` ``
      when both forms are present, else `null`. Render it at the same 6 sites as the existing
      `{word.hint && !digit && ...}` line (1009-1031, 1040, 1083, 1130, 1221, 1330), reusing that
      line's existing classes so it looks like a natural sibling, shown whenever `getVerbForms`
      returns non-null (independent of `digit`/`hint`, since a word won't have both).
- [x] 10. `frontend/lib/api.ts` — no changes expected (it re-uses `QuizSession`'s `Word` type), but
      verify `CustomWordItem` (lines 732-738) / personal-list study response typing don't need a
      parallel update — align if the personal-list study path turns out to use a distinct shape.

## Validation

- [x] Backend unit: `cd backend && .venv/bin/python -m pytest -q` (add a test for
      `enrich_verb_forms` covering: curated-table hit, Wiktionary fallback with a mocked response,
      and a graceful `None` on lookup failure)
- [x] Migration: `cd backend && .venv/bin/alembic upgrade head` runs clean against the dev DB
- [x] Backfill script: run `backfill_verb_forms.py` against dev DB, confirm known verbs (e.g. a
      curated one like `kalbėti`) get `verb_present_3p`/`verb_past_3p` populated
- [x] Playwright autotest added: extend/add a spec under `frontend/tests/` that seeds a verb word
      with forms and asserts the `infinitive – present – past` line renders during study
- [x] Smoke: study a list containing a known verb locally, confirm the three-forms line appears
      under the flashcard and doesn't appear for non-verb words
- [x] Edge case: verb with only `part_of_speech` set but no forms found → no partial/broken line
      shown
- [x] `add_my_word` with a verb (e.g. add "suprasti") → confirm forms get populated without
      blocking/erroring the request even if Wiktionary is unreachable (simulate by breaking DNS or
      mocking a timeout)
- [ ] News post written and published via /news-writer

## Post-implementation fixes (found via live user testing, not covered by the checklist above)

- **Homonym-ambiguity guard.** `arti` ("near", adverb) and `stotis` ("station", noun) both got
  mistagged as verbs with forms belonging to an unrelated same-spelled verb sense ("to plow" /
  "to become"). `verb_lookup.enrich_verb_forms()` now checks Wiktionary's part-of-speech listing
  (`_wiktionary_pos_set`) before trusting a scraped conjugation section, unless the caller already
  knows the word's real sense (see next item). Covered by new tests in `test_verb_lookup.py`; bad
  rows cleaned up in the dev DB.
- **Reused the app's existing `Word.hint` POS tags.** Hundreds of curriculum words already carry a
  part-of-speech tag as free text in `hint` (`veiksmažodis`/`глагол` for verbs, etc.) — a signal
  this plan missed during planning. `part_of_speech_from_hint()` maps it; the backfill now uses it
  to skip already-confirmed non-verbs for free and to trust hint-confirmed verbs' scraped forms
  even past the homonym guard above.
- **Display moved to TAK's speech bubble.** Per user feedback, the forms line is no longer text
  inside the card — it replaces the text of TAK's existing single speech bubble (which normally
  says `Prisimeni?`/`Pagalvok!`) via a new `forcePhrase` prop on `PageMascot` (documented in the
  component library). See `documentation/verb-principal-forms.md` for why a plain prop swap wasn't
  enough (the bubble's own mood-reaction system would otherwise override it on almost every
  answer).
- All of the above were re-verified against the full Playwright/pytest suites (see Definition of
  Done) after landing, not just the narrower specs that motivated each fix.
- **Enrichment moved from a batch backfill to lazy, at-serve-time enrichment.** Per user request:
  `verb_lookup.lazy_enrich_word()`/`lazy_enrich_words()` now run right before a study/review queue
  is returned, enriching only words a real request is about to show instead of crawling the whole
  vocabulary table up front. Cheap paths (curated match, hint-confirmed non-verb) always run; the
  slow Wiktionary path is capped by a small per-request budget (default 3) so one request can't
  fan out into dozens of HTTP calls — anything skipped is simply retried the next time that word
  is served. The standalone `backfill_verb_forms.py` script still exists as an optional
  pre-warming tool (and was stopped mid-run once this landed, since it was no longer adding
  value beyond what lazy enrichment now covers organically) but is no longer load-bearing. New
  tests: `test_lazy_enrich_word_*`/`test_lazy_enrich_words_*` in `test_verb_lookup.py`. See
  `documentation/verb-principal-forms.md`.

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd backend && .venv/bin/alembic upgrade head
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test --reporter=list
```
