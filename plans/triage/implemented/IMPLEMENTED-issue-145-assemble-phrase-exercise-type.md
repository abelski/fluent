# Issue #145 — /dashboard/phrases/lists/2/study

**Reported:** 2026-07-17 10:13:40
**Status:** open
**Description:** фразы длиной более 3 слов лучше тренировать по частям и нужно сделать дополнительный тип упражнений - собери фразу из слов внизу, слова в рандомном порядке и мы их кликаем чтобы они сложились в фразу (for phrases >3 words, add an "assemble the phrase" exercise: shuffled word tiles at the bottom, clicked in order to build the phrase)

## Root cause
Feature request, not a bug. The study session renders the shared `PhraseSession` component with a 3-stage flow driven by `lesson_stage` in `user_custom_phrase_progress`:
- Stage 0 — intro card (phrase + translation, "Got it"/"Hard")
- Stage 1 — fill-word: MCQ (4 options from server-sent `mcq_distractors`) → type the word
- Stage 2 — type the full phrase from translation only

The jump from stage 1 (one word) to stage 2 (type the entire phrase) is steep for phrases longer than 3 words — that is the reported pain. No tile-assembly mechanic exists anywhere in the app today (`MatchRound` is pairs-matching; the stage-1 MCQ gives reusable button-grid styling).

Architecture: exercise content is generated server-side — `GET /api/me/phrase-lists/{list_id}/study` in `backend/routers/phrase_lists.py` (~lines 403–487) builds `lesson_stage`, `blank_word`, `mcq_distractors` (reusing `_pick_blank_word` from `backend/routers/phrases.py`); the same payload shape is built in `phrases.py` for program study (~line 579) and review (~line 696), all consumed via `PhraseStudyItem` in `frontend/lib/api.ts` (~line 499). Stage advancement + SM-2 is enforced server-side by `POST /api/me/phrase-lists/phrases/{phrase_id}/progress` (`update_my_phrase_progress`, advances only when `quality >= 3 and stage_completed == progress.lesson_stage`).

**Design:** make "assemble" a sub-step at the start of stage 2 for phrases with >3 words, mirroring how stage 1 runs MCQ → type. No DB migration, no change to `lesson_stage`/`stage_completed` (still 0/1/2). Server sends a pre-shuffled `word_tiles` array (null for ≤3-word phrases); frontend shows tile assembly first, then existing typed recall. `full_retake` mode skips assembly (as `gap_retry` skips MCQ).

## Fix plan
1. **Backend — tile generation helper** in `backend/routers/phrases.py`, next to `_pick_blank_word`: `_word_tiles(phrase_text: str) -> Optional[list[str]]` — split on whitespace (punctuation stays attached so joining reproduces the phrase), return `None` if ≤3 words, else a `random.shuffle`d copy, re-shuffling if the order equals the original (max 10 attempts to guard duplicate-word phrases).
2. **Backend — add `word_tiles` to all three study payload builders**: `get_my_phrase_list_study` in `backend/routers/phrase_lists.py` (result dict ~lines 475–485; import `_word_tiles` alongside `_pick_blank_word`), plus `get_phrase_study_session` (~lines 678–693) and `get_phrase_review_session` (~lines 781–795) in `backend/routers/phrases.py`.
3. **Frontend — API type**: add `word_tiles: string[] | null;` to `PhraseStudyItem` in `frontend/lib/api.ts`.
4. **Frontend — assembly sub-step in `PhraseSession`** (`frontend/app/dashboard/components/PhraseSession.tsx`):
   - `type Stage2Step = 'assemble' | 'type'` mirroring `Stage1Step` (~line 153); initialize per card in the index-change reset effect (~lines 267–277): `'assemble'` when `word_tiles` is non-null and `mode !== 'full_retake'`, else `'type'`.
   - Assembly UI in the stage-2 branch (before the current textarea block, ~lines 916–1013): prompt = translation (`getTranslation`); tile buttons rendered from `word_tiles` (indexed, so duplicate words work); clicking a tile appends it to the assembled line and disables it; clicking an assembled word returns it to the pool. Reuse stage-1 MCQ button styling (~lines 786–806).
   - Check on completion: compare joined assembled words to `phrase.text` (and `alt_texts`) with normalized equality (order-exact, punctuation/diacritic-normalized, `checkPhrase`-style).
   - Correct → brief green feedback, then `setStage2Step('type')` (700 ms pattern as MCQ-correct). Wrong → highlight correct order, count the mistake (`mistakePhraseIdsRef`), `advanceQueue(1, firstMisplacedWord)` so re-queue + server-side `mistake_words_json` machinery kicks in (identical to MCQ-wrong, ~lines 808–823). Wire timer/Enter-key effects like `stage1Step` (effects at ~lines 249–256, 292–312, 315–371).
   - No changes to `advanceQueue`/`recordProgress`: assembly is part of stage 2, so `stage_completed: 2` and server-side advancement rules work unchanged.
5. **Frontend — i18n**: add `phraseSession` keys (e.g. `assembleLabel` "Соберите фразу из слов" / "Assemble the phrase from the words") in `frontend/lib/i18n/ru.ts`, `en.ts`, `types.ts`.
6. **Backend tests** in `backend/tests/test_phrase_lists.py`: study endpoint returns shuffled non-null `word_tiles` for a >3-word phrase (same multiset, order ≠ original) and `null` for ≤3 words.
7. **Optional refinement**: server can send `word_tiles: null` once `sm2_reps >= 2` so well-known phrases skip straight to typed recall — selection rule stays server-side, no frontend change.

## Tests
1. Write a Playwright test in `frontend/tests/` that reproduces and verifies the fix for this issue (`frontend/tests/issue-145-assemble-phrase.spec.ts`): drive a long phrase to stage 2, click tiles in order, verify advance to the typing step; verify a ≤3-word phrase goes straight to typing.
2. Rebuild the frontend and restart the local server.
3. Run the new Playwright test and confirm it passes.
4. Leave the local server running so the user can manually verify the fix in the browser.

## Confirm resolution
Ask the user: "Issue #145 — фразы длиной более 3 слов лучше тренировать по частям + новый тип упражнения «собери фразу». Mark as resolved?"
Only if the user confirms:
1. Run `UPDATE mistake_report SET status = 'resolved' WHERE id = 145;` and report success.
2. Move the plan file to `plans/triage/implemented/` and add the `IMPLEMENTED-` prefix (`issue-145-assemble-phrase-exercise-type.md` → `plans/triage/implemented/IMPLEMENTED-issue-145-assemble-phrase-exercise-type.md`).
