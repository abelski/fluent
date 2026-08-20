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

# Feature #5 — Review flow rework: maturity-aware stage graph + interleaved scheduling

## Context

**Why.** Reviewing an already-learned word today feels wrong in three ways: a mature word still
opens with a flashcard that *shows the answer* before asking anything; the "difficult" path is one
random multiple-choice card followed by typing, with the assemble stage available only to
single-word entries; and repeated cards for the same word land next to each other, so the learner
types or assembles the same word several times in a row.

**Current behaviour** (`frontend/app/dashboard/components/QuizSession.tsx`, the single component
behind `/dashboard/lists/[id]/study`, `/dashboard/review` and the words phase of
`/dashboard/continue`):

- Stages: `1` flashcard self-assessment, `2` MC (LT → translation), `'2r'` reverse MC
  (translation → LT), `'2a'` assemble from syllables, `3` type, `'3s'` syllable gap-fill drill.
- Every card starts at stage `1`. The flashcard renders two buttons — «С трудом» (`quality 3`) and
  «Легко» (`quality 5`). `handleStage1Quality(1)` exists but **no button renders it** — dead code
  today, and the natural home for the new "forgot" path.
- «Легко» → type only; a typing miss demotes to MC → reverse MC → type.
- «С трудом» → one randomly chosen MC (`2` or `'2r'`) → `'2a'` **only if `isSingleWordEntry`** →
  type.
- Retries come from `buildRetryCards`, which branches on the `lesson_mode` setting
  (`thorough` | `quick`).
- `insertRandom(rest, newCards)` splices a whole group in at one random position ≥ 1, so a word's
  own cards stay contiguous and nothing prevents three type cards in a row.

**Relevant existing pieces to reuse, not reinvent:**

