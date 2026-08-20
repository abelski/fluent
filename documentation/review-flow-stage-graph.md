# Word session stage graph (feature #5)

Why the words study/review flow looks the way it does, so a future session does not re-derive it
from the diff. Applies to every word session — `/dashboard/lists/[id]/study`, both
`/dashboard/review` modes and the words phase of `/dashboard/continue` — all of which render the
single component `frontend/app/dashboard/components/QuizSession.tsx`. Phrases
(`PhraseSession.tsx`) are a separate flow and were deliberately left alone.

## The graph

```
mature word            → TYPE
    │ mistake or «Забыл»
    └──────────────────→ learning chain: CARD → SELECT → ASSEMBLE → TYPE

non-mature word        → CARD (flashcard, «С трудом» / «Легко»)
    ├ «Легко»          → TYPE
    │                       │ mistake
    │                       └→ difficult chain (below)
    └ «С трудом»        → difficult chain: SELECT → ASSEMBLE → TYPE
                                │ mistake on any of them
                                └→ append 2× ASSEMBLE + 2× TYPE (1× + 1× in quick mode)
```

- **SELECT** is a coin flip between stage `2` (LT → translation) and `'2r'` (translation → LT). The
  variation is itself part of not repeating the same exercise, so it was kept random rather than
  fixed.
- **Chains are queued whole**, then interleaved by `scheduleCards`. This is why a correct answer only
  retires the current card instead of appending the next stage — the next stage is already in the
  queue, further down. Getting this backwards would double every word's assemble/type cards.
- The **+2 assemble / +2 type penalty fires at most once per word per session**
  (`penaltyWordIdsRef`, plus `penaltyApplied` carried on the cards it creates). Later mistakes
  re-queue only the failed card, once, bounded by `failCount` — that bound is what guarantees a
  session terminates.
- The `'3s'` near-miss syllable drill is unchanged and is **the one insertion that does not go
  through `scheduleCards`**: it is placed at most 2 cards from the front
  (`insertDrillThenSchedule`), because a drill on the syllable you just got wrong is only useful
  while the mistake is fresh. The retype that follows it *is* scheduled.

## Maturity — why the threshold is 3, and why it is server-side

`MATURE_WORD_REPS = 3` in `backend/constants.py`. A word is mature when its `UserWordProgress` has
`status == "known"` **and** `sm2_reps >= 3`. Three is where SM-2's own interval curve leaves the
fixed 1-day / 6-day ramp and starts multiplying by the ease factor (`_apply_sm2` in
`backend/routers/words.py`) — i.e. the first point at which the algorithm itself treats the word as
retained rather than still being introduced. No new column: it is derived from fields that already
exist.

The flag is computed **server-side** (`_is_mature`, emitted as `mature` by `_word_to_dict` and by
`get_study_words`) and merely rendered by the client. Same rule as everywhere else in this codebase:
business logic lives in the backend so a future mobile client gets the same behaviour for free. The
frontend must never re-derive maturity from SM-2 fields.

## Identical translations: why parentheses are NOT stripped

Two distinct Lithuanian lemmas sharing one translation (`kalbėti` / `sakyti` → «говорить») are
indistinguishable the moment the session asks the learner to *produce* the Lithuanian. Three layers
handle it:

1. **Never in the same session** — `_dedupe_by_translation` in `backend/routers/words.py`, applied
   in `get_study_words`, `_known_due_words`, `/review/known/upcoming`, `/review/known/random`,
   `/review/mistakes` and across the merged list in `continue_session._words_phase`. Endpoints
   over-fetch by `SESSION_OVERFETCH = 3` and de-duplicate *before* truncating, so a dropped twin is
   backfilled instead of shrinking the session.
2. **Never on the same MC screen** — `pickDistractors` filters on the displayed translation for the
   active language as well as on `translation_ru`; `buildOptions2r` drops an option whose meaning
   collides with another option's.
