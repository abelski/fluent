# Plan: Assemble-word-from-syllables exercise (vocabulary/words flow)

## Context

We just shipped a word-tile phrase-assembly exercise for the "Фразы" flow. The user now wants an analogous exercise for the "Слова" (vocabulary) flow: assemble a single Lithuanian word from its shuffled syllables, reusing the syllable-splitting logic that already exists in `QuizSession.tsx` (currently only used for the post-mistake single-syllable gap-fill, stage `'3s'`).

Confirmed decisions (from clarifying questions):
- **Placement**: a new stage inserted between stage 2/2r (MCQ / reverse-MCQ) and stage 3 (type the word) — every eligible word goes through "assemble from syllables" before being asked to type it from memory.
- **Scope**: single-word entries only. `Word.lithuanian` is a single word ~88% of the time; ~12% are multi-word phrases (star=3) and some are slash-separated gender-form pairs (e.g. `airis / airė`). Both are skipped — they fall straight through to stage 3 exactly as today.
- **Where computed**: entirely client-side in `QuizSession.tsx`. It already receives the word text and already has `splitSyllables`/`LT_DIPHTHONGS` locally (used today for stage `'3s'`). Words have no persisted stage server-side at all (`UserWordProgress` only tracks `status`/SM-2 fields, not a stage/step) — unlike phrases, **zero backend changes are needed**.

This is architecturally simpler than the phrase feature: no new DB fields, no new API payload fields, no new endpoints. It's a self-contained addition to `QuizSession.tsx`'s existing card-queue model, where each "stage" is a separate `StudyCard` queue entry (not sub-steps within one render, as phrases had) — so the new stage is a new `StudyCard.stage` variant plus a new render branch and a couple of queue-transition edits.

## Key existing code to reuse

- `splitSyllables()`, `LT_DIPHTHONGS`, `findMistakeSyllable()` — `frontend/app/dashboard/components/QuizSession.tsx:156-198` (already there, used by stage `'3s'`).
- `parseForms()` — `QuizSession.tsx:94-97` — splits on `,`/`/`; reused to detect multi-form (ineligible) entries.
- `trans()` — `QuizSession.tsx:99-101` — picks the user's-language translation, used as the stage prompt (same as stage `2r`).
- The card-queue model: `StudyCard` (`QuizSession.tsx:26-33`), `advance()` (`463-473`), `buildRetryCards()` (`400-461`), `insertRandom()`/`insertNear()` (`141-152`).
- Stage `'2r'` render block (`920-961`) is the visual/structural template for the new stage's prompt + wrong-answer footer; the tile-click assembly *interaction* (click pool tile → append to assembled row, click assembled tile → remove, auto-check when all tiles used, index-based state so duplicate syllables work) mirrors `frontend/app/dashboard/components/PhraseSession.tsx:830-925`, restyled to this file's chunkier `border-gray-900` aesthetic instead of copying phrase's softer emerald-border look.

## Implementation