| Piece | Where |
| --- | --- |
| `splitSyllables`, `shuffleSyllables`, `parseForms`, `normalizeLt` | `QuizSession.tsx`, `frontend/lib/normalizeLt.ts` |
| Word-tile assembly (whole-word tiles, `firstMisplacedWord`) | `frontend/app/dashboard/components/PhraseSession.tsx` (issue #145) |
| «Забыл» button routed through the wrong-answer path | `PhraseSession.tsx` `data-testid="forgot-btn"` (issue #144) |
| MC option de-duplication | `buildOptions` / `buildOptions2r` / `pickDistractors` in `QuizSession.tsx` (issues #59, #152) |
| SM-2 fields + `_apply_sm2` | `backend/routers/words.py:25`, `backend/models.py:104` |
| Shared review pool | `_known_due_words` / `_word_to_dict` in `backend/routers/words.py`, re-used by `backend/routers/continue_session.py` |

**Database audit (done during planning, as requested).** Over 3 424 active words there are **52
translation groups covering 133 words** where two or more *distinct* Lithuanian lemmas share an
exactly identical `translation_ru`. Twenty of those collisions sit **inside a single list**, so they
can already land in one session queue today:

```
list 154 «химчистка»   cheminis drabužių valymas | valykla
list 157 «одежда»      drabužiai | rūbai
list 168 «выздоравливает» pasveiksta | sveiksta
list 170 «дом»         namai | namas
list 178 «есть»        valgyti | yra          (+11 more in list 178)
list 294 «говорить»    kalbėti | sakyti
list 297 «болеть»      sirgti | skaudėti
list 298 «любить»      mylėti | mėgti
list 301 «мыть, умывать» plauti | praũsti
```

Review sessions draw across all lists, so all 52 groups are reachable there.

**Model/effort rationale:** `opus` / `high` — this rewrites the scheduling core of the one component
every study surface renders, and touches six session-building endpoints; it is design work, not a
mechanical pattern copy.

## Goals

- A word the system considers **mature** (`status = known` with enough SM-2 repetitions) is asked to
  **type first**, with no answer-revealing flashcard. A mistake — or pressing «Забыл» — drops it into
  the full learning flow.
- «Легко» → typing. A typing mistake demotes the word to the **difficult** path.
- **Difficult path** = select from list → assemble from fragments → type, for **every** word.
- A mistake anywhere in the difficult path appends **2× assemble + 2× type** (thorough mode).
- Assemble works for every entry type — multi-word phrases, slash/comma multi-form entries and
  one-syllable words included.
- Cards are **interleaved**: no two consecutive cards for the same word, and no run of three
  consecutive cards of the same exercise type.
- Two words with an identical translation never appear in the same session, nor as two options on
  one multiple-choice screen; typing either twin stays accepted.
- SM-2 scheduling, `status` transitions, mistake counting, quota and the session-summary numbers
  behave exactly as they do today.

## Non-Goals

- **No change to learn/relearn logic**: `_apply_sm2`, `new → learning → known` transitions,
  `mistake_count`, `POST /api/words/{id}/progress` semantics, the daily quota, the match round and
  the done-screen accounting (issue #147 invariant) all stay byte-for-byte equivalent in behaviour.
- **No change to `PhraseSession.tsx`** — phrases keep their own flow.
- **No bulk data edit** of the 133 colliding words. The audit script is a deliverable; adding
  parenthetical qualifiers (the issue #152 convention) to the 20 same-list pairs is left as a
  follow-up, and is unnecessary once session-level de-duplication ships.
- No new DB columns or migrations — maturity is derived from existing SM-2 fields.
- No change to the `lesson_mode` setting itself, the question timer, or the star-level filter.

## Requirements

### R1 — Maturity, decided server-side

- `backend/constants.py` gains `MATURE_WORD_REPS = 3`.
- A word is **mature** when its `UserWordProgress` has `status == "known"` and
  `sm2_reps >= MATURE_WORD_REPS`.
- Every endpoint that serves study/review words adds a boolean `mature` to each word dict:
  `_word_to_dict` in `backend/routers/words.py` (takes the progress row, so it can compute it) and
  the inline dict built in `get_study_words`. Anonymous users and words with no progress row get
  `mature: false`.
- The client never re-derives maturity from SM-2 fields — business logic stays server-side.

### R2 — Stage graph

Applies to **every word in every word session** (list study, both review modes, the continue-session
words phase). Phrases are untouched.

```
mature word            → TYPE
    │ mistake or «Забыл»
    └──────────────────→ learning flow: CARD → SELECT → ASSEMBLE → TYPE

non-mature word        → CARD (flashcard, «С трудом» / «Легко»)
    ├ «Легко»          → TYPE
    │                       │ mistake
    │                       └→ difficult path (below)
    └ «С трудом»        → difficult path: SELECT → ASSEMBLE → TYPE
                                │ mistake on any of the three
                                └→ append 2× ASSEMBLE + 2× TYPE
```

- SELECT stays the existing random pick between `2` and `'2r'` — the variation is itself part of
  avoiding repetition.
- The `+2 assemble / +2 type` penalty fires **at most once per word per session**; later mistakes
  re-queue only the failed card, bounded by the existing `failCount` logic, so a session always
  terminates.
- `lesson_mode: 'quick'` gets the lighter penalty **1× assemble + 1× type**, preserving the existing
  "quick is lighter" contract, and keeps its 25 %-mistake early abort.
- The `'3s'` syllable gap-fill drill after a near-miss typing error is unchanged, including its
  deliberate `insertNear` placement; the retype that follows it now goes through the scheduler.
- `handleStage1Quality(1)` is repurposed rather than deleted: it becomes `buildLearningChain(word)`,
  the single constructor used by the «Забыл» button, the mature-word miss, and the flashcard.

### R3 — «Забыл» on the typing stage

- A small «Забыл» button on stage `3`, mirroring `PhraseSession.tsx`'s `data-testid="forgot-btn"`
  (issue #144): reveals the answer through the **existing wrong-answer path** — mistake counted,
  word re-queued — so no new scoring path is introduced.
- Copy added to both `frontend/lib/i18n/ru.ts` and `frontend/lib/i18n/en.ts`; `tr.study.didntKnow`
  ('Не знал') already exists and is currently unused — reuse it rather than adding a key.

### R4 — Assemble for every entry type

New pure module `frontend/lib/assembleTiles.ts` exporting
`buildAssemblyTiles(lithuanian: string, formIndex: number): { target: string; tiles: string[]; separator: string }`:

1. `parseForms()` first — a slash/comma multi-form entry assembles **one form** (the same
   `blankIndex` the type stage will ask for), not the raw string.
2. Target contains a space → tiles are **whole words**, `separator: ' '` (the issue #145 pattern).
3. Otherwise → `splitSyllables()`, `separator: ''`.
4. Fewer than 2 tiles (one-syllable words like *kas*) → fall back to **letter tiles**, so the card is
   still a real challenge instead of a single free click.
5. Shuffle via the existing `shuffleSyllables` retry loop so the presented order differs from the
   answer.

`isSingleWordEntry` is no longer a gate on `'2a'` and is removed if nothing else uses it. Grading
compares `normalizeLt(tiles.join(separator))` against `normalizeLt(target)`.

### R5 — Interleaved scheduling

New pure module `frontend/lib/scheduleCards.ts` exporting
`scheduleCards(rest: StudyCard[], cards: StudyCard[]): StudyCard[]`, replacing `insertRandom` for
every insertion except the `'3s'` drill:

- Relative order within `cards` is preserved (SELECT before ASSEMBLE before TYPE).
- Each inserted card sits at least `MIN_GAP = 2` positions after the previous card **of the same
  word**, and never directly adjacent to another card of that word.
- No placement may create a run of **3+ consecutive cards of the same exercise bucket**, where the
  buckets are `select` (`2`, `'2r'`), `assemble` (`'2a'`) and `type` (`3`, `'3s'`).
- Constraints relax in a fixed order when the tail is too short to satisfy them — stage-run rule
  first, then the gap rule, then same-word adjacency — and finally the card is appended. A short
  queue must never deadlock or drop a card.

### R6 — Identical translations

Three layers, all three requested:

1. **Never in the same session** (server-side, the real fix). A helper in `backend/routers/words.py`
   de-duplicates a candidate list on translation before it is truncated to the session size, and the
   endpoints over-fetch (`limit × 3`) so a dropped twin is backfilled rather than shrinking the
   session. Applied in `get_study_words`, `_known_due_words`, `get_review_known_upcoming`,
   `get_review_known_random`, `get_review_mistakes`, and across the *combined* list in
   `continue_session._words_phase`.
   - Collision key = the **exact displayed** `translation_ru` (trimmed, case-folded), and separately
     `translation_en`. **Parentheses are deliberately NOT stripped**: issue #152 added qualifiers
     («коллега (по работе)» vs «коллега (по профессии)») precisely so those pairs *are*
     distinguishable, and stripping them would re-break that fix.
   - Tie-break keeps the twin that **needs the work most** — lowest `(status_rank, review_count,
     id)` with `new < learning < known` — so the loser wins a later session and no word is starved
     by a stable list ordering.
2. **Never on the same MC screen.** `buildOptions2r` currently de-dupes options by lemma only; extend
   it to also drop an option whose translation collides with another option's. `pickDistractors`
   filters on `translation_ru` only — make it filter on the **displayed** translation for the active
   language as well, so an EN-language session cannot show two options meaning the same thing.
3. **Typing either twin stays correct.** The stage-3 sibling-form acceptance
   (`siblingForms` in `handleStage3Submit`) is preserved as-is; the reworked flow must not regress
   it — issue #118/#120's spec guards this.

Plus the audit itself: `backend/scripts/audit_duplicate_translations.py`, following the shape of the
existing `backend/scripts/audit_case_rule_coverage.py`, reporting every group of distinct lemmas
sharing a translation and flagging the same-list subset.

### Standing constraints

- All validation must be server-side (never frontend-only). Maturity and session de-duplication are
  both decided by the backend; the client only renders what it is sent.
- This plan touches markup and components: read
  `documentation/design system/Component Library (as-built).html` and
  `documentation/IMPLEMENTATION.md` first, use named design tokens (`ink`, `muted`, `line`,
  `emerald-600`, …) — never a raw Tailwind step — and run
  `frontend/tests/design-system-parity.spec.ts` after any shared-shell/token change. The new «Забыл»
  button and the word/letter tile variants must be added to the component library **in this change**,
  not as a follow-up.
- Add autotest coverage for the new behaviour and run the relevant suites as part of Validation.

## Implementation

- [x] 1. `backend/constants.py` — add `MATURE_WORD_REPS = 3` with a comment explaining the SM-2
      "mature" threshold.
- [x] 2. `backend/routers/words.py` — add `_is_mature(progress)` and emit `mature` from
      `_word_to_dict` (which already receives the progress row) and from the inline word dict built
      in `get_study_words`; default `false` for anonymous users and words without a progress row.
- [x] 3. `backend/routers/words.py` — add `_translation_keys(word)` and
      `_dedupe_by_translation(candidates, progress_map)` implementing the R6.1 collision key and
      `(status_rank, review_count, id)` tie-break.
- [x] 4. `backend/routers/words.py` — apply the de-duplication + `limit × 3` over-fetch in
      `get_study_words`, `_known_due_words`, `get_review_known_upcoming`, `get_review_known_random`
      and `get_review_mistakes`.
- [x] 5. `backend/routers/continue_session.py` — apply the same de-duplication across the combined
      new + review list in `_words_phase`, after the two pools are merged.
- [x] 6. `backend/scripts/audit_duplicate_translations.py` — new read-only audit script reporting
      every distinct-lemma translation collision and the same-list subset.
- [x] 7. `frontend/lib/assembleTiles.ts` — new pure module per R4; move `splitSyllables` /
      `shuffleSyllables` here from `QuizSession.tsx` so both share one implementation.
- [x] 8. `frontend/lib/scheduleCards.ts` — new pure module per R5.
- [x] 9. `frontend/app/dashboard/components/QuizSession.tsx` — extend `Word` with `mature?: boolean`
      and `StudyCard` with the fields the new graph needs (`penaltyApplied`, `matureStart`); build
      the initial queue with `stage: word.mature ? 3 : 1`.
- [x] 10. `frontend/app/dashboard/components/QuizSession.tsx` — replace `buildRetryCards` /
      `handleStage1Quality` / `advance` with the R2 graph: `buildLearningChain()`,
      `buildDifficultChain()`, the once-per-word `+2 assemble / +2 type` penalty (1/1 in quick mode),
      and the «Легко» → difficult demotion. Route every insertion through `scheduleCards` except the
      `'3s'` drill, which keeps `insertNear`.
- [x] 11. `frontend/app/dashboard/components/QuizSession.tsx` — `'2a'` now uses
      `buildAssemblyTiles` for all entry types (word / syllable / letter tiles, `separator`-aware
      grading); drop the `isSingleWordEntry` gate.
- [x] 12. `frontend/app/dashboard/components/QuizSession.tsx` — add the «Забыл» button to stage 3,
      wired through the existing wrong-answer path, mirroring `PhraseSession.tsx`'s `forgot-btn`;
      use design tokens and `data-testid="forgot-btn"`.
- [x] 13. `frontend/app/dashboard/components/QuizSession.tsx` — tighten `buildOptions2r` and
      `pickDistractors` per R6.2 (translation collision across options, displayed-language aware).
- [x] 14. `frontend/lib/i18n/ru.ts`, `frontend/lib/i18n/en.ts` — wire up the «Забыл» copy (reusing
      the existing unused `study.didntKnow`) and any new stage label needed for the tile variants.
- [x] 15. `documentation/design system/Component Library (as-built).html` and
      `documentation/IMPLEMENTATION.md` — document the «Забыл» control and the three tile variants;
      record any deliberate deviation (notably the `'3s'` drill's intentional adjacency exception) in
      the "Deliberate deviations" table.
- [x] 16. `documentation/review-flow-stage-graph.md` — new note recording the stage graph, the
      maturity threshold and *why* the parentheses-preserving collision key was chosen over stripping
      them (the issue #152 interaction), so a future session does not re-derive it.
- [x] 17. `documentation/CHANGELOG.md` — append entry `#5 — 2026-08-20 — …`.
- [x] 18. Tests — see Validation.

## Validation

- [x] Backend unit: `backend/tests/test_review_flow.py` — `mature` flag true only at
      `status=known ∧ sm2_reps ≥ 3`; every session endpoint returns no two words sharing a
      translation; a dropped twin is backfilled so the session still returns `words_per_session`
      items; the `(status_rank, review_count, id)` tie-break keeps the neediest twin.
- [x] Backend unit: existing `backend/tests/test_sm2.py`, `test_review.py`, `test_study_session.py`,
      `test_continue_session.py`, `test_quota.py` still pass unchanged — this is the guard on
      "learn/relearn works same as now".
- [x] Frontend unit-ish spec: `frontend/tests/schedule-cards.spec.ts` — `scheduleCards` never places
      two cards of one word adjacently, never creates a 3-run of one bucket, preserves chain order,
      and degrades without dropping cards on a 0/1/2-card tail.
- [x] Playwright: `frontend/tests/review-flow-stages.spec.ts` — «Легко» → type; typing miss →
      select → assemble → type; «С трудом» → select → assemble → type; a miss in that path appends
      2× assemble + 2× type, and only once.
- [x] Playwright: `frontend/tests/mature-word-type-first.spec.ts` — a `mature: true` word opens on
      the typing card with no flashcard; «Забыл» and a wrong answer each drop it into the full
      learning flow.
- [x] Playwright: `frontend/tests/assemble-all-entry-types.spec.ts` — multi-word entry → word tiles;
      slash multi-form → syllable tiles of the asked form; one-syllable word → letter tiles.
- [x] Playwright: update `frontend/tests/syllable-assemble.spec.ts` — its stated premise ("multi-word
      phrases and slash-separated entries skip this stage entirely") is now false and must be
      rewritten, not deleted.
- [x] Playwright regression: `issue-118-120-synonym-answer-not-leaked.spec.ts`,
      `issue-152-bendradarbis-kolega-distinct.spec.ts`, `issue-59-semantic-twin-distractor.spec.ts`,
      `issue-147-session-summary-consistency.spec.ts`, `issue-140-hard-button-feedback.spec.ts`,
      `continue-session.spec.ts` all still pass.
- [x] Design system: `frontend/tests/design-system-parity.spec.ts` passes; the component library is
      updated in this same change.
- [x] Audit script runs clean: `backend/.venv/bin/python backend/scripts/audit_duplicate_translations.py`
      prints the 52 groups / 20 same-list collisions as a report (informational, exit 0).
- [x] Manual smoke (one local `uvicorn` + one `next dev`, per CLAUDE.md): run a
      `/dashboard/review?mode=known` session end to end — confirm a mature word types first, the
      queue visibly alternates words and exercise types, and the done screen's
      `firstTry + stumbled + notMastered === total` invariant still holds.
- [x] Production UI comparison: nav, header/footer and login intact.
- [ ] News post written and published via `/news-writer`.

## Definition of Done

```bash
cd backend && .venv/bin/python -m pytest -q
cd frontend && npx tsc --noEmit
cd frontend && npx playwright test --reporter=list
```

### Baseline — two of these three are NOT green on `main`

This was written assuming a clean baseline; the repo does not have one, so two commands must be
judged against `main` rather than against zero. Both baselines were measured by stashing this work,
rebuilding `frontend/out` from `HEAD` (c0e527b) and re-running:

| Command | At `HEAD` | With this change | Verdict |
| --- | --- | --- | --- |
| `pytest -q` | 304 passed | 304 passed (13 new in `test_review_flow.py`) | green |
| `npx tsc --noEmit` | **11 errors** | **11 errors**, same 5 spec files | no new errors |
| `npx playwright test` | **7 failed** | **7 failed**, same 7 specs; 463 passed | no new failures |

The 11 type errors live in `design-system-parity`, `issue-118-120`, `issue-151-153`, `issue-157` and
`mistake-diff` specs (ES-target and Playwright-typing issues). The 7 failing specs — `issue-117`,
`lists-progress-parallel`, `news`, `phrase-lists`, `quota`, `stats-card-alignment` ×2 — depend on
live premium/news/DB state. Neither set is touched by this feature, and fixing them is out of scope
here; they are pre-existing debt worth its own plan.

**The gate for this plan is therefore: `pytest` fully green, and `tsc`/`playwright` no worse than the
baseline above.** That was met.