3. **Typing either twin stays accepted** — the `siblingForms` acceptance in `handleStage3Submit`
   (issues #118 / #120) is untouched.

**The collision key is the exact displayed translation, whitespace-collapsed and case-folded, with
`translation_ru` and `translation_en` as separate keys. Parentheses are deliberately preserved.**
Stripping them looks tempting — it would catch «коллега» vs «коллега (по работе)» — but it would
re-break issue #152, which *added* those qualifiers precisely so «коллега (по работе)» and «коллега
(по профессии)» are distinguishable prompts. A qualifier is content, not noise: if two entries carry
different qualifiers they are answerable, and de-duplicating them would silently delete a word from
the learner's session for no reason.

Of a colliding group the twin that **needs the work most** is kept — lowest
`(status_rank, review_count, id)` with `new < learning < known`. This matters because list ordering
is stable: a fixed "keep the first" rule would starve the same word forever, whereas ranking by
review count means the winner's count grows until the loser wins a later session.

`backend/scripts/audit_duplicate_translations.py` reports the remaining content debt (52 ru groups
over 133 words, 20 of them inside a single list, as of 2026-08-20). Fixing the data with issue
#152-style qualifiers is a follow-up; it is not required for correctness now that sessions
de-duplicate.

## Assembly tiles for every entry type

`frontend/lib/assembleTiles.ts`. `isSingleWordEntry` used to gate the assemble stage, which quietly
skipped every phrase, every slash/comma multi-form entry and every one-syllable word — exactly the
entries that most need the practice. `buildAssemblyTiles(lithuanian, formIndex)` now picks the
fragment size: whole words when the target contains a space (the issue #145 phrase pattern),
syllables otherwise, and letters when a word has fewer than two syllables so `kas` is still a real
challenge and not one free click. A multi-form entry assembles exactly the form the following type
card will ask for (`formIndexRef` in `QuizSession.tsx`).

## Interleaving

`frontend/lib/scheduleCards.ts`. `insertRandom` spliced a whole group in at one position, so a
word's own cards stayed contiguous. `scheduleCards` places each card separately: same-word cards
keep `MIN_GAP = 2` other cards between them, no placement creates a run of 3+ cards from one
exercise bucket (`card` / `select` / `assemble` / `type`), and the group's own order is preserved.

`MIN_GAP` counts *cards in between*, not index distance — that is what makes the weaker "never
directly adjacent" rule a meaningful separate relaxation step. When the tail is too short the rules
relax in a fixed order (stage-run → gap → adjacency) and, as a last resort, the card is appended. A
short queue must never deadlock or drop a card, which is why the fallback exists at all: a
single-word session simply gets its chain in order.

### Two properties worth knowing before "fixing" the scheduler

**Placement re-rolls the whole group.** Placement is greedy per card, so one unlucky early slot can
force every later card of a chain onto the relaxed rules even when the queue had room for a clean
layout. Two things guard against that: `findPosition` reserves room for the cards still to be
placed (`maxPos`), and `scheduleCards` re-rolls the whole group up to `PLACEMENT_ATTEMPTS` times and
keeps the lowest-violation result. Without the reservation, the *last* card of a chain was the one
that ended up violating the gap rule — the first card had wandered too far right.

**The end of a session is typing-heavy, structurally.** Every chain terminates in a TYPE card, and a
TYPE card can only be placed after its own ASSEMBLE card, so the last cards of a queue converge on
the type bucket and the stage-run rule is relaxed there. This is *not* a bug and cannot be scheduled
away: it is several different words being typed in a row, not one word drilled repeatedly. The
guarantee that does hold everywhere is that two cards of the **same word** are never adjacent.
`frontend/tests/schedule-cards.spec.ts` therefore asserts `interiorBucketRuns === 0`, not
`bucketRuns === 0` — if you tighten that assertion it will fail, and the fix is not in the module.