- [x] 1. `QuizSession.tsx:28` — extend `StudyCard['stage']` union to `1 | 2 | '2r' | '2a' | 3 | '3s'`. `'2a'` = "stage 2, assemble" (distinct from `'2r'` reverse-MCQ and `'3s'` mistake-syllable-fix, to avoid name confusion).
- [x] 2. `QuizSession.tsx` (near `parseForms`, ~line 97) — add `isSingleWordEntry(word: Word): boolean` = `parseForms(word.lithuanian).length === 1 && !word.lithuanian.includes(' ')`. Excludes both multi-word phrases and slash/comma multi-form entries.
- [x] 3. `QuizSession.tsx` (near `splitSyllables`, ~line 184) — add a small bounded-reshuffle helper for syllable tiles (mirrors the backend's now-any-length `_word_tiles` shuffle-with-retry pattern): shuffle the syllable array, reshuffle up to 10x if it matches the original order (no-op for 1-syllable words, which is fine — same "trivial for short input" behavior already accepted for phrase tiles).
- [x] 4. New state: `assembledSyllables: number[]` (selected tile indices, in order) and `syllableTiles: string[]` (current card's shuffled syllables). Reset alongside the existing per-card reset effect at `QuizSession.tsx:307-325`: when the front card's stage is `'2a'`, shuffle `splitSyllables(word.lithuanian)` into `syllableTiles` and clear `assembledSyllables`.
- [x] 5. `advance()` (`QuizSession.tsx:463-473`) — on a correct stage `2`/`2r` answer, insert `'2a'` (if `isSingleWordEntry`) instead of `3`; add a new branch so a correct `'2a'` answer inserts stage `3`. Concretely:
  ```ts
  if (correct && (card.stage === 2 || card.stage === '2r')) {
    const next: StudyCard = isSingleWordEntry(card.word)
      ? { word: card.word, stage: '2a', failCount: 0 }
      : { word: card.word, stage: 3, failCount: 0 };
    return insertRandom(rest, [next]);
  }
  if (correct && card.stage === '2a') {
    return insertRandom(rest, [{ word: card.word, stage: 3, failCount: 0 }]);
  }
  ```
- [x] 6. `buildRetryCards()` (`QuizSession.tsx:400-461`) — add a `'2a'` case: one bounded retry regardless of lesson mode, then unconditionally fall through to stage 3 (never drops the word):
  ```ts
  if (card.stage === '2a') {
    if (card.failCount === 0) return [{ word: card.word, stage: '2a', failCount: 1 }];
    return [{ word: card.word, stage: 3, failCount: 0 }];
  }
  ```
  (Deliberately simpler than 2/2r's thorough-mode retry loop — a single bounded retry, not threaded through `lessonMode`, to keep the new exercise self-contained.)
- [x] 7. New handlers, modeled on `handleStage2rSelect`/`handleStage2rDismiss` (`QuizSession.tsx:546-585`):
  - `handleStage2aTileClick(tileIdx)` — append to `assembledSyllables`; when its length equals `syllableTiles.length`, join with `''` (no spaces — syllables concatenate directly) and compare via `normalizeLt(...) === normalizeLt(word.lithuanian.trim())`. Correct → mark known (`saveProgress(..., 'known', false)` if no prior mistake), `setTimeout` 1200ms → reset state → `advance(card, true)`. Wrong → mark mistake once (`mistakeWordIdsRef`/`setMistakeWordCount`/`saveProgress(..., 'learning', true)`), `setAnswerState('wrong')`, wait for dismiss.
  - `handleStage2aDismiss()` — mirrors `handleStage2rDismiss`: compute `buildRetryCards(card)`, mark `wordsDone` if no retries, reset answer state, `advance(card, false, retryCards)`, quick-mode early-exit check.
- [x] 8. Keyboard dismiss handler (`QuizSession.tsx:349-364`) — add `else if (queue[0].stage === '2a') handleStage2aDismiss();`.
- [x] 9. Header stage-label mapping (`QuizSession.tsx:808`) — extend the ternary to also map `'2a'` to index 3 (`tr.study.stages[3]`, "Пишу"), same treatment as `'2r'`/`'3s'` today.
- [x] 10. New render block for `stage === '2a'`, inserted between the `'2r'` block and the stage-3 block (~line 962): prompt = `tr.study.assembleWord` label + `trans(word, lang)` (same prompt style as stage `2r`, including the `digit`/`hint` display), then an assembled-row + tile-pool UI (index-based, click-to-append/remove, restyled to this file's button aesthetic), then the same correct/wrong feedback footer pattern as `2r` (`tr.common.correct` / `tr.common.notQuite` + dismiss button calling `handleStage2aDismiss`).
- [x] 11. `frontend/lib/i18n/types.ts` + `ru.ts` + `en.ts` — add `study.assembleWord`: RU «Соберите слово из слогов» / EN "Assemble the word from syllables".
- [x] 12. Timer effects (`QuizSession.tsx:371-397`) — no code change needed: the timer-start effect already applies to any stage `!== 1`, and the timeout-wrong effect already works generically (sets `answerState`/mistake tracking; its `shownAnswer` computation via `parseForms` is already unused by stage `2`/`2r`'s own rendering, so it stays equally harmless-if-unused for `'2a'`).
- [x] 13. `frontend/tests/syllable-assemble.spec.ts` (new, no issue number — this is a fresh feature, following the naming style of `match-round.spec.ts`/`star-complexity.spec.ts`) — mock `**/api/lists/*/study**` (pattern from `match-round.spec.ts`), `**/api/me/settings`, `**/api/words/*/progress`. Cover:
  - Single-word entry: after answering stage 2 or 2r correctly, the `'2a'` assemble screen appears (not stage 3 directly); tiles are exactly the word's syllables.
  - Assembling correctly advances to stage 3 (typing).
  - Assembling wrong shows the dismiss footer, counts a mistake, and retries `'2a'` once before falling through to stage 3.
  - Multi-word entry (e.g. `oro uostas`) and a slash-form entry (e.g. `airis / airė`) both skip `'2a'` entirely — stage 2/2r success goes straight to stage 3, as today.
  - Clicking an assembled syllable returns it to the pool (parity with the phrase-assembly test).
- [x] Fixed a regression this surfaced: `frontend/tests/issue-147-session-summary-consistency.spec.ts`'s generic stage-driving loop didn't recognize the new `'2a'` screen and misidentified its syllable tiles as MCQ options, getting stuck. Added a `splitSyllables` helper (duplicated from `QuizSession.tsx`, same precedent as other spec files) and a detection branch that assembles the word correctly before the generic MCQ block runs.

## Validation

- [x] Frontend: `cd frontend && npx tsc --noEmit` — no new type errors (beyond pre-existing unrelated ones in `tests/mistake-diff.spec.ts` / `tests/issue-118-120-...spec.ts`)
- [x] `cd frontend && npm run build`
- [x] Restart local server (`DEV=false`, backend serves the fresh static export), verify nav/header/footer intact
- [x] Playwright: `npx playwright test tests/syllable-assemble.spec.ts` — 6/6 new tests pass
- [x] Playwright full suite: `npx playwright test` — 352 passed, same 5 pre-existing unrelated failures as before (`lists-progress-parallel`, `phrase-lists` EN-translatable, `quota` premium-badge, `stats-card-alignment` ×2), nothing new (after fixing the issue-147 regression above)
- [x] Backend suite unaffected: `pytest tests/ -q` — 140 passed (no backend changes made)
- [x] Manual smoke (disposable throwaway account on a real word list, cleaned up after): studied list 159 ("Gaminimas"), routed through stage 1 → stage 2r (reverse MCQ) → the syllable-assemble screen appeared for "kepti" (жарить, печь) with tiles "kep"/"ti", correctly styled, assembling it correctly advanced onward as expected. Confirmed live against real production word data, not just mocked test payloads.
- [x] News post written and published via /news-writer
